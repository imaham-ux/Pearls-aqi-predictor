import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AQIOverviewCard } from './components/AQIOverviewCard';
import { ForecastSection } from './components/ForecastSection';
import { FeatureStoreView } from './components/FeatureStoreView';
import { ModelRegistryView } from './components/ModelRegistryView';
import { ShapAnalyticsView } from './components/ShapAnalyticsView';
import { PipelineWorkflowView } from './components/PipelineWorkflowView';
import { AIHealthAdvisorView } from './components/AIHealthAdvisorView';
import { PythonMLOpsView } from './components/PythonMLOpsView';
import { AlertNotificationDrawer } from './components/AlertNotificationDrawer';
import {
  CurrentAQIData,
  ForecastDaySummary,
  ShapDayExplanation,
  FeatureViewMeta,
  FeatureRecord,
  MLModelMeta,
  PipelineRun,
  MLModelType
} from './types';
import { RefreshCw, Activity, Sparkles, Database, Cpu, BarChart3, GitBranch, Bot } from 'lucide-react';

export default function App() {
  const [currentCity, setCurrentCity] = useState<string>('Karachi');
  const [currentData, setCurrentData] = useState<CurrentAQIData | null>(null);
  const [forecast, setForecast] = useState<ForecastDaySummary[]>([]);
  const [shapData, setShapData] = useState<ShapDayExplanation | null>(null);
  const [featureViews, setFeatureViews] = useState<FeatureViewMeta[]>([]);
  const [sampleRecords, setSampleRecords] = useState<FeatureRecord[]>([]);
  const [models, setModels] = useState<MLModelMeta[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isAlertOpen, setIsAlertOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Load state for city
  const loadCityData = async (city: string, modelId?: string) => {
    setLoading(true);
    try {
      // Current AQI
      const currentRes = await fetch(`/api/aqi/current?city=${encodeURIComponent(city)}`);
      const cData: CurrentAQIData = await currentRes.json();
      setCurrentData(cData);

      // Forecast
      const forecastRes = await fetch(`/api/aqi/forecast?city=${encodeURIComponent(city)}&modelId=${modelId || ''}`);
      const fData: ForecastDaySummary[] = await forecastRes.json();
      setForecast(fData);

      // SHAP
      const shapRes = await fetch(`/api/aqi/shap?city=${encodeURIComponent(city)}&dayOffset=1`);
      const sData: ShapDayExplanation = await shapRes.json();
      setShapData(sData);
    } catch (err) {
      console.error('Error fetching city AQI data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    const fetchInitialMeta = async () => {
      try {
        // Models
        const modelRes = await fetch('/api/model-registry');
        const mData: MLModelMeta[] = await modelRes.json();
        setModels(mData);
        const activeM = mData.find((m) => m.active) || mData[0];
        if (activeM) setSelectedModelId(activeM.modelId);

        // Feature Store
        const fsRes = await fetch('/api/feature-store');
        const fsData = await fsRes.json();
        setFeatureViews(fsData.featureViews);
        setSampleRecords(fsData.sampleRecords);

        // Pipeline Runs
        const runsRes = await fetch('/api/pipeline/runs');
        const rData: PipelineRun[] = await runsRes.json();
        setPipelineRuns(rData);
      } catch (err) {
        console.error('Error fetching initial pipeline metadata:', err);
      }
    };

    fetchInitialMeta();
    loadCityData('Karachi');
  }, []);

  const handleSelectCity = (city: string) => {
    setCurrentCity(city);
    loadCityData(city, selectedModelId);
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    loadCityData(currentCity, modelId);
  };

  const handleSetActiveModel = async (modelId: string) => {
    try {
      const res = await fetch('/api/model-registry/set-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      const updatedModels: MLModelMeta[] = await res.json();
      setModels(updatedModels);
      setSelectedModelId(modelId);
      loadCityData(currentCity, modelId);
    } catch (err) {
      console.error('Error setting active model:', err);
    }
  };

  const handleTrainModel = async (type: MLModelType, hyperparams: Record<string, any>) => {
    try {
      const res = await fetch('/api/model-registry/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, hyperparameters: hyperparams })
      });
      const newModel: MLModelMeta = await res.json();

      // Refresh model list & runs
      const mRes = await fetch('/api/model-registry');
      setModels(await mRes.json());

      const rRes = await fetch('/api/pipeline/runs');
      setPipelineRuns(await rRes.json());
    } catch (err) {
      console.error('Error training model:', err);
    }
  };

  const handleTriggerBackfill = async (startDate: string, endDate: string, city: string) => {
    try {
      await fetch('/api/feature-store/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, city })
      });

      const fsRes = await fetch('/api/feature-store');
      const fsData = await fsRes.json();
      setFeatureViews(fsData.featureViews);
      setSampleRecords(fsData.sampleRecords);

      const rRes = await fetch('/api/pipeline/runs');
      setPipelineRuns(await rRes.json());
    } catch (err) {
      console.error('Error triggering backfill:', err);
    }
  };

  const handleTriggerPipeline = async (type: 'feature_ingestion' | 'model_training') => {
    try {
      await fetch('/api/pipeline/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });

      const rRes = await fetch('/api/pipeline/runs');
      setPipelineRuns(await rRes.json());
    } catch (err) {
      console.error('Error triggering pipeline:', err);
    }
  };

  const activeModel = models.find((m) => m.modelId === selectedModelId) || models[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Navbar Header */}
      <Header
        currentCity={currentCity}
        onSelectCity={handleSelectCity}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenAlerts={() => setIsAlertOpen(true)}
        currentAQI={currentData?.aqi || 50}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading && !currentData ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4">
            <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
            <h3 className="text-lg font-bold text-slate-200">Loading AQI Data & Machine Learning Features...</h3>
            <p className="text-xs text-slate-400">Connecting to Hopsworks Feature Store & OpenWeather API proxy</p>
          </div>
        ) : (
          <>
            {/* View Tab 1: Live Dashboard & 3-Day Forecast */}
            {activeTab === 'dashboard' && currentData && (
              <div className="space-y-6 animate-fade-in">
                {/* Current Overview Card */}
                <AQIOverviewCard
                  data={currentData}
                  onViewInsight={() => setActiveTab('ai-advisor')}
                />

                {/* 3-Day Forecast Section */}
                <ForecastSection
                  forecast={forecast}
                  models={models}
                  selectedModelId={selectedModelId}
                  onSelectModel={handleSelectModel}
                  cityName={currentCity}
                />
              </div>
            )}

            {/* View Tab 2: Feature Store */}
            {activeTab === 'feature-store' && (
              <div className="animate-fade-in">
                <FeatureStoreView
                  featureViews={featureViews}
                  sampleRecords={sampleRecords}
                  onTriggerBackfill={handleTriggerBackfill}
                  currentCity={currentCity}
                />
              </div>
            )}

            {/* View Tab 3: Model Registry */}
            {activeTab === 'model-registry' && (
              <div className="animate-fade-in">
                <ModelRegistryView
                  models={models}
                  onSetActiveModel={handleSetActiveModel}
                  onTrainModel={handleTrainModel}
                />
              </div>
            )}

            {/* View Tab 4: SHAP & EDA Analytics */}
            {activeTab === 'shap-eda' && shapData && activeModel && (
              <div className="animate-fade-in">
                <ShapAnalyticsView
                  shapData={shapData}
                  model={activeModel}
                  cityName={currentCity}
                />
              </div>
            )}

            {/* View Tab 5: CI/CD Pipelines */}
            {activeTab === 'pipelines' && (
              <div className="animate-fade-in">
                <PipelineWorkflowView
                  runs={pipelineRuns}
                  onTriggerPipeline={handleTriggerPipeline}
                />
              </div>
            )}

            {/* View Tab 6: Python MLOps & Hopsworks Stack */}
            {activeTab === 'python-code' && (
              <div className="animate-fade-in">
                <PythonMLOpsView currentCity={currentCity} />
              </div>
            )}

            {/* View Tab 6: AI Health Advisor */}
            {activeTab === 'ai-advisor' && currentData && shapData && (
              <div className="animate-fade-in">
                <AIHealthAdvisorView
                  currentCity={currentCity}
                  currentData={currentData}
                  forecast={forecast}
                  shap={shapData}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Hazardous Alert Drawer */}
      <AlertNotificationDrawer
        isOpen={isAlertOpen}
        onClose={() => setIsAlertOpen(false)}
        currentAQI={currentData?.aqi || 50}
        cityName={currentCity}
      />

      {/* Global Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong className="text-slate-300">Pearls AQI Predictor</strong> — 100% Serverless Air Quality ML Forecasting Engine
          </div>
          <div className="flex items-center space-x-3 text-slate-400">
            <span>Hopsworks Feature Store</span>
            <span>•</span>
            <span>Gemini 3.6 Flash</span>
            <span>•</span>
            <span>Recharts Analytics</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
