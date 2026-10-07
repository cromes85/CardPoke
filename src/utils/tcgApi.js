// TCGdex API Client & Multi-Factor Fuzzy Matching Engine

const API_BASE = 'https://api.tcgdex.net/v2/fr';

const SET_ALIASES = {
  'ASC': 'me02.5', // Héros Transcendants
  'MEE': 'mee',    // Mega Evolution Energies
  'SSP': 'sv08',   // Étincelles Radieuses
  'SCR': 'sv07',   // Couronne Stellaire
  'TWM': 'sv06',   // Mascarade Crépusculaire
  'TEF': 'sv05',   // Forces Temporelles
  'PAF': 'sv04.5', // Destinées de Paldea
  'PAR': 'sv04',   // Faille Paradoxe
  'MEW': 'sv03.5', // 151
  'OBF': 'sv03',   // Flammes Obsidiennes
  'PAL': 'sv02',   // Évolutions à Paldea
  'SVI': 'sv01',   // Écarlate et Violet
};

/**
 * Fetch detailed card information by ID from TCGdex
 */
export async function getCardDetails(cardId) {
  try {
    const res = await fetch(`${API_BASE}/cards/${cardId}`);
    if (!res.ok) throw new Error(`Card not found: ${cardId}`);
    const data = await res.json();
    return formatCardData(data);
  } catch (err) {
    console.error("Error fetching card details:", err);
    return null;
  }
}

/**
 * Smart Multi-Factor Search Engine for Pokémon Cards
 */
export async function searchCard(params) {
  const { name = '', localId = '', totalInSet = '', setCode = '', hp = '' } = params;
  
  const cleanName = name.trim();
  const cleanId = localId.trim();
  const cleanIdUnpadded = cleanId.replace(/^0+/, '');
  const cleanIdPadded = cleanId.padStart(3, '0');
  const targetTotal = parseInt(totalInSet, 10) || null;
  const mappedSetId = setCode ? (SET_ALIASES[setCode.toUpperCase()] || setCode.toLowerCase()) : null;

  const candidateMap = new Map(); // id -> candidate object with score

  // --- Helper to add and score candidates ---
  const addCandidates = (cards, baseBonus = 0) => {
    if (!Array.isArray(cards)) return;
    for (const card of cards) {
      if (!card || !card.id) continue;
      const score = calculateMatchScore(card, {
        cleanName,
        cleanId,
        cleanIdUnpadded,
        cleanIdPadded,
        targetTotal,
        mappedSetId
      }) + baseBonus;

      if (!candidateMap.has(card.id) || candidateMap.get(card.id).score < score) {
        candidateMap.set(card.id, { card, score });
      }
    }
  };

  // --- 1. Query by localId (Padded & Unpadded) ---
  if (cleanId) {
    try {
      const idsToTry = Array.from(new Set([cleanId, cleanIdUnpadded, cleanIdPadded])).filter(Boolean);
      for (const idTry of idsToTry) {
        const res = await fetch(`${API_BASE}/cards?localId=${encodeURIComponent(idTry)}`);
        if (res.ok) {
          const list = await res.json();
          addCandidates(list, 15);
        }
      }
    } catch (e) {
      console.warn("LocalId search error:", e);
    }
  }

  // --- 2. Query by Full Name & First Word ---
  if (cleanName) {
    try {
      // Try full name
      let res = await fetch(`${API_BASE}/cards?name=${encodeURIComponent(cleanName)}`);
      if (res.ok) {
        const list = await res.json();
        addCandidates(list, 20);
      }

      // Try first word if multi-word (e.g. "Amos" from "Amos de la Team Rocket", "Sorboul" from "Sorboul de N")
      const words = cleanName.split(/\s+/).filter(w => w.length >= 3);
      if (words.length > 1) {
        const firstWord = words[0];
        res = await fetch(`${API_BASE}/cards?name=${encodeURIComponent(firstWord)}`);
        if (res.ok) {
          const list = await res.json();
          addCandidates(list, 10);
        }
      }
    } catch (e) {
      console.warn("Name search error:", e);
    }
  }

  // Convert candidates to sorted list
  const sortedCandidates = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score)
    .map(c => c.card);

  if (sortedCandidates.length === 0) {
    return null;
  }

  // Fetch full details for the highest scoring card
  const bestMatch = await getCardDetails(sortedCandidates[0].id);

  return {
    bestMatch,
    alternatives: sortedCandidates.slice(1, 8),
    meta: {
      recognizedName: cleanName,
      recognizedId: cleanId,
      recognizedTotal: totalInSet,
      recognizedSetCode: setCode
    }
  };
}

