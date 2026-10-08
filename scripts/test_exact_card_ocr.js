import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function testExactCardOCR() {
  const imgPath = path.join(uploadedDir, 'media_1791484444435_bc67493a.jpg');
  const img = await loadImage(imgPath);

  // In screenshot: card is between X: 68 to 404 (width 336), Y: 248 to 718 (height 470)
  const cardCanvas = createCanvas(336, 470);
  cardCanvas.getContext('2d').drawImage(img, 68, 248, 336, 470, 0, 0, 336, 470);
  fs.writeFileSync(path.join(scratchDir, 'cropped_inner_card.jpg'), cardCanvas.toBuffer('image/jpeg'));

  // Now on this clean card, let's look at the footer:
  // Footer is around Y: 435 to 465 (bottom 30px), X: 15 to 160
  const footerW = 160;
  const footerH = 30;
  const footerCanvas = createCanvas(footerW * 4, footerH * 4); // 4x scale for high OCR sharpness
  const fCtx = footerCanvas.getContext('2d');
  fCtx.imageSmoothingEnabled = true;
  fCtx.drawImage(cardCanvas, 15, 435, footerW, footerH, 0, 0, footerW * 4, footerH * 4);

  fs.writeFileSync(path.join(scratchDir, 'footer_raw_scaled.jpg'), footerCanvas.toBuffer('image/jpeg'));

  // Test OCR on raw scaled footer and enhanced
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-[]',
    tessedit_pageseg_mode: '6'
  });

  const retRaw = await worker.recognize(path.join(scratchDir, 'footer_raw_scaled.jpg'));
  console.log('Raw Footer OCR:', JSON.stringify(retRaw.data.text));

  // Let's also test binarized version
  const fImgData = fCtx.getImageData(0, 0, footerW * 4, footerH * 4);
  const data = fImgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Text is bright white on dark card
    const v = lum > 100 ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  fCtx.putImageData(fImgData, 0, 0);
  fs.writeFileSync(path.join(scratchDir, 'footer_binarized_4x.jpg'), footerCanvas.toBuffer('image/jpeg'));

  const retBin = await worker.recognize(path.join(scratchDir, 'footer_binarized_4x.jpg'));
  console.log('Binarized Footer OCR:', JSON.stringify(retBin.data.text));

  await worker.terminate();
}

testExactCardOCR();
