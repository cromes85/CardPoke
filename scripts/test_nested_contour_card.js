import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';
const POKEMON_RATIO = 63 / 88; // ~0.7159

export function detectInnermostCard(imgCanvas) {
  const w = imgCanvas.width;
  const h = imgCanvas.height;

  const targetW = 400;
  const scale = targetW / w;
  const targetH = Math.round(h * scale);

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgCanvas, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // 1. Grayscale + Flou Bilatéral/Gaussien
  const gray = new Uint8Array(targetW * targetH);
  const colorSat = new Float32Array(targetW * targetH);

  for (let i = 0; i < targetW * targetH; i++) {
    const idx = i * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    colorSat[i] = max > 0 ? (max - min) / max : 0;
  }

  const blurred = gaussianBlur5x5(gray, targetW, targetH);

  // 2. Multi-Pass Canny Edge Detection
  const gradMag = new Float32Array(targetW * targetH);
  const gradDir = new Float32Array(targetW * targetH);
  computeSobel(blurred, targetW, targetH, gradMag, gradDir);

  const thresholds = [
    { low: 15, high: 50 },
    { low: 30, high: 90 },
    { low: 45, high: 120 }
  ];

  const candidateCards = [];

  for (const { low, high } of thresholds) {
    const edgeMap = cannyNonMaxSuppression(gradMag, gradDir, targetW, targetH, low, high);
    const closedEdges = morphologicalClose(edgeMap, targetW, targetH, 2);
    const contours = traceContours(closedEdges, targetW, targetH);

    for (const cnt of contours) {
      if (cnt.length < 15) continue;

      const area = polygonArea(cnt);
      const totalArea = targetW * targetH;
      const areaFrac = area / totalArea;

      // Doit occuper entre 4% et 85% de l'image (permet de détecter les cartes au fond de la tour 3D !)
      if (areaFrac < 0.04 || areaFrac > 0.85) continue;

      for (const epsFrac of [0.02, 0.03, 0.04, 0.05]) {
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

              // Calcul de la saturation de couleur intérieure
              const innerSat = sampleInnerColorSat(colorSat, targetW, targetH, sorted);
              // Calcul de l'énergie de bordure
              const edgeEnergy = sampleEdgeEnergy(gradMag, targetW, targetH, sorted);

              // Score valorisant la richesse de couleur de la carte vs le plastique blanc
              const score = (1 - ratioDiff * 1.5) * 45 + innerSat * 40 + edgeEnergy * 25;

              candidateCards.push({
                corners: sorted.map(p => ({ x: p.x / targetW, y: p.y / targetH })),
                ratio: Number(ratio.toFixed(3)),
                areaPercent: Math.round(areaFrac * 100),
                score: Math.round(score),
                innerSat: Number(innerSat.toFixed(2)),
                isLandscape
              });
            }
          }
        }
      }
    }
  }

  // Trier par score décroissant
  candidateCards.sort((a, b) => b.score - a.score);

  return candidateCards.length > 0 ? candidateCards[0] : null;
}

function sampleInnerColorSat(satMap, w, h, quad) {
  // Barycentre
  const cx = Math.round((quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4);
  const cy = Math.round((quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4);

  let totalSat = 0, count = 0;
  for (let dy = -15; dy <= 15; dy += 3) {
    for (let dx = -15; dx <= 15; dx += 3) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) {
        totalSat += satMap[y * w + x];
        count++;
      }
    }
  }
  return count > 0 ? totalSat / count : 0;
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

  for (let y = 3; y < h - 3; y += 2) {
    for (let x = 3; x < w - 3; x += 2) {
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

        if (contour.length >= 15) contours.push(contour);
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

function sortCornersClockwise(points) {
  const sortedByY = [...points].sort((a, b) => a.y - b.y);
  const topTwo = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomTwo = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0]];
}

async function testNestedDetection() {
  const filename = 'media_1791467710063.jpg';
  const img = await loadImage(path.join(uploadedDir, filename));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const res = detectInnermostCard(canvas);
  console.log(`Innermost Card Detection on ${filename}:`, res);

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

    const outPath = path.join(scratchDir, `innermost_${filename}`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg'));
    console.log(`Saved result visualization to: ${outPath}`);
  }
}

testNestedDetection();
