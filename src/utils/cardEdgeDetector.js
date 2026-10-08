/**
 * CardEdgeDetector - Moteur 100% Automatique & Tracker Stabilisé de Cartes Pokémon.
 */

export const POKEMON_RATIO = 63 / 88; // 0.7159

/**
 * Détecte automatiquement les 4 coins et bords extérieurs d'une carte Pokémon.
 */
export function autoDetectCardEdges(sourceCanvas, options = {}) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (!w || !h) return null;

  const targetW = 360;
  const scale = targetW / w;
  const targetH = Math.round(h * scale);

  const workCanvas = document.createElement('canvas');
  workCanvas.width = targetW;
  workCanvas.height = targetH;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // 1. Grayscale + Flou Gaussien
  const gray = new Uint8Array(targetW * targetH);
  for (let i = 0; i < targetW * targetH; i++) {
    const idx = i * 4;
    gray[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }

  const blurred = gaussianBlur5x5(gray, targetW, targetH);

  // 2. Gradient Sobel 2D
  const gradMag = new Float32Array(targetW * targetH);
  const gradDir = new Float32Array(targetW * targetH);
  computeSobel(blurred, targetW, targetH, gradMag, gradDir);

  // 3. Multi-Pass Canny Edge Search
  const thresholds = [
    { low: 25, high: 70 },
    { low: 40, high: 105 },
    { low: 55, high: 140 }
  ];

  let bestQuad = null;
  let bestScore = -1;

  for (const { low, high } of thresholds) {
    const edgeMap = cannyNonMaxSuppression(gradMag, gradDir, targetW, targetH, low, high);
    const closedEdges = morphologicalClose(edgeMap, targetW, targetH, 2);
    const contours = traceContours(closedEdges, targetW, targetH);

    for (const cnt of contours) {
      if (cnt.length < 20) continue;

      const area = polygonArea(cnt);
      const totalArea = targetW * targetH;
      const areaFrac = area / totalArea;

      if (areaFrac < 0.08 || areaFrac > 0.90) continue;

      for (const epsFrac of [0.015, 0.025, 0.035, 0.045, 0.06]) {
        const peri = polygonPerimeter(cnt);
        const approx = douglasPeucker(cnt, epsFrac * peri);

        if (approx.length === 4) {
          const sorted = sortCornersClockwise(approx);
          if (isStrictConvexQuad(sorted)) {
            const ratio = calculateQuadAspectRatio(sorted);
            const isPortrait = ratio >= 0.50 && ratio <= 0.95;
            const isLandscape = ratio >= 1.05 && ratio <= 1.95;

            if (isPortrait || isLandscape) {
              const targetRatio = isPortrait ? POKEMON_RATIO : 1 / POKEMON_RATIO;
              const ratioDiff = Math.abs(ratio - targetRatio);
              const anglePenalty = calculateOrthogonalityPenalty(sorted);
              const edgeEnergy = sampleEdgeEnergy(gradMag, targetW, targetH, sorted);

              const score = areaFrac * 35 + (1 - ratioDiff * 1.4) * 40 + edgeEnergy * 25 - anglePenalty * 15;

              if (score > bestScore) {
                bestScore = score;
                bestQuad = {
                  corners: sorted.map(p => ({ x: p.x / targetW, y: p.y / targetH })),
                  ratio: Number(ratio.toFixed(3)),
                  areaPercent: Math.round(areaFrac * 100),
                  score: Math.round(score),
                  isLandscape,
                  confidence: Math.max(50, Math.min(99, Math.round(score + 25)))
                };
              }
            }
          }
        }
      }
    }
  }

  // 4. Fallback automatique
  if (!bestQuad) {
    const obb = detectOrientedBoundingBox(gradMag, targetW, targetH);
    if (obb) bestQuad = obb;
  }

  return bestQuad;
}

