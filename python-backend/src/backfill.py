"""
Historical Data Backfill.

Uses Open-Meteo's free, keyless Air Quality + Historical Weather Archive APIs
to reconstruct a rich hourly training dataset:
  - Air Quality API gives a real US AQI directly (no PM2.5->AQI approximation
    needed) plus PM2.5/PM10/CO/NO2/SO2/O3, available since ~2022-07-29.
  - Historical Weather Archive gives real temp/humidity/pressure/wind/clouds
    going back decades (solving the earlier gap where OpenWeather's free tier
    had no bulk historical weather).
Then applies the same feature engineering used by the live hourly pipeline so
training/serving features stay consistent.

Usage:
    python -m src.backfill --days 730
"""
import argparse
import logging
import time
from datetime import datetime, timedelta, timezone

import pandas as pd

import config
from src import api_client
from src.feature_engineering import full_feature_pipeline
from src.feature_store import get_feature_store
from src.run_logger import log_run_start, log_run_end

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill")


def fetch_historical_range(days: int) -> pd.DataFrame:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)

    all_pollution, all_weather = [], []
    # chunk by 90 days per request to keep each response a reasonable size
    chunk_days = 14
    cursor = start

while cursor < end:
    chunk_end = min(cursor + timedelta(days=chunk_days), end)

    start_str = cursor.strftime("%Y-%m-%d")
    end_str = chunk_end.strftime("%Y-%m-%d")

    logger.info(
        "Fetching Open-Meteo air quality + weather %s -> %s",
        start_str,
        end_str,
    )

    try:
        pollution = api_client.get_open_meteo_air_quality_history(
            config.LATITUDE,
            config.LONGITUDE,
            start_str,
            end_str,
        )

        weather = api_client.get_open_meteo_weather_history(
            config.LATITUDE,
            config.LONGITUDE,
            start_str,
            end_str,
        )

        all_pollution.extend(pollution)
        all_weather.extend(weather)

    except Exception as e:
        logger.warning(
            "Skipping chunk %s -> %s because of %s",
            start_str,
            end_str,
            e,
        )

    cursor = chunk_end
    time.sleep(1)

    df_pollution = pd.DataFrame(all_pollution)
    df_weather = pd.DataFrame(all_weather)
    if df_pollution.empty:
        raise RuntimeError(
            "No historical air quality data returned from Open-Meteo - check "
            "coordinates, or note Open-Meteo's air quality archive only goes "
            "back to ~2022-07-29."
        )

    df_pollution["datetime"] = pd.to_datetime(df_pollution["datetime"], utc=True)
    df_weather["datetime"] = pd.to_datetime(df_weather["datetime"], utc=True)

    df = pd.merge(df_pollution, df_weather, on="datetime", how="left")
    df["city"] = config.CITY_NAME
    df = df.dropna(subset=["aqi"])
    df = df.drop_duplicates(subset=["datetime"]).sort_values("datetime").reset_index(drop=True)
    return df


def run(days: int = 730, triggered_by: str = "manual"):
    logger.info("=== Backfilling %d days of historical AQI data for %s ===", days, config.CITY_NAME)
    run_record = log_run_start(
        name=f"Historical Data Backfill ({config.CITY_NAME.title()}, {days}d)",
        run_type="backfill",
        triggered_by=triggered_by,
    )
    try:
        raw = fetch_historical_range(days)

        featurized = full_feature_pipeline(raw, target_col="aqi")
        featurized = featurized.dropna(subset=[c for c in featurized.columns if "lag" in c])

        store = get_feature_store()
        store.insert(featurized)
        logger.info("Backfill complete: %d feature rows written.", len(featurized))
        log_run_end(run_record, status="success", records_processed=len(featurized),
                    extra_logs=[f"Fetched {len(raw)} raw hourly records from Open-Meteo (air quality + weather)",
                                f"Wrote {len(featurized)} feature rows to feature store"])
        return featurized
    except Exception as e:  # noqa: BLE001
        log_run_end(run_record, status="failed", extra_logs=[f"Error: {e}"])
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=730, help="How many past days to backfill (default: 730 = 2 years)")
    args = parser.parse_args()
    run(days=args.days)
