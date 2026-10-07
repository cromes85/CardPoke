async function inspectPricing() {
  const cardIds = [
    'me02.5-050', // Sorboul de N
    'me02.5-030', // Grotichon
    'me02.5-018', // Tissenboule de la Team Rocket
    'me02.5-201', // Amos de la Team Rocket
    'sv03.5-006', // Dracaufeu ex 151
    'sv01-198',   // Gardevoir ex SAR
    'base1-4',    // Dracaufeu Set de Base
    'swsh7-215',  // Rayquaza VMAX Alt Art
    'sv08-073'    // Pikachu ex
  ];

  for (const id of cardIds) {
    const frRes = await fetch(`https://api.tcgdex.net/v2/fr/cards/${id}`);
    const frData = frRes.ok ? await frRes.json() : null;
    const enRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`);
    const enData = enRes.ok ? await enRes.json() : null;

    console.log(`\n================ ID: ${id} (${frData?.name || enData?.name}) ================`);
    console.log('FR Pricing:', JSON.stringify(frData?.pricing, null, 2));
    console.log('EN Pricing:', JSON.stringify(enData?.pricing, null, 2));
  }
}

inspectPricing();
