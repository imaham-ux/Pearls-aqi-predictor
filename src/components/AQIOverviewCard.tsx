import React from 'react';
import { CurrentAQIData } from '../types';
import { MapPin, Thermometer, Droplets, Wind, Gauge, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';

interface AQIOverviewCardProps {
  data: CurrentAQIData;
  onViewInsight: () => void;
}

export const AQIOverviewCard: React.FC<AQIOverviewCardProps> = ({ data, onViewInsight }) => {
  const getCategoryStyles = (category: string) => {
    switch (category) {
      case 'Good':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          badge: 'bg-emerald-500 text-slate-950',
          text: 'text-emerald-400',
          border: 'border-emerald-500/40',
          gradient: 'from-emerald-500/20 to-teal-500/5',
          description: 'Air quality is satisfactory, and air pollution poses little or no risk.'
        };
      case 'Moderate':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          badge: 'bg-amber-500 text-slate-950',
          text: 'text-amber-400',
          border: 'border-amber-500/40',
          gradient: 'from-amber-500/20 to-yellow-500/5',
          description: 'Air quality is acceptable; sensitive groups may experience minor discomfort.'
        };
      case 'Unhealthy for Sensitive Groups':
        return {
          bg: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
          badge: 'bg-orange-500 text-slate-950',
          text: 'text-orange-400',
          border: 'border-orange-500/40',
          gradient: 'from-orange-500/20 to-amber-500/5',
          description: 'Members of sensitive groups may experience health effects. General public is less likely affected.'
        };
      case 'Unhealthy':
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
          badge: 'bg-rose-500 text-white',
          text: 'text-rose-400',
          border: 'border-rose-500/40',
          gradient: 'from-rose-500/20 to-pink-500/5',
          description: 'Everyone may begin to experience health effects; sensitive groups may experience more serious effects.'
        };
      case 'Very Unhealthy':
        return {
          bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
          badge: 'bg-purple-600 text-white',
          text: 'text-purple-400',
          border: 'border-purple-500/40',
          gradient: 'from-purple-500/20 to-indigo-500/5',
          description: 'Health alert: everyone may experience more serious health effects.'
        };
      default: // Hazardous
        return {
          bg: 'bg-red-950 border-red-600/60 text-red-300',
          badge: 'bg-red-700 text-white',
          text: 'text-red-400',
          border: 'border-red-600/80',
          gradient: 'from-red-900/40 to-rose-950/20',
          description: 'Health warnings of emergency conditions. The entire population is more likely to be affected.'
        };
    }
  };

  const style = getCategoryStyles(data.category);

  const pollutantsList = [
    { name: 'PM2.5', value: `${data.pollutants.pm25} µg/m³`, subText: 'Fine Particulates', percentage: Math.min(100, (data.pollutants.pm25 / 75) * 100) },
    { name: 'PM10', value: `${data.pollutants.pm10} µg/m³`, subText: 'Coarse Particulates', percentage: Math.min(100, (data.pollutants.pm10 / 150) * 100) },
    { name: 'O3', value: `${data.pollutants.o3} ppb`, subText: 'Ground-level Ozone', percentage: Math.min(100, (data.pollutants.o3 / 100) * 100) },
    { name: 'NO2', value: `${data.pollutants.no2} ppb`, subText: 'Nitrogen Dioxide', percentage: Math.min(100, (data.pollutants.no2 / 80) * 100) },
    { name: 'SO2', value: `${data.pollutants.so2} ppb`, subText: 'Sulfur Dioxide', percentage: Math.min(100, (data.pollutants.so2 / 40) * 100) },
    { name: 'CO', value: `${data.pollutants.co} ppm`, subText: 'Carbon Monoxide', percentage: Math.min(100, (data.pollutants.co / 9) * 100) }
  ];

  return (
    <div className={`bg-gradient-to-br ${style.gradient} bg-slate-900 border ${style.border} rounded-2xl p-5 md:p-6 shadow-xl transition-all`}>
      {/* City & Badge Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-semibold mb-1">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>{data.city}, {data.country}</span>
            <span className="text-slate-600">•</span>
            <span>Live Feed ({new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            Air Quality Index Dashboard
          </h2>
        </div>

        <button
          onClick={onViewInsight}
          className="self-start sm:self-auto bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
        >
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>Ask Gemini AI Advisor</span>
        </button>
      </div>

      {/* Main AQI Gauge & Key Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 items-center">
        {/* Big AQI Badge Card */}
        <div className="lg:col-span-5 bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden">
          <div className="absolute top-2 right-3 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            Real-Time AQI
          </div>

          <div className={`text-6xl font-black tracking-tight my-2 ${style.text}`}>
            {data.aqi}
          </div>

          <span className={`px-3.5 py-1 rounded-full text-xs font-extrabold tracking-wide uppercase ${style.badge} shadow-sm mb-3`}>
            {data.category}
          </span>

          <p className="text-xs text-slate-300 max-w-xs leading-relaxed font-medium">
            {style.description}
          </p>

          <div className="mt-4 pt-3 border-t border-slate-800/80 w-full flex items-center justify-between text-xs text-slate-400">
            <span>Primary Pollutant:</span>
            <span className="font-bold text-slate-200 uppercase px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
              {data.primaryPollutant}
            </span>
          </div>
        </div>

        {/* Live Weather Metrics & Pollutants Grid */}
        <div className="lg:col-span-7 space-y-5">
          {/* Weather strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/50 border border-slate-800/80 p-3 rounded-xl flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Thermometer className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Temp</p>
                <p className="text-sm font-extrabold text-slate-200">{data.weather.temperature}°C</p>
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800/80 p-3 rounded-xl flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Humidity</p>
                <p className="text-sm font-extrabold text-slate-200">{data.weather.humidity}%</p>
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800/80 p-3 rounded-xl flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Wind className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Wind</p>
                <p className="text-sm font-extrabold text-slate-200">{data.weather.windSpeed} km/h</p>
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800/80 p-3 rounded-xl flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Gauge className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Pressure</p>
                <p className="text-sm font-extrabold text-slate-200">{data.weather.pressure} hPa</p>
              </div>
            </div>
          </div>

          {/* Pollutant Breakdown Cards */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
              <span>Key Pollutant Concentrations</span>
              <span className="text-[11px] font-normal text-slate-500">EPA Standard Scale</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {pollutantsList.map((p) => (
                <div key={p.name} className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-slate-200">{p.name}</span>
                    <span className="text-[10px] text-slate-400">{p.subText}</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-100 my-1">{p.value}</div>

                  {/* Meter bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1.5">
                    <div
                      className={`h-full rounded-full ${
                        p.percentage > 70 ? 'bg-rose-500' : p.percentage > 40 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, p.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
