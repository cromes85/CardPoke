import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';
const POKEMON_RATIO = 63 / 88; // 0.7159

/**
 * Détecteur Multi-Échelle Ultra-Robuste (Table + Support 3D + Main)
 */
export function detectCardDualScale(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  // 1. Passe Globale (Plein Cadre)
  const globalResult = detectOnCanvasROI(sourceCanvas, 0, 0, w, h);

  // 2. Passe Centrale Zoomée (Support 3D & Cartes au fond d'une goulotte)
  const cropW = Math.round(w * 0.55);
  const cropH = Math.round(h * 0.55);
  const cropX = Math.round((w - cropW) / 2);
  const cropY = Math.round(h * 0.30); // centré sur la goulotte

  const zoomCanvas = createCanvas(cropW, cropH);
  zoomCanvas.getContext('2d').drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  const zoomResult = detectOnCanvasROI(zoomCanvas, 0, 0, cropW, cropH);

  // Re-projeter les coordonnées du zoom en coordonnées globales
  if (zoomResult) {
    zoomResult.corners = zoomResult.corners.map(p => ({
      x: (cropX + p.x * cropW) / w,
      y: (cropY + p.y * cropH) / h
    }));
  }

  // 3. Sélection du meilleur candidat (priorité à la netteté et la richesse de couleur)
  if (zoomResult && zoomResult.score > 55) {
    // Si une carte est nettement détectée dans la zone centrale (ex: tour 3D), la prioriser !
    return zoomResult;
  }

  if (globalResult) {
    return globalResult;
  }

  return zoomResult || null;
}

function detectOnCanvasROI(canvasROI, rx, ry, rw, rh) {
  const targetW = 320;
  const scale = targetW / canvasROI.width;
  const targetH = Math.round(canvasROI.height * scale);

  const workCanvas = createCanvas(targetW, targetH);
  const ctx = workCanvas.getContext('2d');
  ctx.drawImage(canvasROI, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // Grayscale & Saturation
  const gray = new Uint8Array(targetW * targetH);
  const sat = new Float32Array(targetW * targetH);

  for (let i = 0; i < targetW * targetH; i++) {
    const idx = i * 4;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    sat[i] = max > 0 ? (max - min) / max : 0;
  }

  const blurred = gaussianBlur(gray, targetW, targetH);

  const gradMag = new Float32Array(targetW * targetH);
  const gradDir = new Float32Array(targetW * targetH);
  computeSobel(blurred, targetW, targetH, gradMag, gradDir);

  const thresholds = [
    { low: 20, high: 60 },
    { low: 35, high: 95 },
    { low: 50, high: 130 }
  ];

  let bestQuad = null;
  let bestScore = -1;

  for (const { low, high } of thresholds) {
    const edgeMap = cannyNMS(gradMag, gradDir, targetW, targetH, low, high);
    const closedEdges = morphClose(edgeMap, targetW, targetH, 2);
    const contours = traceConts(closedEdges, targetW, targetH);

    for (const cnt of contours) {
      if (cnt.length < 15) continue;

      const area = polyArea(cnt);
      const areaFrac = area / (targetW * targetH);
      if (areaFrac < 0.08 || areaFrac > 0.90) continue;

      for (const epsFrac of [0.02, 0.03, 0.04, 0.05]) {
        const peri = polyPerimeter(cnt);
        const approx = douglasPeucker(cnt, epsFrac * peri);

        if (approx.length === 4) {
          const sorted = sortCorners(approx);
          if (isConvex(sorted)) {
            const ratio = calcAspect(sorted);
            const isPortrait = ratio >= 0.50 && ratio <= 0.95;
            const isLandscape = ratio >= 1.05 && ratio <= 1.95;

            if (isPortrait || isLandscape) {
              const targetRatio = isPortrait ? POKEMON_RATIO : 1 / POKEMON_RATIO;
              const ratioDiff = Math.abs(ratio - targetRatio);
              const edgeEnergy = sampleEdge(gradMag, targetW, targetH, sorted);
              const colorRichness = sampleColor(sat, targetW, targetH, sorted);

              const score = (1 - ratioDiff * 1.5) * 40 + colorRichness * 35 + edgeEnergy * 25;

              if (score > bestScore) {
                bestScore = score;
                bestQuad = {
                  corners: sorted.map(p => ({ x: p.x / targetW, y: p.y / targetH })),
                  ratio: Number(ratio.toFixed(3)),
                  areaPercent: Math.round(areaFrac * 100),
                  score: Math.round(score),
                  isLandscape
                };
              }
            }
          }
        }
      }
    }
  }

  return bestQuad;
}

function sampleColor(satMap, w, h, quad) {
  const cx = Math.round((quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4);
  const cy = Math.round((quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4);
  let sum = 0, count = 0;
  for (let dy = -10; dy <= 10; dy += 3) {
    for (let dx = -10; dx <= 10; dx += 3) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) {
        sum += satMap[y * w + x];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

function sampleEdge(gradMag, w, h, quad) {
  let sum = 0, count = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = quad[i], p2 = quad[(i + 1) % 4];
    for (let t = 0.2; t <= 0.8; t += 0.2) {
      const x = Math.round(p1.x * (1 - t) + p2.x * t);
      const y = Math.round(p1.y * (1 - t) + p2.y * t);
      if (x >= 0 && x < w && y >= 0 && y < h) {
        sum += gradMag[y * w + x];
        count++;
      }
    }
  }
  return count > 0 ? Math.min(1.0, sum / (count * 70)) : 0;
}

function gaussianBlur(src, w, h) {
  const dst = new Uint8Array(w * h);
  const k = [1,4,6,4,1, 4,16,24,16,4, 6,24,36,24,6, 4,16,24,16,4, 1,4,6,4,1];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let sum = 0, ki = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          sum += src[(y + dy) * w + (x + dx)] * k[ki++];
        }
      }
      dst[y * w + x] = Math.round(sum / 256);
    }
  }
  return dst;
}