/**
 * Calculates Multi-Factor Match Score (0 to 100)
 */
function calculateMatchScore(card, target) {
  let score = 0;
  const cardName = (card.name || '').toLowerCase();
  const targetName = (target.cleanName || '').toLowerCase();
  const cardId = String(card.localId || '').trim();

  // 1. Number Match (up to 40 pts)
  if (target.cleanId) {
    if (cardId === target.cleanId || cardId === target.cleanIdPadded || cardId === target.cleanIdUnpadded) {
      score += 40;
    }
  }

  // 2. Name Match (up to 45 pts)
  if (targetName) {
    if (cardName === targetName) {
      score += 45;
    } else if (cardName.includes(targetName) || targetName.includes(cardName)) {
      score += 35;
    } else {
      // Check first token / word
      const targetFirst = targetName.split(' ')[0];
      const cardFirst = cardName.split(' ')[0];
      if (targetFirst && cardFirst && (targetFirst === cardFirst || cardName.includes(targetFirst))) {
        score += 25;
      } else {
        const sim = stringSimilarity(cardName, targetName);
        score += Math.round(sim * 25);
      }
    }
  }

  // 3. Set Code / Set ID Match (up to 15 pts)
  if (target.mappedSetId && card.id && card.id.toLowerCase().includes(target.mappedSetId)) {
    score += 15;
  }

  return score;
}

/**
 * Manual Instant Search for Auto-complete
 */
export async function searchCardsLive(query) {
  if (!query || query.trim().length < 1) return [];
  const cleanQ = query.trim();
  try {
    // If user types a number, search by localId
    if (/^\d+$/.test(cleanQ)) {
      const res = await fetch(`${API_BASE}/cards?localId=${encodeURIComponent(cleanQ)}`);
      if (res.ok) {
        const list = await res.json();
        return list.slice(0, 15);
      }
    }

    const res = await fetch(`${API_BASE}/cards?name=${encodeURIComponent(cleanQ)}`);
    if (!res.ok) return [];
    const list = await res.json();
    return list.slice(0, 15);
  } catch (err) {
    console.error("Live search error:", err);
    return [];
  }
}

/**
 * Normalizes card data object with clean Euro prices and grading evaluation
 */
function formatCardData(raw) {
  const cardmarket = raw.pricing?.cardmarket || {};
  const tcgplayer = raw.pricing?.tcgplayer || {};

  const avgPrice = cardmarket.avg || cardmarket.avg30 || cardmarket.trend || null;
  const lowPrice = cardmarket.low || null;
  const trendPrice = cardmarket.trend || avgPrice || null;
  const holoPrice = cardmarket['avg-holo'] || cardmarket['trend-holo'] || null;

  const tcgNormal = tcgplayer.normal || tcgplayer.holofoil || tcgplayer['reverse-holofoil'] || {};
  const marketPriceUsd = tcgNormal.marketPrice || tcgNormal.midPrice || null;

  const displayPriceEur = trendPrice || avgPrice || (marketPriceUsd ? marketPriceUsd * 0.92 : 0.20);
  const grading = evaluateGradingFeasibility(raw, displayPriceEur);

  return {
    id: raw.id,
    name: raw.name,
    localId: raw.localId,
    rarity: raw.rarity || 'Commune',
    category: raw.category || 'Pokémon',
    image: raw.image ? `${raw.image}/high.webp` : (raw.image || null),
    imageLow: raw.image ? `${raw.image}/low.webp` : null,
    set: {
      id: raw.set?.id || '',
      name: raw.set?.name || 'Série Spéciale',
      cardCount: raw.set?.cardCount || {},
      logo: raw.set?.logo ? `${raw.set.logo}.webp` : null,
      symbol: raw.set?.symbol ? `${raw.set.symbol}.webp` : null,
    },
    hp: raw.hp || null,
    types: raw.types || [],
    stage: raw.stage || 'Base',
    illustrator: raw.illustrator || 'Inconnu',
    attacks: raw.attacks || [],
    weaknesses: raw.weaknesses || [],
    pricing: {
      cardmarket: {
        avg: avgPrice ? Number(avgPrice).toFixed(2) : null,
        low: lowPrice ? Number(lowPrice).toFixed(2) : null,
        trend: trendPrice ? Number(trendPrice).toFixed(2) : null,
        holo: holoPrice ? Number(holoPrice).toFixed(2) : null,
      },
      tcgplayer: {
        marketUsd: marketPriceUsd ? Number(marketPriceUsd).toFixed(2) : null,
      },
      estimatedEur: Number(displayPriceEur).toFixed(2)
    },
    grading,
    links: {
      cardmarket: `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(raw.name + ' ' + (raw.localId || ''))}`,
      ebaySold: `https://www.ebay.fr/sch/i.html?_nkw=carte+pokemon+${encodeURIComponent(raw.name + ' ' + (raw.localId || ''))}&LH_Sold=1&LH_Complete=1`,
      tcgplayer: `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(raw.name)}`
    }
  };
}

