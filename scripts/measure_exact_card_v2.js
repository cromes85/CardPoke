import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function measureExactCard(filename) {
  const img = await loadImage(path.join(uploadedDir, filename));
  const w = img.width, h = img.height;
  console.log(`Image: ${filename} | Dimensions: ${w}x${h}`);

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Analyser les 4 coins exacts de la carte dans media_1791478701025.jpg :
  // TL: X ~ 132px (28.0%), Y ~ 488px (47.7%)
  // TR: X ~ 252px (53.4%), Y ~ 488px (47.7%)
  // BR: X ~ 252px (53.4%), Y ~ 666px (65.0%)
  // BL: X ~ 132px (28.0%), Y ~ 666px (65.0%)

  // Testons plusieurs calibrations fines pour trouver la perfection absolue :
  const configs = [
    { name: 'Calib_A_Exact', tl: { x: 0.280, y: 0.476 }, br: { x: 0.534, y: 0.652 } },
    { name: 'Calib_B_FullBorder', tl: { x: 0.278, y: 0.474 }, br: { x: 0.536, y: 0.654 } },
    { name: 'Calib_C_Snug', tl: { x: 0.279, y: 0.475 }, br: { x: 0.535, y: 0.653 } }
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

    const outPath = path.join(scratchDir, `exact_crop_${cfg.name}.jpg`);
    fs.writeFileSync(outPath, warpCanvas.toBuffer('image/jpeg'));
    console.log(`Saved: ${outPath} | Card Width:${Math.round(sw)}px, Height:${Math.round(sh)}px (Ratio: ${(sw/sh).toFixed(3)})`);

    // Dessiner sur l'image globale
    const debugCanvas = createCanvas(w, h);
    const dctx = debugCanvas.getContext('2d');
    dctx.drawImage(img, 0, 0);

    dctx.strokeStyle = '#00ff88';
    dctx.lineWidth = 3;
    dctx.strokeRect(sx, sy, sw, sh);

    dctx.fillStyle = '#ff0055';
    dctx.beginPath(); dctx.arc(sx, sy, 6, 0, Math.PI * 2); dctx.fill();
    dctx.beginPath(); dctx.arc(sx + sw, sy, 6, 0, Math.PI * 2); dctx.fill();
    dctx.beginPath(); dctx.arc(sx + sw, sy + sh, 6, 0, Math.PI * 2); dctx.fill();
    dctx.beginPath(); dctx.arc(sx, sy + sh, 6, 0, Math.PI * 2); dctx.fill();

    fs.writeFileSync(path.join(scratchDir, `debug_box_${cfg.name}.jpg`), debugCanvas.toBuffer('image/jpeg'));
  }
}

measureExactCard('media_1791478701025.jpg');
