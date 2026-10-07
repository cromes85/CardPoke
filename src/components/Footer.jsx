import React from 'react';
import { Heart, ShieldCheck, Database, Sparkles } from 'lucide-react';

export default function Footer({ onOpenDeployGuide }) {
  return (
    <footer className="border-t border-slate-800 bg-slate-950/80 text-slate-500 py-8 px-4 sm:px-6 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        
        {/* Left Info */}
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-400">PokéScan Live</span>
          <span>•</span>
          <span>Données & cotes en direct via</span>
          <a
            href="https://www.tcgdex.net"
            target="_blank"
            rel="noreferrer"
            className="text-red-400 hover:underline font-semibold"
          >
            TCGdex
          </a>
          <span>&</span>
          <a
            href="https://www.cardmarket.com"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline font-semibold"
          >
            Cardmarket
          </a>
        </div>

        {/* Right Links */}
        <div className="flex items-center gap-4">
          <button
            onClick={onOpenDeployGuide}
            className="hover:text-slate-300 transition-colors"
          >
            Guide GitHub Pages
          </button>
          <span>•</span>
          <span className="text-[11px] text-slate-600">
            Pokémon est une marque déposée de Nintendo / Creatures Inc. / GAME FREAK inc.
          </span>
        </div>

      </div>
    </footer>
  );
}
