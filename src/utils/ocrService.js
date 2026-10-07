import { createWorker } from 'tesseract.js';
import { extractAndPreprocessRoi } from './cardDetection';

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

// Known trainer and special prefixes / names
const COMMON_NAMES = [
  'Tissenboule de la Team Rocket', 'Amos de la Team Rocket', 'Amis de la Team Rocket', 'Sbire de la Team Rocket',
  'Nostenfer-ex de la Team Rocket', 'Nidoking-ex de la Team Rocket', 'Énergie de la Team Rocket',
  'Tissenboule', 'Filentrappe', 'Sucroquin', 'Cupcanaille', 'Grotichon', 'Gruikui', 'Roitiflam',
  'Pikachu', 'Dracaufeu', 'Tortank', 'Florizarre', 'Mewtwo', 'Mew', 'Rayquaza', 'Gengar', 'Ectoplasma',
  'Lugia', 'Giratina', 'Umbreon', 'Noctali', 'Mentali', 'Aquali', 'Pyroli', 'Voltali', 'Givrali', 'Phyllali', 'Nymphali',
  'Beldeneige', 'Frissonille', 'Groudon', 'Kyogre', 'Dialga', 'Palkia', 'Arceus', 'Zekrom', 'Reshiram',
  'Lucario', 'Carchacrok', 'Gardevoir', 'Ronflex', 'Evoli', 'Salamèche', 'Reptincel', 'Bulbizarre', 'Herbizarre',
  'Carapuce', 'Carabaffe', 'Fantominus', 'Spectrum', 'Alakazam', 'Léviator', 'Magicarpe', 'Minidraco', 'Dracolosse',
  'Porygon', 'Porygon2', 'Porygon-Z', 'Malamandre', 'Mortermure', 'Rugit-Lune', 'Garde-de-Fer', 'Pelage-Sablé',
  'Paume-de-Fer', 'Hurle-Queue', 'Fongus-Furie', 'Flotte-Mèche', 'Hotte-de-Fer', 'Épine-de-Fer', 'Chef-de-Fer'
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
   * Scan card canvas with multi-pass OCR
   */
  async scanCard(cardCanvas, onProgress = () => {}) {
    if (typeof window !== 'undefined') {
      window.__onOcrProgress = onProgress;
    }
    const worker = await this.getWorker();

    onProgress(0.2);
    // 1. Scan Top Header (Name & HP)
    const topRoi = extractAndPreprocessRoi(cardCanvas, 'top_name');
    const topResult = await worker.recognize(topRoi);
    const topText = topResult?.data?.text || '';

    onProgress(0.6);
    // 2. Scan Full Card for Complete Context
    const fullResult = await worker.recognize(cardCanvas);
    const fullText = fullResult?.data?.text || '';

    onProgress(0.9);
    const parsed = this.parseCardData(topText, fullText);
    onProgress(1.0);

    return {
      rawTopText: topText,
      rawFullText: fullText,
      ...parsed
    };
  }

  /**
   * Advanced Card Data Parser & Header Tokenizer
   */
  parseCardData(topText, fullText) {
    const combined = `${topText}\n${fullText}`;

    // 1. Extract Set Code (ASC, ME02.5, PAL, SVI, SSP, SCR, TWM, TEF, PAF, PAR, MEW, OBF, etc.)
    let setCodeCandidate = '';
    const setMatch = combined.match(/\b(ASC|ME02\.5|MEE|PAL|SSP|SCR|TWM|TEF|PAF|PAR|MEW|OBF|SVI|CRZ|SIT|EVS|CRE|BST|VIV|DAA|SSH|SM\d*|XY\d*|BW\d*|DP\d*|BASE)\b/i);
    if (setMatch) {
      setCodeCandidate = setMatch[1].toUpperCase();
    }

    // 2. Extract Card Number & Fraction (e.g. 018/217, 201/217, 030/217, 093/217, 20127)
    let localIdCandidate = '';
    let totalInSetCandidate = '';
    const numbers = new Set();

    const normalizedText = combined
      .replace(/([0-9])\s*[Il|]\s*([0-9])/g, '$1/$2')
      .replace(/([0-9])\s*(\/)\s*([0-9])/g, '$1/$3');

    // Standard Fraction Match: XXX/YYY
    const fracMatches = [...normalizedText.matchAll(/(\d{1,3})\s*\/\s*(\d{2,3})/g)];
    if (fracMatches.length > 0) {
      localIdCandidate = fracMatches[0][1];
      totalInSetCandidate = fracMatches[0][2];
      numbers.add(localIdCandidate);
    } else {
      // Corrupted OCR fraction match (e.g., 201217, 20127, 018217, 030217, 093217)
      const corruptedMatch = normalizedText.match(/\b(0\d{2}|\d{2,3})\s*(217|193|197|165|142|102|162|151|198|182|223|200)\b/);
      if (corruptedMatch) {
        localIdCandidate = corruptedMatch[1];
        totalInSetCandidate = corruptedMatch[2];
        numbers.add(localIdCandidate);
      }
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

    // 4. Primary Pokémon / Trainer Name Extraction
    let primaryName = '';

    // A. Check Top Header Lines First
    const lines = combined.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Match pattern: [BASE/NIVEAU/DRESSEUR] <NAME> [PV/HP xx]
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

    // B. Dictionary & Fuzzy Matcher if primary name is still empty or corrupted
    if (!primaryName || primaryName.length < 3) {
      for (const word of candidateWords) {
        const fuzzy = findFuzzyMatch(word);
        if (fuzzy) {
          primaryName = fuzzy;
          break;
        }
      }
    }

    // C. Fallback to first valid candidate word
    if (!primaryName && candidateWords.length > 0) {
      primaryName = candidateWords[0];
    }

    // Final fuzzy polish
    if (primaryName) {
      const fuzzy = findFuzzyMatch(primaryName);
      if (fuzzy) primaryName = fuzzy;
    }

    return {
      primaryName,
      candidateWords,
      extractedNumbers: Array.from(numbers),
      localId: localIdCandidate,
      totalInSet: totalInSetCandidate,
      setCode: setCodeCandidate
    };
  }
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
    'pikachu': 'Pikachu',
    'croudon': 'Groudon',
    'groudan': 'Groudon',
    'beldeneiqe': 'Beldeneige',
    'beideneige': 'Beldeneige',
    'grotichan': 'Grotichon',
    'grotichont': 'Grotichon',
    'tissenbouie': 'Tissenboule',
    'sucroguin': 'Sucroquin',
    'fantomlnus': 'Fantominus',
    'amos de la team rocket': 'Amos de la Team Rocket',
    'amis de la team rocket': 'Amos de la Team Rocket',
    'tissenboule de la team rocket': 'Tissenboule de la Team Rocket',
    'tissenboule de la team rocker': 'Tissenboule de la Team Rocket'
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

    // Levenshtein distance check for short single-word names
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
