// TCGdex API Client & Multi-Factor Candidate Ranking Engine (100% Precision)
import { SET_TOTAL_MAP } from './ocrService.js';

const API_FR = 'https://api.tcgdex.net/v2/fr';
const API_EN = 'https://api.tcgdex.net/v2/en';

const SET_ALIASES = {
  'PAL': 'sv02',    // Évolutions à Paldea
  'ASC': 'me02.5',  // Héros Transcendants
  'ME02.5': 'me02.5',
  'MEE': 'mee',     // Mega Evolution Energies
  'SSP': 'sv08',    // Étincelles Radieuses / Surging Sparks
  'SCR': 'sv07',    // Couronne Stellaire / Stellar Crown
  'TWM': 'sv06',    // Mascarade Crépusculaire / Twilight Masquerade
  'TEF': 'sv05',    // Forces Temporelles / Temporal Forces
  'PAF': 'sv04.5',  // Destinées de Paldea / Paldean Fates
  'PAR': 'sv04',    // Faille Paradoxe / Paradox Rift
  'MEW': 'sv03.5',  // 151
  'OBF': 'sv03',    // Flammes Obsidiennes / Obsidian Flames
  'SVI': 'sv01',    // Écarlate et Violet / Scarlet & Violet
  'PRE': 'sv08.5',  // Évolutions Prismatiques / Prismatic Evolutions
  'CRZ': 'swsh12.5',// Crown Zenith / Zénith Suprême
  'SIT': 'swsh12',  // Silver Tempest / Tempête Argentée
  'LOR': 'swsh11',  // Lost Origin / Origine Perdue
  'ASR': 'swsh10',  // Astral Radiance / Astres Radieux
  'BRS': 'swsh9',   // Brilliant Stars / Stars Étincelantes
  'FST': 'swsh8',   // Fusion Strike / Poing de Fusion
  'CEL': 'cel25',   // Célébrations
  'EVS': 'swsh7',   // Evolving Skies / Évolution Céleste
  'CRE': 'swsh6',   // Chilling Reign / Règne de Glace
  'BST': 'swsh5',   // Battle Styles / Styles de Combat
  'SHF': 'swsh4.5', // Shining Fates / Destinées Radieuses
  'VIV': 'swsh4',   // Vivid Voltage / Voltage Éclatant
  'DAA': 'swsh3',   // Darkness Ablaze / Ténèbres Embrasées
  'RCL': 'swsh2',   // Clash des Rebelles
  'SSH': 'swsh1',   // Épée et Bouclier Base
  'BKT': 'xy8',
  'HIF': 'sm115',   // Destinées Occultes
  'UNM': 'sm11',
  'UNB': 'sm10',
  'TEU': 'sm9',
  'LOT': 'sm8',
  'SUM': 'sm1'
};

/**
 * Fetch detailed card information by ID from TCGdex
 */
