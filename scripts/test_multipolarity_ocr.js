import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

/**
 * Intelligent Multi-Polarity Preprocessing for Pokémon Card Footers
 */
function processFooterForOCR(footerCanvas) {
  const w = footerCanvas.width;
  const h = footerCanvas.height;

  const ctx = footerCanvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Analyze background luminance from corners/edges
  let bgLumSum = 0;
  let bgSamples = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sample perimeter
      if (x < 5 || x > w - 5 || y < 5 || y > h - 5) {
        const idx = (y * w + x) * 4;
        bgLumSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        bgSamples++;
      }
    }
  }
  const avgBgLum = bgLumSum / (bgSamples || 1);
  const isDarkCard = avgBgLum < 110; // Dark card (Fantominus) vs Light card (Macronium, Sucroquin)

  // Variant A: Grayscale with contrast stretch (works great on Tesseract 5)
  const grayCanvas = createCanvas(w, h);
  const grayCtx = grayCanvas.getContext('2d');
  const grayImgData = grayCtx.createImageData(w, h);
  const grayData = grayImgData.data;

  // Variant B: Smart Binarized (Black text on pure White background)
  const binCanvas = createCanvas(w, h);
  const binCtx = binCanvas.getContext('2d');
  const binImgData = binCtx.createImageData(w, h);
  const binData = binImgData.data;

  // Find min/max lum
  let minLum = 255, maxLum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  const range = maxLum - minLum || 1;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    
    // Stretch grayscale
    let stretched = ((lum - minLum) / range) * 255;
    if (isDarkCard) {
      stretched = 255 - stretched; // Invert dark card to black text on white
    }
    grayData[i] = stretched;
    grayData[i + 1] = stretched;
    grayData[i + 2] = stretched;
    grayData[i + 3] = 255;

    // Binary
    let binary = 255;
    if (isDarkCard) {
      // White text on dark: high lum is text -> make black (0)
      binary = lum > minLum + range * 0.40 ? 0 : 255;
    } else {
      // Dark text on light: low lum is text -> make black (0)
      binary = lum < minLum + range * 0.55 ? 0 : 255;
    }
    binData[i] = binary;
    binData[i + 1] = binary;
    binData[i + 2] = binary;
    binData[i + 3] = 255;
  }

  grayCtx.putImageData(grayImgData, 0, 0);
  binCtx.putImageData(binImgData, 0, 0);

  return { grayCanvas, binCanvas, isDarkCard };
}

function parseCardNumber(rawText) {
  if (!rawText) return null;

  let cleaned = rawText
    .replace(/[—–_]/g, '/')
    .replace(/[|]/g, '1')
    .replace(/[Il]/g, '1')
    .replace(/O(?=\d)/g, '0')
    .replace(/\s*[/]\s*/g, '/');

  // Standard XXX/YYY (e.g. 123/217, 009/217, 054/094)
  const numMatch = cleaned.match(/\b([0-9]{1,3})\s*[\/]\s*([0-9]{1,3})\b/);
  if (numMatch) {
    return `${numMatch[1]}/${numMatch[2]}`;
  }

  // Fractions like 123/217 with prefix
  const flexMatch = cleaned.match(/([0-9]{1,3})\s*[\/\\]\s*([0-9]{1,3})/);
  if (flexMatch) {
    return `${flexMatch[1]}/${flexMatch[2]}`;
  }

  // Trainer Gallery / Promo
  const spMatch = cleaned.match(/\b([A-Z]{1,3}[0-9]{1,3})\s*[\/]\s*([A-Z]{1,3}[0-9]{1,3})\b/i);
  if (spMatch) {
    return `${spMatch[1]}/${spMatch[2]}`;
  }

  return null;
}

async function testAllCards() {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-[]',
    tessedit_pageseg_mode: '6'
  });

  const cards = [
    { name: 'Macronium', file: 'media_1791485353568_440b371f.jpg' },
    { name: 'Fantominus', file: 'media_1791485353612_2b5e2ee3.jpg' },
    { name: 'Sucroquin', file: 'media_1791485353718_1663d2e8.jpg' }
  ];

  for (const c of cards) {
    const img = await loadImage(path.join(uploadedDir, c.file));
    
    // In screenshot: card is X: 68 to 404 (w 336), Y: 160 to 630 (h 470)
    const cardCanvas = createCanvas(336, 470);
    cardCanvas.getContext('2d').drawImage(img, 68, 160, 336, 470, 0, 0, 336, 470);

    // Footer number crop: X: 15 to 140 (w 125), Y: 430 to 462 (h 32)
    const scale = 3;
    const footerCrop = createCanvas(125 * scale, 32 * scale);
    const fCtx = footerCrop.getContext('2d');
    fCtx.imageSmoothingEnabled = true;
    fCtx.drawImage(cardCanvas, 15, 430, 125, 32, 0, 0, 125 * scale, 32 * scale);

    const { grayCanvas, binCanvas, isDarkCard } = processFooterForOCR(footerCrop);

    const grayPath = path.join(scratchDir, `${c.name}_gray.jpg`);
    const binPath = path.join(scratchDir, `${c.name}_bin.jpg`);
    fs.writeFileSync(grayPath, grayCanvas.toBuffer('image/jpeg'));
    fs.writeFileSync(binPath, binCanvas.toBuffer('image/jpeg'));

    const resGray = await worker.recognize(grayPath);
    const resBin = await worker.recognize(binPath);

    const parsedGray = parseCardNumber(resGray.data.text);
    const parsedBin = parseCardNumber(resBin.data.text);

    console.log(`\n================= ${c.name} (isDark: ${isDarkCard}) =================`);
    console.log('Gray OCR Text:', JSON.stringify(resGray.data.text.trim()));
    console.log('Bin OCR Text: ', JSON.stringify(resBin.data.text.trim()));
    console.log('-> DETECTED NUMBER:', parsedGray || parsedBin || 'FAILED');
  }

  await worker.terminate();
}

testAllCards();
