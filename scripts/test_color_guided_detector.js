import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';
const POKEMON_RATIO = 63 / 88; // 0.7159

/**
 * Détecteur de Carte par Énergie Couleur & Bords de Transition
 */
export function detectPokemonCardColorGuided(imgCanvas) {
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

  // 1. Carte de Présence de Carte (Couleur, Saturation & Détails)
  const cardMap = new Float32Array(targetW * targetH);
  const grayMap = new Uint8Array(targetW * targetH);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const idx = (y * targetW + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grayMap[y * targetW + x] = gray;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max > 0 ? (max - min) / max : 0;
      const colorSpread = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);

      // Présence de couleur (carte) vs plastique/fond neutre
      cardMap[y * targetW + x] = sat * 60 + (colorSpread > 18 ? 40 : 0);
    }
  }

  // 2. Trouver le barycentre de la carte (Center of Mass of Card Colors)
  let totalScore = 0, sumX = 0, sumY = 0;
  const minY = Math.round(targetH * 0.15), maxY = Math.round(targetH * 0.85);
  const minX = Math.round(targetW * 0.12), maxX = Math.round(targetW * 0.88);

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const s = cardMap[y * targetW + x];
      if (s > 20) {
        totalScore += s;
        sumX += x * s;
        sumY += y * s;
      }
    }
  }

  const cx = totalScore > 0 ? Math.round(sumX / totalScore) : Math.round(targetW / 2);
  const cy = totalScore > 0 ? Math.round(sumY / totalScore) : Math.round(targetH / 2);

  // 3. Calcul Sobel autour du centre
  const gradMag = new Float32Array(targetW * targetH);
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const gx = -grayMap[(y - 1) * targetW + (x - 1)] + grayMap[(y - 1) * targetW + (x + 1)]
                 -2 * grayMap[y * targetW + (x - 1)] + 2 * grayMap[y * targetW + (x + 1)]
                 -grayMap[(y + 1) * targetW + (x - 1)] + grayMap[(y + 1) * targetW + (x + 1)];

      const gy = -grayMap[(y - 1) * targetW + (x - 1)] - 2 * grayMap[(y - 1) * targetW + x] - grayMap[(y - 1) * targetW + (x + 1)]
                 +grayMap[(y + 1) * targetW + (x - 1)] + 2 * grayMap[(y + 1) * targetW + x] + grayMap[(y + 1) * targetW + (x + 1)];

      gradMag[y * targetW + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // 4. Ray-Marching depuis le centre de la carte (Inside-Out)
  // Scanne vers les 4 directions pour trouver la bordure extérieure de la carte (chute brutale de couleur/gradient)
  // 4.1 BORD GAUCHE
  let leftX = cx;
  for (let x = cx; x >= 10; x--) {
    const g = gradMag[cy * targetW + x];
    const c = cardMap[cy * targetW + x];
    if (g > 35 || (c < 15 && x < cx - 20)) {
      leftX = x;
      break;
    }
  }

  // 4.2 BORD DROIT
  let rightX = cx;
  for (let x = cx; x < targetW - 10; x++) {
    const g = gradMag[cy * targetW + x];
    const c = cardMap[cy * targetW + x];
    if (g > 35 || (c < 15 && x > cx + 20)) {
      rightX = x;
      break;
    }
  }

  // 4.3 BORD HAUT
  let topY = cy;
  for (let y = cy; y >= 10; y--) {
    const g = gradMag[y * targetW + cx];
    const c = cardMap[y * targetW + cx];
    if (g > 35 || (c < 15 && y < cy - 20)) {
      topY = y;
      break;
    }
  }

  // 4.4 BORD BAS
  let bottomY = cy;
  for (let y = cy; y < targetH - 10; y++) {
    const g = gradMag[y * targetW + cx];
    const c = cardMap[y * targetW + cx];
    if (g > 35 || (c < 15 && y > cy + 20)) {
      bottomY = y;
      break;
    }
  }

  // Ajustement géométrique Pokémon (Largeur x Hauteur avec ratio 63:88)
  let cardW = rightX - leftX;
  let cardH = bottomY - topY;

  // Si l'une des dimensions est plus nette que l'autre, réajuster au ratio officiel
  if (cardW > 30 && cardH > 40) {
    const expectedH = cardW / POKEMON_RATIO;
    if (Math.abs(cardH - expectedH) > 20) {
      // Équilibrer
      cardH = Math.round((cardH + expectedH) / 2);
      topY = Math.max(5, Math.round(cy - cardH / 2));
      bottomY = Math.min(targetH - 5, Math.round(cy + cardH / 2));
    }
  }

  const corners = [
    { x: leftX / targetW, y: topY / targetH },
    { x: rightX / targetW, y: topY / targetH },
    { x: rightX / targetW, y: bottomY / targetH },
    { x: leftX / targetW, y: bottomY / targetH }
  ];

  const ratio = cardH > 0 ? Number((cardW / cardH).toFixed(3)) : POKEMON_RATIO;

  return {
    corners,
    ratio,
    cardCenter: { x: cx / targetW, y: cy / targetH },
    confidence: 90
  };
}

async function testSingle() {
  const filename = 'media_1791467710063.jpg';
  const img = await loadImage(path.join(uploadedDir, filename));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const res = detectPokemonCardColorGuided(canvas);
  console.log(`Color Guided Detection on ${filename}:`, res);

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
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();
    });

    const outPath = path.join(scratchDir, `color_guided_${filename}`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg'));
    console.log(`Saved result visualization to: ${outPath}`);
  }
}

testSingle();
