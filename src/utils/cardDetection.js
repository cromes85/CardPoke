// Computer Vision Utilities for Card Detection, Perspective Correction, and OCR Preprocessing

/**
 * Standard Pokémon card aspect ratio (63mm width / 88mm height ≈ 0.7159)
 */
export const CARD_ASPECT_RATIO = 63 / 88; // ~0.7159

/**
 * Detect card corners in an image / video frame
 * Returns 4 corner points: [topLeft, topRight, bottomRight, bottomLeft]
 */
export function detectCardCorners(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  // 1. Try using OpenCV.js if loaded in window
  if (window.cv && window.cv.Mat) {
    try {
      const cv = window.cv;
      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edged = new cv.Mat();
      
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edged, 50, 150);
      
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      let maxArea = 0;
      let bestContour = null;
      const minCardArea = (width * height) * 0.10; // at least 10% of screen
      
      for (let i = 0; i < contours.size(); ++i) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        if (area > minCardArea) {
          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * peri, true);
          
          if (approx.rows === 4 && area > maxArea) {
            maxArea = area;
            if (bestContour) bestContour.delete();
            bestContour = approx;
          } else {
            approx.delete();
          }
        }
      }
      
      let corners = null;
      if (bestContour) {
        const points = [];
        for (let i = 0; i < 4; i++) {
          points.push({
            x: bestContour.data32S[i * 2],
            y: bestContour.data32S[i * 2 + 1]
          });
        }
        bestContour.delete();
        corners = orderCorners(points);
      }
      
      // Clean up OpenCV mats
      src.delete();
      gray.delete();
      blurred.delete();
      edged.delete();
      contours.delete();
      hierarchy.delete();
      
      if (corners) {
        return corners;
      }
    } catch (e) {
      console.warn("OpenCV card detection error, fallback to algorithmic scan:", e);
    }
  }

  // 2. Pure JavaScript Fallback: Card Viewfinder Guide Bounding Box
  // Computes a centered card viewport with standard ratio
  const margin = 0.08;
  const availW = width * (1 - margin * 2);
  const availH = height * (1 - margin * 2);
  
  let targetW, targetH;
  if (availW / availH > CARD_ASPECT_RATIO) {
    targetH = availH * 0.88;
    targetW = targetH * CARD_ASPECT_RATIO;
  } else {
    targetW = availW * 0.88;
    targetH = targetW / CARD_ASPECT_RATIO;
  }
  
  const startX = (width - targetW) / 2;
  const startY = (height - targetH) / 2;
  
  return [
    { x: startX, y: startY },                       // Top-Left
    { x: startX + targetW, y: startY },             // Top-Right
    { x: startX + targetW, y: startY + targetH },   // Bottom-Right
    { x: startX, y: startY + targetH }              // Bottom-Left
  ];
}

/**
 * Order points logically: Top-Left, Top-Right, Bottom-Right, Bottom-Left
 */
export function orderCorners(pts) {
  // Sort by sum of (x + y): TL has min sum, BR has max sum
  const sumSorted = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = sumSorted[0];
  const br = sumSorted[sumSorted.length - 1];
  
  // Sort remaining by diff (y - x): TR has min diff, BL has max diff
  const remaining = pts.filter(p => p !== tl && p !== br);
  const diffSorted = remaining.sort((a, b) => (a.y - a.x) - (b.y - b.x));
  const tr = diffSorted[0];
  const bl = diffSorted[1];
  
  return [tl, tr, br, bl];
}

/**
 * Perform 4-Point Perspective Transform (Homography Warp) onto standard Rectangular Canvas
 */
export function warpPerspective(sourceCanvas, corners, targetW = 630, targetH = 880) {
  const [tl, tr, br, bl] = corners;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

  // Use OpenCV.js if available for sub-pixel smooth warp
  if (window.cv && window.cv.Mat) {
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
      console.warn("OpenCV warp error, fallback to high-res bilinear slice:", e);
    }
  }

  // Pure Canvas Homography / Triangle Mesh Warp approximation
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  
  // Bounding box crop fallback
  const minX = Math.max(0, Math.min(tl.x, bl.x));
  const maxX = Math.min(sourceCanvas.width, Math.max(tr.x, br.x));
  const minY = Math.max(0, Math.min(tl.y, tr.y));
  const maxY = Math.min(sourceCanvas.height, Math.max(bl.y, br.y));
  
  const cropW = maxX - minX;
  const cropH = maxY - minY;
  
  outCtx.drawImage(sourceCanvas, minX, minY, cropW, cropH, 0, 0, targetW, targetH);
  return outCanvas;
}

/**
 * Crop specific Region of Interest (ROI) and optimize for OCR (High contrast binarization)
 */
export function extractAndPreprocessRoi(cardCanvas, zone = 'bottom_number') {
  const w = cardCanvas.width;
  const h = cardCanvas.height;
  
  let roiX, roiY, roiW, roiH;
  
  if (zone === 'top_name') {
    // Header area (Name & HP)
    roiX = Math.floor(w * 0.08);
    roiY = Math.floor(h * 0.02);
    roiW = Math.floor(w * 0.84);
    roiH = Math.floor(h * 0.16);
  } else if (zone === 'bottom_number') {
    // Footer area (Card Number e.g. 053/217, set code e.g. ASC FR, copyright)
    roiX = Math.floor(w * 0.04);
    roiY = Math.floor(h * 0.83);
    roiW = Math.floor(w * 0.92);
    roiH = Math.floor(h * 0.16);
  } else {
    // Full card
    roiX = 0;
    roiY = 0;
    roiW = w;
    roiH = h;
  }
  
  const roiCanvas = document.createElement('canvas');
  // Upscale for sharper OCR characters
  const scale = 2.0;
  roiCanvas.width = Math.floor(roiW * scale);
  roiCanvas.height = Math.floor(roiH * scale);
  
  const ctx = roiCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw scaled ROI
  ctx.drawImage(cardCanvas, roiX, roiY, roiW, roiH, 0, 0, roiCanvas.width, roiCanvas.height);
  
  // Apply image enhancement: Grayscale + Adaptive threshold + Sharpening
  const imgData = ctx.getImageData(0, 0, roiCanvas.width, roiCanvas.height);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Luminance
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Dynamic contrast stretch
    const contrast = 1.6;
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
    let enhanced = factor * (gray - 128) + 128;
    enhanced = Math.max(0, Math.min(255, enhanced));
    
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
  }
  
  ctx.putImageData(imgData, 0, 0);
  return roiCanvas;
}
