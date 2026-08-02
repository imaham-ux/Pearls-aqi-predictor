import React, { useState } from 'react';
import {
  Wind,
  Search,
  Activity,
  Database,
  Cpu,
  BarChart3,
  GitBranch,
  Bot,
  MapPin,
  Sparkles,
  Bell
} from 'lucide-react';
import { CITIES } from '../constants';

interface HeaderProps {
  currentCity: string;
  onSelectCity: (city: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenAlerts: () => void;
  currentAQI: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentCity,
  onSelectCity,
  activeTab,
  onTabChange,
  onOpenAlerts,
  currentAQI
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredCities = CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const navItems = [
    { id: 'dashboard', label: '3-Day Forecast', icon: Activity },
    { id: 'feature-store', label: 'Feature Store', icon: Database },
    { id: 'model-registry', label: 'Model Registry', icon: Cpu },
    { id: 'shap-eda', label: 'SHAP & Analytics', icon: BarChart3 },
    { id: 'pipelines', label: 'CI/CD Pipelines', icon: GitBranch },
    { id: 'python-code', label: 'Python MLOps Code', icon: Sparkles },
    { id: 'ai-advisor', label: 'AI Health Advisor', icon: Bot }
  ];

  const quickCities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Peshawar', 'Faisalabad', 'Multan', 'Quetta'];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-40 shadow-lg">
      {/* Top Banner / Logo Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('dashboard')}>
          <div className="bg-gradient-to-tr from-emerald-500 to-cyan-500 p-2.5 rounded-xl shadow-md shadow-emerald-500/20 text-slate-950 font-bold">
            <Wind className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                Pearls AQI Predictor
              </h1>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Serverless Pipeline
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              100% Automated Air Quality Forecasting & Feature Store Architecture
            </p>
          </div>
        </div>

        {/* Search City & Controls */}
        <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
          {/* Search Dropdown */}
          <div className="relative w-full md:w-64">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search city..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>

            {showDropdown && (
              <div
                className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
                onMouseLeave={() => setShowDropdown(false)}
              >
                {filteredCities.length > 0 ? (
                  filteredCities.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => {
                        onSelectCity(c.name);
                        setSearchQuery('');
                        setShowDropdown(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-700/70 flex items-center justify-between text-slate-200 border-b border-slate-700/40 last:border-0"
                    >
                      <span className="font-medium flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        {c.name}
                      </span>
                      <span className="text-[10px] text-slate-400">{c.country}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-400">No city matched</div>
                )}
              </div>
            )}
          </div>

          {/* Alert Button */}
          <button
            onClick={onOpenAlerts}
            className={`p-2 rounded-lg border transition-all flex items-center gap-1 text-xs font-semibold ${
              currentAQI > 150
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title="AQI Hazardous Threshold Alerts"
          >
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Alerts</span>
          </button>
        </div>
      </div>

      {/* Quick City Pills & Sub-Header Navigation */}
      <div className="bg-slate-950/60 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-2 py-2">
          {/* Quick city chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap mr-1">Locations:</span>
            {quickCities.map((city) => (
              <button
                key={city}
                onClick={() => onSelectCity(city)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  currentCity.toLowerCase() === city.toLowerCase()
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent'
                }`}
              >
                {city}
              </button>
            ))}
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 overflow-x-auto w-full md:w-auto scrollbar-none">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
