import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { autoDetectPokemonCardV2 } from './test_robust_detector.js';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function testExtraction(filename) {
  const fullPath = path.join(uploadedDir, filename);
  const img = await loadImage(fullPath);

  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const res = autoDetectPokemonCardV2(canvas);
  console.log(`Detection for ${filename}:`, res);

  if (res && res.corners) {
    // Dessiner le polygone sur l'image
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const pts = res.corners.map(p => ({ x: p.x * img.width, y: p.y * img.height }));
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.stroke();

    // Réticules
    pts.forEach((p, i) => {
      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    const outPath = path.join(scratchDir, `debug_${filename}`);
    const buffer = canvas.toBuffer('image/jpeg');
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved debug image to: ${outPath}`);
  }
}

async function main() {
  await testExtraction('media_1791464110343.jpg');
  await testExtraction('media_1791459061888.jpg');
  await testExtraction('media_1791400444020.jpg');
}

main();
