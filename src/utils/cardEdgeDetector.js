/**
 * CardEdgeDetector - Moteur haute performance de détection des bords de cartes Pokémon.
 * Spécialement optimisé pour mobile et flux vidéo temps réel (15 - 60 FPS).
 */

// Format officiel d'une carte Pokémon : 63mm x 88mm => ratio 1 : 1.3968 (largeur/hauteur = 0.7159)
export const CARD_RATIO = 63 / 88; // ~0.7159
export const CARD_ASPECT_TOLERANCE = 0.35; // Tolérance d'inclinaison/perspective (0.50 - 0.95)

/**
 * Trie 4 points pour obtenir toujours l'ordre canonique :
 * 0: Haut-Gauche (TL)
 * 1: Haut-Droit  (TR)
 * 2: Bas-Droit   (BR)
 * 3: Bas-Gauche  (BL)
 */
export function sortCornersClockwise(points) {
  if (!points || points.length !== 4) return points;

  // Calcul du centre de gravité
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;

  // Séparation en points supérieurs (Y < cy) et inférieurs (Y >= cy)
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
 * Vérifie si un quadrilatère est strictement convexe (pas d'angles rentrants ou de papillon)
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
 * Calcule l'aire d'un quadrilatère (Formule de Shoelace)
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
 * Calcule le ratio de forme moyen d'un quadrilatère (largeur moyenne / hauteur moyenne)
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

/**
 * Détecteur de Bords Principal (Pure JavaScript / Canvas 2D)
 * Balaye l'image de l'extérieur vers l'intérieur (Outside-In) pour détecter
 * le premier saut de couleur/gradient correspondant aux bordures de la carte Pokémon.
 */
export function detectCardCornersPureJS(sourceCanvas, options = {}) {
  const {
    sensitivity = 38, // Seuil de détection de contour (plus bas = plus sensible)
    rayCount = 48,    // Nombre de rayons de balayage
    debug = false     // Si true, dessine le masque de détection
  } = options;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (!w || !h) return null;

  // Création du canvas de travail basse résolution optimisé (ex: largeur ~400px)
  const scale = Math.min(1.0, 400 / w);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);

  const workCanvas = document.createElement('canvas');
  workCanvas.width = sw;
  workCanvas.height = sh;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0, sw, sh);

  const imgData = ctx.getImageData(0, 0, sw, sh);
  const data = imgData.data;

  // Calcul du gradient de couleur euclidien
  const colorDist = (idx1, idx2) => {
    const dr = data[idx1] - data[idx2];
    const dg = data[idx1 + 1] - data[idx2 + 1];
    const db = data[idx1 + 2] - data[idx2 + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const cx = sw / 2;
  const cy = sh / 2;

  const edgePoints = [];
  const debugPoints = [];

  // Balayage radial de la périphérie vers le centre
  for (let i = 0; i < rayCount; i++) {
    const angle = (i * 2 * Math.PI) / rayCount;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Point de départ sur le bord du cadre
    let rMax = Math.max(sw, sh);
    let startX = cx + cosA * rMax;
    let startY = cy + sinA * rMax;

    // Clamper aux dimensions du canvas
    startX = Math.max(2, Math.min(sw - 3, startX));
    startY = Math.max(2, Math.min(sh - 3, startY));

    // Distance jusqu'au centre
    const distToCenter = Math.hypot(startX - cx, startY - cy);
    const stepCount = Math.floor(distToCenter);
    const stepX = (cx - startX) / (stepCount || 1);
    const stepY = (cy - startY) / (stepCount || 1);

    let curX = startX;
    let curY = startY;
    let hitFound = false;

    // Ray-marching vers le centre
    for (let s = 0; s < stepCount - 15; s++) {
      curX += stepX;
      curY += stepY;

      const px = Math.floor(curX);
      const py = Math.floor(curY);
      if (px < 3 || px >= sw - 3 || py < 3 || py >= sh - 3) continue;

      const idx = (py * sw + px) * 4;
      const nextIdx = ((py + Math.round(stepY)) * sw + (px + Math.round(stepX))) * 4;

      const grad = colorDist(idx, nextIdx);

      if (grad >= sensitivity) {
        // Point de contour extérieur détecté
        edgePoints.push({
          x: curX / sw,
          y: curY / sh,
          angle: angle,
          side: getSideFromAngle(angle)
        });
        debugPoints.push({ x: curX, y: curY });
        hitFound = true;
        break; // Arrêter au premier bord extérieur rencontré !
      }
    }
  }

  if (edgePoints.length < 12) {
    return null; // Pas assez de points extérieurs trouvés
  }

  // Grouper les points par côté (Haut, Bas, Gauche, Droite)
  const topPts = edgePoints.filter(p => p.side === 'top');
  const bottomPts = edgePoints.filter(p => p.side === 'bottom');
  const leftPts = edgePoints.filter(p => p.side === 'left');
  const rightPts = edgePoints.filter(p => p.side === 'right');

  if (topPts.length < 2 || bottomPts.length < 2 || leftPts.length < 2 || rightPts.length < 2) {
    return null;
  }

  // Ajustement linéaire robuste (Ligne médiane / RANSAC simplifié)
  const topLine = fitRobustLine(topPts, 'horizontal');
  const bottomLine = fitRobustLine(bottomPts, 'horizontal');
  const leftLine = fitRobustLine(leftPts, 'vertical');
  const rightLine = fitRobustLine(rightPts, 'vertical');

  if (!topLine || !bottomLine || !leftLine || !rightLine) {
    return null;
  }

  // Intersection des 4 lignes pour former les 4 coins
  const rawCorners = [
    intersectLines(topLine, leftLine),     // TL
    intersectLines(topLine, rightLine),    // TR
    intersectLines(bottomLine, rightLine), // BR
    intersectLines(bottomLine, leftLine)   // BL
  ];

  // Vérifier validité
  if (rawCorners.some(pt => !pt || isNaN(pt.x) || isNaN(pt.y))) {
    return null;
  }

  const corners = sortCornersClockwise(rawCorners);

  // Validation géométrique
  if (!isStrictConvexQuad(corners)) return null;

  const area = calculateQuadArea(corners);
  if (area < 0.08 || area > 0.95) return null; // Entre 8% et 95% de l'écran

  const ratio = calculateQuadAspectRatio(corners);
  // Ratio normal: ~0.71 (portrait) ou ~1.40 (paysage)
  const isPlausibleRatio = (ratio >= 0.45 && ratio <= 1.05) || (ratio >= 1.15 && ratio <= 1.95);
  if (!isPlausibleRatio) return null;

  // Calcul du score de confiance (0 à 100%)
  const expectedDiff = Math.abs(ratio - CARD_RATIO);
  const confidence = Math.max(30, Math.min(99, Math.round((1 - expectedDiff) * 100)));

  return {
    corners,
    confidence,
    aspectRatio: ratio,
    areaPercent: Math.round(area * 100),
    isLandscape: ratio > 1.0,
    debugPoints: debug ? debugPoints : null
  };
}

/**
 * Détermine le côté (top, bottom, left, right) selon l'angle radial
 */
function getSideFromAngle(angle) {
  // Normaliser angle entre -PI et +PI
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;

  const deg = (angle * 180) / Math.PI;
  if (deg >= -45 && deg < 45) return 'right';
  if (deg >= 45 && deg < 135) return 'bottom';
  if (deg >= -135 && deg < -45) return 'top';
  return 'left';
}

/**
 * Ajuste une ligne robuste (y = ax + b ou x = ay + b) avec filtrage des anomalies
 */
function fitRobustLine(points, orientation) {
  if (!points || points.length < 2) return null;

  if (orientation === 'horizontal') {
    // y = a * x + b
    const medianY = points.map(p => p.y).sort((a, b) => a - b)[Math.floor(points.length / 2)];
    const validPts = points.filter(p => Math.abs(p.y - medianY) < 0.12);
    if (validPts.length < 2) return { a: 0, b: medianY, orientation: 'horizontal' };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = validPts.length;
    for (const p of validPts) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-6) return { a: 0, b: medianY, orientation: 'horizontal' };
    const a = (n * sumXY - sumX * sumY) / denom;
    const b = (sumY - a * sumX) / n;
    return { a, b, orientation: 'horizontal' };
  } else {
    // x = a * y + b
    const medianX = points.map(p => p.x).sort((a, b) => a - b)[Math.floor(points.length / 2)];
    const validPts = points.filter(p => Math.abs(p.x - medianX) < 0.12);
    if (validPts.length < 2) return { a: 0, b: medianX, orientation: 'vertical' };

    let sumX = 0, sumY = 0, sumXY = 0, sumY2 = 0;
    const n = validPts.length;
    for (const p of validPts) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumY2 += p.y * p.y;
    }
    const denom = n * sumY2 - sumY * sumY;
    if (Math.abs(denom) < 1e-6) return { a: 0, b: medianX, orientation: 'vertical' };
    const a = (n * sumXY - sumX * sumY) / denom;
    const b = (sumX - a * sumY) / n;
    return { a, b, orientation: 'vertical' };
  }
}

