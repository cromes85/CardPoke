// Collection and LocalStorage Management

const STORAGE_KEY = 'pokescan_user_collection_v1';

export function getSavedCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load collection:", e);
    return [];
  }
}

export function saveCardToCollection(cardData, userPhoto = null, condition = 'Near Mint', notes = '') {
  try {
    const collection = getSavedCollection();
    
    // Create new item
    const newItem = {
      id: `${cardData.id}_${Date.now()}`,
      cardId: cardData.id,
      name: cardData.name,
      localId: cardData.localId,
      set: cardData.set,
      rarity: cardData.rarity,
      image: cardData.image,
      userPhoto: userPhoto, // captured thumbnail dataUrl
      priceEur: Number(cardData.pricing?.estimatedEur || 0),
      cardmarket: cardData.pricing?.cardmarket,
      condition,
      notes,
      scannedAt: new Date().toISOString()
    };

    collection.unshift(newItem);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
    return newItem;
  } catch (e) {
    console.error("Failed to save card:", e);
    return null;
  }
}

export function removeCardFromCollection(itemId) {
  try {
    const collection = getSavedCollection().filter(c => c.id !== itemId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
    return collection;
  } catch (e) {
    console.error("Failed to remove card:", e);
    return [];
  }
}

export function clearCollection() {
  localStorage.removeItem(STORAGE_KEY);
  return [];
}

export function exportCollectionToCsv(collection) {
  if (!collection || collection.length === 0) return;

  const headers = ['Nom', 'Numero', 'Extension', 'Rarete', 'Etat', 'Valeur_Estimee_EUR', 'Date_Scan', 'Notes'];
  const rows = collection.map(c => [
    `"${c.name.replace(/"/g, '""')}"`,
    `"${c.localId}"`,
    `"${(c.set?.name || '').replace(/"/g, '""')}"`,
    `"${c.rarity}"`,
    `"${c.condition}"`,
    c.priceEur.toFixed(2),
    `"${c.scannedAt}"`,
    `"${(c.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `pokescan_collection_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportCollectionToJson(collection) {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(collection, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `pokescan_collection_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function importCollectionFromJson(jsonData) {
  try {
    const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    if (Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) {
    console.error("Import JSON failed:", e);
    throw new Error("Fichier JSON invalide");
  }
}
