import React from 'react';
import { Droplets, Wind as WindIcon, Gauge, Thermometer, CloudRain } from 'lucide-react';
import { CurrentAQIData } from '../types';
import { getAQILevel, formatTimeAgo } from '../aqi';

interface Props {
  data: CurrentAQIData;
}

const POLLUTANT_LABELS: Record<string, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  o3: 'Ozone (O₃)',
  no2: 'Nitrogen Dioxide (NO₂)',
  so2: 'Sulfur Dioxide (SO₂)',
  co: 'Carbon Monoxide (CO)'
};

export const AQIOverviewCard: React.FC<Props> = ({ data }) => {
  const level = getAQILevel(data.aqi);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Big AQI number */}
      <div
        className="rounded-2xl border p-6 flex flex-col justify-between"
        style={{ borderColor: `${level.color}40`, background: `${level.color}0d` }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Live AQI · Karachi
          </span>
          <span className="text-[11px] text-slate-500">{formatTimeAgo(data.timestamp)}</span>
        </div>
        <div className="mt-4">
          <div className="font-display text-6xl font-semibold tabular-nums" style={{ color: level.color }}>
            {Math.round(data.aqi)}
          </div>
          <div className="mt-1 font-semibold text-sm" style={{ color: level.color }}>
            {level.label}
          </div>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">{level.advice}</p>
        </div>
      </div>

      {/* Pollutants */}
      <div className="rounded-2xl border border-base-700 bg-base-900 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Pollutant Breakdown</h3>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(data.pollutants).map(([key, value]) => (
            <div key={key} className="bg-base-850 rounded-lg px-3 py-2 border border-base-800">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                {POLLUTANT_LABELS[key] || key}
              </div>
              <div className="font-mono text-sm text-slate-100 mt-0.5 tabular-nums">
                {value != null ? value.toFixed(1) : '—'}
                <span className="text-[10px] text-slate-500 ml-1">µg/m³</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weather */}
      <div className="rounded-2xl border border-base-700 bg-base-900 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Weather Drivers</h3>
        <div className="space-y-2.5">
          <WeatherRow icon={Thermometer} label="Temperature" value={`${data.weather.temperature.toFixed(1)}°C`} />
          <WeatherRow icon={Droplets} label="Humidity" value={`${data.weather.humidity.toFixed(0)}%`} />
          <WeatherRow icon={WindIcon} label="Wind" value={`${data.weather.windSpeed.toFixed(1)} km/h ${data.weather.windDirection}`} />
          <WeatherRow icon={Gauge} label="Pressure" value={`${data.weather.pressure.toFixed(0)} hPa`} />
          <WeatherRow icon={CloudRain} label="Precipitation" value={`${data.weather.precipitation.toFixed(1)} mm`} />
        </div>
      </div>
    </div>
  );
};

const WeatherRow: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="flex items-center gap-2 text-slate-400">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
    <span className="font-mono text-slate-200 tabular-nums">{value}</span>
  </div>
);