/**
 * Calcule le point d'intersection entre 2 droites
 */
function intersectLines(hLine, vLine) {
  if (hLine.orientation === 'horizontal' && vLine.orientation === 'vertical') {
    // y = hLine.a * x + hLine.b
    // x = vLine.a * y + vLine.b
    // => y = hLine.a * (vLine.a * y + vLine.b) + hLine.b
    // => y * (1 - hLine.a * vLine.a) = hLine.a * vLine.b + hLine.b
    const denom = 1 - hLine.a * vLine.a;
    if (Math.abs(denom) < 1e-5) return null;
    const y = (hLine.a * vLine.b + hLine.b) / denom;
    const x = vLine.a * y + vLine.b;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }
  return null;
}

/**
 * Détection par OpenCV.js (si disponible sur window.cv)
 */
export function detectCardCornersOpenCV(sourceCanvas, options = {}) {
  if (typeof window === 'undefined' || !window.cv || !window.cv.Mat) {
    return null;
  }

  const cv = window.cv;
  const { minArea = 0.08, maxArea = 0.95 } = options;

  let src = null, gray = null, blur = null, edges = null, contours = null, hierarchy = null, M = null;

  try {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const scale = Math.min(1.0, 480 / w);
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = sw;
    tmpCanvas.height = sh;
    const ctx = tmpCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceCanvas, 0, 0, sw, sh);

    src = cv.imread(tmpCanvas);
    gray = new cv.Mat();
    blur = new cv.Mat();
    edges = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 40, 120);

    // Morphological closing
    M = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, M);

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const totalArea = sw * sh;
    let bestQuad = null;
    let maxFoundArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const areaFraction = area / totalArea;

      if (areaFraction >= minArea && areaFraction <= maxArea) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.03 * peri, true);

        if (approx.rows === 4 && area > maxFoundArea) {
          const rawPts = [];
          for (let r = 0; r < 4; r++) {
            rawPts.push({
              x: approx.data32S[r * 2] / sw,
              y: approx.data32S[r * 2 + 1] / sh
            });
          }

          const sorted = sortCornersClockwise(rawPts);
          if (isStrictConvexQuad(sorted)) {
            const ratio = calculateQuadAspectRatio(sorted);
            if ((ratio >= 0.45 && ratio <= 1.05) || (ratio >= 1.15 && ratio <= 1.95)) {
              maxFoundArea = area;
              bestQuad = sorted;
            }
          }
        }
        approx.delete();
      }
      cnt.delete();
    }

    if (bestQuad) {
      const ratio = calculateQuadAspectRatio(bestQuad);
      const expectedDiff = Math.abs(ratio - CARD_RATIO);
      const confidence = Math.max(40, Math.min(99, Math.round((1 - expectedDiff) * 100)));

      return {
        corners: bestQuad,
        confidence,
        aspectRatio: ratio,
        areaPercent: Math.round((maxFoundArea / totalArea) * 100),
        isLandscape: ratio > 1.0,
        engine: 'OpenCV.js'
      };
    }
  } catch (e) {
    // Fallback silencieux vers JS
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (blur) blur.delete();
    if (edges) edges.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (M) M.delete();
  }

  return null;
}

