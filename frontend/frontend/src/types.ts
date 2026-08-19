// ---- /api/aqi/current ----
export interface CurrentAQIData {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  aqi: number;
  category: string;
  primaryPollutant: string;
  timestamp: string;
  pollutants: {
    pm25: number;
    pm10: number;
    o3: number;
    no2: number;
    so2: number;
    co: number;
  };
  weather: {
    temperature: number;
    humidity: number;
    windSpeed: number;
    windDirection: string;
    pressure: number;
    precipitation: number;
  };
}

// ---- /api/aqi/forecast ----
export interface HourlyForecastPoint {
  time: string;
  fullTimestamp: string;
  aqi: number;
  category: string;
  pm25: number;
  pm10: number;
  temp: number | null;
  humidity: number | null;
  windSpeed: number | null;
  confidenceLower: number;
  confidenceUpper: number;
}

export interface ForecastDaySummary {
  date: string;
  displayDate: string;
  dayOfWeek: string;
  avgAQI: number;
  minAQI: number;
  maxAQI: number;
  category: string;
  primaryPollutant: string;
  rmse?: number | null;
  hourly: HourlyForecastPoint[];
}

export interface ForecastResponse {
  forecast: ForecastDaySummary[];
  modelTrained: boolean;
  note: string | null;
}

// ---- /api/aqi/shap ----
export interface ShapFeature {
  feature: string;
  displayName: string;
  value: number;
  shapValue: number;
  impact: 'increases_aqi' | 'decreases_aqi';
  explanation: string;
}

export interface ShapDayExplanation {
  dayOffset: number;
  date: string;
  predictedAQI: number;
  baseAQI: number;
  features: ShapFeature[];
  modelTrained: boolean;
}

// ---- /api/feature-store ----
export interface FeatureViewMeta {
  name: string;
  version: number;
  entity: string;
  features: string[];
  onlineStoreEnabled: boolean;
  ttlDays: number;
  recordCount: number;
  lastIngested: string | null;
}

export interface FeatureRecord {
  featureId: string;
  entityId: string;
  timestamp: string;
  hour: number;
  dayOfWeek: number;
  month: number;
  temp: number | null;
  humidity: number | null;
  windSpeed: number | null;
  pressure: number | null;
  aqiLag1h: number | null;
  aqiLag24h: number | null;
  aqiChangeRate: number | null;
  pm25Ratio: number | null;
  windDispersionIndex: number | null;
  targetAQI24h: number | null;
  targetAQI48h: number | null;
  targetAQI72h: number | null;
}

export interface FeatureStoreResponse {
  featureViews: FeatureViewMeta[];
  sampleRecords: FeatureRecord[];
  totalRecords: number;
  backend: string;
}

// ---- /api/model-registry ----
export type MLModelType = 'random_forest' | 'ridge' | 'lstm';

export interface MLModelMeta {
  modelId: string;
  name: string;
  type: string;
  version: string;
  trainDate: string;
  metrics: {
    rmse: number;
    mae: number;
    r2: number;
    trainingTimeMs: number;
  };
  hyperparameters: Record<string, unknown>;
  featureImportances: unknown[];
  active: boolean;
}

// ---- /api/health ----
export interface HealthResponse {
  status: string;
  city: string;
  hopsworks: boolean;
}

// ---- /api/aqi/history ----
export interface HistoricalPoint {
  timestamp: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
}

export interface HistoryResponse {
  days: number;
  points: HistoricalPoint[];
  count: number;
}
