import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  X, 
  Sparkles, 
  ExternalLink, 
  BookmarkPlus, 
  CheckCircle, 
  TrendingUp, 
  Award,
  RefreshCw,
  Search,
  ChevronRight,
  Edit3,
  Layers,
  Shield,
  Zap
} from 'lucide-react';
import HoloCard3D from './HoloCard3D';
import { soundManager } from '../utils/audio';
import { getCardCategoryInfo } from '../utils/tcgApi';

export default function CardResultModal({ 
  card, 
  alternatives = [], 
  ocrMeta = {},
  userCroppedImage,
  onSaveToCollection, 
  onSelectAlternative, 
  onManualSearchFallback,
  onUpdateSearch,
  onClose 
}) {
  const [condition, setCondition] = useState('Near Mint');
  const [selectedFinish, setSelectedFinish] = useState('normal'); // 'normal' | 'holo' | 'reverse'
  const [userNote, setUserNote] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  // Quick Inline Edit Mode
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(card?.name || '');
  const [editNumber, setEditNumber] = useState(card?.localId || '');

  if (!card) return null;

  const {
    name,
    localId,
    rarity,
    set,
    pricing,
    grading,
    image,
    links
  } = card;

  const categoryInfo = card.categoryInfo || getCardCategoryInfo(card);
  const cm = pricing?.cardmarket || {};
  const tcg = pricing?.tcgplayer || {};

  // Compute Active Price based on selected finish
  const activePriceEur = selectedFinish === 'holo' && cm.holo
    ? cm.holo
    : selectedFinish === 'reverse' && cm.reverse
    ? cm.reverse
    : pricing?.estimatedEur || '0.20';

  // Trigger celebration confetti & sound when saving
  const handleSave = () => {
    if (isSaved) return;

    soundManager.playSuccess();
    if (grading?.status === 'TRES_RENTABLE') {
      soundManager.playRareFanfare();
    }

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      console.warn("Confetti error:", e);
    }

    const cardWithFinishPrice = {
      ...card,
      pricing: {
        ...pricing,
        estimatedEur: activePriceEur
      },
      selectedFinish
    };

    onSaveToCollection(cardWithFinishPrice, userCroppedImage, condition, userNote);
    setIsSaved(true);
  };

  const handleApplyEdit = (e) => {
    e.preventDefault();
    if (onUpdateSearch) {
      onUpdateSearch({
        name: editName,
        localId: editNumber
      });
    }
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md bg-slate-950/90 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
        
        {/* Top Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Sparkles className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">{name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  #{localId}{set?.cardCount?.official ? `/${set.cardCount.official}` : ''}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black tracking-wide border ${categoryInfo.chipClass}`}>
                  {categoryInfo.badge}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                <span>{set?.name || 'Extension'}</span>
                <span>•</span>
                <span>{rarity}</span>
                {card.hp && (
                  <>
                    <span>•</span>
                    <span className="text-red-400 font-bold font-mono">{card.hp} PV</span>
                  </>
                )}
                {card.types && card.types.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-amber-300 font-semibold">{card.types.join(' / ')}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsEditing(!isEditing)}
              title="Ajuster les termes recherchés"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Corriger</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Correction Bar */}
        {isEditing && (
          <form onSubmit={handleApplyEdit} className="p-3 bg-slate-950 border-b border-slate-800 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-medium">Recherche rapide :</span>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nom du Pokémon..."
              className="px-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
            <input
              type="text"
              value={editNumber}
              onChange={(e) => setEditNumber(e.target.value)}
              placeholder="N° (ex: 108)..."
              className="w-24 px-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Mettre à jour
            </button>
          </form>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: 3D Card & Alternatives */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-full max-w-[260px]">
                <HoloCard3D
                  imageUrl={image || userCroppedImage}
                  name={name}
                  rarity={rarity}
                />
              </div>

              {/* Set Info */}
              <div className="mt-3 flex items-center gap-2 p-2 rounded-2xl bg-slate-800/60 border border-slate-700/60 w-full max-w-[260px]">
                {set?.symbol && (
                  <img src={set.symbol} alt="Symbole" className="w-5 h-5 object-contain" />
                )}
                <div className="text-xs truncate">
                  <span className="text-slate-400 block text-[9px]">Extension</span>
                  <span className="text-white font-semibold truncate block">{set?.name}</span>
                </div>
              </div>

              {/* Alternative Cards Quick Carousel */}
              {alternatives && alternatives.length > 0 && (
                <div className="w-full max-w-[260px] mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Autres versions ({alternatives.length}) :
                    </span>
                    <span className="text-[9px] text-amber-400 font-semibold animate-pulse">
                      1 clic pour changer
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {alternatives.map((alt) => (
                      <button
                        key={alt.id}
                        onClick={() => onSelectAlternative(alt.id)}
                        className="w-full text-left p-2 rounded-xl bg-slate-950/90 hover:bg-slate-800/90 border border-slate-800/90 hover:border-red-500/40 text-xs text-slate-300 hover:text-white flex items-center justify-between transition-all group shadow-sm"
                      >
                        <div className="truncate mr-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-bold text-white group-hover:text-red-400 truncate text-[11px]">{alt.name}</span>
                            {alt.hp && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-red-950/60 text-red-300 border border-red-500/20 font-mono font-semibold shrink-0">
                                {alt.hp} PV
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                            {alt.set?.name || alt.id}
                          </span>
                        </div>
                        <div className="flex flex-col items-end shrink-0 gap-0.5">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-400 font-bold">
                            #{alt.localId}
                          </span>
                          <span className="text-[9px] text-slate-500 group-hover:text-red-400 flex items-center gap-0.5">
                            <span>Choisir</span>
                            <ChevronRight className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Pricing, Grading, Links & Save */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* 1. Live Market Price Box */}
              <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-slate-800/80 to-slate-900 border border-slate-700/80 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>Cote Marchande en Direct</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                    Cardmarket FR
                  </span>
                </div>

                {/* Primary Estimated Price */}
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl sm:text-4xl font-black text-white">
                    {activePriceEur} €
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {selectedFinish === 'holo' ? 'version holographique' : selectedFinish === 'reverse' ? 'version reverse' : 'prix standard'}
                  </span>
                </div>

                {/* Finish Selector Toggles */}
                <div className="flex items-center gap-1.5 mb-3 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setSelectedFinish('normal')}
                    className={`flex-1 py-1 px-2 rounded-lg font-bold text-center transition-all ${
                      selectedFinish === 'normal'
                        ? 'bg-slate-800 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Normale ({pricing?.estimatedEur || '0.05'} €)
                  </button>

                  {cm.holo && (
                    <button
                      onClick={() => setSelectedFinish('holo')}
                      className={`flex-1 py-1 px-2 rounded-lg font-bold text-center transition-all ${
                        selectedFinish === 'holo'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      ✨ Holo ({cm.holo} €)
                    </button>
                  )}

                  {cm.reverse && (
                    <button
                      onClick={() => setSelectedFinish('reverse')}
                      className={`flex-1 py-1 px-2 rounded-lg font-bold text-center transition-all ${
                        selectedFinish === 'reverse'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🔮 Reverse ({cm.reverse} €)
                    </button>
                  )}
                </div>

                {/* Grid of Sub-Prices */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-700/60 text-xs">
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">Prix Bas</span>
                    <span className="text-white font-bold">{cm.low ? `${cm.low} €` : 'N/A'}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">Tendance</span>
                    <span className="text-white font-bold">{cm.trend ? `${cm.trend} €` : 'N/A'}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">Moyenne 30j</span>
                    <span className="text-white font-bold">{cm.avg ? `${cm.avg} €` : 'N/A'}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">TCGPlayer (US)</span>
                    <span className="text-white font-bold">{tcg.marketUsd ? `$${tcg.marketUsd}` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* 2. AI Financial Grading Valuation Card */}
              {grading && (
                <div className={`p-4 rounded-3xl border shadow-xl ${
                  grading.status === 'TRES_RENTABLE'
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : grading.status === 'RENTABLE_SI_10'
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                    : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400" />
                      <h4 className="font-bold text-xs sm:text-sm text-white">Gradation (PSA / PCA / CGC)</h4>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      grading.status === 'TRES_RENTABLE'
                        ? 'bg-emerald-500 text-slate-950'
                        : grading.status === 'RENTABLE_SI_10'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {grading.badge}
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-300 mb-3">
                    {grading.explanation}
                  </p>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-slate-800">
                    <div className="p-1.5 rounded-lg bg-slate-900/80">
                      <span className="text-[9px] text-slate-400 block">Valeur Brute</span>
                      <span className="text-white font-bold">{grading.estRaw.toFixed(2)} €</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-900/80">
                      <span className="text-[9px] text-slate-400 block">PSA 9</span>
                      <span className="text-white font-bold">{grading.estPsa9} €</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-900/80">
                      <span className="text-[9px] text-slate-400 block">PSA 10</span>
                      <span className="text-emerald-400 font-bold">{grading.estPsa10} €</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. External Links */}
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={links?.cardmarket}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Cardmarket</span>
                </a>

                <a
                  href={links?.ebaySold}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-900/30 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>eBay Ventes</span>
                </a>

                <a
                  href={links?.tcgplayer}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>TCGPlayer</span>
                </a>
              </div>

              {/* 4. Add to Collection Box */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">État :</span>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none focus:border-red-500"
                  >
                    <option value="Mint">Mint (Parfait)</option>
                    <option value="Near Mint">Near Mint (Neuf)</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Lightly Played">Lightly Played</option>
                    <option value="Poor">Poor (Abîmé)</option>
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="Note personnelle..."
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  className="w-full bg-slate-900 text-slate-200 placeholder-slate-500 text-xs rounded-xl px-3 py-1.5 border border-slate-800 focus:outline-none focus:border-red-500"
                />

                <button
                  onClick={handleSave}
                  disabled={isSaved}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-lg active:scale-95 ${
                    isSaved
                      ? 'bg-emerald-600 text-white cursor-default'
                      : 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:opacity-90 text-white shadow-red-600/30'
                  }`}
                >
                  {isSaved ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Carte Enregistrée ({activePriceEur} €) !</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-4 h-4" />
                      <span>Ajouter à ma Collection ({activePriceEur} €)</span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
