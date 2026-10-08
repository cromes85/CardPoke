import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function testSorboulCrop(filename) {
  const img = await loadImage(path.join(uploadedDir, filename));
  const w = img.width, h = img.height;
  console.log(`Image: ${filename} | Dimensions: ${w}x${h}`);

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Mesure des 4 coins exacts de Sorboul :
  // Top: Y ~ 486px (47.46%)
  // Bottom: Y ~ 627px (61.23%)
  // Left: X ~ 130px (27.54%)
  // Right: X ~ 253px (53.60%)

  const configs = [
    { name: 'Sorboul_Exact', tl: { x: 0.276, y: 0.474 }, br: { x: 0.536, y: 0.614 } },
    { name: 'Sorboul_Trimmed', tl: { x: 0.278, y: 0.476 }, br: { x: 0.534, y: 0.612 } }
  ];

  for (const cfg of configs) {
    const warpW = 630, warpH = 880;
    const warpCanvas = createCanvas(warpW, warpH);
    const warpCtx = warpCanvas.getContext('2d');

    const sx = cfg.tl.x * w;
    const sy = cfg.tl.y * h;
    const sw = (cfg.br.x - cfg.tl.x) * w;
    const sh = (cfg.br.y - cfg.tl.y) * h;

    warpCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, warpW, warpH);

    const outPath = path.join(scratchDir, `crop_${cfg.name}.jpg`);
    fs.writeFileSync(outPath, warpCanvas.toBuffer('image/jpeg'));
    console.log(`Saved: ${outPath} (Card W:${Math.round(sw)}px, H:${Math.round(sh)}px, Ratio: ${(sw/sh).toFixed(3)})`);
  }
}

testSorboulCrop('media_1791479014985.jpg');
