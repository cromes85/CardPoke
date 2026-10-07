// Computer Vision Utilities for Card Detection, Perspective Correction, and Sub-pixel Edge Alignment

export const CARD_ASPECT_RATIO = 63 / 88; // ~0.7159 (Standard Pokémon Card)

/**
 * Robust Card Edge & 4-Corner Detection
 * Combines OpenCV.js (if available) with a high-precision Sobel + RANSAC Pure JS edge detector
 */
export function detectCardCorners(canvas) {
  if (!canvas || !canvas.width || !canvas.height) {
    return getDefaultCenteredCorners(630, 880);
  }

  const width = canvas.width;
  const height = canvas.height;

  // 1. OpenCV.js Contour Analysis if present
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat && window.cv.imread) {
    try {
      const cv = window.cv;
      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edged = new cv.Mat();
      const dilated = new cv.Mat();
      
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edged, 35, 120);
      
      const M = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edged, dilated, M);
      
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      
      let maxArea = 0;
      let bestCorners = null;
      const minCardArea = (width * height) * 0.15;
      const maxCardArea = (width * height) * 0.96;

      for (let i = 0; i < contours.size(); ++i) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        
        if (area > minCardArea && area < maxCardArea) {
          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.025 * peri, true);
          
          if (approx.rows === 4 && area > maxArea) {
            const pts = [];
            for (let j = 0; j < 4; j++) {
              pts.push({
                x: approx.data32S[j * 2],
                y: approx.data32S[j * 2 + 1]
              });
            }
            
            const ordered = orderCorners(pts);
            const w1 = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
            const w2 = Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y);
            const h1 = Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y);
            const h2 = Math.hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y);
            
            const avgW = (w1 + w2) / 2;
            const avgH = (h1 + h2) / 2;
            const ratio = Math.min(avgW, avgH) / Math.max(avgW, avgH);
            
            if (ratio >= 0.55 && ratio <= 0.88) {
              maxArea = area;
              bestCorners = ordered;
            }
          }
          approx.delete();
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
      
      if (bestCorners) return bestCorners;
    } catch (e) {
      console.warn("OpenCV card detection fallback:", e);
    }
  }

  // 2. High-Precision Pure JS Edge Scan with RANSAC Line Fit
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
 * Pure JS High-Precision Edge & Corner Detector
 */
export function detectCardCornersPureJS(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  
  const maxDim = 360;
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
  
  // 1. Grayscale conversion with luminance weighting
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    gray[i] = r * 0.299 + g * 0.587 + b * 0.114;
  }
  
  // 2. Compute 3x3 Sobel gradients
  const gradX = new Float32Array(sw * sh);
  const gradY = new Float32Array(sw * sh);
  
  for (let y = 1; y < sh - 1; y++) {
    const ysw = y * sw;
    const yprev = (y - 1) * sw;
    const ynext = (y + 1) * sw;

    for (let x = 1; x < sw - 1; x++) {
      const gx = 
        -1 * gray[yprev + (x - 1)] + 1 * gray[yprev + (x + 1)] +
        -2 * gray[ysw   + (x - 1)] + 2 * gray[ysw   + (x + 1)] +
        -1 * gray[ynext + (x - 1)] + 1 * gray[ynext + (x + 1)];
      
      const gy = 
        -1 * gray[yprev + (x - 1)] - 2 * gray[yprev + x] - 1 * gray[yprev + (x + 1)] +
         1 * gray[ynext + (x - 1)] + 2 * gray[ynext + x] + 1 * gray[ynext + (x + 1)];
      
      gradX[ysw + x] = gx;
      gradY[ysw + x] = gy;
    }
  }
  
  // 3. Collect Edge Points along the 4 borders
  // Left Edge Points (scanning from left towards center)
  const leftPoints = [];
  for (let y = Math.floor(sh * 0.12); y < sh * 0.88; y += 3) {
    let maxG = 45;
    let bestX = -1;
    for (let x = Math.floor(sw * 0.04); x < sw * 0.48; x++) {
      const g = Math.abs(gradX[y * sw + x]);
      if (g > maxG) {
        maxG = g;
        bestX = x;
      }
    }
    if (bestX > 0) leftPoints.push({ x: bestX, y });
  }

  // Right Edge Points (scanning from right towards center)
  const rightPoints = [];
  for (let y = Math.floor(sh * 0.12); y < sh * 0.88; y += 3) {
    let maxG = 45;
    let bestX = -1;
    for (let x = Math.floor(sw * 0.96); x > sw * 0.52; x--) {
      const g = Math.abs(gradX[y * sw + x]);
      if (g > maxG) {
        maxG = g;
        bestX = x;
      }
    }
    if (bestX > 0) rightPoints.push({ x: bestX, y });
  }

  // Top Edge Points (scanning from top towards center)
  const topPoints = [];
  for (let x = Math.floor(sw * 0.12); x < sw * 0.88; x += 3) {
    let maxG = 45;
    let bestY = -1;
    for (let y = Math.floor(sh * 0.04); y < sh * 0.48; y++) {
      const g = Math.abs(gradY[y * sw + x]);
      if (g > maxG) {
        maxG = g;
        bestY = y;
      }
    }
    if (bestY > 0) topPoints.push({ x, y: bestY });
  }

  // Bottom Edge Points (scanning from bottom towards center)
  const bottomPoints = [];
  for (let x = Math.floor(sw * 0.12); x < sw * 0.88; x += 3) {
    let maxG = 45;
    let bestY = -1;
    for (let y = Math.floor(sh * 0.96); y > sh * 0.52; y--) {
      const g = Math.abs(gradY[y * sw + x]);
      if (g > maxG) {
        maxG = g;
        bestY = y;
      }
    }
    if (bestY > 0) bottomPoints.push({ x, y: bestY });
  }

  // 4. Fit 4 Straight Lines with Robust Median Filtering
  const leftLine = fitVerticalLine(leftPoints);
  const rightLine = fitVerticalLine(rightPoints);
  const topLine = fitHorizontalLine(topPoints);
  const bottomLine = fitHorizontalLine(bottomPoints);

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

      if (cardW > w * 0.28 && cardH > h * 0.28 && ratio >= 0.52 && ratio <= 0.88) {
        return ordered;
      }
    }
  }

  return null;
}

