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
4. Evaluate models using RMSE, MAE and R2
5. Select the best model per horizon based on RMSE
6. Register the winning model in the Model Registry
   (local ./models, mirrored to Hopsworks when configured)
7. Write training_report.json (used by the Flask dashboard)

Total training runs:
    3 horizons x 3 algorithms = 9 models

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
#
# Names must stay in sync with backend:  config.py  and  .env.example
# ============================================================

CITY_NAME = os.getenv("CITY_NAME", "karachi")

# Number of most recent days used for testing
TEST_DAYS = int(os.getenv("TEST_DAYS", "120"))


# Forecast horizons (hourly matches back ic months: src/predict.py, app/flask_api.py)
HORIZONS = ["24h", "48h", "72h"]
HORIZON_HOURS = {"24h": 24, "48h": 48, "72h": 72}

# Minimum number of hourly rows / lag windows expected for a consistent dataset
DEFAULT_MIN_ROWS = 200

# Feature group name / version already defined in config.py
FEATURE_GROUP_NAME = config.FEATURE_GROUP_NAME
FEATURE_GROUP_VERSION = config.FEATURE_GROUP_VERSION


# Columns that must NEVER be treated as model features (metadata / targets only)
_FEATURE_EXCLUDE = {
    "datetime",
    "city",
    "aqi_next_24h",
    "aqi_next_48h",
    "aqi_next_72h",
    "wind_deg",   # populated only by some API sources
}


# ============================================================
# 1. PUBLIC FEATURE / TARGET HELPERS
#
# These are imported by the serving/monitoring code:
#   src/predict.py        -> get_available_features, build_targets
#   src/shap_explain.py   -> get_available_features
# ============================================================

def get_available_features(df: pd.DataFrame) -> list:
    """
    Return the model feature columns for a given feature-store DataFrame.

    The exact same column set returned here is what training, prediction and
    SHAP all use, so a trained model is guaranteed to receive identical input
    columns at serving time.
    """
    return [c for c in df.columns if c not in _FEATURE_EXCLUDE]


def build_targets(df: pd.DataFrame) -> pd.DataFrame:
    """
    Attach +24h / +48h / +72h AQI targets to an hourly feature frame
    (same shift-window the dashboard uses in app/flask_api.py).
    """
    df = df.copy()
    for horizon in HORIZONS:
        hours = HORIZON_HOURS[horizon]
        df[f"aqi_next_{horizon}"] = df["aqi"].shift(-hours)
    return df


# ============================================================
# 2. FETCH AND PREPARE HOURLY DATA
# ============================================================

def fetch_hourly_dataset(store=None) -> pd.DataFrame:
    """Read hourly features from the Feature Store (Hopsworks or local)."""
    store = store or get_feature_store()
    df = store.read()

    if df is None or df.empty:
        raise RuntimeError(
            "Feature store is empty. Run the backfill pipeline "
            "(`python -m src.backfill --days 730`) or the hourly feature "
            "pipeline at least once before training."
        )

    df = df.copy()
    df["datetime"] = pd.to_datetime(
        df["datetime"],
        utc=True,
    )
    df = df.sort_values("datetime").reset_index(drop=True)

    # Keep only the selected city (mirrors feature_pipeline.py behaviour)
    if "city" in df.columns:
        df = df[df["city"] == CITY_NAME].reset_index(drop=True)

    logger.info("Loaded %d hourly rows for %s", len(df), CITY_NAME)
    return df


# ============================================================
# 3. BUILD TRAIN / TEST DATASET FOR ONE HORIZON
# ============================================================

def build_horizon_dataset(
    df: pd.DataFrame,
    horizon: str,
) -> tuple:
    """
    Prepare X/y for a single forecast horizon.

    horizon is one of "24h" / "48h" / "72h" (matches src/predict.py).
    The target column is aqi_next_{horizon} (e.g. aqi_next_24h).
    """
    features = get_available_features(df)
    target_col = f"aqi_next_{horizon}"

    if target_col not in df.columns:
        raise ValueError(
            f"Target column '{target_col}' is missing. "
            "Call build_targets() first."
        )

    data = df.dropna(subset=features + [target_col]).reset_index(drop=True)

    X = data[["datetime"] + features].copy()
    y = data[target_col].copy()

    return X, y, features, target_col


