import React, { useState } from 'react';
import { X, Bell, ShieldAlert, Check, Volume2 } from 'lucide-react';

interface AlertNotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentAQI: number;
  cityName: string;
}

export const AlertNotificationDrawer: React.FC<AlertNotificationDrawerProps> = ({
  isOpen,
  onClose,
  currentAQI,
  cityName
}) => {
  const [threshold, setThreshold] = useState<number>(150);
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);
  const [testTriggered, setTestTriggered] = useState<boolean>(false);

  if (!isOpen) return null;

  const isTriggered = currentAQI >= threshold;

  const handleTestAlert = () => {
    setTestTriggered(true);
    setTimeout(() => setTestTriggered(false), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 p-6 shadow-2xl flex flex-col justify-between overflow-y-auto">
        <div className="space-y-6">
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
              <Bell className="w-5 h-5 animate-bounce" />
              <span>AQI Hazardous Alert Monitor</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Alert Status Banner */}
          <div
            className={`p-4 rounded-xl border ${
              isTriggered
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <div className="flex items-center space-x-2 text-xs font-bold uppercase mb-1">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{isTriggered ? 'HAZARDOUS LEVEL WARNING' : 'AIR QUALITY BELOW THRESHOLD'}</span>
            </div>
            <p className="text-xs font-medium">
              Current AQI in <strong className="text-white">{cityName}</strong> is <strong className="text-white">{currentAQI}</strong>.
              {isTriggered
                ? ` Exceeds configured alert limit (${threshold} AQI). Take immediate protective precautions.`
                : ` Below alert threshold (${threshold} AQI). Ambient air conditions are within acceptable safety margins.`}
            </p>
          </div>

          {/* Configuration Form */}
          <div className="space-y-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">Enable Automated Push Notifications</span>
              <button
                onClick={() => setAlertsEnabled(!alertsEnabled)}
                className={`w-10 h-5 flex items-center rounded-full p-1 transition-all ${
                  alertsEnabled ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-slate-950 shadow-md" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                Trigger Threshold Level ({threshold} AQI)
              </label>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>50 (Good)</span>
                <span>150 (Sensitive)</span>
                <span>300 (Hazardous)</span>
              </div>
            </div>

            <button
              onClick={handleTestAlert}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2 rounded-lg transition-all flex items-center justify-center space-x-1.5"
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Simulate Alert Notification</span>
            </button>

            {testTriggered && (
              <div className="bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 p-2.5 rounded text-[11px] flex items-center space-x-1.5">
                <Check className="w-4 h-4 shrink-0" />
                <span>Simulated push alert sent to pipeline notification drawer!</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all mt-6"
        >
          Save & Close Settings
        </button>
      </div>
    </div>
  );
};
