import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

// 1. Bilinear Warping Function
function extractCardWarpedBilinear(sourceCanvas, corners, targetWidth = 630, targetHeight = 880) {
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
        const x1 = x0 + 1;
        const y1 = y0 + 1;

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
      } else {
        outData[outIdx + 3] = 0;
      }
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}

// 2. Automated Smart Image Enhancement (Levels + Unsharp Mask + Vibrancy)
function autoEnhanceCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // A. Calcul de l'histogramme de luminance
  const hist = new Int32Array(256);
  const totalPixels = w * h;
  for (let i = 0; i < data.length; i += 4) {
    const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[l]++;
  }

  // Trouver le point noir (1.5%) et point blanc (98.5%)
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

  // Éviter l'écrasement excessif
  if (whitePt - blackPt < 60) {
    blackPt = Math.max(0, blackPt - 20);
    whitePt = Math.min(255, whitePt + 20);
  }

  const range = whitePt - blackPt || 1;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let val = ((i - blackPt) / range) * 255;
    // Légère courbe gamma pour déboucher les ombres sans brûler les hautes lumières
    val = 255 * Math.pow(Math.max(0, Math.min(1, val / 255)), 0.90);
    lut[i] = Math.min(255, Math.max(0, Math.round(val)));
  }

  // B. Application LUT + Boost de saturation (+15%)
  const enhanced = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    let r = lut[data[i]];
    let g = lut[data[i + 1]];
    let b = lut[data[i + 2]];

    // Saturation boost
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * 1.15;
    g = gray + (g - gray) * 1.15;
    b = gray + (b - gray) * 1.15;

    enhanced[i] = Math.min(255, Math.max(0, Math.round(r)));
    enhanced[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    enhanced[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
    enhanced[i + 3] = 255;
  }

  // C. Unsharp Mask (Netteté & Clarté du texte et des bordures)
  const finalImgData = ctx.createImageData(w, h);
  const outData = finalImgData.data;

  // Kernel d'accentuation: centre 2.2, voisins -0.3
  const centerWeight = 2.2;
  const neighborWeight = -0.3;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;

      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        outData[idx] = enhanced[idx];
        outData[idx + 1] = enhanced[idx + 1];
        outData[idx + 2] = enhanced[idx + 2];
        outData[idx + 3] = 255;
        continue;
      }

      const up = ((y - 1) * w + x) * 4;
      const down = ((y + 1) * w + x) * 4;
      const left = (y * w + (x - 1)) * 4;
      const right = (y * w + (x + 1)) * 4;

      for (let c = 0; c < 3; c++) {
        const val = enhanced[idx + c] * centerWeight +
          (enhanced[up + c] + enhanced[down + c] + enhanced[left + c] + enhanced[right + c]) * neighborWeight;
        outData[idx + c] = Math.min(255, Math.max(0, Math.round(val)));
      }
      outData[idx + 3] = 255;
    }
  }

  ctx.putImageData(finalImgData, 0, 0);
  return canvas;
}

async function run() {
  const filename = 'media_1791479015064.jpg';
  const img = await loadImage(path.join(uploadedDir, filename));
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);

  const corners = [
    { x: 0.268, y: 0.480 },
    { x: 0.538, y: 0.480 },
    { x: 0.538, y: 0.690 },
    { x: 0.268, y: 0.690 }
  ];

  const warpedRaw = extractCardWarpedBilinear(canvas, corners, 630, 880);
  fs.writeFileSync(path.join(scratchDir, 'test_raw.jpg'), warpedRaw.toBuffer('image/jpeg'));

  const warpedEnhanced = extractCardWarpedBilinear(canvas, corners, 630, 880);
  autoEnhanceCanvas(warpedEnhanced);
  fs.writeFileSync(path.join(scratchDir, 'test_enhanced.jpg'), warpedEnhanced.toBuffer('image/jpeg'));

  console.log('Saved test_raw.jpg and test_enhanced.jpg in scratch');
}

run();
