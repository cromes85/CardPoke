import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';

async function inspectContours(filename) {
  const img = await loadImage(path.join(uploadedDir, filename));
  const targetW = 360;
  const scale = targetW / img.width;
  const targetH = Math.round(img.height * scale);

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // Visualiser les contours
  console.log(`Image size: ${targetW}x${targetH} (${filename})`);

  // Binarisation par Otsu locale dans la zone centrale (y: 35% à 80%)
  for (let y = Math.round(targetH * 0.45); y < Math.round(targetH * 0.72); y += 10) {
    let rowValues = [];
    for (let x = Math.round(targetW * 0.20); x < Math.round(targetW * 0.80); x += 10) {
      const idx = (y * targetW + x) * 4;
      rowValues.push(`[${data[idx]},${data[idx+1]},${data[idx+2]}]`);
    }
    console.log(`Y=${y}: ${rowValues.slice(0, 4).join(' ')} ... ${rowValues.slice(-4).join(' ')}`);
  }
}

inspectContours('media_1791467710063.jpg');
