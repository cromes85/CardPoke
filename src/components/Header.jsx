import React from 'react';
import { Camera, Layers, Search, Volume2, VolumeX, Sparkles, Globe } from 'lucide-react';
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
    <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-900/90 border-b border-slate-800/80 shadow-md">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-4 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-4">
        
        {/* Logo & Brand */}
        <div 
          onClick={() => setActiveTab('scanner')} 
          className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none group shrink-0"
        >
          <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-red-600 via-rose-500 to-amber-400 p-[2px] shadow-lg shadow-red-500/20 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center overflow-hidden">
              <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-white/80 bg-red-600/90 relative flex items-center justify-center">
                <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            </div>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1">
              Poké<span className="text-red-500">Scan</span>
              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 font-semibold tracking-wide uppercase">
                v3.2
              </span>
            </h1>
            <p className="text-[9px] text-slate-400 font-medium hidden md:block">Scanner & Estimation Temps Réel</p>
          </div>
        </div>

        {/* Navigation Tabs (Fully Responsive) */}
        <nav className="flex items-center gap-0.5 sm:gap-1.5 bg-slate-950/80 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl border border-slate-800 shadow-inner">
          <button
            onClick={() => setActiveTab('scanner')}
            title="Scanner une carte"
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'scanner'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Scanner</span>
          </button>

          <button
            onClick={() => setActiveTab('collection')}
            title="Mon Classeur"
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all relative ${
              activeTab === 'collection'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Classeur</span>
            {collectionCount > 0 && (
              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 bg-emerald-500 text-slate-950 font-black rounded-full shadow-sm">
                {collectionCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('search')}
            title="Recherche de cartes"
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'search'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Recherche</span>
          </button>
        </nav>

        {/* Quick KPI & Sound Action */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Portfolio Value Pill */}
          {totalValueEur > 0 && (
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 text-[11px] sm:text-xs font-bold shadow-sm">
              <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse hidden sm:inline" />
              <span>{totalValueEur.toFixed(2)} €</span>
            </div>
          )}

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? "Couper les effets sonores" : "Activer les effets sonores"}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-800/90 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700/60 transition-colors shrink-0"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>

      </div>
    </header>
  );
}
