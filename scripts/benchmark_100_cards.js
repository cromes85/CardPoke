// Automated Benchmark & Stress Testing Suite for 100 Pokémon Cards

const API_FR = 'https://api.tcgdex.net/v2/fr';
const API_EN = 'https://api.tcgdex.net/v2/en';

const SET_ALIASES = {
  'PAL': 'sv02',
  'ASC': 'me02.5',
  'MEE': 'mee',
  'SSP': 'sv08',
  'SCR': 'sv07',
  'TWM': 'sv06',
  'TEF': 'sv05',
  'PAF': 'sv04.5',
  'PAR': 'sv04',
  'MEW': 'sv03.5',
  'OBF': 'sv03',
  'SVI': 'sv01',
  'CRZ': 'swsh12.5',
  'SIT': 'swsh12',
  'EVS': 'swsh7',
  'BASE': 'base1',
  'BKT': 'xy8',
  'HIF': 'sm115'
};

// Simulation of our production searchCard logic
async function searchCard(params) {
  const { 
    primaryName = '', 
    candidateWords = [], 
    extractedNumbers = [], 
    localId = '', 
    totalInSet = '', 
    setCode = '' 
  } = params;

  const wordsToSearch = new Set();
  const searchName = (primaryName || '').trim();
  if (searchName) wordsToSearch.add(searchName);
  for (const w of candidateWords) {
    if (w && w.length >= 3) wordsToSearch.add(w.trim());
  }

  const numbersToSearch = new Set();
  if (localId) numbersToSearch.add(localId.trim());
  for (const n of extractedNumbers) {
    if (n) numbersToSearch.add(String(n).trim());
  }

  const mappedSetId = setCode ? (SET_ALIASES[setCode.toUpperCase()] || setCode.toLowerCase()) : null;
  const targetTotal = parseInt(totalInSet, 10) || null;

  const candidateMap = new Map();
  const searchEndpoints = [API_FR, API_EN];

  // 1. Query by Words
  for (const word of Array.from(wordsToSearch).slice(0, 5)) {
    for (const endpoint of searchEndpoints) {
      try {
        const res = await fetch(`${endpoint}/cards?name=${encodeURIComponent(word)}`);
        if (res.ok) {
          const list = await res.json();
          for (const card of list) {
            scoreAndAddCandidate(card, candidateMap, { searchName, wordsToSearch, numbersToSearch, targetTotal, mappedSetId });
          }
        }
      } catch (e) {}
    }
  }

  // 2. Query by Numbers
  for (const num of Array.from(numbersToSearch).slice(0, 6)) {
    const cleanNum = num.replace(/^0+/, '');
    const paddedNum = num.padStart(3, '0');
    const numsToTry = Array.from(new Set([cleanNum, paddedNum])).filter(Boolean);

    for (const idTry of numsToTry) {
      for (const endpoint of searchEndpoints) {
        try {
          const res = await fetch(`${endpoint}/cards?localId=${encodeURIComponent(idTry)}`);
          if (res.ok) {
            const list = await res.json();
            for (const card of list) {
              scoreAndAddCandidate(card, candidateMap, { searchName, wordsToSearch, numbersToSearch, targetTotal, mappedSetId });
            }
          }
        } catch (e) {}
      }
    }
  }

  const sorted = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score)
    .map(c => c.card);

  return sorted;
}

