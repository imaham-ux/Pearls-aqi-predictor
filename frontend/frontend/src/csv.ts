import { ForecastDaySummary } from './types';

export function downloadForecastCSV(forecast: ForecastDaySummary[]) {
  const rows: string[] = ['date,time,aqi,category,pm25,pm10,confidence_lower,confidence_upper'];

  for (const day of forecast) {
    for (const h of day.hourly) {
      rows.push(
        [day.date, h.time, h.aqi, h.category, h.pm25, h.pm10, h.confidenceLower, h.confidenceUpper].join(',')
      );
    }
  }

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `karachi_aqi_forecast_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
