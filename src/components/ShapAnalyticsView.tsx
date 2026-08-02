import React, { useState } from 'react';
import { ShapDayExplanation, MLModelMeta } from '../types';
import { BarChart3, HelpCircle, ArrowUp, ArrowDown, Sparkles, TrendingUp, ScatterChart as ScatterIcon, Layers } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine
} from 'recharts';

interface ShapAnalyticsViewProps {
  shapData: ShapDayExplanation;
  model: MLModelMeta;
  cityName: string;
}

export const ShapAnalyticsView: React.FC<ShapAnalyticsViewProps> = ({
  shapData,
  model,
  cityName
}) => {
  const [activeDayOffset, setActiveDayOffset] = useState<number>(1);

  // Prepare waterfall plot data
  const chartData = shapData.features.map((f) => ({
    name: f.displayName,
    shapValue: f.shapValue,
    rawValue: f.value,
    explanation: f.explanation,
    color: f.shapValue > 0 ? '#f43f5e' : '#10b981'
  }));

  // Global feature importances from model registry
  const globalImportances = model.featureImportances || [];

  return (
    <div className="space-y-6">
      {/* Title Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>SHAP (SHapley Additive exPlanations) & LIME Explainable AI</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Feature Importance & Model Interpretability
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Understand exactly why the ML model predicted AQI of <span className="text-emerald-400 font-bold">{shapData.predictedAQI}</span> relative to the baseline (<span className="text-slate-300 font-bold">{shapData.baseAQI}</span>).
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 p-2 rounded-xl text-xs">
          <span className="text-slate-400 font-medium">Forecast Target:</span>
          <div className="flex space-x-1">
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                onClick={() => setActiveDayOffset(d)}
                className={`px-2.5 py-1 rounded font-bold transition-all ${
                  activeDayOffset === d
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Day {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SHAP Waterfall & Feature Impact Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SHAP Bar Chart */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>SHAP Feature Attribution Values ({cityName})</span>
            </h3>

            <div className="text-xs text-slate-400">
              Base Value: <span className="font-bold text-slate-200">{shapData.baseAQI} AQI</span> → Target: <span className="font-bold text-emerald-400">{shapData.predictedAQI} AQI</span>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Red bars <span className="text-rose-400 font-bold">+AQI</span> increase forecasted pollution; Green bars <span className="text-emerald-400 font-bold">-AQI</span> reduce pollution.
          </p>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} width={130} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs space-y-1 max-w-xs">
                          <p className="font-bold text-slate-200">{item.name}</p>
                          <p className="text-slate-300">Observed Value: <span className="font-mono text-cyan-400 font-bold">{item.rawValue}</span></p>
                          <p className={`font-extrabold ${item.shapValue > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            SHAP Impact: {item.shapValue > 0 ? `+${item.shapValue}` : item.shapValue} AQI
                          </p>
                          <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">{item.explanation}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine x={0} stroke="#475569" strokeWidth={1.5} />
                <Bar dataKey="shapValue" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Global Model Feature Importance Summary */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3 flex items-center justify-between">
            <span>Global Mean |SHAP| Importance</span>
            <span className="text-[10px] text-slate-400 uppercase font-mono">{model.name}</span>
          </h3>

          <div className="space-y-3 pt-1">
            {globalImportances.map((item) => (
              <div key={item.feature} className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-300 font-medium">
                  <span className="font-mono">{item.feature}</span>
                  <span className="text-slate-400 font-mono">{(item.importance * 100).toFixed(0)}% weight</span>
                </div>

                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                    style={{ width: `${Math.min(100, item.importance * 100 * 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl text-xs text-slate-400 leading-relaxed mt-4">
            <span className="font-bold text-slate-200 block mb-1">Key Explainability Insight:</span>
            Lagged AQI (`aqiLag1h`) accounts for ~38-41% of total model decision weight, reflecting heavy temporal persistence in local atmospheric air basins.
          </div>
        </div>
      </div>
    </div>
  );
};
