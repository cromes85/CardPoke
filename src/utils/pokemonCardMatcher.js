/**
 * Module d'identification et de complétion des cartes Pokémon via l'API officielle TCGdex
 */

const POKEMON_CACHE = new Map();

/**
 * Recherche les cartes correspondant au nom du Pokémon et au numéro/PV
 */
export async function searchPokemonCard(name, hp = '', numberHint = '') {
  if (!name || name.trim().length < 2) return [];

  const cleanName = name.trim();
  const cacheKey = cleanName.toLowerCase();

  let cards = [];
  if (POKEMON_CACHE.has(cacheKey)) {
    cards = POKEMON_CACHE.get(cacheKey);
  } else {
    try {
      const url = `https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(cleanName)}`;
      const res = await fetch(url);
      if (res.ok) {
        cards = await res.json();
        POKEMON_CACHE.set(cacheKey, cards);
      }
    } catch (err) {
      console.warn('Erreur recherche API TCGdex:', err);
      return [];
    }
  }

  if (!Array.isArray(cards) || cards.length === 0) return [];

  // Extraire les numéros recherchés (ex: "123" ou "009" ou "123/217")
  const targetNum = numberHint ? numberHint.split('/')[0].replace(/^0+/, '') : '';
  const targetHP = hp ? hp.replace(/[^0-9]/g, '') : '';

  // Classer et filtrer les meilleures correspondances
  const scoredCards = cards.map(c => {
    let score = 0;
    const localIdClean = (c.localId || '').replace(/^0+/, '');

    if (targetNum && localIdClean === targetNum) {
      score += 100;
    }
    if (c.name.toLowerCase() === cleanName.toLowerCase()) {
      score += 30;
    }

    return {
      id: c.id,
      localId: c.localId,
      name: c.name,
      image: c.image ? `${c.image}/high.webp` : null,
      score
    };
  });

  scoredCards.sort((a, b) => b.score - a.score);
  return scoredCards.slice(0, 8);
}

/**
 * Récupère les détails complets d'une carte (extension, rareté, numéro exact)
 */
export async function getCardDetails(cardId) {
  if (!cardId) return null;

  try {
    const res = await fetch(`https://api.tcgdex.net/v2/fr/cards/${cardId}`);
    if (!res.ok) return null;
    const data = await res.json();

    const officialCount = data.set?.cardCount?.official || data.set?.cardCount?.total || '???';
    const formattedNumber = `${data.localId}/${officialCount}`;

    return {
      id: data.id,
      name: data.name,
      hp: data.hp ? `${data.hp} PV` : null,
      number: formattedNumber,
      localId: data.localId,
      setName: data.set?.name || 'Extension Pokémon',
      rarity: data.rarity || 'Commune',
      types: data.types || [],
      illustrator: data.illustrator || '',
      imageUrl: data.image ? `${data.image}/high.webp` : null,
      attacks: data.attacks?.map(a => a.name) || []
    };
  } catch (err) {
    console.warn('Erreur récupération détails carte:', err);
    return null;
  }
}
