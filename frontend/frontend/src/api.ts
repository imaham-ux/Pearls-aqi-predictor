import {
  CurrentAQIData,
  ForecastResponse,
  ShapDayExplanation,
  FeatureStoreResponse,
  MLModelMeta,
  HealthResponse,
  HistoryResponse
} from './types';

const CITY = 'Karachi';
const LAT = 24.8607;
const LON = 67.0011;
const COUNTRY = 'Pakistan';

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body as T;
}

async function postJSON<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  health: () => getJSON<HealthResponse>('/api/health'),

  current: () =>
    getJSON<CurrentAQIData>(
      `/api/aqi/current?city=${encodeURIComponent(CITY)}&lat=${LAT}&lon=${LON}&country=${encodeURIComponent(COUNTRY)}`
    ),

  forecast: () =>
    getJSON<ForecastResponse>(`/api/aqi/forecast?city=${encodeURIComponent(CITY)}&lat=${LAT}&lon=${LON}`),

  shap: (dayOffset: number) =>
    getJSON<ShapDayExplanation>(`/api/aqi/shap?city=${encodeURIComponent(CITY)}&dayOffset=${dayOffset}`),

  featureStore: () => getJSON<FeatureStoreResponse>('/api/feature-store'),

  triggerBackfill: (days: number) =>
    postJSON<{ success: boolean; message: string }>('/api/feature-store/backfill', { days }),

  modelRegistry: () => getJSON<MLModelMeta[]>('/api/model-registry'),

  triggerTraining: () => postJSON<{ success: boolean; message: string }>('/api/model-registry/train', {}),

  setActiveModel: (modelId: string) =>
    postJSON<MLModelMeta[]>('/api/model-registry/set-active', { modelId }),

  history: (days: number) => getJSON<HistoryResponse>(`/api/aqi/history?days=${days}`)
};

export { CITY, LAT, LON, COUNTRY };
