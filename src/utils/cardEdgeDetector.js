/**
 * CardEdgeDetector v2.0 - Moteur de Détection Haute Précision des Bords de Cartes Pokémon.
 * Spécialement optimisé pour smartphone (30+ FPS) avec rejet total des bruits de fond
 * (trous de support 3D, cartes en arrière-plan, textures de table).
 */

export const CARD_RATIO = 63 / 88; // ~0.7159 (Largeur / Hauteur officielle Pokémon)
export const CARD_ASPECT_MIN = 0.55;
export const CARD_ASPECT_MAX = 0.90;

/**
 * Trie 4 points pour obtenir toujours l'ordre canonique :
 * 0: Haut-Gauche (TL)
 * 1: Haut-Droit  (TR)
 * 2: Bas-Droit   (BR)
 * 3: Bas-Gauche  (BL)
 */
export function sortCornersClockwise(points) {
  if (!points || points.length !== 4) return points;

  // Calcul du barycentre
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;

  const sortedByY = [...points].sort((a, b) => a.y - b.y);
  const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x); // [TL, TR]
  const bottomTwo = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x); // [BL, BR]

  return [
    topTwo[0],    // Top-Left (TL)
    topTwo[1],    // Top-Right (TR)
    bottomTwo[1], // Bottom-Right (BR)
    bottomTwo[0]  // Bottom-Left (BL)
  ];
}

/**
 * Vérifie si un quadrilatère est strictement convexe
 */
export function isStrictConvexQuad(pts) {
  if (!pts || pts.length !== 4) return false;

  const crossProducts = [];
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    const p3 = pts[(i + 2) % 4];

    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x;
    const dy2 = p3.y - p2.y;

    crossProducts.push(dx1 * dy2 - dy1 * dx2);
  }

  const allPositive = crossProducts.every(cp => cp > 1e-5);
  const allNegative = crossProducts.every(cp => cp < -1e-5);
  return allPositive || allNegative;
}

/**
 * Calcule l'aire d'un quadrilatère (Shoelace formula)
 */
export function calculateQuadArea(pts) {
  if (!pts || pts.length !== 4) return 0;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calcule le ratio de forme moyen (largeur / hauteur)
 */
export function calculateQuadAspectRatio(pts) {
  if (!pts || pts.length !== 4) return 0;
  const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

  const topW = dist(pts[0], pts[1]);
  const botW = dist(pts[3], pts[2]);
  const leftH = dist(pts[0], pts[3]);
  const rightH = dist(pts[1], pts[2]);

  const avgW = (topW + botW) / 2;
  const avgH = (leftH + rightH) / 2;

  if (avgH === 0) return 0;
  return avgW / avgH;
}

// ----------------------------------------------------------------------------------
// MOTEUR 1 : DÉTECTEUR OPENCV.JS AVANCÉ (CANNY + MORPHOLOGIE + POLYGON APPROX)
// ----------------------------------------------------------------------------------
export function detectCardOpenCV(sourceCanvas, options = {}) {
  if (typeof window === 'undefined' || !window.cv || !window.cv.Mat) {
    return null;
  }

  const cv = window.cv;
  const {
    cannyThresh1 = 35,
    cannyThresh2 = 110,
    minArea = 0.12,
    maxArea = 0.85
  } = options;

  let src = null, gray = null, blur = null, edges = null, morphed = null, contours = null, hierarchy = null, kernel = null;

  try {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    // Downsample optimisé pour 30+ FPS sur mobile
    const targetW = 360;
    const scale = targetW / w;
    const targetH = Math.round(h * scale);

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = targetW;
    tmpCanvas.height = targetH;
    const ctx = tmpCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

    src = cv.imread(tmpCanvas);
    gray = new cv.Mat();
    blur = new cv.Mat();
    edges = new cv.Mat();
    morphed = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();

    // 1. Niveaux de gris + Flou Gaussien pour éliminer le bruit de texture
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

    // 2. Détection de contours de Canny
    cv.Canny(blur, edges, cannyThresh1, cannyThresh2);

    // 3. Fermeture morphologique pour lier les segments de bordures discontinus
    kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.morphologyEx(edges, morphed, cv.MORPH_CLOSE, kernel);

    // 4. Recherche de contours
    cv.findContours(morphed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const totalArea = targetW * targetH;
    let bestCandidate = null;
    let bestScore = -1;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const areaFrac = area / totalArea;

      if (areaFrac >= minArea && areaFrac <= maxArea) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();

        // Approximation polygonale
        cv.approxPolyDP(cnt, approx, 0.025 * peri, true);

        if (approx.rows === 4) {
          const rawPts = [];
          for (let r = 0; r < 4; r++) {
            rawPts.push({
              x: approx.data32S[r * 2] / targetW,
              y: approx.data32S[r * 2 + 1] / targetH
            });
          }

          const sorted = sortCornersClockwise(rawPts);
          if (isStrictConvexQuad(sorted)) {
            const ratio = calculateQuadAspectRatio(sorted);
            const isPortrait = ratio >= CARD_ASPECT_MIN && ratio <= CARD_ASPECT_MAX;
            const isLandscape = ratio >= 1.15 && ratio <= 1.80;

            if (isPortrait || isLandscape) {
              // Score basé sur la correspondance au ratio Pokémon + surface centrée
              const ratioDiff = Math.abs(ratio - (isPortrait ? CARD_RATIO : 1 / CARD_RATIO));
              const score = (1 - ratioDiff * 1.5) * 60 + areaFrac * 40;

              if (score > bestScore) {
                bestScore = score;
                bestCandidate = {
                  corners: sorted,
                  aspectRatio: ratio,
                  areaPercent: Math.round(areaFrac * 100),
                  isLandscape,
                  confidence: Math.max(50, Math.min(99, Math.round(score))),
                  engine: 'OpenCV.js'
                };
              }
            }
          }
        }
        approx.delete();
      }
      cnt.delete();
    }

    return bestCandidate;
  } catch (err) {
    console.warn('Erreur OpenCV detectCard:', err);
    return null;
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (blur) blur.delete();
    if (edges) edges.delete();
    if (morphed) morphed.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (kernel) kernel.delete();
  }
}

