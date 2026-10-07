import React, { useState, useMemo, useRef } from 'react';
import { 
  Layers, 
  Trash2, 
  Download, 
  Upload, 
  Sparkles, 
  TrendingUp, 
  ArrowUpDown, 
  ExternalLink,
  Search,
  CheckCircle,
  FileSpreadsheet,
  Filter
} from 'lucide-react';
import { 
  exportCollectionToCsv, 
  exportCollectionToJson, 
  importCollectionFromJson 
} from '../utils/storage';
import { getCardCategoryInfo } from '../utils/tcgApi';

export default function Collection({ 
  collection = [], 
  onRemoveCard, 
  onSelectCard, 
  onReloadCollection 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc'); // 'price_desc', 'price_asc', 'date_desc', 'name_asc'
  const fileInputRef = useRef(null);

  // Calculate KPIs
  const totalValueEur = useMemo(() => {
    return collection.reduce((sum, item) => sum + (Number(item.priceEur) || 0), 0);
  }, [collection]);

  const topCard = useMemo(() => {
    if (collection.length === 0) return null;
    return [...collection].sort((a, b) => (Number(b.priceEur) || 0) - (Number(a.priceEur) || 0))[0];
  }, [collection]);

  // Filter & Sort cards
  const filteredCards = useMemo(() => {
    let list = [...collection];
    
    // 1. Text Search Filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(c => 
        c.name.toLowerCase().includes(q) || 
        (c.set?.name || '').toLowerCase().includes(q) ||
        (c.localId || '').includes(q)
      );
    }

    // 2. Category & Stage Filter
    if (selectedCategory !== 'all') {
      list = list.filter(c => {
        const catInfo = c.categoryInfo || getCardCategoryInfo(c);
        const name = (c.name || '').toLowerCase();
        const stage = (catInfo.stage || '').toLowerCase();
        const cat = (catInfo.category || '').toLowerCase();

        switch (selectedCategory) {
          case 'base':
            return stage === 'base' && cat === 'pokémon';
          case 'stage1':
            return stage === 'niveau 1' || stage === 'stage 1';
          case 'stage2':
            return stage === 'niveau 2' || stage === 'stage 2';
          case 'trainer':
            return cat === 'dresseur';
          case 'energy':
            return cat === 'énergie';
          case 'ultra':
            return name.includes(' ex') || name.includes('-ex') || name.includes(' vmax') || name.includes(' vstar') || name.endsWith(' v') || stage === 'ex' || stage === 'vmax' || stage === 'vstar';
          default:
            return true;
        }
      });
    }

    // 3. Sorting
    switch (sortBy) {
      case 'price_desc':
        return list.sort((a, b) => (Number(b.priceEur) || 0) - (Number(a.priceEur) || 0));
      case 'price_asc':
        return list.sort((a, b) => (Number(a.priceEur) || 0) - (Number(b.priceEur) || 0));
      case 'name_asc':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'date_desc':
      default:
        return list.sort((a, b) => new Date(b.scannedAt || 0) - new Date(a.scannedAt || 0));
    }
  }, [collection, searchTerm, selectedCategory, sortBy]);

  // Handle JSON Import
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const imported = importCollectionFromJson(parsed);
        if (imported) {
          onReloadCollection();
        }
      } catch (err) {
        alert("Erreur lors de l'import : fichier JSON invalide");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 w-full space-y-6">
      
      {/* Portfolio Header & KPIs (Fully Responsive Grid) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
        
        {/* Total Portfolio Value */}
        <div className="col-span-2 md:col-span-1 p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider block">
              Valeur Totale Portfolio
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white mt-0.5 block">
              {totalValueEur.toFixed(2)} €
            </span>
            <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 block">
              Calculé selon Cardmarket
            </span>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Total Cards Count */}
        <div className="col-span-1 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Cartes
            </span>
            <span className="text-xl sm:text-3xl font-black text-white mt-0.5 block">
              {collection.length}
            </span>
            <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 block truncate">
              Enregistrées
            </span>
          </div>
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
            <Layers className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Top Card */}
        <div className="col-span-1 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
          <div className="truncate mr-1">
            <span className="text-[10px] sm:text-xs font-bold text-amber-400 uppercase tracking-wider block">
              Top Cote
            </span>
            <span className="text-xs sm:text-lg font-black text-white mt-0.5 truncate block">
              {topCard ? topCard.name : 'Aucune'}
            </span>
            <span className="text-xs font-bold text-emerald-400 mt-0.5 block">
              {topCard ? `${topCard.priceEur.toFixed(2)} €` : '—'}
            </span>
          </div>
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Sparkles className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

      </div>

      {/* Toolbar: Search, Sort & Export Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/90 p-3 rounded-2xl border border-slate-800 shadow-lg">
        
        {/* Search & Filter */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrer par nom ou série..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-red-500"
          />
        </div>

        {/* Sort and Export Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          
          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-950 text-slate-300 text-xs rounded-xl px-2.5 py-1.5 border border-slate-700 focus:outline-none"
          >
            <option value="date_desc">📅 Plus récentes d'abord</option>
            <option value="price_desc">💎 Prix : Décroissant</option>
            <option value="price_asc">🪙 Prix : Croissant</option>
            <option value="name_asc">🔤 Nom : A-Z</option>
          </select>

          {/* Export CSV */}
          <button
            onClick={() => exportCollectionToCsv(collection)}
            disabled={collection.length === 0}
            title="Exporter en CSV (Excel)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV</span>
          </button>

          {/* Export JSON */}
          <button
            onClick={() => exportCollectionToJson(collection)}
            disabled={collection.length === 0}
            title="Sauvegarde JSON"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>JSON</span>
          </button>

          {/* Import JSON */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Restaurer une sauvegarde JSON"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      {/* Category Filter Chips Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'all', label: 'Tous', icon: '✨' },
          { id: 'base', label: 'Base', icon: '⚡' },
          { id: 'stage1', label: 'Niveau 1', icon: '🔷' },
          { id: 'stage2', label: 'Niveau 2', icon: '⭐' },
          { id: 'trainer', label: 'Dresseurs', icon: '🎒' },
          { id: 'energy', label: 'Énergies', icon: '🔮' },
          { id: 'ultra', label: 'Ultra / ex', icon: '👑' },
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              selectedCategory === cat.id
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'bg-slate-900/90 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      {filteredCards.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredCards.map((item) => {
            const catInfo = item.categoryInfo || getCardCategoryInfo(item);
            return (
              <div
                key={item.id}
                className="group relative rounded-2xl bg-slate-900 border border-slate-800 hover:border-red-500/50 p-3 shadow-xl transition-all hover:-translate-y-1 flex flex-col justify-between"
              >
                {/* Image Box */}
                <div 
                  onClick={() => onSelectCard(item)}
                  className="cursor-pointer relative aspect-[63/88] rounded-xl overflow-hidden bg-slate-950 mb-2.5"
                >
                  <img
                    src={item.image || item.userPhoto}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-black shadow-md">
                    {item.priceEur.toFixed(2)} €
                  </span>
                  <span className="absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-300 font-mono">
                    #{item.localId}
                  </span>
                  <span className={`absolute top-1.5 left-1.5 text-[8px] sm:text-[9px] px-1.5 py-0.2 rounded font-bold backdrop-blur-md border ${catInfo.chipClass}`}>
                    {catInfo.badge}
                  </span>
                </div>

                {/* Card Meta & Actions */}
                <div>
                  <h4 
                    onClick={() => onSelectCard(item)}
                    className="cursor-pointer font-bold text-xs text-white truncate group-hover:text-red-400 transition-colors"
                  >
                    {item.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 truncate">
                    {item.set?.name || 'Série'} • {catInfo.label}
                  </p>

                  {/* Delete button */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800">
                    <span className="text-[9px] text-slate-500">
                      {new Date(item.scannedAt).toLocaleDateString('fr-FR')}
                    </span>
                    <button
                      onClick={() => onRemoveCard(item.id)}
                      title="Supprimer de la collection"
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 bg-slate-900/40 rounded-3xl border border-slate-800">
          <Layers className="w-12 h-12 text-slate-600 mb-3" />
          <h3 className="text-white font-bold text-base mb-1">Votre collection est vide</h3>
          <p className="text-xs text-slate-400 max-w-sm mb-4">
            Utilisez le scanner pour scanner vos premières cartes Pokémon ou effectuez une recherche manuelle pour les ajouter.
          </p>
        </div>
      )}

    </div>
  );
}
