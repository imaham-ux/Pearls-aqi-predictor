"""
Training Pipeline

1. Read the hourly features from the Feature Store
   (via src.feature_store.get_feature_store() - Hopsworks when configured,
    local parquet otherwise)
2. Build targets for +24h, +48h and +72h
3. Train three models for each horizon:
      - Ridge Regression
      - Random Forest
      - XGBoost
   Each model's hyperparameters are tuned with a randomized, time-series-aware
   cross-validation search on the training portion only (see Section 6 below),
   rather than trained with fixed defaults.
4. Evaluate models using RMSE, MAE and R2 on a chronological holdout
5. Select the best model per horizon based on RMSE
6. Register the winning model in the Model Registry
   (local ./models, mirrored to Hopsworks when configured)
7. Write training_report.json (used by the Flask dashboard)

Total training runs:
    3 horizons x 3 algorithms = 9 models, each with its own hyperparameter search

NOTE - names used here must match the rest of the backend EXACTLY:

* Feature-store columns use "temp" and "clouds" (NOT "temperature" /
  "feels_like") - see src/api_client.py, src/feature_pipeline.py,
  src/feature_engineering.py
* Env var names come from config.py: HOPSWORKS_PROJECT_NAME (not
  HOPSWORKS_PROJECT)
* Horizons are "24h" / "48h" / "72h" (see src/predict.py, app/flask_api.py)
* Model names are aqi_model_24h / aqi_model_48h / aqi_model_72h
  (see src/predict.py, src/model_registry.py)
* Public helpers: get_available_features(), build_targets()
  (imported by src/predict.py and src/shap_explain.py)
* Public entry point: run(min_rows=..., triggered_by=...)
  (invoked by app/flask_api.py and the test suite)
"""

import json
import logging
import os

import numpy as np
import pandas as pd

from dotenv import load_dotenv

from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from xgboost import XGBRegressor

import config
from src.feature_store import get_feature_store
from src.model_registry import register_best_model
from src.run_logger import log_run_start, log_run_end

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("train_pipeline")

load_dotenv()


# ============================================================
# CONFIGURATION
# ============================================================

CITY_NAME = os.getenv("CITY_NAME", "karachi")

TEST_DAYS = int(os.getenv("TEST_DAYS", "120"))

# Number of time-series cross-validation folds used during hyperparameter
# search (on the training portion only - the chronological test holdout
# is never touched during tuning, keeping reported metrics an honest,
# unseen-data evaluation).
CV_FOLDS = int(os.getenv("CV_FOLDS", "5"))

# How many random hyperparameter combinations to try per model per horizon.
SEARCH_ITER = int(os.getenv("SEARCH_ITER", "20"))

HORIZONS = ["24h", "48h", "72h"]
HORIZON_HOURS = {"24h": 24, "48h": 48, "72h": 72}

DEFAULT_MIN_ROWS = 200

FEATURE_GROUP_NAME = config.FEATURE_GROUP_NAME
FEATURE_GROUP_VERSION = config.FEATURE_GROUP_VERSION

_FEATURE_EXCLUDE = {
    "datetime",
    "city",
    "aqi_next_24h",
    "aqi_next_48h",
    "aqi_next_72h",
    "wind_deg",
}


def get_available_features(df: pd.DataFrame) -> list:
    return [c for c in df.columns if c not in _FEATURE_EXCLUDE]


