import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function testCardNumberOCR() {
  console.log('Initializing Tesseract worker...');
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-',
    tessedit_pageseg_mode: '6' // PSM 6: Assume a single uniform block of text
  });

  // Let's test on the footer crop we created earlier
  const footerImgPath = path.join(scratchDir, 'crop_footer_exact.jpg');
  if (fs.existsSync(footerImgPath)) {
    const footerImg = await loadImage(footerImgPath);
    
    // Preprocess: Upscale 3x and high contrast binarization
    const targetW = footerImg.width * 3;
    const targetH = footerImg.height * 3;
    const c = createCanvas(targetW, targetH);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(footerImg, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    // Invert & threshold: white text on dark background -> black text on clean white background
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // If bright (text), make black (0), else white (255)
      const val = lum > 140 ? 0 : 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    const preprocessedPath = path.join(scratchDir, 'footer_binarized.jpg');
    fs.writeFileSync(preprocessedPath, c.toBuffer('image/jpeg'));

    const ret = await worker.recognize(preprocessedPath);
    console.log('--- OCR Result on Binarized Footer ---');
    console.log('Raw text:', JSON.stringify(ret.data.text));

    // Regex match for XXX/YYY
    const match = ret.data.text.match(/\b([A-Za-z0-9]{1,4})\s*[/]\s*([A-Za-z0-9]{1,4})\b/);
    if (match) {
      console.log('✨ Card Number Extracted:', `${match[1]}/${match[2]}`);
    } else {
      console.log('No direct XXX/YYY match, full words:', ret.data.words.map(w => w.text));
    }
  }

  await worker.terminate();
}

testCardNumberOCR();
