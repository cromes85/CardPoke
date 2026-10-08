import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

/**
 * Intelligent Grayscale & Adaptive Contrast Filter for Text
 */
function cleanTextForOCR(canvas, isDarkBg = false) {
  const w = canvas.width;
  const h = canvas.height;
  const outCanvas = createCanvas(w, h);
  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);

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
    if (isDarkBg) {
      val = 255 - val; // Invert so text is always black on white
    }
    // Boost contrast
    val = (val - 128) * 1.5 + 128;
    val = Math.min(255, Math.max(0, Math.round(val)));
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

async function testFullCardRecognition() {
  const worker = await createWorker('fra+eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèêàùâôîïç.-PV',
    tessedit_pageseg_mode: '6'
  });

  const cards = [
    { name: 'Macronium', file: 'media_1791485353568_440b371f.jpg', isDark: false },
    { name: 'Fantominus', file: 'media_1791485353612_2b5e2ee3.jpg', isDark: true },
    { name: 'Sucroquin', file: 'media_1791485353718_1663d2e8.jpg', isDark: false }
  ];

  for (const c of cards) {
    const img = await loadImage(path.join(uploadedDir, c.file));
    
    // In screenshot: card is X: 68 to 404 (w 336), Y: 160 to 630 (h 470)
    const cardCanvas = createCanvas(336, 470);
    cardCanvas.getContext('2d').drawImage(img, 68, 160, 336, 470, 0, 0, 336, 470);

    // 1. Header Area (Name + HP together): X: 35 to 300, Y: 10 to 45
    const headerCanvas = createCanvas(265 * 3, 35 * 3);
    const hCtx = headerCanvas.getContext('2d');
    hCtx.imageSmoothingEnabled = true;
    hCtx.drawImage(cardCanvas, 35, 10, 265, 35, 0, 0, 265 * 3, 35 * 3);

    const cleanedHeader = cleanTextForOCR(headerCanvas, c.isDark);
    const hPath = path.join(scratchDir, `${c.name}_header_clean.jpg`);
    fs.writeFileSync(hPath, cleanedHeader.toBuffer('image/jpeg'));

    const res = await worker.recognize(hPath);
    console.log(`\n================ ${c.name} Header ================`);
    console.log('Raw OCR Text:', JSON.stringify(res.data.text.trim()));

    // Parse Name & HP
    const text = res.data.text.trim();
    const hpMatch = text.match(/(?:PV|HP)?\s*([0-9]{2,3})\b/i);
    const nameMatch = text.replace(/(?:BASE|NIVEAU\s*[12]|STAGE\s*[12]|PV|HP|\d+).*$/i, '').trim();

    console.log('-> Nom Extrait :', nameMatch || 'Non détecté');
    console.log('-> PV Extrait  :', hpMatch ? hpMatch[1] + ' PV' : 'Non détecté');
  }

  await worker.terminate();
}

testFullCardRecognition();