// --------------------------------------------------------------------------------------
// TRACKER TEMPOREL STABILISATEUR (ANTI-JITTER & HYSTÉRÈSE)
// --------------------------------------------------------------------------------------
export class RobustCardTracker {
  constructor() {
    this.lockedQuad = null;
    this.consecutiveHits = 0;
    this.lostFrames = 0;
    this.state = 'SEARCHING';
  }

  update(rawDetection) {
    if (!rawDetection || !rawDetection.corners) {
      if (this.state === 'LOCKED') {
        this.lostFrames++;
        // Persistance pendant 8 frames (~300ms) pour éliminer les micro-coupures
        if (this.lostFrames <= 8) {
          return {
            corners: this.lockedQuad,
            isLocked: true,
            state: 'LOCKED',
            confidence: 85,
            ratio: POKEMON_RATIO
          };
        }
      }
      this.consecutiveHits = 0;
      this.state = 'SEARCHING';
      this.lockedQuad = null;
      return null;
    }

    const newCorners = rawDetection.corners;

    if (this.state === 'SEARCHING') {
      this.consecutiveHits++;
      if (this.consecutiveHits >= 2) {
        this.state = 'LOCKED';
        this.lockedQuad = newCorners.map(p => ({ ...p }));
        this.lostFrames = 0;
      }
      return {
        corners: newCorners,
        isLocked: this.state === 'LOCKED',
        state: this.state,
        confidence: rawDetection.confidence || 75,
        ratio: rawDetection.ratio || POKEMON_RATIO
      };
    }

    // En état LOCKED : association par distance minimale & filtrage anti-jitter
    this.lostFrames = 0;
    const matchedCorners = matchCornersByDistance(this.lockedQuad, newCorners);

    let avgDist = 0;
    for (let i = 0; i < 4; i++) {
      avgDist += Math.hypot(matchedCorners[i].x - this.lockedQuad[i].x, matchedCorners[i].y - this.lockedQuad[i].y);
    }
    avgDist /= 4;

    // Filtre adaptatif :
    // - Si mouvement minuscule (< 1.8% de l'écran) -> Verrouillage absolu (alpha = 0.04)
    // - Si mouvement modéré -> Suivi fluide (alpha = 0.25)
    // - Si grand déplacement (> 15%) -> Réalignement rapide (alpha = 0.75)
    let alpha = 0.25;
    if (avgDist < 0.018) {
      alpha = 0.04;
    } else if (avgDist > 0.15) {
      alpha = 0.75;
    }

    const smoothed = [];
    for (let i = 0; i < 4; i++) {
      smoothed.push({
        x: this.lockedQuad[i].x * (1 - alpha) + matchedCorners[i].x * alpha,
        y: this.lockedQuad[i].y * (1 - alpha) + matchedCorners[i].y * alpha
      });
    }

    this.lockedQuad = smoothed;

    return {
      corners: smoothed,
      isLocked: true,
      state: 'LOCKED',
      confidence: Math.max(80, rawDetection.confidence || 85),
      ratio: rawDetection.ratio || POKEMON_RATIO
    };
  }

  reset() {
    this.lockedQuad = null;
    this.consecutiveHits = 0;
    this.lostFrames = 0;
    this.state = 'SEARCHING';
  }
}

function matchCornersByDistance(prevQuad, newQuad) {
  if (!prevQuad || !newQuad || prevQuad.length !== 4 || newQuad.length !== 4) {
    return newQuad;
  }

  let bestPerm = newQuad;
  let minTotalDist = Infinity;

  for (let shift = 0; shift < 4; shift++) {
    const perm = [
      newQuad[shift % 4],
      newQuad[(shift + 1) % 4],
      newQuad[(shift + 2) % 4],
      newQuad[(shift + 3) % 4]
    ];

    let totalDist = 0;
    for (let i = 0; i < 4; i++) {
      totalDist += Math.hypot(perm[i].x - prevQuad[i].x, perm[i].y - prevQuad[i].y);
    }

    if (totalDist < minTotalDist) {
      minTotalDist = totalDist;
      bestPerm = perm;
    }
  }

  return bestPerm;
}

