"""
Feature engineering: turns raw AQI/weather readings into a model-ready row.
- Time-based features (hour, day, month, weekday, is_weekend, cyclical encodings)
- Derived features (aqi_change_rate, rolling means/std, lag features)
"""
import numpy as np
import pandas as pd


def add_time_features(df: pd.DataFrame, ts_col: str = "datetime") -> pd.DataFrame:
    df = df.copy()
    # utc=True normalizes a mix of tz-naive and tz-aware timestamps into one
    # consistent UTC-aware series. This matters for the hourly feature pipeline:
    # historical rows read back from Hopsworks often come back tz-naive, while
    # the freshly-fetched live row is tz-aware (datetime.now(timezone.utc)) -
    # concatenating the two without utc=True raises
    # "Tz-aware datetime.datetime cannot be converted to datetime64 unless utc=True".
    # Backfill data is already tz-aware UTC, so this is a no-op there.
    df[ts_col] = pd.to_datetime(df[ts_col], utc=True)
    df["hour"] = df[ts_col].dt.hour
    df["day"] = df[ts_col].dt.day
    df["month"] = df[ts_col].dt.month
    df["weekday"] = df[ts_col].dt.weekday
    df["is_weekend"] = (df["weekday"] >= 5).astype(int)

    # cyclical encodings so the model understands hour 23 is close to hour 0
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    return df


def add_lag_and_rolling_features(df: pd.DataFrame, target_col: str = "aqi",
                                  lags=(1, 3, 6, 12, 24), windows=(3, 6, 24)) -> pd.DataFrame:
    """Assumes df is sorted ascending by time for a single location."""
    df = df.sort_values("datetime").copy()

    for lag in lags:
        df[f"{target_col}_lag_{lag}h"] = df[target_col].shift(lag)

    for w in windows:
        df[f"{target_col}_roll_mean_{w}h"] = df[target_col].shift(1).rolling(w).mean()
        df[f"{target_col}_roll_std_{w}h"] = df[target_col].shift(1).rolling(w).std()

    # AQI change rate = derivative of AQI over the last hour
    df[f"{target_col}_change_rate"] = df[target_col].diff()
    df[f"{target_col}_change_rate_pct"] = df[target_col].pct_change().replace([np.inf, -np.inf], np.nan)

    return df


def add_weather_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if {"temp", "humidity"}.issubset(df.columns):
        # simple heat index proxy - useful because photochemical smog correlates with heat
        df["heat_humidity_index"] = df["temp"] * (df["humidity"] / 100.0)
    if "wind_speed" in df.columns:
        # low wind speed -> pollutant accumulation
        df["low_wind_flag"] = (df["wind_speed"] < 2.0).astype(int)
    return df


def build_feature_row(raw: dict, ts) -> dict:
    """Build a single feature row (used by the hourly feature pipeline) from one API reading."""
    row = {"datetime": pd.to_datetime(ts), **raw}
    return row


def full_feature_pipeline(df_raw: pd.DataFrame, target_col: str = "aqi") -> pd.DataFrame:
    """Full transform used both for backfill (bulk) and hourly incremental rows (with history)."""
    df = add_time_features(df_raw)
    df = add_lag_and_rolling_features(df, target_col=target_col)
    df = add_weather_derived_features(df)
    return df