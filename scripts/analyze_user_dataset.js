import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';

async function main() {
  const files = fs.readdirSync(uploadedDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  console.log(`Found ${files.length} user photos to analyze.`);

  for (const f of files) {
    const fullPath = path.join(uploadedDir, f);
    try {
      const img = await loadImage(fullPath);
      console.log(`Image: ${f} | Dimensions: ${img.width}x${img.height}`);
    } catch (e) {
      console.error(`Error loading ${f}:`, e.message);
    }
  }
}

main();
