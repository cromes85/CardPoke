import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function checkWarp() {
  const img = await loadImage(path.join(scratchDir, 'test_warp_Calibrage_3_(Ajusté).jpg'));
  console.log(`Warp image dimensions: ${img.width}x${img.height}`);
}

checkWarp();
