import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const outDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function inspectImage(filename) {
  const fullPath = path.join(uploadedDir, filename);
  const img = await loadImage(fullPath);
  console.log(`Inspecting ${filename}: ${img.width}x${img.height}`);

  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Analyser les composantes de couleur au centre et sur les bords
  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;

  // Centre de l'image (où se trouve la carte)
  const cx = Math.floor(img.width / 2);
  const cy = Math.floor(img.height / 2);
  const cIdx = (cy * img.width + cx) * 4;
  console.log(`Center pixel (Card) RGBA: [${data[cIdx]}, ${data[cIdx+1]}, ${data[cIdx+2]}, ${data[cIdx+3]}]`);

  // Bords
  const edgeIdx = (Math.floor(img.height * 0.5) * img.width + Math.floor(img.width * 0.05)) * 4;
  console.log(`Left edge pixel RGBA: [${data[edgeIdx]}, ${data[edgeIdx+1]}, ${data[edgeIdx+2]}, ${data[edgeIdx+3]}]`);
}

async function main() {
  await inspectImage('media_1791464110343.jpg');
  await inspectImage('media_1791400444020.jpg');
  await inspectImage('media_1791317302987.jpg');
}

main();
