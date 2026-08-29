# Pearls AQI Predictor

A 100% serverless machine learning system that forecasts Air Quality Index
(AQI) for **Karachi, Pakistan** for the next 3 days — real data collection,
feature engineering, model training, and a live dashboard, end to end.

---

## Architecture

```
┌───────────────────┐        ┌────────────────────────┐
│  React + Vite      │  HTTP  │  Flask REST API          │
│  frontend/          │◀──────▶│  python-backend/           │
│  (port 3000)         │        │  (port 5001)                 │
└───────────────────┘        └──────────────┬──────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
            AQICN / OpenWeather /     Hopsworks Feature       Trained models
            Open-Meteo APIs           Store (or local          (RandomForest,
            (live + historical         parquet fallback)        Ridge, XGboost)
            pollutant + weather                                 + SHAP
            data)
```

- **`python-backend/`** — Flask API, feature engineering, training pipeline,
  model registry, SHAP explainability, hazard alerts, GitHub Actions automation.
- **`frontend/`** — React + TypeScript + Vite dashboard that consumes the
  Flask API and nothing else. No mock data anywhere.

The system is serverless in the sense that neither the data pipelines nor the
API depend on an always-on application server of their own: the feature and
training pipelines run as independent, stateless jobs (locally or as GitHub
Actions runs on their own schedule), and the frontend is a static app that
simply calls the Flask API over HTTP whenever it's running.

---

## Technology stack

| Requirement | Used |
|---|---|
| Language | Python (backend), TypeScript (frontend) |
| ML models | scikit-learn (Random Forest, Ridge Regression), XGboost |
| Feature Store | Hopsworks (with a local-parquet fallback when no credentials are set) |
| Automation | GitHub Actions (hourly feature ingestion, daily retraining, manual backfill) |
| Web API | Flask |
| Data sources | AQICN, OpenWeather, Open-Meteo — all real, no synthetic data |
| Explainability | SHAP |
| Version control | Git / GitHub |
| Dashboard | React + Vite + TypeScript + Tailwind CSS |

---

## Features

1. **Home Dashboard** — live AQI, category, last-updated time
2. **3-Day Forecast** — day cards, chart and table views, hourly breakdown
3. **Weather Information** — temperature, humidity, wind speed, pressure
4. **24-Hour Trend Line Graph** — a dedicated, always-visible line chart on
   the home dashboard plotting AQI over the most recent 24 hours (pulled
   from `GET /api/aqi/history?days=1`, sampled hourly). Distinct from the
   longer-range Historical AQI Trends chart below, this view is meant for
   an at-a-glance read of short-term movement — is AQI currently trending
   up, down, or flat over the last day — rather than for exploring
   week/month-scale patterns. Hovering a point on the line shows the exact
   AQI value and timestamp for that hour; the graph auto-refreshes on the
   same hourly cadence as the rest of the dashboard.
5. **Historical AQI Trends** — interactive chart, filterable by 7 / 30 / 90 days
6. **Alerts** — color-coded AQI status, inline hazard warning banners, alert drawer
7. **Model Explanation** — real SHAP feature-importance breakdown per forecast day
8. **Model Performance** — RMSE / MAE / R² per model, last-trained date
9. **Extras** — hourly auto-refresh, CSV export of the 3-day forecast, responsive layout

### Live-reading data quality

The AQICN ground station for Karachi only reports a PM2.5 sensor and updates
on a multi-hour cycle, which previously caused two problems: missing
pollutant values reported as "0" instead of "no data," and repeated identical
hourly readings that would have taught the model a false flat pattern. Both
are addressed by making **Open-Meteo the primary source** for both live
readings and historical backfill (it has real values for all six pollutants
and updates hourly), with AQICN kept only as a secondary cross-check/fallback
and a staleness check that flags repeated identical readings.

