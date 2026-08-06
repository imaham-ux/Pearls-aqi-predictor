"""
Central configuration for Pearls AQI Predictor.
Loads everything from environment variables / .env so no secret is hardcoded.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

DOTENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=DOTENV_PATH)

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
MODELS_DIR = ROOT_DIR / "models"
DATA_DIR.mkdir(exist_ok=True)
MODELS_DIR.mkdir(exist_ok=True)

# ---- APIs ----
AQICN_TOKEN = os.getenv("AQICN_TOKEN", "")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")

# ---- Location ----
CITY_NAME = os.getenv("CITY_NAME", "karachi")
LATITUDE = float(os.getenv("LATITUDE", "24.8607"))
LONGITUDE = float(os.getenv("LONGITUDE", "67.0011"))

# ---- Feature Store (Hopsworks) ----
HOPSWORKS_API_KEY = os.getenv("HOPSWORKS_API_KEY", "")
HOPSWORKS_PROJECT_NAME = os.getenv("HOPSWORKS_PROJECT_NAME", "")
USE_HOPSWORKS = bool(HOPSWORKS_API_KEY and HOPSWORKS_PROJECT_NAME)

FEATURE_GROUP_NAME = "aqi_features"
# v3: v2 got stuck in a broken storage state after repeated failed insert
# attempts (HdfsObjectStore "Failed to read ... result value -1" even on a
# fresh, small 2000-row chunk - not a size/network issue, the v2 group's
# underlying Delta table location itself never initialized correctly).
# Bumping to a clean version number gives us a fresh, never-touched feature
# group instead of continuing to fight a corrupted one.
FEATURE_GROUP_VERSION = 3
FEATURE_VIEW_NAME = "aqi_feature_view"

# ---- Alerts ----
ALERT_EMAIL_FROM = os.getenv("ALERT_EMAIL_FROM", "")
ALERT_EMAIL_TO = os.getenv("ALERT_EMAIL_TO", "")
ALERT_EMAIL_APP_PASSWORD = os.getenv("ALERT_EMAIL_APP_PASSWORD", "")
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")

# AQI hazard thresholds (US EPA style breakpoints, used for alerting)
AQI_LEVELS = [
    (0, 50, "Good", "#00e400"),
    (51, 100, "Moderate", "#ffff00"),
    (101, 150, "Unhealthy for Sensitive Groups", "#ff7e00"),
    (151, 200, "Unhealthy", "#ff0000"),
    (201, 300, "Very Unhealthy", "#8f3f97"),
    (301, 500, "Hazardous", "#7e0023"),
]

HAZARD_ALERT_THRESHOLD = 150  # trigger alerts at/above "Unhealthy"

LOOKBACK_HOURS_FOR_LAGS = 24
FORECAST_HORIZON_HOURS = 72  # 3 days