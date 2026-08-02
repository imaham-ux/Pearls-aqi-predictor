"""
Exploratory Data Analysis helpers used by both the Streamlit dashboard and
standalone reporting (`python -m src.eda`).
"""
import pandas as pd

from src.feature_store import get_feature_store


def load_history() -> pd.DataFrame:
    store = get_feature_store()
    df = store.read()
    if df.empty:
        return df
    df["datetime"] = pd.to_datetime(df["datetime"])
    return df.sort_values("datetime")


def daily_summary(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["date"] = d["datetime"].dt.date
    return d.groupby("date").agg(
        avg_aqi=("aqi", "mean"),
        max_aqi=("aqi", "max"),
        min_aqi=("aqi", "min"),
        avg_pm25=("pm25", "mean"),
    ).reset_index()


def hourly_pattern(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["hour"] = d["datetime"].dt.hour
    return d.groupby("hour")["aqi"].mean().reset_index()


def correlation_matrix(df: pd.DataFrame, cols=None) -> pd.DataFrame:
    cols = cols or ["aqi", "pm25", "pm10", "o3", "no2", "so2", "co", "temp", "humidity", "wind_speed"]
    cols = [c for c in cols if c in df.columns]
    return df[cols].corr()


if __name__ == "__main__":
    history = load_history()
    if history.empty:
        print("No data yet - run backfill first.")
    else:
        print("Daily summary:\n", daily_summary(history).tail(10))
        print("\nHourly pattern:\n", hourly_pattern(history))
        print("\nCorrelations:\n", correlation_matrix(history))
