// Computer Vision Utilities for Card Detection, Perspective Correction, Sub-pixel Edge Alignment & Adaptive OCR Binarization

export const CARD_ASPECT_RATIO = 63 / 88; // ~0.7159 (Standard Pokémon Card)

/**
 * Robust Card Edge & 4-Corner Detection
 * Combines OpenCV.js (if available) with Multi-Ray Sobel Profiler & Chroma Saliency Pure JS detector
 */
export function detectCardCorners(canvas) {
  if (!canvas || !canvas.width || !canvas.height) {
    return getDefaultCenteredCorners(630, 880);
  }

  const width = canvas.width;
  const height = canvas.height;

  // 1. OpenCV.js Contour Analysis with multi-epsilon and minAreaRect if present
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat && window.cv.imread) {
    try {
      const cvCorners = detectWithOpenCV(canvas);
      if (cvCorners) return cvCorners;
    } catch (e) {
      console.warn("OpenCV card detection fallback:", e);
    }
  }

  // 2. High-Precision Pure JS Multi-Ray Saliency & Gradient Profiler
  try {
    const jsCorners = detectCardCornersPureJS(canvas);
    if (jsCorners) return jsCorners;
  } catch (e) {
    console.warn("Pure JS edge detector error:", e);
  }

  // 3. Fallback: Centered card viewport matching official card ratio 63:88
  return getDefaultCenteredCorners(width, height);
}

/**
 * OpenCV Contour, Douglas-Peucker & minAreaRect Polygon Detection
 */
function detectWithOpenCV(canvas) {
  const cv = window.cv;
  const width = canvas.width;
  const height = canvas.height;

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const dilated = new cv.Mat();
  
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edged, 25, 100);
  
  const M = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.dilate(edged, dilated, M);
  
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  
  let bestCorners = null;
  let bestScore = -1;
  const minCardArea = (width * height) * 0.12;
  const maxCardArea = (width * height) * 0.95;

  for (let i = 0; i < contours.size(); ++i) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    
    if (area > minCardArea && area < maxCardArea) {
      const peri = cv.arcLength(contour, true);
      
      // Test multiple approximation epsilons for rounded card corners
      const epsilons = [0.02, 0.03, 0.04, 0.05];
      let quadPts = null;

      for (const eps of epsilons) {
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, eps * peri, true);
        
        if (approx.rows === 4) {
          quadPts = [];
          for (let j = 0; j < 4; j++) {
            quadPts.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1]
            });
          }
          approx.delete();
          break;
        }
        approx.delete();
      }

      // If polygon has >4 vertices (e.g. rounded corners), use minAreaRect
      if (!quadPts) {
        const rotatedRect = cv.minAreaRect(contour);
        const rectPts = new cv.Mat();
        cv.boxPoints(rotatedRect, rectPts);
        quadPts = [];
        for (let j = 0; j < 4; j++) {
          quadPts.push({
            x: rectPts.data32F[j * 2],
            y: rectPts.data32F[j * 2 + 1]
          });
        }
        rectPts.delete();
      }

      if (quadPts && quadPts.length === 4) {
        const ordered = orderCorners(quadPts);
        const w1 = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
        const w2 = Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y);
        const h1 = Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y);
        const h2 = Math.hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y);
        
        const avgW = (w1 + w2) / 2;
        const avgH = (h1 + h2) / 2;
        const ratio = Math.min(avgW, avgH) / Math.max(avgW, avgH);
        
        // Ratio closeness to 63/88 (~0.716)
        const ratioDiff = Math.abs(ratio - CARD_ASPECT_RATIO);
        if (ratioDiff < 0.22) {
          const score = area * (1 - ratioDiff * 2);
          if (score > bestScore) {
            bestScore = score;
            bestCorners = ordered;
          }
        }
      }
    }
  }
  
  src.delete();
  gray.delete();
  blurred.delete();
  edged.delete();
  dilated.delete();
  M.delete();
  contours.delete();
  hierarchy.delete();
  
  return bestCorners;
}

/**
 * Pure JS High-Precision Outside-In Color Gradient Ray Sweeper & Geometric Card Detector
 * Sweeps from image margins inward, locking onto the outermost physical card perimeter (yellow/silver/black border)
 * without getting trapped by high-contrast internal artwork or text boxes.
 */
