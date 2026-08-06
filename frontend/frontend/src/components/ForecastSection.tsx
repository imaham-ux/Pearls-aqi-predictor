import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { Download, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { ForecastDaySummary } from '../types';
import { getAQILevel } from '../aqi';
import { downloadForecastCSV } from '../csv';

interface Props {
  forecast: ForecastDaySummary[];
  modelTrained: boolean;
  note: string | null;
}

export const ForecastSection: React.FC<Props> = ({ forecast, modelTrained, note }) => {
  const [activeDay, setActiveDay] = useState(0);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const day = forecast[activeDay];

  return (
    <div className="rounded-2xl border border-base-700 bg-base-900 p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="font-display text-base font-semibold text-slate-100">Next 3 Days</h2>
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
              modelTrained
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'bg-slate-700/20 border-slate-600/40 text-slate-400'
            }`}
          >
            {modelTrained ? 'Trained ML model (RF / Ridge / LSTM)' : 'OpenWeather forecast'}
          </span>
          <button
            onClick={() => downloadForecastCSV(forecast)}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-base-800 border border-base-700 text-slate-300 hover:text-white hover:border-base-600 transition-colors"
            title="Download 3-day forecast as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {note && (
        <p className="text-xs text-slate-500 mb-4 bg-base-850 border border-base-800 rounded-lg px-3 py-2">{note}</p>
      )}

      {/* Day cards */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {forecast.map((d, i) => {
          const level = getAQILevel(d.avgAQI);
          const isActive = i === activeDay;
          return (
            <button
              key={d.date}
              onClick={() => setActiveDay(i)}
              className={`text-left rounded-xl border p-3 transition-colors ${
                isActive ? 'border-accent/50 bg-accent/5' : 'border-base-800 bg-base-850 hover:border-base-700'
              }`}
            >
              <div className="text-[11px] font-semibold text-slate-400">{d.displayDate}</div>
              <div className="font-display text-2xl font-semibold tabular-nums mt-1" style={{ color: level.color }}>
                {Math.round(d.avgAQI)}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: level.color }}>
                {level.label}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {Math.round(d.minAQI)}–{Math.round(d.maxAQI)} range
              </div>
            </button>
          );
        })}
      </div>

      {/* Chart / Table toggle */}
      <div className="flex items-center gap-1.5 mb-3">
        <button
          onClick={() => setView('chart')}
          className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md ${
            view === 'chart' ? 'bg-base-800 text-accent' : 'text-slate-500'
          }`}
        >
          <LayoutGrid className="w-3 h-3" /> Chart
        </button>
        <button
          onClick={() => setView('table')}
          className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md ${
            view === 'table' ? 'bg-base-800 text-accent' : 'text-slate-500'
          }`}
        >
          <TableIcon className="w-3 h-3" /> Table
        </button>
      </div>

      {day && view === 'chart' && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={day.hourly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="aqiFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a232d" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
              <ReferenceLine y={150} stroke="#f87171" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip
                contentStyle={{ background: '#131a22', border: '1px solid #26323f', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area type="monotone" dataKey="aqi" stroke="#2dd4bf" strokeWidth={2} fill="url(#aqiFill)" name="AQI" />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-slate-500 mt-2">Dashed red line marks the "Unhealthy" hazard threshold (AQI 150).</p>
        </div>
      )}

      {day && view === 'table' && (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-base-900">
              <tr className="text-slate-500 border-b border-base-800">
                <th className="text-left font-semibold uppercase tracking-wide py-2 pr-4">Time</th>
                <th className="text-left font-semibold uppercase tracking-wide py-2 pr-4">AQI</th>
                <th className="text-left font-semibold uppercase tracking-wide py-2 pr-4">Category</th>
                <th className="text-left font-semibold uppercase tracking-wide py-2 pr-4">PM2.5</th>
                <th className="text-left font-semibold uppercase tracking-wide py-2">Range</th>
              </tr>
            </thead>
            <tbody>
              {day.hourly.map((h) => {
                const level = getAQILevel(h.aqi);
                return (
                  <tr key={h.time} className="border-b border-base-800/60 text-slate-300 font-mono">
                    <td className="py-2 pr-4">{h.time}</td>
                    <td className="py-2 pr-4 font-semibold" style={{ color: level.color }}>
                      {Math.round(h.aqi)}
                    </td>
                    <td className="py-2 pr-4">{h.category}</td>
                    <td className="py-2 pr-4">{h.pm25.toFixed(1)}</td>
                    <td className="py-2 text-slate-500">
                      {Math.round(h.confidenceLower)}–{Math.round(h.confidenceUpper)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