def build_targets(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for horizon in HORIZONS:
        hours = HORIZON_HOURS[horizon]
        df[f"aqi_next_{horizon}"] = df["aqi"].shift(-hours)
    return df


def fetch_hourly_dataset(store=None) -> pd.DataFrame:
    store = store or get_feature_store()
    df = store.read()

    if df is None or df.empty:
        raise RuntimeError(
            "Feature store is empty. Run the backfill pipeline "
            "(`python -m src.backfill --days 730`) or the hourly feature "
            "pipeline at least once before training."
        )

    df = df.copy()
    df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
    df = df.sort_values("datetime").reset_index(drop=True)

    if "city" in df.columns:
        df = df[df["city"] == CITY_NAME].reset_index(drop=True)

    before = len(df)
    df = df.drop_duplicates(subset=["datetime"], keep="last").reset_index(drop=True)
    if len(df) != before:
        logger.warning(
            "Dropped %d duplicate-timestamp rows before training (kept the most recent of each).",
            before - len(df),
        )

    logger.info("Loaded %d hourly rows for %s", len(df), CITY_NAME)
    return df


def build_horizon_dataset(df: pd.DataFrame, horizon: str) -> tuple:
    features = get_available_features(df)
    target_col = f"aqi_next_{horizon}"

    if target_col not in df.columns:
        raise ValueError(f"Target column '{target_col}' is missing. Call build_targets() first.")

    total_rows = len(df)
    data = df.dropna(subset=features + [target_col]).reset_index(drop=True)
    kept_rows = len(data)

    survival_pct = (kept_rows / total_rows * 100) if total_rows else 0.0
    logger.info(
        "Horizon %s: %d/%d rows (%.1f%%) survived dropna on %d features + target.",
        horizon, kept_rows, total_rows, survival_pct, len(features),
    )
    if survival_pct < 70:
        missing_counts = df[features + [target_col]].isna().sum().sort_values(ascending=False)
        worst = missing_counts[missing_counts > 0].head(8)
        logger.warning(
            "Horizon %s lost more than 30%% of rows to missing values - "
            "worst offending columns (missing-value counts):\n%s",
            horizon, worst.to_string(),
        )

    X = data[["datetime"] + features].copy()
    y = data[target_col].copy()

    return X, y, features, target_col


def time_based_split(X: pd.DataFrame, y: pd.Series, test_days: int):
    cutoff = X["datetime"].max() - pd.Timedelta(days=test_days)

    train_mask = X["datetime"] <= cutoff
    test_mask = ~train_mask

    X_train = X.loc[train_mask].drop(columns=["datetime"]).reset_index(drop=True)
    X_test = X.loc[test_mask].drop(columns=["datetime"]).reset_index(drop=True)

    y_train = y.loc[train_mask].reset_index(drop=True)
    y_test = y.loc[test_mask].reset_index(drop=True)

    logger.info(
        "Target stats -> train: mean=%.1f std=%.1f (n=%d) | test: mean=%.1f std=%.1f (n=%d)",
        y_train.mean(), y_train.std(), len(y_train),
        y_test.mean(), y_test.std(), len(y_test),
    )

    return X_train, X_test, y_train, y_test, cutoff


def evaluate(y_true, y_pred) -> dict:
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mae = mean_absolute_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)
    return {"rmse": float(rmse), "mae": float(mae), "r2": float(r2)}


def get_candidate_search_spaces() -> dict:
    return {
        "ridge": {
            "estimator": Pipeline([("scaler", StandardScaler()), ("model", Ridge())]),
            "param_distributions": {"model__alpha": [0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0, 300.0]},
        },
        "random_forest": {
            "estimator": RandomForestRegressor(random_state=42, n_jobs=-1),
            "param_distributions": {
                "n_estimators": [200, 300, 400, 600],
                "max_depth": [6, 8, 12, 16, 24, None],
                "min_samples_leaf": [1, 2, 4, 8],
                "max_features": ["sqrt", 0.5, 0.8, None],
            },
        },
        "xgboost": {
            "estimator": XGBRegressor(random_state=42, n_jobs=-1),
            "param_distributions": {
                "n_estimators": [200, 300, 400, 600],
                "max_depth": [3, 4, 5, 6, 8],
                "learning_rate": [0.01, 0.02, 0.03, 0.05, 0.08, 0.1],
                "subsample": [0.6, 0.7, 0.8, 0.9, 1.0],
                "colsample_bytree": [0.6, 0.7, 0.8, 0.9, 1.0],
                "reg_lambda": [0.1, 1.0, 3.0, 10.0],
            },
        },
    }