# ============================================================
# 4. TIME-BASED SPLIT
# ============================================================

def time_based_split(
    X: pd.DataFrame,
    y: pd.Series,
    test_days: int,
):
    """
    Split chronologically: train = all rows up to (max_date - test_days),
    test = the final `test_days` calendar days.
    """
    cutoff = (
        X["datetime"].max()
        - pd.Timedelta(days=test_days)
    )

    train_mask = X["datetime"] <= cutoff
    test_mask = ~train_mask

    X_train = (
        X.loc[train_mask]
        .drop(columns=["datetime"])
        .reset_index(drop=True)
    )
    X_test = (
        X.loc[test_mask]
        .drop(columns=["datetime"])
        .reset_index(drop=True)
    )

    y_train = y.loc[train_mask].reset_index(drop=True)
    y_test = y.loc[test_mask].reset_index(drop=True)

    return X_train, X_test, y_train, y_test, cutoff


# ============================================================
# 5. EVALUATION
# ============================================================

def evaluate(y_true, y_pred) -> dict:
    rmse = np.sqrt(
        mean_squared_error(
            y_true,
            y_pred,
        )
    )
    mae = mean_absolute_error(
        y_true,
        y_pred,
    )
    r2 = r2_score(
        y_true,
        y_pred,
    )

    return {
        "rmse": float(rmse),
        "mae": float(mae),
        "r2": float(r2),
    }


# ============================================================
# 6. CANDIDATE MODELS
# ============================================================

def get_candidate_models() -> dict:
    return {

        "ridge": Pipeline([
            (
                "scaler",
                StandardScaler(),
            ),
            (
                "model",
                Ridge(alpha=1.0),
            ),
        ]),

        "random_forest":
            RandomForestRegressor(
                n_estimators=300,
                max_depth=12,
                min_samples_leaf=2,
                random_state=42,
                n_jobs=-1,
            ),

        "xgboost":
            XGBRegressor(
                n_estimators=300,
                max_depth=5,
                learning_rate=0.03,
                subsample=0.8,
                colsample_bytree=0.8,
                reg_lambda=1.0,
                random_state=42,
                n_jobs=-1,
            ),
    }


# ============================================================
# 7. TRAIN 3 MODELS FOR ONE HORIZON
# ============================================================

def train_horizon(
    X_train,
    y_train,
    X_test,
    y_test,
    horizon: str,
) -> dict:

    candidates = get_candidate_models()
    results = {}

    logger.info("\n========================================")
    logger.info("        HORIZON: +%s", horizon)
    logger.info("========================================")

    for name, model in candidates.items():
        logger.info("\nTraining %s...", name)

        # Train
        model.fit(
            X_train,
            y_train,
        )

        # Predict
        predictions = model.predict(X_test)

        # Evaluate
        metrics = evaluate(
            y_test,
            predictions,
        )

        results[name] = {
            "model": model,
            "metrics": metrics,
        }

        logger.info(
            "%s: rmse=%.2f mae=%.2f r2=%.3f",
            name,
            metrics["rmse"],
            metrics["mae"],
            metrics["r2"],
        )

    return results


# ============================================================
# 8. SELECT BEST MODEL
# ============================================================

def pick_best(results: dict):

    best_name = min(
        results,
        key=lambda name:
            results[name]["metrics"]["rmse"],
    )

    logger.info("Winning model: %s", best_name)

    return (
        best_name,
        results[best_name],
    )


# ============================================================
# 9. REGISTER BEST MODEL IN THE MODEL REGISTRY
#
# For each horizon, ONLY the single algorithm with the lowest RMSE
# is pushed to the Model Registry (as aqi_model_{horizon}).
# Uses the shared backend helper src.model_registry.register_best_model()
# (saves locally under ./models and mirrors to Hopsworks when enabled),
# producing the exact model names expected by src/predict.py:
#     aqi_model_24h / aqi_model_48h / aqi_model_72h
# ============================================================