function computeSobel(src, w, h, mag, dir) {
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -src[(y-1)*w+x-1] + src[(y-1)*w+x+1] - 2*src[y*w+x-1] + 2*src[y*w+x+1] - src[(y+1)*w+x-1] + src[(y+1)*w+x+1];
      const gy = -src[(y-1)*w+x-1] - 2*src[(y-1)*w+x] - src[(y-1)*w+x+1] + src[(y+1)*w+x-1] + 2*src[(y+1)*w+x] + src[(y+1)*w+x+1];
      const idx = y * w + x;
      mag[idx] = Math.hypot(gx, gy);
      dir[idx] = Math.atan2(gy, gx);
    }
  }
}

function cannyNMS(mag, dir, w, h, low, high) {
  const edges = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const m = mag[idx];
      if (m < low) continue;
      const deg = ((dir[idx] * 180 / Math.PI) + 180) % 180;
      let q = 0, r = 0;
      if (deg < 22.5 || deg >= 157.5) { q = mag[y*w+x+1]; r = mag[y*w+x-1]; }
      else if (deg < 67.5) { q = mag[(y+1)*w+x-1]; r = mag[(y-1)*w+x+1]; }
      else if (deg < 112.5) { q = mag[(y+1)*w+x]; r = mag[(y-1)*w+x]; }
      else { q = mag[(y-1)*w+x-1]; r = mag[(y+1)*w+x+1]; }

      if (m >= q && m >= r && m >= high) edges[idx] = 255;
    }
  }
  return edges;
}

function morphClose(src, w, h, r = 2) {
  const dil = new Uint8Array(w * h);
  const clo = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      let max = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (src[(y+dy)*w+x+dx] === 255) { max = 255; break; }
        }
        if (max === 255) break;
      }
      dil[y * w + x] = max;
    }
  }
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      let min = 255;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dil[(y+dy)*w+x+dx] === 0) { min = 0; break; }
        }
        if (min === 0) break;
      }
      clo[y * w + x] = min;
    }
  }
  return clo;
}

function traceConts(bin, w, h) {
  const vis = new Uint8Array(w * h);
  const conts = [];
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  for (let y = 3; y < h - 3; y += 2) {
    for (let x = 3; x < w - 3; x += 2) {
      const idx = y * w + x;
      if (bin[idx] === 255 && !vis[idx]) {
        const c = [];
        let cx = x, cy = y, dir = 0, st = 0;
        while (st < 1200) {
          c.push({ x: cx, y: cy });
          vis[cy * w + cx] = 1;
          st++;
          let fn = false;
          for (let i = 0; i < 8; i++) {
            const nd = (dir + i) % 8;
            const nx = cx + dx[nd], ny = cy + dy[nd];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && bin[ny * w + nx] === 255) {
              cx = nx; cy = ny; dir = (nd + 6) % 8; fn = true; break;
            }
          }
          if (!fn || (cx === x && cy === y && c.length > 5)) break;
        }
        if (c.length >= 15) conts.push(c);
      }
    }
  }
  return conts;
}

function douglasPeucker(pts, eps) {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  const p1 = pts[0], p2 = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], p1, p2);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const r1 = douglasPeucker(pts.slice(0, idx + 1), eps);
    const r2 = douglasPeucker(pts.slice(idx), eps);
    return r1.slice(0, -1).concat(r2);
  }
  return [p1, p2];
}

function perpDist(p, p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const den = Math.hypot(dx, dy);
  if (den === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
  return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / den;
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

function polyPerimeter(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    p += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
  }
  return p;
}

function calcAspect(pts) {
  const topW = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const botW = Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
  const leftH = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
  const rightH = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
  const avgW = (topW + botW) / 2, avgH = (leftH + rightH) / 2;
  return avgH > 0 ? avgW / avgH : 0;
}

function isConvex(pts) {
  if (pts.length !== 4) return false;
  const cp = [];
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % 4], p3 = pts[(i + 2) % 4];
    cp.push((p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x));
  }
  return cp.every(v => v > 1e-4) || cp.every(v => v < -1e-4);
}

function sortCorners(pts) {
  const sortedY = [...pts].sort((a, b) => a.y - b.y);
  const topTwo = sortedY.slice(0, 2).sort((a, b) => a.x - b.x);
  const botTwo = sortedY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [topTwo[0], topTwo[1], botTwo[1], botTwo[0]];
}

async function testDualScale() {
  const filename = 'media_1791467710063.jpg';
  const img = await loadImage(path.join(uploadedDir, filename));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const res = detectCardDualScale(canvas);
  console.log(`Dual-Scale Detection on ${filename}:`, res);

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

    const outPath = path.join(scratchDir, `dual_scale_${filename}`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg'));
    console.log(`Saved result visualization to: ${outPath}`);
  }
}

testDualScale();
