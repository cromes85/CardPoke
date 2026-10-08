import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function findExactCardEdges(filename) {
  const img = await loadImage(path.join(uploadedDir, filename));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;
  const w = img.width, h = img.height;

  // Analyser les gradients au niveau des bords de la carte Tissenboule
  // 1. Bord gauche (autour de X ~ 125px / 472 = 26.5%)
  // 2. Bord droit (autour de X ~ 258px / 472 = 54.7%)
  // 3. Bord haut (autour de Y ~ 472px / 1024 = 46.1%)
  // 4. Bord bas (autour de Y ~ 845px / 1024 = 82.5%)

  console.log(`Image size: ${w}x${h}`);

  // Test plusieurs réglages
  const testSets = [
    { name: 'Calibrage 1', tl: { x: 0.272, y: 0.462 }, br: { x: 0.545, y: 0.828 } },
    { name: 'Calibrage 2', tl: { x: 0.268, y: 0.458 }, br: { x: 0.548, y: 0.835 } },
    { name: 'Calibrage 3 (Ajusté)', tl: { x: 0.270, y: 0.460 }, br: { x: 0.544, y: 0.832 } }
  ];

  for (const t of testSets) {
    const cardW = 630, cardH = 880;
    const warpCanvas = createCanvas(cardW, cardH);
    const warpCtx = warpCanvas.getContext('2d');

    const srcX = t.tl.x * w;
    const srcY = t.tl.y * h;
    const srcW = (t.br.x - t.tl.x) * w;
    const srcH = (t.br.y - t.tl.y) * h;

    warpCtx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, cardW, cardH);
    const outPath = path.join(scratchDir, `test_warp_${t.name.replace(/\s+/g, '_')}.jpg`);
    fs.writeFileSync(outPath, warpCanvas.toBuffer('image/jpeg'));
    console.log(`Generated: ${outPath} (Ratio: ${(srcW/srcH).toFixed(3)})`);
  }
}

findExactCardEdges('media_1791478138245.jpg');
