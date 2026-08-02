"""
Feature Pipeline (runs every hour via GitHub Actions / Airflow).

1. Fetch current AQI + pollutants from AQICN (ground-truth AQI reading)
2. Fetch current weather from OpenWeather (drivers of AQI)
3. Merge into a single row, compute time + derived features using recent
   history pulled from the feature store (for lags/rolling stats)
4. Insert the new row into the Feature Store
"""
import logging
import pandas as pd
from datetime import datetime, timezone

import config
from src import api_client
from src.feature_engineering import full_feature_pipeline
from src.feature_store import get_feature_store
from src.run_logger import log_run_start, log_run_end

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("feature_pipeline")


def fetch_current_raw_row() -> dict:
    aqicn = api_client.get_aqicn_current()
    weather = api_client.get_owm_current_weather()

    row = {
        "datetime": datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0),
        "aqi": aqicn["aqi"],
        "pm25": aqicn["pm25"],
        "pm10": aqicn["pm10"],
        "o3": aqicn["o3"],
        "no2": aqicn["no2"],
        "so2": aqicn["so2"],
        "co": aqicn["co"],
        "temp": weather["temp"],
        "humidity": weather["humidity"],
        "pressure": weather["pressure"],
        "wind_speed": weather["wind_speed"],
        "clouds": weather["clouds"],
        "city": config.CITY_NAME,
    }
    return row


def run(triggered_by: str = "scheduler"):
    logger.info("=== Running hourly feature pipeline for %s ===", config.CITY_NAME)
    run_record = log_run_start(
        name="Hourly Weather & Pollutant Ingestion",
        run_type="feature_ingestion",
        triggered_by=triggered_by,
    )
    try:
        store = get_feature_store()

        history = store.read()
        new_row = fetch_current_raw_row()
        new_df = pd.DataFrame([new_row])

        if not history.empty:
            combined = pd.concat([history, new_df], ignore_index=True)
            combined = combined.drop_duplicates(subset=["datetime"], keep="last")
        else:
            combined = new_df

        featurized = full_feature_pipeline(combined, target_col="aqi")
        # only the freshest row needs to be (re)inserted with completed lag/rolling features
        latest_row = featurized.tail(1)

        store.insert(latest_row)
        logger.info("Feature pipeline run complete. Latest AQI=%s at %s",
                    new_row["aqi"], new_row["datetime"])
        log_run_end(run_record, status="success", records_processed=1,
                    extra_logs=[f"Fetched live reading: AQI={new_row['aqi']} at {new_row['datetime']}"])
        return latest_row
    except Exception as e:  # noqa: BLE001
        log_run_end(run_record, status="failed", extra_logs=[f"Error: {e}"])
        raise


if __name__ == "__main__":
    run()
