import { createWorker } from 'tesseract.js';

// Advanced Local Adaptive Thresholding for Crisp OCR Text
function binarizeForOcr(pixels, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = (pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29) >> 8;
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const windowSize = 25;
  const half = Math.floor(windowSize / 2);
  const C = 8; // contrast bias

  // Integral image for O(1) local mean computation
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height, y + half + 1);
    const rowIdx = y * width;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width, x + half + 1);
      const count = (x1 - x0) * (y1 - y0);

      const sum = 
        integral[y1 * (width + 1) + x1] -
        integral[y0 * (width + 1) + x1] -
        integral[y1 * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];

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

console.log('Binarizer function compiled successfully');
