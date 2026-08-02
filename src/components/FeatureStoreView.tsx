import React, { useState } from 'react';
import { FeatureViewMeta, FeatureRecord, PipelineRun } from '../types';
import { Database, RefreshCw, HardDrive, Play, CheckCircle2, Server, Table, ShieldCheck, Sparkles } from 'lucide-react';

interface FeatureStoreViewProps {
  featureViews: FeatureViewMeta[];
  sampleRecords: FeatureRecord[];
  onTriggerBackfill: (startDate: string, endDate: string, city: string) => void;
  currentCity: string;
}

export const FeatureStoreView: React.FC<FeatureStoreViewProps> = ({
  featureViews,
  sampleRecords,
  onTriggerBackfill,
  currentCity
}) => {
  const [selectedViewName, setSelectedViewName] = useState<string>(featureViews[0]?.name || '');
  const [startDate, setStartDate] = useState<string>('2023-01-01');
  const [endDate, setEndDate] = useState<string>('2026-07-31');
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillSuccess, setBackfillSuccess] = useState(false);

  const activeView = featureViews.find((fv) => fv.name === selectedViewName) || featureViews[0];

  const handleRunBackfill = (e: React.FormEvent) => {
    e.preventDefault();
    setIsBackfilling(true);
    setBackfillSuccess(false);

    setTimeout(() => {
      onTriggerBackfill(startDate, endDate, currentCity);
      setIsBackfilling(false);
      setBackfillSuccess(true);
      setTimeout(() => setBackfillSuccess(false), 4000);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Top Title Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold mb-1">
            <Database className="w-4 h-4" />
            <span>Hopsworks / Vertex AI Feature Store Engine</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Feature Pipeline & Online Store
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Calculates time-series lag features, meteorology dispersion ratios, and rolling air quality deltas for training and online real-time inference.
          </p>
        </div>

        <div className="flex items-center space-x-3 bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
          <Server className="w-5 h-5 text-emerald-400" />
          <div className="text-xs">
            <div className="font-bold text-slate-200">Online Store Active</div>
            <div className="text-[10px] text-slate-400">Latency &lt; 8ms | Synced via Airflow</div>
          </div>
        </div>
      </div>

      {/* Feature Views List & Schema Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Feature Views Selector Sidebar */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            <span>Registered Feature Groups</span>
          </h3>

          <div className="space-y-2.5">
            {featureViews.map((fv) => {
              const isSelected = selectedViewName === fv.name;
              return (
                <div
                  key={fv.name}
                  onClick={() => setSelectedViewName(fv.name)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-800 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs">
                    <span>{fv.name}</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                      v{fv.version}
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400 space-y-1">
                    <div>Entity: <span className="text-slate-200 font-mono">{fv.entity}</span></div>
                    <div>Record Count: <span className="text-slate-200 font-mono">{fv.recordCount.toLocaleString()}</span></div>
                    <div>TTL: <span className="text-slate-200">{fv.ttlDays} Days</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Backfill Tool Card */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 pt-3 mt-4">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-200">
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              <span>Historical Backfill Generator</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Extract past weather & pollutant archives to generate training feature data for model updates.
            </p>

            <form onSubmit={handleRunBackfill} className="space-y-2.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-1"
                />
              </div>

              <button
                type="submit"
                disabled={isBackfilling}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2 px-3 rounded-lg flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {isBackfilling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Backfill...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Backfill Pipeline ({currentCity})</span>
                  </>
                )}
              </button>

              {backfillSuccess && (
                <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-2 rounded text-[11px] flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Backfill job complete! 8,760 feature rows ingested.</span>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Feature Schema & Data Preview Table */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Table className="w-4 h-4 text-emerald-400" />
                <span>Feature Schema: {activeView.name}</span>
              </h3>
              <p className="text-xs text-slate-400">Inspecting ingested feature vectors from Feature Store</p>
            </div>

            <div className="text-right text-[11px] text-slate-400">
              Last Sync: <span className="text-slate-200 font-mono">{new Date(activeView.lastIngested).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Features Pills */}
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Computed Features:</span>
            <div className="flex flex-wrap gap-1.5">
              {activeView.features.map((ft) => (
                <span
                  key={ft}
                  className="bg-slate-800 border border-slate-700/80 text-emerald-300 text-[11px] font-mono px-2.5 py-1 rounded-md"
                >
                  {ft}
                </span>
              ))}
            </div>
          </div>

          {/* Sample Records Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live Online Feature Store Vector Table (City: {currentCity})</h4>

            <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/60 max-h-96">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-900 text-slate-400 font-bold sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-2.5 whitespace-nowrap">Timestamp</th>
                    <th className="p-2.5 whitespace-nowrap">Lag 1h AQI</th>
                    <th className="p-2.5 whitespace-nowrap">Lag 24h AQI</th>
                    <th className="p-2.5 whitespace-nowrap">Temp (°C)</th>
                    <th className="p-2.5 whitespace-nowrap">Humidity (%)</th>
                    <th className="p-2.5 whitespace-nowrap">Wind (km/h)</th>
                    <th className="p-2.5 whitespace-nowrap">AQI Change Rate</th>
                    <th className="p-2.5 whitespace-nowrap">Dispersion Index</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                  {sampleRecords
                    .filter((r) => r.entityId.toLowerCase() === currentCity.toLowerCase())
                    .slice(0, 15)
                    .map((row) => (
                      <tr key={row.featureId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-2.5 text-slate-400 whitespace-nowrap">
                          {new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-2.5 font-bold text-emerald-400">{row.aqiLag1h}</td>
                        <td className="p-2.5 text-slate-300">{row.aqiLag24h}</td>
                        <td className="p-2.5">{row.temp}</td>
                        <td className="p-2.5">{row.humidity}</td>
                        <td className="p-2.5">{row.windSpeed}</td>
                        <td className={`p-2.5 font-bold ${row.aqiChangeRate >= 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
                          {row.aqiChangeRate >= 0 ? `+${row.aqiChangeRate}` : row.aqiChangeRate}
                        </td>
                        <td className="p-2.5 text-slate-400">{row.windDispersionIndex}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
