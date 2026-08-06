import React, { useState } from 'react';
import { Cpu, Play, CheckCircle2, Clock } from 'lucide-react';
import { MLModelMeta } from '../types';

interface Props {
  models: MLModelMeta[];
  onSetActive: (modelId: string) => Promise<void>;
  onTriggerTraining: () => Promise<void>;
}

export const ModelRegistryView: React.FC<Props> = ({ models, onSetActive, onTriggerTraining }) => {
  const [training, setTraining] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const handleTrain = async () => {
    setTraining(true);
    try {
      await onTriggerTraining();
    } finally {
      setTraining(false);
    }
  };

  const handleSwitch = async (modelId: string) => {
    setSwitching(modelId);
    try {
      await onSetActive(modelId);
    } finally {
      setSwitching(null);
    }
  };

  const horizons = Array.from(new Set(models.map((m) => m.modelId.split('-').pop()))).sort();
  const activeModels = models.filter((m) => m.active);
  const lastTrained = models.reduce<string | null>((latest, m) => {
    if (!latest) return m.trainDate;
    return new Date(m.trainDate) > new Date(latest) ? m.trainDate : latest;
  }, null);
  const avgR2 = activeModels.length
    ? activeModels.reduce((sum, m) => sum + m.metrics.r2, 0) / activeModels.length
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-100">Model Registry</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Random Forest, Ridge Regression, and an LSTM compete per forecast horizon — best one by RMSE serves predictions.
          </p>
        </div>
        <button
          onClick={handleTrain}
          disabled={training}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-base-950 hover:bg-accent-bright disabled:opacity-50 transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {training ? 'Training started…' : 'Retrain All Models'}
        </button>
      </div>

      {/* Performance summary strip */}
      {models.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl border border-base-700 bg-base-900 p-5">
          <div className="flex items-center gap-3">
            <div className="bg-accent/10 border border-accent/25 rounded-lg p-2 text-accent">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Last Trained</div>
              <div className="text-sm font-semibold text-slate-100">
                {lastTrained ? new Date(lastTrained).toLocaleString() : '—'}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Active Models</div>
            <div className="text-sm font-semibold text-slate-100 mt-2">{activeModels.length} of {models.length}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Avg Active R²</div>
            <div className="text-sm font-semibold text-slate-100 mt-2">{avgR2 !== null ? avgR2.toFixed(3) : '—'}</div>
          </div>
        </div>
      )}

      {models.length === 0 && (
        <p className="text-sm text-slate-500 rounded-2xl border border-base-700 bg-base-900 p-5">
          No trained models yet. Run a backfill first, then trigger training.
        </p>
      )}

      {horizons.map((horizon) => {
        const horizonModels = models
          .filter((m) => m.modelId.endsWith(`-${horizon}`))
          .sort((a, b) => a.metrics.rmse - b.metrics.rmse);

        return (
          <div key={horizon} className="rounded-2xl border border-base-700 bg-base-900 p-5">
            <h3 className="font-display text-sm font-semibold text-slate-100 mb-3">
              Forecast Horizon: <span className="text-accent">+{horizon}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {horizonModels.map((m) => (
                <div
                  key={m.modelId}
                  className={`rounded-xl border p-4 flex flex-col gap-2 ${
                    m.active ? 'border-accent/50 bg-accent/5' : 'border-base-800 bg-base-850'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                      <Cpu className="w-3.5 h-3.5 text-accent" />
                      {m.type}
                    </span>
                    {m.active && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-accent">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Metric label="RMSE" value={m.metrics.rmse} />
                    <Metric label="MAE" value={m.metrics.mae} />
                    <Metric label="R²" value={m.metrics.r2} />
                  </div>

                  {!m.active && (
                    <button
                      onClick={() => handleSwitch(m.modelId)}
                      disabled={switching === m.modelId}
                      className="mt-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-base-800 border border-base-700 text-slate-300 hover:text-white hover:border-accent/40 disabled:opacity-50 transition-colors"
                    >
                      {switching === m.modelId ? 'Switching…' : 'Set as Active'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="bg-base-950/60 rounded-lg py-1.5">
    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
    <div className="font-mono text-sm text-slate-100 tabular-nums">{value.toFixed(2)}</div>
  </div>
);
