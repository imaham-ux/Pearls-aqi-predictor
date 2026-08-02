import React, { useState } from 'react';
import { MLModelMeta, MLModelType } from '../types';
import { Cpu, CheckCircle2, Play, Zap, Shield, Sliders, Trophy, ArrowUpRight, Clock, Award } from 'lucide-react';

interface ModelRegistryViewProps {
  models: MLModelMeta[];
  onSetActiveModel: (modelId: string) => void;
  onTrainModel: (type: MLModelType, hyperparams: Record<string, any>) => void;
}

export const ModelRegistryView: React.FC<ModelRegistryViewProps> = ({
  models,
  onSetActiveModel,
  onTrainModel
}) => {
  const [selectedType, setSelectedType] = useState<MLModelType>('Random Forest Regressor');
  const [nEstimators, setNEstimators] = useState<number>(100);
  const [maxDepth, setMaxDepth] = useState<number>(12);
  const [learningRate, setLearningRate] = useState<number>(0.05);
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [trainingSuccess, setTrainingSuccess] = useState<boolean>(false);

  const activeModel = models.find((m) => m.active) || models[0];

  const handleTrainSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsTraining(true);
    setTrainingSuccess(false);

    let hyperparams: Record<string, any> = {};
    if (selectedType === 'Random Forest Regressor') {
      hyperparams = { n_estimators: nEstimators, max_depth: maxDepth, bootstrap: true };
    } else if (selectedType === 'XGBoost Gradient Booster') {
      hyperparams = { n_estimators: nEstimators, learning_rate: learningRate, max_depth: maxDepth };
    } else if (selectedType === 'TensorFlow Deep MLP') {
      hyperparams = { layers: [128, 64, 32], activation: 'relu', optimizer: 'adam' };
    } else {
      hyperparams = { alpha: 1.0, solver: 'lsqr' };
    }

    setTimeout(() => {
      onTrainModel(selectedType, hyperparams);
      setIsTraining(false);
      setTrainingSuccess(true);
      setTimeout(() => setTrainingSuccess(false), 4000);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Title Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-semibold mb-1">
            <Cpu className="w-4 h-4" />
            <span>Serverless Model Registry & Deployment Hub</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Machine Learning Model Comparison & Registry
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Evaluate metrics (RMSE, MAE, R²), promote champion models to active deployment slots, or train custom deep neural network & gradient boosted models.
          </p>
        </div>

        {activeModel && (
          <div className="bg-slate-950/80 border border-emerald-500/40 p-3.5 rounded-xl flex items-center space-x-3 shadow-md">
            <Trophy className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Champion Model</div>
              <div className="text-xs font-extrabold text-white">{activeModel.name}</div>
              <div className="text-[10px] text-emerald-400 font-mono">RMSE: {activeModel.metrics.rmse} | R²: {activeModel.metrics.r2}</div>
            </div>
          </div>
        )}
      </div>

      {/* Model Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {models.map((m) => {
          const isActive = m.active;
          return (
            <div
              key={m.modelId}
              className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                isActive
                  ? 'bg-slate-800/90 border-emerald-500 shadow-xl ring-1 ring-emerald-500/50'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                    {m.type}
                  </span>
                  {isActive ? (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  ) : null}
                </div>

                <h3 className="text-sm font-bold text-slate-100">{m.name}</h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {m.modelId}</p>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-center">
                  <div className="bg-slate-950/60 p-2 rounded-lg">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">RMSE</p>
                    <p className="text-xs font-black text-emerald-400">{m.metrics.rmse}</p>
                  </div>

                  <div className="bg-slate-950/60 p-2 rounded-lg">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">MAE</p>
                    <p className="text-xs font-black text-cyan-400">{m.metrics.mae}</p>
                  </div>

                  <div className="bg-slate-950/60 p-2 rounded-lg">
                    <p className="text-[9px] text-slate-400 uppercase font-bold">R²</p>
                    <p className="text-xs font-black text-amber-400">{m.metrics.r2}</p>
                  </div>
                </div>
              </div>

              {!isActive ? (
                <button
                  onClick={() => onSetActiveModel(m.modelId)}
                  className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold py-2 rounded-xl transition-all"
                >
                  Set as Active Model
                </button>
              ) : (
                <div className="text-center text-[11px] font-bold text-emerald-400 py-1.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  Serving 3-Day Forecasts
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Model Training Playground Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-bold text-slate-200">
            Automated Model Training & Hyperparameter Playground
          </h3>
        </div>

        <form onSubmit={handleTrainSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end text-xs">
          <div className="md:col-span-3">
            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
              ML Algorithm Architecture
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as MLModelType)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="Random Forest Regressor">Random Forest Regressor</option>
              <option value="XGBoost Gradient Booster">XGBoost Gradient Booster</option>
              <option value="TensorFlow Deep MLP">TensorFlow Deep MLP Net</option>
              <option value="Ridge Regression">Ridge Linear Baseline</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
              {selectedType.includes('Tree') || selectedType.includes('Forest') || selectedType.includes('XGBoost') ? 'Trees (n_estimators)' : 'Hidden Layers'}
            </label>
            <input
              type="number"
              min="10"
              max="500"
              value={nEstimators}
              onChange={(e) => setNEstimators(parseInt(e.target.value, 10))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
              Max Depth / Learning Rate
            </label>
            <input
              type="number"
              min="2"
              max="30"
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value, 10))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={isTraining}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              {isTraining ? (
                <>
                  <Zap className="w-4 h-4 animate-bounce" />
                  <span>Training Model...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Execute Training Job</span>
                </>
              )}
            </button>
          </div>
        </form>

        {trainingSuccess && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3 rounded-xl text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>New model successfully trained, evaluated against Hopsworks Feature Store split, and saved to Model Registry!</span>
          </div>
        )}
      </div>
    </div>
  );
};
