// Computer Vision Utilities for Card Detection, Perspective Correction, and ROI Cropping

export const CARD_ASPECT_RATIO = 63 / 88; // ~0.7159 (Standard Pokémon Card)

/**
 * Robust Card Edge & Corner Detection (Pure JS Edge Gradient & Bounding Box)
 */
export function detectCardCorners(canvas) {
  const width = canvas.width;
  const height = canvas.height;

  // 1. OpenCV.js if loaded in window
  if (window.cv && window.cv.Mat && window.cv.imread) {
    try {
      const cv = window.cv;
      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edged = new cv.Mat();
      const dilated = new cv.Mat();
      
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edged, 30, 120);
      
      const M = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edged, dilated, M);
      
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      let maxArea = 0;
      let bestCorners = null;
      const minCardArea = (width * height) * 0.08;
      const maxCardArea = (width * height) * 0.98;

      for (let i = 0; i < contours.size(); ++i) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        
        if (area > minCardArea && area < maxCardArea) {
          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.03 * peri, true);
          
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
            
            if (ratio >= 0.50 && ratio <= 0.95) {
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
      console.warn("OpenCV card detection error, fallback to JS detector:", e);
    }
  }

  // 2. Pure JS Edge Scan
  try {
    const jsCorners = detectCardCornersPureJS(canvas);
    if (jsCorners) return jsCorners;
  } catch (e) {
    console.warn("Pure JS edge detector error:", e);
  }

  // 3. Fallback: Centered card viewport
  return getDefaultCenteredCorners(width, height);
}

function detectCardCornersPureJS(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  
  const maxDim = 320;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const sw = Math.floor(w * scale);
  const sh = Math.floor(h * scale);
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sw;
  tempCanvas.height = sh;
  const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, sw, sh);
  
  const imgData = ctx.getImageData(0, 0, sw, sh);
  const d = imgData.data;
  
  const gray = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    gray[i] = (r * 77 + g * 150 + b * 29) >> 8;
  }
  
  const threshold = 35;
  let minX = sw, maxX = 0, minY = sh, maxY = 0;
  
  for (let y = Math.floor(sh * 0.1); y < sh * 0.9; y += 4) {
    for (let x = 2; x < sw - 2; x++) {
      if (Math.abs(gray[y * sw + x] - gray[y * sw + x - 1]) > threshold) {
        if (x < minX) minX = x;
        break;
      }
    }
    for (let x = sw - 3; x > 2; x--) {
      if (Math.abs(gray[y * sw + x] - gray[y * sw + x + 1]) > threshold) {
        if (x > maxX) maxX = x;
        break;
      }
    }
  }
  
  for (let x = Math.floor(sw * 0.1); x < sw * 0.9; x += 4) {
    for (let y = 2; y < sh - 2; y++) {
      if (Math.abs(gray[y * sw + x] - gray[(y - 1) * sw + x]) > threshold) {
        if (y < minY) minY = y;
        break;
      }
    }
    for (let y = sh - 3; y > 2; y--) {
      if (Math.abs(gray[y * sw + x] - gray[(y + 1) * sw + x]) > threshold) {
        if (y > maxY) maxY = y;
        break;
      }
    }
  }
  
  const boxW = (maxX - minX) / scale;
  const boxH = (maxY - minY) / scale;
  
  if (boxW > w * 0.25 && boxH > h * 0.25 && maxX > minX && maxY > minY) {
    return [
      { x: minX / scale, y: minY / scale },
      { x: maxX / scale, y: minY / scale },
      { x: maxX / scale, y: maxY / scale },
      { x: minX / scale, y: maxY / scale }
    ];
  }
  
  return null;
}

export function getDefaultCenteredCorners(width, height) {
  const margin = 0.06;
  const availW = width * (1 - margin * 2);
  const availH = height * (1 - margin * 2);
  
  let targetW, targetH;
  if (availW / availH > CARD_ASPECT_RATIO) {
    targetH = availH * 0.90;
    targetW = targetH * CARD_ASPECT_RATIO;
  } else {
    targetW = availW * 0.90;
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
  const sumSorted = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = sumSorted[0];
  const br = sumSorted[sumSorted.length - 1];
  
  const remaining = pts.filter(p => p !== tl && p !== br);
  const diffSorted = remaining.sort((a, b) => (a.y - a.x) - (b.y - b.x));
  const tr = diffSorted[0];
  const bl = diffSorted[1];
  
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
  if (window.cv && window.cv.Mat && window.cv.imread) {
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
      console.warn("OpenCV warp error, fallback to bilinear mesh:", e);
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
    roiX = Math.floor(w * 0.05);
    roiY = Math.floor(h * 0.02);
    roiW = Math.floor(w * 0.90);
    roiH = Math.floor(h * 0.20);
  } else if (zone === 'bottom_number') {
    roiX = Math.floor(w * 0.03);
    roiY = Math.floor(h * 0.80);
    roiW = Math.floor(w * 0.94);
    roiH = Math.floor(h * 0.19);
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
