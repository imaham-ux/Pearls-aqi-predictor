# Pearls AQI Predictor — Frontend (React + Vite + TypeScript)
A clean, from-scratch React dashboard for the Pearls AQI Predictor, built for
**Karachi only**. Every number shown comes from the real Python/Flask backend
(`python-backend/`) — no mock data, no AI-generated placeholder content.
## Requirements covered
1. **Home Dashboard** — live AQI, category, and last-updated time
2. **3-Day AQI Forecast** — day cards, chart AND table view, per-hour breakdown
3. **Weather Information** — temperature, humidity, wind speed, pressure
4. **24-Hour Trend Line Graph** — a line chart on the home dashboard plotting
   AQI over the most recent 24 hours (`GET /api/aqi/history?days=1`, one
   point per hour). Gives an at-a-glance read of short-term movement — is
   AQI trending up, down, or flat right now — separately from the longer
   7/30/90-day view below. Hovering a point shows the exact AQI value and
   timestamp for that hour, and it refreshes on the same hourly auto-refresh
   cycle as the rest of the dashboard.
5. **Historical AQI Trends** — interactive chart, filterable by 7 / 30 / 90 days
6. **AQI Alerts** — color-coded status + inline hazard warning banners + alert drawer
7. **Model Explanation** — real SHAP feature-importance chart per forecast day
8. **Model Performance** — RMSE / MAE / R² per model, last training date
9. **Extras** — hourly auto-refresh, CSV export of the 3-day forecast, fully responsive
## 1. Install frontend dependencies
```bash
npm install
```
## 2. Run the Python backend first (separate terminal)
```bash
cd ../python-backend
python app/flask_api.py
# -> http://127.0.0.1:5001
```
## 3. Run the frontend
```bash
npm run dev
```
Open **http://localhost:3000**. Vite's dev server proxies every `/api/*`
request straight to the Flask backend (see `vite.config.ts`).
If your Flask backend runs somewhere other than `http://127.0.0.1:5001`:
```bash
VITE_FLASK_API_URL=http://your-backend-host:5001 npm run dev
```
## 4. Build for production
```bash
npm run build
npm run preview
```
## Project structure
```
frontend/
├── index.html
├── vite.config.ts        # dev proxy -> Flask backend
├── tailwind.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx            # top-level state + data orchestration + auto-refresh
│   ├── api.ts               # all real backend calls in one place
│   ├── aqi.ts                # AQI category/color/advice helpers
│   ├── csv.ts                  # client-side CSV export
│   ├── types.ts                 # TypeScript types matching Flask's exact JSON shapes
│   └── components/
│       ├── Header.tsx
│       ├── AQIOverviewCard.tsx
│       ├── TrendLineGraph.tsx    # 24-hour AQI trend line chart (home dashboard)
│       ├── ForecastSection.tsx   # cards + chart/table toggle + CSV button
│       ├── HistoricalTrends.tsx    # 7/30/90-day filterable trend chart
│       ├── HazardBanner.tsx          # inline hazard warning
│       ├── FeatureStoreView.tsx
│       ├── ModelRegistryView.tsx      # metrics + last-trained date + model switching
│       ├── ShapAnalyticsView.tsx
│       └── AlertDrawer.tsx
```
## Notes
- Only Karachi is configured (`src/api.ts`), matching the trained model in the backend.
- Verified: `npx tsc --noEmit` (0 errors) and `npm run build` (clean production build).
- Light/dark mode toggle was intentionally left out of this round (it was
  marked optional in the requirements) to keep every *required* feature
  fully correct and tested. Happy to add it as a follow-up if you want it.
