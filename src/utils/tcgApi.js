// TCGdex API Client & Multi-Language Candidate Ranking Engine

const API_FR = 'https://api.tcgdex.net/v2/fr';
const API_EN = 'https://api.tcgdex.net/v2/en';

const SET_ALIASES = {
  'PAL': 'sv02',   // Évolutions à Paldea / Paldea Evolved
  'ASC': 'me02.5', // Héros Transcendants
  'MEE': 'mee',    // Mega Evolution Energies
  'SSP': 'sv08',   // Étincelles Radieuses / Surging Sparks
  'SCR': 'sv07',   // Couronne Stellaire / Stellar Crown
  'TWM': 'sv06',   // Mascarade Crépusculaire / Twilight Masquerade
  'TEF': 'sv05',   // Forces Temporelles / Temporal Forces
  'PAF': 'sv04.5', // Destinées de Paldea / Paldean Fates
  'PAR': 'sv04',   // Faille Paradoxe / Paradox Rift
  'MEW': 'sv03.5', // 151
  'OBF': 'sv03',   // Flammes Obsidiennes / Obsidian Flames
  'SVI': 'sv01',   // Écarlate et Violet / Scarlet & Violet
};

/**
 * Fetch detailed card information by ID from TCGdex (French version with Euro pricing)
 */
export async function getCardDetails(cardId) {
  try {
    let res = await fetch(`${API_FR}/cards/${cardId}`);
    if (!res.ok) {
      // Fallback to English endpoint if not in French
      res = await fetch(`${API_EN}/cards/${cardId}`);
    }
    if (!res.ok) throw new Error(`Card not found: ${cardId}`);
    const data = await res.json();
    return formatCardData(data);
  } catch (err) {
    console.error("Error fetching card details:", err);
    return null;
  }
}

/**
 * High-Accuracy Multi-Factor Search Engine (FR + EN)
 */
export async function searchCard(params) {
  const { 
    primaryName = '', 
    name = '',
    candidateWords = [], 
    extractedNumbers = [], 
    localId = '', 
    totalInSet = '', 
    setCode = '' 
  } = params;

  const wordsToSearch = new Set();
  const searchName = (primaryName || name).trim();
  if (searchName) wordsToSearch.add(searchName);
  for (const w of candidateWords) {
    if (w && w.length >= 3) wordsToSearch.add(w.trim());
  }

  const numbersToSearch = new Set();
  if (localId) numbersToSearch.add(localId.trim());
  for (const n of extractedNumbers) {
    if (n) numbersToSearch.add(String(n).trim());
  }

  const mappedSetId = setCode ? (SET_ALIASES[setCode.toUpperCase()] || setCode.toLowerCase()) : null;
  const targetTotal = parseInt(totalInSet, 10) || null;

  const candidateMap = new Map(); // id -> { card, score }

  const searchEndpoints = [API_FR, API_EN];

  // --- 1. Query by Candidate Words (Primary Name & Key Words) ---
  for (const word of Array.from(wordsToSearch).slice(0, 5)) {
    for (const endpoint of searchEndpoints) {
      try {
        const res = await fetch(`${endpoint}/cards?name=${encodeURIComponent(word)}`);
        if (res.ok) {
          const list = await res.json();
          for (const card of list) {
            scoreAndAddCandidate(card, candidateMap, { searchName, wordsToSearch, numbersToSearch, targetTotal, mappedSetId });
          }
        }
      } catch (e) {
        console.warn("Word query error:", e);
      }
    }
  }

  // --- 2. Query by Candidate Numbers (063, 63, 030, 201, 108, etc.) ---
  for (const num of Array.from(numbersToSearch).slice(0, 6)) {
    const cleanNum = num.replace(/^0+/, '');
    const paddedNum = num.padStart(3, '0');
    const numsToTry = Array.from(new Set([cleanNum, paddedNum])).filter(Boolean);

    for (const idTry of numsToTry) {
      for (const endpoint of searchEndpoints) {
        try {
          const res = await fetch(`${endpoint}/cards?localId=${encodeURIComponent(idTry)}`);
          if (res.ok) {
            const list = await res.json();
            for (const card of list) {
              scoreAndAddCandidate(card, candidateMap, { searchName, wordsToSearch, numbersToSearch, targetTotal, mappedSetId });
            }
          }
        } catch (e) {
          console.warn("Number query error:", e);
        }
      }
    }
  }

  // Sort candidates by score descending
  const sorted = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score)
    .map(c => c.card);

  if (sorted.length === 0) {
    return null;
  }

  // Fetch full details for the top match
  const bestMatch = await getCardDetails(sorted[0].id);

  return {
    bestMatch,
    alternatives: sorted.slice(1, 8),
    meta: {
      recognizedName: searchName,
      recognizedId: localId,
      recognizedTotal: totalInSet,
      recognizedSetCode: setCode
    }
  };
}

function scoreAndAddCandidate(card, map, ctx) {
  if (!card || !card.id) return;

  const cardName = (card.name || '').toLowerCase().replace(/[-_]/g, ' ');
  const cardId = String(card.localId || '').trim();
  const cleanCardId = cardId.replace(/^0+/, '');

  let score = 0;

  // 1. Name Match (CRITICAL: up to 90 pts)
  const targetLower = (ctx.searchName || '').toLowerCase().replace(/[-_]/g, ' ');
  if (targetLower) {
    if (cardName === targetLower || cardName.startsWith(targetLower)) {
      score += 90;
    } else if (cardName.includes(targetLower) || targetLower.includes(cardName)) {
      score += 70;
    } else {
      const firstTargetWord = targetLower.split(' ')[0];
      const firstCardWord = cardName.split(' ')[0];
      if (firstTargetWord && firstCardWord && (firstTargetWord === firstCardWord || cardName.includes(firstTargetWord))) {
        score += 55;
      }
    }
  }

  // Check against other candidate words (e.g. attacks or character names)
  for (const word of ctx.wordsToSearch) {
    const wLower = word.toLowerCase();
    if (cardName.includes(wLower)) {
      score += 40;
      break;
    }
  }

  // 2. Number Match (up to 50 pts)
  for (const num of ctx.numbersToSearch) {
    const cleanN = String(num).replace(/^0+/, '');
    if (cleanN === cleanCardId) {
      score += 50;
      break;
    }
  }

  // 3. Set Code / Series Match (up to 30 pts)
  if (ctx.mappedSetId && card.id.toLowerCase().includes(ctx.mappedSetId)) {
    score += 30;
  }

  if (!map.has(card.id) || map.get(card.id).score < score) {
    map.set(card.id, { card, score });
  }
}

/**
 * Manual Instant Search for Auto-complete
 */
export async function searchCardsLive(query) {
  if (!query || query.trim().length < 1) return [];
  const cleanQ = query.trim();
  try {
    if (/^\d+$/.test(cleanQ)) {
      const res = await fetch(`${API_FR}/cards?localId=${encodeURIComponent(cleanQ)}`);
      if (res.ok) {
        const list = await res.json();
        return list.slice(0, 15);
      }
    }

    const res = await fetch(`${API_FR}/cards?name=${encodeURIComponent(cleanQ)}`);
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
                      rarity.includes('double') ||
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