// Utilitaires de vision
function gaussianBlur5x5(src, w, h) {
  const dst = new Uint8Array(w * h);
  const kernel = [
    1, 4, 6, 4, 1,
    4, 16, 24, 16, 4,
    6, 24, 36, 24, 6,
    4, 16, 24, 16, 4,
    1, 4, 6, 4, 1
  ];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let sum = 0, kIdx = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          sum += src[(y + dy) * w + (x + dx)] * kernel[kIdx++];
        }
      }
      dst[y * w + x] = Math.round(sum / 256);
    }
  }
  return dst;
}

function computeSobel(src, w, h, gradMag, gradDir) {
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -src[(y - 1) * w + (x - 1)] + src[(y - 1) * w + (x + 1)] +
        -2 * src[y * w + (x - 1)]   + 2 * src[y * w + (x + 1)] +
        -src[(y + 1) * w + (x - 1)] + src[(y + 1) * w + (x + 1)];

      const gy =
        -src[(y - 1) * w + (x - 1)] - 2 * src[(y - 1) * w + x] - src[(y - 1) * w + (x + 1)] +
         src[(y + 1) * w + (x - 1)] + 2 * src[(y + 1) * w + x] + src[(y + 1) * w + (x + 1)];

      const idx = y * w + x;
      gradMag[idx] = Math.sqrt(gx * gx + gy * gy);
      gradDir[idx] = Math.atan2(gy, gx);
    }
  }
}

function cannyNonMaxSuppression(mag, dir, w, h, low, high) {
  const edges = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const m = mag[idx];
      if (m < low) continue;

      const angle = (dir[idx] * 180) / Math.PI;
      const normAngle = (angle < 0 ? angle + 180 : angle) % 180;

      let q = 0, r = 0;
      if ((normAngle >= 0 && normAngle < 22.5) || (normAngle >= 157.5 && normAngle <= 180)) {
        q = mag[y * w + (x + 1)];
        r = mag[y * w + (x - 1)];
      } else if (normAngle >= 22.5 && normAngle < 67.5) {
        q = mag[(y + 1) * w + (x - 1)];
        r = mag[(y - 1) * w + (x + 1)];
      } else if (normAngle >= 67.5 && normAngle < 112.5) {
        q = mag[(y + 1) * w + x];
        r = mag[(y - 1) * w + x];
      } else if (normAngle >= 112.5 && normAngle < 157.5) {
        q = mag[(y - 1) * w + (x - 1)];
        r = mag[(y + 1) * w + (x + 1)];
      }

      if (m >= q && m >= r && m >= high) {
        edges[idx] = 255;
      }
    }
  }
  return edges;
}

function morphologicalClose(src, w, h, radius = 2) {
  const dilated = new Uint8Array(w * h);
  const closed = new Uint8Array(w * h);

  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      let maxVal = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (src[(y + dy) * w + (x + dx)] === 255) {
            maxVal = 255;
            break;
          }
        }
        if (maxVal === 255) break;
      }
      dilated[y * w + x] = maxVal;
    }
  }

  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      let minVal = 255;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dilated[(y + dy) * w + (x + dx)] === 0) {
            minVal = 0;
            break;
          }
        }
        if (minVal === 0) break;
      }
      closed[y * w + x] = minVal;
    }
  }

  return closed;
}

