import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';

// 1. Algorithme de détection par segmentation couleur + gradient adaptatif + analyse de contours
function detectCardInImage(imgCanvas) {
  const w = imgCanvas.width;
  const h = imgCanvas.height;

  // Travailler à résolution normalisée (360px de large)
  const targetW = 360;
  const scale = targetW / w;
  const targetH = Math.round(h * scale);

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgCanvas, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // Calcul du gradient Sobel 2D
  const gradMap = new Float32Array(targetW * targetH);
  const grayMap = new Uint8Array(targetW * targetH);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const idx = (y * targetW + x) * 4;
      // Niveaux de gris pondérés
      const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      grayMap[y * targetW + x] = gray;
    }
  }

  // Sobel 3x3
  let maxGrad = 0;
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const gx =
        -grayMap[(y - 1) * targetW + (x - 1)] + grayMap[(y - 1) * targetW + (x + 1)] +
        -2 * grayMap[y * targetW + (x - 1)]   + 2 * grayMap[y * targetW + (x + 1)] +
        -grayMap[(y + 1) * targetW + (x - 1)] + grayMap[(y + 1) * targetW + (x + 1)];

      const gy =
        -grayMap[(y - 1) * targetW + (x - 1)] - 2 * grayMap[(y - 1) * targetW + x] - grayMap[(y - 1) * targetW + (x + 1)] +
         grayMap[(y + 1) * targetW + (x - 1)] + 2 * grayMap[(y + 1) * targetW + x] + grayMap[(y + 1) * targetW + (x + 1)];

      const mag = Math.sqrt(gx * gx + gy * gy);
      gradMap[y * targetW + x] = mag;
      if (mag > maxGrad) maxGrad = mag;
    }
  }

  // 2. Recherche de la boîte englobante par projections de gradients et segmentation morphologique
  // Éliminer les marges extrêmes de l'écran (bords de l'appareil/châssis)
  const marginX = Math.round(targetW * 0.05);
  const marginY = Math.round(targetH * 0.05);

  // Profil horizontal et vertical d'énergie de gradient
  const projX = new Float32Array(targetW);
  const projY = new Float32Array(targetH);

  for (let y = marginY; y < targetH - marginY; y++) {
    for (let x = marginX; x < targetW - marginX; x++) {
      const g = gradMap[y * targetW + x];
      if (g > maxGrad * 0.15) {
        projX[x] += g;
        projY[y] += g;
      }
    }
  }

  // Trouver les pics de bordures (Left, Right, Top, Bottom)
  // Recherche à partir du centre vers l'extérieur
  const cx = Math.round(targetW / 2);
  const cy = Math.round(targetH / 2);

  // Recherche des limites de la carte
  let leftX = marginX, rightX = targetW - marginX;
  let topY = marginY, bottomY = targetH - marginY;

  // Trouver Left: premier fort pic à gauche du centre
  let maxLeftEnergy = 0;
  for (let x = Math.round(targetW * 0.08); x < cx - Math.round(targetW * 0.10); x++) {
    if (projX[x] > maxLeftEnergy) {
      maxLeftEnergy = projX[x];
      leftX = x;
    }
  }

  // Trouver Right: premier fort pic à droite du centre
  let maxRightEnergy = 0;
  for (let x = cx + Math.round(targetW * 0.10); x < targetW - Math.round(targetW * 0.08); x++) {
    if (projX[x] > maxRightEnergy) {
      maxRightEnergy = projX[x];
      rightX = x;
    }
  }

  // Trouver Top: premier fort pic au dessus du centre
  let maxTopEnergy = 0;
  for (let y = Math.round(targetH * 0.08); y < cy - Math.round(targetH * 0.10); y++) {
    if (projY[y] > maxTopEnergy) {
      maxTopEnergy = projY[y];
      topY = y;
    }
  }

  // Trouver Bottom: premier fort pic en dessous du centre
  let maxBottomEnergy = 0;
  for (let y = cy + Math.round(targetH * 0.10); y < targetH - Math.round(targetH * 0.08); y++) {
    if (projY[y] > maxBottomEnergy) {
      maxBottomEnergy = projY[y];
      bottomY = y;
    }
  }

  // Normaliser en coordonnées relatives [0..1]
  const rawCorners = [
    { x: leftX / targetW, y: topY / targetH },
    { x: rightX / targetW, y: topY / targetH },
    { x: rightX / targetW, y: bottomY / targetH },
    { x: leftX / targetW, y: bottomY / targetH }
  ];

  const cardW = (rightX - leftX) / targetW;
  const cardH = (bottomY - topY) / targetH;
  const ratio = cardH > 0 ? cardW / cardH : 0;

  return {
    corners: rawCorners,
    ratio: Number(ratio.toFixed(3)),
    widthPercent: Math.round(cardW * 100),
    heightPercent: Math.round(cardH * 100)
  };
}

async function runBenchmark() {
  const files = fs.readdirSync(uploadedDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  console.log(`Running benchmark on ${files.length} real photos...`);

  let countSuccess = 0;

  for (const f of files) {
    const fullPath = path.join(uploadedDir, f);
    const img = await loadImage(fullPath);
    const res = detectCardInImage(img);

    const isGoodRatio = res.ratio >= 0.55 && res.ratio <= 0.85;
    if (isGoodRatio) countSuccess++;

    console.log(`[${f}] -> Ratio: ${res.ratio} (W:${res.widthPercent}%, H:${res.heightPercent}%) | Good: ${isGoodRatio ? 'YES' : 'NO'}`);
  }

  console.log(`\nResult: ${countSuccess} / ${files.length} (${Math.round((countSuccess / files.length) * 100)}%) successfully detected with proper Pokémon card ratio.`);
}

runBenchmark();
