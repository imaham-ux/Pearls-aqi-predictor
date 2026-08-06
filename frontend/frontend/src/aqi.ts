export interface AQILevel {
  max: number;
  label: string;
  color: string;
  textColor: string;
  advice: string;
}

export const AQI_LEVELS: AQILevel[] = [
  { max: 50, label: 'Good', color: '#4ade80', textColor: 'text-emerald-400', advice: 'Air quality is satisfactory.' },
  { max: 100, label: 'Moderate', color: '#facc15', textColor: 'text-yellow-400', advice: 'Acceptable, but sensitive groups should watch for symptoms.' },
  { max: 150, label: 'Unhealthy for Sensitive Groups', color: '#fb923c', textColor: 'text-orange-400', advice: 'Sensitive groups should reduce prolonged outdoor exertion.' },
  { max: 200, label: 'Unhealthy', color: '#f87171', textColor: 'text-red-400', advice: 'Everyone may begin to experience health effects.' },
  { max: 300, label: 'Very Unhealthy', color: '#c084fc', textColor: 'text-purple-400', advice: 'Health alert: everyone may experience more serious effects.' },
  { max: 500, label: 'Hazardous', color: '#a16207', textColor: 'text-amber-700', advice: 'Health warning of emergency conditions.' }
];

export function getAQILevel(aqi: number): AQILevel {
  return AQI_LEVELS.find((l) => aqi <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

export function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
