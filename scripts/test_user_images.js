import { createWorker } from 'tesseract.js';

async function run() {
  const worker = await createWorker('eng');
  const files = [
    'media_1791369700353.jpg',
    'media_1791369700648.jpg',
    'media_1791369700651.jpg'
  ];
  for (const f of files) {
    const p = 'C:/Users/Home-Pc1/.gemini/antigravity/brain/e168293f-b166-4fc3-be12-bf9632636c6d/.user_uploaded/' + f;
    const res = await worker.recognize(p);
    console.log('====================================');
    console.log('FILE:', f);
    console.log(res.data.text);
  }
  await worker.terminate();
}

run();
