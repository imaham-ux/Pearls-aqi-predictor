import React, { useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { ShapDayExplanation } from '../types';

interface Props {
  shapByDay: Record<number, ShapDayExplanation | null>;
  loadingDay: number | null;
  onSelectDay: (dayOffset: number) => void;
}

export const ShapAnalyticsView: React.FC<Props> = ({ shapByDay, loadingDay, onSelectDay }) => {
  const [activeDay, setActiveDay] = useState(1);
  const data = shapByDay[activeDay];

  const handleSelect = (day: number) => {
    setActiveDay(day);
    if (!shapByDay[day]) onSelectDay(day);
  };

  const maxAbs = data ? Math.max(...data.features.map((f) => Math.abs(f.shapValue)), 1) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-100">SHAP Explainability</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Which real features drive the forecast the most, computed from the trained model itself.
          </p>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              onClick={() => handleSelect(d)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                activeDay === d ? 'bg-accent text-base-950 border-accent' : 'bg-base-800 border-base-700 text-slate-300'
              }`}
            >
              Day +{d}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-base-700 bg-base-900 p-5">
        {loadingDay === activeDay && <p className="text-sm text-slate-500">Computing SHAP values…</p>}

        {!loadingDay && !data && (
          <p className="text-sm text-slate-500">
            SHAP isn't available yet for this horizon — train the model first from the Model Registry tab.
          </p>
        )}

        {data && (
          <>
            <div className="flex items-center gap-4 mb-5 text-sm">
              <span className="text-slate-400">Base AQI: <span className="font-mono text-slate-200">{data.baseAQI}</span></span>
              <span className="text-slate-400">
                Predicted: <span className="font-mono text-accent font-semibold">{data.predictedAQI}</span>
              </span>
            </div>

            <div className="space-y-3">
              {data.features.map((f) => {
                const pct = (Math.abs(f.shapValue) / maxAbs) * 100;
                const isPositive = f.impact === 'increases_aqi';
                return (
                  <div key={f.feature}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300 font-medium flex items-center gap-1.5">
                        {isPositive ? (
                          <TrendingUp className="w-3 h-3 text-red-400" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-emerald-400" />
                        )}
                        {f.displayName}
                      </span>
                      <span className="font-mono text-slate-400">{f.shapValue.toFixed(2)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-base-850 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isPositive ? 'bg-red-400/70' : 'bg-emerald-400/70'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{f.explanation}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-base-700 bg-base-900 p-5 flex items-start gap-3">
        <BarChart3 className="w-4 h-4 text-accent mt-0.5 shrink-0" />
        <p className="text-xs text-slate-500 leading-relaxed">
          Bars show each feature's real mean absolute SHAP contribution to this forecast horizon. Red bars push the
          predicted AQI up; green bars pull it down. Values come directly from the trained model, not an estimate.
        </p>
      </div>
    </div>
  );
};
