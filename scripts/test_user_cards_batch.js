import { searchCard } from '../src/utils/tcgApi.js';
import { ocrService } from '../src/utils/ocrService.js';

const testCards = [
  {
    name: 'Sorboul de N',
    topText: 'NIVEAU 1 Sorboul de N PV 100',
    fullText: `
      NIVEAU 1 Sorboul de N PV 100
      Évolution de : Sorbébé de N
      Flop 20
      Glaciation 60
      Pendant le prochain tour de votre adversaire, le Pokémon Défenseur ne peut pas utiliser d'attaques.
      ASC 050/217
    `
  },
  {
    name: 'Grotichon',
    topText: 'NIVEAU 1 Grotichon PV 110',
    fullText: `
      NIVEAU 1 Grotichon PV 110
      Évolution de : Gruikui
      Super Roussi 70
      Le Pokémon Actif de votre adversaire est maintenant Brûlé.
      ASC 030/217
    `
  },
  {
    name: 'Tissenboule de la Team Rocket',
    topText: 'BASE Tissenboule de la Team Rocket PV 50',
    fullText: `
      BASE Tissenboule de la Team Rocket PV 50
      Bélier 30
      ASC 018/217
    `
  }
];

async function run() {
  for (const c of testCards) {
    console.log(`\n=============================`);
    console.log(`Testing card: ${c.name}`);
    const parsed = ocrService.parseCardData(c.topText, c.fullText);
    console.log(`Parsed Data:`, parsed);
    const searchRes = await searchCard(parsed);
    console.log(`Result: ${searchRes?.bestMatch?.name} (${searchRes?.bestMatch?.id}) - Set: ${searchRes?.bestMatch?.set?.name} - Price: ${searchRes?.bestMatch?.pricing?.estimatedEur} €`);
  }
}

run();
