import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function analyzeCardInTunnel(filename) {
  const fullPath = path.join(uploadedDir, filename);
  const img = await loadImage(fullPath);
  console.log(`Analyzing ${filename}: ${img.width}x${img.height}`);

  const targetW = 360;
  const scale = targetW / img.width;
  const targetH = Math.round(img.height * scale);

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  // Calculer la variance de couleur / saturation locale (Color Saturation & Texture Map)
  // Une carte Pokémon a des couleurs vives et de la texture, le support 3D est du plastique blanc/gris uni !
  const cardScoreMap = new Float32Array(targetW * targetH);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const idx = (y * targetW + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max > 0 ? (max - min) / max : 0; // Saturation HSV

      // Écart par rapport au gris/blanc neutre du plastique 3D
      const colorSpread = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);

      // Score de présence de carte (couleur + contraste local)
      cardScoreMap[y * targetW + x] = sat * 50 + (colorSpread > 15 ? 50 : 0);
    }
  }

  // Trouver le centre de masse des couleurs de la carte
  let totalScore = 0, sumX = 0, sumY = 0;
  for (let y = Math.round(targetH * 0.10); y < Math.round(targetH * 0.90); y++) {
    for (let x = Math.round(targetW * 0.10); x < Math.round(targetW * 0.90); x++) {
      const s = cardScoreMap[y * targetW + x];
      if (s > 25) {
        totalScore += s;
        sumX += x * s;
        sumY += y * s;
      }
    }
  }

  const cardCenterX = sumX / totalScore;
  const cardCenterY = sumY / totalScore;

  console.log(`Card detected at Center: (${Math.round(cardCenterX)}, ${Math.round(cardCenterY)}) in normalized coords: (${(cardCenterX/targetW).toFixed(2)}, ${(cardCenterY/targetH).toFixed(2)})`);

  // Sauvegarder image avec le vrai centre et les vrais bords
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#ff0055';
  ctx.beginPath();
  ctx.arc(cardCenterX, cardCenterY, 6, 0, Math.PI * 2);
  ctx.fill();

  const outPath = path.join(scratchDir, `color_center_${filename}`);
  fs.writeFileSync(outPath, canvas.toBuffer('image/jpeg'));
  console.log(`Saved result to ${outPath}`);
}

async function main() {
  await analyzeCardInTunnel('media_1791467710063.jpg');
}

main();