// ----------------------------------------------------------------------------------
// MOTEUR 2 : DÉTECTEUR NATIVE JAVASCRIPT ULTRA-RAPIDE PAR BALAYAGE DIRECTIONNEL (PROFILE SNAPPING)
// ----------------------------------------------------------------------------------
/**
 * Scanne les 4 bordures autour de la zone centrale attendue.
 * Idéal pour cartes posées sur support 3D ou table : ne se laisse jamais piéger par les trous extérieurs !
 */
export function detectCardNativeSnap(sourceCanvas, options = {}) {
  const {
    sensitivity = 35,
    centerBox = { x: 0.18, y: 0.15, width: 0.64, height: 0.70 } // Boîte de recherche nominale
  } = options;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (!w || !h) return null;

  const targetW = 320;
  const scale = targetW / w;
  const targetH = Math.round(h * scale);

  const workCanvas = document.createElement('canvas');
  workCanvas.width = targetW;
  workCanvas.height = targetH;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // Gradient euclidien entre 2 pixels
  const getGrad = (x1, y1, x2, y2) => {
    if (x1 < 0 || x1 >= targetW || y1 < 0 || y1 >= targetH) return 0;
    if (x2 < 0 || x2 >= targetW || y2 < 0 || y2 >= targetH) return 0;
    const i1 = (y1 * targetW + x1) * 4;
    const i2 = (y2 * targetW + x2) * 4;
    const dr = data[i1] - data[i2];
    const dg = data[i1 + 1] - data[i2 + 1];
    const db = data[i1 + 2] - data[i2 + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  // Coordonnées approximatives attendues
  const leftX = Math.round(centerBox.x * targetW);
  const rightX = Math.round((centerBox.x + centerBox.width) * targetW);
  const topY = Math.round(centerBox.y * targetH);
  const bottomY = Math.round((centerBox.y + centerBox.height) * targetH);

  const searchRangeX = Math.round(targetW * 0.18); // +/- 18%
  const searchRangeY = Math.round(targetH * 0.18); // +/- 18%

  // 1. Détection du bord GAUCHE (balayage horizontal)
  const leftPoints = [];
  for (let y = topY + 15; y <= bottomY - 15; y += 6) {
    let maxGrad = 0, bestX = leftX;
    for (let dx = -searchRangeX; dx <= searchRangeX; dx += 2) {
      const x = leftX + dx;
      const g = getGrad(x - 2, y, x + 2, y);
      if (g > maxGrad && g >= sensitivity) {
        maxGrad = g;
        bestX = x;
      }
    }
    if (maxGrad >= sensitivity) {
      leftPoints.push({ x: bestX / targetW, y: y / targetH });
    }
  }

  // 2. Détection du bord DROIT (balayage horizontal)
  const rightPoints = [];
  for (let y = topY + 15; y <= bottomY - 15; y += 6) {
    let maxGrad = 0, bestX = rightX;
    for (let dx = -searchRangeX; dx <= searchRangeX; dx += 2) {
      const x = rightX + dx;
      const g = getGrad(x - 2, y, x + 2, y);
      if (g > maxGrad && g >= sensitivity) {
        maxGrad = g;
        bestX = x;
      }
    }
    if (maxGrad >= sensitivity) {
      rightPoints.push({ x: bestX / targetW, y: y / targetH });
    }
  }

  // 3. Détection du bord HAUT (balayage vertical)
  const topPoints = [];
  for (let x = leftX + 15; x <= rightX - 15; x += 6) {
    let maxGrad = 0, bestY = topY;
    for (let dy = -searchRangeY; dy <= searchRangeY; dy += 2) {
      const y = topY + dy;
      const g = getGrad(x, y - 2, x, y + 2);
      if (g > maxGrad && g >= sensitivity) {
        maxGrad = g;
        bestY = y;
      }
    }
    if (maxGrad >= sensitivity) {
      topPoints.push({ x: x / targetW, y: bestY / targetH });
    }
  }

  // 4. Détection du bord BAS (balayage vertical)
  const bottomPoints = [];
  for (let x = leftX + 15; x <= rightX - 15; x += 6) {
    let maxGrad = 0, bestY = bottomY;
    for (let dy = -searchRangeY; dy <= searchRangeY; dy += 2) {
      const y = bottomY + dy;
      const g = getGrad(x, y - 2, x, y + 2);
      if (g > maxGrad && g >= sensitivity) {
        maxGrad = g;
        bestY = y;
      }
    }
    if (maxGrad >= sensitivity) {
      bottomPoints.push({ x: x / targetW, y: bestY / targetH });
    }
  }

  if (leftPoints.length < 3 || rightPoints.length < 3 || topPoints.length < 3 || bottomPoints.length < 3) {
    return null;
  }

  // Ajustement de lignes robustes
  const topLine = fitLine(topPoints, 'horizontal');
  const bottomLine = fitLine(bottomPoints, 'horizontal');
  const leftLine = fitLine(leftPoints, 'vertical');
  const rightLine = fitLine(rightPoints, 'vertical');

  if (!topLine || !bottomLine || !leftLine || !rightLine) return null;

  const rawCorners = [
    intersectLines(topLine, leftLine),     // TL
    intersectLines(topLine, rightLine),    // TR
    intersectLines(bottomLine, rightLine), // BR
    intersectLines(bottomLine, leftLine)   // BL
  ];

  if (rawCorners.some(pt => !pt || isNaN(pt.x) || isNaN(pt.y))) return null;

  const corners = sortCornersClockwise(rawCorners);
  if (!isStrictConvexQuad(corners)) return null;

  const area = calculateQuadArea(corners);
  if (area < 0.10 || area > 0.88) return null;

  const ratio = calculateQuadAspectRatio(corners);
  const expectedDiff = Math.abs(ratio - CARD_RATIO);
  const confidence = Math.max(40, Math.min(99, Math.round((1 - expectedDiff * 1.6) * 100)));

  return {
    corners,
    confidence,
    aspectRatio: ratio,
    areaPercent: Math.round(area * 100),
    isLandscape: ratio > 1.0,
    engine: 'Native-ProfileSnap'
  };
}

function fitLine(points, orientation) {
  if (!points || points.length < 2) return null;
  const n = points.length;

  if (orientation === 'horizontal') {
    // y = a * x + b
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-6) return { a: 0, b: sumY / n, orientation: 'horizontal' };
    const a = (n * sumXY - sumX * sumY) / denom;
    const b = (sumY - a * sumX) / n;
    return { a, b, orientation: 'horizontal' };
  } else {
    // x = a * y + b
    let sumX = 0, sumY = 0, sumXY = 0, sumY2 = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumY2 += p.y * p.y;
    }
    const denom = n * sumY2 - sumY * sumY;
    if (Math.abs(denom) < 1e-6) return { a: 0, b: sumX / n, orientation: 'vertical' };
    const a = (n * sumXY - sumX * sumY) / denom;
    const b = (sumX - a * sumY) / n;
    return { a, b, orientation: 'vertical' };
  }
}

