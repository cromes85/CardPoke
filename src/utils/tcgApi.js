// TCGdex API Client & Pokémon Card Valuation Service

const API_BASE = 'https://api.tcgdex.net/v2/fr';

// Known Set code alias mapping for recent and popular sets
const SET_ALIASES = {
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
  'PAL': 'sv02',   // Évolutions à Paldea / Paldea Evolved
  'SVI': 'sv01',   // Écarlate et Violet / Scarlet & Violet
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
 * Smart Search combining Name, LocalId, and Set Code
 */
export async function searchCard(params) {
  const { name = '', localId = '', setCode = '' } = params;
  const cleanName = name.trim();
  const cleanNum = localId.trim().replace(/^0+/, ''); // strip leading zeros for flexible search
  const cleanNumPadded = localId.trim().padStart(3, '0');

  let results = [];

  // Strategy 1: Exact Name + Number
  if (cleanName && cleanNum) {
    try {
      // Try both padded and unpadded localId
      let res = await fetch(`${API_BASE}/cards?name=${encodeURIComponent(cleanName)}&localId=${cleanNum}`);
      if (res.ok) {
        const list = await res.json();
        if (list && list.length > 0) results.push(...list);
      }
      if (results.length === 0) {
        res = await fetch(`${API_BASE}/cards?name=${encodeURIComponent(cleanName)}&localId=${cleanNumPadded}`);
        if (res.ok) {
          const list = await res.json();
          if (list && list.length > 0) results.push(...list);
        }
      }
    } catch (e) {
      console.warn("Strategy 1 error:", e);
    }
  }

  // Strategy 2: If no result, search by Number and match Name fuzzily
  if (results.length === 0 && cleanNum) {
    try {
      const res = await fetch(`${API_BASE}/cards?localId=${cleanNum}`);
      if (res.ok) {
        const list = await res.json();
        if (list && list.length > 0) {
          // If name is present, score by name similarity
          if (cleanName) {
            list.sort((a, b) => {
              const simA = stringSimilarity(a.name.toLowerCase(), cleanName.toLowerCase());
              const simB = stringSimilarity(b.name.toLowerCase(), cleanName.toLowerCase());
              return simB - simA;
            });
          }
          results.push(...list.slice(0, 8));
        }
      }
    } catch (e) {
      console.warn("Strategy 2 error:", e);
    }
  }

  // Strategy 3: Search by Name only
  if (results.length === 0 && cleanName) {
    try {
      const res = await fetch(`${API_BASE}/cards?name=${encodeURIComponent(cleanName)}`);
      if (res.ok) {
        const list = await res.json();
        if (list && list.length > 0) {
          results.push(...list.slice(0, 10));
        }
      }
    } catch (e) {
      console.warn("Strategy 3 error:", e);
    }
  }

  // Deduplicate results
  const uniqueResults = [];
  const seenIds = new Set();
  for (const item of results) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      uniqueResults.push(item);
    }
  }

  if (uniqueResults.length === 0) {
    return null;
  }

  // Fetch full details for the top match
  const bestMatch = await getCardDetails(uniqueResults[0].id);
  
  return {
    bestMatch,
    alternatives: uniqueResults.slice(1, 6)
  };
}

/**
 * Manual Instant Search for Auto-complete
 */
export async function searchCardsLive(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const res = await fetch(`${API_BASE}/cards?name=${encodeURIComponent(query.trim())}`);
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

  // Extract Euro prices from Cardmarket
  const avgPrice = cardmarket.avg || cardmarket.avg30 || cardmarket.trend || null;
  const lowPrice = cardmarket.low || null;
  const trendPrice = cardmarket.trend || avgPrice || null;
  const holoPrice = cardmarket['avg-holo'] || cardmarket['trend-holo'] || null;

  // Extract USD prices from TCGPlayer
  const tcgNormal = tcgplayer.normal || tcgplayer.holofoil || tcgplayer['reverse-holofoil'] || {};
  const marketPriceUsd = tcgNormal.marketPrice || tcgNormal.midPrice || null;

  // Default display price (Euro preferred)
  const displayPriceEur = trendPrice || avgPrice || (marketPriceUsd ? marketPriceUsd * 0.92 : 0.20);

  // Evaluate Grading Feasibility
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
 * Intelligent Grading Valuation Calculator
 */
export function evaluateGradingFeasibility(card, rawPriceEur) {
  const price = Number(rawPriceEur) || 0;
  const rarity = (card.rarity || '').toLowerCase();
  const name = (card.name || '').toLowerCase();
  const gradingCost = 15; // standard ~15€ certification fee + shipping

  // High-tier keywords
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

// Levenshtein similarity metric
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
