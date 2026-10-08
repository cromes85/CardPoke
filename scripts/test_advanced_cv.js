import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';

// --------------------------------------------------------------------------------------
// MOTEUR DE SEGMENTATION AVANCÉE : COULEUR + MORPHOLOGIE + CONTOUR QUAD CONVEXE
// --------------------------------------------------------------------------------------
export function detectCardAdvanced(imgCanvas) {
  const w = imgCanvas.width;
  const h = imgCanvas.height;

  // Résolution d'analyse (largeur 320px)
  const targetW = 320;
  const scale = targetW / w;
  const targetH = Math.round(h * scale);

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgCanvas, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // 1. Échantillonner le fond (Background Color Sampling) depuis les 4 bords de l'image
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  const sampleBorder = 8; // bande de 8px

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      if (x < sampleBorder || x >= targetW - sampleBorder || y < sampleBorder || y >= targetH - sampleBorder) {
        const idx = (y * targetW + x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        bgCount++;
      }
    }
  }

  bgR /= bgCount;
  bgG /= bgCount;
  bgB /= bgCount;

  // 2. Calculer le masque de premier plan (Foreground Mask) basé sur la distance de couleur
  // + Gradient Sobel pour capturer les bordures
  const mask = new Uint8Array(targetW * targetH);
  const colorDistThreshold = 28;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const idx = (y * targetW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const dr = r - bgR;
      const dg = g - bgG;
      const db = b - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      // Détecter aussi les bordures jaunes typiques Pokémon (Hue ~ 45-60)
      const isYellowBorder = r > 150 && g > 130 && b < 100 && (r - b) > 50;

      if (dist >= colorDistThreshold || isYellowBorder) {
        mask[y * targetW + x] = 1;
      }
    }
  }

  // 3. Morphological Close (Dilation 5x5 + Erosion 5x5) pour combler l'illustration intérieure
  const dilated = new Uint8Array(targetW * targetH);
  const kernelSize = 3;

  for (let y = kernelSize; y < targetH - kernelSize; y++) {
    for (let x = kernelSize; x < targetW - kernelSize; x++) {
      let maxVal = 0;
      for (let dy = -kernelSize; dy <= kernelSize; dy++) {
        for (let dx = -kernelSize; dx <= kernelSize; dx++) {
          if (mask[(y + dy) * targetW + (x + dx)] === 1) {
            maxVal = 1;
            break;
          }
        }
        if (maxVal === 1) break;
      }
      dilated[y * targetW + x] = maxVal;
    }
  }

  // 4. Trouver la composante connexe principale (le rectangle de la carte)
  // Recherche des points extrêmes de la masse connectée centrale
  const cx = Math.round(targetW / 2);
  const cy = Math.round(targetH / 2);

  // Ray-march depuis le centre vers les 4 directions et en diagonale
  const rayAngles = 36;
  const perimeterPoints = [];

  for (let i = 0; i < rayAngles; i++) {
    const angle = (i * 2 * Math.PI) / rayAngles;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let maxR = Math.max(targetW, targetH);
    let lastInX = cx, lastInY = cy;

    for (let r = 0; r < maxR; r += 2) {
      const px = Math.round(cx + cosA * r);
      const py = Math.round(cy + sinA * r);

      if (px < 4 || px >= targetW - 4 || py < 4 || py >= targetH - 4) {
        perimeterPoints.push({ x: lastInX / targetW, y: lastInY / targetH });
        break;
      }

      if (dilated[py * targetW + px] === 1) {
        lastInX = px;
        lastInY = py;
      } else {
        // Frontière atteinte
        perimeterPoints.push({ x: px / targetW, y: py / targetH });
        break;
      }
    }
  }

  if (perimeterPoints.length < 12) return null;

  // 5. Calcul de l'enveloppe convexe (Convex Hull) des points de frontière
  const hull = getConvexHull(perimeterPoints);
  if (!hull || hull.length < 4) return null;

  // 6. Approximation en quadrilatère (4 coins)
  const quad = approximateToQuad(hull);
  if (!quad || quad.length !== 4) return null;

  const sortedCorners = sortCornersClockwise(quad);
  const area = calculateQuadArea(sortedCorners);
  const ratio = calculateQuadAspectRatio(sortedCorners);

  return {
    corners: sortedCorners,
    ratio: Number(ratio.toFixed(3)),
    areaPercent: Math.round(area * 100),
    confidence: Math.round((1 - Math.abs(ratio - 0.716)) * 100)
  };
}

