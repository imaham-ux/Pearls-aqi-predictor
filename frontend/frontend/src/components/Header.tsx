import React from 'react';
import { Wind, Activity, Database, Cpu, BarChart3, MapPin, Bell } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenAlerts: () => void;
  currentAQI: number;
  hazardActive: boolean;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: '3-Day Forecast', icon: Activity },
  { id: 'feature-store', label: 'Feature Store', icon: Database },
  { id: 'model-registry', label: 'Model Registry', icon: Cpu },
  { id: 'shap-eda', label: 'SHAP & Analytics', icon: BarChart3 }
];

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, onOpenAlerts, currentAQI, hazardActive }) => {
  return (
    <header className="bg-base-900 border-b border-base-700/60 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-accent/15 border border-accent/30 p-2.5 rounded-xl text-accent">
            <Wind className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display font-semibold text-lg tracking-tight text-slate-50">
              Pearls AQI Predictor
            </h1>
            <p className="text-xs text-slate-500 font-medium">Serverless forecasting pipeline</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-base-800 border border-base-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-accent" />
            Karachi, Pakistan
          </div>
          <button
            onClick={onOpenAlerts}
            className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              hazardActive
                ? 'bg-red-500/15 border-red-500/40 text-red-300'
                : 'bg-base-800 border-base-700 text-slate-300 hover:text-white hover:border-base-600'
            }`}
            aria-label="Hazardous AQI alerts"
          >
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Alerts</span>
            {hazardActive && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
          </button>
        </div>
      </div>

      <nav className="border-t border-base-800 bg-base-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 py-2 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-accent text-base-950' : 'text-slate-400 hover:text-slate-200 hover:bg-base-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
