"""
Advanced Analytics: SHAP-based feature importance / explanations for
whichever model is currently serving each forecast horizon.
"""
import logging
import joblib
import numpy as np
import pandas as pd
import shap

import config
from src.feature_store import get_feature_store
from src.train_pipeline import get_available_features

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("shap_explain")


def explain_model(horizon: str = "24h", n_background: int = 200):
    model_dir = config.MODELS_DIR / f"aqi_model_{horizon}"
    if not model_dir.exists():
        raise RuntimeError(f"No trained model found for horizon {horizon}. Run train_pipeline first.")

    framework = "keras" if (model_dir / "model.keras").exists() else "sklearn"
    scaler_path = model_dir / "scaler.joblib"
    scaler = joblib.load(scaler_path) if scaler_path.exists() else None

    store = get_feature_store()
    df = store.read()
    feature_cols = get_available_features(df)
    df = df.dropna(subset=feature_cols).tail(500)
    X = df[feature_cols].values
    X_in = scaler.transform(X) if scaler is not None else X

    background = X_in[np.random.choice(X_in.shape[0], min(n_background, X_in.shape[0]), replace=False)]

    if framework == "sklearn":
        model = joblib.load(model_dir / "model.joblib")
        if hasattr(model, "estimators_"):  # tree-based -> fast exact explainer
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_in)
        else:  # linear model
            explainer = shap.LinearExplainer(model, background)
            shap_values = explainer.shap_values(X_in)
    else:
        import tensorflow as tf
        model = tf.keras.models.load_model(model_dir / "model.keras")

        def f(x):
            x_seq = x.reshape((x.shape[0], 1, x.shape[1]))
            return model.predict(x_seq, verbose=0).flatten()

        explainer = shap.KernelExplainer(f, background)
        shap_values = explainer.shap_values(X_in[:100], nsamples=100)
        X_in = X_in[:100]

    mean_abs_shap = np.abs(shap_values).mean(axis=0)
    importance = pd.DataFrame({
        "feature": feature_cols,
        "mean_abs_shap": mean_abs_shap,
    }).sort_values("mean_abs_shap", ascending=False)

    return {
        "horizon": horizon,
        "framework": framework,
        "feature_importance": importance.to_dict(orient="records"),
        "shap_values": shap_values,
        "X": X_in,
        "feature_cols": feature_cols,
    }


if __name__ == "__main__":
    result = explain_model("24h")
    print(pd.DataFrame(result["feature_importance"]).head(15))
