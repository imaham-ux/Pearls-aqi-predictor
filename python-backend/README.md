# 🌫️ Pearls AQI Predictor

# 🌫️ Pearls AQI Predictor — Python ML Backend

> **Note:** This backend now serves a React/TypeScript dashboard (in the parent
> folder) via `app/flask_api.py`. See the top-level `../README.md` for the full
> integrated setup (React frontend + this Python backend running together).
> Everything below still applies — it's the real ML engine either way.

A 100% serverless, end-to-end ML system that predicts a city's AQI for the next
3 days, built entirely on free-tier real APIs and serverless infra.


**This is a fully working codebase** — feature pipeline, backfill, training pipeline
(Random Forest + Ridge + LSTM), SHAP explainability, hazard alerts, and a Flask API
consumed by the React dashboard (see ../README.md). It was smoke-tested end-to-end (see `tests/test_pipeline_smoke.py`).
The only thing you need to add are your own **free** API keys (takes ~5 minutes).

---

## Architecture

```
┌─────────────────┐   hourly   ┌──────────────────┐        ┌─────────────────────┐
│  AQICN API       │──────────▶│ Feature Pipeline  │───────▶│  Feature Store       │
│  OpenWeather API │            │ (feature eng.)    │        │ (Hopsworks / local)  │
└─────────────────┘            └──────────────────┘        └──────────┬───────────┘
                                                                        │ daily
                                                                        ▼
┌─────────────────┐            ┌──────────────────┐        ┌─────────────────────┐
│ React Dashboard  │◀──────────│  predict.py       │◀───────│ Training Pipeline    │
│ (via Flask API)  │  serves   │  + SHAP explain    │  loads │ RF / Ridge / LSTM    │
└─────────────────┘            └──────────────────┘        └─────────────────────┘
                                                              ▼
                                                        Model Registry
                                                     (Hopsworks / local)
```

Automation: **GitHub Actions** runs the feature pipeline every hour and the
training pipeline every day — no servers to manage.

---

## 1. Get your free API keys (~5 minutes)

| Service | Used for | Get it here |
|---|---|---|
| **AQICN** | real-time ground-truth AQI readings | https://aqicn.org/data-platform/token/ (instant, free) |
| **OpenWeather** | weather + historical/forecast pollution | https://openweathermap.org/api (free tier, instant) |
| **Hopsworks** *(optional)* | serverless Feature Store + Model Registry | https://app.hopsworks.ai (free tier) |

> If you skip Hopsworks, the project **automatically falls back** to a local
> parquet-based feature store / model registry under `./data` and `./models`
> so everything still runs end-to-end for free, with zero extra setup.

## 2. Local setup

```bash
git clone <your-repo-url> pearls-aqi-predictor
cd pearls-aqi-predictor
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# now edit .env and paste in your AQICN_TOKEN and OPENWEATHER_API_KEY
```

Edit `CITY_NAME`, `LATITUDE`, `LONGITUDE` in `.env` to your city
(AQICN city slugs: https://aqicn.org/city/all/ — e.g. `karachi`, `lahore`, `delhi`, `beijing`).

## 3. Build the historical training dataset (one-time)

```bash
python -m src.backfill --days 120
```
Pulls ~120 days of real hourly historical air-pollution data from OpenWeather,
converts it to standard 0–500 AQI, engineers features, and writes it to the
feature store.

## 4. Train the models

```bash
python -m src.train_pipeline
```
Trains **Random Forest**, **Ridge Regression**, and an **LSTM (TensorFlow)** for
each forecast horizon (24h / 48h / 72h), evaluates with **RMSE / MAE / R²**,
and promotes the best model per horizon to the model registry.
Report saved at `models/training_report.json`.

## 5. Run the hourly feature pipeline manually (once, so "now" has data)

```bash
python -m src.feature_pipeline
```

## 6. Launch the API (consumed by the React dashboard)

```bash
python app/flask_api.py
# -> http://127.0.0.1:5001
```
Then, from the project root (one level up), run the React frontend:
```bash
cd ..
npm install && npm run dev
# -> http://localhost:3000
```
See `../README.md` for the full frontend setup.

## 7. Automate it (GitHub Actions)

Push this repo to GitHub, then in **Settings → Secrets and variables → Actions**:

**Secrets** (sensitive):
- `AQICN_TOKEN`
- `OPENWEATHER_API_KEY`
- `HOPSWORKS_API_KEY` *(optional)*

**Variables** (non-sensitive):
- `CITY_NAME`, `LATITUDE`, `LONGITUDE`
- `HOPSWORKS_PROJECT_NAME` *(optional)*

The two workflows in `.github/workflows/` will then run automatically:
- `feature_pipeline.yml` → every hour
- `training_pipeline.yml` → every day at 03:00 UTC

## 8. Deploy the dashboard for free

- Deploy `app/flask_api.py` (e.g. on Render, Railway, Fly.io, or a small VM) and
  point the React app's `FLASK_API_URL` env var at it; deploy the React app
  (e.g. Vercel, Netlify, or any Node host) separately.
- The feature/training pipelines keep running on GitHub Actions independently,
  continuously refreshing the feature store / model registry.

---

## Project structure

```
├── config.py                    # all settings, loaded from .env
├── src/
│   ├── api_client.py            # real AQICN + OpenWeather API calls
│   ├── feature_engineering.py   # time, lag, rolling, derived features
│   ├── feature_store.py         # Hopsworks (or local parquet fallback)
│   ├── feature_pipeline.py      # hourly job
│   ├── backfill.py              # historical backfill job
│   ├── train_pipeline.py        # RF / Ridge / LSTM + evaluation
│   ├── model_registry.py        # Hopsworks (or local) model registry
│   ├── predict.py               # 3-day inference
│   ├── shap_explain.py          # SHAP feature importance
│   ├── alerts.py                # hazardous AQI email/Slack alerts
│   └── eda.py                   # exploratory data analysis helpers
├── app/
│   └── flask_api.py             # REST API (consumed by the React dashboard)
├── .github/workflows/           # hourly + daily automation
└── tests/test_pipeline_smoke.py # offline end-to-end smoke test
```

## Verifying it works without waiting an hour

```bash
python tests/test_pipeline_smoke.py
```
This runs the **entire pipeline** (backfill → features → training → prediction
→ SHAP → alerts) against synthetic-but-realistic data by swapping only the
outward HTTP calls, so you can confirm every stage works before wiring up
real API keys / GitHub Actions.

## Notes on AQI conversion

AQICN already reports the standard 0–500 US EPA AQI directly. OpenWeather's
historical/forecast endpoints only return raw pollutant concentrations + a
coarse 1–5 index, so `api_client.owm_aqi_index_to_us_aqi()` converts PM2.5
concentrations into the same 0–500 AQI scale using official EPA breakpoints,
keeping backfilled history and live readings on one consistent target scale.
