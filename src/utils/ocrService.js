import { createWorker } from 'tesseract.js';
import { extractAndPreprocessRoi } from './cardDetection';

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
   * Multi-pass OCR Scan on card canvas
   */
  async scanCard(cardCanvas, onProgress = () => {}) {
    window.__onOcrProgress = onProgress;
    const worker = await this.getWorker();

    // 1. Scan Top Header (Name + HP)
    onProgress(0.15);
    const topRoi = extractAndPreprocessRoi(cardCanvas, 'top_name');
    const topResult = await worker.recognize(topRoi);
    const topText = topResult.data.text || '';

    // 2. Scan Bottom Footer (Card Number, Set code, total)
    onProgress(0.50);
    const bottomRoi = extractAndPreprocessRoi(cardCanvas, 'bottom_number');
    const bottomResult = await worker.recognize(bottomRoi);
    const bottomText = bottomResult.data.text || '';

    // 3. Scan Inverted Bottom Footer for dark/foil cards
    onProgress(0.75);
    const bottomInverted = invertCanvas(bottomRoi);
    const bottomResultInv = await worker.recognize(bottomInverted);
    const bottomTextInv = bottomResultInv.data.text || '';

    const combinedBottom = `${bottomText}\n${bottomTextInv}`;

    onProgress(0.90);
    const parsed = this.parseCardData(topText, combinedBottom);
    onProgress(1.0);

    return {
      rawTopText: topText,
      rawBottomText: combinedBottom,
      ...parsed
    };
  }

  /**
   * Smart Parser for Pokémon Card OCR Text
   */
  parseCardData(topText, bottomText) {
    let name = '';
    let localId = '';
    let totalInSet = '';
    let setCode = '';
    let hp = '';

    // --- 1. Parse Top (Name & HP) ---
    const topClean = topText.replace(/\r\n/g, '\n').trim();
    const topLines = topClean.split('\n').map(l => l.trim()).filter(Boolean);

    // HP Match (e.g. PV 110, PV 60, HP 140, PV140)
    const hpMatch = topClean.match(/(?:PV|pv|HP|hp|Pv|Hv|P\/?V)\s*[:.]?\s*(\d{2,3})/i);
    if (hpMatch) {
      hp = hpMatch[1];
    }

    // Extract Name candidate
    for (const line of topLines) {
      let candidate = line;
      // Skip evolution / stage lines
      if (/^(BASE|NIVEAU|STAGE|NIV|Évolution|Evolution)/i.test(candidate)) {
        continue;
      }
      
      // Clean noise
      candidate = candidate.replace(/(?:PV|pv|HP|hp|P\/?V)\s*\d+/gi, '');
      candidate = candidate.replace(/[0-9]/g, '');
      candidate = candidate.replace(/[^\w\s\séèêëàâäôöûüçîï'-]/gi, ' ').trim();

      if (candidate.length >= 2) {
        name = candidate;
        break;
      }
    }

    // If first loop didn't find, fallback to first non-empty line
    if (!name && topLines.length > 0) {
      name = topLines[0].replace(/[^\w\s\séèêëàâäôöûüçîï'-]/gi, ' ').trim();
    }

    // --- 2. Parse Bottom (Card Number XXX/YYY & Set Code) ---
    const bottomClean = bottomText.replace(/\r\n/g, ' ').replace(/\s+/g, ' ');

    // Normalize OCR number artifacts: 'O' -> '0', 'l'/'I'/'|' -> '/'
    const normalized = bottomClean
      .replace(/([0-9])\s*[Il|]\s*([0-9])/g, '$1/$2')
      .replace(/([0-9])\s*(\/)\s*([0-9])/g, '$1/$3');

    // Fraction Match: XXX/YYY (e.g. 053/217, 108/217, 201/217, 030/217, 018/217)
    const fracMatch = normalized.match(/(\d{1,3})\s*\/\s*(\d{2,3})/);
    if (fracMatch) {
      localId = fracMatch[1];
      totalInSet = fracMatch[2];
    } else {
      // Look for standalone numbers like "008", "053", "108"
      const numMatch = normalized.match(/\b(\d{2,3})\b/);
      if (numMatch) {
        localId = numMatch[1];
      }
    }

    // Set code pattern (ASC, MEE, ME02.5, SVP, OBF, SSP, TWM, PAL, SVI, etc.)
    const setMatch = normalized.match(/\b(ASC|MEE|ME|SVP|OBF|SSP|TWM|PAL|SVI|PAR|TEF|SCR|PRE|MEW|LOR|ASR|BRS|FST|EVS|CRE|BST|VIV|DAA|SSH)\b/i);
    if (setMatch) {
      setCode = setMatch[1].toUpperCase();
    }

    return {
      name: cleanPokemonName(name),
      localId: localId.trim(),
      totalInSet: totalInSet.trim(),
      setCode,
      hp
    };
  }
}

// Invert canvas colors for dual-pass OCR
function invertCanvas(srcCanvas) {
  const canvas = document.createElement('canvas');
  canvas.width = srcCanvas.width;
  canvas.height = srcCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// Clean and normalize recognized Pokémon names
function cleanPokemonName(rawName) {
  if (!rawName) return '';
  let clean = rawName
    .replace(/\s+/g, ' ')
    .replace(/^(Base|Niveau|Stage)\s*\d*/i, '')
    .trim();

  // Dictionary of frequent Pokémon corrections
  const CORRECTIONS = {
    'croudon': 'Groudon',
    'groudan': 'Groudon',
    'beldeneiqe': 'Beldeneige',
    'beideneige': 'Beldeneige',
    'grotichan': 'Grotichon',
    'tissenbouie': 'Tissenboule',
    'sorboul': 'Sorboul',
    'sucroguin': 'Sucroquin',
    'fantominus': 'Fantominus',
    'fantomlnus': 'Fantominus'
  };

  const lower = clean.toLowerCase();
  for (const [typo, fixed] of Object.entries(CORRECTIONS)) {
    if (lower.includes(typo)) {
      clean = clean.replace(new RegExp(typo, 'gi'), fixed);
    }
  }

  return clean;
}

export const ocrService = new OcrService();
