async function findSucroquin() {
  const res = await fetch('https://api.tcgdex.net/v2/fr/cards?name=Sucroquin');
  const list = await res.json();
  console.log('Sucroquin cards:', list.map(c => `${c.name} - ${c.id} (${c.localId})`));
}

findSucroquin();