This same staleness-aware, Open-Meteo-first data flow feeds the new 24-hour
trend line graph, so short-term movement shown on the home dashboard reflects
real hourly variation rather than a ground station repeating its last reading.

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- Free API keys: [AQICN token](https://aqicn.org/data-platform/token/),
  [OpenWeather key](https://openweathermap.org/api) (Open-Meteo needs no key)
- Optional: a [Hopsworks](https://app.hopsworks.ai) account for a real cloud
  feature store — otherwise a local parquet fallback is used automatically

## 1. Set up the backend

```bash
cd python-backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: AQICN_TOKEN, OPENWEATHER_API_KEY, CITY_NAME/LATITUDE/LONGITUDE,
# and (optional) HOPSWORKS_API_KEY / HOPSWORKS_PROJECT_NAME
```

Build the training dataset and train the models:
```bash
python -m src.backfill --days 730
python -m src.train_pipeline
```

Ingest one live hourly reading and start the API:
```bash
python -m src.feature_pipeline
python app/flask_api.py
# -> http://127.0.0.1:5001
```

Verify everything end to end before touching the frontend:
```bash
python tests/test_flask_api.py
```

## 2. Set up the frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
# -> http://localhost:3000
```

Vite's dev server proxies every `/api/*` request straight to the Flask
backend on port 5001 (see `frontend/vite.config.ts`) — no extra server layer
in between.

## 3. Automating it

`python-backend/.github/workflows/` contains three GitHub Actions workflows:

- **Hourly Feature Pipeline** — runs every hour, ingests one live reading.
  Resilient to transient Hopsworks Query Service outages: a local snapshot
  of the last successful read is cached across runs (via `actions/cache`)
  and served as a fallback if a read fails; if no snapshot is available
  either, the run is logged as "skipped" and exits cleanly rather than
  failing the CI job.
- **Daily Training Pipeline** — runs once a day, retrains all models. Also
  benefits from the same cached snapshot fallback on a Hopsworks read
  failure, but unlike the hourly job, an unrecoverable read failure here
  is intentionally left to fail loudly (CI job marked failed) so that a
  missed daily retrain is never silently absorbed.
- **Manual Backfill** — triggered on demand from the Actions tab, rebuilds
  the historical training dataset

Configure the same `.env` values as repository Secrets (API keys) and
Variables (city/location/project name) in GitHub, and they run on their own
schedule without any local machine needing to be on.

---

## Project structure

```
├── python-backend/
│   ├── app/flask_api.py          # REST API consumed by the frontend
│   ├── src/
│   │   ├── api_client.py          # AQICN / OpenWeather / Open-Meteo clients
│   │   ├── feature_engineering.py  # time, lag, rolling, derived features
│   │   ├── feature_store.py         # Hopsworks (or local parquet fallback)
│   │   ├── feature_pipeline.py       # hourly ingestion job
│   │   ├── backfill.py                # historical backfill job
│   │   ├── train_pipeline.py           # RF / Ridge / LSTM training + evaluation
│   │   ├── model_registry.py            # model storage + active-model switching
│   │   ├── predict.py                    # 3-day inference
│   │   ├── shap_explain.py                # SHAP feature importance
│   │   ├── alerts.py                       # hazardous AQI email/Slack alerts
│   │   ├── eda.py                           # exploratory data analysis helpers
│   │   └── run_logger.py                     # pipeline run history
│   ├── tests/test_flask_api.py
│   └── .github/workflows/                    # hourly / daily / manual automation
└── frontend/
    ├── vite.config.ts                # dev proxy -> Flask backend
    └── src/
        ├── App.tsx                    # top-level state + data orchestration
        ├── api.ts                      # all backend calls, centralized
        ├── types.ts                     # types matching the Flask JSON responses
        └── components/                   # Header, forecast, 24h trend graph,
                                            # feature store, model registry, SHAP,
                                            # alerts, historical trends
```

---

## API Reference

Base URL: `http://127.0.0.1:5001` (proxied through the frontend at `/api/*`).
All responses are JSON. Endpoints marked **POST** trigger a background job and
return immediately — re-fetch the related **GET** endpoint after a short
delay to see the result.

### Health

**`GET /api/health`**
```json
{ "status": "ok", "city": "karachi", "hopsworks": true }
```

### Current AQI

**`GET /api/aqi/current?city=Karachi&lat=24.8607&lon=67.0011&country=Pakistan`**

Primary source: Open-Meteo (all six pollutants). Falls back to AQICN +
OpenWeather if Open-Meteo is unavailable.

```json
{
  "city": "Karachi", "country": "Pakistan", "latitude": 24.8607, "longitude": 67.0011,
  "aqi": 92, "category": "Moderate", "primaryPollutant": "pm25",
  "timestamp": "2026-08-08T12:00:00+00:00",
  "pollutants": { "pm25": 42.0, "pm10": 58.0, "o3": 55, "no2": 18, "so2": 9, "co": 310 },
  "weather": { "temperature": 30.5, "humidity": 50, "windSpeed": 6.5, "windDirection": "SSW", "pressure": 1009, "precipitation": 0 }
}
```
`502` if both Open-Meteo and AQICN fail.

### 3-day forecast

**`GET /api/aqi/forecast?city=Karachi&lat=24.8607&lon=67.0011`**

Uses the trained Random Forest / Ridge / LSTM model for the configured city;
falls back to OpenWeather's real forecast API for any other city with no
custom-trained model.

```json
{
  "forecast": [
    {
      "date": "2026-08-09", "displayDate": "Tomorrow (Aug 9)", "dayOfWeek": "Sunday",
      "avgAQI": 88.4, "minAQI": 60, "maxAQI": 120, "category": "Moderate", "primaryPollutant": "pm25",
      "hourly": [
        {
          "time": "00:00", "fullTimestamp": "2026-08-09T00:00:00+00:00",
          "aqi": 75.2, "category": "Moderate", "pm25": 31.6, "pm10": 54.1,
          "temp": null, "humidity": null, "windSpeed": null,
          "confidenceLower": 67.2, "confidenceUpper": 83.2
        }
      ]
    }
  ],
  "modelTrained": true,
  "note": null
}
```

### 24-hour trend

**`GET /api/aqi/history?days=1`**

Powers the new 24-Hour Trend Line Graph on the home dashboard. Same shape as
the general Historical Trends endpoint below, but scoped to `days=1` so the
frontend gets exactly the last 24 hourly points to plot.

```json
{
  "days": 1,
  "points": [
    { "timestamp": "2026-08-08T13:00:00+00:00", "aqi": 90.0, "pm25": 41.2, "pm10": 57.1 },
    { "timestamp": "2026-08-08T14:00:00+00:00", "aqi": 91.5, "pm25": 41.8, "pm10": 57.9 }
  ],
  "count": 24
}
```

### SHAP explanation

**`GET /api/aqi/shap?city=Karachi&dayOffset=1`** (`dayOffset`: 1, 2, or 3)

```json
{
  "dayOffset": 1, "date": "2026-08-09", "predictedAQI": 92.1, "baseAQI": 95,
  "features": [
    {
      "feature": "aqi_lag_24h", "displayName": "24-Hour Prior AQI (Lag 24)",
      "value": 12.4, "shapValue": 12.4, "impact": "increases_aqi",
      "explanation": "Real SHAP mean |impact| of 12.4 AQI points on the 24h forecast, computed via random_forest model."
    }
  ],
  "modelTrained": true
}
```
`404` if no model is trained for the requested city:
```json
{ "error": "No custom-trained model for 'X'. ...", "modelTrained": false }
```

### Historical trends

**`GET /api/aqi/history?days=30`**
```json
{
  "days": 30,
  "points": [
    { "timestamp": "2026-07-09T00:00:00+00:00", "aqi": 88.2, "pm25": 40.1, "pm10": 55.0 }
  ],
  "count": 720
}
```

### Feature store

**`GET /api/feature-store`**
```json
{
  "featureViews": [
    {
      "name": "aqi_features", "version": 2, "entity": "karachi",
      "features": ["pm25", "pm10", "hour", "aqi_lag_1h", "..."],
      "onlineStoreEnabled": true, "ttlDays": 90,
      "recordCount": 16963, "lastIngested": "2026-08-08T12:00:00+00:00"
    }
  ],
  "sampleRecords": [
    {
      "featureId": "feat-karachi-1735732800", "entityId": "karachi",
      "timestamp": "2026-08-08T12:00:00+00:00", "hour": 12, "dayOfWeek": 2, "month": 8,
      "temp": 30.5, "humidity": 50, "windSpeed": 1.8, "pressure": 1009,
      "aqiLag1h": 90.1, "aqiLag24h": 88.4, "aqiChangeRate": 1.2,
      "pm25Ratio": 0.7, "windDispersionIndex": 0.36,
      "targetAQI24h": 92.1, "targetAQI48h": 85.0, "targetAQI72h": 80.2
    }
  ],
  "totalRecords": 16963,
  "backend": "Hopsworks"
}
```

**`POST /api/feature-store/backfill`** — body `{ "days": 730 }`
```json
{ "success": true, "message": "Backfill for 730 days started in the background." }
```

### Model registry

**`GET /api/model-registry`** — one entry per (candidate model × horizon)
```json
[
  {
    "modelId": "random_forest-24h", "name": "Random Forest Regressor (24h horizon)",
    "type": "Random Forest Regressor", "version": "1.0.0", "trainDate": "2026-08-08T03:00:00+00:00",
    "metrics": { "rmse": 12.4, "mae": 9.1, "r2": 0.81, "trainingTimeMs": 0 },
    "hyperparameters": {}, "featureImportances": [], "active": true
  }
]
```
`modelId` is always `{candidate}-{horizon}`, horizon is `24h`, `48h`, or `72h`.

**`POST /api/model-registry/train`** — body `{}`
```json
{ "success": true, "message": "Training pipeline started in the background." }
```

**`POST /api/model-registry/set-active`** — body `{ "modelId": "ridge-24h" }`

Returns the full updated array (same shape as `GET /api/model-registry`) on
success, or `404` if the candidate/horizon doesn't exist:
```json
{ "error": "Candidate 'ridge' for horizon '24h' was not found. It must have been trained first (run train_pipeline)." }
```

### Pipeline runs

**`GET /api/pipeline/runs`** — most recent 50 pipeline runs
```json
[
  {
    "id": "run-a1b2c3d4", "name": "Hourly Weather & Pollutant Ingestion",
    "type": "feature_ingestion", "status": "success",
    "startTime": "2026-08-08T12:00:00+00:00", "durationSeconds": 4.2,
    "recordsProcessed": 1, "triggeredBy": "scheduler",
    "logs": ["Started: Hourly Weather & Pollutant Ingestion", "Fetched live reading: AQI=92 at 2026-08-08 12:00:00+00:00", "Finished with status=success in 4.2s"]
  }
]
```

**`POST /api/pipeline/trigger`** — body `{ "type": "feature_ingestion" }` or `{ "type": "model_training" }`
```json
{ "success": true, "message": "Pipeline 'feature_ingestion' started in the background." }
```

---

- The feature group currently in use is `aqi_features` version 2 in Hopsworks
  (`python-backend/config.py` → `FEATURE_GROUP_VERSION`). Earlier versions
  are left in place as a safety net rather than deleted.
- If a value can't be verified from a real API response, the UI shows an
  explicit empty state rather than a placeholder number.
