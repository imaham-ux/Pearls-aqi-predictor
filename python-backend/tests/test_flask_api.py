import sys
import math
import random
from pathlib import Path
from datetime import datetime, timezone

sys.path.append(str(Path(__file__).resolve().parent.parent))

import config
from src import api_client

random.seed(1)


def fake_owm_history(start_unix, end_unix, lat=None, lon=None):
    rows = []
    t = start_unix
    while t <= end_unix:
        hour = datetime.utcfromtimestamp(t).hour
        base = 40 + 25 * math.sin((hour - 6) / 24 * 2 * math.pi) + random.gauss(0, 8)
        pm25 = max(5, base)
        rows.append({
            "timestamp": t, "owm_aqi_index": min(5, max(1, int(pm25 // 50) + 1)),
            "comp_co": 300 + random.gauss(0, 20), "comp_no2": 20 + random.gauss(0, 5),
            "comp_o3": 60 + random.gauss(0, 10), "comp_so2": 10 + random.gauss(0, 3),
            "comp_pm2_5": pm25, "comp_pm10": pm25 * 1.4, "comp_nh3": 5 + random.gauss(0, 1),
        })
        t += 3600
    return rows


def fake_owm_forecast(lat=None, lon=None):
    now = datetime.now(timezone.utc)
    rows = []
    for i in range(0, 96, 3):
        ts = now.timestamp() + i * 3600
        pm25 = 50 + 20 * math.sin(i / 12)
        rows.append({"timestamp": ts, "owm_aqi_index": 2, "comp_pm2_5": pm25, "comp_pm10": pm25 * 1.4})
    return rows


def fake_aqicn_current(city=None):
    return {
        "source": "aqicn", "aqi": 95, "station": city or "Test", "timestamp": datetime.now(timezone.utc).isoformat(),
        "pm25": 42.0, "pm10": 60.0, "o3": 55.0, "no2": 18.0, "so2": 9.0, "co": 310.0,
        "temperature": 29.0, "humidity": 55.0, "pressure": 1008.0, "wind": 2.1,
    }


def fake_owm_weather(lat=None, lon=None):
    return {"temp": 30.5, "humidity": 50, "pressure": 1009, "wind_speed": 1.8, "wind_deg": 200, "clouds": 20}


api_client.get_owm_air_pollution_history = fake_owm_history
api_client.get_owm_air_pollution_forecast = fake_owm_forecast
api_client.get_aqicn_current = fake_aqicn_current
api_client.get_owm_current_weather = fake_owm_weather

config.HOPSWORKS_API_KEY = ""
config.HOPSWORKS_PROJECT_NAME = ""
config.USE_HOPSWORKS = False

for p in [config.DATA_DIR / "aqi_features.parquet", config.DATA_DIR / "pipeline_runs.json"]:
    if p.exists():
        p.unlink()

print("[1/3] backfill...")
from src import backfill
backfill.run(days=100, triggered_by="test")

print("[2/3] train...")
from src import train_pipeline
train_pipeline.run(min_rows=200, triggered_by="test")

print("[3/3] testing Flask endpoints...")
from app.flask_api import app

client = app.test_client()

def check(name, resp, expect_status=200):
    ok = resp.status_code == expect_status
    print(f"  {'OK ' if ok else 'FAIL'} {name} -> {resp.status_code}")
    if not ok:
        print("     body:", resp.get_data(as_text=True)[:500])
    return resp.get_json()

check("GET /api/health", client.get("/api/health"))
check("GET /api/aqi/current (trained city)", client.get("/api/aqi/current?city=karachi&lat=24.86&lon=67.0&country=Pakistan"))
fc = check("GET /api/aqi/forecast (trained city)", client.get("/api/aqi/forecast?city=karachi&lat=24.86&lon=67.0"))
assert fc["modelTrained"] is True and len(fc["forecast"]) == 3
fc2 = check("GET /api/aqi/forecast (untrained city)", client.get("/api/aqi/forecast?city=lahore&lat=31.5&lon=74.3"))
assert fc2["modelTrained"] is False and len(fc2["forecast"]) == 3
check("GET /api/aqi/shap (trained city)", client.get("/api/aqi/shap?city=karachi&dayOffset=1"))
check("GET /api/aqi/shap (untrained city)", client.get("/api/aqi/shap?city=lahore&dayOffset=1"), expect_status=404)
check("GET /api/feature-store", client.get("/api/feature-store"))
check("GET /api/model-registry", client.get("/api/model-registry"))
check("GET /api/pipeline/runs", client.get("/api/pipeline/runs"))

print("\n✅ ALL FLASK ENDPOINTS RESPONDED CORRECTLY")
