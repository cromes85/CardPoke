import { searchCard, getCardDetails } from '../src/utils/tcgApi.js';

const testValuationCases = [
  {
    name: 'Dracaufeu Set de Base (4/102)',
    params: { primaryName: 'Dracaufeu', localId: '4', totalInSet: '102', setCode: 'BASE' },
    expectedMinPrice: 200
  },
  {
    name: 'Noctali VMAX Alt Art (215/203)',
    params: { primaryName: 'Noctali VMAX', localId: '215', totalInSet: '203', setCode: 'EVS' },
    expectedMinPrice: 1000
  },
  {
    name: 'Dracaufeu-ex 151 (006/165)',
    params: { primaryName: 'Dracaufeu-ex', localId: '006', totalInSet: '165', setCode: 'MEW' },
    expectedMinPrice: 4
  },
  {
    name: 'Tissenboule de la Team Rocket (018/217)',
    params: { primaryName: 'Tissenboule de la Team Rocket', localId: '018', totalInSet: '217', setCode: 'ASC' },
    expectedMinPrice: 0.02
  },
  {
    name: 'Sorboul de N (050/217)',
    params: { primaryName: 'Sorboul de N', localId: '050', totalInSet: '217', setCode: 'ASC' },
    expectedMinPrice: 0.02
  },
  {
    name: 'Grotichon (030/217)',
    params: { primaryName: 'Grotichon', localId: '030', totalInSet: '217', setCode: 'ASC' },
    expectedMinPrice: 0.02
  },
  {
    name: 'Amos de la Team Rocket (201/217)',
    params: { primaryName: 'Amos de la Team Rocket', localId: '201', totalInSet: '217', setCode: 'ASC' },
    expectedMinPrice: 0.02
  }
];

async function runValuationTest() {
  console.log('==============================================');
  console.log('🧪 TEST DE VALORISATION & COMPARAISON DES PRIX');
  console.log('==============================================');

  for (const tc of testValuationCases) {
    const res = await searchCard(tc.params);
    const card = res?.bestMatch;

    if (!card) {
      console.error(`❌ Non trouvé : ${tc.name}`);
      continue;
    }

    const price = Number(card.pricing?.estimatedEur || 0);
    const cm = card.pricing?.cardmarket || {};
    const tcg = card.pricing?.tcgplayer || {};

    console.log(`\n📌 ${card.name} (${card.id}) - ${card.set?.name} #${card.localId}`);
    console.log(`   💶 Prix Estimé : ${price.toFixed(2)} €`);
    console.log(`   📊 Cardmarket Tendance : ${cm.trend} € | Moyenne 30j : ${cm.avg} € | Min : ${cm.low} € | Holo : ${cm.holo || 'N/A'} €`);
    console.log(`   🇺🇸 TCGPlayer : $${tcg.marketUsd || 'N/A'}`);
    console.log(`   ⭐ Statut Gradation : ${card.grading?.badge}`);

    if (price >= tc.expectedMinPrice) {
      console.log(`   ✅ Valorisation Conforme (>= ${tc.expectedMinPrice} €)`);
    } else {
      console.warn(`   ⚠️ Valorisation Inférieure à l'attente (${price} € vs ${tc.expectedMinPrice} €)`);
    }
  }
}

runValuationTest();
