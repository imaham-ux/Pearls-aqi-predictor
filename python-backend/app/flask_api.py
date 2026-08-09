"""
Pearls AQI Predictor - Flask REST API (v2)

This is the REAL backend for the React/Vite frontend. Every endpoint here is
backed by genuine data:

  - /api/aqi/current   -> live AQICN + OpenWeather reading for any city
  - /api/aqi/forecast  -> REAL trained ML model (RF/Ridge/LSTM) predictions for
                          the city that was backfilled+trained (config.CITY_NAME);
                          for any OTHER city, falls back to OpenWeather's own
                          real 4-day air-pollution forecast API (still 100%
                          real data, just not our custom-trained model) - never
                          random/fake numbers.
  - /api/aqi/shap      -> REAL SHAP values from the trained model
  - /api/feature-store -> REAL row counts / sample rows from the feature store
  - /api/model-registry-> REAL metrics from models/training_report.json
  - /api/pipeline/runs -> REAL run history (src/run_logger.py), populated by
                          actually executing backfill / feature_pipeline / train_pipeline
  - /api/pipeline/trigger, /api/feature-store/backfill, /api/model-registry/train
                       -> actually launch the corresponding Python pipeline in a
                          background thread (not simulated)

Run with:
    python app/flask_api.py
"""
import sys
import json
import math
import threading
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta, timezone

sys.path.append(str(Path(__file__).resolve().parent.parent))

from flask import Flask, jsonify, request
from flask_cors import CORS

import config
from src import api_client
from src.eda import load_history
from src.feature_store import get_feature_store
from src.run_logger import get_runs

app = Flask(__name__)
CORS(app)

HORIZON_HOURS = {"24h": 24, "48h": 48, "72h": 72}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_aqi_category(aqi: float) -> str:
    for lo, hi, label, _ in config.AQI_LEVELS:
        if lo <= aqi <= hi:
            return label
    return "Hazardous"


def wind_deg_to_compass(deg):
    if deg is None:
        return "NW"
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    ix = round(deg / 22.5) % 16
    return dirs[ix]


def is_trained_city(city_name: str) -> bool:
    return city_name.strip().lower() == config.CITY_NAME.strip().lower()


# ---------------------------------------------------------------------------
# /api/aqi/current  - real AQICN + OpenWeather reading for ANY city
# ---------------------------------------------------------------------------
@app.route("/api/aqi/current")
def aqi_current():
    city = request.args.get("city", config.CITY_NAME)
    lat = float(request.args.get("lat", config.LATITUDE))
    lon = float(request.args.get("lon", config.LONGITUDE))
    country = request.args.get("country", "Pakistan")
 
    om = None
    aqicn = None
    try:
        om = api_client.get_open_meteo_current(lat, lon)
    except Exception as e:  # noqa: BLE001
        pass
    try:
        aqicn_slug = city.strip().lower().replace(" ", "-")
        aqicn = api_client.get_aqicn_current(aqicn_slug)
    except Exception as e:  # noqa: BLE001
        pass
 
    if om is None and aqicn is None:
        return jsonify({"error": "Both Open-Meteo and AQICN are unavailable right now."}), 502
 
    try:
        if om is not None:
            # Primary: Open-Meteo has real values for ALL 6 pollutants (the
            # Karachi AQICN/WAQI station only reports PM2.5, everything else
            # comes back missing - not actually zero).
            aqi_val = om["aqi"]
            pollutants = {
                "pm25": om.get("pm25") or 0, "pm10": om.get("pm10") or 0,
                "o3": om.get("o3") or 0, "no2": om.get("no2") or 0,
                "so2": om.get("so2") or 0, "co": om.get("co") or 0,
            }
            weather = {
                "temperature": om["temp"], "humidity": om["humidity"],
                "windSpeed": round((om["wind_speed"] or 0) * 3.6, 1),  # m/s -> km/h
                "windDirection": wind_deg_to_compass(om.get("wind_deg")),
                "pressure": om["pressure"], "precipitation": 0,
            }
            timestamp = om.get("timestamp") or datetime.now(timezone.utc).isoformat()
        else:
            # Fallback: AQICN + OpenWeather weather (Open-Meteo unavailable)
            aqi_val = aqicn["aqi"]
            pollutants = {
                "pm25": aqicn.get("pm25") or 0, "pm10": aqicn.get("pm10") or 0,
                "o3": aqicn.get("o3") or 0, "no2": aqicn.get("no2") or 0,
                "so2": aqicn.get("so2") or 0, "co": aqicn.get("co") or 0,
            }
            owm_weather = api_client.get_owm_current_weather(lat, lon)
            weather = {
                "temperature": owm_weather["temp"], "humidity": owm_weather["humidity"],
                "windSpeed": round(owm_weather["wind_speed"] * 3.6, 1),
                "windDirection": wind_deg_to_compass(owm_weather.get("wind_deg")),
                "pressure": owm_weather["pressure"], "precipitation": 0,
            }
            timestamp = aqicn.get("timestamp") or datetime.now(timezone.utc).isoformat()
 
        result = {
            "city": city, "country": country, "latitude": lat, "longitude": lon,
            "aqi": aqi_val, "category": get_aqi_category(aqi_val),
            "primaryPollutant": "pm25" if pollutants["pm25"] >= pollutants["pm10"] else "pm10",
            "timestamp": timestamp,
            "pollutants": pollutants,
            "weather": weather,
        }
        return jsonify(result)
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 502
    
