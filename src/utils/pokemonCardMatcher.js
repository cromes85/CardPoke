/**
 * Module d'identification et de complétion des cartes Pokémon via l'API officielle TCGdex
 */

const POKEMON_SEARCH_CACHE = new Map();
const CARD_DETAILS_CACHE = new Map();

/**
 * Récupère les détails complets d'une carte (extension, rareté, numéro exact, attaques, PV)
 */
export async function getCardDetails(cardId, lang = 'fr') {
  if (!cardId) return null;

  const cacheKey = `${lang}:${cardId}`;
  if (CARD_DETAILS_CACHE.has(cacheKey)) {
    return CARD_DETAILS_CACHE.get(cacheKey);
  }

  try {
    const res = await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${cardId}`);
    if (!res.ok) {
      if (lang === 'fr') {
        // Essai en anglais si non trouvé
        return getCardDetails(cardId, 'en');
      }
      return null;
    }
    const data = await res.json();

    const officialCount = data.set?.cardCount?.official || data.set?.cardCount?.total || '???';
    const formattedNumber = `${data.localId}/${officialCount}`;

    const cardObj = {
      id: data.id,
      name: data.name,
      hp: data.hp ? `${data.hp} PV` : null,
      hpNumeric: data.hp || 0,
      number: formattedNumber,
      localId: data.localId,
      officialCount: String(officialCount),
      setName: data.set?.name || 'Extension Pokémon',
      setId: data.set?.id || '',
      rarity: data.rarity || 'Commune',
      types: data.types || [],
      illustrator: data.illustrator || '',
      imageUrl: data.image ? `${data.image}/high.webp` : null,
      attacks: data.attacks?.map(a => a.name) || []
    };

    CARD_DETAILS_CACHE.set(cacheKey, cardObj);
    return cardObj;
  } catch (err) {
    console.warn('Erreur récupération détails carte:', err);
    return null;
  }
}

/**
 * Recherche et classe les cartes correspondant au nom, PV, attaques et numéro
 */
export async function searchPokemonCard(name, hp = '', numberHint = '', bodyText = '') {
  if (!name || name.trim().length < 2) return [];

  const cleanName = name.trim();
  const cacheKey = cleanName.toLowerCase();

  let cards = [];
  if (POKEMON_SEARCH_CACHE.has(cacheKey)) {
    cards = POKEMON_SEARCH_CACHE.get(cacheKey);
  } else {
    try {
      // 1. Recherche en Français
      let url = `https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(cleanName)}`;
      let res = await fetch(url);
      if (res.ok) {
        cards = await res.json();
      }
      // 2. Si aucune carte trouvée, recherche en Anglais
      if (!Array.isArray(cards) || cards.length === 0) {
        url = `https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(cleanName)}`;
        res = await fetch(url);
        if (res.ok) {
          cards = await res.json();
        }
      }
      if (Array.isArray(cards)) {
        POKEMON_SEARCH_CACHE.set(cacheKey, cards);
      }
    } catch (err) {
      console.warn('Erreur recherche API TCGdex:', err);
      return [];
    }
  }

  if (!Array.isArray(cards) || cards.length === 0) return [];

  const cleanHP = parseInt((hp || '').replace(/[^0-9]/g, ''), 10) || null;
  const targetNum = numberHint ? numberHint.split('/')[0].replace(/^0+/, '').trim() : '';
  const targetTotal = numberHint && numberHint.includes('/') ? numberHint.split('/')[1].trim() : '';
  const lowerBody = (bodyText || '').toLowerCase();

  // Chargement parallèle des détails de toutes les cartes candidates
  const detailsList = await Promise.all(
    cards.slice(0, 45).map(c => getCardDetails(c.id))
  );

  const scoredCards = [];

  for (const card of detailsList) {
    if (!card) continue;

    let score = 0;
    const localIdClean = (card.localId || '').replace(/^0+/, '');

    // 1. Concordance Numéro (très fort)
    if (targetNum && localIdClean === targetNum) {
      score += 350;
    }
    if (targetTotal && card.officialCount === targetTotal) {
      score += 150;
    }

    // 2. Concordance PV exacte (+250) ou proche (+60)
    if (cleanHP && card.hpNumeric === cleanHP) {
      score += 250;
    } else if (cleanHP && Math.abs(card.hpNumeric - cleanHP) <= 10) {
      score += 60;
    }

    // 3. Concordance Attaques détectées par OCR (+300)
    if (card.attacks && card.attacks.length > 0 && lowerBody) {
      for (const atk of card.attacks) {
        const atkLower = atk.toLowerCase();
        if (lowerBody.includes(atkLower)) {
          score += 300;
        } else {
          // Correspondance sur les mots clés d'attaque de plus de 4 lettres
          const words = atkLower.split(/\s+/).filter(w => w.length >= 4);
          for (const w of words) {
            if (lowerBody.includes(w)) {
              score += 120;
              break;
            }
          }
        }
      }
    }

    // 4. Concordance Nom (+60)
    if (card.name.toLowerCase() === cleanName.toLowerCase()) {
      score += 60;
    }

    // 5. Bonus pour les séries récentes (Écarlate et Violet `sv`, Méga `me`, Épée et Bouclier `swsh`)
    if (card.id.startsWith('sv') || card.id.startsWith('me')) {
      score += 40;
    } else if (card.id.startsWith('swsh')) {
      score += 25;
    }

    scoredCards.push({
      ...card,
      score
    });
  }

  scoredCards.sort((a, b) => b.score - a.score);
  return scoredCards.slice(0, 10);
}

