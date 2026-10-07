import { searchCard } from '../src/utils/tcgApi.js';

// Let's test the 4 user cards with the exact text from Tesseract
const cardCases = [
  {
    title: 'Tissenboule de la Team Rocket (ASC 018/217)',
    rawText: `
      BASE Tissenboule de la Team Rocket PV 50
      Bélier 30
      Ce Pokémon s'inflige aussi 10 dégâts.
      ASC 018/217
    `
  },
  {
    title: 'Amos de la Team Rocket (ASC 201/217)',
    rawText: `
      DRESSEUR
      Amos de la Team Rocket
      Vous ne pouvez utiliser cette carte que si un de vos Pokémon de la Team Rocket a été mis K.O.
      ED 201/217
    `
  },
  {
    title: 'Sucroquin (ASC 093/217)',
    rawText: `
      Sucroquin PV 60
      Collision 20
      ASC 093/217
    `
  },
  {
    title: 'Grotichon (ASC 030/217)',
    rawText: `
      NIVEAU 1 Grotichon PV 110
      SuperRoussi 70
      ASC 030/217
    `
  }
];

// Enhanced Name & Field Extractor
function parseEnhanced(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let primaryName = '';
  let localId = '';
  let totalInSet = '';
  let setCode = '';
  const candidateWords = [];

  // 1. Check for Set Code (ASC, ME02.5, PAL, SVI, etc.)
  const setMatch = text.match(/\b(ASC|ME02\.5|MEE|PAL|SSP|SCR|TWM|TEF|PAF|PAR|MEW|OBF|SVI|CRZ|SIT|EVS|SWSH\d*|SM\d*|XY\d*|BW\d*|DP\d*|BASE)\b/i);
  if (setMatch) {
    setCode = setMatch[1].toUpperCase();
  }

  // 2. Check for Fraction (e.g. 018/217, 201/217, 030/217, 093/217)
  const fracMatch = text.match(/(\d{1,3})\s*(?:\/|\||I|l)\s*(\d{2,3})/);
  if (fracMatch) {
    localId = fracMatch[1];
    totalInSet = fracMatch[2];
  }

  // 3. Name Pattern from Header Line
  for (const line of lines) {
    // Header pattern: [BASE/NIVEAU/DRESSEUR] <NAME> [PV/HP xx]
    const headerMatch = line.match(/(?:BASE|BASIC|NIVEAU\s*\d?|STAGE\s*\d?|DRESSEUR|TRAINER)?\s*([A-Za-zÀ-ÿ\s'-]+?)\s*(?:PV|HP|P\/V|H\/P|\d{2,3}\s*PV|\d{2,3}\s*HP|$)/i);
    if (headerMatch && headerMatch[1]) {
      let candidate = headerMatch[1].trim()
        .replace(/^(BASE|BASIC|NIVEAU|STAGE|DRESSEUR|TRAINER|Évolution|Evolution)\s*/gi, '')
        .replace(/\s*(PV|HP|P\/V|H\/P|\d+)$/gi, '')
        .trim();
      
      if (candidate.length >= 3 && !/^(attaque|degats|faiblesse|resistance|retraite)$/i.test(candidate)) {
        primaryName = candidate;
        break;
      }
    }
  }

  return { primaryName, candidateWords, localId, totalInSet, setCode };
}

async function runTests() {
  for (const c of cardCases) {
    console.log(`\n========================================`);
    console.log(`TESTING: ${c.title}`);
    const parsed = parseEnhanced(c.rawText);
    console.log(`Parsed:`, parsed);
    const res = await searchCard(parsed);
    console.log(`RESULT -> Name: "${res?.bestMatch?.name}", ID: "${res?.bestMatch?.id}", Set: "${res?.bestMatch?.set?.name}", Price: ${res?.bestMatch?.pricing?.estimatedEur} €`);
  }
}

runTests();
