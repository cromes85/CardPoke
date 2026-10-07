import { searchCard } from '../src/utils/tcgApi.js';

async function testWhyHypocean() {
  // Simulating what happened when OCR scanned Tissenboule with imperfect text and damage 30:
  const sim = {
    primaryName: '', // primary name missed or corrupted to garbage
    candidateWords: ['Bélier', 'degats', 'Faiblesse'],
    extractedNumbers: ['50', '30', '10'], // PV 50, Bélier 30, 10 dégâts
    localId: '',
    totalInSet: ''
  };

  const res = await searchCard(sim);
  console.log('Result of sim:', res?.bestMatch?.name, res?.bestMatch?.id, res?.bestMatch?.localId);
}

testWhyHypocean();
