import { searchCard } from '../src/utils/tcgApi.js';

async function testCards() {
  console.log('--- TEST 1: Amos / Amis de la Team Rocket ---');
  try {
    const res1 = await searchCard({
      primaryName: 'Amos de la Team Rocket',
      candidateWords: ['Amos', 'Team', 'Rocket', 'Dresseur'],
      extractedNumbers: ['201', '217'],
      localId: '201',
      totalInSet: '217'
    });
    console.log('Res 1:', res1 ? { name: res1.bestMatch?.name, id: res1.bestMatch?.id, set: res1.bestMatch?.set?.name } : 'NOT FOUND');
    if (res1?.alternatives) console.log('Alts 1:', res1.alternatives.map(a => `${a.name} (${a.id})`));
  } catch (e) {
    console.error('Err 1:', e);
  }

  console.log('\n--- TEST 2: Sucroquin 053/217 ---');
  try {
    const res2 = await searchCard({
      primaryName: 'Sucroquin',
      candidateWords: ['Sucroquin', 'Collision'],
      extractedNumbers: ['60', '20', '52', '53', '217'],
      localId: '53',
      totalInSet: '217'
    });
    console.log('Res 2:', res2 ? { name: res2.bestMatch?.name, id: res2.bestMatch?.id, set: res2.bestMatch?.set?.name } : 'NOT FOUND');
    if (res2?.alternatives) console.log('Alts 2:', res2.alternatives.map(a => `${a.name} (${a.id})`));
  } catch (e) {
    console.error('Err 2:', e);
  }

  console.log('\n--- TEST 3: Grotichon ---');
  try {
    const res3 = await searchCard({
      primaryName: 'Grotichon',
      candidateWords: ['Grotichon', 'SuperRoussi'],
      extractedNumbers: ['110', '70', '28', '217'],
      localId: '28',
      totalInSet: '217'
    });
    console.log('Res 3:', res3 ? { name: res3.bestMatch?.name, id: res3.bestMatch?.id, set: res3.bestMatch?.set?.name } : 'NOT FOUND');
    if (res3?.alternatives) console.log('Alts 3:', res3.alternatives.map(a => `${a.name} (${a.id})`));
  } catch (e) {
    console.error('Err 3:', e);
  }

  console.log('\n--- TEST 4: Tissenboule de la Team Rocket 018/217 ---');
  try {
    const res4 = await searchCard({
      primaryName: 'Tissenboule de la Team Rocket',
      candidateWords: ['Tissenboule', 'Team', 'Rocket', 'Bélier'],
      extractedNumbers: ['50', '30', '18', '217'],
      localId: '18',
      totalInSet: '217'
    });
    console.log('Res 4:', res4 ? { name: res4.bestMatch?.name, id: res4.bestMatch?.id, set: res4.bestMatch?.set?.name } : 'NOT FOUND');
    if (res4?.alternatives) console.log('Alts 4:', res4.alternatives.map(a => `${a.name} (${a.id})`));
  } catch (e) {
    console.error('Err 4:', e);
  }
}

testCards();