def _tune_one_model(name: str, spec: dict, X_train, y_train):
    n_splits = min(CV_FOLDS, max(2, len(X_train) // 500))
    cv = TimeSeriesSplit(n_splits=n_splits)

    search = RandomizedSearchCV(
        estimator=spec["estimator"],
        param_distributions=spec["param_distributions"],
        n_iter=SEARCH_ITER,
        scoring="neg_root_mean_squared_error",
        cv=cv,
        random_state=42,
        n_jobs=-1,
        refit=True,
    )
    search.fit(X_train, y_train)

    logger.info("%s: best CV RMSE=%.2f with params=%s", name, -search.best_score_, search.best_params_)
    return search.best_estimator_


def train_horizon(X_train, y_train, X_test, y_test, horizon: str) -> dict:
    search_spaces = get_candidate_search_spaces()
    results = {}

    logger.info("\n========================================")
    logger.info("        HORIZON: +%s", horizon)
    logger.info("========================================")

    for name, spec in search_spaces.items():
        logger.info("\nTuning + training %s...", name)
        model = _tune_one_model(name, spec, X_train, y_train)
        predictions = model.predict(X_test)
        metrics = evaluate(y_test, predictions)
        results[name] = {"model": model, "metrics": metrics}
        logger.info("%s (holdout): rmse=%.2f mae=%.2f r2=%.3f", name, metrics["rmse"], metrics["mae"], metrics["r2"])

    return results


def pick_best(results: dict):
    best_name = min(results, key=lambda name: results[name]["metrics"]["rmse"])
    logger.info("Winning model: %s", best_name)
    return best_name, results[best_name]


def _register_models(horizon: str, candidates: dict, best_name: str, best_result: dict) -> None:
    register_best_model(best_result["model"], f"aqi_model_{horizon}", best_result["metrics"], framework="sklearn")
    logger.info("Registered only the best algorithm for %s: %s (RMSE=%.2f)", horizon, best_name, best_result["metrics"]["rmse"])


def _write_training_report(results: dict) -> None:
    report_path = config.MODELS_DIR / "training_report.json"
    report_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    logger.info("Training report written -> %s", report_path)


def run(min_rows: int = DEFAULT_MIN_ROWS, triggered_by: str = "manual") -> dict:
    run_record = log_run_start(name=f"AQI Training Pipeline ({CITY_NAME.title()})", run_type="model_training", triggered_by=triggered_by)

    try:
        df = fetch_hourly_dataset()

        if len(df) < min_rows:
            raise RuntimeError(
                f"Not enough historical rows to train. Found {len(df)} rows, minimum required is "
                f"{min_rows}. Run `python -m src.backfill --days 366` to backfill more history."
            )

        df = build_targets(df)
        results = {}

        for horizon in HORIZONS:
            X, y, feature_cols, target_col = build_horizon_dataset(df, horizon)
            logger.info("Horizon %s: %d usable rows, %d features", horizon, len(X), len(feature_cols))

            X_train, X_test, y_train, y_test, cutoff = time_based_split(X, y, TEST_DAYS)
            logger.info("Split %s -> train=%d rows, test=%d rows (cutoff %s)", horizon, len(X_train), len(X_test), cutoff.date())

            if len(X_train) < min_rows or len(X_test) == 0:
                raise RuntimeError(
                    f"Not enough data to split horizon {horizon}. train={len(X_train)} rows, test={len(X_test)} rows. "
                    f"Increase backfill size or reduce TEST_DAYS."
                )

            candidates = train_horizon(X_train, y_train, X_test, y_test, horizon)
            best_name, best_result = pick_best(candidates)
            _register_models(horizon, candidates, best_name, best_result)

            results[horizon] = {
                "best_model": best_name,
                "metrics": best_result["metrics"],
                "all_candidates": {name: r["metrics"] for name, r in candidates.items()},
            }

        _write_training_report(results)

        log_run_end(
            run_record, status="success", records_processed=len(df),
            extra_logs=[
                f"Trained {len(HORIZONS)} horizons x 3 algorithms (hyperparameter-tuned)",
                f"Best models: { {h: r['best_model'] for h, r in results.items()} }",
            ],
        )
        return results

    except Exception as e:  # noqa: BLE001
        log_run_end(run_record, status="failed", extra_logs=[f"Error: {e}"])
        raise


def main():
    run()


if __name__ == "__main__":
    main()