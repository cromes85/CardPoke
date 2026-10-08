import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function generateDebugEdgeMap(filename) {
  const img = await loadImage(path.join(uploadedDir, filename));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;

  // Créer une carte de saturation + gradient couleur
  const edgeCanvas = createCanvas(img.width, img.height);
  const edgeCtx = edgeCanvas.getContext('2d');
  const edgeImgData = edgeCtx.createImageData(img.width, img.height);
  const edgeData = edgeImgData.data;

  const w = img.width, h = img.height;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max > 0 ? (max - min) / max : 0;
      const colorDistFromWhite = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);

      // Gradient couleur euclidien
      const idxR = (y * w + (x + 1)) * 4;
      const idxD = ((y + 1) * w + x) * 4;

      const dRx = data[idxR] - r, dGx = data[idxR + 1] - g, dBx = data[idxR + 2] - b;
      const dRy = data[idxD] - r, dGy = data[idxD + 1] - g, dBy = data[idxD + 2] - b;

      const grad = Math.sqrt(dRx * dRx + dGx * dGx + dBx * dBx + dRy * dRy + dGy * dGy + dBy * dBy);

      // Si c'est un bord ou une couleur non blanche
      const isCard = (grad > 20 || (sat > 0.12 && colorDistFromWhite > 60)) ? 255 : 0;

      edgeData[idx] = isCard;
      edgeData[idx + 1] = isCard;
      edgeData[idx + 2] = isCard;
      edgeData[idx + 3] = 255;
    }
  }

  edgeCtx.putImageData(edgeImgData, 0, 0);
  fs.writeFileSync(path.join(scratchDir, `edgemap_${filename}`), edgeCanvas.toBuffer('image/jpeg'));
  console.log(`Saved edgemap for ${filename}`);
}

generateDebugEdgeMap('media_1791467710063.jpg');
