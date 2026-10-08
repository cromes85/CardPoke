import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

export function extractCardWarpedBilinear(sourceCanvas, corners, targetWidth = 630, targetHeight = 880, brightness = 1.0, contrast = 1.0, autoEnhance = true) {
  if (!sourceCanvas || !corners || corners.length !== 4) return null;

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

  const rawWarpedData = new Uint8Array(targetWidth * targetHeight * 4);

  // Étape 1 : Rééchantillonnage bilinéaire sous-pixel
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

        rawWarpedData[outIdx] = srcData[idx00] * w00 + srcData[idx10] * w10 + srcData[idx01] * w01 + srcData[idx11] * w11;
        rawWarpedData[outIdx + 1] = srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11;
        rawWarpedData[outIdx + 2] = srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11;
        rawWarpedData[outIdx + 3] = 255;
      } else {
        rawWarpedData[outIdx + 3] = 0;
      }
    }
  }

  // Si pas d'amélioration automatique : appliquer juste luminosité/contraste simple
  if (!autoEnhance) {
    const outImgData = outCtx.createImageData(targetWidth, targetHeight);
    const outData = outImgData.data;
    const applyCorrection = brightness !== 1.0 || contrast !== 1.0;

    for (let i = 0; i < rawWarpedData.length; i += 4) {
      let r = rawWarpedData[i];
      let g = rawWarpedData[i + 1];
      let b = rawWarpedData[i + 2];

      if (applyCorrection) {
        if (contrast !== 1.0) {
          r = (r - 128) * contrast + 128;
          g = (g - 128) * contrast + 128;
          b = (b - 128) * contrast + 128;
        }
        if (brightness !== 1.0) {
          r = r * brightness;
          g = g * brightness;
          b = b * brightness;
        }
        r = Math.min(255, Math.max(0, Math.round(r)));
        g = Math.min(255, Math.max(0, Math.round(g)));
        b = Math.min(255, Math.max(0, Math.round(b)));
      }

      outData[i] = r;
      outData[i + 1] = g;
      outData[i + 2] = b;
      outData[i + 3] = rawWarpedData[i + 3];
    }

    outCtx.putImageData(outImgData, 0, 0);
    return outCanvas;
  }

  // Étape 2 : Traitement Automatique Haute Qualité (Auto-Levels, Gamma, Saturation & Super-Netteté)
  const totalPixels = targetWidth * targetHeight;
  const hist = new Int32Array(256);

  for (let i = 0; i < rawWarpedData.length; i += 4) {
    if (rawWarpedData[i + 3] === 0) continue;
    const lum = Math.round(0.299 * rawWarpedData[i] + 0.587 * rawWarpedData[i + 1] + 0.114 * rawWarpedData[i + 2]);
    hist[lum]++;
  }

  let count = 0;
  let blackPt = 0;
  const lowThresh = totalPixels * 0.015;
  for (let i = 0; i < 256; i++) {
    count += hist[i];
    if (count >= lowThresh) {
      blackPt = i;
      break;
    }
  }

  count = 0;
  let whitePt = 255;
  const highThresh = totalPixels * 0.015;
  for (let i = 255; i >= 0; i--) {
    count += hist[i];
    if (count >= highThresh) {
      whitePt = i;
      break;
    }
  }

  if (whitePt - blackPt < 70) {
    blackPt = Math.max(0, blackPt - 15);
    whitePt = Math.min(255, whitePt + 15);
  }

  const range = whitePt - blackPt || 1;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let norm = (i - blackPt) / range;
    norm = Math.max(0, Math.min(1, norm));
    // Courbe gamma douce 0.88 pour déboucher les zones d'ombres et textes
    let enhancedVal = 255 * Math.pow(norm, 0.88);
    lut[i] = Math.min(255, Math.max(0, Math.round(enhancedVal)));
  }

  // Appliquer LUT + Rehaussement de saturation (+12%)
  const colorCorrected = new Uint8Array(rawWarpedData.length);
  for (let i = 0; i < rawWarpedData.length; i += 4) {
    if (rawWarpedData[i + 3] === 0) {
      colorCorrected[i + 3] = 0;
      continue;
    }
    let r = lut[rawWarpedData[i]];
    let g = lut[rawWarpedData[i + 1]];
    let b = lut[rawWarpedData[i + 2]];

    // Saturation booster
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * 1.12;
    g = gray + (g - gray) * 1.12;
    b = gray + (b - gray) * 1.12;

    colorCorrected[i] = Math.min(255, Math.max(0, Math.round(r)));
    colorCorrected[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    colorCorrected[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
    colorCorrected[i + 3] = 255;
  }

  // Étape 3 : Filtre Unsharp Mask (Netteté des textes et bordures)
  const outImgData = outCtx.createImageData(targetWidth, targetHeight);
  const outData = outImgData.data;

  const centerWeight = 2.0;
  const neighborWeight = -0.25;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = (y * targetWidth + x) * 4;

      if (x === 0 || x === targetWidth - 1 || y === 0 || y === targetHeight - 1 || colorCorrected[idx + 3] === 0) {
        outData[idx] = colorCorrected[idx];
        outData[idx + 1] = colorCorrected[idx + 1];
        outData[idx + 2] = colorCorrected[idx + 2];
        outData[idx + 3] = colorCorrected[idx + 3];
        continue;
      }

      const up = ((y - 1) * targetWidth + x) * 4;
      const down = ((y + 1) * targetWidth + x) * 4;
      const left = (y * targetWidth + (x - 1)) * 4;
      const right = (y * targetWidth + (x + 1)) * 4;

      for (let c = 0; c < 3; c++) {
        const val = colorCorrected[idx + c] * centerWeight +
          (colorCorrected[up + c] + colorCorrected[down + c] + colorCorrected[left + c] + colorCorrected[right + c]) * neighborWeight;
        outData[idx + c] = Math.min(255, Math.max(0, Math.round(val)));
      }
      outData[idx + 3] = 255;
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}

async function test() {
  const imgPath = path.join(uploadedDir, 'media_1791482389800_39de8532.jpg');
  const img = await loadImage(imgPath);
  console.log('Testing on screenshot...');
}

test();