/**
 * Détecteur Hybride : Essaye OpenCV.js si prêt, sinon utilise Pure JS immédiatement.
 */
export function detectCardCornersHybrid(sourceCanvas, options = {}) {
  // 1. Essai OpenCV si disponible
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat && options.preferOpenCV) {
    const cvResult = detectCardCornersOpenCV(sourceCanvas, options);
    if (cvResult) return cvResult;
  }

  // 2. Moteur Pure JS (Zero latence, autonome)
  const jsResult = detectCardCornersPureJS(sourceCanvas, options);
  if (jsResult) {
    jsResult.engine = 'PureJS-OutsideIn';
    return jsResult;
  }

  return null;
}

/**
 * Lissage Temporel Exponentiel (EMA) pour éliminer les micro-tremblements vidéo
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
      if (this.lostFrames > 8) {
        this.prevCorners = null; // Réinitialiser après 8 frames perdues
      }
      return this.prevCorners;
    }

    this.lostFrames = 0;

    if (!this.prevCorners) {
      this.prevCorners = newCorners.map(p => ({ ...p }));
      return this.prevCorners;
    }

    // Distance de déplacement moyenne
    let maxDist = 0;
    for (let i = 0; i < 4; i++) {
      const d = Math.hypot(newCorners[i].x - this.prevCorners[i].x, newCorners[i].y - this.prevCorners[i].y);
      if (d > maxDist) maxDist = d;
    }

    // Si le mouvement est brusque (> 15% de l'écran), adapter immédiatement (pas d'inertie)
    const dynamicAlpha = maxDist > 0.15 ? 0.85 : this.alpha;

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
 * Extrait et redresse la carte sous forme de rectangle plat officiel (630 x 880 px)
 * via transformation projective (Bilinear / Homography mapping).
 */
export function extractCardWarped(sourceCanvas, corners, targetWidth = 630, targetHeight = 880) {
  if (!sourceCanvas || !corners || corners.length !== 4) return null;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  // Pixels absolus des 4 coins
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

  // Projection bilinéaire inverse
  for (let y = 0; y < targetHeight; y++) {
    const v = y / (targetHeight - 1);
    for (let x = 0; x < targetWidth; x++) {
      const u = x / (targetWidth - 1);

      // Interpolation 2D sur le quadrilatère
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
