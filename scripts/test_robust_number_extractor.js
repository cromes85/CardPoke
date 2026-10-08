import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

/**
 * Preprocess card canvas to extract footer number with multiple filters
 */
export function extractFooterCrops(cardCanvas) {
  const cw = cardCanvas.width;
  const ch = cardCanvas.height;

  // Bottom left number area: X: 4% to 54%, Y: 92.5% to 98.5%
  const cropX = Math.round(cw * 0.04);
  const cropY = Math.round(ch * 0.925);
  const cropW = Math.round(cw * 0.50);
  const cropH = Math.round(ch * 0.060);

  // 1. High-res scaled crop
  const scale = 3;
  const cropCanvas = createCanvas(cropW * scale, cropH * scale);
  const ctx = cropCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cardCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW * scale, cropH * scale);

  // 2. Grayscale High-Contrast Inverted (black text on white)
  const invCanvas = createCanvas(cropW * scale, cropH * scale);
  const invCtx = invCanvas.getContext('2d');
  invCtx.drawImage(cropCanvas, 0, 0);
  const imgData = invCtx.getImageData(0, 0, cropW * scale, cropH * scale);
  const data = imgData.data;

  // Find min/max lum
  let minLum = 255, maxLum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  const midLum = (minLum + maxLum) / 2;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Invert: high luminance text -> dark pixel (0), low background -> white (255)
    const norm = (lum - minLum) / (maxLum - minLum || 1);
    const val = norm > 0.45 ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
  invCtx.putImageData(imgData, 0, 0);

  return { cropCanvas, invCanvas };
}

export function parseCardNumber(rawText) {
  if (!rawText) return null;

  // Clean common OCR misrecognitions
  let cleaned = rawText
    .replace(/[—–_]/g, '/')
    .replace(/[|]/g, '1')
    .replace(/[lI]/g, '1')
    .replace(/O(?=\d)|\bO\b/g, '0');

  // Primary: standard XXX/YYY pattern (e.g. 123/217, 025/198, 12/102)
  const numMatch = cleaned.match(/\b([0-9]{1,3})\s*[\/]\s*([0-9]{1,3})\b/);
  if (numMatch) {
    return `${numMatch[1]}/${numMatch[2]}`;
  }

  // Trainer Gallery / Special sets (e.g. TG01/TG30, GG12/GG70)
  const specialMatch = cleaned.match(/\b([A-Z]{1,3}\s*[0-9]{1,3})\s*[\/]\s*([A-Z]{1,3}\s*[0-9]{1,3})\b/i);
  if (specialMatch) {
    return `${specialMatch[1].replace(/\s+/g, '')}/${specialMatch[2].replace(/\s+/g, '')}`;
  }

  // Fallback: look for solitary fractions like 123/217 anywhere
  const broadMatch = rawText.match(/([0-9]{1,3})\s*[\/\\|]\s*([0-9]{1,3})/);
  if (broadMatch) {
    return `${broadMatch[1]}/${broadMatch[2]}`;
  }

  return null;
}

async function run() {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-[]',
    tessedit_pageseg_mode: '6'
  });

  const cardImg = await loadImage(path.join(scratchDir, 'cropped_inner_card.jpg'));
  const { cropCanvas, invCanvas } = extractFooterCrops(cardImg);

  fs.writeFileSync(path.join(scratchDir, 'footer_crop_test.jpg'), cropCanvas.toBuffer('image/jpeg'));
  fs.writeFileSync(path.join(scratchDir, 'footer_inv_test.jpg'), invCanvas.toBuffer('image/jpeg'));

  const ret = await worker.recognize(path.join(scratchDir, 'footer_inv_test.jpg'));
  console.log('OCR Raw output:', JSON.stringify(ret.data.text));

  const parsed = parseCardNumber(ret.data.text);
  console.log('Parsed Card Number:', parsed);

  await worker.terminate();
}

run();
