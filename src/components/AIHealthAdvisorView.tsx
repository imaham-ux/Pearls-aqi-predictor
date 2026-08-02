import React, { useState, useEffect } from 'react';
import { AIHealthInsight, CurrentAQIData, ForecastDaySummary, ShapDayExplanation } from '../types';
import { Bot, Sparkles, RefreshCw, ShieldAlert, HeartPulse, Home, Activity, CheckCircle2, AlertTriangle } from 'lucide-react';

interface AIHealthAdvisorViewProps {
  currentCity: string;
  currentData: CurrentAQIData;
  forecast: ForecastDaySummary[];
  shap: ShapDayExplanation;
}

export const AIHealthAdvisorView: React.FC<AIHealthAdvisorViewProps> = ({
  currentCity,
  currentData,
  forecast,
  shap
}) => {
  const [insight, setInsight] = useState<AIHealthInsight | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gemini/aqi-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: currentCity })
      });
      if (!res.ok) throw new Error('Failed to fetch Gemini AI insight');
      const data = await res.json();
      setInsight(data);
    } catch (err: any) {
      console.error(err);
      setError('Unable to reach Gemini AI backend. Displaying offline medical guidelines.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsight();
  }, [currentCity]);

  return (
    <div className="space-y-6">
      {/* Title Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-semibold mb-1">
            <Bot className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>Server-Side Gemini 3.6 Flash AI Assistant</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            AI Environmental & Health Advisor
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Generates real-time medical guidance, outdoor safety limits, and natural language explanations for ML SHAP feature attributions for <span className="text-emerald-400 font-bold">{currentCity}</span>.
          </p>
        </div>

        <button
          onClick={fetchInsight}
          disabled={loading}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Regenerate AI Analysis</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-200">Synthesizing AQI Forecast & Meteorological Features with Gemini 3.6 Flash...</p>
          <p className="text-xs text-slate-500">Evaluating PM2.5 concentrations, wind dispersion index, and SHAP attributions</p>
        </div>
      ) : insight ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Executive Summary Card */}
          <div className="lg:col-span-12 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-cyan-400 uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>AI Forecast Trajectory Summary ({currentCity})</span>
            </div>
            <p className="text-sm text-slate-200 font-medium leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              {insight.summary}
            </p>
            <div className="text-xs text-slate-400 flex items-center gap-2 pt-1">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Risk Assessment: <strong className="text-slate-200">{insight.healthRiskLevel}</strong></span>
            </div>
          </div>

          {/* Sensitive Groups Advice */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-rose-400 uppercase">
              <HeartPulse className="w-4 h-4" />
              <span>Sensitive Groups Guidelines</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              {insight.sensitiveGroupAdvice.map((adv, idx) => (
                <li key={idx} className="flex items-start space-x-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{adv}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Outdoor Activity Advice */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 uppercase">
              <Activity className="w-4 h-4" />
              <span>Outdoor Workouts & Commuting</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              {insight.outdoorActivityAdvice.map((adv, idx) => (
                <li key={idx} className="flex items-start space-x-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{adv}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Home Filtration Advice */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-cyan-400 uppercase">
              <Home className="w-4 h-4" />
              <span>Indoor Protection & Air Purifiers</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              {insight.homeProtectionAdvice.map((adv, idx) => (
                <li key={idx} className="flex items-start space-x-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{adv}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SHAP & Meteorology AI Explanations */}
          <div className="lg:col-span-12 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              AI Atmospheric & Model Feature Attribution Synthesis
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl text-xs space-y-1.5">
                <span className="font-bold text-amber-400">SHAP Driver Explanation:</span>
                <p className="text-slate-300 leading-relaxed">{insight.shapKeyTakeaways}</p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl text-xs space-y-1.5">
                <span className="font-bold text-cyan-400">Meteorological Dynamics:</span>
                <p className="text-slate-300 leading-relaxed">{insight.environmentalFactors}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <span>{error || 'Unable to generate Gemini AI analysis.'}</span>
        </div>
      )}
    </div>
  );
};