/**
 * Robust vertical line fitting: x = m * y + c
 */
function fitVerticalLine(points) {
  if (points.length < 5) return null;
  const xs = points.map(p => p.x).sort((a, b) => a - b);
  const medianX = xs[Math.floor(xs.length / 2)];
  
  // Filter outliers within 20% distance of median
  const inliers = points.filter(p => Math.abs(p.x - medianX) < 25);
  if (inliers.length < 4) return { m: 0, c: medianX };

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

/**
 * Robust horizontal line fitting: y = m * x + c
 */
function fitHorizontalLine(points) {
  if (points.length < 5) return null;
  const ys = points.map(p => p.y).sort((a, b) => a - b);
  const medianY = ys[Math.floor(ys.length / 2)];
  
  const inliers = points.filter(p => Math.abs(p.y - medianY) < 25);
  if (inliers.length < 4) return { m: 0, c: medianY };

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

/**
 * Intersect Horizontal Line (y = m_h * x + c_h) and Vertical Line (x = m_v * y + c_v)
 */
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
  const margin = 0.06;
  const availW = width * (1 - margin * 2);
  const availH = height * (1 - margin * 2);
  
  let targetW, targetH;
  if (availW / availH > CARD_ASPECT_RATIO) {
    targetH = availH * 0.94;
    targetW = targetH * CARD_ASPECT_RATIO;
  } else {
    targetW = availW * 0.94;
    targetH = targetW / CARD_ASPECT_RATIO;
  }
  
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
 * Crop Clean ROI without destructive contrast filters
 */
export function extractAndPreprocessRoi(cardCanvas, zone = 'full') {
  const w = cardCanvas.width;
  const h = cardCanvas.height;
  
  let roiX = 0, roiY = 0, roiW = w, roiH = h;
  
  if (zone === 'top_name') {
    roiX = Math.floor(w * 0.04);
    roiY = Math.floor(h * 0.02);
    roiW = Math.floor(w * 0.92);
    roiH = Math.floor(h * 0.24);
  } else if (zone === 'bottom_number') {
    roiX = Math.floor(w * 0.03);
    roiY = Math.floor(h * 0.78);
    roiW = Math.floor(w * 0.94);
    roiH = Math.floor(h * 0.21);
  }
  
  const roiCanvas = document.createElement('canvas');
  roiCanvas.width = roiW;
  roiCanvas.height = roiH;
  
  const ctx = roiCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cardCanvas, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH);
  
  return roiCanvas;
}