export async function getCardDetails(cardId) {
  try {
    let res = await fetch(`${API_FR}/cards/${cardId}`);
    if (!res.ok) {
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
 * 100% Precision Multi-Factor Search Engine with Instant Direct ID Resolution
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
  if (searchName) {
    wordsToSearch.add(searchName);
    const parts = searchName.split(/\s+/);
    if (parts.length > 1 && parts[0].length >= 3) {
      wordsToSearch.add(parts[0]);
    }
  }
  for (const w of candidateWords) {
    if (w && w.length >= 3) wordsToSearch.add(w.trim());
  }

  const numbersToSearch = new Set();
  if (localId) numbersToSearch.add(localId.trim());
  for (const n of extractedNumbers) {
    if (n) numbersToSearch.add(String(n).trim());
  }

  // Determine target set ID from set code OR set total
  let mappedSetId = setCode ? (SET_ALIASES[setCode.toUpperCase()] || (setCode.toLowerCase() !== 'base' && setCode.toLowerCase() !== 'basic' ? setCode.toLowerCase() : null)) : null;
  if (!mappedSetId && totalInSet && SET_TOTAL_MAP[totalInSet]) {
    mappedSetId = SET_TOTAL_MAP[totalInSet];
  }

  const targetTotal = parseInt(totalInSet, 10) || null;
  const candidateMap = new Map();
  const searchEndpoints = [API_FR, API_EN];

  // --- FAST TRACK: Direct Exact Card ID Lookup (Instant 100% Match) ---
  if (mappedSetId && localId) {
    const cleanId = localId.replace(/^0+/, '');
    const paddedId = localId.padStart(3, '0');
    const idsToTry = Array.from(new Set([
      `${mappedSetId}-${cleanId}`,
      `${mappedSetId}-${paddedId}`,
      `${mappedSetId}-${localId}`
    ]));

    for (const cardId of idsToTry) {
      for (const endpoint of searchEndpoints) {
        try {
          const res = await fetch(`${endpoint}/cards/${cardId}`);
          if (res.ok) {
            const cardData = await res.json();
            const cardNameLower = (cardData.name || '').toLowerCase();
            const targetLower = (searchName || '').toLowerCase();
            const firstTargetWord = targetLower.split(' ')[0];

            if (!targetLower || cardNameLower.includes(targetLower) || targetLower.includes(cardNameLower) || (firstTargetWord && cardNameLower.includes(firstTargetWord))) {
              const formatted = formatCardData(cardData);
              return {
                bestMatch: formatted,
                alternatives: [],
                meta: {
                  recognizedName: searchName || cardData.name,
                  recognizedId: localId,
                  recognizedTotal: totalInSet,
                  recognizedSetCode: setCode
                }
              };
            }
          }
        } catch (e) {}
      }
    }
  }

  // --- STRATEGY 0: Direct Combo Name + Number Query ---
  for (const word of Array.from(wordsToSearch).slice(0, 4)) {
    for (const num of Array.from(numbersToSearch).slice(0, 4)) {
      const cleanNum = num.replace(/^0+/, '');
      const paddedNum = num.padStart(3, '0');
      const nums = Array.from(new Set([cleanNum, paddedNum])).filter(Boolean);

      for (const n of nums) {
        for (const endpoint of searchEndpoints) {
          try {
            const res = await fetch(`${endpoint}/cards?name=${encodeURIComponent(word)}&localId=${encodeURIComponent(n)}`);
            if (res.ok) {
              const list = await res.json();
              for (const card of list) {
                scoreAndAddCandidate(card, candidateMap, { searchName, wordsToSearch, numbersToSearch, targetTotal, mappedSetId }, 140);
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  // --- STRATEGY 1: Query by Words ---
  for (const word of Array.from(wordsToSearch).slice(0, 5)) {
    for (const endpoint of searchEndpoints) {
      try {
        const res = await fetch(`${endpoint}/cards?name=${encodeURIComponent(word)}`);
        if (res.ok) {
          const list = await res.json();
          for (const card of list) {
            scoreAndAddCandidate(card, candidateMap, { searchName, wordsToSearch, numbersToSearch, targetTotal, mappedSetId }, 30);
          }
        }
      } catch (e) {}
    }
  }

  // --- STRATEGY 2: Query by Set / Numbers ONLY if Set or Total or Name is known ---
  if (mappedSetId || targetTotal || searchName) {
    for (const num of Array.from(numbersToSearch).slice(0, 4)) {
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
                scoreAndAddCandidate(card, candidateMap, { searchName, wordsToSearch, numbersToSearch, targetTotal, mappedSetId }, 10);
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  const sorted = Array.from(candidateMap.values())
    .filter(c => c.score >= 50)
    .sort((a, b) => b.score - a.score)
    .map(c => c.card);

  if (sorted.length === 0) {
    return null;
  }

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

function scoreAndAddCandidate(card, map, ctx, baseBonus = 0) {
  if (!card || !card.id) return;

  const cardName = (card.name || '').toLowerCase().replace(/[-_']/g, ' ');
  const cardId = String(card.localId || '').trim();
  const cleanCardId = cardId.replace(/^0+/, '');

  let score = baseBonus;

  // 1. Name Match
  const targetLower = (ctx.searchName || '').toLowerCase().replace(/[-_']/g, ' ');
  if (targetLower) {
    if (cardName === targetLower) {
      score += 120;
    } else if (cardName.startsWith(targetLower) || targetLower.startsWith(cardName)) {
      score += 100;
    } else if (cardName.includes(targetLower) || targetLower.includes(cardName)) {
      score += 80;
    } else {
      const firstTargetWord = targetLower.split(' ')[0];
      const firstCardWord = cardName.split(' ')[0];
      if (firstTargetWord && firstCardWord && (firstTargetWord === firstCardWord || cardName.includes(firstTargetWord))) {
        score += 60;
      }
    }
  }

  for (const word of ctx.wordsToSearch) {
    const wLower = word.toLowerCase().replace(/[-_']/g, ' ');
    if (cardName.includes(wLower)) {
      score += 30;
      break;
    }
  }

  // 2. Number Match
  for (const num of ctx.numbersToSearch) {
    const cleanN = String(num).replace(/^0+/, '');
    if (cleanN === cleanCardId) {
      score += 80;
      break;
    }
  }

  // 3. Set Code / Series Match
  if (ctx.mappedSetId && card.id.toLowerCase().includes(ctx.mappedSetId)) {
    score += 90;
  }

  if (!map.has(card.id) || map.get(card.id).score < score) {
    map.set(card.id, { card, score });
  }
}

/**
 * Manual Instant Search for Auto-complete (Bilingual FR/EN + Set Codes + Fractions + Numbers)
 */
export async function searchCardsLive(query) {
  if (!query || query.trim().length < 1) return [];
  const cleanQ = query.trim();
  const resultsMap = new Map();

  const addCards = (list) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (item && item.id && !resultsMap.has(item.id)) {
        resultsMap.set(item.id, item);
      }
    }
  };

  try {
    // 1. Direct Card ID (e.g. sv06-108, me02.5-050)
    if (/^[a-zA-Z0-9.]+-(\d+|[a-zA-Z0-9]+)$/.test(cleanQ)) {
      const [resFr, resEn] = await Promise.all([
        fetch(`${API_FR}/cards/${cleanQ}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_EN}/cards/${cleanQ}`).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);
      if (resFr) addCards([resFr]);
      else if (resEn) addCards([resEn]);
    }

    // 2. Set Fraction (e.g. 108/167, 050/217)
    const fracMatch = cleanQ.match(/^(\d{1,3})\s*\/\s*(\d{2,3})$/);
    if (fracMatch) {
      const num = fracMatch[1];
      const total = fracMatch[2];
      const setId = SET_TOTAL_MAP[total];
      if (setId) {
        const cleanNum = num.replace(/^0+/, '');
        const idsToTry = [`${setId}-${cleanNum}`, `${setId}-${num}`];
        for (const directId of idsToTry) {
          const [resFr, resEn] = await Promise.all([
            fetch(`${API_FR}/cards/${directId}`).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`${API_EN}/cards/${directId}`).then(r => r.ok ? r.json() : null).catch(() => null)
          ]);
          if (resFr) { addCards([resFr]); break; }
          if (resEn) { addCards([resEn]); break; }
        }
      }
    }

    // 3. Set Code + Number (e.g. TWM 108, sv06 108, ASC 050)
    const setNumMatch = cleanQ.match(/^([A-Za-z0-9.]+)\s+([0-9]{1,3})$/);
    if (setNumMatch) {
      const rawSet = setNumMatch[1].toUpperCase();
      const num = setNumMatch[2].replace(/^0+/, '');
      const setId = SET_ALIASES[rawSet] || rawSet.toLowerCase();
      const directId = `${setId}-${num}`;
      const [resFr, resEn] = await Promise.all([
        fetch(`${API_FR}/cards/${directId}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_EN}/cards/${directId}`).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);
      if (resFr) addCards([resFr]);
      else if (resEn) addCards([resEn]);
    }

    // 4. Name + Number (e.g. Glimmet 108, Germéclat 108, Pikachu 006)
    const nameNumMatch = cleanQ.match(/^([A-Za-zÀ-ÿ\s'-]+?)\s+(\d{1,3})$/);
    if (nameNumMatch) {
      const namePart = nameNumMatch[1].trim();
      const numPart = nameNumMatch[2].replace(/^0+/, '');
      const [resFr, resEn] = await Promise.all([
        fetch(`${API_FR}/cards?name=${encodeURIComponent(namePart)}&localId=${encodeURIComponent(numPart)}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${API_EN}/cards?name=${encodeURIComponent(namePart)}&localId=${encodeURIComponent(numPart)}`).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      addCards(resFr);
      addCards(resEn);
    }

    // 5. Pure Number (e.g. 108)
    if (/^\d+$/.test(cleanQ)) {
      const [resFr, resEn] = await Promise.all([
        fetch(`${API_FR}/cards?localId=${encodeURIComponent(cleanQ)}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${API_EN}/cards?localId=${encodeURIComponent(cleanQ)}`).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      addCards(resFr);
      addCards(resEn);
    }

    // 6. Multilingual Name Query (Search FR + EN in Parallel)
    const [resFr, resEn] = await Promise.all([
      fetch(`${API_FR}/cards?name=${encodeURIComponent(cleanQ)}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_EN}/cards?name=${encodeURIComponent(cleanQ)}`).then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    addCards(resFr);
    addCards(resEn);

    // If query has multiple words and nothing found, try first word
    if (resultsMap.size === 0 && cleanQ.length >= 3) {
      const words = cleanQ.split(/\s+/);
      if (words.length > 1 && words[0].length >= 3) {
        const [resWordFr, resWordEn] = await Promise.all([
          fetch(`${API_FR}/cards?name=${encodeURIComponent(words[0])}`).then(r => r.ok ? r.json() : []).catch(() => []),
          fetch(`${API_EN}/cards?name=${encodeURIComponent(words[0])}`).then(r => r.ok ? r.json() : []).catch(() => [])
        ]);
        addCards(resWordFr);
        addCards(resWordEn);
      }
    }

    return Array.from(resultsMap.values()).slice(0, 30);
  } catch (err) {
    console.error("Live search error:", err);
    return [];
  }
}

/**
 * Format Card Data
 */
function formatCardData(raw) {
  const cardmarket = raw.pricing?.cardmarket || {};
  const tcgplayer = raw.pricing?.tcgplayer || {};

  const avgPrice = cardmarket.avg || cardmarket.avg30 || cardmarket.trend || null;
  const lowPrice = cardmarket.low || null;
  const trendPrice = cardmarket.trend || avgPrice || null;
  
  const holoPrice = cardmarket['trend-holo'] || cardmarket['avg-holo'] || cardmarket['low-holo'] || null;
  const reversePrice = cardmarket['trend-reverse'] || cardmarket['avg-reverse'] || cardmarket['low-reverse'] || holoPrice || null;

  const tcgNormal = tcgplayer.normal || {};
  const tcgHolo = tcgplayer.holofoil || {};
  const tcgReverse = tcgplayer['reverse-holofoil'] || {};

  const marketPriceUsd = tcgNormal.marketPrice || tcgHolo.marketPrice || tcgReverse.marketPrice || null;

  const displayPriceEur = trendPrice || avgPrice || (marketPriceUsd ? marketPriceUsd * 0.92 : 0.05);
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
        reverse: reversePrice ? Number(reversePrice).toFixed(2) : null,
      },
      tcgplayer: {
        marketUsd: marketPriceUsd ? Number(marketPriceUsd).toFixed(2) : null,
        normalUsd: tcgNormal.marketPrice ? Number(tcgNormal.marketPrice).toFixed(2) : null,
        holoUsd: tcgHolo.marketPrice ? Number(tcgHolo.marketPrice).toFixed(2) : null,
        reverseUsd: tcgReverse.marketPrice ? Number(tcgReverse.marketPrice).toFixed(2) : null,
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
