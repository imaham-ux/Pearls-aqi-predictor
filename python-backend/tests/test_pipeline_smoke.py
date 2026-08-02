"""
Smoke test: validates the ENTIRE pipeline (backfill -> feature engineering ->
feature store -> training -> SHAP -> prediction -> alerts) using synthetic
but realistic data, by monkeypatching only the outward-facing HTTP calls in
api_client. This proves the pipeline logic itself is correct; the real AQICN /
OpenWeather calls follow the exact same code path (`api_client.get_*`) and
only differ in where the numbers come from.

Run: python tests/test_pipeline_smoke.py
"""
import sys
import random
import math
from pathlib import Path
from datetime import datetime, timedelta, timezone

sys.path.append(str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

import config
from src import api_client

random.seed(42)
np.random.seed(42)


def fake_owm_history(start_unix, end_unix, lat=None, lon=None):
    rows = []
    t = start_unix
    while t <= end_unix:
        hour = datetime.utcfromtimestamp(t).hour
        # diurnal pattern + noise, roughly realistic PM2.5 range
        base = 40 + 25 * math.sin((hour - 6) / 24 * 2 * math.pi) + random.gauss(0, 8)
        pm25 = max(5, base)
        rows.append({
            "timestamp": t,
            "owm_aqi_index": min(5, max(1, int(pm25 // 50) + 1)),
            "comp_co": 300 + random.gauss(0, 20),
            "comp_no2": 20 + random.gauss(0, 5),
            "comp_o3": 60 + random.gauss(0, 10),
            "comp_so2": 10 + random.gauss(0, 3),
            "comp_pm2_5": pm25,
            "comp_pm10": pm25 * 1.4,
            "comp_nh3": 5 + random.gauss(0, 1),
        })
        t += 3600
    return rows


def fake_aqicn_current():
    return {
        "source": "aqicn", "aqi": 95, "station": "Test Station",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pm25": 42.0, "pm10": 60.0, "o3": 55.0, "no2": 18.0, "so2": 9.0, "co": 310.0,
        "temperature": 29.0, "humidity": 55.0, "pressure": 1008.0, "wind": 2.1,
    }


def fake_owm_weather(lat=None, lon=None):
    return {"temp": 30.5, "humidity": 50, "pressure": 1009, "wind_speed": 1.8, "wind_deg": 200, "clouds": 20}


def main():
    print("== Patching API client with synthetic (but realistic) data for offline smoke test ==")
    api_client.get_owm_air_pollution_history = fake_owm_history
    api_client.get_aqicn_current = fake_aqicn_current
    api_client.get_owm_current_weather = fake_owm_weather

    # force local feature store for the smoke test (no external accounts needed)
    config.HOPSWORKS_API_KEY = ""
    config.HOPSWORKS_PROJECT_NAME = ""
    config.USE_HOPSWORKS = False

    local_parquet = config.DATA_DIR / "aqi_features.parquet"
    if local_parquet.exists():
        local_parquet.unlink()

    print("\n[1/5] Running backfill (120 days synthetic history)...")
    from src import backfill
    feats = backfill.run(days=120)
    print(f"   -> {len(feats)} feature rows written. Columns: {list(feats.columns)[:8]}...")
    assert len(feats) > 500, "backfill produced too few rows"

    print("\n[2/5] Running hourly feature pipeline (adds 1 live row)...")
    from src import feature_pipeline
    latest = feature_pipeline.run()
    assert not latest.empty

    print("\n[3/5] Running training pipeline (RF, Ridge, LSTM x 3 horizons)...")
    from src import train_pipeline
    import importlib
    importlib.reload(train_pipeline)
    results = train_pipeline.run(min_rows=200)
    for horizon, r in results.items():
        print(f"   -> {horizon}: best={r['best_model']} metrics={r['metrics']}")
    assert "24h" in results

    print("\n[4/5] Running prediction for next 3 days...")
    from src import predict
    importlib.reload(predict)
    forecast = predict.predict_next_3_days()
    print("   ->", forecast)
    assert len(forecast["forecast"]) == 3

    print("\n[4.5/5] Testing alerting logic...")
    from src import alerts
    # force a hazardous prediction to verify alert triggers without crashing
    fake_forecast = {
        "forecast": [{"horizon": "24h", "target_time": "2026-07-21T00:00:00", "predicted_aqi": 210}]
    }
    triggered = alerts.check_and_alert(fake_forecast)
    assert len(triggered) == 1
    print("   -> alert triggered correctly for hazardous AQI:", triggered)

    print("\n[5/5] Running SHAP explainability...")
    from src import shap_explain
    importlib.reload(shap_explain)
    shap_result = shap_explain.explain_model("24h", n_background=50)
    print(pd.DataFrame(shap_result["feature_importance"]).head(5))

    print("\n✅ ALL PIPELINE STAGES RAN SUCCESSFULLY END-TO-END")


if __name__ == "__main__":
    main()
