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
            // progress updates
            if (m.status === 'recognizing text' && window.__onOcrProgress) {
              window.__onOcrProgress(m.progress);
            }
          }
        });
        
        // Optimize whitelist and parameters
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
   * Scan card canvas and extract Name, Card Number, and Set code
   */
  async scanCard(cardCanvas, onProgress = () => {}) {
    window.__onOcrProgress = onProgress;
    const worker = await this.getWorker();

    // 1. Extract Top ROI (Name & HP)
    onProgress(0.15);
    const topRoi = extractAndPreprocessRoi(cardCanvas, 'top_name');
    const topResult = await worker.recognize(topRoi);
    const topText = topResult.data.text;

    // 2. Extract Bottom ROI (Card Number & Set)
    onProgress(0.55);
    const bottomRoi = extractAndPreprocessRoi(cardCanvas, 'bottom_number');
    const bottomResult = await worker.recognize(bottomRoi);
    const bottomText = bottomResult.data.text;

    onProgress(0.85);

    // 3. Smart Parse Information
    const parsed = this.parseCardData(topText, bottomText);
    onProgress(1.0);

    return {
      rawTopText: topText,
      rawBottomText: bottomText,
      ...parsed
    };
  }

  /**
   * NLP & Pattern matching for Pokémon card text
   */
  parseCardData(topText, bottomText) {
    let name = '';
    let localId = '';
    let totalInSet = '';
    let setCode = '';
    let hp = '';

    // --- Parse Top Text (Name & HP) ---
    const topClean = topText.replace(/\r\n/g, '\n').trim();
    const topLines = topClean.split('\n').map(l => l.trim()).filter(Boolean);

    // Check for HP pattern (e.g. PV 110, PV 60, HP 140)
    const hpMatch = topClean.match(/(?:PV|pv|HP|hp|Pv|Hv)\s*[:.]?\s*(\d{2,3})/i);
    if (hpMatch) {
      hp = hpMatch[1];
    }

    // First line or line with largest capitalized word usually contains the name
    if (topLines.length > 0) {
      // Clean common prefixes like "NIVEAU 1", "BASE", "Évolution de..."
      let candidate = topLines[0];
      if (/^(BASE|NIVEAU|STAGE|NIV)/i.test(candidate) && topLines.length > 1) {
        candidate = topLines[1];
      }
      
      // Remove HP from name line if mixed in
      candidate = candidate.replace(/(?:PV|pv|HP|hp)\s*\d+/gi, '');
      candidate = candidate.replace(/[0-9]/g, ''); // remove stray numbers
      candidate = candidate.replace(/[^\w\s\séèêëàâäôöûüçîï'-]/gi, ' ').trim();

      // Special handling for trainer prefix (e.g. "Amos de la Team Rocket", "Sorboul de N")
      name = candidate.trim();
    }

    // --- Parse Bottom Text (Card Number e.g. 053/217, 108/217, MEE FR 008) ---
    const bottomClean = bottomText.replace(/\r\n/g, ' ').replace(/\s+/g, ' ');

    // Normalize common OCR confusions in numbers: 'O' -> '0', 'I' or 'l' or '|' -> '/'
    const normalizedBottom = bottomClean
      .replace(/([0-9])\s*[Il|]\s*([0-9])/g, '$1/$2')
      .replace(/([0-9])\s*([0-9]{3})/g, '$1/$2');

    // 1. Look for fractions: XXX/YYY (e.g., 053/217, 108/217, 201/217)
    const fractionMatch = normalizedBottom.match(/(\d{1,3})\s*\/\s*(\d{2,3})/);
    if (fractionMatch) {
      localId = fractionMatch[1].padStart(3, '0').replace(/^0+(\d+)/, '$1'); // e.g. 53 or 053
      // Check both with/without leading zero
      localId = fractionMatch[1];
      totalInSet = fractionMatch[2];
    } else {
      // 2. Look for standalone 3-digit number (e.g. 008, 053)
      const numberMatch = normalizedBottom.match(/\b(\d{3})\b/);
      if (numberMatch) {
        localId = numberMatch[1];
      }
    }

    // Check for Set Code (ASC, MEE, ME02.5, SVP, OBF, SSP, TWM, PAL, SVI, etc.)
    const setMatch = normalizedBottom.match(/\b(ASC|MEE|ME|SVP|OBF|SSP|TWM|PAL|SVI|PAR|TEF|SCR|PRE|MEW|LOR|ASR|BRS|FST|EVS|CRE|BST|VIV|DAA|SSH)\b/i);
    if (setMatch) {
      setCode = setMatch[1].toUpperCase();
    }

    return {
      name,
      localId,
      totalInSet,
      setCode,
      hp
    };
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export const ocrService = new OcrService();
