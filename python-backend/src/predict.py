"""
Real-time prediction: loads production models + latest features from the
Feature Store and produces a 3-day (24h/48h/72h) AQI forecast.
"""
import json
import logging
import joblib
import numpy as np
import pandas as pd

import config
from src.feature_store import get_feature_store
from src.model_registry import load_feature_cols
from src.train_pipeline import get_available_features, build_targets

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("predict")

HORIZONS = ["24h", "48h", "72h"]


def load_production_model(horizon: str):
    model_dir = config.MODELS_DIR / "production"
    framework_file = model_dir / "framework.txt"
    if not framework_file.exists():
        raise RuntimeError("No production model found. Run `python -m src.train_pipeline` first.")

    framework = framework_file.read_text().strip()
    scaler_path = model_dir / f"scaler_{horizon}.joblib"
    scaler = joblib.load(scaler_path) if scaler_path.exists() else None

    if framework == "sklearn":
        model = joblib.load(model_dir / "model.joblib")
    else:
        import tensorflow as tf
        model = tf.keras.models.load_model(model_dir / "model.keras")

    return model, framework, scaler


def get_latest_feature_row() -> pd.Series:
    store = get_feature_store()
    df = store.read()
    if df.empty:
        raise RuntimeError("Feature store is empty. Run the feature pipeline / backfill first.")
    df = df.sort_values("datetime")
    return df.iloc[-1]


def predict_next_3_days() -> dict:
    latest = get_latest_feature_row()

    forecasts = {}
    for horizon in HORIZONS:
        try:
            model_name = f"aqi_model_{horizon}"
            model, framework, scaler, feature_cols = _load_named_model(model_name)

            X = latest[feature_cols].values.reshape(1, -1).astype(float)
            X_in = scaler.transform(X) if scaler is not None else X

            if framework == "keras":
                X_in = X_in.reshape((1, 1, X_in.shape[1]))
                pred = float(model.predict(X_in, verbose=0).flatten()[0])
            else:
                pred = float(model.predict(X_in)[0])

            forecasts[horizon] = round(pred, 1)
        except Exception as e:  # noqa: BLE001
            logger.warning("Prediction failed for horizon %s: %s", horizon, e)
            forecasts[horizon] = None

    base_time = pd.to_datetime(latest["datetime"])
    result = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "current_aqi": float(latest["aqi"]),
        "current_time": base_time.isoformat(),
        "forecast": [
            {
                "horizon": h,
                "target_time": (base_time + pd.Timedelta(hours=int(h.replace('h', '')))).isoformat(),
                "predicted_aqi": forecasts[h],
            }
            for h in HORIZONS
        ],
    }
    return result


def _load_named_model(model_name):
    """model_name is 'aqi_model_{horizon}'. Loads whichever candidate is currently
    marked active for that horizon (defaults to the best-by-RMSE one from training)."""
    import tensorflow as tf
    from src.model_registry import get_active_candidate

    horizon = model_name.replace("aqi_model_", "")
    active_candidate = get_active_candidate(horizon)

    if active_candidate:
        candidate_dir = config.MODELS_DIR / f"{model_name}__{active_candidate}"
        if candidate_dir.exists():
            model_dir = candidate_dir
        else:
            model_dir = config.MODELS_DIR / model_name
    else:
        model_dir = config.MODELS_DIR / model_name

    framework = "keras" if (model_dir / "model.keras").exists() else "sklearn"
    scaler_path = model_dir / "scaler.joblib"
    scaler = joblib.load(scaler_path) if scaler_path.exists() else None
    if framework == "keras":
        model = tf.keras.models.load_model(model_dir / "model.keras")
    else:
        model = joblib.load(model_dir / "model.joblib")

    # Use the EXACT feature columns this model was trained on (persisted at
    # training time). Fall back to get_available_features() only for models
    # saved before feature-column persistence existed.
    feature_cols = load_feature_cols(model_dir)
    if feature_cols is None:
        feature_cols = get_available_features(pd.DataFrame([get_latest_feature_row()]))
    return model, framework, scaler, feature_cols


if __name__ == "__main__":
    print(json.dumps(predict_next_3_days(), indent=2))
