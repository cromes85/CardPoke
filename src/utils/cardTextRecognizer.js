import { createWorker } from 'tesseract.js';
import POKEMON_NAMES_FR from './pokemonNamesFr.json';

let cachedWorker = null;
let isInitializing = false;
let initPromise = null;

/**
 * Initialise le worker Tesseract avec gestion d'erreurs et fallback
 */
async function getOCRWorker() {
  if (cachedWorker) return cachedWorker;

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  initPromise = (async () => {
    try {
      const worker = await createWorker('fra+eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèêëàùûüâôîïç.-PV',
        tessedit_pageseg_mode: '6'
      });
      cachedWorker = worker;
      return worker;
    } catch (err) {
      console.error('Erreur worker Tesseract (fallback eng):', err);
      try {
        const workerEng = await createWorker('eng');
        await workerEng.setParameters({
          tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-PV',
          tessedit_pageseg_mode: '6'
        });
        cachedWorker = workerEng;
        return workerEng;
      } catch (err2) {
        console.error('Échec complet initialisation Tesseract:', err2);
        return null;
      }
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * Prétraite un canvas avec contraste dynamique, rehaussement des bords et binarisation
 */
function preprocessCanvasForOCR(sourceCanvas, isDarkCard = false, highSharpen = false) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
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
    let norm = (lum - minLum) / range;
    let val = norm * 255;
    if (isDarkCard) {
      val = 255 - val; // Inversion texte blanc sur fond noir -> texte noir sur fond blanc
    }
    // Rehaussement de contraste fort pour le texte
    val = (val - 128) * (highSharpen ? 2.2 : 1.7) + 128;
    val = Math.min(255, Math.max(0, Math.round(val)));
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

/**
 * Découpe les zones d'intérêt de la carte : En-tête, Attaques et Bas de carte
 */
export function extractCardZones(cardCanvas) {
  if (!cardCanvas) return null;

  const cw = cardCanvas.width;
  const ch = cardCanvas.height;

  // 1. Zone En-Tête (Nom + PV) : X: 3% à 96%, Y: 1.8% à 9.0%
  const hX = Math.round(cw * 0.03);
  const hY = Math.round(ch * 0.018);
  const hW = Math.round(cw * 0.93);
  const hH = Math.round(ch * 0.072);

  const headerCanvas = document.createElement('canvas');
  headerCanvas.width = hW * 2;
  headerCanvas.height = hH * 2;
  const hCtx = headerCanvas.getContext('2d');
  hCtx.imageSmoothingEnabled = true;
  hCtx.drawImage(cardCanvas, hX, hY, hW, hH, 0, 0, hW * 2, hH * 2);

  // 2. Zone Corps / Attaques : X: 5% à 95%, Y: 50% à 88%
  const bX = Math.round(cw * 0.05);
  const bY = Math.round(ch * 0.500);
  const bW = Math.round(cw * 0.90);
  const bH = Math.round(ch * 0.380);

  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.width = bW * 2;
  bodyCanvas.height = bH * 2;
  const bCtx = bodyCanvas.getContext('2d');
  bCtx.imageSmoothingEnabled = true;
  bCtx.drawImage(cardCanvas, bX, bY, bW, bH, 0, 0, bW * 2, bH * 2);

  // 3. Zone Bas de Carte Complète (Numéro gauche ou droite) : X: 2.5% à 97%, Y: 89.5% à 98.8%
  const fX = Math.round(cw * 0.025);
  const fY = Math.round(ch * 0.895);
  const fW = Math.round(cw * 0.95);
  const fH = Math.round(ch * 0.093);

  const footerCanvas = document.createElement('canvas');
  footerCanvas.width = fW * 3;
  footerCanvas.height = fH * 3;
  const fCtx = footerCanvas.getContext('2d');
  fCtx.imageSmoothingEnabled = true;
  fCtx.drawImage(cardCanvas, fX, fY, fW, fH, 0, 0, fW * 3, fH * 3);

  // 4. Zone Spécifique Bas-Gauche (Numéro SV / Epée & Bouclier) : X: 2.5% à 50%
  const fLeftW = Math.round(cw * 0.48);
  const footerLeftCanvas = document.createElement('canvas');
  footerLeftCanvas.width = fLeftW * 4;
  footerLeftCanvas.height = fH * 4;
  const fLCtx = footerLeftCanvas.getContext('2d');
  fLCtx.imageSmoothingEnabled = true;
  fLCtx.drawImage(cardCanvas, fX, fY, fLeftW, fH, 0, 0, fLeftW * 4, fH * 4);

  // Détection de polarité sombre / claire
  const hData = hCtx.getImageData(0, 0, headerCanvas.width, headerCanvas.height).data;
  let totalLum = 0;
  for (let i = 0; i < hData.length; i += 4) {
    totalLum += 0.299 * hData[i] + 0.587 * hData[i + 1] + 0.114 * hData[i + 2];
  }
  const isDarkCard = (totalLum / (headerCanvas.width * headerCanvas.height)) < 115;

  return {
    headerCanvas,
    bodyCanvas,
    footerCanvas,
    footerLeftCanvas,
    cleanedHeader: preprocessCanvasForOCR(headerCanvas, isDarkCard),
    cleanedBody: preprocessCanvasForOCR(bodyCanvas, isDarkCard),
    cleanedFooter: preprocessCanvasForOCR(footerCanvas, isDarkCard, true),
    cleanedFooterLeft: preprocessCanvasForOCR(footerLeftCanvas, isDarkCard, true),
    headerPreview: headerCanvas.toDataURL('image/jpeg', 0.90),
    footerPreview: footerLeftCanvas.toDataURL('image/jpeg', 0.92),
    isDarkCard
  };
}

/**
 * Nettoie et extrait le nom canonique du Pokémon à partir de la lecture OCR
 */
export function cleanPokemonName(raw) {
  if (!raw) return '';
  let cleaned = raw
    .replace(/\b(?:BASE|NIVEAU\s*[12]|STAGE\s*[12]|ÉVOLUTION|EVOLUTION|PV|HP|\d+)\b/gi, ' ')
    .replace(/[^a-zA-Zàâéèêëîïôùûüç\s-]/g, ' ')
    .trim();

  const words = cleaned.split(/\s+/).filter(w => w.length >= 3);
  for (const w of words) {
    const exact = POKEMON_NAMES_FR.find(n => n.toLowerCase() === w.toLowerCase());
    if (exact) return exact;
  }

  for (const n of POKEMON_NAMES_FR) {
    if (n.length >= 4 && cleaned.toLowerCase().includes(n.toLowerCase())) {
      return n;
    }
  }

  return words.sort((a, b) => b.length - a.length)[0] || cleaned;
}

/**
 * Nettoie et extrait un numéro de carte Pokémon officiel (ex: 123/217, 009/217)
 */
function parsePokemonCardNumber(text) {
  if (!text) return '';

  let cleaned = text
    .replace(/[—–_]/g, '/')
    .replace(/[|]/g, '1')
    .replace(/\\/g, '/')
    .replace(/\s*[/]\s*/g, '/')
    .replace(/([0-9])\s+([0-9])/g, '$1$2');

  // Regex 1: Format direct XXX/YYY (ex: 123/217, 009/217, 54/94)
  const numMatch = cleaned.match(/\b([0-9]{1,3})\s*[\/]\s*([0-9]{1,3})\b/);
  if (numMatch) {
    return `${numMatch[1]}/${numMatch[2]}`;
  }

  // Regex 2: Format avec lettres de set (ex: TG01/TG30, GG05/GG70, SV05 123/217)
  const promoMatch = cleaned.match(/([A-Z]{1,3}\s*[0-9]{1,3})\s*[\/]\s*([A-Z]{0,3}\s*[0-9]{1,3})/i);
  if (promoMatch) {
    return `${promoMatch[1].replace(/\s/g, '')}/${promoMatch[2].replace(/\s/g, '')}`;
  }

  // Regex 3: Format flexible avec séparateurs bruités
  const flexMatch = cleaned.match(/([0-9]{1,3})\s*[\/\-]\s*([0-9]{2,3})/);
  if (flexMatch) {
    return `${flexMatch[1]}/${flexMatch[2]}`;
  }

  return '';
}

/**
 * Analyse & Extrait les informations de la carte (Nom, PV, Attaques, Numéro)
 */
export async function recognizeCardInfo(cardCanvas) {
  if (!cardCanvas) {
    return { name: '', hp: '', number: '', bodyText: '', headerPreview: null, footerPreview: null };
  }

  const zones = extractCardZones(cardCanvas);
  if (!zones) {
    return { name: '', hp: '', number: '', bodyText: '', headerPreview: null, footerPreview: null };
  }

  let extractedName = '';
  let extractedHP = '';
  let extractedNumber = '';
  let extractedBody = '';

  try {
    const worker = await getOCRWorker();
    if (!worker) {
      return {
        name: '',
        hp: '',
        number: '',
        bodyText: '',
        headerPreview: zones.headerPreview,
        footerPreview: zones.footerPreview
      };
    }

    // 1. Lecture OCR de l'En-tête (Nom + PV)
    const headerDataUrl = zones.cleanedHeader.toDataURL('image/png');
    const headerRes = await worker.recognize(headerDataUrl);
    const headerText = headerRes.data?.text || '';

    // Extraction PV (ex: PV 100, 70, 60 PV, 120 HP)
    const hpMatch = headerText.match(/(?:PV|HP)?\s*([0-9]{2,3})\s*(?:PV|HP)?/i);
    if (hpMatch) {
      const hpVal = parseInt(hpMatch[1], 10);
      if (hpVal >= 30 && hpVal <= 340) {
        extractedHP = `${hpVal} PV`;
      }
    }

    // Extraction Nom avec nettoyage Pokédex
    extractedName = cleanPokemonName(headerText);

    // 2. Lecture OCR du Corps / Attaques
    try {
      const bodyDataUrl = zones.cleanedBody.toDataURL('image/png');
      const bodyRes = await worker.recognize(bodyDataUrl);
      extractedBody = bodyRes.data?.text || '';
    } catch (bErr) {
      console.warn('Erreur lecture zone attaques:', bErr);
    }

    // 3. Lecture OCR du Bas de Carte - Passe 1 : Zone Bas-Gauche Haute Définition (4x)
    const footerLeftDataUrl = zones.cleanedFooterLeft.toDataURL('image/png');
    const footerLeftRes = await worker.recognize(footerLeftDataUrl);
    const footerLeftText = footerLeftRes.data?.text || '';
    extractedNumber = parsePokemonCardNumber(footerLeftText);

    // 4. Passe 2 si non trouvé : Zone Bas Complète
    if (!extractedNumber) {
      const footerDataUrl = zones.cleanedFooter.toDataURL('image/png');
      const footerRes = await worker.recognize(footerDataUrl);
      const footerText = footerRes.data?.text || '';
      extractedNumber = parsePokemonCardNumber(footerText);
    }

  } catch (err) {
    console.error('Erreur lecture OCR carte:', err);
  }

  return {
    name: extractedName,
    hp: extractedHP,
    number: extractedNumber,
    bodyText: extractedBody,
    headerPreview: zones.headerPreview,
    footerPreview: zones.footerPreview
  };
}


