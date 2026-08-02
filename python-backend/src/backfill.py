"""
Historical Data Backfill.

Uses OpenWeather's Air Pollution *History* endpoint (real data, available from
27 Nov 2020 onward) to reconstruct a rich hourly training dataset, then converts
OWM's raw pollutant concentrations into a US-EPA-style AQI (0-500) using
`owm_aqi_index_to_us_aqi`, and finally applies the same feature engineering
used by the live hourly pipeline so training/serving features stay consistent.

Usage:
    python -m src.backfill --days 90
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

    all_rows = []
    # OWM allows arbitrarily long ranges in one call, but we chunk by 7 days
    # to stay well within response size / rate limits.
    chunk_days = 7
    cursor = start
    while cursor < end:
        chunk_end = min(cursor + timedelta(days=chunk_days), end)
        logger.info("Fetching historical pollution %s -> %s", cursor, chunk_end)
        records = api_client.get_owm_air_pollution_history(
            start_unix=int(cursor.timestamp()),
            end_unix=int(chunk_end.timestamp()),
        )
        all_rows.extend(records)
        cursor = chunk_end
        time.sleep(1)  # be nice to the free-tier rate limit

    df = pd.DataFrame(all_rows)
    if df.empty:
        raise RuntimeError("No historical data returned - check API key / date range.")

    df["datetime"] = pd.to_datetime(df["timestamp"], unit="s", utc=True)
    df["aqi"] = df.apply(lambda r: api_client.owm_aqi_index_to_us_aqi(r.to_dict()), axis=1)
    df = df.rename(columns={
        "comp_pm2_5": "pm25", "comp_pm10": "pm10", "comp_o3": "o3",
        "comp_no2": "no2", "comp_so2": "so2", "comp_co": "co",
    })
    df["city"] = config.CITY_NAME
    keep = ["datetime", "aqi", "pm25", "pm10", "o3", "no2", "so2", "co", "city"]
    return df[keep].dropna(subset=["aqi"]).sort_values("datetime").reset_index(drop=True)


def run(days: int = 90, triggered_by: str = "manual"):
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
                    extra_logs=[f"Fetched {len(raw)} raw hourly records from OpenWeather history API",
                                f"Wrote {len(featurized)} feature rows to feature store"])
        return featurized
    except Exception as e:  # noqa: BLE001
        log_run_end(run_record, status="failed", extra_logs=[f"Error: {e}"])
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=90, help="How many past days to backfill")
    args = parser.parse_args()
    run(days=args.days)
