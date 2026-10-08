import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function cropChute(filename) {
  const img = await loadImage(path.join(uploadedDir, filename));
  console.log(`Cropping chute for ${filename}: ${img.width}x${img.height}`);

  // Chute ROI: X in [0.20, 0.60], Y in [0.40, 0.75]
  const cx = img.width * 0.22;
  const cy = img.height * 0.44;
  const cw = img.width * 0.36;
  const ch = img.height * 0.30;

  const canvas = createCanvas(cw, ch);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);

  fs.writeFileSync(path.join(scratchDir, `chute_crop_${filename}`), canvas.toBuffer('image/jpeg'));
  console.log(`Saved chute crop to scratch`);
}

cropChute('media_1791467710063.jpg');