function traceContours(binaryMap, w, h) {
  const visited = new Uint8Array(w * h);
  const contours = [];
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  for (let y = 4; y < h - 4; y += 2) {
    for (let x = 4; x < w - 4; x += 2) {
      const idx = y * w + x;
      if (binaryMap[idx] === 255 && !visited[idx]) {
        const contour = [];
        let currX = x, currY = y, dir = 0, steps = 0;

        while (steps < 1400) {
          contour.push({ x: currX, y: currY });
          visited[currY * w + currX] = 1;
          steps++;

          let foundNext = false;
          for (let i = 0; i < 8; i++) {
            const nextDir = (dir + i) % 8;
            const nx = currX + dx[nextDir];
            const ny = currY + dy[nextDir];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && binaryMap[ny * w + nx] === 255) {
              currX = nx;
              currY = ny;
              dir = (nextDir + 6) % 8;
              foundNext = true;
              break;
            }
          }
          if (!foundNext || (currX === x && currY === y && contour.length > 5)) break;
        }

        if (contour.length >= 20) contours.push(contour);
      }
    }
  }
  return contours;
}

function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0, index = 0;
  const p1 = points[0], p2 = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], p1, p2);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const res1 = douglasPeucker(points.slice(0, index + 1), epsilon);
    const res2 = douglasPeucker(points.slice(index), epsilon);
    return res1.slice(0, -1).concat(res2);
  } else {
    return [p1, p2];
  }
}

function perpendicularDistance(p, p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const denom = Math.hypot(dx, dy);
  if (denom === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
  return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / denom;
}

function polygonArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function polygonPerimeter(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    p += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
  }
  return p;
}

function calculateQuadAspectRatio(pts) {
  const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const topW = dist(pts[0], pts[1]), botW = dist(pts[3], pts[2]);
  const leftH = dist(pts[0], pts[3]), rightH = dist(pts[1], pts[2]);
  const avgW = (topW + botW) / 2, avgH = (leftH + rightH) / 2;
  return avgH > 0 ? avgW / avgH : 0;
}

function isStrictConvexQuad(pts) {
  if (pts.length !== 4) return false;
  const crossProducts = [];
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % 4], p3 = pts[(i + 2) % 4];
    crossProducts.push((p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x));
  }
  return crossProducts.every(cp => cp > 1e-4) || crossProducts.every(cp => cp < -1e-4);
}

export function sortCornersClockwise(points) {
  const sortedByY = [...points].sort((a, b) => a.y - b.y);
  const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomTwo = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0]];
}

function calculateOrthogonalityPenalty(pts) {
  let penalty = 0;
  for (let i = 0; i < 4; i++) {
    const pPrev = pts[(i + 3) % 4], pCurr = pts[i], pNext = pts[(i + 1) % 4];
    const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
    const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const len1 = Math.hypot(v1.x, v1.y), len2 = Math.hypot(v2.x, v2.y);
    if (len1 > 0 && len2 > 0) penalty += Math.abs(dot / (len1 * len2));
  }
  return penalty / 4;
}

function sampleEdgeEnergy(gradMag, w, h, quad) {
  let totalGrad = 0, samples = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = quad[i], p2 = quad[(i + 1) % 4];
    for (let t = 0.1; t <= 0.9; t += 0.1) {
      const x = Math.round(p1.x * (1 - t) + p2.x * t);
      const y = Math.round(p1.y * (1 - t) + p2.y * t);
      if (x >= 0 && x < w && y >= 0 && y < h) {
        totalGrad += gradMag[y * w + x];
        samples++;
      }
    }
  }
  return samples > 0 ? Math.min(1.0, totalGrad / (samples * 80)) : 0;
}

function detectOrientedBoundingBox(gradMag, w, h) {
  let totalM = 0, sumX = 0, sumY = 0;
  for (let y = Math.round(h * 0.15); y < Math.round(h * 0.85); y++) {
    for (let x = Math.round(w * 0.15); x < Math.round(w * 0.85); x++) {
      const m = gradMag[y * w + x];
      if (m > 30) {
        totalM += m;
        sumX += x * m;
        sumY += y * m;
      }
    }
  }
  if (totalM === 0) return null;
  const cx = sumX / totalM, cy = sumY / totalM;
  const cardW = w * 0.58, cardH = cardW / POKEMON_RATIO;
  return {
    corners: [
      { x: (cx - cardW / 2) / w, y: (cy - cardH / 2) / h },
      { x: (cx + cardW / 2) / w, y: (cy - cardH / 2) / h },
      { x: (cx + cardW / 2) / w, y: (cy + cardH / 2) / h },
      { x: (cx - cardW / 2) / w, y: (cy + cardH / 2) / h }
    ],
    ratio: POKEMON_RATIO,
    areaPercent: Math.round(((cardW * cardH) / (w * h)) * 100),
    score: 65,
    isLandscape: false,
    confidence: 75
  };
}

