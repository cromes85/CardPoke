import { createWorker } from 'tesseract.js';

let cachedWorker = null;
let isInitializing = false;
let initPromise = null;

/**
 * Initialise ou récupère le worker Tesseract OCR optimisé
 */
async function getOCRWorker() {
  if (cachedWorker) return cachedWorker;

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    try {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-[]',
        tessedit_pageseg_mode: '6' // PSM 6: Assume a single uniform block of text
      });
      cachedWorker = worker;
      return worker;
    } catch (err) {
      console.error('Erreur initialisation worker Tesseract:', err);
      return null;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * Découpe la zone du bas contenant le numéro de carte et crée des variantes de contraste
 */
export function extractFooterRegions(cardCanvas) {
  if (!cardCanvas) return null;

  const cw = cardCanvas.width;
  const ch = cardCanvas.height;

  // Zone bas gauche (Cartes modernes SV, SWSH, SM) : X: 3% à 56%, Y: 92% à 99%
  const cropX = Math.round(cw * 0.03);
  const cropY = Math.round(ch * 0.920);
  const cropW = Math.round(cw * 0.53);
  const cropH = Math.round(ch * 0.065);

  const scale = 3;
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW * scale;
  cropCanvas.height = cropH * scale;
  const ctx = cropCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cardCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW * scale, cropH * scale);

  // Variante 1 : Inversion et Contraste Élevé (Texte blanc sur fond sombre -> Noir sur Blanc)
  const invCanvas = document.createElement('canvas');
  invCanvas.width = cropW * scale;
  invCanvas.height = cropH * scale;
  const invCtx = invCanvas.getContext('2d');
  invCtx.drawImage(cropCanvas, 0, 0);
  const imgData = invCtx.getImageData(0, 0, cropW * scale, cropH * scale);
  const data = imgData.data;

  let minLum = 255, maxLum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = maxLum - minLum || 1;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const norm = (lum - minLum) / range;
    // Binarisation nette
    const val = norm > 0.42 ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
  invCtx.putImageData(imgData, 0, 0);

  return {
    rawCropCanvas: cropCanvas,
    invCropCanvas: invCanvas,
    previewDataUrl: cropCanvas.toDataURL('image/jpeg', 0.90)
  };
}

/**
 * Nettoie et extrait le pattern XXX/YYY du texte brut OCR
 */
export function parseCardNumber(rawText) {
  if (!rawText) return null;

  // 1. Nettoyage des erreurs typiques OCR (séparateurs, caractères confondus)
  let cleaned = rawText
    .replace(/[—–_]/g, '/')
    .replace(/[|]/g, '1')
    .replace(/\s*[/]\s*/g, '/');

  // 2. Recherche standard XXX/YYY (ex: 123/217, 025/198, 12/102)
  const numMatch = cleaned.match(/\b([0-9]{1,3})\s*[\/]\s*([0-9]{1,3})\b/);
  if (numMatch) {
    return `${numMatch[1]}/${numMatch[2]}`;
  }

  // 3. Trainer Gallery & Cartes Spéciales (ex: TG01/TG30, GG12/GG70, SV01/SV08)
  const specialMatch = cleaned.match(/\b([A-Z]{1,3}\s*[0-9]{1,3})\s*[\/]\s*([A-Z]{1,3}\s*[0-9]{1,3})\b/i);
  if (specialMatch) {
    return `${specialMatch[1].replace(/\s+/g, '')}/${specialMatch[2].replace(/\s+/g, '')}`;
  }

  // 4. Cartes Promo (ex: SVP 025, SWSH 100)
  const promoMatch = cleaned.match(/\b(SVP|SWSH|SM|XY|BW|DP)\s*([0-9]{1,3})\b/i);
  if (promoMatch) {
    return `${promoMatch[1].toUpperCase()} ${promoMatch[2]}`;
  }

  // 5. Recherche large avec tolérance
  const broadMatch = cleaned.match(/([0-9]{1,3})\s*[\/\\]\s*([0-9]{1,3})/);
  if (broadMatch) {
    return `${broadMatch[1]}/${broadMatch[2]}`;
  }

  return null;
}

/**
 * Lit automatiquement le numéro de carte depuis un canvas de carte redressée
 */
export async function extractCardNumber(cardCanvas) {
  if (!cardCanvas) return { number: null, footerCropUrl: null, rawText: '' };

  const regions = extractFooterRegions(cardCanvas);
  if (!regions) return { number: null, footerCropUrl: null, rawText: '' };

  try {
    const worker = await getOCRWorker();
    if (!worker) {
      return {
        number: null,
        footerCropUrl: regions.previewDataUrl,
        rawText: 'Erreur worker'
      };
    }

    // Essai 1 : Sur le canvas binarisé inversé (très efficace pour texte blanc sur fond noir)
    let ret = await worker.recognize(regions.invCropCanvas);
    let detectedNumber = parseCardNumber(ret.data?.text);

    // Essai 2 : Repli sur le crop haute résolution brut si le premier échoue
    if (!detectedNumber) {
      ret = await worker.recognize(regions.rawCropCanvas);
      detectedNumber = parseCardNumber(ret.data?.text);
    }

    return {
      number: detectedNumber,
      footerCropUrl: regions.previewDataUrl,
      rawText: ret.data?.text || '',
      confidence: ret.data?.confidence || 0
    };
  } catch (err) {
    console.error('Erreur OCR Numéro de Carte:', err);
    return {
      number: null,
      footerCropUrl: regions.previewDataUrl,
      rawText: err.message
    };
  }
}
