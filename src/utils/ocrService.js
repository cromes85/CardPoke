import { createWorker } from 'tesseract.js';
import { extractAndPreprocessRoi } from './cardDetection.js';

const STOP_WORDS = new Set([
  'base', 'basic', 'niveau', 'stage', 'dresseur', 'trainer', 'supporter', 'stade', 'stadium', 'item', 'objet', 'talent', 'ability',
  'faiblesse', 'weakness', 'resistance', 'résistance', 'retraite', 'retreat', 'pokemon', 'pokémon', 'evolution', 'évolution',
  'degats', 'dégâts', 'damage', 'tour', 'turn', 'adversaire', 'opponent', 'carte', 'card', 'deck', 'hand', 'main', 'pioche', 'piochez', 'draw',
  'votre', 'your', 'cette', 'this', 'joueur', 'player', 'melange', 'mélange', 'shuffle', 'pendant', 'during', 'regle', 'règle', 'rule', 'game', 'freak',
  'nintendo', 'creatures', 'taille', 'poids', 'confiserie', 'cochon', 'mite', 'givre', 'gaz',
  'defenseur', 'défenseur', 'utilise', 'utilisez', 'active', 'banc', 'bench', 'poste', 'energie', 'énergie', 'energy',
  'incolore', 'colorless', 'plante', 'grass', 'feu', 'fire', 'eau', 'water', 'lightning', 'electrik', 'combat', 'fighting', 'obscurite', 'obscurité', 'darkness', 'metal', 'métal', 'steel',
  'psy', 'psychic', 'dragon', 'illus', 'illustrator', 'illustrateur', 'copyright', 'edition', 'édition', 'boule', 'fil'
]);

// Official Pokémon Set Total Mappings (Instant Zero-Mistake Identification)
export const SET_TOTAL_MAP = {
  '217': 'me02.5', // Héros Transcendants / ASC
  '165': 'sv03.5', // 151
  '193': 'sv02',   // Évolutions à Paldea
  '198': 'sv01',   // Écarlate et Violet
  '197': 'sv03',   // Flammes Obsidiennes
  '182': 'sv04',   // Faille Paradoxe
  '162': 'sv05',   // Forces Temporelles
  '167': 'sv06',   // Mascarade Crépusculaire
  '142': 'sv07',   // Couronne Stellaire
  '191': 'sv08',   // Étincelles Radieuses
  '091': 'sv04.5', // Destinées de Paldea
  '159': 'swsh12.5',
  '195': 'swsh12',
  '196': 'swsh11',
  '189': 'swsh10',
  '172': 'swsh9',
  '264': 'swsh8',
  '203': 'swsh7',
  '102': 'base1'
};

const COMMON_NAMES = [
  'Métang', 'Metang', 'Dedenne', 'Spectrum', 'Haunter', 'Étourmi', 'Etourmi', 'Étourvol', 'Staravia', 'Étouraptor', 'Staraptor',
  'Terhal', 'Beldum', 'Métalosse', 'Metagross', 'Monorpale', 'Honedge', 'Dimoclès', 'Doublade', 'Exagide', 'Aegislash',
  'Tissenboule de la Team Rocket', 'Amos de la Team Rocket', 'Amis de la Team Rocket', 'Sbire de la Team Rocket',
  'Nostenfer-ex de la Team Rocket', 'Nidoking-ex de la Team Rocket', 'Énergie de la Team Rocket',
  'Sorboul de N', 'Sorbébé de N', 'Sorbouboul de N', 'Grotichon', 'Gruikui', 'Roitiflam',
  'Tissenboule', 'Filentrappe', 'Sucroquin', 'Cupcanaille', 'Germéclat', 'Glimmet', 'Floréclat', 'Glimmora',
  'Pikachu', 'Pikachu-ex', 'Dracaufeu', 'Dracaufeu-ex', 'Charizard', 'Charizard-ex', 'Tortank', 'Tortank-ex', 'Blastoise', 'Florizarre', 'Florizarre-ex', 'Venusaur',
  'Mewtwo', 'Mew', 'Mew-ex', 'Rayquaza', 'Rayquaza VMAX', 'Gengar', 'Ectoplasma', 'Ectoplasma-ex',
  'Lugia', 'Lugia V', 'Giratina', 'Giratina VSTAR', 'Noctali', 'Umbreon', 'Noctali VMAX', 'Mentali', 'Espeon', 'Aquali', 'Vaporeon', 'Pyroli', 'Flareon', 'Voltali', 'Jolteon', 'Givrali', 'Glaceon', 'Phyllali', 'Leafeon', 'Nymphali', 'Sylveon',
  'Beldeneige', 'Frosmoth', 'Frissonille', 'Snom', 'Groudon', 'Kyogre', 'Dialga', 'Palkia', 'Arceus', 'Zekrom', 'Reshiram',
  'Lucario', 'Carchacrok', 'Garchomp', 'Gardevoir', 'Gardevoir-ex', 'Ronflex', 'Snorlax', 'Evoli', 'Eevee', 'Salamèche', 'Charmander', 'Reptincel', 'Charmeleon', 'Bulbizarre', 'Bulbasaur', 'Herbizarre', 'Ivysaur',
  'Carapuce', 'Squirtle', 'Carabaffe', 'Wartortle', 'Fantominus', 'Gastly', 'Alakazam', 'Léviator', 'Gyarados', 'Magicarpe', 'Magikarp', 'Minidraco', 'Dratini', 'Draco', 'Dragonair', 'Dracolosse', 'Dragonite',
  'Porygon', 'Porygon2', 'Porygon-Z', 'Malamandre', 'Salazzle', 'Mortermure', 'Pecharunt', 'Rugit-Lune', 'Roaring Moon', 'Garde-de-Fer', 'Iron Valiant', 'Pelage-Sablé', 'Sandy Shocks',
  'Paume-de-Fer', 'Iron Hands', 'Hurle-Queue', 'Scream Tail', 'Fongus-Furie', 'Brute Bonnet', 'Flotte-Mèche', 'Flutter Mane', 'Hotte-de-Fer', 'Iron Bundle', 'Épine-de-Fer', 'Iron Thorns', 'Chef-de-Fer', 'Iron Crown', 'Marill', 'Azumarill'
];