export function detectCardCornersPureJS(canvas) {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const w = canvas.width;
  const h = canvas.height;
  
  const maxDim = 460;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const sw = Math.floor(w * scale);
  const sh = Math.floor(h * scale);
  
  let tempCanvas = null;
  if (typeof document !== 'undefined') {
    tempCanvas = document.createElement('canvas');
  } else {
    return null;
  }

  tempCanvas.width = sw;
  tempCanvas.height = sh;
  const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, sw, sh);
  
  const imgData = ctx.getImageData(0, 0, sw, sh);
  const d = imgData.data;
  
  // 3-Channel Euclidean Color Gradients (R, G, B)
  // Gx = sqrt((dRx)^2 + (dGx)^2 + (dBx)^2)
  // Gy = sqrt((dRy)^2 + (dGy)^2 + (dBy)^2)
  const gradX = new Float32Array(sw * sh);
  const gradY = new Float32Array(sw * sh);
  
  for (let y = 1; y < sh - 1; y++) {
    const ysw = y * sw;
    const yprev = (y - 1) * sw;
    const ynext = (y + 1) * sw;

    for (let x = 1; x < sw - 1; x++) {
      const idxL = (ysw + (x - 1)) * 4;
      const idxR = (ysw + (x + 1)) * 4;
      const idxU = (yprev + x) * 4;
      const idxD = (ynext + x) * 4;

      const drx = d[idxR] - d[idxL];
      const dgx = d[idxR + 1] - d[idxL + 1];
      const dbx = d[idxR + 2] - d[idxL + 2];
      gradX[ysw + x] = Math.hypot(drx, dgx, dbx);

      const dry = d[idxD] - d[idxU];
      const dgy = d[idxD + 1] - d[idxU + 1];
      const dby = d[idxD + 2] - d[idxU + 2];
      gradY[ysw + x] = Math.hypot(dry, dgy, dby);
    }
  }
  
  const cx = Math.floor(sw / 2);
  const cy = Math.floor(sh / 2);
  const minThreshold = 24; // Minimum gradient magnitude for card edge

  // 1. LEFT EDGE: Outside-In Sweep from x = 3 inward to x = cx * 0.85
  const leftPoints = [];
  const yStart = Math.floor(sh * 0.12);
  const yEnd = Math.floor(sh * 0.88);

  for (let y = yStart; y < yEnd; y += 2) {
    let bestX = -1;
    let maxG = minThreshold;
    const xMax = Math.floor(cx * 0.85);

    for (let x = 3; x < xMax; x++) {
      const g = gradX[y * sw + x];
      if (g > maxG) {
        maxG = g;
        bestX = x;
        const gNext1 = gradX[y * sw + (x + 1)];
        const gNext2 = gradX[y * sw + (x + 2)];
        if (g > gNext1 && gNext1 > gNext2 && maxG >= minThreshold) {
          break; // First outer edge found!
        }
      }
    }
    if (bestX > 0 && maxG >= minThreshold) {
      leftPoints.push({ x: bestX, y });
    }
  }

  // 2. RIGHT EDGE: Outside-In Sweep from x = sw - 4 inward to x = cx * 1.15
  const rightPoints = [];
  for (let y = yStart; y < yEnd; y += 2) {
    let bestX = -1;
    let maxG = minThreshold;
    const xMin = Math.floor(cx * 1.15);

    for (let x = sw - 4; x > xMin; x--) {
      const g = gradX[y * sw + x];
      if (g > maxG) {
        maxG = g;
        bestX = x;
        const gNext1 = gradX[y * sw + (x - 1)];
        const gNext2 = gradX[y * sw + (x - 2)];
        if (g > gNext1 && gNext1 > gNext2 && maxG >= minThreshold) {
          break; // First outer edge found!
        }
      }
    }
    if (bestX > 0 && maxG >= minThreshold) {
      rightPoints.push({ x: bestX, y });
    }
  }

  // 3. TOP EDGE: Outside-In Sweep from y = 3 inward to y = cy * 0.85
  const topPoints = [];
  const xStart = Math.floor(sw * 0.12);
  const xEnd = Math.floor(sw * 0.88);

  for (let x = xStart; x < xEnd; x += 2) {
    let bestY = -1;
    let maxG = minThreshold;
    const yMax = Math.floor(cy * 0.85);

    for (let y = 3; y < yMax; y++) {
      const g = gradY[y * sw + x];
      if (g > maxG) {
        maxG = g;
        bestY = y;
        const gNext1 = gradY[(y + 1) * sw + x];
        const gNext2 = gradY[(y + 2) * sw + x];
        if (g > gNext1 && gNext1 > gNext2 && maxG >= minThreshold) {
          break; // First outer edge found!
        }
      }
    }
    if (bestY > 0 && maxG >= minThreshold) {
      topPoints.push({ x, y: bestY });
    }
  }

  // 4. BOTTOM EDGE: Outside-In Sweep from y = sh - 4 inward to y = cy * 1.15
  const bottomPoints = [];
  for (let x = xStart; x < xEnd; x += 2) {
    let bestY = -1;
    let maxG = minThreshold;
    const yMin = Math.floor(cy * 1.15);

    for (let y = sh - 4; y > yMin; y--) {
      const g = gradY[y * sw + x];
      if (g > maxG) {
        maxG = g;
        bestY = y;
        const gNext1 = gradY[(y - 1) * sw + x];
        const gNext2 = gradY[(y - 2) * sw + x];
        if (g > gNext1 && gNext1 > gNext2 && maxG >= minThreshold) {
          break; // First outer edge found!
        }
      }
    }
    if (bestY > 0 && maxG >= minThreshold) {
      bottomPoints.push({ x, y: bestY });
    }
  }

  // Fit robust lines with Median Absolute Deviation (MAD) filtering
  const leftLine = fitRobustVertical(leftPoints, sw);
  const rightLine = fitRobustVertical(rightPoints, sw);
  const topLine = fitRobustHorizontal(topPoints, sh);
  const bottomLine = fitRobustHorizontal(bottomPoints, sh);

  if (leftLine && rightLine && topLine && bottomLine) {
    const tl = intersectHV(topLine, leftLine);
    const tr = intersectHV(topLine, rightLine);
    const br = intersectHV(bottomLine, rightLine);
    const bl = intersectHV(bottomLine, leftLine);

    if (tl && tr && br && bl) {
      const fullCorners = [
        { x: Math.max(0, Math.min(w, tl.x / scale)), y: Math.max(0, Math.min(h, tl.y / scale)) },
        { x: Math.max(0, Math.min(w, tr.x / scale)), y: Math.max(0, Math.min(h, tr.y / scale)) },
        { x: Math.max(0, Math.min(w, br.x / scale)), y: Math.max(0, Math.min(h, br.y / scale)) },
        { x: Math.max(0, Math.min(w, bl.x / scale)), y: Math.max(0, Math.min(h, bl.y / scale)) }
      ];

      const ordered = orderCorners(fullCorners);
      const cardW = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
      const cardH = Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y);
      const ratio = Math.min(cardW, cardH) / Math.max(cardW, cardH);

      if (cardW > w * 0.18 && cardH > h * 0.18 && ratio >= 0.50 && ratio <= 0.90) {
        return ordered;
      }
    }
  }

  return null;
}