/**
 * Extrait et redresse la carte découpée à plat selon les 4 coins exacts
 * Intègre un rééchantillonnage bilinéaire sous-pixel et un pipeline d'amélioration automatique de qualité
 */
export function extractCardWarped(
  sourceCanvas,
  corners,
  targetWidth = 630,
  targetHeight = 880,
  brightness = 1.0,
  contrast = 1.0,
  autoEnhance = true
) {
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

  const rawWarpedData = new Uint8Array(targetWidth * targetHeight * 4);

  // 1. Échantillonnage Bilinéaire Sous-Pixel (Élimine la pixellisation et le crénelage)
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

        rawWarpedData[outIdx] = Math.round(srcData[idx00] * w00 + srcData[idx10] * w10 + srcData[idx01] * w01 + srcData[idx11] * w11);
        rawWarpedData[outIdx + 1] = Math.round(srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11);
        rawWarpedData[outIdx + 2] = Math.round(srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11);
        rawWarpedData[outIdx + 3] = 255;
      } else {
        rawWarpedData[outIdx + 3] = 0;
      }
    }
  }

  // 2. Si pas d'amélioration automatique : ajustement manuel de base
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

  // 3. Pipeline d'Amélioration Automatique Haute Définition
  const totalPixels = targetWidth * targetHeight;
  const hist = new Int32Array(256);

  for (let i = 0; i < rawWarpedData.length; i += 4) {
    if (rawWarpedData[i + 3] === 0) continue;
    const lum = Math.round(0.299 * rawWarpedData[i] + 0.587 * rawWarpedData[i + 1] + 0.114 * rawWarpedData[i + 2]);
    hist[lum]++;
  }

  // Points noir et blanc pour étirement automatique de contraste (Auto-Levels)
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

  if (whitePt - blackPt < 65) {
    blackPt = Math.max(0, blackPt - 15);
    whitePt = Math.min(255, whitePt + 15);
  }

  const range = whitePt - blackPt || 1;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let norm = (i - blackPt) / range;
    norm = Math.max(0, Math.min(1, norm));
    // Courbe gamma douce pour éclaircir les ombres et les textes
    let enhancedVal = 255 * Math.pow(norm, 0.88);
    // Prise en compte du coefficient de luminosité utilisateur
    enhancedVal = enhancedVal * (brightness > 1.0 ? 1 + (brightness - 1) * 0.5 : brightness);
    lut[i] = Math.min(255, Math.max(0, Math.round(enhancedVal)));
  }

  // Traitement couleur & saturation (+12%)
  const colorCorrected = new Uint8Array(rawWarpedData.length);
  for (let i = 0; i < rawWarpedData.length; i += 4) {
    if (rawWarpedData[i + 3] === 0) {
      colorCorrected[i + 3] = 0;
      continue;
    }
    let r = lut[rawWarpedData[i]];
    let g = lut[rawWarpedData[i + 1]];
    let b = lut[rawWarpedData[i + 2]];

    // Boost d'éclat des couleurs Pokémon
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * 1.12;
    g = gray + (g - gray) * 1.12;
    b = gray + (b - gray) * 1.12;

    colorCorrected[i] = Math.min(255, Math.max(0, Math.round(r)));
    colorCorrected[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    colorCorrected[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
    colorCorrected[i + 3] = 255;
  }

  // 4. Masque d'Accentuation & Super-Netteté (Unsharp Mask pour textes, PV, détails nets)
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
