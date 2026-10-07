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
 * 100% Precision Multi-Factor Search Engine with HP Matching & Instant Direct ID Resolution
 */
export async function searchCard(params) {
  const { 
    primaryName = '', 
    name = '',
    hp = '',
    stage = '',
    category = '',
    detectedCategory = null,
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

  // Parse HP (e.g. "110 PV", "110 HP", 110)
  let targetHp = null;
  if (hp) {
    const parsedHp = parseInt(String(hp).replace(/\D/g, ''), 10);
    if (!isNaN(parsedHp) && parsedHp >= 30 && parsedHp <= 400) {
      targetHp = parsedHp;
    }
  }

  // Determine target set ID from set code OR set total
  let mappedSetId = setCode ? (SET_ALIASES[setCode.toUpperCase()] || (setCode.toLowerCase() !== 'base' && setCode.toLowerCase() !== 'basic' ? setCode.toLowerCase() : null)) : null;
  if (!mappedSetId && totalInSet && SET_TOTAL_MAP[totalInSet]) {
    mappedSetId = SET_TOTAL_MAP[totalInSet];
  }

  const targetTotal = parseInt(totalInSet, 10) || null;
  const targetStage = stage || detectedCategory?.stage || '';
  const searchEndpoints = [API_FR, API_EN];
  const candidateMap = new Map();

  // --- FAST TRACK 1: Direct Exact Card ID Lookup (Instant 100% Match via Set + Fraction) ---
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
                  recognizedSetCode: setCode,
                  recognizedHp: targetHp ? `${targetHp} PV` : ''
                }
              };
            }
          }
        } catch (e) {}
      }
    }
  }

  // Helper to add raw candidates from search queries
  const addRawCandidate = (card, bonus = 0) => {
    if (!card || !card.id) return;
    if (!candidateMap.has(card.id)) {
      candidateMap.set(card.id, { card, initialBonus: bonus });
    } else {
      const existing = candidateMap.get(card.id);
      if (bonus > existing.initialBonus) {
        existing.initialBonus = bonus;
      }
    }
  };

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
              if (Array.isArray(list)) {
                for (const card of list) {
                  addRawCandidate(card, 150);
                }
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
          if (Array.isArray(list)) {
            for (const card of list) {
              addRawCandidate(card, 40);
            }
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
              if (Array.isArray(list)) {
                for (const card of list) {
                  addRawCandidate(card, 20);
                }
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  if (candidateMap.size === 0) {
    return null;
  }

  // --- ENRICH CANDIDATES IN PARALLEL (Fetch full details for accurate HP, Set & Stage scoring) ---
  const rawList = Array.from(candidateMap.values()).slice(0, 16);
  const detailedCandidates = await Promise.all(
    rawList.map(async ({ card, initialBonus }) => {
      try {
        const details = await getCardDetails(card.id);
        return {
          card: details || card,
          rawBonus: initialBonus
        };
      } catch (e) {
        return { card, rawBonus: initialBonus };
      }
    })
  );

  // --- MULTI-FACTOR FINAL RANKING ENGINE ---
  const scoredCandidates = [];
  const ctx = {
    searchName,
    wordsToSearch,
    numbersToSearch,
    targetHp,
    targetTotal,
    targetStage,
    mappedSetId
  };

  for (const item of detailedCandidates) {
    const card = item.card;
    if (!card || !card.id) continue;

    let score = item.rawBonus || 0;
    const cardName = (card.name || '').toLowerCase().replace(/[-_']/g, ' ');
    const cardId = String(card.localId || '').trim();
    const cleanCardId = cardId.replace(/^0+/, '');
    const paddedCardId = cleanCardId.padStart(3, '0');

    // 1. Name Match
    const targetLower = (searchName || '').toLowerCase().replace(/[-_']/g, ' ');
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

    for (const word of wordsToSearch) {
      const wLower = word.toLowerCase().replace(/[-_']/g, ' ');
      if (cardName.includes(wLower)) {
        score += 20;
        break;
      }
    }

    // 2. Number / Local ID Match
    for (const num of numbersToSearch) {
      const cleanN = String(num).replace(/^0+/, '');
      const paddedN = cleanN.padStart(3, '0');
      if (String(num) === cardId) {
        score += 120;
        break;
      } else if (cleanN === cleanCardId || paddedN === paddedCardId) {
        score += 100;
        break;
      }
    }

    // 3. Set Code / Total in Set Match
    if (mappedSetId && card.id.toLowerCase().includes(mappedSetId.toLowerCase())) {
      score += 150;
    }
    if (targetTotal && card.set?.cardCount?.official && Number(card.set.cardCount.official) === targetTotal) {
      score += 150;
    }

    // 4. HP / PV Match (Crucial for disambiguating identical Pokémon across eras)
    if (targetHp && card.hp) {
      const cardHpNum = parseInt(String(card.hp).replace(/\D/g, ''), 10);
      if (cardHpNum === targetHp) {
        score += 100; // Strong match for exact HP!
      } else {
        score -= 40;  // Strong penalty for different HP!
      }
    }

    // 5. Stage Match (Base vs Niveau 1 vs Niveau 2)
    if (targetStage && card.stage) {
      const stageLower = String(card.stage).toLowerCase();
      const targetStageLower = String(targetStage).toLowerCase();
      if (stageLower === targetStageLower || stageLower.includes(targetStageLower) || targetStageLower.includes(stageLower)) {
        score += 40;
      }
    }

    // 6. Image Availability Bonus
    if (card.image) {
      score += 10;
    }

    scoredCandidates.push({ card, score });
  }

  const sorted = scoredCandidates
    .filter(c => c.score >= 50)
    .sort((a, b) => b.score - a.score)
    .map(c => c.card);

  if (sorted.length === 0) {
    return null;
  }

  const bestMatch = sorted[0];

  return {
    bestMatch,
    alternatives: sorted.slice(1, 10),
    meta: {
      recognizedName: searchName || bestMatch.name,
      recognizedId: localId,
      recognizedTotal: totalInSet,
      recognizedSetCode: setCode,
      recognizedHp: targetHp ? `${targetHp} PV` : ''
    }
  };
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
 * Get Normalized Card Category, Evolution Stage, Badges and Colors
 */
export function getCardCategoryInfo(card) {
  if (!card) return { category: 'Pokémon', stage: 'Base', badge: '⚡ BASE', color: '#10b981', label: 'Base', chipClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };

  const catRaw = (card.category || '').toLowerCase();
  const stageRaw = (card.stage || '').toLowerCase();
  const name = (card.name || '').toLowerCase();
  const itemType = (card.item?.name || card.trainerType || card.energyType || '').toLowerCase();

  // 1. Énergies / Energy
  if (catRaw === 'energy' || catRaw === 'énergie' || catRaw.includes('energie') || name.includes('énergie') || name.includes('energy')) {
    if (stageRaw.includes('special') || stageRaw.includes('spéciale') || itemType.includes('special') || name.includes('spéciale') || name.includes('special')) {
      return {
        category: 'Énergie',
        stage: 'Spéciale',
        label: 'Énergie Spéciale',
        badge: '🔮 ÉNERGIE SPÉCIALE',
        color: '#8b5cf6',
        chipClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      };
    }
    return {
      category: 'Énergie',
      stage: 'Base',
      label: 'Énergie de Base',
      badge: '⚡ ÉNERGIE DE BASE',
      color: '#eab308',
      chipClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
    };
  }

  // 2. Dresseurs / Trainers
  if (catRaw === 'trainer' || catRaw === 'dresseur' || name.includes('dresseur') || card.trainerType) {
    if (stageRaw.includes('supporter') || itemType.includes('supporter') || name.includes('supporter')) {
      return {
        category: 'Dresseur',
        stage: 'Supporter',
        label: 'Dresseur - Supporter',
        badge: '🎒 SUPPORTER',
        color: '#f59e0b',
        chipClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      };
    }
    if (stageRaw.includes('item') || stageRaw.includes('objet') || itemType.includes('item') || itemType.includes('objet')) {
      return {
        category: 'Dresseur',
        stage: 'Objet',
        label: 'Dresseur - Objet',
        badge: '🧪 OBJET',
        color: '#0ea5e9',
        chipClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30'
      };
    }
    if (stageRaw.includes('stadium') || stageRaw.includes('stade') || itemType.includes('stadium') || itemType.includes('stade')) {
      return {
        category: 'Dresseur',
        stage: 'Stade',
        label: 'Dresseur - Stade',
        badge: '🏟️ STADE',
        color: '#10b981',
        chipClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      };
    }
    if (stageRaw.includes('tool') || stageRaw.includes('outil') || itemType.includes('tool')) {
      return {
        category: 'Dresseur',
        stage: 'Outil',
        label: 'Dresseur - Outil Pokémon',
        badge: '🔧 OUTIL',
        color: '#a855f7',
        chipClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      };
    }
    if (stageRaw.includes('high-tech') || stageRaw.includes('ace spec') || itemType.includes('ace')) {
      return {
        category: 'Dresseur',
        stage: 'High-Tech',
        label: 'Dresseur - High-Tech',
        badge: '💎 HIGH-TECH',
        color: '#ec4899',
        chipClass: 'bg-pink-500/20 text-pink-300 border-pink-500/30'
      };
    }
    return {
      category: 'Dresseur',
      stage: 'Dresseur',
      label: 'Dresseur',
      badge: '🎒 DRESSEUR',
      color: '#f59e0b',
      chipClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    };
  }

  // 3. Pokémon Special Formats
  if (name.includes(' vmax') || stageRaw === 'vmax') {
    return {
      category: 'Pokémon',
      stage: 'VMAX',
      label: 'Pokémon VMAX',
      badge: '👑 POKÉMON VMAX',
      color: '#ec4899',
      chipClass: 'bg-pink-500/20 text-pink-300 border-pink-500/30'
    };
  }
  if (name.includes(' vstar') || stageRaw === 'vstar') {
    return {
      category: 'Pokémon',
      stage: 'VSTAR',
      label: 'Pokémon VSTAR',
      badge: '⭐ POKÉMON VSTAR',
      color: '#eab308',
      chipClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    };
  }
  if (name.endsWith(' ex') || name.includes('-ex') || name.includes(' ex ') || stageRaw === 'ex') {
    return {
      category: 'Pokémon',
      stage: 'ex',
      label: 'Pokémon ex',
      badge: '✨ POKÉMON ex',
      color: '#38bdf8',
      chipClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30'
    };
  }
  if (name.endsWith(' v') || stageRaw === 'v' || stageRaw === 'basic v') {
    return {
      category: 'Pokémon',
      stage: 'V',
      label: 'Pokémon V',
      badge: '⚡ POKÉMON V',
      color: '#8b5cf6',
      chipClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    };
  }
  if (stageRaw.includes('stage 2') || stageRaw.includes('stage2') || stageRaw.includes('niveau 2') || stageRaw.includes('niveau2')) {
    return {
      category: 'Pokémon',
      stage: 'Niveau 2',
      label: 'Niveau 2',
      badge: '⭐ NIVEAU 2',
      color: '#a855f7',
      chipClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    };
  }
  if (stageRaw.includes('stage 1') || stageRaw.includes('stage1') || stageRaw.includes('niveau 1') || stageRaw.includes('niveau1') || stageRaw.includes('evolution')) {
    return {
      category: 'Pokémon',
      stage: 'Niveau 1',
      label: 'Niveau 1',
      badge: '🔷 NIVEAU 1',
      color: '#3b82f6',
      chipClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    };
  }
  if (stageRaw.includes('baby') || stageRaw.includes('bébé')) {
    return {
      category: 'Pokémon',
      stage: 'Bébé',
      label: 'Bébé',
      badge: '👶 BÉBÉ',
      color: '#f472b6',
      chipClass: 'bg-pink-500/20 text-pink-300 border-pink-500/30'
    };
  }
  if (stageRaw.includes('restored') || stageRaw.includes('restauré')) {
    return {
      category: 'Pokémon',
      stage: 'Restauré',
      label: 'Restauré',
      badge: '🦖 RESTAURÉ',
      color: '#78716c',
      chipClass: 'bg-stone-500/20 text-stone-300 border-stone-500/30'
    };
  }

  // Standard Basic Pokémon
  return {
    category: 'Pokémon',
    stage: 'Base',
    label: 'Base',
    badge: '⚡ BASE',
    color: '#10b981',
    chipClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
  };
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
  const categoryInfo = getCardCategoryInfo(raw);

  return {
    id: raw.id,
    name: raw.name,
    localId: raw.localId,
    rarity: raw.rarity || 'Commune',
    category: categoryInfo.category,
    stage: categoryInfo.stage,
    categoryInfo,
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