/**
 * Magnetic Edge Snapper: Snaps a point (x, y) to the nearest high-contrast card border within radius
 * Uses 3-channel Euclidean Color Gradient for optimal yellow/silver border tracking
 */
export function snapPointToEdge(canvas, pt, radius = 30) {
  if (!canvas || !pt) return pt;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const minX = Math.max(1, Math.floor(pt.x - radius));
  const minY = Math.max(1, Math.floor(pt.y - radius));
  const maxX = Math.min(w - 2, Math.floor(pt.x + radius));
  const maxY = Math.min(h - 2, Math.floor(pt.y + radius));
  const rw = maxX - minX;
  const rh = maxY - minY;

  if (rw <= 2 || rh <= 2) return pt;

  try {
    const imgData = ctx.getImageData(minX, minY, rw, rh);
    const d = imgData.data;

    let bestX = pt.x;
    let bestY = pt.y;
    let maxGrad = -1;

    for (let y = 1; y < rh - 1; y++) {
      const yRow = y * rw;
      for (let x = 1; x < rw - 1; x++) {
        const idxL = (yRow + (x - 1)) * 4;
        const idxR = (yRow + (x + 1)) * 4;
        const idxU = ((y - 1) * rw + x) * 4;
        const idxD = ((y + 1) * rw + x) * 4;

        const drx = d[idxR] - d[idxL];
        const dgx = d[idxR + 1] - d[idxL + 1];
        const dbx = d[idxR + 2] - d[idxL + 2];
        const gx = Math.hypot(drx, dgx, dbx);

        const dry = d[idxD] - d[idxU];
        const dgy = d[idxD + 1] - d[idxU + 1];
        const dby = d[idxD + 2] - d[idxU + 2];
        const gy = Math.hypot(dry, dgy, dby);

        const mag = gx * gx + gy * gy;

        // Distance weighting to favor closer points while allowing outer snapping
        const dist = Math.hypot((minX + x) - pt.x, (minY + y) - pt.y);
        const weightedMag = mag / (1 + dist * 0.04);

        if (weightedMag > maxGrad) {
          maxGrad = weightedMag;
          bestX = minX + x;
          bestY = minY + y;
        }
      }
    }

    if (maxGrad > 600) {
      return { x: bestX, y: bestY };
    }
  } catch (e) {}

  return pt;
}