function intersectLines(hLine, vLine) {
  if (hLine.orientation === 'horizontal' && vLine.orientation === 'vertical') {
    const denom = 1 - hLine.a * vLine.a;
    if (Math.abs(denom) < 1e-5) return null;
    const y = (hLine.a * vLine.b + hLine.b) / denom;
    const x = vLine.a * y + vLine.b;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }
  return null;
}

/**
 * Détecteur Hybride Intelligent :
 * 1. Teste OpenCV (Contour global)
 * 2. Si non concluant, teste le Profile Snap (Bords locaux ultra-précis)
 */
export function detectCardCornersHybrid(sourceCanvas, options = {}) {
  // 1. Essai OpenCV
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
    const cvRes = detectCardOpenCV(sourceCanvas, options);
    if (cvRes && cvRes.confidence >= 60) return cvRes;
  }

  // 2. Moteur Snap Natif (rapide, sans bruit)
  const snapRes = detectCardNativeSnap(sourceCanvas, options);
  if (snapRes) return snapRes;

  return null;
}

/**
 * Lissage Temporel Exponentiel (EMA)
 */
export class TemporalCornerSmoother {
  constructor(smoothingFactor = 0.35) {
    this.alpha = smoothingFactor;
    this.prevCorners = null;
    this.lostFrames = 0;
  }

