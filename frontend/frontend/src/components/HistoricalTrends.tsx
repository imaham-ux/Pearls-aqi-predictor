import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { History, Loader2 } from 'lucide-react';
import { HistoricalPoint } from '../types';
import { api } from '../api';

const RANGES = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 }
];

export const HistoricalTrends: React.FC = () => {
  const [range, setRange] = useState(30);
  const [points, setPoints] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.history(days);
      setPoints(data.points);
    } catch (err) {
      console.error(err);
      setError('Could not load historical data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const chartData = points.map((p) => ({
    ...p,
    label:
      range <= 7
        ? new Date(p.timestamp).toLocaleString(undefined, { weekday: 'short', hour: '2-digit' })
        : new Date(p.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }));

  return (
    <div className="rounded-2xl border border-base-700 bg-base-900 p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-accent" />
          Historical AQI Trends
        </h2>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                range === r.days ? 'bg-accent text-base-950 border-accent' : 'bg-base-800 border-base-700 text-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-72 flex items-center justify-center text-slate-500 gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading {range}-day history…
        </div>
      )}

      {!loading && error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && !error && chartData.length === 0 && (
        <p className="text-sm text-slate-500">
          No historical data in the feature store yet for this range — run a backfill first.
        </p>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a232d" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
              <ReferenceLine y={150} stroke="#f87171" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip
                contentStyle={{ background: '#131a22', border: '1px solid #26323f', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line type="monotone" dataKey="aqi" stroke="#2dd4bf" strokeWidth={2} dot={false} name="AQI" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
