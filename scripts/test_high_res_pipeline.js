import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

// Find a good card photo in uploaded dir
const files = fs.readdirSync(uploadedDir);
console.log('Available uploads:', files);

// Let's test on the latest user image
const userImgFile = files.find(f => f.includes('39de8532') || f.includes('1791482389800')) || files[0];
console.log('Testing with file:', userImgFile);

async function testPipeline() {
  const img = await loadImage(path.join(uploadedDir, userImgFile));
  console.log('Loaded:', img.width, 'x', img.height);
}

testPipeline();