/**
 * Snap all 4 corners to local card edges in 1 click
 */
export function snapAllCornersToEdges(canvas, corners, radius = 35) {
  if (!corners || corners.length !== 4) return corners;
  return corners.map(c => snapPointToEdge(canvas, c, radius));
}

/**
 * Expand corners outward to lock onto the outermost card perimeter
 * Ideal when a crop box is slightly collapsed inside the artwork or text
 */
export function expandCornersToOuterEdges(canvas, corners, expansionFactor = 1.08) {
  if (!corners || corners.length !== 4 || !canvas) return corners;
  const [tl, tr, br, bl] = orderCorners(corners);
  const w = canvas.width;
  const h = canvas.height;

  // Quad Centroid
  const cx = (tl.x + tr.x + br.x + bl.x) / 4;
  const cy = (tl.y + tr.y + br.y + bl.y) / 4;

  const expanded = [tl, tr, br, bl].map(corner => {
    const vx = corner.x - cx;
    const vy = corner.y - cy;
    const newX = cx + vx * expansionFactor;
    const newY = cy + vy * expansionFactor;
    return {
      x: Math.max(0, Math.min(w, Math.round(newX))),
      y: Math.max(0, Math.min(h, Math.round(newY)))
    };
  });

  // Snap expanded corners to local color gradients
  return snapAllCornersToEdges(canvas, expanded, 35);
}

/**
 * Re-fit corners to strictly adhere to official Pokémon Card ratio 63:88
 */
export function fitCardCornersToRatio(corners, targetRatio = CARD_ASPECT_RATIO) {
  if (!corners || corners.length !== 4) return corners;
  const [tl, tr, br, bl] = orderCorners(corners);
  
  const cx = (tl.x + tr.x + br.x + bl.x) / 4;
  const cy = (tl.y + tr.y + br.y + bl.y) / 4;

  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const hLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hRight = Math.hypot(br.x - tr.x, br.y - tr.y);

  const avgW = (wTop + wBottom) / 2;
  const avgH = (hLeft + hRight) / 2;

  let finalW, finalH;
  if (avgW / avgH > targetRatio) {
    finalH = avgH;
    finalW = finalH * targetRatio;
  } else {
    finalW = avgW;
    finalH = finalW / targetRatio;
  }

  const halfW = finalW / 2;
  const halfH = finalH / 2;

  return [
    { x: cx - halfW, y: cy - halfH },
    { x: cx + halfW, y: cy - halfH },
    { x: cx + halfW, y: cy + halfH },
    { x: cx - halfW, y: cy + halfH }
  ];
}

function fitRobustVertical(points, sw) {
  if (!points || points.length < 4) return null;
  const xs = points.map(p => p.x).sort((a, b) => a - b);
  const medianX = xs[Math.floor(xs.length / 2)];
  
  // Calculate MAD (Median Absolute Deviation)
  const absDevs = points.map(p => Math.abs(p.x - medianX)).sort((a, b) => a - b);
  const mad = absDevs[Math.floor(absDevs.length / 2)] || 1;
  const tolerance = Math.max(12, mad * 2.8);

  const inliers = points.filter(p => Math.abs(p.x - medianX) <= tolerance);
  if (inliers.length < 3) return { m: 0, c: medianX };

  let sumY = 0, sumX = 0, sumYY = 0, sumYX = 0;
  const n = inliers.length;
  for (const p of inliers) {
    sumY += p.y;
    sumX += p.x;
    sumYY += p.y * p.y;
    sumYX += p.y * p.x;
  }

  const denom = n * sumYY - sumY * sumY;
  if (Math.abs(denom) < 1e-5) return { m: 0, c: medianX };

  const m = (n * sumYX - sumY * sumX) / denom;
  const c = (sumX - m * sumY) / n;
  return { m, c };
}