// Algorithme de Graham Scan pour l'enveloppe convexe
function getConvexHull(points) {
  if (points.length < 3) return points;

  // Trouver le point le plus bas (puis le plus à gauche)
  let p0 = points[0];
  for (const p of points) {
    if (p.y > p0.y || (p.y === p0.y && p.x < p0.x)) {
      p0 = p;
    }
  }

  // Trier les points par angle polaire avec p0
  const sorted = points
    .filter(p => p !== p0)
    .sort((a, b) => {
      const angleA = Math.atan2(a.y - p0.y, a.x - p0.x);
      const angleB = Math.atan2(b.y - p0.y, b.x - p0.x);
      return angleA - angleB;
    });

  const stack = [p0, sorted[0], sorted[1]];

  for (let i = 2; i < sorted.length; i++) {
    let top = stack.length - 1;
    while (stack.length >= 2 && ccw(stack[top - 1], stack[top], sorted[i]) <= 0) {
      stack.pop();
      top--;
    }
    stack.push(sorted[i]);
  }

  return stack;
}

function ccw(p1, p2, p3) {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
}

// Réduit l'enveloppe convexe aux 4 sommets les plus dominants (Quadrilatère)
function approximateToQuad(hull) {
  if (hull.length === 4) return hull;
  if (hull.length < 4) return null;

  // Trouver les 4 points extrêmes selon les directions (TL, TR, BR, BL)
  let bestTL = hull[0], minTL = hull[0].x + hull[0].y;
  let bestTR = hull[0], maxTR = -hull[0].x + hull[0].y; // -x + y -> x grand, y petit => x - y max
  let bestBR = hull[0], maxBR = hull[0].x + hull[0].y;
  let bestBL = hull[0], maxBL = hull[0].x - hull[0].y; // x petit, y grand => y - x max

  for (const p of hull) {
    // Top-Left: x + y minimal
    if (p.x + p.y < minTL) {
      minTL = p.x + p.y;
      bestTL = p;
    }
    // Top-Right: x - y maximal
    if (p.x - p.y > (bestTR.x - bestTR.y)) {
      bestTR = p;
    }
    // Bottom-Right: x + y maximal
    if (p.x + p.y > maxBR) {
      maxBR = p.x + p.y;
      bestBR = p;
    }
    // Bottom-Left: y - x maximal
    if (p.y - p.x > (bestBL.y - bestBL.x)) {
      bestBL = p;
    }
  }

  return [bestTL, bestTR, bestBR, bestBL];
}

function sortCornersClockwise(points) {
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;

  const sortedByY = [...points].sort((a, b) => a.y - b.y);
  const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomTwo = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);

  return [topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0]];
}

function calculateQuadArea(pts) {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function calculateQuadAspectRatio(pts) {
  const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const topW = dist(pts[0], pts[1]);
  const botW = dist(pts[3], pts[2]);
  const leftH = dist(pts[0], pts[3]);
  const rightH = dist(pts[1], pts[2]);
  const avgW = (topW + botW) / 2;
  const avgH = (leftH + rightH) / 2;
  return avgH > 0 ? avgW / avgH : 0;
}

async function runBenchmark() {
  const files = fs.readdirSync(uploadedDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  console.log(`Testing Advanced Color & Morphological Segmentation on ${files.length} photos...`);

  let countSuccess = 0;

  for (const f of files) {
    const fullPath = path.join(uploadedDir, f);
    const img = await loadImage(fullPath);
    const res = detectCardAdvanced(img);

    if (res) {
      const isGoodRatio = res.ratio >= 0.58 && res.ratio <= 0.88;
      if (isGoodRatio) countSuccess++;
      console.log(`[${f}] -> Ratio: ${res.ratio} (Area: ${res.areaPercent}%, Conf: ${res.confidence}%) | Good: ${isGoodRatio ? 'YES' : 'NO'}`);
    } else {
      console.log(`[${f}] -> FAILED TO DETECT`);
    }
  }

  console.log(`\nResult: ${countSuccess} / ${files.length} (${Math.round((countSuccess / files.length) * 100)}%) valid Pokémon card contours!`);
}

runBenchmark();
