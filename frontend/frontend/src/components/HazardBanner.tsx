import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getAQILevel } from '../aqi';

interface Props {
  aqi: number;
  context: string;
}

export const HazardBanner: React.FC<Props> = ({ aqi, context }) => {
  const level = getAQILevel(aqi);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3.5 animate-fade-in">
      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-red-300">
          {context}: AQI {Math.round(aqi)} — {level.label}
        </p>
        <p className="text-xs text-red-200/70 mt-0.5">{level.advice}</p>
      </div>
    </div>
  );
};
