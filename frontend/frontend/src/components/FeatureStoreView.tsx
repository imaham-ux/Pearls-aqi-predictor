import React, { useState } from 'react';
import { Database, RefreshCw, Layers } from 'lucide-react';
import { FeatureViewMeta, FeatureRecord } from '../types';

interface Props {
  featureViews: FeatureViewMeta[];
  sampleRecords: FeatureRecord[];
  totalRecords: number;
  backend: string;
  onTriggerBackfill: (days: number) => Promise<void>;
}

const DISPLAY_COLUMNS: { key: keyof FeatureRecord; label: string }[] = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'hour', label: 'Hour' },
  { key: 'temp', label: 'Temp (°C)' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'aqiLag1h', label: 'AQI Lag 1h' },
  { key: 'aqiLag24h', label: 'AQI Lag 24h' },
  { key: 'aqiChangeRate', label: 'Δ AQI Rate' },
  { key: 'targetAQI24h', label: 'Target +24h' }
];

export const FeatureStoreView: React.FC<Props> = ({ featureViews, sampleRecords, totalRecords, backend, onTriggerBackfill }) => {
  const [backfillDays, setBackfillDays] = useState(730);
  const [triggering, setTriggering] = useState(false);
  const fv = featureViews[0];

  const handleBackfill = async () => {
    setTriggering(true);
    try {
      await onTriggerBackfill(backfillDays);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={Database} label="Total Records" value={totalRecords.toLocaleString()} />
        <StatCard icon={Layers} label="Backend" value={backend} />
        <StatCard icon={RefreshCw} label="Last Ingested" value={fv?.lastIngested ? new Date(fv.lastIngested).toLocaleString() : '—'} />
      </div>

      {fv && (
        <div className="rounded-2xl border border-base-700 bg-base-900 p-5">
          <h3 className="font-display text-sm font-semibold text-slate-100 mb-3">
            Feature Group: <span className="text-accent font-mono">{fv.name}</span> (v{fv.version})
          </h3>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {fv.features.map((f) => (
              <span key={f} className="text-[11px] font-mono px-2 py-1 rounded-md bg-base-850 border border-base-800 text-slate-400">
                {f}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-base-800">
            <label className="text-xs text-slate-400 font-semibold">Backfill days:</label>
            <input
              type="number"
              value={backfillDays}
              onChange={(e) => setBackfillDays(Number(e.target.value))}
              className="w-24 bg-base-850 border border-base-700 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleBackfill}
              disabled={triggering}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-base-950 hover:bg-accent-bright disabled:opacity-50 transition-colors"
            >
              {triggering ? 'Starting…' : 'Trigger Backfill'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-base-700 bg-base-900 p-5 overflow-x-auto">
        <h3 className="font-display text-sm font-semibold text-slate-100 mb-3">Sample Feature Rows</h3>
        {sampleRecords.length === 0 ? (
          <p className="text-sm text-slate-500">No records yet — trigger a backfill to populate the feature store.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-base-800">
                {DISPLAY_COLUMNS.map((c) => (
                  <th key={String(c.key)} className="text-left font-semibold uppercase tracking-wide py-2 pr-4">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRecords.slice(-15).reverse().map((r) => (
                <tr key={r.featureId} className="border-b border-base-800/60 text-slate-300 font-mono">
                  {DISPLAY_COLUMNS.map((c) => (
                    <td key={String(c.key)} className="py-2 pr-4 whitespace-nowrap">
                      {formatCell(r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toFixed(2);
  if (typeof v === 'string' && v.includes('T')) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(v);
}

const StatCard: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl border border-base-700 bg-base-900 p-4 flex items-center gap-3">
    <div className="bg-accent/10 border border-accent/25 rounded-lg p-2 text-accent">
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-slate-100 truncate">{value}</div>
    </div>
  </div>
);
