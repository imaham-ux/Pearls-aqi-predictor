import React, { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, Loader2 } from 'lucide-react';
import { HistoricalPoint } from '../types';
import { api } from '../api';
import { getAQILevel } from '../aqi';

export const HourlyTrend24h: React.FC = () => {
  const [points, setPoints] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.history(1);
      setPoints(data.points.slice(-24));
    } catch (err) {
      console.error(err);
      setError('Could not load 24-hour AQI trend data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = points.map((p) => ({
    ...p,
    label: new Date(p.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })
  }));

  return (
    <div className="rounded-2xl border border-base-700 bg-base-900 p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          24 Hour AQI Trend
        </h2>
        <button
          onClick={load}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-base-800 border-base-700 text-slate-300 hover:text-white hover:border-base-600 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="h-56 flex items-center justify-center text-slate-500 gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading last 24 hours…
        </div>
      )}

      {!loading && error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && !error && chartData.length === 0 && (
        <p className="text-sm text-slate-500">
          No AQI data available for the last 24 hours — run a backfill first.
        </p>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="aqi24Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a232d" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
              <ReferenceLine y={150} stroke="#f87171" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip
                contentStyle={{ background: '#131a22', border: '1px solid #26323f', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value) => {
                  const level = getAQILevel(Number(value));
                  return [<span style={{ color: level.color }}>{Math.round(Number(value))} AQI ({level.label})</span>, 'AQI'];
                }}
              />
              <Area type="monotone" dataKey="aqi" stroke="#2dd4bf" strokeWidth={2} fill="url(#aqi24Fill)" name="AQI" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};