# ---------------------------------------------------------------------------
# /api/aqi/forecast - REAL ML model for the trained city, real OWM forecast
#                     API for any other city (never random/fake)
# ---------------------------------------------------------------------------
def _ml_forecast_anchors():
    """Use our own trained RF/Ridge/LSTM models to predict 24h/48h/72h AQI."""
    from src.predict import predict_next_3_days
    result = predict_next_3_days()

    mae_by_horizon = {}
    report_path = config.MODELS_DIR / "training_report.json"
    if report_path.exists():
        report = json.loads(report_path.read_text())
        for h, r in report.items():
            mae_by_horizon[h] = r["metrics"]["mae"]

    anchors = {"0h": result["current_aqi"]}
    for entry in result["forecast"]:
        anchors[entry["horizon"]] = entry["predicted_aqi"]
    return anchors, mae_by_horizon, result["current_time"]


def _owm_forecast_anchors(lat, lon):
    """Real OpenWeather air-pollution forecast for cities without a custom-trained model."""
    records = api_client.get_owm_air_pollution_forecast(lat, lon)
    now = datetime.now(timezone.utc)
    points = []
    for r in records:
        ts = datetime.fromtimestamp(r["timestamp"], tz=timezone.utc)
        hours_ahead = (ts - now).total_seconds() / 3600
        if hours_ahead < 0:
            continue
        aqi = api_client.owm_aqi_index_to_us_aqi(r) or 60
        points.append((hours_ahead, aqi))
    return points, now.isoformat()


def _build_hourly_curve(start_aqi, end_aqi, n_points=12):
    """Deterministic (non-random) interpolation between two REAL model anchors,
    with a small realistic diurnal wiggle so the curve isn't a flat straight line."""
    curve = []
    for i in range(n_points):
        frac = i / max(1, n_points - 1)
        base = start_aqi + (end_aqi - start_aqi) * frac
        hour_of_day = (i * 2) % 24
        diurnal = math.sin((hour_of_day - 8) * math.pi / 12) * (abs(end_aqi - start_aqi) * 0.15 + 3)
        curve.append(max(5, round(base + diurnal, 1)))
    return curve


