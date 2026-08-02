# 🌫️ Pearls AQI Predictor

A 3-day Air Quality Index forecasting app for Pakistani cities, combining:

- **React + TypeScript + Vite** frontend (dashboard UI, Gemini-powered health advisor)
- **Python ML backend** (real AQICN + OpenWeather APIs, scikit-learn + TensorFlow models,
  SHAP explainability, Hopsworks feature store / local fallback)

**Every number on this dashboard is real** — live AQI comes from AQICN, weather from
OpenWeather, 3-day forecasts come from actually-trained Random Forest / Ridge / LSTM
models (evaluated with RMSE/MAE/R²), and SHAP values are computed from those real
models. Nothing is randomly generated.

---

## Architecture

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  React/Vite Frontend    │  HTTP  │  Node/Express (server.ts) │
│  (port 3000, npm run dev)│◀──────▶│  - serves the UI           │
└─────────────────────────┘        │  - proxies /api/* to Flask │
                                    │  - calls Gemini for advice │
                                    └────────────┬──────────────┘
                                                 │ HTTP (proxy)
                                                 ▼
                                   ┌──────────────────────────┐
                                   │  Flask API (python-backend)│
                                   │  port 5001                 │
                                   │  - AQICN + OpenWeather      │
                                   │  - trained RF/Ridge/LSTM    │
                                   │  - SHAP explainability      │
                                   │  - Feature Store (Hopsworks │
                                   │    or local parquet)        │
                                   └──────────────────────────┘
```

The Node server never talks to AQICN/OpenWeather/Hopsworks/scikit-learn directly —
it's purely a UI + proxy layer. **All the real work happens in `python-backend/`.**

## Prerequisites

- Node.js 18+
- Python 3.10+
- Free API keys: [AQICN token](https://aqicn.org/data-platform/token/), [OpenWeather key](https://openweathermap.org/api)
- (Optional) [Gemini API key](https://aistudio.google.com/apikey) for the AI health-advisor text
- (Optional) [Hopsworks account](https://app.hopsworks.ai) for a real cloud feature store — otherwise a local parquet fallback is used automatically

## 1. Set up the Python backend (does the real ML work)

```bash
cd python-backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: paste AQICN_TOKEN, OPENWEATHER_API_KEY, set CITY_NAME/LATITUDE/LONGITUDE
```

Build the training dataset and train the models (one-time):
```bash
python -m src.backfill --days 90
python -m src.train_pipeline
```

Run the hourly feature pipeline once (so "now" has a live data point):
```bash
python -m src.feature_pipeline
```

Start the Flask API:
```bash
python app/flask_api.py
# -> running on http://127.0.0.1:5001
```

Verify everything is wired correctly before touching the frontend:
```bash
python tests/test_flask_api.py
```

## 2. Set up the React frontend (in a second terminal)

```bash
cd ..   # back to the project root
npm install

cp .env.example .env
# edit .env: paste your GEMINI_API_KEY (optional but enables AI health advice)
```

Start the dev server:
```bash
npm run dev
```
Open **http://localhost:3000** — the dashboard talks to Flask on port 5001 automatically
(`FLASK_API_URL` in `.env`, defaults to `http://127.0.0.1:5001`).

## Important: which city has a trained model?

The Python backend is backfilled + trained for **one** city at a time (whatever you
set as `CITY_NAME` in `python-backend/.env`, e.g. `karachi`). The dashboard lets you
switch between all 8 Pakistani cities:

- **Selected city == trained city** → you get real custom ML forecasts (RF/Ridge/LSTM)
  and real SHAP explanations.
- **Any other city** → current AQI is still live (AQICN/OpenWeather work for any city),
  and the 3-day forecast automatically falls back to OpenWeather's own real 4-day
  air-pollution forecast API (still 100% real data, just not our custom-trained model).
  SHAP is unavailable for these cities until you backfill + train for them too.

To get custom-trained models for another city, change `CITY_NAME`/`LATITUDE`/`LONGITUDE`
in `python-backend/.env` and re-run `backfill` + `train_pipeline` for that city (note:
this replaces the currently trained city's models — training multiple cities
simultaneously would need separate Hopsworks feature groups per city, left as a
future extension).

## Automating it (GitHub Actions)

See `python-backend/.github/workflows/` — hourly feature pipeline, daily training,
and a manual on-demand backfill workflow are all included. Configure the same
`.env` values as GitHub Secrets/Variables (see `python-backend/README.md` for the
exact split between Secrets vs Variables).

## Project structure

```
├── src/                    # React frontend
│   ├── App.tsx
│   ├── components/         # dashboard views (forecast, SHAP, feature store, model registry, pipelines)
│   └── server/geminiService.ts
├── server.ts                # Node/Express - serves UI + proxies /api/* to Flask
├── python-backend/          # REAL ML backend (see python-backend/README.md for full detail)
│   ├── app/flask_api.py     # REST API consumed by server.ts
│   ├── src/                 # api_client, feature engineering, training, SHAP, alerts
│   ├── tests/test_flask_api.py
│   └── .github/workflows/   # hourly/daily/manual automation
└── package.json
```

For deep detail on the Python side (feature engineering, model training, SHAP,
Hopsworks setup, automation), see **`python-backend/README.md`**.
