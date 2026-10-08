import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const uploadedDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded';
const scratchDir = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/scratch';

async function inspectAllCards() {
  const worker = await createWorker('fra+eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéèêàùâôîïç.-PV',
    tessedit_pageseg_mode: '6'
  });

  const cards = [
    { name: 'Macronium', file: 'media_1791485353568_440b371f.jpg' },
    { name: 'Fantominus', file: 'media_1791485353612_2b5e2ee3.jpg' },
    { name: 'Sucroquin', file: 'media_1791485353718_1663d2e8.jpg' }
  ];

  for (const c of cards) {
    const img = await loadImage(path.join(uploadedDir, c.file));
    
    // In phone screenshot, inner card is at X: 68 to 404 (w 336), Y: 248 to 718 (h 470)
    const cardCanvas = createCanvas(336, 470);
    cardCanvas.getContext('2d').drawImage(img, 68, 248, 336, 470, 0, 0, 336, 470);

    // 1. Title zone: X: 50 to 220, Y: 15 to 45
    const titleCanvas = createCanvas(180 * 2, 35 * 2);
    titleCanvas.getContext('2d').drawImage(cardCanvas, 50, 15, 180, 35, 0, 0, 180 * 2, 35 * 2);
    const titlePath = path.join(scratchDir, `${c.name}_title.jpg`);
    fs.writeFileSync(titlePath, titleCanvas.toBuffer('image/jpeg'));

    // 2. HP (PV) zone: X: 210 to 300, Y: 15 to 45
    const hpCanvas = createCanvas(90 * 2, 35 * 2);
    hpCanvas.getContext('2d').drawImage(cardCanvas, 210, 15, 90, 35, 0, 0, 90 * 2, 35 * 2);
    const hpPath = path.join(scratchDir, `${c.name}_hp.jpg`);
    fs.writeFileSync(hpPath, hpCanvas.toBuffer('image/jpeg'));

    // 3. Footer zone: X: 15 to 170, Y: 430 to 465
    const footerCanvas = createCanvas(160 * 3, 35 * 3);
    footerCanvas.getContext('2d').drawImage(cardCanvas, 15, 430, 160, 35, 0, 0, 160 * 3, 35 * 3);
    const footerPath = path.join(scratchDir, `${c.name}_footer.jpg`);
    fs.writeFileSync(footerPath, footerCanvas.toBuffer('image/jpeg'));

    // OCR Test
    const titleRes = await worker.recognize(titlePath);
    const hpRes = await worker.recognize(hpPath);
    const footerRes = await worker.recognize(footerPath);

    console.log(`\n=== Card: ${c.name} ===`);
    console.log('Title OCR:', JSON.stringify(titleRes.data.text.trim()));
    console.log('HP OCR:   ', JSON.stringify(hpRes.data.text.trim()));
    console.log('Footer OCR:', JSON.stringify(footerRes.data.text.trim()));
  }

  await worker.terminate();
}

inspectAllCards();