  update(newCorners) {
    if (!newCorners) {
      this.lostFrames++;
      if (this.lostFrames > 6) {
        this.prevCorners = null;
      }
      return this.prevCorners;
    }

    this.lostFrames = 0;

    if (!this.prevCorners) {
      this.prevCorners = newCorners.map(p => ({ ...p }));
      return this.prevCorners;
    }

    let maxDist = 0;
    for (let i = 0; i < 4; i++) {
      const d = Math.hypot(newCorners[i].x - this.prevCorners[i].x, newCorners[i].y - this.prevCorners[i].y);
      if (d > maxDist) maxDist = d;
    }

    const dynamicAlpha = maxDist > 0.12 ? 0.85 : this.alpha;

    const smoothed = [];
    for (let i = 0; i < 4; i++) {
      smoothed.push({
        x: this.prevCorners[i].x * (1 - dynamicAlpha) + newCorners[i].x * dynamicAlpha,
        y: this.prevCorners[i].y * (1 - dynamicAlpha) + newCorners[i].y * dynamicAlpha
      });
    }

    this.prevCorners = smoothed;
    return smoothed;
  }

  reset() {
    this.prevCorners = null;
    this.lostFrames = 0;
  }
}

/**
 * Extrait et redresse la carte à plat (630 x 880 px)
 */
export function extractCardWarped(sourceCanvas, corners, targetWidth = 630, targetHeight = 880) {
  if (!sourceCanvas || !corners || corners.length !== 4) return null;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  const pTL = { x: corners[0].x * w, y: corners[0].y * h };
  const pTR = { x: corners[1].x * w, y: corners[1].y * h };
  const pBR = { x: corners[2].x * w, y: corners[2].y * h };
  const pBL = { x: corners[3].x * w, y: corners[3].y * h };

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext('2d');

  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
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

      const srcX = Math.round(topX * (1 - v) + botX * v);
      const srcY = Math.round(topY * (1 - v) + botY * v);

      const outIdx = (y * targetWidth + x) * 4;

      if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
        const srcIdx = (srcY * w + srcX) * 4;
        outData[outIdx] = srcData[srcIdx];
        outData[outIdx + 1] = srcData[srcIdx + 1];
        outData[outIdx + 2] = srcData[srcIdx + 2];
        outData[outIdx + 3] = 255;
      } else {
        outData[outIdx + 3] = 0;
      }
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}