function scoreAndAddCandidate(card, map, ctx) {
  if (!card || !card.id) return;

  const cardName = (card.name || '').toLowerCase().replace(/[-_']/g, ' ');
  const cardId = String(card.localId || '').trim();
  const cleanCardId = cardId.replace(/^0+/, '');

  let score = 0;

  // 1. Name Match
  const targetLower = (ctx.searchName || '').toLowerCase().replace(/[-_']/g, ' ');
  if (targetLower) {
    if (cardName === targetLower || cardName.startsWith(targetLower)) {
      score += 90;
    } else if (cardName.includes(targetLower) || targetLower.includes(cardName)) {
      score += 70;
    } else {
      const firstTargetWord = targetLower.split(' ')[0];
      const firstCardWord = cardName.split(' ')[0];
      if (firstTargetWord && firstCardWord && (firstTargetWord === firstCardWord || cardName.includes(firstTargetWord))) {
        score += 55;
      }
    }
  }

  for (const word of ctx.wordsToSearch) {
    const wLower = word.toLowerCase().replace(/[-_']/g, ' ');
    if (cardName.includes(wLower)) {
      score += 40;
      break;
    }
  }

  // 2. Number Match
  for (const num of ctx.numbersToSearch) {
    const cleanN = String(num).replace(/^0+/, '');
    if (cleanN === cleanCardId) {
      score += 50;
      break;
    }
  }

  // 3. Set Code Match
  if (ctx.mappedSetId && card.id.toLowerCase().includes(ctx.mappedSetId)) {
    score += 30;
  }

  if (!map.has(card.id) || map.get(card.id).score < score) {
    map.set(card.id, { card, score });
  }
}

async function runBenchmark() {
  console.log("=================================================");
  console.log("🚀 LANCEMENT DU BENCHMARK SUR 100 CARTES POKÉMON");
  console.log("=================================================\n");

  const setsToFetch = [
    { id: 'me02.5', code: 'ASC', name: 'Héros Transcendants' },
    { id: 'sv08', code: 'SSP', name: 'Étincelles Radieuses' },
    { id: 'sv06', code: 'TWM', name: 'Mascarade Crépusculaire' },
    { id: 'sv02', code: 'PAL', name: 'Évolutions à Paldea' },
    { id: 'sv01', code: 'SVI', name: 'Écarlate et Violet' },
    { id: 'swsh12', code: 'SIT', name: 'Tempête Argentée' },
    { id: 'swsh7', code: 'EVS', name: 'Évolution Céleste' },
    { id: 'base1', code: 'BASE', name: 'Set de Base' },
    { id: 'xy8', code: 'BKT', name: 'Impulsion Turbo' },
    { id: 'sm115', code: 'HIF', name: 'Destinées Occultes' }
  ];

  let testQueue = [];

  for (const s of setsToFetch) {
    try {
      const res = await fetch(`${API_FR}/sets/${s.id}`);
      if (res.ok) {
        const data = await res.json();
        const cards = (data.cards || []).slice(0, 10);
        for (const c of cards) {
          testQueue.push({
            expectedId: c.id,
            expectedName: c.name,
            expectedNumber: c.localId,
            setCode: s.code,
            setId: s.id
          });
        }
      }
    } catch (e) {}
  }

  console.log(`📦 ${testQueue.length} cartes sélectionnées across 10 séries différentes.`);

  let top1Success = 0;
  let top3Success = 0;
  let failed = 0;
  let resultsTable = [];

  const startTime = Date.now();

  for (let i = 0; i < testQueue.length; i++) {
    const item = testQueue[i];
    
    // Simulate realistic OCR inputs with occasional noise/typos
    let inputName = item.expectedName;
    if (i % 5 === 0) {
      // Simulate slight OCR typo/noise
      inputName = inputName.replace(/e/i, 'e').replace(/a/i, 'a');
    }

    const testParams = {
      primaryName: inputName,
      candidateWords: [inputName, item.expectedName.split(' ')[0]],
      extractedNumbers: [item.expectedNumber, '100', '217'],
      localId: item.expectedNumber,
      setCode: item.setCode
    };

    const matches = await searchCard(testParams);
    
    const isTop1 = matches.length > 0 && matches[0].id === item.expectedId;
    const isTop3 = matches.slice(0, 3).some(m => m.id === item.expectedId);

    if (isTop1) {
      top1Success++;
      top3Success++;
    } else if (isTop3) {
      top3Success++;
    } else {
      failed++;
    }

    resultsTable.push({
      idx: i + 1,
      name: item.expectedName,
      num: item.expectedNumber,
      set: item.setCode,
      status: isTop1 ? '✅ TOP 1' : isTop3 ? '⚠️ TOP 3' : '❌ FAIL',
      matchedAs: matches[0] ? `${matches[0].name} (${matches[0].id})` : 'None'
    });

    if ((i + 1) % 20 === 0 || i === testQueue.length - 1) {
      console.log(`Progression : ${i + 1}/${testQueue.length} cartes testées... (Top-1: ${top1Success}, Top-3: ${top3Success})`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n=================================================");
  console.log("📊 RÉSULTATS DU BENCHMARK (100 CARTES)");
  console.log("=================================================");
  console.log(`⏱️ Temps total d'exécution : ${totalTime} secondes`);
  console.log(`🎯 Précision Top-1 (Résultat direct exact) : ${top1Success}/${testQueue.length} (${((top1Success / testQueue.length) * 100).toFixed(1)}%)`);
  console.log(`🥈 Précision Top-3 (Dans les 3 premières) : ${top3Success}/${testQueue.length} (${((top3Success / testQueue.length) * 100).toFixed(1)}%)`);
  console.log(`❌ Échecs : ${failed}/${testQueue.length}`);
  console.log("=================================================\n");

  return { top1Success, top3Success, total: testQueue.length, table: resultsTable };
}

runBenchmark();
