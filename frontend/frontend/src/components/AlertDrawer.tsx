import React from 'react';
import { X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { CurrentAQIData, ForecastDaySummary } from '../types';
import { getAQILevel } from '../aqi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentAQI: CurrentAQIData | null;
  forecast: ForecastDaySummary[];
}

const HAZARD_THRESHOLD = 150;

export const AlertDrawer: React.FC<Props> = ({ isOpen, onClose, currentAQI, forecast }) => {
  if (!isOpen) return null;

  const hazards = forecast.filter((d) => d.maxAQI >= HAZARD_THRESHOLD);
  const currentHazard = currentAQI && currentAQI.aqi >= HAZARD_THRESHOLD;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-base-900 border-l border-base-700 h-full overflow-y-auto animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-base-800">
          <h2 className="font-display text-sm font-semibold text-slate-100">Hazard Alerts</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {currentHazard && (
            <AlertRow
              label="Right now"
              aqi={currentAQI!.aqi}
            />
          )}

          {hazards.map((d) => (
            <AlertRow key={d.date} label={d.displayDate} aqi={d.maxAQI} />
          ))}

          {!currentHazard && hazards.length === 0 && (
            <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-300">All clear</p>
                <p className="text-xs text-slate-400 mt-1">
                  No hazardous AQI levels (≥ {HAZARD_THRESHOLD}) predicted for Karachi in the next 3 days.
                </p>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-600 pt-2 border-t border-base-800">
            Threshold: AQI ≥ {HAZARD_THRESHOLD} ("Unhealthy" or worse). The backend also sends email/Slack alerts
            automatically when this threshold is crossed.
          </p>
        </div>
      </div>
    </div>
  );
};

const AlertRow: React.FC<{ label: string; aqi: number }> = ({ label, aqi }) => {
  const level = getAQILevel(aqi);
  return (
    <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl p-4">
      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-red-300">
          {label}: AQI {Math.round(aqi)} — {level.label}
        </p>
        <p className="text-xs text-slate-400 mt-1">{level.advice}</p>
      </div>
    </div>
  );
};
