import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function verifyCardCrop() {
  const img = await loadImage(path.join(uploadedDir, 'media_1791479014985.jpg'));
  const w = img.width, h = img.height;

  // Calibrage exact :
  const corners = [
    { x: 0.276, y: 0.474 }, // TL
    { x: 0.536, y: 0.474 }, // TR
    { x: 0.536, y: 0.614 }, // BR
    { x: 0.276, y: 0.614 }  // BL
  ];

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const cardW = 630, cardH = 880;
  const warpCanvas = createCanvas(cardW, cardH);
  const warpCtx = warpCanvas.getContext('2d');

  const sx = corners[0].x * w;
  const sy = corners[0].y * h;
  const sw = (corners[1].x - corners[0].x) * w;
  const sh = (corners[2].y - corners[1].y) * h;

  warpCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, cardW, cardH);

  const outPath = path.join(scratchDir, 'sorboul_perfect_630x880.jpg');
  fs.writeFileSync(outPath, warpCanvas.toBuffer('image/jpeg'));
  console.log(`Saved verified crop to: ${outPath}`);
}

verifyCardCrop();
