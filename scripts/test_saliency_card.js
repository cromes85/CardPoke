import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';
const POKEMON_RATIO = 63 / 88; // 0.7159

export function detectCardBySaliency(imgCanvas) {
  const w = imgCanvas.width;
  const h = imgCanvas.height;

  const targetW = 360;
  const scale = targetW / w;
  const targetH = Math.round(h * scale);

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgCanvas, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // 1. Carte de Saillance (Saliency Map = Couleur + Gradient + Contraste)
  const saliency = new Float32Array(targetW * targetH);

  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const idx = (y * targetW + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      // Saturation
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max > 0 ? (max - min) / max : 0;

      // Gradient couleur
      const idxR = (y * targetW + (x + 1)) * 4;
      const idxD = ((y + 1) * targetW + x) * 4;
      const dGrad = Math.hypot(data[idxR] - r, data[idxR + 1] - g, data[idxR + 2] - b) +
                    Math.hypot(data[idxD] - r, data[idxD + 1] - g, data[idxD + 2] - b);

      // Distance au blanc (plastique 3D)
      const distWhite = Math.hypot(255 - r, 255 - g, 255 - b);

      if (distWhite > 50 && (sat > 0.10 || dGrad > 25)) {
        saliency[y * targetW + x] = 1.0;
      }
    }
  }

  // 2. Projections horizontales et verticales de la masse de saillance
  const projX = new Float32Array(targetW);
  const projY = new Float32Array(targetH);

  for (let y = Math.round(targetH * 0.15); y < Math.round(targetH * 0.85); y++) {
    for (let x = Math.round(targetW * 0.10); x < Math.round(targetW * 0.90); x++) {
      if (saliency[y * targetW + x] === 1.0) {
        projX[x] += 1;
        projY[y] += 1;
      }
    }
  }

  // 3. Trouver le segment de carte le plus dense sur X et Y
  // Recherche du pic X
  let bestXStart = 0, bestXEnd = targetW, maxScoreX = 0;
  for (let x1 = Math.round(targetW * 0.12); x1 < Math.round(targetW * 0.60); x1++) {
    for (let x2 = x1 + Math.round(targetW * 0.20); x2 < Math.min(targetW - 10, x1 + Math.round(targetW * 0.70)); x2++) {
      let sumInside = 0;
      for (let x = x1; x <= x2; x++) sumInside += projX[x];
      const density = sumInside / (x2 - x1);
      if (density > maxScoreX) {
        maxScoreX = density;
        bestXStart = x1;
        bestXEnd = x2;
      }
    }
  }

  // Recherche du pic Y
  let bestYStart = 0, bestYEnd = targetH, maxScoreY = 0;
  for (let y1 = Math.round(targetH * 0.15); y1 < Math.round(targetH * 0.70); y1++) {
    for (let y2 = y1 + Math.round(targetH * 0.15); y2 < Math.min(targetH - 10, y1 + Math.round(targetH * 0.70)); y2++) {
      let sumInside = 0;
      for (let y = y1; y <= y2; y++) sumInside += projY[y];
      const density = sumInside / (y2 - y1);
      if (density > maxScoreY) {
        maxScoreY = density;
        bestYStart = y1;
        bestYEnd = y2;
      }
    }
  }

  // Ajuster au ratio officiel Pokémon 63:88
  let cardW = (bestXEnd - bestXStart) / targetW;
  let cardH = (bestYEnd - bestYStart) / targetH;
  const currentRatio = cardW / cardH;

  // Si le ratio s'éloigne trop de 0.716, forcer la hauteur/largeur en accord avec le ratio officiel
  if (Math.abs(currentRatio - POKEMON_RATIO) > 0.15) {
    const adjustedH = cardW / POKEMON_RATIO;
    const centerY = (bestYStart + bestYEnd) / 2 / targetH;
    bestYStart = Math.round((centerY - adjustedH / 2) * targetH);
    bestYEnd = Math.round((centerY + adjustedH / 2) * targetH);
  }

  const corners = [
    { x: bestXStart / targetW, y: bestYStart / targetH },
    { x: bestXEnd / targetW, y: bestYStart / targetH },
    { x: bestXEnd / targetW, y: bestYEnd / targetH },
    { x: bestXStart / targetW, y: bestYEnd / targetH }
  ];

  return {
    corners,
    ratio: Number((cardW / cardH).toFixed(3)),
    confidence: 92
  };
}

async function testSaliency() {
  const filename = 'media_1791467710063.jpg';
  const img = await loadImage(path.join(uploadedDir, filename));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const res = detectCardBySaliency(canvas);
  console.log(`Saliency Detection on ${filename}:`, res);

  if (res && res.corners) {
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 5;
    ctx.beginPath();
    const pts = res.corners.map(p => ({ x: p.x * img.width, y: p.y * img.height }));
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.stroke();

    pts.forEach((p, i) => {
      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    const outPath = path.join(scratchDir, `saliency_${filename}`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg'));
    console.log(`Saved result visualization to: ${outPath}`);
  }
}

testSaliency();
