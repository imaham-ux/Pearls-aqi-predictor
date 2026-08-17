"""
Training Pipeline

1. Read the hourly features from the Feature Store
   (via src.feature_store.get_feature_store() - Hopsworks when configured,
    local parquet otherwise)
2. Drop rows that are part of a suspiciously flat AQI stretch (see
   filter_stale_readings() below) before anything else touches the data
3. Build targets for +24h, +48h and +72h
4. For each horizon, tune and train three candidate models:
      - Ridge Regression      (small alpha grid)
      - Random Forest         (randomized search, time-series cross-validation)
      - XGBoost               (randomized search, time-series cross-validation)
5. Evaluate the tuned models using RMSE, MAE and R2 on the final held-out
   time window, and log how each compares against the target quality gate
   (R2 >= 0.7, RMSE <= 30, MAE <= 20)
6. Select the best model per horizon based on RMSE
7. Register the winning model in the Model Registry
   (local ./models, mirrored to Hopsworks when configured)
8. Write training_report.json (used by the Flask dashboard)

Total training runs:
    3 horizons x 3 algorithms = 9 models (each tuned via cross-validation)

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

IMPORTANT: this file intentionally does NOT add any new feature-store
columns. The feature *set* used for training is identical to before -
only which rows are used (filter_stale_readings) and how the models are
fit (hyperparameter search) changed. This keeps src/predict.py and
src/shap_explain.py fully compatible with no changes required there.
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

# How many consecutive identical hourly AQI readings count as "stale" and get
# dropped before training. Matches the staleness lookback already used on the
# ingestion side (src/feature_pipeline.py) - see project report, Section 7,
# for the full story of why the Karachi ground station needed this guard.
STALE_RUN_LENGTH = 3

# Target quality gate, as agreed with the mentor. Runs are still registered
# even when a horizon misses the gate (a partially-working model beats no
# model), but every miss is logged clearly so it's never silently accepted.
QUALITY_GATE = {"min_r2": 0.7, "max_rmse": 30.0, "max_mae": 20.0}

# Hyperparameter search budget. Kept modest (small n_iter, few CV folds) so a
# full 3-horizon x 2-tuned-algorithm run still finishes in a reasonable time
# inside GitHub Actions.
CV_FOLDS = 3
SEARCH_ITER = 10


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
    columns at serving time. Deliberately unchanged from before - the fix for
    low accuracy lives in data quality and hyperparameter tuning, not in
    adding new columns (which would require another Hopsworks schema
    migration - see project report, Section 6).
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


def filter_stale_readings(df: pd.DataFrame, target_col: str = "aqi",
                           run_length: int = STALE_RUN_LENGTH) -> pd.DataFrame:
    """
    Data-quality guard: drops rows that sit inside a stretch of `run_length`
    or more consecutive, exactly-identical AQI readings.

    This matters because part of this project's history involved a ground
    station (AQICN) that only refreshed on a multi-hour cycle, which meant a
    single real reading could end up logged as several "fresh" hourly rows in
    a row - a stale run that would otherwise teach the model a flat pattern
    that never really happened. The ingestion side was fixed to stop this
    going forward (see project report, Section 7), but older rows already
    sitting in the feature store can still carry the pattern, so this guard
    catches it at training time too. The first reading of every stretch is
    always kept - only the repeated duplicates after it are dropped.
    """
    if df.empty:
        return df

    df = df.sort_values("datetime").reset_index(drop=True)
    values = df[target_col].to_numpy()
    n = len(values)
    drop_positions = []
    run_start = 0

    for i in range(1, n):
        same = values[i] == values[i - 1]
        if not same or i == n - 1:
            run_end = i if not same else i + 1
            length = run_end - run_start
            if length >= run_length:
                drop_positions.extend(range(run_start + 1, run_end))
            run_start = i

    if drop_positions:
        pct = 100 * len(drop_positions) / n
        logger.warning(
            "Dropping %d of %d rows (%.1f%%) that sit inside a stale AQI "
            "stretch (%d+ identical consecutive hourly readings) before "
            "training - see project report, Section 7.",
            len(drop_positions), n, pct, run_length,
        )
        df = df.drop(index=drop_positions).reset_index(drop=True)
    else:
        logger.info("No stale AQI stretches found - nothing dropped.")

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


def _check_quality_gate(horizon: str, metrics: dict) -> None:
    """Logs a clear pass/warn line against the mentor-agreed target metrics.
    Never blocks registration - a working-but-imperfect model still beats no
    model at all - but a miss is always visible in the logs, never silent."""
    misses = []
    if metrics["r2"] < QUALITY_GATE["min_r2"]:
        misses.append(f"R2 {metrics['r2']:.3f} < {QUALITY_GATE['min_r2']}")
    if metrics["rmse"] > QUALITY_GATE["max_rmse"]:
        misses.append(f"RMSE {metrics['rmse']:.2f} > {QUALITY_GATE['max_rmse']}")
    if metrics["mae"] > QUALITY_GATE["max_mae"]:
        misses.append(f"MAE {metrics['mae']:.2f} > {QUALITY_GATE['max_mae']}")

    if misses:
        logger.warning("Quality gate MISSED for horizon %s: %s", horizon, "; ".join(misses))
    else:
        logger.info("Quality gate PASSED for horizon %s (R2=%.3f, RMSE=%.2f, MAE=%.2f)",
                    horizon, metrics["r2"], metrics["rmse"], metrics["mae"])


# ============================================================
# 6. CANDIDATE MODELS + HYPERPARAMETER SEARCH SPACES
# ============================================================

_RIDGE_ALPHAS = [0.1, 0.5, 1.0, 5.0, 10.0, 50.0]

_RF_PARAM_DIST = {
    "n_estimators": [200, 300, 400, 500],
    "max_depth": [8, 12, 16, 20, None],
    "min_samples_leaf": [1, 2, 4, 8],
    "max_features": ["sqrt", 0.5, 0.8, None],
}

_XGB_PARAM_DIST = {
    "n_estimators": [200, 300, 400, 500, 700],
    "max_depth": [3, 4, 5, 6, 7],
    "learning_rate": [0.01, 0.02, 0.03, 0.05, 0.08, 0.1],
    "subsample": [0.6, 0.7, 0.8, 0.9, 1.0],
    "colsample_bytree": [0.6, 0.7, 0.8, 0.9, 1.0],
    "reg_lambda": [0.5, 1.0, 2.0, 5.0],
}


def _tune_ridge(X_train, y_train, cv):
    """Small enough search space to just grid it directly rather than pull in
    RandomizedSearchCV machinery for one hyperparameter."""
    best_alpha, best_score = _RIDGE_ALPHAS[0], -np.inf
    for alpha in _RIDGE_ALPHAS:
        pipe = Pipeline([("scaler", StandardScaler()), ("model", Ridge(alpha=alpha))])
        scores = []
        for train_idx, val_idx in cv.split(X_train):
            pipe.fit(X_train.iloc[train_idx], y_train.iloc[train_idx])
            pred = pipe.predict(X_train.iloc[val_idx])
            scores.append(-np.sqrt(mean_squared_error(y_train.iloc[val_idx], pred)))
        mean_score = float(np.mean(scores))
        if mean_score > best_score:
            best_score, best_alpha = mean_score, alpha

    logger.info("Ridge CV search -> best alpha=%s (CV RMSE=%.2f)", best_alpha, -best_score)
    final = Pipeline([("scaler", StandardScaler()), ("model", Ridge(alpha=best_alpha))])
    final.fit(X_train, y_train)
    return final


def _tune_random_forest(X_train, y_train, cv):
    base = RandomForestRegressor(random_state=42, n_jobs=-1)
    search = RandomizedSearchCV(
        base, _RF_PARAM_DIST, n_iter=SEARCH_ITER, cv=cv,
        scoring="neg_root_mean_squared_error", random_state=42, n_jobs=-1,
    )
    search.fit(X_train, y_train)
    logger.info("Random Forest CV search -> best params=%s (CV RMSE=%.2f)",
                search.best_params_, -search.best_score_)
    return search.best_estimator_


def _tune_xgboost(X_train, y_train, cv):
    base = XGBRegressor(random_state=42, n_jobs=-1)
    search = RandomizedSearchCV(
        base, _XGB_PARAM_DIST, n_iter=SEARCH_ITER, cv=cv,
        scoring="neg_root_mean_squared_error", random_state=42, n_jobs=-1,
    )
    search.fit(X_train, y_train)
    logger.info("XGBoost CV search -> best params=%s (CV RMSE=%.2f)",
                search.best_params_, -search.best_score_)
    return search.best_estimator_


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

    results = {}
    cv = TimeSeriesSplit(n_splits=CV_FOLDS)

    logger.info("\n========================================")
    logger.info("        HORIZON: +%s", horizon)
    logger.info("========================================")
    logger.info(
        "Train rows=%d (target std=%.2f) | Test rows=%d (target std=%.2f)",
        len(y_train), float(y_train.std()), len(y_test), float(y_test.std()),
    )
    if y_test.std() < 10:
        logger.warning(
            "Test-set AQI barely varies (std=%.2f) for horizon %s - R2 will "
            "look worse than the model's real skill even if RMSE/MAE are "
            "fine, since R2 is measured relative to that variance.",
            y_test.std(), horizon,
        )

    tuners = {
        "ridge": _tune_ridge,
        "random_forest": _tune_random_forest,
        "xgboost": _tune_xgboost,
    }

    for name, tune_fn in tuners.items():
        logger.info("\nTuning + training %s...", name)

        model = tune_fn(X_train, y_train, cv)
        predictions = model.predict(X_test)
        metrics = evaluate(y_test, predictions)

        results[name] = {"model": model, "metrics": metrics}

        logger.info(
            "%s (tuned): rmse=%.2f mae=%.2f r2=%.3f",
            name, metrics["rmse"], metrics["mae"], metrics["r2"],
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
                f"{min_rows}. Run `python -m src.backfill --days 730` "
                f"to backfill more history."
            )

        # ---- Drop stale-reading stretches before anything else ----
        df = filter_stale_readings(df)

        if len(df) < min_rows:
            raise RuntimeError(
                f"Only {len(df)} rows remain after dropping stale AQI "
                f"stretches (minimum required is {min_rows}). The feature "
                f"store may need a fresh backfill."
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
            # Tune + train 3 models
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
            _check_quality_gate(horizon, best_result["metrics"])

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
                f"Trained {len(HORIZONS)} horizons x 3 algorithms (each cross-validated)",
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
