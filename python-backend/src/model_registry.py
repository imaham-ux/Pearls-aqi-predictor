"""
Model Registry abstraction - mirrors Hopsworks Model Registry, with a local
joblib/H5-based fallback under ./models so the project runs without an account.
"""
import json
import logging
import shutil
from pathlib import Path

import joblib

import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("model_registry")


def save_model_local(model, name: str, metrics: dict, framework: str = "sklearn"):
    model_dir = config.MODELS_DIR / name
    model_dir.mkdir(parents=True, exist_ok=True)

    if framework == "sklearn":
        joblib.dump(model, model_dir / "model.joblib")
    elif framework == "keras":
        model.save(model_dir / "model.keras")

    with open(model_dir / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    logger.info("Saved model '%s' (%s) locally -> %s | metrics=%s", name, framework, model_dir, metrics)
    return model_dir


def push_to_hopsworks_registry(local_model_dir: Path, name: str, metrics: dict, framework: str = "sklearn"):
    import hopsworks

    project = hopsworks.login(api_key_value=config.HOPSWORKS_API_KEY, project=config.HOPSWORKS_PROJECT_NAME)
    mr = project.get_model_registry()

    if framework == "sklearn":
        py_model = mr.python.create_model(name=name, metrics=metrics, description="AQI forecasting model")
    else:
        py_model = mr.python.create_model(name=name, metrics=metrics, description="AQI forecasting model (Keras)")

    py_model.save(str(local_model_dir))
    logger.info("Pushed model '%s' to Hopsworks Model Registry.", name)
    return py_model


def register_best_model(model, name: str, metrics: dict, framework: str = "sklearn"):
    local_dir = save_model_local(model, name, metrics, framework)
    if config.USE_HOPSWORKS:
        try:
            push_to_hopsworks_registry(local_dir, name, metrics, framework)
        except Exception as e:  # noqa: BLE001
            logger.warning("Could not push to Hopsworks registry (%s). Kept local copy only.", e)

    # also copy/symlink as the canonical "production" model used by predict.py
    prod_dir = config.MODELS_DIR / "production"
    if prod_dir.exists():
        shutil.rmtree(prod_dir)
    shutil.copytree(local_dir, prod_dir)
    with open(prod_dir / "framework.txt", "w") as f:
        f.write(framework)
    logger.info("Model '%s' promoted to production.", name)


def set_active_candidate(horizon: str, candidate_name: str) -> bool:
    """Point predict.py at a specific (already-trained-and-saved) candidate model
    for a given horizon. Returns True if the candidate exists and was activated."""
    candidate_dir = config.MODELS_DIR / f"aqi_model_{horizon}__{candidate_name}"
    if not candidate_dir.exists():
        return False
    pointer_file = config.MODELS_DIR / f"{horizon}_active.txt"
    pointer_file.write_text(candidate_name)
    logger.info("Horizon %s -> active candidate set to '%s'", horizon, candidate_name)
    return True


def get_active_candidate(horizon: str, default: str = None) -> str:
    pointer_file = config.MODELS_DIR / f"{horizon}_active.txt"
    if pointer_file.exists():
        return pointer_file.read_text().strip()
    return default
