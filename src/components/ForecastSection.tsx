import React, { useState } from 'react';
import { ForecastDaySummary, MLModelMeta } from '../types';
import {
  Calendar,
  Clock,
  TrendingUp,
  Cpu,
  Layers,
  ChevronRight,
  Info,
  Check
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';

interface ForecastSectionProps {
  forecast: ForecastDaySummary[];
  models: MLModelMeta[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  cityName: string;
}

export const ForecastSection: React.FC<ForecastSectionProps> = ({
  forecast,
  models,
  selectedModelId,
  onSelectModel,
  cityName
}) => {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [selectedMetric, setSelectedMetric] = useState<'aqi' | 'pm25' | 'pm10' | 'temp'>('aqi');

  const activeDay = forecast[selectedDayIndex] || forecast[0];
  const activeModel = models.find((m) => m.modelId === selectedModelId) || models.find((m) => m.active) || models[0];

  const getAQIColor = (aqi: number) => {
    if (aqi <= 50) return '#10b981'; // Good
    if (aqi <= 100) return '#f59e0b'; // Moderate
    if (aqi <= 150) return '#f97316'; // Unhealthy Sensitive
    if (aqi <= 200) return '#f43f5e'; // Unhealthy
    if (aqi <= 300) return '#a855f7'; // Very Unhealthy
    return '#b91c1c'; // Hazardous
  };

  const activeColor = getAQIColor(activeDay?.avgAQI || 50);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-6">
      {/* Header & Model Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-semibold mb-1">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span>3-Day Serverless ML Prediction Horizon</span>
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            AQI Forecast for {cityName}
          </h3>
        </div>

        {/* Model Selector Pill */}
        <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 p-1.5 rounded-xl">
          <Cpu className="w-4 h-4 text-emerald-400 ml-1.5" />
          <span className="text-xs font-medium text-slate-400 hidden sm:inline">Active Model:</span>
          <select
            value={selectedModelId}
            onChange={(e) => onSelectModel(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 text-xs font-semibold text-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          >
            {models.map((m) => (
              <option key={m.modelId} value={m.modelId}>
                {m.name} (RMSE: {m.metrics.rmse}) {m.active ? '★ Active' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3-Day Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {forecast.map((day, idx) => {
          const isSelected = selectedDayIndex === idx;
          const dayColor = getAQIColor(day.avgAQI);

          return (
            <div
              key={day.date}
              onClick={() => setSelectedDayIndex(idx)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-slate-800/90 border-emerald-500 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/50'
                  : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
                <span>{day.displayDate}</span>
                <span className="text-[10px] text-slate-500 font-medium">{day.dayOfWeek}</span>
              </div>

              <div className="flex items-baseline justify-between my-2">
                <div>
                  <span className="text-3xl font-black text-slate-100" style={{ color: dayColor }}>
                    {day.avgAQI}
                  </span>
                  <span className="text-xs text-slate-400 font-medium ml-1">Avg AQI</span>
                </div>

                <div className="text-right text-[11px] text-slate-400 font-medium">
                  <div>Min: <span className="text-slate-200 font-bold">{day.minAQI}</span></div>
                  <div>Max: <span className="text-slate-200 font-bold">{day.maxAQI}</span></div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/80">
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide text-slate-950"
                  style={{ backgroundColor: dayColor }}
                >
                  {day.category}
                </span>

                {isSelected && (
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Selected
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hourly Detail Forecast Graph */}
      {activeDay && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-bold text-slate-200">
                  Detailed 24-Hour Prediction Curve ({activeDay.displayDate})
                </h4>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Shaded band indicates 95% Bayesian Confidence Interval generated by {activeModel?.name}
              </p>
            </div>

            {/* Metric Toggle */}
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-lg self-start sm:self-auto">
              {[
                { id: 'aqi', label: 'AQI' },
                { id: 'pm25', label: 'PM2.5' },
                { id: 'pm10', label: 'PM10' },
                { id: 'temp', label: 'Temp (°C)' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMetric(m.id as any)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                    selectedMetric === m.id
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recharts Area Chart */}
          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeDay.hourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={activeColor} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={activeColor} stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const dataPoint = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs space-y-1">
                          <p className="font-bold text-slate-200 border-b border-slate-800 pb-1">{label} Forecast</p>
                          <p className="text-emerald-400 font-extrabold text-sm">
                            AQI: {dataPoint.aqi} ({dataPoint.category})
                          </p>
                          <div className="text-[11px] text-slate-400 space-y-0.5 pt-1">
                            <div>PM2.5: <span className="text-slate-200">{dataPoint.pm25} µg/m³</span></div>
                            <div>PM10: <span className="text-slate-200">{dataPoint.pm10} µg/m³</span></div>
                            <div>Temp: <span className="text-slate-200">{dataPoint.temp}°C</span> | Wind: <span className="text-slate-200">{dataPoint.windSpeed} km/h</span></div>
                            <div>95% Confidence Bounds: <span className="text-slate-300 font-mono">{dataPoint.confidenceLower} - {dataPoint.confidenceUpper}</span></div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                <ReferenceLine y={50} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Good (50)', fill: '#10b981', fontSize: 10 }} />
                <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Moderate (100)', fill: '#f59e0b', fontSize: 10 }} />
                <ReferenceLine y={150} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Unhealthy (150)', fill: '#f43f5e', fontSize: 10 }} />

                <Area
                  type="monotone"
                  dataKey={selectedMetric}
                  stroke={activeColor}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#metricGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              Features refreshed hourly via Hopsworks Feature Pipeline
            </span>
            <span className="text-slate-500 font-mono">Model ID: {activeModel.modelId}</span>
          </div>
        </div>
      )}
    </div>
  );
};
