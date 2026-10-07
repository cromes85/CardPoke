import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Sparkles, 
  X, 
  Download, 
  BookmarkPlus, 
  TrendingUp, 
  Coins, 
  Layers, 
  ExternalLink, 
  Flame, 
  CheckCircle2, 
  ArrowUpDown,
  Search
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { exportCollectionToCsv } from '../utils/storage';
import { getCardCategoryInfo } from '../utils/tcgApi';

export default function BatchRecapModal({ sessionCards, onSaveAllToCollection, onRestartScan, onClose }) {
  const [filterQuery, setFilterQuery] = useState('');
  const [sortBy, setSortBy] = useState('price_desc'); // 'price_desc', 'price_asc', 'name', 'scan_order'
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Trigger celebratory confetti on mount
  useEffect(() => {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {}
  }, []);

  // Compute Session Metrics
  const totalCards = sessionCards.length;
  const totalValueEur = sessionCards.reduce((sum, item) => {
    const p = Number(item.card?.pricing?.estimatedEur || item.card?.pricing?.cardmarket?.trend || 0);
    return sum + p;
  }, 0);

  const avgPriceEur = totalCards > 0 ? (totalValueEur / totalCards).toFixed(2) : '0.00';
  
  const profitableGradingCount = sessionCards.filter(item => 
    item.card?.grading?.status === 'TRES_RENTABLE' || item.card?.grading?.status === 'RENTABLE_SI_10'
  ).length;

  // Sorted and Filtered Cards
  const processedCards = [...sessionCards]
    .filter(item => {
      if (!filterQuery) return true;
      const q = filterQuery.toLowerCase();
      return (
        item.card?.name?.toLowerCase().includes(q) ||
        item.card?.set?.name?.toLowerCase().includes(q) ||
        item.card?.localId?.includes(q)
      );
    })
    .sort((a, b) => {
      const priceA = Number(a.card?.pricing?.estimatedEur || 0);
      const priceB = Number(b.card?.pricing?.estimatedEur || 0);

      if (sortBy === 'price_desc') return priceB - priceA;
      if (sortBy === 'price_asc') return priceA - priceB;
      if (sortBy === 'name') return (a.card?.name || '').localeCompare(b.card?.name || '');
      return 0; // scan order
    });

  // Top 3 Hits
  const topHits = [...sessionCards]
    .sort((a, b) => Number(b.card?.pricing?.estimatedEur || 0) - Number(a.card?.pricing?.estimatedEur || 0))
    .slice(0, 3);

  // Export session to CSV
  const handleExportCsv = () => {
    const formattedForCsv = sessionCards.map(item => ({
      name: item.card?.name || 'Inconnu',
      set: item.card?.set?.name || 'Extension',
      localId: item.card?.localId || '',
      rarity: item.card?.rarity || 'Commune',
      priceEur: item.card?.pricing?.estimatedEur || '0.00',
      condition: 'Near Mint (NM)',
      savedAt: item.timestamp || new Date().toISOString()
    }));
    exportCollectionToCsv(formattedForCsv);
  };

  const handleSaveAll = () => {
    onSaveAllToCollection(sessionCards);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md bg-slate-950/95 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-red-950/60 via-slate-900 to-amber-950/40 border-b border-slate-800 flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/20">
              <Trophy className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-black text-white flex items-center gap-2">
                <span>Session de Scan Terminée !</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  {totalCards} cartes
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Support 3D & Scanner à la volée • Récapitulatif financier Cardmarket
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          
          {/* Key KPI Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-semibold">Total Cartes</span>
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {totalCards}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-slate-800/80 border border-emerald-500/30 flex flex-col justify-between shadow-lg shadow-emerald-950/20">
              <div className="flex items-center justify-between text-emerald-400 mb-1">
                <span className="text-xs font-semibold">Valeur du Lot</span>
                <Coins className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-300">
                {totalValueEur.toFixed(2)} €
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-semibold">Moyenne / Carte</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {avgPriceEur} €
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs font-semibold">Pépites PSA 10</span>
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-purple-300">
                {profitableGradingCount}
              </div>
            </div>
          </div>

          {/* Top 3 Hits Podium */}
          {topHits.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2 mb-3 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <Flame className="w-4 h-4" />
                <span>Pépites du Tirage (Top 3 des Plus Grandes Valeurs)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {topHits.map((item, idx) => {
                  const medalColors = [
                    'border-amber-400/50 bg-amber-500/10 text-amber-300',
                    'border-slate-300/50 bg-slate-400/10 text-slate-200',
                    'border-amber-700/50 bg-amber-800/10 text-amber-600'
                  ];
                  const medalTitles = ['🥇 1er TOP HIT', '🥈 2e TOP HIT', '🥉 3e TOP HIT'];

                  return (
                    <div 
                      key={idx}
                      className={`p-3 rounded-xl border flex items-center gap-3 ${medalColors[idx] || 'border-slate-800'}`}
                    >
                      <div className="w-12 h-16 rounded-lg bg-slate-900 overflow-hidden shrink-0 border border-slate-700 flex items-center justify-center">
                        {item.card?.imageLow || item.card?.image ? (
                          <img 
                            src={item.card.imageLow || item.card.image} 
                            alt={item.card.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-500">Img</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-black uppercase block opacity-80">
                          {medalTitles[idx]}
                        </span>
                        <h4 className="text-sm font-bold text-white truncate">
                          {item.card?.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[8px] px-1.5 py-0.2 rounded font-bold border ${(item.card?.categoryInfo || getCardCategoryInfo(item.card)).chipClass}`}>
                            {(item.card?.categoryInfo || getCardCategoryInfo(item.card)).badge}
                          </span>
                          <span className="text-xs text-slate-400 truncate">
                            #{item.card?.localId}
                          </span>
                        </div>
                        <div className="mt-1 font-black text-sm text-emerald-400">
                          {Number(item.card?.pricing?.estimatedEur || 0).toFixed(2)} €
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detailed Cards Table / List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Détail de toutes les cartes scannées ({processedCards.length})
                </h3>
              </div>

              {/* Filters & Sorting */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrer par nom / set..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-red-500 w-44"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-transparent text-slate-300 text-xs font-semibold focus:outline-none pr-1"
                  >
                    <option value="price_desc" className="bg-slate-900">Prix Décroissant</option>
                    <option value="price_asc" className="bg-slate-900">Prix Croissant</option>
                    <option value="name" className="bg-slate-900">Nom (A-Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Scrollable Item Rows */}
            <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-2xl bg-slate-950/60 overflow-hidden max-h-[38vh] overflow-y-auto">
              {processedCards.map((item, idx) => {
                const card = item.card;
                const catInfo = card?.categoryInfo || getCardCategoryInfo(card);
                const price = Number(card?.pricing?.estimatedEur || 0).toFixed(2);
                const isProfitable = card?.grading?.status === 'TRES_RENTABLE';

                return (
                  <div key={idx} className="p-2.5 sm:p-3 flex items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono font-bold text-slate-500 w-5 text-right">
                        {idx + 1}
                      </span>

                      <div className="w-10 h-14 rounded-md bg-slate-900 border border-slate-700/80 overflow-hidden shrink-0 flex items-center justify-center">
                        {card?.imageLow || card?.image ? (
                          <img src={card.imageLow || card.image} alt={card.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[9px] text-slate-600">Img</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                            {card?.name}
                          </h4>
                          <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.2 rounded font-bold border ${catInfo.chipClass}`}>
                            {catInfo.badge}
                          </span>
                          {isProfitable && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                              PÉPITE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {card?.set?.name} • #{card?.localId} • {card?.rarity}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs sm:text-sm font-black text-emerald-400">
                        {price} €
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Cardmarket
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap sticky bottom-0 z-20">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Exporter Excel / CSV</span>
            </button>

            <button
              onClick={handleSaveAll}
              disabled={savedSuccess}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                savedSuccess
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
              }`}
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ajouté au Classeur !</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Tout ajouter au Classeur</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRestartScan}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-xl shadow-red-600/30 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Nouvelle Session</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
