import React, { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Header } from './components/Header';
import { AQIOverviewCard } from './components/AQIOverviewCard';
import { ForecastSection } from './components/ForecastSection';
import { HistoricalTrends } from './components/HistoricalTrends';
import { HazardBanner } from './components/HazardBanner';
import { FeatureStoreView } from './components/FeatureStoreView';
import { ModelRegistryView } from './components/ModelRegistryView';
import { ShapAnalyticsView } from './components/ShapAnalyticsView';
import { AlertDrawer } from './components/AlertDrawer';
import { api, CITY } from './api';
import {
  CurrentAQIData,
  ForecastDaySummary,
  ShapDayExplanation,
  FeatureViewMeta,
  FeatureRecord,
  MLModelMeta
} from './types';

type Tab = 'dashboard' | 'feature-store' | 'model-registry' | 'shap-eda';

const HAZARD_THRESHOLD = 150;
const AUTO_REFRESH_MS = 60 * 60 * 1000; // 1 hour, matching the backend's hourly ingestion cadence

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [alertsOpen, setAlertsOpen] = useState(false);

  const [currentAQI, setCurrentAQI] = useState<CurrentAQIData | null>(null);
  const [forecast, setForecast] = useState<ForecastDaySummary[]>([]);
  const [modelTrained, setModelTrained] = useState(true);
  const [forecastNote, setForecastNote] = useState<string | null>(null);

  const [featureViews, setFeatureViews] = useState<FeatureViewMeta[]>([]);
  const [sampleRecords, setSampleRecords] = useState<FeatureRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [fsBackend, setFsBackend] = useState('');

  const [models, setModels] = useState<MLModelMeta[]>([]);

  const [shapByDay, setShapByDay] = useState<Record<number, ShapDayExplanation | null>>({});
  const [shapLoadingDay, setShapLoadingDay] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [current, forecastResp] = await Promise.all([api.current(), api.forecast()]);
      setCurrentAQI(current);
      setForecast(forecastResp.forecast);
      setModelTrained(forecastResp.modelTrained);
      setForecastNote(forecastResp.note);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error(err);
      setError(
        'Could not reach the backend. Make sure the Flask API is running (python-backend: python app/flask_api.py on port 5001).'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFeatureStore = useCallback(async () => {
    try {
      const data = await api.featureStore();
      setFeatureViews(data.featureViews);
      setSampleRecords(data.sampleRecords);
      setTotalRecords(data.totalRecords);
      setFsBackend(data.backend);
    } catch (err) {
      console.error('Error loading feature store:', err);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const data = await api.modelRegistry();
      setModels(data);
    } catch (err) {
      console.error('Error loading model registry:', err);
    }
  }, []);

  const loadShap = useCallback(async (dayOffset: number) => {
    setShapLoadingDay(dayOffset);
    try {
      const data = await api.shap(dayOffset);
      setShapByDay((prev) => ({ ...prev, [dayOffset]: data }));
    } catch (err) {
      setShapByDay((prev) => ({ ...prev, [dayOffset]: null }));
    } finally {
      setShapLoadingDay(null);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadCore();
    loadFeatureStore();
    loadModels();
    loadShap(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh predictions every hour (requirement #8)
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      loadCore();
    }, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [loadCore]);

  const handleTriggerBackfill = async (days: number) => {
    await api.triggerBackfill(days);
    setTimeout(loadFeatureStore, 1500);
  };

  const handleTriggerTraining = async () => {
    await api.triggerTraining();
    setTimeout(loadModels, 1500);
  };

  const handleSetActiveModel = async (modelId: string) => {
    const updated = await api.setActiveModel(modelId);
    setModels(updated);
  };

  const worstForecastDay = forecast.reduce<ForecastDaySummary | null>((worst, d) => {
    if (!worst || d.maxAQI > worst.maxAQI) return d;
    return worst;
  }, null);

  const hazardActive =
    (currentAQI?.aqi ?? 0) >= HAZARD_THRESHOLD || forecast.some((d) => d.maxAQI >= HAZARD_THRESHOLD);

  return (
    <div className="min-h-screen bg-base-950">
      <Header
        activeTab={activeTab}
        onTabChange={(t) => setActiveTab(t as Tab)}
        onOpenAlerts={() => setAlertsOpen(true)}
        currentAQI={currentAQI?.aqi ?? 0}
        hazardActive={hazardActive}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {loading && !currentAQI ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <RefreshCw className="w-8 h-8 text-accent animate-spin" />
            <p className="mt-3 text-sm">Loading live AQI data for {CITY}…</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <div className="animate-fade-in space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-display text-lg font-semibold text-slate-100">Live Overview</h2>
                  <div className="flex items-center gap-3">
                    {lastRefreshed && (
                      <span className="text-[11px] text-slate-500">
                        Updated {lastRefreshed.toLocaleTimeString()} · auto-refreshes hourly
                      </span>
                    )}
                    <button
                      onClick={loadCore}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-base-800 border border-base-700 text-slate-300 hover:text-white hover:border-base-600 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* AQI Alerts (requirement #5) - prominent inline banners */}
                {currentAQI && currentAQI.aqi >= HAZARD_THRESHOLD && (
                  <HazardBanner aqi={currentAQI.aqi} context="Right now" />
                )}
                {worstForecastDay && worstForecastDay.maxAQI >= HAZARD_THRESHOLD && (
                  <HazardBanner aqi={worstForecastDay.maxAQI} context={worstForecastDay.displayDate} />
                )}

                {currentAQI && <AQIOverviewCard data={currentAQI} />}
                {forecast.length > 0 && (
                  <ForecastSection forecast={forecast} modelTrained={modelTrained} note={forecastNote} />
                )}

                <HistoricalTrends />
              </div>
            )}

            {activeTab === 'feature-store' && (
              <div className="animate-fade-in">
                <FeatureStoreView
                  featureViews={featureViews}
                  sampleRecords={sampleRecords}
                  totalRecords={totalRecords}
                  backend={fsBackend}
                  onTriggerBackfill={handleTriggerBackfill}
                />
              </div>
            )}

            {activeTab === 'model-registry' && (
              <div className="animate-fade-in">
                <ModelRegistryView
                  models={models}
                  onSetActive={handleSetActiveModel}
                  onTriggerTraining={handleTriggerTraining}
                />
              </div>
            )}

            {activeTab === 'shap-eda' && (
              <div className="animate-fade-in">
                <ShapAnalyticsView shapByDay={shapByDay} loadingDay={shapLoadingDay} onSelectDay={loadShap} />
              </div>
            )}
          </>
        )}
      </main>

      <AlertDrawer
        isOpen={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        currentAQI={currentAQI}
        forecast={forecast}
      />
    </div>
  );
};

export default App;
