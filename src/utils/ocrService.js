import { createWorker } from 'tesseract.js';
import { extractAndPreprocessRoi } from './cardDetection';

// Non-Pokémon layout words and file noise to filter out
const STOP_WORDS = new Set([
  'base', 'basic', 'niveau', 'stage', 'dresseur', 'trainer', 'supporter', 'stade', 'stadium', 'item', 'objet', 'talent', 'ability',
  'faiblesse', 'weakness', 'resistance', 'résistance', 'retraite', 'retreat', 'pokemon', 'pokémon', 'evolution', 'évolution',
  'degats', 'dégâts', 'damage', 'tour', 'turn', 'adversaire', 'opponent', 'carte', 'card', 'deck', 'hand', 'main', 'pioche', 'piochez', 'draw',
  'votre', 'your', 'cette', 'this', 'joueur', 'player', 'melange', 'mélange', 'shuffle', 'pendant', 'during', 'regle', 'règle', 'rule', 'game', 'freak',
  'nintendo', 'creatures', 'taille', 'poids', 'confiserie', 'cochon', 'mite', 'givre', 'gaz',
  'defenseur', 'défenseur', 'utilise', 'utilisez', 'active', 'banc', 'bench', 'poste', 'energie', 'énergie', 'energy',
  'incolore', 'colorless', 'plante', 'grass', 'feu', 'fire', 'eau', 'water', 'lightning', 'electrik', 'combat', 'fighting', 'obscurite', 'obscurité', 'darkness', 'metal', 'métal', 'steel',
  'psy', 'psychic', 'dragon', 'illus', 'illustrator', 'illustrateur', 'copyright', 'edition', 'édition',
  'flip', 'coin', 'tails', 'heads', 'discard', 'takes', 'prize', 'prizes'
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
        const worker = await createWorker('fra+eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text' && window.__onOcrProgress) {
              window.__onOcrProgress(m.progress);
            }
          }
        });
        
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèêëàâäôöûüçîï/\'-.@ ',
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
   * Comprehensive Multi-Zone OCR Scan
   */
  async scanCard(cardCanvas, onProgress = () => {}) {
    window.__onOcrProgress = onProgress;
    const worker = await this.getWorker();

    // 1. Scan Top Header Zone (Name & HP)
    onProgress(0.15);
    const topRoi = extractAndPreprocessRoi(cardCanvas, 'top_name');
    const topResult = await worker.recognize(topRoi);
    const topText = topResult.data.text || '';

    // 2. Scan Bottom Footer Zone (Card Number, Set Code)
    onProgress(0.45);
    const bottomRoi = extractAndPreprocessRoi(cardCanvas, 'bottom_number');
    const bottomResult = await worker.recognize(bottomRoi);
    const bottomText = bottomResult.data.text || '';

    // 3. Scan Full Card for complete context (attacks, symbols)
    onProgress(0.70);
    const fullRoi = extractAndPreprocessRoi(cardCanvas, 'full');
    const fullResult = await worker.recognize(fullRoi);
    const fullText = fullResult.data.text || '';

    onProgress(0.90);
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
   * Advanced Multi-Token & Pattern Parser with Noise Rejection
   */
  parseCardData(topText, bottomText, fullText) {
    const combined = `${topText}\n${bottomText}\n${fullText}`;

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

    // 2. Extract Set Code (PAL, ASC, MEE, ME02.5, SVP, OBF, SSP, TWM, SVI, PAR, TEF, SCR, MEW, LOR, etc.)
    let setCodeCandidate = '';
    const setMatch = normalizedText.match(/\b(PAL|ASC|MEE|ME02\.5|ME|SVP|OBF|SSP|TWM|SVI|PAR|TEF|SCR|PRE|MEW|LOR|ASR|BRS|FST|EVS|CRE|BST|VIV|DAA|SSH)\b/i);
    if (setMatch) {
      setCodeCandidate = setMatch[1].toUpperCase();
    }

    // 3. Extract and Clean Candidate Words (filtering out file names, hex codes, stop words)
    const allWords = combined.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
    const candidateWords = [];
    const seenWords = new Set();

    for (const rawWord of allWords) {
      const word = cleanWord(rawWord);
      const lower = word.toLowerCase();

      // Reject file extensions, screen codes (e.g. 5323b, ed.pn, png, jpg, media)
      if (
        lower.length < 3 ||
        STOP_WORDS.has(lower) ||
        seenWords.has(lower) ||
        /^(png|jpg|jpeg|webp|media|img|file|screen|cromes|github)$/i.test(lower) ||
        /^[0-9a-f]{4,}$/i.test(lower) // reject hex codes
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
      // Skip file names or stage prefixes
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

  // Known corrections
  const TYPO_MAP = {
    'pikachuex': 'Pikachu ex',
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
