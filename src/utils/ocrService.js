import { createWorker } from 'tesseract.js';
import { extractAndPreprocessRoi } from './cardDetection';

// Card layout words that should not be used as Pokémon name queries
const POKEMON_STOP_WORDS = new Set([
  'base', 'niveau', 'stage', 'dresseur', 'trainer', 'supporter', 'stade', 'objet', 'talent',
  'faiblesse', 'resistance', 'résistance', 'retraite', 'pokemon', 'pokémon', 'evolution', 'évolution',
  'degats', 'dégâts', 'tour', 'adversaire', 'carte', 'deck', 'main', 'pioche', 'piochez',
  'votre', 'cette', 'joueur', 'melange', 'mélange', 'pendant', 'regle', 'règle', 'game', 'freak',
  'nintendo', 'creatures', 'taille', 'poids', 'confiserie', 'cochon', 'mite', 'givre', 'gaz',
  'defenseur', 'défenseur', 'utilise', 'utilisez', 'active', 'banc', 'poste', 'energie', 'énergie',
  'incolore', 'plante', 'feu', 'eau', 'electrik', 'combat', 'obscurite', 'obscurité', 'metal', 'métal',
  'psy', 'dragon', 'illus', 'illustrateur', 'copyright', 'edition', 'édition'
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
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèêëàâäôöûüçîï/\'-. ',
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

    // 3. Scan Full Card Canvas for Attacks & Character context
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
   * Advanced Multi-Token & Pattern Parser
   */
  parseCardData(topText, bottomText, fullText) {
    const combined = `${topText}\n${bottomText}\n${fullText}`;

    // 1. Extract all number sequences (e.g. 053/217, 108/217, 201, 110, 60, etc.)
    const numbers = new Set();
    let localIdCandidate = '';
    let totalInSetCandidate = '';

    // Normalize fraction formats
    const normalizedText = combined
      .replace(/([0-9])\s*[Il|]\s*([0-9])/g, '$1/$2')
      .replace(/([0-9])\s*(\/)\s*([0-9])/g, '$1/$3');

    // Find fraction: XXX/YYY (e.g. 053/217, 030/217, 018/217, 093/217, 201/217)
    const fracMatches = [...normalizedText.matchAll(/(\d{1,3})\s*\/\s*(\d{2,3})/g)];
    if (fracMatches.length > 0) {
      localIdCandidate = fracMatches[0][1];
      totalInSetCandidate = fracMatches[0][2];
      numbers.add(localIdCandidate);
      numbers.add(totalInSetCandidate);
    }

    // Collect all standalone numbers of 2-3 digits
    const rawNumMatches = normalizedText.match(/\b\d{1,3}\b/g) || [];
    for (const num of rawNumMatches) {
      numbers.add(num);
    }

    // 2. Extract Set Code (ASC, MEE, ME02.5, SVP, OBF, SSP, TWM, PAL, SVI, etc.)
    let setCodeCandidate = '';
    const setMatch = normalizedText.match(/\b(ASC|MEE|ME02\.5|ME|SVP|OBF|SSP|TWM|PAL|SVI|PAR|TEF|SCR|PRE|MEW|LOR|ASR|BRS|FST|EVS|CRE|BST|VIV|DAA|SSH)\b/i);
    if (setMatch) {
      setCodeCandidate = setMatch[1].toUpperCase();
    }

    // 3. Extract Clean Candidate Word Tokens
    const allWords = combined.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
    const candidateWords = [];
    const seenWords = new Set();

    for (const word of allWords) {
      const lower = word.toLowerCase();
      if (!POKEMON_STOP_WORDS.has(lower) && !seenWords.has(lower)) {
        seenWords.add(lower);
        candidateWords.push(cleanWord(word));
      }
    }

    // 4. Primary Name Extraction from Top Header
    const topClean = topText.replace(/\r\n/g, '\n').trim();
    const topLines = topClean.split('\n').map(l => l.trim()).filter(Boolean);
    let primaryName = '';

    for (const line of topLines) {
      let candidate = line;
      if (/^(BASE|NIVEAU|STAGE|NIV|Évolution|Evolution)/i.test(candidate)) continue;
      candidate = candidate.replace(/(?:PV|pv|HP|hp|P\/?V)\s*\d+/gi, '');
      candidate = candidate.replace(/[0-9]/g, '');
      candidate = candidate.replace(/[^\w\s\séèêëàâäôöûüçîï'-]/gi, ' ').trim();
      if (candidate.length >= 2) {
        primaryName = candidate;
        break;
      }
    }

    if (!primaryName && candidateWords.length > 0) {
      primaryName = candidateWords[0];
    }

    return {
      primaryName: cleanWord(primaryName),
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
  let clean = str.replace(/[^\w\s\séèêëàâäôöûüçîï'-]/gi, ' ').trim();
  
  // Specific common Pokémon typo fixes
  const TYPO_MAP = {
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
    if (lower.includes(typo)) {
      clean = clean.replace(new RegExp(typo, 'gi'), fix);
    }
  }

  return clean;
}

export const ocrService = new OcrService();