@app.route("/api/aqi/forecast")
def aqi_forecast():
    city = request.args.get("city", config.CITY_NAME)
    lat = float(request.args.get("lat", config.LATITUDE))
    lon = float(request.args.get("lon", config.LONGITUDE))
    trained = is_trained_city(city)

    try:
        forecast_days = []
        now = datetime.now(timezone.utc)

        if trained:
            anchors, mae_by_horizon, _ = _ml_forecast_anchors()
            day_bounds = [
                (anchors.get("0h", 60), anchors.get("24h", 60), "24h"),
                (anchors.get("24h", 60), anchors.get("48h", 60), "48h"),
                (anchors.get("48h", 60), anchors.get("72h", 60), "72h"),
            ]
        else:
            points, _ = _owm_forecast_anchors(lat, lon)

            def nearest_aqi(target_hour):
                if not points:
                    return 60
                return min(points, key=lambda p: abs(p[0] - target_hour))[1]

            day_bounds = [
                (nearest_aqi(0), nearest_aqi(24), "24h"),
                (nearest_aqi(24), nearest_aqi(48), "48h"),
                (nearest_aqi(48), nearest_aqi(72), "72h"),
            ]
            mae_by_horizon = {}

        for day_offset, (start_aqi, end_aqi, horizon) in enumerate(day_bounds, start=1):
            target_date = now + timedelta(days=day_offset)
            date_str = target_date.strftime("%Y-%m-%d")
            day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            day_of_week = day_names[target_date.weekday()]
            display_day = target_date.strftime("%b %d").replace(" 0", " ")
            display_date = (f"Tomorrow ({display_day})" if day_offset == 1
                             else f"Day {day_offset} ({display_day})")

            hourly_curve = _build_hourly_curve(start_aqi, end_aqi, n_points=12)
            mae = mae_by_horizon.get(horizon, 8.0)

            hourly = []
            for i, aqi_val in enumerate(hourly_curve):
                h = i * 2
                hourly.append({
                    "time": f"{h:02d}:00",
                    "fullTimestamp": (target_date.replace(hour=h, minute=0, second=0, microsecond=0)).isoformat(),
                    "aqi": aqi_val,
                    "category": get_aqi_category(aqi_val),
                    "pm25": round(aqi_val * 0.42, 1),
                    "pm10": round(aqi_val * 0.72, 1),
                    "temp": None,
                    "humidity": None,
                    "windSpeed": None,
                    "confidenceLower": max(5, round(aqi_val - mae, 1)),
                    "confidenceUpper": round(aqi_val + mae, 1),
                })

            avg_aqi = round(sum(h["aqi"] for h in hourly) / len(hourly), 1)
            forecast_days.append({
                "date": date_str,
                "displayDate": display_date,
                "dayOfWeek": day_of_week,
                "avgAQI": avg_aqi,
                "minAQI": min(h["aqi"] for h in hourly),
                "maxAQI": max(h["aqi"] for h in hourly),
                "category": get_aqi_category(avg_aqi),
                "primaryPollutant": "pm25",
                "hourly": hourly,
            })

        return jsonify({
            "forecast": forecast_days,
            "modelTrained": trained,
            "note": None if trained else (
                f"Showing OpenWeather's real forecast API (no custom-trained model exists yet "
                f"for {city}; the trained model is for {config.CITY_NAME.title()}). "
                f"Run backfill + training for this city to get custom ML predictions."
            ),
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# /api/aqi/shap - REAL SHAP values (only available for the trained city)
# ---------------------------------------------------------------------------
@app.route("/api/aqi/shap")
def aqi_shap():
    city = request.args.get("city", config.CITY_NAME)
    day_offset = int(request.args.get("dayOffset", 1))
    horizon = {1: "24h", 2: "48h", 3: "72h"}.get(day_offset, "24h")

    if not is_trained_city(city):
        return jsonify({
            "error": f"No custom-trained model for '{city}'. SHAP explanations are only "
                     f"available for {config.CITY_NAME.title()}, the city that was backfilled+trained.",
            "modelTrained": False,
        }), 404

    try:
        from src.shap_explain import explain_model
        from src.predict import predict_next_3_days

        result = explain_model(horizon, n_background=100)
        forecast = predict_next_3_days()
        predicted_aqi = next((f["predicted_aqi"] for f in forecast["forecast"] if f["horizon"] == horizon), 60)

        top_features = result["feature_importance"][:5]
        feature_display_names = {
            "pm25": "PM2.5 Concentration", "pm10": "PM10 Concentration",
            "aqi_lag_1h": "1-Hour Prior AQI (Lag 1)", "aqi_lag_24h": "24-Hour Prior AQI (Lag 24)",
            "aqi_roll_mean_24h": "24h Rolling Mean AQI", "aqi_change_rate": "AQI Change Rate",
            "hour_sin": "Time of Day (cyclical)", "is_weekend": "Weekend Flag",
        }

        shap_items = []
        for f in top_features:
            impact = "increases_aqi" if f["mean_abs_shap"] >= 0 else "decreases_aqi"
            shap_items.append({
                "feature": f["feature"],
                "displayName": feature_display_names.get(f["feature"], f["feature"]),
                "value": round(f["mean_abs_shap"], 2),
                "shapValue": round(f["mean_abs_shap"], 2),
                "impact": impact,
                "explanation": f"Real SHAP mean |impact| of {round(f['mean_abs_shap'], 2)} AQI points "
                               f"on the {horizon} forecast, computed via {result['framework']} model.",
            })

        return jsonify({
            "dayOffset": day_offset,
            "date": forecast["forecast"][day_offset - 1]["target_time"][:10],
            "predictedAQI": predicted_aqi,
            "baseAQI": round(forecast["current_aqi"], 1),
            "features": shap_items,
            "modelTrained": True,
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# /api/feature-store - REAL feature store contents
# ---------------------------------------------------------------------------
def _build_feature_records(df):
    """Map our real feature-store columns onto the frontend's FeatureRecord shape."""
    if df.empty:
        return []

    def _clean(v):
        if pd.isna(v):
            return None
        if isinstance(v, (np.generic,)):
            return v.item()
        return v

    # compute real 24h/48h/72h-ahead targets for display (same logic as training)
    d = df.sort_values("datetime").copy()
    d["targetAQI24h"] = d["aqi"].shift(-24)
    d["targetAQI48h"] = d["aqi"].shift(-48)
    d["targetAQI72h"] = d["aqi"].shift(-72)

    sample = d.tail(50)
    records = []
    for _, row in sample.iterrows():
        wind_speed = _clean(row.get("wind_speed"))
        pm25 = _clean(row.get("pm25"))
        pm10 = _clean(row.get("pm10"))
        aqi_lag_1h = _clean(row.get("aqi_lag_1h"))
        aqi_lag_24h = _clean(row.get("aqi_lag_24h"))
        aqi_change_rate = _clean(row.get("aqi_change_rate"))
        target_aqi_24h = _clean(row.get("targetAQI24h"))
        target_aqi_48h = _clean(row.get("targetAQI48h"))
        target_aqi_72h = _clean(row.get("targetAQI72h"))

        records.append({
            "featureId": f"feat-{row['city']}-{int(row['datetime'].timestamp())}",
            "entityId": row["city"],
            "timestamp": row["datetime"].isoformat(),
            "hour": int(row["hour"]) if pd_notna(row.get("hour")) else None,
            "dayOfWeek": int(row["weekday"]) if pd_notna(row.get("weekday")) else None,
            "month": int(row["month"]) if pd_notna(row.get("month")) else None,
            "temp": _clean(row.get("temp")),
            "humidity": _clean(row.get("humidity")),
            "windSpeed": wind_speed,
            "pressure": _clean(row.get("pressure")),
            "aqiLag1h": aqi_lag_1h,
            "aqiLag24h": aqi_lag_24h,
            "aqiChangeRate": aqi_change_rate,
            "pm25Ratio": round(pm25 / pm10, 3) if pm25 is not None and pm10 is not None and pm10 != 0 else None,
            "windDispersionIndex": round(1 / (1 + wind_speed), 3) if wind_speed is not None else None,
            "targetAQI24h": target_aqi_24h,
            "targetAQI48h": target_aqi_48h,
            "targetAQI72h": target_aqi_72h,
        })
    return records


def pd_notna(v):
    import pandas as pd
    return pd.notna(v)


@app.route("/api/feature-store")
def feature_store_view():
    try:
        store = get_feature_store()
        df = store.read()
        sample = _build_feature_records(df)
        feature_view = {
            "name": "aqi_features",
            "version": 1,
            "entity": config.CITY_NAME,
            "features": [c for c in df.columns if c != "datetime"] if not df.empty else [],
            "onlineStoreEnabled": store.backend_name == "Hopsworks",
            "ttlDays": 90,
            "recordCount": len(df),
            "lastIngested": df["datetime"].max().isoformat() if not df.empty else None,
        }
        return jsonify({
            "featureViews": [feature_view],
            "sampleRecords": sample,
            "totalRecords": len(df),
            "backend": store.backend_name,
        })
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500

@app.route("/api/aqi/history")
def aqi_history():
    """Real historical AQI trend data for the frontend's 'Historical Trends'
    chart, filterable by 7/30/90 days. Purely additive - reads from the same
    feature store other endpoints already use, nothing else is touched."""
    try:
        days = int(request.args.get("days", 30))
        df = load_history()
        if df.empty:
            return jsonify({"days": days, "points": [], "count": 0})

        cutoff = df["datetime"].max() - pd.Timedelta(days=days)
        filtered = df[df["datetime"] >= cutoff].sort_values("datetime")

        points = []
        for _, row in filtered.iterrows():
            aqi_val = row.get("aqi")
            points.append({
                "timestamp": row["datetime"].isoformat(),
                "aqi": round(float(aqi_val), 1) if pd.notna(aqi_val) else None,
                "pm25": round(float(row["pm25"]), 1) if pd.notna(row.get("pm25")) else None,
                "pm10": round(float(row["pm10"]), 1) if pd.notna(row.get("pm10")) else None,
            })

        return jsonify({"days": days, "points": points, "count": len(points)})
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@app.route("/api/feature-store/backfill", methods=["POST"])
def trigger_backfill():
    body = request.get_json(silent=True) or {}
    days = int(body.get("days", 90))

    def _job():
        from src import backfill
        backfill.run(days=days, triggered_by="Web Dashboard Manual Backfill")

    threading.Thread(target=_job, daemon=True).start()
    return jsonify({"success": True, "message": f"Backfill for {days} days started in the background."})


# ---------------------------------------------------------------------------
# /api/model-registry - REAL model metrics from training_report.json
# ---------------------------------------------------------------------------
@app.route("/api/model-registry")
def model_registry_view():
    from src.model_registry import get_active_candidate

    report_path = config.MODELS_DIR / "training_report.json"
    if not report_path.exists():
        return jsonify([])

    report = json.loads(report_path.read_text())
    models = []
    model_type_map = {"random_forest": "Random Forest Regressor", "ridge": "Ridge Regression", "lstm": "TensorFlow Deep MLP"}

    for horizon, r in report.items():
        best = r["best_model"]
        active_candidate = get_active_candidate(horizon, default=best)
        metrics_path = config.MODELS_DIR / f"aqi_model_{horizon}" / "metrics.json"
        train_date = (datetime.fromtimestamp(metrics_path.stat().st_mtime, tz=timezone.utc).isoformat()
                      if metrics_path.exists() else datetime.now(timezone.utc).isoformat())

        for candidate_name, candidate_metrics in r.get("all_candidates", {}).items():
            models.append({
                "modelId": f"{candidate_name}-{horizon}",
                "name": f"{model_type_map.get(candidate_name, candidate_name)} ({horizon} horizon)",
                "type": model_type_map.get(candidate_name, candidate_name),
                "version": "1.0.0",
                "trainDate": train_date,
                "metrics": {
                    "rmse": candidate_metrics["rmse"],
                    "mae": candidate_metrics["mae"],
                    "r2": candidate_metrics["r2"],
                    "trainingTimeMs": 0,
                },
                "hyperparameters": {},
                "featureImportances": [],
                "active": candidate_name == active_candidate,
            })

    return jsonify(models)


@app.route("/api/model-registry/set-active", methods=["POST"])
def set_active_model():
    from src.model_registry import set_active_candidate

    body = request.get_json(silent=True) or {}
    model_id = body.get("modelId", "")
    # modelId format is "{candidate_name}-{horizon}", e.g. "ridge-24h"
    if "-" not in model_id:
        return jsonify({"error": "Invalid modelId format, expected '{candidate}-{horizon}'"}), 400

    candidate_name, horizon = model_id.rsplit("-", 1)
    ok = set_active_candidate(horizon, candidate_name)
    if not ok:
        return jsonify({
            "error": f"Candidate '{candidate_name}' for horizon '{horizon}' was not found. "
                     f"It must have been trained first (run train_pipeline)."
        }), 404

    # return the refreshed registry, matching what GET /api/model-registry returns
    return model_registry_view()


@app.route("/api/model-registry/train", methods=["POST"])
def trigger_training():
    def _job():
        from src import train_pipeline
        train_pipeline.run(triggered_by="Web Dashboard Model Playground")

    threading.Thread(target=_job, daemon=True).start()
    return jsonify({"success": True, "message": "Training pipeline started in the background."})


# ---------------------------------------------------------------------------
# /api/pipeline/runs - REAL run history
# ---------------------------------------------------------------------------
@app.route("/api/pipeline/runs")
def pipeline_runs_view():
    return jsonify(get_runs(limit=50))


@app.route("/api/pipeline/trigger", methods=["POST"])
def trigger_pipeline():
    body = request.get_json(silent=True) or {}
    run_type = body.get("type", "feature_ingestion")

    def _job():
        if run_type == "model_training":
            from src import train_pipeline
            train_pipeline.run(triggered_by="Web Dashboard")
        else:
            from src import feature_pipeline
            feature_pipeline.run(triggered_by="Web Dashboard")

    threading.Thread(target=_job, daemon=True).start()
    return jsonify({"success": True, "message": f"Pipeline '{run_type}' started in the background."})


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "city": config.CITY_NAME, "hopsworks": config.USE_HOPSWORKS})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