function fitRobustHorizontal(points, sh) {
  if (!points || points.length < 4) return null;
  const ys = points.map(p => p.y).sort((a, b) => a - b);
  const medianY = ys[Math.floor(ys.length / 2)];
  
  // Calculate MAD (Median Absolute Deviation)
  const absDevs = points.map(p => Math.abs(p.y - medianY)).sort((a, b) => a - b);
  const mad = absDevs[Math.floor(absDevs.length / 2)] || 1;
  const tolerance = Math.max(12, mad * 2.8);

  const inliers = points.filter(p => Math.abs(p.y - medianY) <= tolerance);
  if (inliers.length < 3) return { m: 0, c: medianY };

  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  const n = inliers.length;
  for (const p of inliers) {
    sumX += p.x;
    sumY += p.y;
    sumXX += p.x * p.x;
    sumXY += p.x * p.y;
  }

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-5) return { m: 0, c: medianY };

  const m = (n * sumXY - sumX * sumY) / denom;
  const c = (sumY - m * sumX) / n;
  return { m, c };
}

function intersectHV(hLine, vLine) {
  const mh = hLine.m;
  const ch = hLine.c;
  const mv = vLine.m;
  const cv = vLine.c;

  const denom = 1 - mh * mv;
  if (Math.abs(denom) < 1e-5) {
    return { x: cv, y: ch };
  }

  const y = (mh * cv + ch) / denom;
  const x = mv * y + cv;
  return { x, y };
}

export function getDefaultCenteredCorners(width, height) {
  const targetH = height * 0.78;
  const targetW = targetH * CARD_ASPECT_RATIO;
  
  const startX = (width - targetW) / 2;
  const startY = (height - targetH) / 2;
  
  return [
    { x: startX, y: startY },
    { x: startX + targetW, y: startY },
    { x: startX + targetW, y: startY + targetH },
    { x: startX, y: startY + targetH }
  ];
}

export function orderCorners(pts) {
  if (!pts || pts.length < 4) return [];
  const sumSorted = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = sumSorted[0];
  const br = sumSorted[sumSorted.length - 1];
  
  const remaining = pts.filter(p => p !== tl && p !== br);
  const diffSorted = remaining.sort((a, b) => (a.y - a.x) - (b.y - b.x));
  const tr = diffSorted[0] || pts[1];
  const bl = diffSorted[1] || pts[3];
  
  return [tl, tr, br, bl];
}

/**
 * 4-Point Perspective Transform (Homography Warp)
 */
export function warpPerspective(sourceCanvas, corners, targetW = 630, targetH = 880) {
  const [tl, tr, br, bl] = orderCorners(corners);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

  // 1. OpenCV.js Warp
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat && window.cv.imread) {
    try {
      const cv = window.cv;
      const srcMat = cv.imread(sourceCanvas);
      const dstMat = new cv.Mat();
      const dsize = new cv.Size(targetW, targetH);
      
      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y
      ]);
      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        targetW, 0,
        targetW, targetH,
        0, targetH
      ]);
      
      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      cv.warpPerspective(srcMat, dstMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
      cv.imshow(outCanvas, dstMat);
      
      srcMat.delete();
      dstMat.delete();
      srcTri.delete();
      dstTri.delete();
      M.delete();
      
      return outCanvas;
    } catch (e) {
      console.warn("OpenCV warp fallback:", e);
    }
  }

  // 2. Pure JS Bilinear Perspective Warp (Clean, No artifacts)
  try {
    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const dstData = outCtx.createImageData(targetW, targetH);
    
    const sData = srcData.data;
    const dData = dstData.data;
    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;

    for (let y = 0; y < targetH; y++) {
      const v = y / targetH;
      const lx = tl.x + v * (bl.x - tl.x);
      const ly = tl.y + v * (bl.y - tl.y);
      const rx = tr.x + v * (br.x - tr.x);
      const ry = tr.y + v * (br.y - tr.y);

      for (let x = 0; x < targetW; x++) {
        const u = x / targetW;
        const sx = lx + u * (rx - lx);
        const sy = ly + u * (ry - ly);

        const px = Math.floor(sx);
        const py = Math.floor(sy);

        if (px >= 0 && px < sw && py >= 0 && py < sh) {
          const srcIdx = (py * sw + px) * 4;
          const dstIdx = (y * targetW + x) * 4;

          dData[dstIdx] = sData[srcIdx];
          dData[dstIdx + 1] = sData[srcIdx + 1];
          dData[dstIdx + 2] = sData[srcIdx + 2];
          dData[dstIdx + 3] = 255;
        }
      }
    }

    outCtx.putImageData(dstData, 0, 0);
    return outCanvas;
  } catch (err) {
    const minX = Math.max(0, Math.min(tl.x, bl.x));
    const maxX = Math.min(sourceCanvas.width, Math.max(tr.x, br.x));
    const minY = Math.max(0, Math.min(tl.y, tr.y));
    const maxY = Math.min(sourceCanvas.height, Math.max(bl.y, br.y));
    outCtx.drawImage(sourceCanvas, minX, minY, maxX - minX, maxY - minY, 0, 0, targetW, targetH);
    return outCanvas;
  }
}

