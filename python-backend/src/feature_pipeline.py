"""
Feature Pipeline (runs every hour via GitHub Actions / Airflow).

1. Fetch current pollutant + weather data - PRIMARY source is Open-Meteo
   (same source used by backfill, so train/serve features stay consistent;
   it also updates every hour with real variation).
   AQICN (ground station) is kept as a SECONDARY cross-check / fallback only,
   with staleness detection: WAQI/AQICN ground stations sometimes only
   refresh on a multi-hour cycle, which can otherwise silently feed the
   feature store several duplicate hourly readings (e.g. AQI "161" repeated
   3+ hours in a row) - training on that teaches the model a fake flat
   pattern instead of real signal. See team discussion / mentor guidance
   (Umema Ashar, 10Pearls, 2026-08-03): use OpenWeather-family data as the
   primary live pollutant source for feature computation, keep WAQI as a
   secondary check/fallback with staleness detection.
2. Compute time + derived features using recent history pulled from the
   feature store (for lags/rolling stats)
3. Insert the new row into the Feature Store
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

STALENESS_LOOKBACK_HOURS = 3


def _is_aqicn_stale(history: pd.DataFrame, aqicn_value: float, lookback: int = STALENESS_LOOKBACK_HOURS) -> bool:
    """True if the last `lookback` stored hourly rows all carry this EXACT same
    AQI value - i.e. the WAQI/AQICN ground station hasn't actually refreshed,
    it's just repeating its last reading. Not an error by itself (ground
    stations do update on a multi-hour cycle), but we don't want to treat a
    repeated stale reading as a fresh live pollutant reading for training."""
    try:
        if history is None or history.empty or "aqi" not in history.columns or aqicn_value is None:
            return False
        recent = history.sort_values("datetime").tail(lookback)
        if len(recent) < lookback:
            return False
        return bool((recent["aqi"].round(1) == round(float(aqicn_value), 1)).all())
    except Exception:  # noqa: BLE001
        return False


def fetch_current_raw_row(history: pd.DataFrame = None) -> dict:
    om = None
    aqicn = None

    try:
        om = api_client.get_open_meteo_current(config.LATITUDE, config.LONGITUDE)
    except Exception as e:  # noqa: BLE001
        logger.warning("Open-Meteo current reading failed (%s).", e)

    try:
        aqicn = api_client.get_aqicn_current()
    except Exception as e:  # noqa: BLE001
        logger.warning("AQICN current reading failed (%s).", e)

    if om is None and aqicn is None:
        raise RuntimeError("Both Open-Meteo and AQICN failed - no live AQI reading available this hour.")

    aqicn_is_stale = False
    if aqicn is not None:
        aqicn_is_stale = _is_aqicn_stale(history, aqicn.get("aqi"))
        if aqicn_is_stale:
            logger.warning(
                "AQICN AQI (%.1f) is identical to the last %d stored hourly readings - "
                "ground station likely hasn't refreshed yet (multi-hour update cycle). "
                "Using Open-Meteo as the primary source for this hour instead.",
                aqicn["aqi"], STALENESS_LOOKBACK_HOURS,
            )

    if om is not None:
        # Open-Meteo is the primary source (per team guidance): more frequent,
        # real hourly variation -> the model actually has signal to learn from.
        source = "open-meteo"
        aqi, pm25, pm10 = om["aqi"], om["pm25"], om["pm10"]
        o3, no2, so2, co = om["o3"], om["no2"], om["so2"], om["co"]
        temp, humidity = om["temp"], om["humidity"]
        pressure, wind_speed, clouds = om["pressure"], om["wind_speed"], om["clouds"]
    else:
        # Open-Meteo unavailable this hour - fall back to AQICN + OpenWeather
        # weather. (We still use it even if flagged stale, since a stale-but-
        # real reading beats having no reading at all for this hour.)
        source = "aqicn (fallback)" + (" [stale]" if aqicn_is_stale else "")
        aqi, pm25, pm10 = aqicn["aqi"], aqicn["pm25"], aqicn["pm10"]
        o3, no2, so2, co = aqicn["o3"], aqicn["no2"], aqicn["so2"], aqicn["co"]
        weather = api_client.get_owm_current_weather()
        temp, humidity = weather["temp"], weather["humidity"]
        pressure, wind_speed, clouds = weather["pressure"], weather["wind_speed"], weather["clouds"]

    logger.info("Live reading source for this hour: %s (AQI=%.1f)", source, aqi)

    # IMPORTANT: cast every measurement to float here. Hopsworks stores these
    # columns as 'double'. If an API happens to return a whole number (e.g.
    # AQI "70" instead of "70.0"), pandas keeps the column as int and the
    # feature-store insert fails with:
    #   "aqi (expected type: 'double', derived from input: 'int') has the wrong type."
    row = {
        "datetime": datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0),
        "aqi": float(aqi) if aqi is not None else None,
        "pm25": float(pm25) if pm25 is not None else None,
        "pm10": float(pm10) if pm10 is not None else None,
        "o3": float(o3) if o3 is not None else None,
        "no2": float(no2) if no2 is not None else None,
        "so2": float(so2) if so2 is not None else None,
        "co": float(co) if co is not None else None,
        "temp": float(temp) if temp is not None else None,
        "humidity": float(humidity) if humidity is not None else None,
        "pressure": float(pressure) if pressure is not None else None,
        "wind_speed": float(wind_speed) if wind_speed is not None else None,
        "clouds": float(clouds) if clouds is not None else None,
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
        new_row = fetch_current_raw_row(history)
        new_df = pd.DataFrame([new_row])

        if not history.empty:
            combined = pd.concat([history, new_df], ignore_index=True)
            combined = combined.drop_duplicates(subset=["datetime"], keep="last")
        else:
            combined = new_df

        featurized = full_feature_pipeline(combined, target_col="aqi")
        # only the freshest row needs to be (re)inserted with completed lag/rolling features
        latest_row = featurized.tail(1)

        if not history.empty:
            # IMPORTANT: only send columns that already exist in the established
            # Hopsworks schema (from backfill) - keeps this hourly job self-
            # contained and safe even if the live reading ever carries extra
            # columns the trained schema doesn't have yet.
            existing_cols = [c for c in history.columns if c in latest_row.columns]
            dropped_cols = [c for c in latest_row.columns if c not in history.columns]
            if dropped_cols:
                logger.info(
                    "Dropping columns not present in the existing feature group schema: %s",
                    dropped_cols,
                )
            latest_row = latest_row[existing_cols]

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