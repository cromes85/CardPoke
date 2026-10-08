import { createWorker } from 'tesseract.js';

let cachedWorker = null;
let isInitializing = false;
let initPromise = null;

// Dictionnaire des Pokémon populaires (Français) pour correspondance ultra-robuste
const POKEMON_NAMES_FR = [
  'Macronium', 'Germignon', 'Méganium', 'Fantominus', 'Spectrum', 'Ectoplasma',
  'Sucroquin', 'Cupcanaille', 'Pikachu', 'Raichu', 'Salamèche', 'Reptincel', 'Dracaufeu',
  'Bulbizarre', 'Herbizarre', 'Florizarre', 'Carapuce', 'Carabaffe', 'Tortank',
  'Évoli', 'Aquali', 'Voltali', 'Pyroli', 'Mentali', 'Noctali', 'Phyllali', 'Givrali', 'Nymphali',
  'Lucario', 'Riolu', 'Mewtwo', 'Mew', 'Draby', 'Drackhaus', 'Drattak', 'Griknot', 'Carmache', 'Carchacrok',
  'Rayquaza', 'Kyogre', 'Groudon', 'Dialga', 'Palkia', 'Giratina', 'Arceus', 'Zeraora', 'Zacian', 'Zamazenta',
  'Koraidon', 'Miraidon', 'Miascaron', 'Flâmigator', 'Palmaval', 'Dracaufeu-ex', 'Pikachu-ex'
];

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
        tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèêàùâôîïç.-PV',
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
 * Prétraite un canvas avec ajustement automatique du contraste et de la polarité
 */
function preprocessCanvasForOCR(sourceCanvas, isDarkCard = false) {
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
      val = 255 - val; // Inversion texte blanc -> noir
    }
    // Rehaussement de contraste
    val = (val - 128) * 1.6 + 128;
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
 * Découpe les différentes zones d'intérêt de la carte Pokémon (Nom, PV, Numéro)
 */
export function extractCardZones(cardCanvas) {
  if (!cardCanvas) return null;

  const cw = cardCanvas.width;
  const ch = cardCanvas.height;

  // 1. Zone En-Tête (Nom + PV) : X: 4% à 95%, Y: 2% à 8.5%
  const hX = Math.round(cw * 0.04);
  const hY = Math.round(ch * 0.020);
  const hW = Math.round(cw * 0.90);
  const hH = Math.round(ch * 0.065);

  const headerCanvas = document.createElement('canvas');
  headerCanvas.width = hW * 2;
  headerCanvas.height = hH * 2;
  const hCtx = headerCanvas.getContext('2d');
  hCtx.imageSmoothingEnabled = true;
  hCtx.drawImage(cardCanvas, hX, hY, hW, hH, 0, 0, hW * 2, hH * 2);

  // 2. Zone Bas Gauche (Numéro de carte & set) : X: 3% à 52%, Y: 92% à 98.5%
  const fX = Math.round(cw * 0.03);
  const fY = Math.round(ch * 0.920);
  const fW = Math.round(cw * 0.50);
  const fH = Math.round(ch * 0.065);

  const footerCanvas = document.createElement('canvas');
  footerCanvas.width = fW * 3;
  footerCanvas.height = fH * 3;
  const fCtx = footerCanvas.getContext('2d');
  fCtx.imageSmoothingEnabled = true;
  fCtx.drawImage(cardCanvas, fX, fY, fW, fH, 0, 0, fW * 3, fH * 3);

  // Détection de polarité sombre / claire
  const hData = hCtx.getImageData(0, 0, headerCanvas.width, headerCanvas.height).data;
  let totalLum = 0;
  for (let i = 0; i < hData.length; i += 4) {
    totalLum += 0.299 * hData[i] + 0.587 * hData[i + 1] + 0.114 * hData[i + 2];
  }
  const isDarkCard = (totalLum / (headerCanvas.width * headerCanvas.height)) < 110;

  return {
    headerCanvas,
    footerCanvas,
    cleanedHeader: preprocessCanvasForOCR(headerCanvas, isDarkCard),
    cleanedFooter: preprocessCanvasForOCR(footerCanvas, isDarkCard),
    headerPreview: headerCanvas.toDataURL('image/jpeg', 0.90),
    footerPreview: footerCanvas.toDataURL('image/jpeg', 0.90),
    isDarkCard
  };
}

/**
 * Analyse & Extrait les informations de la carte (Nom, PV, Numéro)
 */
export async function recognizeCardInfo(cardCanvas) {
  if (!cardCanvas) {
    return { name: '', hp: '', number: '', headerPreview: null, footerPreview: null };
  }

  const zones = extractCardZones(cardCanvas);
  if (!zones) {
    return { name: '', hp: '', number: '', headerPreview: null, footerPreview: null };
  }

  let extractedName = '';
  let extractedHP = '';
  let extractedNumber = '';

  try {
    const worker = await getOCRWorker();
    if (!worker) {
      return {
        name: '',
        hp: '',
        number: '',
        headerPreview: zones.headerPreview,
        footerPreview: zones.footerPreview
      };
    }

    // 1. Lecture OCR de l'En-tête (Nom + PV)
    const headerDataUrl = zones.cleanedHeader.toDataURL('image/png');
    const headerRes = await worker.recognize(headerDataUrl);
    const headerText = headerRes.data?.text || '';

    // Extraction PV (ex: PV 100, 70, 60 PV)
    const hpMatch = headerText.match(/(?:PV|HP)?\s*([0-9]{2,3})\b/i);
    if (hpMatch) {
      extractedHP = `${hpMatch[1]} PV`;
    }

    // Extraction Nom avec nettoyage
    let rawName = headerText
      .replace(/(?:BASE|NIVEAU\s*[12]|STAGE\s*[12]|PV|HP|\d+).*$/is, '')
      .replace(/[^a-zA-Zàâéèêëîïôùûüç\s-]/g, '')
      .trim();

    // Recherche de correspondance exacte ou approchée dans le Pokédex
    if (rawName.length >= 3) {
      const match = POKEMON_NAMES_FR.find(p =>
        rawName.toLowerCase().includes(p.toLowerCase()) ||
        p.toLowerCase().includes(rawName.toLowerCase())
      );
      extractedName = match || rawName;
    }

    // 2. Lecture OCR du Bas de Carte (Numéro XXX/YYY)
    const footerDataUrl = zones.cleanedFooter.toDataURL('image/png');
    const footerRes = await worker.recognize(footerDataUrl);
    const footerText = footerRes.data?.text || '';

    let cleanedFooter = footerText
      .replace(/[—–_]/g, '/')
      .replace(/[|]/g, '1')
      .replace(/\s*[/]\s*/g, '/');

    const numMatch = cleanedFooter.match(/\b([0-9]{1,3})\s*[\/]\s*([0-9]{1,3})\b/);
    if (numMatch) {
      extractedNumber = `${numMatch[1]}/${numMatch[2]}`;
    } else {
      const flexMatch = cleanedFooter.match(/([0-9]{1,3})\s*[\/\\]\s*([0-9]{1,3})/);
      if (flexMatch) {
        extractedNumber = `${flexMatch[1]}/${flexMatch[2]}`;
      }
    }

  } catch (err) {
    console.error('Erreur lecture OCR carte:', err);
  }

  return {
    name: extractedName,
    hp: extractedHP,
    number: extractedNumber,
    headerPreview: zones.headerPreview,
    footerPreview: zones.footerPreview
  };
}