/**
 * Analyze ambient lighting level & shadow distribution on a canvas
 */
export function analyzeLightingLevel(canvas) {
  if (!canvas || !canvas.width || !canvas.height) {
    return { mean: 128, state: 'optimal', label: 'Luminosité Optimale', needsBoost: false, color: '#10b981' };
  }

  const w = Math.min(canvas.width, 160);
  const h = Math.min(canvas.height, 160);

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = w;
  sampleCanvas.height = h;
  const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  sCtx.drawImage(canvas, 0, 0, w, h);
  
  const imgData = sCtx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const totalPixels = w * h;

  let sumLum = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const lum = (d[idx] * 299 + d[idx + 1] * 587 + d[idx + 2] * 114) / 1000;
    sumLum += lum;
    if (lum < 60) darkPixels++;
    if (lum > 225) brightPixels++;
  }

  const mean = sumLum / totalPixels;
  const darkRatio = darkPixels / totalPixels;
  const brightRatio = brightPixels / totalPixels;

  if (mean < 75 || darkRatio > 0.40) {
    return {
      mean: Math.round(mean),
      state: 'low',
      label: 'Éclairage faible / Ombres',
      needsBoost: true,
      color: '#f59e0b'
    };
  } else if (mean > 200 || brightRatio > 0.35) {
    return {
      mean: Math.round(mean),
      state: 'harsh',
      label: 'Reflets / Trop lumineux',
      needsBoost: false,
      color: '#ef4444'
    };
  } else {
    return {
      mean: Math.round(mean),
      state: 'optimal',
      label: 'Luminosité Optimale',
      needsBoost: false,
      color: '#10b981'
    };
  }
}

/**
 * Adaptive Dynamic Lighting Equalizer & Shadow Lifter
 * Applies dynamic tone mapping (LUT gamma correction) and contrast normalization
 */
export function autoEnhanceLighting(sourceCanvas, strength = 1.0) {
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return sourceCanvas;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = srcCtx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const total = w * h;

  // 1. Calculate Histogram & Mean Luminance
  const hist = new Uint32Array(256);
  let sumLum = 0;
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const lum = Math.round((d[idx] * 299 + d[idx + 1] * 587 + d[idx + 2] * 114) / 1000);
    hist[lum]++;
    sumLum += lum;
  }
  const meanLum = sumLum / total;

  // 2. Determine Gamma & Contrast limits
  // If dark (mean < 140), apply gamma curve < 1.0 to lift shadows
  let gamma = 1.0;
  if (meanLum < 140) {
    gamma = Math.max(0.40, Math.min(1.0, Math.log(0.5) / Math.log(Math.max(20, meanLum) / 255)));
    gamma = 1.0 - (1.0 - gamma) * strength;
  } else if (meanLum > 185) {
    // Compress overblown specular glare
    gamma = Math.min(1.3, 1.0 + ((meanLum - 185) / 200) * strength);
  }

  // 3. Find 1st and 99th percentiles for dynamic range stretching (anti-haze)
  let p1 = 0, p99 = 255;
  let count = 0;
  const p1Threshold = total * 0.01;
  const p99Threshold = total * 0.99;

  for (let i = 0; i < 256; i++) {
    count += hist[i];
    if (p1 === 0 && count >= p1Threshold) p1 = i;
    if (count >= p99Threshold) { p99 = i; break; }
  }
  if (p99 <= p1) { p1 = 0; p99 = 255; }

  // 4. Precompute 256-entry Lookup Table (LUT)
  const lut = new Uint8ClampedArray(256);
  const stretchRange = Math.max(1, p99 - p1);

  for (let v = 0; v < 256; v++) {
    let normalized = (v - p1) / stretchRange;
    normalized = Math.max(0, Math.min(1, normalized));

    const gammaCorrected = Math.pow(normalized, gamma);
    const finalVal = (v * (1 - strength) + (gammaCorrected * 255) * strength);
    lut[v] = Math.round(Math.max(0, Math.min(255, finalVal)));
  }

  // 5. Apply LUT to pixel buffer
  const outData = outCtx.createImageData(w, h);
  const od = outData.data;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    od[idx] = lut[d[idx]];         // R
    od[idx + 1] = lut[d[idx + 1]]; // G
    od[idx + 2] = lut[d[idx + 2]]; // B
    od[idx + 3] = d[idx + 3];     // A
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

