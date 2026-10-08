import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function measureExactCardCoordinates(filename) {
  const fullPath = path.join(uploadedDir, filename);
  const img = await loadImage(fullPath);
  console.log(`Image: ${filename} | Size: ${img.width}x${img.height}`);

  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Analyser les 4 bords exacts de la carte Tissenboule
  // Test de coordonnées calées :
  // Top: ~46.2%, Bottom: ~82.8%, Left: ~27.2%, Right: ~54.2%
  const candidateCorners = [
    { x: 0.272, y: 0.462 }, // TL
    { x: 0.542, y: 0.462 }, // TR
    { x: 0.542, y: 0.828 }, // BR
    { x: 0.272, y: 0.828 }  // BL
  ];

  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 4;
  ctx.beginPath();
  const pts = candidateCorners.map(p => ({ x: p.x * img.width, y: p.y * img.height }));
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

  const outPath = path.join(scratchDir, `measured_${filename}`);
  fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg'));
  console.log(`Saved measured visualization to: ${outPath}`);

  // Test extraction redressée
  const cardW = 630, cardH = 880;
  const warpCanvas = createCanvas(cardW, cardH);
  const warpCtx = warpCanvas.getContext('2d');

  // Extraction
  const srcX = pts[0].x;
  const srcY = pts[0].y;
  const srcW = pts[1].x - pts[0].x;
  const srcH = pts[2].y - pts[1].y;

  warpCtx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, cardW, cardH);
  const warpPath = path.join(scratchDir, `warp_measured_${filename}`);
  fs.writeFileSync(warpPath, warpCanvas.toBuffer('image/jpeg'));
  console.log(`Saved warped card to: ${warpPath}`);
}

measureExactCardCoordinates('media_1791478138245.jpg');
