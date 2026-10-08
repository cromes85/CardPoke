import { createWorker } from 'tesseract.js';
import ALL_POKEMON_NAMES from './pokemonNamesAll.json';

let cachedWorker = null;
let isInitializing = false;
let initPromise = null;

/**
 * Calcul de distance de Levenshtein pour correspondance floue tolérante aux fautes OCR
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Recherche intelligente et floue du meilleur nom de Pokémon (FR + EN)
 */
export function findBestPokemonMatch(rawText) {
  if (!rawText) return '';

  const clean = rawText
    .replace(/\b(?:BASE|NIVEAU\s*[12]|STAGE\s*[12]|ÉVOLUTION|EVOLUTION|PV|HP|\d+)\b/gi, ' ')
    .replace(/[^a-zA-Zàâéèêëîïôùûüç\s-]/g, ' ')
    .trim();

  const stopWords = new Set(['type', 'typ', 'weds', 'get', 'une', 'unes', 'acte', 'pour', 'les', 'des', 'une', 'qui']);
  const tokens = clean.split(/\s+/).filter(t => t.length >= 3 && !stopWords.has(t.toLowerCase()));

  // 1. Concordance exacte de token
  for (const t of tokens) {
    const exact = ALL_POKEMON_NAMES.find(n => n.toLowerCase() === t.toLowerCase());
    if (exact) return exact;
  }

  // 2. Recherche par sous-chaîne
  for (const n of ALL_POKEMON_NAMES) {
    if (n.length >= 4 && clean.toLowerCase().includes(n.toLowerCase())) {
      return n;
    }
  }

  // 3. Correspondance floue par distance de Levenshtein
  let bestMatch = null;
  let minDistance = 999;

  for (const t of tokens) {
    if (t.length < 3) continue;
    for (const n of ALL_POKEMON_NAMES) {
      if (Math.abs(t.length - n.length) > 2) continue;
      const dist = levenshteinDistance(t, n);
      const ratio = dist / Math.max(t.length, n.length);
      if (ratio <= 0.35 && dist < minDistance) {
        minDistance = dist;
        bestMatch = n;
      }
    }
  }

  return bestMatch || (tokens.length > 0 ? tokens[0] : '');
}

/**
 * Initialise le worker Tesseract
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
        tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèêëàùûüâôîïç.-PVHP',
        tessedit_pageseg_mode: '6'
      });
      cachedWorker = worker;
      return worker;
    } catch (err) {
      console.error('Erreur worker Tesseract (fallback eng):', err);
      try {
        const workerEng = await createWorker('eng');
        await workerEng.setParameters({
          tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-PVHP',
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
 * Prétraitement d'image doux pour Tesseract (Grayscale naturel + expansion de dynamique sans speckles)
 */
function preprocessCanvasForOCR(sourceCanvas, isDarkCard = false, enhanceEdges = false) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Calcul histogramme luminance
  const hist = new Int32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
  }

  const total = w * h;
  let minLum = 0;
  let count = 0;
  for (let i = 0; i < 256; i++) {
    count += hist[i];
    if (count >= total * 0.02) {
      minLum = i;
      break;
    }
  }

  let maxLum = 255;
  count = 0;
  for (let i = 255; i >= 0; i--) {
    count += hist[i];
    if (count >= total * 0.02) {
      maxLum = i;
      break;
    }
  }

  const range = maxLum - minLum || 1;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let norm = (lum - minLum) / range;
    norm = Math.max(0, Math.min(1, norm));
    let val = norm * 255;

    if (isDarkCard) {
      val = 255 - val;
    }

    if (enhanceEdges) {
      // Contraste doux sans écrasement
      val = (val - 128) * 1.35 + 128;
      val = Math.min(255, Math.max(0, Math.round(val)));
    }

    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

/**
 * Découpe les zones spécialisées d'intérêt de la carte
 */
