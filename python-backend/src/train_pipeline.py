"""
Training Pipeline (runs daily via GitHub Actions / Airflow).

1. Read features from the Feature Store
2. Build supervised targets for t+24h, t+48h, t+72h (3-day-ahead forecasting)
3. Train & evaluate: Random Forest, Ridge Regression, and an LSTM (TensorFlow)
4. Pick the best model per horizon by RMSE and push to Model Registry
"""
import logging
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler

import config
from src.feature_store import get_feature_store
from src.model_registry import register_best_model
from src.run_logger import log_run_start, log_run_end

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("train_pipeline")

HORIZONS = {"24h": 24, "48h": 48, "72h": 72}

FEATURE_COLS_BASE = [
    "pm25", "pm10", "o3", "no2", "so2", "co",
    "hour_sin", "hour_cos", "month_sin", "month_cos", "is_weekend",
    "aqi_lag_1h", "aqi_lag_3h", "aqi_lag_6h", "aqi_lag_12h", "aqi_lag_24h",
    "aqi_roll_mean_3h", "aqi_roll_mean_6h", "aqi_roll_mean_24h",
    "aqi_roll_std_3h", "aqi_roll_std_6h", "aqi_roll_std_24h",
    "aqi_change_rate", "aqi_change_rate_pct",
]


def build_targets(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("datetime").reset_index(drop=True)
    for name, h in HORIZONS.items():
        df[f"target_{name}"] = df["aqi"].shift(-h)
    return df


def get_available_features(df: pd.DataFrame) -> list:
    return [c for c in FEATURE_COLS_BASE if c in df.columns]


def evaluate(y_true, y_pred) -> dict:
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mae = float(mean_absolute_error(y_true, y_pred))
    r2 = float(r2_score(y_true, y_pred))
    return {"rmse": round(rmse, 3), "mae": round(mae, 3), "r2": round(r2, 3)}


def train_lstm(X_train, y_train, X_val, y_val, n_features):
    import tensorflow as tf
    from tensorflow.keras import layers, models

    X_train_seq = X_train.reshape((X_train.shape[0], 1, n_features))
    X_val_seq = X_val.reshape((X_val.shape[0], 1, n_features))

    model = models.Sequential([
        layers.Input(shape=(1, n_features)),
        layers.LSTM(64, return_sequences=True),
        layers.LSTM(32),
        layers.Dense(16, activation="relu"),
        layers.Dense(1),
    ])
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="mse")
    es = tf.keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True)
    model.fit(X_train_seq, y_train, validation_data=(X_val_seq, y_val),
              epochs=50, batch_size=32, callbacks=[es], verbose=0)
    return model


def run(min_rows: int = 200, triggered_by: str = "manual"):
    logger.info("=== Running training pipeline ===")
    run_record = log_run_start(
        name="Daily Automated Model Training Job",
        run_type="model_training",
        triggered_by=triggered_by,
    )
    try:
        store = get_feature_store()
        df = store.read()

        if df.empty or len(df) < min_rows:
            raise RuntimeError(
                f"Not enough data to train ({len(df)} rows, need >= {min_rows}). "
                f"Run `python -m src.backfill --days 90` first."
            )

        results = _train_all_horizons(df)

        logger.info("=== Training pipeline complete ===")
        log_run_end(
            run_record, status="success", records_processed=len(df),
            extra_logs=[f"Trained on {len(df)} feature rows",
                        *[f"{h}: best={r['best_model']} rmse={r['metrics']['rmse']}" for h, r in results.items()]],
        )
        return results
    except Exception as e:  # noqa: BLE001
        log_run_end(run_record, status="failed", extra_logs=[f"Error: {e}"])
        raise


def _train_all_horizons(df: pd.DataFrame) -> dict:
    df = build_targets(df)
    feature_cols = get_available_features(df)

    results = {}

    for horizon_name in HORIZONS:
        target_col = f"target_{horizon_name}"
        data = df.dropna(subset=feature_cols + [target_col])
        if len(data) < 50:
            logger.warning("Skipping horizon %s - not enough rows (%d)", horizon_name, len(data))
            continue

        X = data[feature_cols].values
        y = data[target_col].values

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)
        X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.15, shuffle=False)

        scaler = StandardScaler().fit(X_train)
        X_train_s, X_val_s, X_test_s = scaler.transform(X_train), scaler.transform(X_val), scaler.transform(X_test)

        candidates = {}

        # ---- Random Forest ----
        rf = RandomForestRegressor(n_estimators=300, max_depth=12, random_state=42, n_jobs=-1)
        rf.fit(X_train, y_train)
        candidates["random_forest"] = (rf, evaluate(y_test, rf.predict(X_test)), "sklearn", None)

        # ---- Ridge Regression ----
        ridge = Ridge(alpha=1.0)
        ridge.fit(X_train_s, y_train)
        candidates["ridge"] = (ridge, evaluate(y_test, ridge.predict(X_test_s)), "sklearn", scaler)

        # ---- LSTM (TensorFlow) ----
        try:
            lstm = train_lstm(X_train_s, y_train, X_val_s, y_val, n_features=X_train_s.shape[1])
            X_test_seq = X_test_s.reshape((X_test_s.shape[0], 1, X_test_s.shape[1]))
            preds = lstm.predict(X_test_seq, verbose=0).flatten()
            candidates["lstm"] = (lstm, evaluate(y_test, preds), "keras", scaler)
        except Exception as e:  # noqa: BLE001
            logger.warning("LSTM training failed for horizon %s: %s", horizon_name, e)

        # pick best model by RMSE
        best_name, (best_model, best_metrics, framework, best_scaler) = min(
            candidates.items(), key=lambda kv: kv[1][1]["rmse"]
        )
        logger.info("Horizon %s -> best model: %s | metrics=%s", horizon_name, best_name, best_metrics)

        # Save EVERY trained candidate (not just the winner) so the dashboard's
        # "set active model" feature can genuinely swap between real trained
        # models, not just fake-toggle a label.
        for candidate_name, (cand_model, cand_metrics, cand_framework, cand_scaler) in candidates.items():
            candidate_dir_name = f"aqi_model_{horizon_name}__{candidate_name}"
            from src.model_registry import save_model_local
            save_model_local(cand_model, candidate_dir_name, cand_metrics, framework=cand_framework)
            if cand_scaler is not None:
                import joblib
                joblib.dump(cand_scaler, config.MODELS_DIR / candidate_dir_name / "scaler.joblib")

        model_registry_name = f"aqi_model_{horizon_name}"
        register_best_model(best_model, model_registry_name, best_metrics, framework=framework)
        from src.model_registry import set_active_candidate
        set_active_candidate(horizon_name, best_name)

        if best_scaler is not None:
            import joblib
            joblib.dump(best_scaler, config.MODELS_DIR / model_registry_name / "scaler.joblib")
            joblib.dump(best_scaler, config.MODELS_DIR / "production" / f"scaler_{horizon_name}.joblib")

        results[horizon_name] = {
            "best_model": best_name,
            "metrics": best_metrics,
            "all_candidates": {k: v[1] for k, v in candidates.items()},
            "feature_cols": feature_cols,
        }

    import json
    with open(config.MODELS_DIR / "training_report.json", "w") as f:
        json.dump(results, f, indent=2)

    return results


if __name__ == "__main__":
    run()