/**
 * Financial Grading Profitability Matrix
 */
export function evaluateGradingFeasibility(card, rawPriceEur) {
  const price = Number(rawPriceEur) || 0;
  const rarity = (card.rarity || '').toLowerCase();
  const name = (card.name || '').toLowerCase();
  const gradingCost = 15;

  const isUltraRare = rarity.includes('ultra') || 
                      rarity.includes('secret') || 
                      rarity.includes('illustration') || 
                      rarity.includes('special') ||
                      rarity.includes('ar') ||
                      rarity.includes('sar');

  const isChasePokemon = /dracaufeu|charizard|pikachu|evoli|eevee|mewtwo|mew|rayquaza|gengar|ectoplasma|lugia|giratina|umbreon|noctali/i.test(name);

  if (price >= 25 || (isUltraRare && price >= 15)) {
    const estPsa9 = Math.round(price * 1.8 + 15);
    const estPsa10 = Math.round(price * 3.5 + 25);
    return {
      status: 'TRES_RENTABLE',
      badge: '🌟 TRÈS RENTABLE (Pépite)',
      color: 'emerald',
      isWorthy: true,
      estRaw: price,
      estPsa9,
      estPsa10,
      gradingCost,
      roi: Math.round(((estPsa10 - price - gradingCost) / (price + gradingCost)) * 100),
      explanation: "Cette carte a une excellente valeur marchande brute. Une certification PSA / PCA 10 décuplera sa valeur et facilitera sa revente."
    };
  }

  if (price >= 6 || (isChasePokemon && price >= 3) || isUltraRare) {
    const estPsa9 = Math.round(price * 1.3 + 10);
    const estPsa10 = Math.round(price * 2.2 + 15);
    return {
      status: 'RENTABLE_SI_10',
      badge: '⚖️ RENTABLE UNIQUEMENT SI 10/10',
      color: 'amber',
      isWorthy: false,
      estRaw: price,
      estPsa9,
      estPsa10,
      gradingCost,
      roi: Math.round(((estPsa10 - price - gradingCost) / (price + gradingCost)) * 100),
      explanation: "La gradation est rentable uniquement si la carte est dans un état parfait absolu (centrage et bords 10/10). En note 9 ou moins, le bénéfice net sera quasiment nul après déduction des frais de gradation (~15€)."
    };
  }

  return {
    status: 'PAS_RENTABLE',
    badge: '❌ NON RENTABLE (Perte financière)',
    color: 'rose',
    isWorthy: false,
    estRaw: price,
    estPsa9: 8,
    estPsa10: 14,
    gradingCost,
    roi: -40,
    explanation: "Le coût de gradation (~15 €) dépasse largement la cote marchande de la carte. Même avec la note maximale 10/10, la revente couvrira difficilement les frais."
  };
}

function stringSimilarity(s1, s2) {
  let longer = s1;
  let shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  
  const editDistance = levenshtein(longer, shorter);
  return (longerLength - editDistance) / longerLength;
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
