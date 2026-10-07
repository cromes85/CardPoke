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
  'psy', 'psychic', 'dragon', 'illus', 'illustrator', 'illustrateur', 'copyright', 'edition', 'édition'
]);

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
        // Use 'eng' language model: ultra-fast, lightweight (3MB), rock solid in all mobile browsers
        const worker = await createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text' && window.__onOcrProgress) {
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
   * Scan card canvas
   */
  async scanCard(cardCanvas, onProgress = () => {}) {
    window.__onOcrProgress = onProgress;
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
   * Advanced Parser & Tokenizer
   */
  parseCardData(topText, fullText) {
    const combined = `${topText}\n${fullText}`;

    // 1. Extract fraction numbers: XXX/YYY (e.g. 063/193, 053/217, 030/217, 201/217, 018/217)
    let localIdCandidate = '';
    let totalInSetCandidate = '';
    const numbers = new Set();

    const normalizedText = combined
      .replace(/([0-9])\s*[Il|]\s*([0-9])/g, '$1/$2')
      .replace(/([0-9])\s*(\/)\s*([0-9])/g, '$1/$3');

    const fracMatches = [...normalizedText.matchAll(/(\d{1,3})\s*\/\s*(\d{2,3})/g)];
    if (fracMatches.length > 0) {
      localIdCandidate = fracMatches[0][1];
      totalInSetCandidate = fracMatches[0][2];
      numbers.add(localIdCandidate);
      numbers.add(totalInSetCandidate);
    }

    // Collect standalone 2-3 digit numbers (e.g. 190, 60, 110, 50, 063, 108)
    const rawNumMatches = normalizedText.match(/\b\d{2,3}\b/g) || [];
    for (const num of rawNumMatches) {
      numbers.add(num);
    }

    // 2. Extract Set Code (PAL, ASC, MEE, ME02.5, ME, SVP, OBF, SSP, TWM, SVI, PAR, TEF, SCR, MEW, LOR, etc.)
    let setCodeCandidate = '';
    const setMatch = normalizedText.match(/\b(PAL|ASC|MEE|ME02\.5|ME|SVP|OBF|SSP|TWM|SVI|PAR|TEF|SCR|PRE|MEW|LOR|ASR|BRS|FST|EVS|CRE|BST|VIV|DAA|SSH)\b/i);
    if (setMatch) {
      setCodeCandidate = setMatch[1].toUpperCase();
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
        /^(png|jpg|jpeg|webp|media|img|file|screen|cromes|github)$/i.test(lower) ||
        /^[0-9a-f]{4,}$/i.test(lower)
      ) {
        continue;
      }

      seenWords.add(lower);
      candidateWords.push(word);
    }

    // 4. Primary Pokémon Name Extraction from Top Lines
    const topClean = topText.replace(/\r\n/g, '\n').trim();
    const topLines = topClean.split('\n').map(l => l.trim()).filter(Boolean);
    let primaryName = '';

    for (const line of topLines) {
      let candidate = line;
      if (/^(BASE|BASIC|NIVEAU|STAGE|NIV|Évolution|Evolution|\d{4}|\w+\.pn)/i.test(candidate)) continue;
      
      candidate = candidate.replace(/(?:PV|pv|HP|hp|P\/?V|H\/?P)\s*\d+/gi, '');
      candidate = candidate.replace(/[0-9]/g, '');
      candidate = cleanWord(candidate);

      if (candidate.length >= 3 && !STOP_WORDS.has(candidate.toLowerCase())) {
        primaryName = candidate;
        break;
      }
    }

    if (!primaryName && candidateWords.length > 0) {
      primaryName = candidateWords[0];
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

export const ocrService = new OcrService();
