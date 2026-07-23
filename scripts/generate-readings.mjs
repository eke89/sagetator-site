// Runs via GitHub Actions (see .github/workflows/generate-readings.yml), NOT on Netlify.
// Calls the Anthropic API directly and writes plain static JSON files into /data,
// which are then committed to the repo and deployed by Netlify like any other file.
// This deliberately avoids Netlify Blobs entirely, since it has proven unreliable
// for this account (repeated 401/400/timeout errors with no code-side fix available).

import fs from 'fs';
import path from 'path';

const CAT_MAP = {
  zi:    { period: 'ziua de azi',        word: 'Ziua de azi' },
  sapt:  { period: 'saptamana aceasta',  word: 'Saptamana aceasta' },
  luna:  { period: 'luna aceasta',       word: 'Luna aceasta' },
  maine: { period: 'ziua de maine',      word: 'Ziua de maine' }
};

function getMoonPhaseInfo(date) {
  const synodic = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const diffDays = (date.getTime() - knownNewMoon) / 86400000;
  const phase = ((diffDays % synodic) + synodic) % synodic;
  const frac = phase / synodic;
  if (frac < 0.03 || frac > 0.97) return 'Luna Noua';
  if (frac < 0.22) return 'Luna crescatoare';
  if (frac < 0.28) return 'Primul patrar';
  if (frac < 0.47) return 'Luna crescatoare gibboasa';
  if (frac < 0.53) return 'Luna Plina';
  if (frac < 0.72) return 'Luna descrescatoare gibboasa';
  if (frac < 0.78) return 'Ultimul patrar';
  return 'Luna descrescatoare';
}

const KNOWN_TRANSITS = [
  { start: Date.UTC(2026, 5, 29), end: Date.UTC(2026, 6, 23), label: 'Mercur retrograd in Rac' },
  { start: Date.UTC(2026, 6, 7),  end: Date.UTC(2026, 8, 1),  label: 'Neptun retrograd in Berbec' },
  { start: Date.UTC(2026, 6, 26), end: Date.UTC(2026, 9, 15), label: 'Saturn retrograd' },
  { start: Date.UTC(2026, 7, 3),  end: Date.UTC(2027, 0, 6),  label: 'Chiron retrograd in Taur' }
];

function getActiveTransits(date) {
  const t = date.getTime();
  return KNOWN_TRANSITS.filter(tr => t >= tr.start && t <= tr.end).map(tr => tr.label);
}

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day}`;
}

function buildAstroContext() {
  const now = new Date();
  const moon = getMoonPhaseInfo(now);
  const transits = getActiveTransits(now);
  const dateStr = todayKey();
  let line = `Data de azi: ${dateStr}. Faza lunii: ${moon}.`;
  line += transits.length
    ? ` Tranzite active acum: ${transits.join(', ')}.`
    : ' Niciun tranzit retrograd major activ in acest moment.';
  return line;
}

function buildPrompt(cat) {
  const astro = buildAstroContext();
  const p0 = `Context astrologic real, foloseste-l ca sa faci continutul specific acestei zile, nu generic: ${astro} `;
  const pStyle = 'Reguli stricte de stil: NU folosi niciodata liniuta lunga "\u2014" (em-dash) in text; foloseste virgula, punct sau punct si virgula in loc, oriunde ai fi tentat sa pui o liniuta intre doua idei. Scrie cu diacritice corecte si ortografie corecta in limba romana peste tot. Scrie ca un astrolog cu experienta, care a studiat mai multe traditii si scoli de astrologie de-a lungul timpului si reinterpreteaza acea intelepciune in cuvinte proprii, originale; nu mentiona, nu cita si nu face referire explicita la nicio sursa, carte, site sau autor anume. Scrie in propozitii complete, curgatoare, naturale, ca un om care vorbeste, nu ca o lista telegrafica de fragmente lipite intre ele. ';
  const p1 = `Scrie un horoscop detaliat, in limba romana, pentru zodia Sagetator (Sagittarius), pentru ${cat.period}. Ton cald, matur, direct, fara clisee ieftine. `;
  const p2 = 'Structura ceruta, EXACT (fiecare camp separat, text natural, propozitii complete): ';
  const p3 = '1) "intro": un paragraf de introducere de 3-4 propozitii, despre tema generala a perioadei. ';
  const p4 = '2) "areas": patru obiecte, fiecare cu "text" (3-4 propozitii, cu un exemplu concret) si "tip" (un sfat practic, o singura propozitie) pentru: dragoste, finante, cariera, familie. ';
  const p5 = '3) "lesson": o propozitie sau doua, o lectie de viata, ton reflexiv. ';
  const p6 = '4) "advice": o propozitie sau doua, un sfat practic pentru perioada respectiva. ';
  const p7 = '5) "affirmation": o afirmatie la persoana intai (Imi..., Aleg..., Am...), o singura propozitie. ';
  const p8 = '6) "scores": un numar de la 1 la 10 (poate avea o zecimala) pentru dragoste, finante, cariera, familie, energie. ';
  const p9 = '7) "question": o intrebare reflexiva scurta, legata de tema zilei. ';
  const p9b = '7b) "keepThought": o singura propozitie foarte scurta (max 15 cuvinte), memorabila, ton inspirational. ';
  const p11 = 'Raspunde DOAR cu JSON valid, fara text suplimentar, fara markdown, exact in acest format: ';
  const schema = '{"intro":"...","areas":{"dragoste":{"text":"...","tip":"..."},"finante":{"text":"...","tip":"..."},"cariera":{"text":"...","tip":"..."},"familie":{"text":"...","tip":"..."}},"lesson":"...","advice":"...","affirmation":"...","scores":{"dragoste":NUMAR,"finante":NUMAR,"cariera":NUMAR,"familie":NUMAR,"energie":NUMAR},"question":"...","keepThought":"..."}';
  return p0 + pStyle + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p9b + p11 + schema;
}

async function generateOne(tab) {
  const cat = CAT_MAP[tab];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(cat) }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error for ${tab}: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = (data.content || []).map(b => b.text || '').join('').trim();
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  if (!parsed.intro || !parsed.areas || !parsed.scores) {
    throw new Error(`Malformed generation for ${tab}: missing required fields`);
  }

  parsed.ts = Date.now();
  return parsed;
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const dayKey = todayKey();
  const results = {};

  for (const tab of Object.keys(CAT_MAP)) {
    try {
      const parsed = await generateOne(tab);
      results[tab] = parsed;
      fs.writeFileSync(path.join(dataDir, `${tab}.json`), JSON.stringify(parsed, null, 2));
      console.log(`✓ ${tab}: generated and saved`);
    } catch (e) {
      console.error(`✗ ${tab}: FAILED — ${e.message}`);
      // deliberately do not overwrite the previous file on failure — better to keep
      // yesterday's real content live than to wipe it out with an error
    }
  }

  // maintain a rolling 14-day archive for the daily tab only (used by "Ieri" and weekly stats)
  if (results.zi) {
    const archivePath = path.join(dataDir, 'archive-zi.json');
    let archive = [];
    try {
      archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    } catch (e) { /* no archive yet, start fresh */ }

    archive = archive.filter(entry => entry.date !== dayKey);
    archive.unshift({
      date: dayKey,
      ...results.zi
    });
    archive = archive.slice(0, 14);

    fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));
    console.log(`✓ archive-zi: updated (${archive.length} entries)`);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
