import React from 'react';
import { Camera, Layers, Search, Volume2, VolumeX, Sparkles, HelpCircle, Globe } from 'lucide-react';
import { soundManager } from '../utils/audio';

export default function Header({ 
  activeTab, 
  setActiveTab, 
  collectionCount, 
  totalValueEur, 
  soundEnabled, 
  setSoundEnabled,
  onOpenDeployGuide
}) {
  const toggleSound = () => {
    const newState = soundManager.toggle();
    setSoundEnabled(newState);
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-900/80 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Brand */}
        <div 
          onClick={() => setActiveTab('scanner')} 
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <div className="relative w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 via-rose-500 to-amber-400 p-[2px] shadow-lg shadow-red-500/20 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center overflow-hidden">
              <div className="w-4 h-4 rounded-full border-2 border-white/80 bg-red-600/90 relative flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            </div>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
              Poké<span className="text-red-500">Scan</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 font-semibold tracking-wide uppercase">v2.6</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium hidden sm:block">Scanner & Estimation Temps Réel</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 shadow-inner">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'scanner'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Scanner</span>
          </button>

          <button
            onClick={() => setActiveTab('collection')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all relative ${
              activeTab === 'collection'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Collection</span>
            {collectionCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500 text-slate-950 font-bold rounded-full">
                {collectionCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'search'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Recherche</span>
          </button>
        </nav>

        {/* Quick KPI & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Portfolio Value Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Valeur : <strong className="text-white text-sm">{totalValueEur.toFixed(2)} €</strong></span>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? "Couper les effets sonores" : "Activer les effets sonores"}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700/60 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* GitHub Pages Deploy Guide */}
          <button
            onClick={onOpenDeployGuide}
            title="Guide de déploiement GitHub Pages"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-colors"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span className="hidden lg:inline">GitHub Pages</span>
          </button>
        </div>
      </div>
    </header>
  );
}
