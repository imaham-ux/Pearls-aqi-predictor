import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { CITIES } from './src/constants.js';
import { generateGeminiAQIInsight } from './src/server/geminiService.js';

// The real Python ML backend (Flask). Override with FLASK_API_URL env var if needed.
const FLASK_API_URL = process.env.FLASK_API_URL || 'http://127.0.0.1:5001';

async function flaskGet(endpoint: string, params: Record<string, string | undefined> = {}) {
  const url = new URL(FLASK_API_URL + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok) {
    const err: any = new Error(json.error || `Flask API error (${res.status})`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function flaskPost(endpoint: string, body: any = {}) {
  const res = await fetch(FLASK_API_URL + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const err: any = new Error(json.error || `Flask API error (${res.status})`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function findCity(name: string) {
  return CITIES.find((c) => c.name.toLowerCase() === (name || '').toLowerCase()) || CITIES[0];
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ---- Health ----
  app.get('/api/health', async (req, res) => {
    try {
      const flaskHealth = await flaskGet('/api/health');
      res.json({ status: 'ok', service: 'Pearls AQI Predictor', timestamp: new Date().toISOString(), flask: flaskHealth });
    } catch (e: any) {
      res.json({
        status: 'degraded',
        service: 'Pearls AQI Predictor',
        timestamp: new Date().toISOString(),
        flask: null,
        warning: `Could not reach Python backend at ${FLASK_API_URL}: ${e.message}. Start it with: python app/flask_api.py`,
      });
    }
  });

  // ---- Cities list ----
  app.get('/api/aqi/cities', (req, res) => {
    res.json(CITIES);
  });

  // ---- Current AQI & Weather (REAL - AQICN + OpenWeather via Flask) ----
  app.get('/api/aqi/current', async (req, res) => {
    const cityName = (req.query.city as string) || 'Karachi';
    const city = findCity(cityName);
    try {
      const data = await flaskGet('/api/aqi/current', {
        city: city.name, lat: String(city.lat), lon: String(city.lon), country: city.country,
      });
      res.json(data);
    } catch (e: any) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  // ---- 3-Day AQI Forecast (REAL - trained ML models / OpenWeather forecast) ----
  app.get('/api/aqi/forecast', async (req, res) => {
    const cityName = (req.query.city as string) || 'Karachi';
    const city = findCity(cityName);
    try {
      const data = await flaskGet('/api/aqi/forecast', {
        city: city.name, lat: String(city.lat), lon: String(city.lon),
      });
      res.json(data.forecast); // frontend expects ForecastDaySummary[] directly
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // ---- SHAP Value Feature Importance (REAL, only for the trained city) ----
  app.get('/api/aqi/shap', async (req, res) => {
    const cityName = (req.query.city as string) || 'Karachi';
    const dayOffset = (req.query.dayOffset as string) || '1';
    try {
      const data = await flaskGet('/api/aqi/shap', { city: cityName, dayOffset });
      res.json(data);
    } catch (e: any) {
      res.status(e.status || 500).json(e.body || { error: e.message });
    }
  });

  // ---- Feature Store endpoints (REAL) ----
  app.get('/api/feature-store', async (req, res) => {
    try {
      const data = await flaskGet('/api/feature-store');
      res.json(data);
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.post('/api/feature-store/backfill', async (req, res) => {
    try {
      const { days } = req.body;
      const result = await flaskPost('/api/feature-store/backfill', { days: days || 90 });
      res.json(result);
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // ---- Model Registry endpoints (REAL) ----
  app.get('/api/model-registry', async (req, res) => {
    try {
      const models = await flaskGet('/api/model-registry');
      res.json(models);
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.post('/api/model-registry/train', async (req, res) => {
    try {
      const result = await flaskPost('/api/model-registry/train', {});
      res.json(result);
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.post('/api/model-registry/set-active', async (req, res) => {
    try {
      const { modelId } = req.body;
      const result = await flaskPost('/api/model-registry/set-active', { modelId });
      res.json(result);
    } catch (e: any) {
      res.status(e.status || 500).json(e.body || { error: e.message });
    }
  });

  // ---- CI/CD & Pipeline Runs (REAL) ----
  app.get('/api/pipeline/runs', async (req, res) => {
    try {
      const runs = await flaskGet('/api/pipeline/runs');
      res.json(runs);
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.post('/api/pipeline/trigger', async (req, res) => {
    try {
      const { type } = req.body;
      const result = await flaskPost('/api/pipeline/trigger', { type: type || 'feature_ingestion' });
      res.json(result);
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // ---- Server-Side Gemini AI Insight Endpoint (REAL, fed by real AQI/forecast/SHAP data) ----
  app.post('/api/gemini/aqi-insight', async (req, res) => {
    try {
      const { city: cityName } = req.body;
      const city = findCity(cityName || 'Karachi');

      const currentData = await flaskGet('/api/aqi/current', {
        city: city.name, lat: String(city.lat), lon: String(city.lon), country: city.country,
      });
      const forecastResp = await flaskGet('/api/aqi/forecast', {
        city: city.name, lat: String(city.lat), lon: String(city.lon),
      });
      const forecast = forecastResp.forecast;

      let shap;
      try {
        shap = await flaskGet('/api/aqi/shap', { city: city.name, dayOffset: '1' });
      } catch {
        // no custom model trained for this city - give Gemini a minimal placeholder
        shap = { dayOffset: 1, date: forecast[0]?.date, predictedAQI: forecast[0]?.avgAQI, baseAQI: currentData.aqi, features: [] };
      }

      const insight = await generateGeminiAQIInsight(currentData, forecast, shap);
      res.json(insight);
    } catch (err: any) {
      console.error('Error generating AQI insight:', err);
      res.status(500).json({ error: 'Failed to generate AI insight', message: err.message });
    }
  });

  // Vite Middleware for development vs Static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node/Vite server listening on http://0.0.0.0:${PORT}`);
    console.log(`Proxying real data from Python Flask backend at ${FLASK_API_URL}`);
  });
}

startServer();