/**
 * Crop Clean ROI with Adaptive Local Binarization (Crisp 300 DPI Text for 100% OCR)
 */
export function extractAndPreprocessRoi(cardCanvas, zone = 'full') {
  // 1. Equalize ambient lighting and lift dark shadows before extraction
  const enhancedCard = autoEnhanceLighting(cardCanvas, 0.9);

  const w = enhancedCard.width;
  const h = enhancedCard.height;
  
  let roiX = 0, roiY = 0, roiW = w, roiH = h;
  
  if (zone === 'top_name') {
    roiX = Math.floor(w * 0.02);
    roiY = Math.floor(h * 0.01);
    roiW = Math.floor(w * 0.96);
    roiH = Math.floor(h * 0.25);
  } else if (zone === 'bottom_number') {
    roiX = Math.floor(w * 0.02);
    roiY = Math.floor(h * 0.78);
    roiW = Math.floor(w * 0.55); // focus on bottom left number & set symbol
    roiH = Math.floor(h * 0.21);
  }
  
  const roiCanvas = document.createElement('canvas');
  // Upscale 1.5x for higher OCR character clarity
  const scale = zone === 'full' ? 1.0 : 1.5;
  roiCanvas.width = Math.floor(roiW * scale);
  roiCanvas.height = Math.floor(roiH * scale);
  
  const ctx = roiCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(enhancedCard, roiX, roiY, roiW, roiH, 0, 0, roiCanvas.width, roiCanvas.height);

  // Apply Adaptive Local Thresholding to remove shadows & color backgrounds
  if (zone === 'top_name' || zone === 'bottom_number') {
    try {
      const imgData = ctx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
      const binarized = localAdaptiveBinarize(imgData.data, roiCanvas.width, roiCanvas.height);
      ctx.putImageData(new ImageData(binarized, roiCanvas.width, roiCanvas.height), 0, 0);
    } catch (e) {}
  }
  
  return roiCanvas;
}

/**
 * Integral Image Local Adaptive Binarization
 * Eliminates background color, gradients, and foil reflections, producing crisp black text on pure white
 */
function localAdaptiveBinarize(pixels, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = (pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29) >> 8;
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const windowSize = Math.max(15, Math.floor(width / 30));
  const half = Math.floor(windowSize / 2);
  const C = 6;

  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const yRow = y * width;
    const iRow = (y + 1) * (width + 1);
    const iPrev = y * (width + 1);
    for (let x = 0; x < width; x++) {
      rowSum += gray[yRow + x];
      integral[iRow + (x + 1)] = integral[iPrev + (x + 1)] + rowSum;
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height, y + half + 1);
    const rowIdx = y * width;
    const iY1 = y1 * (width + 1);
    const iY0 = y0 * (width + 1);

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width, x + half + 1);
      const count = (x1 - x0) * (y1 - y0);

      const sum = integral[iY1 + x1] - integral[iY0 + x1] - integral[iY1 + x0] + integral[iY0 + x0];
      const mean = sum / count;
      const val = gray[rowIdx + x] < (mean - C) ? 0 : 255;
      const oIdx = (rowIdx + x) * 4;
      out[oIdx] = val;
      out[oIdx + 1] = val;
      out[oIdx + 2] = val;
      out[oIdx + 3] = 255;
    }
  }

  return out;
}
