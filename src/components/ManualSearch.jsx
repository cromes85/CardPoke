import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Filter, AlertCircle, Loader2 } from 'lucide-react';
import { searchCardsLive, getCardDetails } from '../utils/tcgApi';

const QUICK_SEARCH_CHIPS = [
  'Dracaufeu',
  'Pikachu',
  'Groudon',
  'Beldeneige',
  'Gengar',
  'Mewtwo',
  'Évoli',
  'Amos de la Team Rocket',
  'Rayquaza'
];

export default function ManualSearch({ initialQuery = '', onSelectCard }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Trigger search with debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      const data = await searchCardsLive(query);
      setResults(data);
      setIsLoading(false);
      setHasSearched(true);
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle card click
  const handleCardClick = async (cardSummary) => {
    setIsLoading(true);
    const fullDetails = await getCardDetails(cardSummary.id);
    setIsLoading(false);
    if (fullDetails) {
      onSelectCard(fullDetails);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 w-full space-y-6">
      
      {/* Search Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center justify-center gap-2">
          <span>Recherche</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-amber-400">
            Base de Données
          </span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          Recherchez n'importe quelle carte parmi les 20 000+ références Pokémon officielles
        </p>
      </div>

      {/* Main Search Input Bar */}
      <div className="relative max-w-2xl mx-auto">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom du Pokémon ou numéro (ex: Groudon, 108, Beldeneige)..."
            className="w-full pl-12 pr-12 py-3.5 rounded-2xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 shadow-xl transition-all"
          />
          {isLoading ? (
            <Loader2 className="absolute right-4 w-5 h-5 text-red-500 animate-spin" />
          ) : query ? (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 text-xs font-bold text-slate-400 hover:text-white p-1 rounded-md"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center gap-1.5 flex-wrap mt-3 justify-center">
          <span className="text-[11px] text-slate-500 font-semibold mr-1">Populaires :</span>
          {QUICK_SEARCH_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => setQuery(chip)}
              className="px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700/60 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Results Grid */}
      <div className="mt-8">
        {results.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {results.map((card) => (
              <div
                key={card.id}
                onClick={() => handleCardClick(card)}
                className="group cursor-pointer rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/50 p-2.5 shadow-lg hover:shadow-red-500/10 transition-all hover:-translate-y-1 flex flex-col justify-between"
              >
                <div className="relative aspect-[63/88] rounded-xl overflow-hidden bg-slate-950 mb-2">
                  {card.image ? (
                    <img
                      src={`${card.image}/low.webp`}
                      alt={card.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      ⚡
                    </div>
                  )}
                  <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-300 font-mono border border-slate-700">
                    #{card.localId}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-xs text-white truncate group-hover:text-red-400 transition-colors">
                    {card.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 truncate">
                    {card.id}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : hasSearched && !isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 bg-slate-900/50 rounded-3xl border border-slate-800">
            <AlertCircle className="w-10 h-10 text-slate-500 mb-2" />
            <h4 className="text-white font-bold text-sm">Aucune carte trouvée</h4>
            <p className="text-xs text-slate-400 mt-1">
              Essayez avec un autre nom de Pokémon ou vérifiez l'orthographe.
            </p>
          </div>
        ) : null}
      </div>

    </div>
  );
}
