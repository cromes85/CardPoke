import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function testTitleAndHP() {
  const worker = await createWorker('fra+eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèêàùâôîïç.-PV',
    tessedit_pageseg_mode: '7' // Single line
  });

  const cards = [
    { name: 'Macronium', file: 'media_1791485353568_440b371f.jpg' },
    { name: 'Fantominus', file: 'media_1791485353612_2b5e2ee3.jpg' },
    { name: 'Sucroquin', file: 'media_1791485353718_1663d2e8.jpg' }
  ];

  for (const c of cards) {
    const img = await loadImage(path.join(uploadedDir, c.file));
    
    // In screenshot: card is X: 68 to 404 (w 336), Y: 160 to 630 (h 470)
    const cardCanvas = createCanvas(336, 470);
    cardCanvas.getContext('2d').drawImage(img, 68, 160, 336, 470, 0, 0, 336, 470);

    // Title area: X: 45 to 220, Y: 10 to 45
    const titleCanvas = createCanvas(200 * 3, 35 * 3);
    const tCtx = titleCanvas.getContext('2d');
    tCtx.imageSmoothingEnabled = true;
    tCtx.drawImage(cardCanvas, 45, 10, 200, 35, 0, 0, 200 * 3, 35 * 3);

    // HP area: X: 215 to 300, Y: 10 to 45
    const hpCanvas = createCanvas(85 * 3, 35 * 3);
    const hCtx = hpCanvas.getContext('2d');
    hCtx.imageSmoothingEnabled = true;
    hCtx.drawImage(cardCanvas, 215, 10, 85, 35, 0, 0, 85 * 3, 35 * 3);

    const titlePath = path.join(scratchDir, `${c.name}_title_clean.jpg`);
    const hpPath = path.join(scratchDir, `${c.name}_hp_clean.jpg`);
    fs.writeFileSync(titlePath, titleCanvas.toBuffer('image/jpeg'));
    fs.writeFileSync(hpPath, hpCanvas.toBuffer('image/jpeg'));

    const resTitle = await worker.recognize(titlePath);
    const resHP = await worker.recognize(hpPath);

    console.log(`\n=== Card: ${c.name} ===`);
    console.log('Title text:', JSON.stringify(resTitle.data.text.trim()));
    console.log('HP text:   ', JSON.stringify(resHP.data.text.trim()));
  }

  await worker.terminate();
}

testTitleAndHP();
