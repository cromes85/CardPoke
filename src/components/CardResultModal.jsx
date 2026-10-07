import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  X, 
  Sparkles, 
  ExternalLink, 
  BookmarkPlus, 
  CheckCircle, 
  TrendingUp, 
  Euro, 
  ShieldAlert, 
  ShieldCheck, 
  HelpCircle,
  RefreshCw,
  Award,
  ChevronDown
} from 'lucide-react';
import HoloCard3D from './HoloCard3D';
import { soundManager } from '../utils/audio';

export default function CardResultModal({ 
  card, 
  alternatives = [], 
  userCroppedImage,
  onSaveToCollection, 
  onSelectAlternative, 
  onManualSearchFallback,
  onClose 
}) {
  const [condition, setCondition] = useState('Near Mint');
  const [userNote, setUserNote] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [showAltDropdown, setShowAltDropdown] = useState(false);

  if (!card) return null;

  const {
    name,
    localId,
    rarity,
    set,
    pricing,
    grading,
    image,
    hp,
    types,
    stage,
    attacks,
    weaknesses,
    illustrator,
    links
  } = card;

  // Trigger celebration confetti & sound when saving or if high value
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

    onSaveToCollection(card, userCroppedImage, condition, userNote);
    setIsSaved(true);
  };

  const cm = pricing?.cardmarket || {};
  const tcg = pricing?.tcgplayer || {};

  return (
    <div className="fixed inset-0 z-50 backdrop-blur-md bg-slate-950/85 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Top Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Sparkles className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">{name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  #{localId}{set?.cardCount?.official ? `/${set.cardCount.official}` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {set?.name || 'Extension Pokémon'} • {rarity}
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

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: 3D Holographic Card */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-full max-w-[280px]">
                <HoloCard3D
                  imageUrl={image || userCroppedImage}
                  name={name}
                  rarity={rarity}
                />
              </div>

              {/* Set Logo & Basic info */}
              <div className="mt-4 flex items-center gap-2 p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 w-full max-w-[280px]">
                {set?.symbol && (
                  <img src={set.symbol} alt="Symbole Série" className="w-6 h-6 object-contain" />
                )}
                <div className="text-xs truncate">
                  <span className="text-slate-400 block text-[10px]">Extension</span>
                  <span className="text-white font-semibold truncate block">{set?.name}</span>
                </div>
              </div>

              {/* Alternative Match Dropdown if OCR was slightly off */}
              {alternatives && alternatives.length > 0 && (
                <div className="w-full max-w-[280px] mt-3">
                  <button
                    onClick={() => setShowAltDropdown(!showAltDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700/60 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Autres correspondances ({alternatives.length})</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAltDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showAltDropdown && (
                    <div className="mt-2 space-y-1.5 p-2 rounded-xl bg-slate-950 border border-slate-800 shadow-xl">
                      {alternatives.map((alt) => (
                        <button
                          key={alt.id}
                          onClick={() => {
                            onSelectAlternative(alt.id);
                            setShowAltDropdown(false);
                          }}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-xs text-slate-300 hover:text-white flex items-center justify-between transition-colors"
                        >
                          <span className="truncate">{alt.name}</span>
                          <span className="text-[10px] font-mono text-slate-400">#{alt.localId}</span>
                        </button>
                      ))}
                      <button
                        onClick={onManualSearchFallback}
                        className="w-full text-center p-1.5 text-[11px] text-red-400 hover:text-red-300 font-semibold"
                      >
                        Rechercher manuellement
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Prices, Grading AI, Links & Stats */}
            <div className="lg:col-span-7 space-y-5">
              
              {/* 1. Live Market Price Box */}
              <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-slate-800/80 to-slate-900 border border-slate-700/80 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>Cote Marchande en Direct</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                    Cardmarket FR
                  </span>
                </div>

                {/* Primary Estimated Price */}
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl sm:text-4xl font-black text-white">
                    {pricing?.estimatedEur || '0.20'} €
                  </span>
                  <span className="text-xs text-slate-400 font-medium">prix moyen estimé</span>
                </div>

                {/* Grid of Detailed Sub-Prices */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-700/60 text-xs">
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Prix Bas</span>
                    <span className="text-white font-bold">{cm.low ? `${cm.low} €` : 'N/A'}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Tendance</span>
                    <span className="text-white font-bold">{cm.trend ? `${cm.trend} €` : 'N/A'}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Holo / Reverse</span>
                    <span className="text-white font-bold">{cm.holo ? `${cm.holo} €` : 'N/A'}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">TCGPlayer (US)</span>
                    <span className="text-white font-bold">{tcg.marketUsd ? `$${tcg.marketUsd}` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* 2. AI Financial Grading Valuation Card */}
              {grading && (
                <div className={`p-4 sm:p-5 rounded-3xl border shadow-xl ${
                  grading.status === 'TRES_RENTABLE'
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : grading.status === 'RENTABLE_SI_10'
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                    : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-amber-400" />
                      <h4 className="font-bold text-sm text-white">Analyse Gradation (PSA / PCA / CGC)</h4>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                      grading.status === 'TRES_RENTABLE'
                        ? 'bg-emerald-500 text-slate-950'
                        : grading.status === 'RENTABLE_SI_10'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {grading.badge}
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-300 mb-4">
                    {grading.explanation}
                  </p>

                  {/* Financial Simulation Matrix */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-3 border-t border-slate-800">
                    <div className="p-2 rounded-xl bg-slate-900/80">
                      <span className="text-[10px] text-slate-400 block">Valeur Brute</span>
                      <span className="text-white font-bold">{grading.estRaw.toFixed(2)} €</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900/80">
                      <span className="text-[10px] text-slate-400 block">Estimation PSA 9</span>
                      <span className="text-white font-bold">{grading.estPsa9} €</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900/80">
                      <span className="text-[10px] text-slate-400 block">Estimation PSA 10</span>
                      <span className="text-emerald-400 font-bold">{grading.estPsa10} €</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Marketplace External Links */}
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
                  <span>eBay (Ventes Réussies)</span>
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

              {/* 4. Add to Collection Form */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">État de votre carte :</span>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none focus:border-red-500"
                  >
                    <option value="Mint">Mint (Parfait)</option>
                    <option value="Near Mint">Near Mint (Neuf / Quasi-neuf)</option>
                    <option value="Excellent">Excellent (Léger whitening)</option>
                    <option value="Good">Good (Joué)</option>
                    <option value="Lightly Played">Lightly Played</option>
                    <option value="Poor">Poor (Abîmé / Plié)</option>
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="Note personnelle (ex: tiré du coffret Dracaufeu)..."
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  className="w-full bg-slate-900 text-slate-200 placeholder-slate-500 text-xs rounded-xl px-3 py-2 border border-slate-800 focus:outline-none focus:border-red-500"
                />

                <button
                  onClick={handleSave}
                  disabled={isSaved}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 ${
                    isSaved
                      ? 'bg-emerald-600 text-white cursor-default'
                      : 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:opacity-90 text-white shadow-red-600/30'
                  }`}
                >
                  {isSaved ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Carte Enregistrée dans la Collection !</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-4 h-4" />
                      <span>Ajouter à ma Collection</span>
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