class OcrService {
  constructor() {
    this.worker = null;
    this.isInitializing = false;
    this.initPromise = null;
  }

  async getWorker() {
    if (this.worker) return this.worker;
    
    if (this.isInitializing) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = (async () => {
      try {
        const worker = await createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text' && typeof window !== 'undefined' && window.__onOcrProgress) {
              window.__onOcrProgress(m.progress);
            }
          }
        });

        this.worker = worker;
        this.isInitializing = false;
        return worker;
      } catch (err) {
        console.error("Failed to initialize Tesseract worker:", err);
        this.isInitializing = false;
        throw err;
      }
    })();

    return this.initPromise;
  }

  /**
   * 3-Pass High-Precision Scan: Header Name + Bottom Number + Full Context
   */
  async scanCard(cardCanvas, onProgress = () => {}) {
    if (typeof window !== 'undefined') {
      window.__onOcrProgress = onProgress;
    }
    const worker = await this.getWorker();

    onProgress(0.15);
    // 1. Scan Top Header (Clean Binarized Name & HP)
    const topRoi = extractAndPreprocessRoi(cardCanvas, 'top_name');
    const topResult = await worker.recognize(topRoi);
    const topText = topResult?.data?.text || '';

    onProgress(0.45);
    // 2. Scan Bottom Number Zone (Clean Binarized Fraction & Set Code)
    const bottomRoi = extractAndPreprocessRoi(cardCanvas, 'bottom_number');
    const bottomResult = await worker.recognize(bottomRoi);
    const bottomText = bottomResult?.data?.text || '';

    onProgress(0.75);
    // 3. Scan Full Card Context (Backup for Trainer / Full-Art cards)
    const fullResult = await worker.recognize(cardCanvas);
    const fullText = fullResult?.data?.text || '';

    onProgress(0.95);
    const parsed = this.parseCardData(topText, bottomText, fullText);
    onProgress(1.0);

    return {
      rawTopText: topText,
      rawBottomText: bottomText,
      rawFullText: fullText,
      ...parsed
    };
  }

  /**
   * Advanced Multi-Zone Parser with Set-Total Discrimination
   */
  parseCardData(topText, bottomText, fullText) {
    const combined = `${topText}\n${bottomText}\n${fullText}`;

    // 1. Extract Fraction & Number (e.g. 050/217, 030/217, 018/217, 201/217, 006/165)
    let localIdCandidate = '';
    let totalInSetCandidate = '';
    const numbers = new Set();

    const normalizedBottom = `${bottomText}\n${combined}`
      .replace(/([0-9])\s*[Il|]\s*([0-9])/g, '$1/$2')
      .replace(/([0-9])\s*(\/)\s*([0-9])/g, '$1/$3');

    const fracMatches = [...normalizedBottom.matchAll(/(\d{1,3})\s*\/\s*(\d{2,3})/g)];
    if (fracMatches.length > 0) {
      localIdCandidate = fracMatches[0][1];
      totalInSetCandidate = fracMatches[0][2];
      numbers.add(localIdCandidate);
    } else {
      // Corrupted OCR digits (e.g. 050217, 030217, 018217, 201217, 20127)
      const corruptedMatch = normalizedBottom.match(/\b(0\d{2}|\d{2,3})\s*(217|165|193|198|197|182|162|167|142|191|102)\b/);
      if (corruptedMatch) {
        localIdCandidate = corruptedMatch[1];
        totalInSetCandidate = corruptedMatch[2];
        numbers.add(localIdCandidate);
      }
    }

    // 2. Extract Set Code (ASC, ME02.5, PAL, SSP, SCR, TWM, TEF, PAF, PAR, MEW, OBF, SVI, etc.)
    // Note: NEVER match 'BASE' or 'BASIC' as a set code since it means Basic Pokémon!
    let setCodeCandidate = '';
    const setMatch = combined.match(/\b(ASC|ME02\.5|MEE|PAL|SSP|SCR|TWM|TEF|PAF|PAR|MEW|OBF|SVI|CRZ|SIT|EVS|CRE|BST|VIV|DAA|SSH)\b/i);
    if (setMatch) {
      setCodeCandidate = setMatch[1].toUpperCase();
    }

    // Infer setCode from total if not found explicitly
    if (!setCodeCandidate && totalInSetCandidate && SET_TOTAL_MAP[totalInSetCandidate]) {
      setCodeCandidate = SET_TOTAL_MAP[totalInSetCandidate].toUpperCase();
    }

    // 3. Extract and Clean Candidate Words
    const allWords = combined.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
    const candidateWords = [];
    const seenWords = new Set();

    for (const rawWord of allWords) {
      const word = cleanWord(rawWord);
      const lower = word.toLowerCase();

      if (
        lower.length < 3 ||
        STOP_WORDS.has(lower) ||
        seenWords.has(lower) ||
        /^(png|jpg|jpeg|webp|media|img|file|screen|cromes|github|niveau|basic|base|pv|hp)$/i.test(lower) ||
        /^[0-9a-f]{4,}$/i.test(lower)
      ) {
        continue;
      }

      seenWords.add(lower);
      candidateWords.push(word);
    }

    // 4. Primary Pokémon Name Extraction
    let primaryName = '';

    // Check top header lines first (crisp name zone)
    const headerLines = `${topText}\n${fullText}`.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of headerLines) {
      const headerMatch = line.match(/(?:BASE|BASIC|NIVEAU\s*\d?|STAGE\s*\d?|DRESSEUR|TRAINER)?\s*([A-Za-zÀ-ÿ\s'-]+?)\s*(?:PV|HP|P\/V|H\/P|\d{2,3}\s*PV|\d{2,3}\s*HP|$)/i);
      if (headerMatch && headerMatch[1]) {
        let candidate = headerMatch[1].trim()
          .replace(/^(BASE|BASIC|NIVEAU|STAGE|DRESSEUR|TRAINER|Évolution|Evolution)\s*/gi, '')
          .replace(/\s*(PV|HP|P\/V|H\/P|\d+)$/gi, '')
          .trim();
        
        candidate = cleanWord(candidate);

        if (candidate.length >= 3 && !STOP_WORDS.has(candidate.toLowerCase()) && !/^(attaque|degats|faiblesse|resistance|retraite)$/i.test(candidate)) {
          primaryName = candidate;
          break;
        }
      }
    }

    // Dictionary fuzzy match fallback
    if (!primaryName || primaryName.length < 3) {
      for (const word of candidateWords) {
        const fuzzy = findFuzzyMatch(word);
        if (fuzzy) {
          primaryName = fuzzy;
          break;
        }
      }
    }

    if (!primaryName && candidateWords.length > 0) {
      primaryName = candidateWords[0];
    }

    if (primaryName) {
      const fuzzy = findFuzzyMatch(primaryName);
      if (fuzzy) primaryName = fuzzy;
    }

    // 6. HP / PV Extraction (e.g. 60 PV, 120 HP, 330 PC)
    let hpCandidate = '';
    const hpMatch = combined.match(/\b(\d{2,3})\s*(?:PV|HP|PC|P\/V|H\/P)\b/i) || combined.match(/(?:PV|HP|PC)\s*[:\s]*(\d{2,3})\b/i);
    if (hpMatch) {
      hpCandidate = `${hpMatch[1]} PV`;
    }

    // 5. Card Category & Stage Extraction (Base / Niveau 1 / Niveau 2 / Dresseur / Énergie)
    const detectedCategory = detectCategoryFromText(combined);

    return {
      primaryName,
      hp: hpCandidate,
      candidateWords,
      extractedNumbers: Array.from(numbers),
      localId: localIdCandidate,
      totalInSet: totalInSetCandidate,
      setCode: setCodeCandidate,
      detectedCategory
    };
  }

  /**
   * Fast real-time header recognition for live camera viewfinder in standby (Name + HP / PV)
   */
  async scanHeaderLive(headerCanvas) {
    if (!headerCanvas) return null;
    try {
      const worker = await this.getWorker();
      const res = await worker.recognize(headerCanvas);
      const text = res?.data?.text || '';

      // 1. Extract HP / PV (e.g., 60 PV, 120 HP, 330 PC)
      let hp = '';
      const hpMatch = text.match(/\b(\d{2,3})\s*(?:PV|HP|PC|P\/V|H\/P)\b/i) || text.match(/(?:PV|HP|PC)\s*[:\s]*(\d{2,3})\b/i);
      if (hpMatch) {
        hp = `${hpMatch[1]} PV`;
      }

      // 2. Extract Stage and Name
      let stage = '';
      if (/NIVEAU\s*2|STAGE\s*2/i.test(text)) stage = 'NIVEAU 2';
      else if (/NIVEAU\s*1|STAGE\s*1/i.test(text)) stage = 'NIVEAU 1';
      else if (/BASE|BASIC/i.test(text)) stage = 'BASE';
      else if (/DRESSEUR|TRAINER/i.test(text)) stage = 'DRESSEUR';

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      let name = '';
      for (const line of lines) {
        // Strip evolution subtitle (e.g. "Évolution de Terhal", "Évolution de Fantominus")
        let cleanLine = line
          .replace(/(?:Évolution|Evolution)\s+(?:de|of)\s+[A-Za-zÀ-ÿ'-]+/gi, ' ')
          .replace(/N[°o]\s*\d+.*?$/gi, ' ')
          .replace(/\b(?:BASE|BASIC|NIVEAU\s*\d?|STAGE\s*\d?|DRESSEUR|TRAINER)\b/gi, ' ')
          .replace(/\b(?:PV|HP|PC|P\/V|H\/P|\d{2,3}\s*(?:PV|HP|PC))\b/gi, ' ')
          .replace(/[0-9]/g, ' ')
          .trim();

        cleanLine = cleanWord(cleanLine);
        if (cleanLine.length >= 3 && !STOP_WORDS.has(cleanLine.toLowerCase()) && !/^(attaque|degats|faiblesse|resistance|retraite|taille|poids)$/i.test(cleanLine)) {
          name = cleanLine;
          break;
        }
      }

      if (name) {
        const fuzzy = findFuzzyMatch(name);
        if (fuzzy) name = fuzzy;
      }

      // Fallback to dictionary match on any words
      if (!name) {
        const words = (text.match(/[A-Za-zÀ-ÿ]{3,}/g) || [])
          .map(w => cleanWord(w))
          .filter(w => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()) && !/^(png|jpg|jpeg|webp|media|img|niveau|basic|base|pv|hp|pc|evolution|terhal|fantominus)$/i.test(w));
        for (const w of words) {
          const fuzzy = findFuzzyMatch(w);
          if (fuzzy) {
            name = fuzzy;
            break;
          }
        }
        if (!name && words.length > 0) {
          name = words[0];
        }
      }

      return {
        rawText: text,
        name: name || '',
        hp: hp || '',
        stage: stage || '',
        found: !!(name || hp)
      };
    } catch (e) {
      return null;
    }
  }
}

/**
 * Detect Card Category & Evolution Stage from raw text
 */
export function detectCategoryFromText(text) {
  const clean = (text || '').toLowerCase();

  // 1. Dresseurs / Trainers
  if (/\b(dresseur|trainer)\b/i.test(clean)) {
    if (/\b(supporter|partisan)\b/i.test(clean)) {
      return { category: 'Dresseur', subCategory: 'Supporter', stage: 'Supporter', badge: '🎒 SUPPORTER', color: '#f59e0b' };
    }
    if (/\b(objet|item)\b/i.test(clean)) {
      return { category: 'Dresseur', subCategory: 'Objet', stage: 'Objet', badge: '🧪 OBJET', color: '#0ea5e9' };
    }
    if (/\b(stade|stadium)\b/i.test(clean)) {
      return { category: 'Dresseur', subCategory: 'Stade', stage: 'Stade', badge: '🏟️ STADE', color: '#10b981' };
    }
    if (/\b(outil|tool)\b/i.test(clean)) {
      return { category: 'Dresseur', subCategory: 'Outil Pokémon', stage: 'Outil', badge: '🔧 OUTIL', color: '#8b5cf6' };
    }
    if (/\b(high-tech|ace spec)\b/i.test(clean)) {
      return { category: 'Dresseur', subCategory: 'High-Tech', stage: 'High-Tech', badge: '💎 HIGH-TECH', color: '#ec4899' };
    }
    return { category: 'Dresseur', subCategory: 'Dresseur', stage: 'Dresseur', badge: '🎒 DRESSEUR', color: '#f59e0b' };
  }

  // 2. Énergies / Energies
  if (/\b(energie|énergie|energy)\b/i.test(clean)) {
    if (/\b(speciale|spéciale|special)\b/i.test(clean)) {
      return { category: 'Énergie', subCategory: 'Énergie Spéciale', stage: 'Spéciale', badge: '🔮 ÉNERGIE SPÉCIALE', color: '#8b5cf6' };
    }
    return { category: 'Énergie', subCategory: 'Énergie de Base', stage: 'Base', badge: '⚡ ÉNERGIE DE BASE', color: '#eab308' };
  }

  // 3. Pokémon Stages & Formats
  if (/\b(niveau\s*2|stage\s*2|niv\.2|st\.2)\b/i.test(clean)) {
    return { category: 'Pokémon', subCategory: 'Niveau 2', stage: 'Niveau 2', badge: '⭐ NIVEAU 2', color: '#a855f7' };
  }
  if (/\b(niveau\s*1|stage\s*1|niv\.1|st\.1|evolution|évolution)\b/i.test(clean)) {
    return { category: 'Pokémon', subCategory: 'Niveau 1', stage: 'Niveau 1', badge: '🔷 NIVEAU 1', color: '#3b82f6' };
  }
  if (/\b(vmax)\b/i.test(clean)) {
    return { category: 'Pokémon', subCategory: 'Pokémon VMAX', stage: 'VMAX', badge: '👑 VMAX', color: '#ec4899' };
  }
  if (/\b(vstar)\b/i.test(clean)) {
    return { category: 'Pokémon', subCategory: 'Pokémon VSTAR', stage: 'VSTAR', badge: '⭐ VSTAR', color: '#eab308' };
  }
  if (/\b(v-union)\b/i.test(clean)) {
    return { category: 'Pokémon', subCategory: 'V-UNION', stage: 'V-UNION', badge: '⚡ V-UNION', color: '#06b6d4' };
  }
  if (/\b(base|basic|de base)\b/i.test(clean)) {
    return { category: 'Pokémon', subCategory: 'Base', stage: 'Base', badge: '⚡ BASE', color: '#10b981' };
  }

  return { category: 'Pokémon', subCategory: 'Standard', stage: 'Standard', badge: '🎴 CARTE', color: '#64748b' };
}

function cleanWord(str) {
  if (!str) return '';
  let clean = str
    .replace(/[@#$_]/g, '')
    .replace(/[^\w\s\séèêëàâäôöûüçîï'-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const TYPO_MAP = {
    'pikachuex': 'Pikachu ex',
    'pikachuded': 'Pikachu ex',
    'sorboulden': 'Sorboul de N',
    'sorboul de n': 'Sorboul de N',
    'sorboui': 'Sorboul',
    'grotichan': 'Grotichon',
    'grotichont': 'Grotichon',
    'tissenbouie': 'Tissenboule',
    'tissenboule de la team rocker': 'Tissenboule de la Team Rocket',
    'tissenboule de la team rocket': 'Tissenboule de la Team Rocket',
    'amos de la team rocker': 'Amos de la Team Rocket',
    'amos de la team rocket': 'Amos de la Team Rocket',
    'sucroguin': 'Sucroquin',
    'fantomlnus': 'Fantominus'
  };

  const lower = clean.toLowerCase();
  for (const [typo, fix] of Object.entries(TYPO_MAP)) {
    if (lower === typo || lower.includes(typo)) {
      return fix;
    }
  }

  return clean;
}

function findFuzzyMatch(str) {
  if (!str || str.length < 3) return null;
  const sLower = str.toLowerCase();

  for (const name of COMMON_NAMES) {
    const nLower = name.toLowerCase();
    if (sLower === nLower) return name;
    if (nLower.startsWith(sLower) || sLower.startsWith(nLower)) return name;

    if (!nLower.includes(' ') && !sLower.includes(' ') && Math.abs(nLower.length - sLower.length) <= 2) {
      if (levenshteinDistance(sLower, nLower) <= 2) {
        return name;
      }
    }
  }
  return null;
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export const ocrService = new OcrService();
