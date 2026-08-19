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
from src.model_registry import load_feature_cols
from src.train_pipeline import get_available_features

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("shap_explain")


def _read_locally_cached_features() -> pd.DataFrame:
    """Load feature data for SHAP without waiting on the flaky Hopsworks
    remote-read service.

    The shared feature-store read against Hopsworks' Arrow Flight query service
    has been failing repeatedly ('End of TCP stream' / FlightUnavailableError),
    and the store's retry+backoff can block SHAP for minutes before (if ever)
    returning data.

    Prefer the locally-persisted snapshots:
      1. data/hopsworks_snapshot.parquet - REAL Hopsworks data cached from the
         last successful read.
      2. data/aqi_features.parquet       - the local feature-store parquet.

    Only if neither exists do we touch the shared (possibly remote-connected)
    store.
    """
    for path, label in (
        (config.DATA_DIR / "hopsworks_snapshot.parquet", "Hopsworks snapshot"),
        (config.DATA_DIR / "aqi_features.parquet", "local feature store"),
    ):
        if path.exists():
            df = pd.read_parquet(path)
            if not df.empty:
                logger.info("Loaded SHAP feature data from %s (%s): %d rows.", path, label, len(df))
                return df

    logger.warning("No local feature snapshot found - falling back to shared feature store (may be slow).")
    store = get_feature_store()
    df = store.read()
    if df is None or df.empty:
        raise RuntimeError("Feature store is empty. Run the backfill / feature pipeline first.")
    return df


def _resolve_model_dir(horizon: str):
    """Pick the model directory exactly the way src.predict.py does: honor the
    active-candidate pointer (models/{horizon}_active.txt) when it points to an
    existing candidate, otherwise fall back to the standard aqi_model_{horizon}
    folder. SHAP must explain the same model the dashboard actually serves."""
    from src.model_registry import get_active_candidate

    base_dir = config.MODELS_DIR / f"aqi_model_{horizon}"
    active = get_active_candidate(horizon)
    if active:
        candidate_dir = config.MODELS_DIR / f"aqi_model_{horizon}__{active}"
        if candidate_dir.exists():
            return candidate_dir
    return base_dir


def explain_model(horizon: str = "24h", n_background: int = 200):
    model_dir = _resolve_model_dir(horizon)
    if not model_dir.exists():
        raise RuntimeError(f"No trained model found for horizon {horizon}. Run train_pipeline first.")

    framework = "keras" if (model_dir / "model.keras").exists() else "sklearn"
    scaler_path = model_dir / "scaler.joblib"
    scaler = joblib.load(scaler_path) if scaler_path.exists() else None

    df = _read_locally_cached_features()

    # Use the EXACT feature columns this model was trained on (persisted at
    # training time). This prevents the "X has N features, but StandardScaler
    # is expecting M features" error when the feature store has since gained
    # new columns. Fall back to get_available_features() only for models saved
    # before feature-column persistence existed.
    feature_cols = load_feature_cols(model_dir)
    if feature_cols is None:
        feature_cols = get_available_features(df)

    # Safety net for models saved before feature-column persistence existed:
    # an older scaler may expect fewer features than the store now provides.
    # Trim to the scaler's expected width (same column order as training time)
    # so SHAP never crashes with "X has 36 features, but StandardScaler is
    # expecting 24 features as input."
    expected_n = getattr(scaler, "n_features_in_", None)
    if expected_n is not None and len(feature_cols) > expected_n:
        logger.warning(
            "Scaler on %s expects %d features but the store provides %d - "
            "trimming feature list to the scaler's expected width.",
            model_dir.name, expected_n, len(feature_cols),
        )
        feature_cols = list(feature_cols)[:expected_n]

    df = df.dropna(subset=feature_cols).tail(500)
    X = df[feature_cols].values
    X_in = scaler.transform(X) if scaler is not None else X

    # Only explain a manageable number of rows for performance.
    X_in = X_in[-100:]

    if framework == "sklearn":
        model = joblib.load(model_dir / "model.joblib")
        background = shap.sample(X_in, min(n_background, X_in.shape[0]))

        # shap.Explainer sometimes fails to auto-detect scikit-learn/XGBoost
        # estimators ("The passed model is not callable and cannot be analyzed
        # directly"), and shap.TreeExplainer fails on newer xgboost versions
        # because the model's serialized base_score is a bracketed string
        # (e.g. "[8.960338E1]") that this shap build can't float().
        #
        # Robust plan:
        #   * RandomForest  -> fast, exact shap.TreeExplainer.
        #   * XGBoost       -> generic Explainer over a callable
        #                      (model.predict), which works regardless of the
        #                      xgboost/shap version combination.
        #   * anything else -> generic Explainer.
        is_tree = False
        is_xgboost = False
        try:
            from sklearn.ensemble import RandomForestRegressor
            from xgboost import XGBRegressor

            is_tree = isinstance(model, RandomForestRegressor)
            is_xgboost = isinstance(model, XGBRegressor)
        except ImportError:  # pragma: no cover - one of the two is always installed
            pass

        if is_tree:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_in)
        else:
            fn = model.predict if is_xgboost else model
            explainer = shap.Explainer(fn, background, feature_names=feature_cols)
            shap_values = explainer(X_in).values
    else:
        import tensorflow as tf
        model = tf.keras.models.load_model(model_dir / "model.keras")

        def f(x):
            x = np.asarray(x, dtype=np.float32)
            x_seq = x.reshape((x.shape[0], 1, x.shape[1]))
            return model.predict(x_seq, verbose=0).flatten()

        background = shap.sample(X_in, min(n_background, X_in.shape[0]))
        explainer = shap.KernelExplainer(f, background)
        explain_sample_count = min(20, X_in.shape[0])
        shap_values = explainer.shap_values(X_in[:explain_sample_count], nsamples=50)
        if isinstance(shap_values, list):
            shap_values = np.array(shap_values[0])

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