def _register_models(
    horizon: str,
    candidates: dict,
    best_name: str,
    best_result: dict,
) -> None:

    # Only the winning algorithm (lowest RMSE) is registered.
    # The other two candidate algorithms are evaluated but NOT pushed
    # to the model registry.
    register_best_model(
        best_result["model"],
        f"aqi_model_{horizon}",
        best_result["metrics"],
        framework="sklearn",
    )

    logger.info(
        "Registered only the best algorithm for %s: %s (RMSE=%.2f)",
        horizon,
        best_name,
        best_result["metrics"]["rmse"],
    )


# ============================================================
# 10. WRITE training_report.json (used by flask_api.py)
# ============================================================

def _write_training_report(results: dict) -> None:
    report_path = config.MODELS_DIR / "training_report.json"
    report_path.write_text(
        json.dumps(results, indent=2),
        encoding="utf-8",
    )
    logger.info("Training report written -> %s", report_path)


# ============================================================
# 11. MAIN ENTRY POINT
#
# Invoked by:
#   - app/flask_api.py     -> train_pipeline.run(triggered_by=...)
#   - tests/*.py -> train_pipeline.run(min_rows=200, triggered_by="test")
# ============================================================

def run(
    min_rows: int = DEFAULT_MIN_ROWS,
    triggered_by: str = "manual",
) -> dict:

    run_record = log_run_start(
        name=f"AQI Training Pipeline ({CITY_NAME.title()})",
        run_type="model_training",
        triggered_by=triggered_by,
    )

    try:
        # ----------------------------------------------------
        # Load data
        # ----------------------------------------------------
        df = fetch_hourly_dataset()

        if len(df) < min_rows:
            raise RuntimeError(
                f"Not enough historical rows to train. "
                f"Found {len(df)} rows, minimum required is "
                f"{min_rows}. Run `python -m src.backfill --days 366` "
                f"to backfill more history."
            )

        # ---- Build targets ----
        df = build_targets(df)

        # ----------------------------------------------------
        # Train each horizon
        # ----------------------------------------------------
        results = {}

        for horizon in HORIZONS:

            (
                X,
                y,
                feature_cols,
                target_col,
            ) = build_horizon_dataset(
                df,
                horizon,
            )

            logger.info(
                "Horizon %s: %d usable rows, %d features",
                horizon,
                len(X),
                len(feature_cols),
            )

            (
                X_train,
                X_test,
                y_train,
                y_test,
                cutoff,
            ) = time_based_split(
                X,
                y,
                TEST_DAYS,
            )

            logger.info(
                "Split %s -> train=%d rows, test=%d rows (cutoff %s)",
                horizon,
                len(X_train),
                len(X_test),
                cutoff.date(),
            )

            if len(X_train) < min_rows or len(X_test) == 0:
                raise RuntimeError(
                    f"Not enough data to split horizon {horizon}. "
                    f"train={len(X_train)} rows, test={len(X_test)} rows. "
                    f"Increase backfill size or reduce TEST_DAYS."
                )

            # ---------------------------------------
            # Train 3 models
            # ---------------------------------------
            candidates = train_horizon(
                X_train,
                y_train,
                X_test,
                y_test,
                horizon,
            )

            # ---------------------------------------
            # Select best model
            # ---------------------------------------
            best_name, best_result = pick_best(candidates)

            # ---------------------------------------
            # Register models
            # ---------------------------------------
            _register_models(
                horizon,
                candidates,
                best_name,
                best_result,
            )

            results[horizon] = {
                "best_model": best_name,
                "metrics": best_result["metrics"],
                "all_candidates": {
                    name: r["metrics"]
                    for name, r in candidates.items()
                },
            }

        # ----------------------------------------------------
        # Write dashboard report
        # ----------------------------------------------------
        _write_training_report(results)

        log_run_end(
            run_record,
            status="success",
            records_processed=len(df),
            extra_logs=[
                f"Trained {len(HORIZONS)} horizons x 3 algorithms",
                f"Best models: { {h: r['best_model'] for h, r in results.items()} }",
            ],
        )

        return results

    except Exception as e:  # noqa: BLE001
        log_run_end(
            run_record,
            status="failed",
            extra_logs=[f"Error: {e}"],
        )
        raise


# Backwards-compatible programmatic entry
def main():
    run()


if __name__ == "__main__":
    main()