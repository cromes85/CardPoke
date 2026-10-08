import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans">
      <div className="max-w-md w-full text-center space-y-6 bg-slate-900/60 p-8 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-sm">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-3xl">
          ✨
        </div>
        
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            CardPoke
          </h1>
          <p className="text-sm text-slate-400">
            Projet réinitialisé à zéro (Clean Slate / From Scratch).
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 text-left space-y-2">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Statut : Prêt pour le nouveau départ
          </div>
          <p>
            Toutes les versions précédentes sont sauvegardées et archivées sur la branche Git <code className="text-indigo-400 font-mono">archive/v3-scanner</code>.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          En attente de vos nouvelles directives.
        </div>
      </div>
    </div>
  );
}
