import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

// Bilinear warp to get 750x1050 card
function extractCardWarped(sourceCanvas, corners, targetWidth = 750, targetHeight = 1050) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  const pTL = { x: corners[0].x * w, y: corners[0].y * h };
  const pTR = { x: corners[1].x * w, y: corners[1].y * h };
  const pBR = { x: corners[2].x * w, y: corners[2].y * h };
  const pBL = { x: corners[3].x * w, y: corners[3].y * h };

  const outCanvas = createCanvas(targetWidth, targetHeight);
  const outCtx = outCanvas.getContext('2d');

  const srcCtx = sourceCanvas.getContext('2d');
  const srcImgData = srcCtx.getImageData(0, 0, w, h);
  const srcData = srcImgData.data;

  const outImgData = outCtx.createImageData(targetWidth, targetHeight);
  const outData = outImgData.data;

  for (let y = 0; y < targetHeight; y++) {
    const v = y / (targetHeight - 1);
    for (let x = 0; x < targetWidth; x++) {
      const u = x / (targetWidth - 1);

      const topX = pTL.x * (1 - u) + pTR.x * u;
      const topY = pTL.y * (1 - u) + pTR.y * u;
      const botX = pBL.x * (1 - u) + pBR.x * u;
      const botY = pBL.y * (1 - u) + pBR.y * u;

      const sx = topX * (1 - v) + botX * v;
      const sy = topY * (1 - v) + botY * v;

      const outIdx = (y * targetWidth + x) * 4;

      if (sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = Math.min(w - 1, x0 + 1);
        const y1 = Math.min(h - 1, y0 + 1);

        const fx = sx - x0;
        const fy = sy - y0;

        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const idx00 = (y0 * w + x0) * 4;
        const idx10 = (y0 * w + x1) * 4;
        const idx01 = (y1 * w + x0) * 4;
        const idx11 = (y1 * w + x1) * 4;

        outData[outIdx] = Math.round(srcData[idx00] * w00 + srcData[idx10] * w10 + srcData[idx01] * w01 + srcData[idx11] * w11);
        outData[outIdx + 1] = Math.round(srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11);
        outData[outIdx + 2] = Math.round(srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11);
        outData[outIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}

// Extract Footer Zone specifically
function extractFooterZone(cardCanvas) {
  const cw = cardCanvas.width;
  const ch = cardCanvas.height;

  // Bottom left number area: X: 4% to 50%, Y: 93.5% to 98.5%
  const cropX = Math.round(cw * 0.04);
  const cropY = Math.round(ch * 0.935);
  const cropW = Math.round(cw * 0.48);
  const cropH = Math.round(ch * 0.055);

  const footerCanvas = createCanvas(cropW * 3, cropH * 3); // 3x zoom for high OCR accuracy
  const fCtx = footerCanvas.getContext('2d');
  fCtx.imageSmoothingEnabled = true;
  fCtx.drawImage(cardCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW * 3, cropH * 3);

  return { footerCanvas, cropX, cropY, cropW, cropH };
}

// Preprocess for OCR: Invert / Threshold / High Contrast
function preprocessForOCR(canvas, invert = true) {
  const w = canvas.width;
  const h = canvas.height;
  const outCanvas = createCanvas(w, h);
  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Calculate average luminance
  let totalLum = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const avgLum = totalLum / (w * h);

  // Auto threshold
  const thresh = avgLum * 1.15;

  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let binary = lum > thresh ? 255 : 0;
    if (invert) {
      binary = 255 - binary; // Black text on white background
    }
    data[i] = binary;
    data[i + 1] = binary;
    data[i + 2] = binary;
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}

async function run() {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-',
    tessedit_pageseg_mode: '7' // PSM 7: Treat the image as a single text line
  });

  const files = ['media_1791484444435_bc67493a.jpg', 'media_1791478701025.jpg', 'media_1791479015064.jpg'];

  for (const f of files) {
    const fullPath = path.join(uploadedDir, f);
    if (!fs.existsSync(fullPath)) continue;

    const img = await loadImage(fullPath);
    const canvas = createCanvas(img.width, img.height);
    canvas.getContext('2d').drawImage(img, 0, 0);

    // If image is already the cropped modal or whole screen:
    // Let's test
    const { footerCanvas } = extractFooterZone(canvas);
    const prep = preprocessForOCR(footerCanvas, true);

    const outPath = path.join(scratchDir, `ocr_test_${f}`);
    fs.writeFileSync(outPath, prep.toBuffer('image/jpeg'));

    const ret = await worker.recognize(outPath);
    console.log(`[${f}] OCR text:`, JSON.stringify(ret.data.text.trim()));
  }

  await worker.terminate();
}

run();