export function extractCardZones(cardCanvas) {
  if (!cardCanvas) return null;

  const cw = cardCanvas.width;
  const ch = cardCanvas.height;

  // 1. Zone Titre/Nom : X: 7% à 72%, Y: 1.2% à 9.0%
  const nX = Math.round(cw * 0.07);
  const nY = Math.round(ch * 0.012);
  const nW = Math.round(cw * 0.65);
  const nH = Math.round(ch * 0.078);

  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = nW * 2;
  nameCanvas.height = nH * 2;
  const nCtx = nameCanvas.getContext('2d');
  nCtx.imageSmoothingEnabled = true;
  nCtx.drawImage(cardCanvas, nX, nY, nW, nH, 0, 0, nW * 2, nH * 2);

  // 2. Zone PV : X: 64% à 97%, Y: 1.2% à 9.0%
  const hpX = Math.round(cw * 0.64);
  const hpW = Math.round(cw * 0.33);

  const hpCanvas = document.createElement('canvas');
  hpCanvas.width = hpW * 2;
  hpCanvas.height = nH * 2;
  const hpCtx = hpCanvas.getContext('2d');
  hpCtx.imageSmoothingEnabled = true;
  hpCtx.drawImage(cardCanvas, hpX, nY, hpW, nH, 0, 0, hpW * 2, nH * 2);

  // 3. Zone Corps / Attaques : X: 4% à 96%, Y: 46% à 88%
  const bX = Math.round(cw * 0.04);
  const bY = Math.round(ch * 0.460);
  const bW = Math.round(cw * 0.92);
  const bH = Math.round(ch * 0.420);

  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.width = bW * 2;
  bodyCanvas.height = bH * 2;
  const bCtx = bodyCanvas.getContext('2d');
  bCtx.imageSmoothingEnabled = true;
  bCtx.drawImage(cardCanvas, bX, bY, bW, bH, 0, 0, bW * 2, bH * 2);

  // 4. Zone Bas de Carte Complète : X: 2.5% à 97%, Y: 88% à 99%
  const fX = Math.round(cw * 0.025);
  const fY = Math.round(ch * 0.880);
  const fW = Math.round(cw * 0.95);
  const fH = Math.round(ch * 0.110);

  const footerCanvas = document.createElement('canvas');
  footerCanvas.width = fW * 3;
  footerCanvas.height = fH * 3;
  const fCtx = footerCanvas.getContext('2d');
  fCtx.imageSmoothingEnabled = true;
  fCtx.drawImage(cardCanvas, fX, fY, fW, fH, 0, 0, fW * 3, fH * 3);

  // 5. Zone Spécifique Bas-Gauche Haute Résolution (x4)
  const fLeftW = Math.round(cw * 0.50);
  const footerLeftCanvas = document.createElement('canvas');
  footerLeftCanvas.width = fLeftW * 4;
  footerLeftCanvas.height = fH * 4;
  const fLCtx = footerLeftCanvas.getContext('2d');
  fLCtx.imageSmoothingEnabled = true;
  fLCtx.drawImage(cardCanvas, fX, fY, fLeftW, fH, 0, 0, fLeftW * 4, fH * 4);

  // Détection de polarité sombre / claire
  const nData = nCtx.getImageData(0, 0, nameCanvas.width, nameCanvas.height).data;
  let totalLum = 0;
  for (let i = 0; i < nData.length; i += 4) {
    totalLum += 0.299 * nData[i] + 0.587 * nData[i + 1] + 0.114 * nData[i + 2];
  }
  const isDarkCard = (totalLum / (nameCanvas.width * nameCanvas.height)) < 115;

  return {
    nameCanvas,
    hpCanvas,
    bodyCanvas,
    footerCanvas,
    footerLeftCanvas,
    cleanedName: preprocessCanvasForOCR(nameCanvas, isDarkCard),
    cleanedHP: preprocessCanvasForOCR(hpCanvas, isDarkCard),
    cleanedBody: preprocessCanvasForOCR(bodyCanvas, isDarkCard),
    cleanedFooter: preprocessCanvasForOCR(footerCanvas, isDarkCard, true),
    cleanedFooterLeft: preprocessCanvasForOCR(footerLeftCanvas, isDarkCard, true),
    headerPreview: nameCanvas.toDataURL('image/jpeg', 0.92),
    footerPreview: footerLeftCanvas.toDataURL('image/jpeg', 0.92),
    isDarkCard
  };
}

