export type AQICategory =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous';

export interface PollutantValues {
  pm25: number;  // µg/m³
  pm10: number;  // µg/m³
  o3: number;    // ppb
  no2: number;   // ppb
  so2: number;   // ppb
  co: number;    // ppm
}

export interface WeatherValues {
  temperature: number; // °C
  humidity: number;    // %
  windSpeed: number;   // km/h
  windDirection: string; // N, NE, E, SE, S, SW, W, NW
  pressure: number;    // hPa
  precipitation: number; // mm
}

export interface CurrentAQIData {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  aqi: number;
  category: AQICategory;
  primaryPollutant: keyof PollutantValues;
  timestamp: string;
  pollutants: PollutantValues;
  weather: WeatherValues;
}

export interface HourlyForecastPoint {
  time: string;          // e.g. "14:00"
  fullTimestamp: string; // ISO string
  aqi: number;
  category: AQICategory;
  pm25: number;
  pm10: number;
  temp: number;
  humidity: number;
  windSpeed: number;
  confidenceLower: number;
  confidenceUpper: number;
}

export interface ForecastDaySummary {
  date: string;          // e.g. "2026-08-02"
  displayDate: string;   // e.g. "Tomorrow, Aug 2"
  dayOfWeek: string;     // e.g. "Sunday"
  avgAQI: number;
  minAQI: number;
  maxAQI: number;
  category: AQICategory;
  primaryPollutant: string;
  hourly: HourlyForecastPoint[];
}

export interface FeatureRecord {
  featureId: string;
  entityId: string; // City name
  timestamp: string;
  hour: number;
  dayOfWeek: number;
  month: number;
  temp: number;
  humidity: number;
  windSpeed: number;
  pressure: number;
  aqiLag1h: number;
  aqiLag24h: number;
  aqiChangeRate: number;
  pm25Ratio: number;
  windDispersionIndex: number;
  targetAQI24h: number;
  targetAQI48h: number;
  targetAQI72h: number;
}

export interface FeatureViewMeta {
  name: string;
  version: number;
  entity: string;
  features: string[];
  onlineStoreEnabled: boolean;
  ttlDays: number;
  recordCount: number;
  lastIngested: string;
}

export type ModelType =
  | 'Random Forest Regressor'
  | 'Ridge Regression'
  | 'XGBoost Gradient Booster'
  | 'TensorFlow Deep MLP'
  | 'ARIMA-Prophet Hybrid';

export type MLModelType = ModelType;

export interface MLModelMeta {
  modelId: string;
  name: string;
  type: ModelType;
  version: string;
  trainDate: string;
  metrics: {
    rmse: number;
    mae: number;
    r2: number;
    trainingTimeMs: number;
  };
  hyperparameters: Record<string, any>;
  featureImportances: Array<{
    feature: string;
    importance: number;
    shapMean: number;
  }>;
  active: boolean;
}

export interface ShapValueItem {
  feature: string;
  displayName: string;
  value: string | number;
  shapValue: number; // positive increases AQI, negative lowers AQI
  impact: 'increases_aqi' | 'decreases_aqi' | 'neutral';
  explanation: string;
}

export interface ShapDayExplanation {
  dayOffset: number;
  date: string;
  predictedAQI: number;
  baseAQI: number;
  features: ShapValueItem[];
}

export interface PipelineRun {
  id: string;
  name: string;
  type: 'feature_ingestion' | 'model_training' | 'backfill';
  status: 'running' | 'success' | 'failed' | 'scheduled';
  startTime: string;
  durationSeconds: number;
  recordsProcessed: number;
  triggeredBy: string;
  logs: string[];
}

export interface AIHealthInsight {
  summary: string;
  healthRiskLevel: string;
  sensitiveGroupAdvice: string[];
  outdoorActivityAdvice: string[];
  homeProtectionAdvice: string[];
  shapKeyTakeaways: string;
  environmentalFactors: string;
}

export interface CityOption {
  name: string;
  country: string;
  lat: number;
  lon: number;
}
