import React, { useState } from 'react';
import { PipelineRun } from '../types';
import { GitBranch, Play, CheckCircle2, RefreshCw, Clock, ArrowRight, ShieldCheck, Terminal, Server } from 'lucide-react';

interface PipelineWorkflowViewProps {
  runs: PipelineRun[];
  onTriggerPipeline: (type: 'feature_ingestion' | 'model_training') => void;
}

export const PipelineWorkflowView: React.FC<PipelineWorkflowViewProps> = ({
  runs,
  onTriggerPipeline
}) => {
  const [selectedRunId, setSelectedRunId] = useState<string>(runs[0]?.id || '');
  const [isTriggering, setIsTriggering] = useState<boolean>(false);

  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs[0];

  const handleManualTrigger = (type: 'feature_ingestion' | 'model_training') => {
    setIsTriggering(true);
    setTimeout(() => {
      onTriggerPipeline(type);
      setIsTriggering(false);
    }, 1200);
  };

  const dagNodes = [
    { name: 'API Fetch', desc: 'AQICN & OpenWeather APIs', status: 'completed' },
    { name: 'Feature Eng.', desc: 'Lags, ratios & dispersion', status: 'completed' },
    { name: 'Feature Store', desc: 'Hopsworks Online/Offline', status: 'completed' },
    { name: 'Model Training', desc: 'Random Forest / XGBoost', status: 'completed' },
    { name: 'Model Registry', desc: 'Evaluation & Champion Slot', status: 'completed' },
    { name: 'Inference API', desc: '3-Day Forecast Serving', status: 'active' }
  ];

  return (
    <div className="space-y-6">
      {/* Title Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-semibold mb-1">
            <GitBranch className="w-4 h-4" />
            <span>Automated CI/CD Pipeline Architecture</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Apache Airflow & GitHub Actions DAG Pipelines
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Feature pipelines execute hourly (`0 * * * *`) to compute online features; training pipelines run daily to re-evaluate and register updated model weights.
          </p>
        </div>

        {/* Trigger Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleManualTrigger('feature_ingestion')}
            disabled={isTriggering}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTriggering ? 'animate-spin' : ''}`} />
            <span>Trigger Feature Ingestion</span>
          </button>

          <button
            onClick={() => handleManualTrigger('model_training')}
            disabled={isTriggering}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Trigger Retraining Job</span>
          </button>
        </div>
      </div>

      {/* Visual DAG Pipeline Graph */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          End-to-End Serverless Machine Learning DAG Execution Topology
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          {dagNodes.map((node, i) => (
            <div
              key={node.name}
              className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl text-center space-y-1.5 relative group hover:border-emerald-500/50 transition-all"
            >
              <div className="text-[10px] text-emerald-400 font-mono font-bold">Step 0{i + 1}</div>
              <div className="text-xs font-extrabold text-slate-100">{node.name}</div>
              <div className="text-[10px] text-slate-400">{node.desc}</div>

              <div className="pt-2 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1.5" />
                <span className="text-[9px] text-emerald-400 font-bold uppercase">Healthy</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline Runs Table & Execution Log Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Runs History Table */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3 flex items-center justify-between">
            <span>Pipeline Execution History</span>
            <span className="text-xs text-slate-400">{runs.length} Runs Logged</span>
          </h3>

          <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-80">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3">Run Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {runs.map((r) => {
                  const isSelected = selectedRunId === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRunId(r.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-slate-800 font-bold text-white' : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="p-3 font-sans">
                        <div className="font-bold text-slate-200">{r.name}</div>
                        <div className="text-[10px] text-slate-500">{new Date(r.startTime).toLocaleTimeString()}</div>
                      </td>
                      <td className="p-3 text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 uppercase">
                          {r.type}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3">{r.durationSeconds}s</td>
                      <td className="p-3">{r.recordsProcessed.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Run Console Logs */}
        <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
            <div className="flex items-center space-x-2 text-slate-200 font-bold">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Pipeline Log Console</span>
            </div>
            <span className="text-[10px] text-slate-500">{selectedRun?.id}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 text-[11px] space-y-1.5 text-slate-300 max-h-72 overflow-y-auto">
            <div className="text-slate-500 border-b border-slate-800/80 pb-1 mb-2">
              Triggered By: <span className="text-slate-300 font-bold">{selectedRun?.triggeredBy}</span>
            </div>

            {selectedRun?.logs.map((log, idx) => (
              <div key={idx} className="flex items-start space-x-2 text-emerald-300/90">
                <span className="text-slate-600 select-none">&gt;</span>
                <span>{log}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