/**
 * Nettoie et extrait un numéro de carte Pokémon officiel (ex: 123/217, 009/217, 096/182)
 */
function parsePokemonCardNumber(text) {
  if (!text) return '';

  const cleaned = text
    .replace(/[—–_]/g, '/')
    .replace(/[|]/g, '1')
    .replace(/\\/g, '/')
    .replace(/\s*[/]\s*/g, '/')
    .replace(/([0-9])\s+([0-9])/g, '$1$2');

  const numMatch = cleaned.match(/\b([0-9]{1,3})\s*[\/]\s*([0-9]{1,3})\b/);
  if (numMatch) {
    return `${numMatch[1]}/${numMatch[2]}`;
  }

  const promoMatch = cleaned.match(/([A-Z]{1,3}\s*[0-9]{1,3})\s*[\/]\s*([A-Z]{0,3}\s*[0-9]{1,3})/i);
  if (promoMatch) {
    return `${promoMatch[1].replace(/\s/g, '')}/${promoMatch[2].replace(/\s/g, '')}`;
  }

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

    // 1. Lecture OCR de la Zone Nom
    try {
      const nameDataUrl = zones.cleanedName.toDataURL('image/png');
      const nameRes = await worker.recognize(nameDataUrl);
      const rawNameText = nameRes.data?.text || '';
      extractedName = findBestPokemonMatch(rawNameText);
    } catch (nErr) {
      console.warn('Erreur OCR nom:', nErr);
    }

    // 2. Lecture OCR de la Zone PV
    try {
      const hpDataUrl = zones.cleanedHP.toDataURL('image/png');
      const hpRes = await worker.recognize(hpDataUrl);
      const hpText = hpRes.data?.text || '';
      const hpMatch = hpText.match(/(?:PV|HP)?\s*([0-9]{2,3})\s*(?:PV|HP)?/i) || hpText.match(/([0-9]{2,3})/);
      if (hpMatch) {
        const val = parseInt(hpMatch[1], 10);
        if (val >= 30 && val <= 340) {
          extractedHP = `${val} PV`;
        }
      }
    } catch (hpErr) {
      console.warn('Erreur OCR PV:', hpErr);
    }

    // 3. Lecture OCR de la Zone Attaques & Corps
    try {
      const bodyDataUrl = zones.cleanedBody.toDataURL('image/png');
      const bodyRes = await worker.recognize(bodyDataUrl);
      extractedBody = bodyRes.data?.text || '';
    } catch (bErr) {
      console.warn('Erreur OCR attaques:', bErr);
    }

    // 4. Lecture OCR du Bas de Carte (Numéro) - Passe 1 Bas-Gauche HD (x4)
    try {
      const footerLeftDataUrl = zones.cleanedFooterLeft.toDataURL('image/png');
      const footerLeftRes = await worker.recognize(footerLeftDataUrl);
      const footerLeftText = footerLeftRes.data?.text || '';
      extractedNumber = parsePokemonCardNumber(footerLeftText);

      // Passe 2 si non trouvé : Bas complet
      if (!extractedNumber) {
        const footerDataUrl = zones.cleanedFooter.toDataURL('image/png');
        const footerRes = await worker.recognize(footerDataUrl);
        const footerText = footerRes.data?.text || '';
        extractedNumber = parsePokemonCardNumber(footerText);
      }
    } catch (fErr) {
      console.warn('Erreur OCR numéro:', fErr);
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



