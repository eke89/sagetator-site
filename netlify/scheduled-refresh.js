const { schedule } = require('@netlify/functions');
const { getStore } = require('@netlify/blobs');

const CAT_MAP = {
  zi:    { period: 'ziua de azi',        word: 'Ziua de azi' },
  sapt:  { period: 'saptamana aceasta',  word: 'Saptamana aceasta' },
  luna:  { period: 'luna aceasta',       word: 'Luna aceasta' },
  maine: { period: 'ziua de maine',      word: 'Ziua de maine' }
};

var SIGNS = ['Berbec','Taur','Gemeni','Rac','Leu','Fecioara','Balanta','Scorpion','Sagetator','Capricorn','Varsator','Pesti'];

function getMoonPhaseInfo(date) {
  var synodic = 29.53058867;
  var knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  var diffDays = (date.getTime() - knownNewMoon) / 86400000;
  var phase = ((diffDays % synodic) + synodic) % synodic;
  var frac = phase / synodic;
  if (frac < 0.03 || frac > 0.97) return 'Luna Noua';
  if (frac < 0.22) return 'Luna crescatoare';
  if (frac < 0.28) return 'Primul patrar';
  if (frac < 0.47) return 'Luna crescatoare gibboasa';
  if (frac < 0.53) return 'Luna Plina';
  if (frac < 0.72) return 'Luna descrescatoare gibboasa';
  if (frac < 0.78) return 'Ultimul patrar';
  return 'Luna descrescatoare';
}

var KNOWN_TRANSITS = [
  { start: Date.UTC(2026, 5, 29), end: Date.UTC(2026, 6, 23), label: 'Mercur retrograd in Rac' },
  { start: Date.UTC(2026, 6, 7),  end: Date.UTC(2026, 8, 1),  label: 'Neptun retrograd in Berbec' },
  { start: Date.UTC(2026, 6, 26), end: Date.UTC(2026, 9, 15), label: 'Saturn retrograd' },
  { start: Date.UTC(2026, 7, 3),  end: Date.UTC(2027, 0, 6),  label: 'Chiron retrograd in Taur' }
];

function getActiveTransits(date) {
  var t = date.getTime();
  var active = [];
  for (var i = 0; i < KNOWN_TRANSITS.length; i++) {
    if (t >= KNOWN_TRANSITS[i].start && t <= KNOWN_TRANSITS[i].end) {
      active.push(KNOWN_TRANSITS[i].label);
    }
  }
  return active;
}

function todayKey() {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(new Date());
  var map = {};
  parts.forEach(function (p) { map[p.type] = p.value; });
  return map.year + '-' + map.month + '-' + map.day;
}

function buildAstroContext() {
  var now = new Date();
  var moon = getMoonPhaseInfo(now);
  var transits = getActiveTransits(now);
  var dateStr = todayKey();
  var line = 'Data de azi: ' + dateStr + '. Faza lunii: ' + moon + '.';
  if (transits.length) {
    line += ' Tranzite active acum: ' + transits.join(', ') + '.';
  } else {
    line += ' Niciun tranzit retrograd major activ in acest moment.';
  }
  return line;
}

function buildPrompt(cat) {
  var astro = buildAstroContext();
  var p0 = 'Context astrologic real, foloseste-l ca sa faci continutul specific acestei zile, nu generic: ' + astro + ' ';
  var pStyle = 'Reguli stricte de stil: NU folosi niciodata liniuta lunga "\u2014" (em-dash) in text; foloseste virgula, punct sau punct si virgula in loc, oriunde ai fi tentat sa pui o liniuta intre doua idei. Scrie cu diacritice corecte si ortografie corecta in limba romana peste tot. Scrie ca un astrolog cu experienta, care a studiat mai multe traditii si scoli de astrologie de-a lungul timpului si reinterpreteaza acea intelepciune in cuvinte proprii, originale; nu mentiona, nu cita si nu face referire explicita la nicio sursa, carte, site sau autor anume. Scrie in propozitii complete, curgatoare, naturale, ca un om care vorbeste, nu ca o lista telegrafica de fragmente lipite intre ele; evita constructii de tipul "idee scurta, idee scurta, idee scurta" fara verbe sau legaturi naturale intre ele; fiecare propozitie trebuie sa se citeasca firesc, cu conjunctii si tranzitii normale (dar, iar, deoarece, asa ca, totusi), nu ca un rezumat mecanic generat automat. ';
  var p1 = 'Scrie un horoscop detaliat, in limba romana, pentru zodia Sagetator (Sagittarius), pentru ' + cat.period + '. Ton cald, matur, direct, fara clisee ieftine. ';
  var p2 = 'Structura ceruta, EXACT (fiecare camp separat, text natural, propozitii complete, nu liste telegrafice): ';
  var p3 = '1) "intro": un paragraf de introducere de 4-6 propozitii, despre tema generala a perioadei. ';
  var p4 = '2) "areas": patru obiecte, fiecare cu "text" (4-5 propozitii, dezvoltat, cu exemple concrete si context, nu doar o idee generala) si "tip" (un sfat practic, concret, o singura propozitie, actionabila) pentru: dragoste, finante, cariera, familie. ';
  var p5 = '3) "lesson": o propozitie sau doua, o lectie de viata, ton reflexiv. ';
  var p6 = '4) "advice": o propozitie sau doua, un sfat practic pentru perioada respectiva. ';
  var p7 = '5) "affirmation": o afirmatie la persoana intai (Imi..., Aleg..., Am...), o singura propozitie. ';
  var p8 = '6) "scores": un numar de la 1 la 10 (poate avea o zecimala, ex 9.5) pentru dragoste, finante, cariera, familie, energie. ';
  var p9 = '7) "question": o intrebare reflexiva scurta, pentru cititor, legata de tema zilei. ';
  var p9b = '7b) "keepThought": o singura propozitie foarte scurta (max 15 cuvinte), memorabila, gen citat de retinut, ton inspirational, potrivita pentru a fi distribuita separat. ';
  var p10 = '8) "compat": compatibilitatea Sagetatorului cu fiecare din celelalte 12 zodii, PE BAZA CONTEXTULUI ASTROLOGIC DE MAI SUS (faza lunii si tranzitele active enumerate). Pentru fiecare zodie da: "pct" (procent 30-98), "msg" (mesaj scurt, max 14 cuvinte, care mentioneaza explicit, macar pentru cateva zodii, cum influenteaza faza lunii sau tranzitul activ relatia cu acea zodie, fara sa repete acelasi tipar de propozitie la toate), "provocari" (max 8 cuvinte, ce anume ar putea crea friciune azi), "comunicare" (max 8 cuvinte, cum curge dialogul azi), "energie" (un singur cuvant: Scazuta, Moderata sau Ridicata), "sfat" (un sfat practic, actionabil, o singura propozitie scurta, pentru relatia cu acea zodie azi). ';
  var p11 = 'Raspunde DOAR cu JSON valid, fara text suplimentar, fara markdown, exact in acest format: ';
  var schema = '{"intro":"...","areas":{"dragoste":{"text":"...","tip":"..."},"finante":{"text":"...","tip":"..."},"cariera":{"text":"...","tip":"..."},"familie":{"text":"...","tip":"..."}},"lesson":"...","advice":"...","affirmation":"...","scores":{"dragoste":NUMAR,"finante":NUMAR,"cariera":NUMAR,"familie":NUMAR,"energie":NUMAR},"question":"...","keepThought":"...","compat":{';
  schema += SIGNS.map(function(s){ return '"' + s + '":{"pct":NUMAR_30_98,"msg":"...","provocari":"...","comunicare":"...","energie":"...","sfat":"..."}'; }).join(',');
  schema += '}}';
  return p0 + pStyle + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p9b + p10 + p11 + schema;
}

function getConfiguredStore() {
  var siteID = process.env.NETLIFY_SITE_ID;
  var token = process.env.NETLIFY_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'sagetator-readings', siteID: siteID, token: token });
  }
  return getStore('sagetator-readings');
}

async function generateAndCache(tab, store, dayKey) {
  var cacheKey = tab + ':' + dayKey;

  // avoid regenerating if something (a visitor, or a retry of this same run) already cached it
  try {
    var existing = await store.get(cacheKey, { type: 'json' });
    if (existing) return { tab: tab, status: 'already-cached' };
  } catch (e) { /* proceed to generate */ }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { tab: tab, status: 'no-api-key' };

  var cat = CAT_MAP[tab];
  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 3200,
      messages: [{ role: 'user', content: buildPrompt(cat) }]
    })
  });

  if (!response.ok) {
    var errText = await response.text();
    return { tab: tab, status: 'api-error', detail: errText };
  }

  var data = await response.json();
  var text = (data.content || []).map(function (b) { return b.text || ''; }).join('').trim();
  var clean = text.replace(/```json|```/g, '').trim();
  var parsed = JSON.parse(clean);

  if (!parsed.intro || !parsed.areas || !parsed.scores) {
    return { tab: tab, status: 'malformed' };
  }

  parsed.ts = Date.now();
  await store.setJSON(cacheKey, parsed);
  return { tab: tab, status: 'generated' };
}

// runs daily at 22:00 UTC — midnight in Romania during winter (UTC+2), 1am during summer DST (UTC+3);
// the date it caches under is always computed in Europe/Bucharest, so it lines up with what visitors see either way.
// this function ONLY generates and caches the day's content. Push notifications are sent separately,
// later in the day, by scheduled-notify.js — so the reading is always ready before anyone gets pinged about it.
const handler = async () => {
  var store = getConfiguredStore();
  var dayKey = todayKey();
  var results = [];
  var tabs = Object.keys(CAT_MAP);

  for (var i = 0; i < tabs.length; i++) {
    try {
      var r = await generateAndCache(tabs[i], store, dayKey);
      results.push(r);
    } catch (e) {
      results.push({ tab: tabs[i], status: 'error', detail: String(e) });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ dayKey: dayKey, results: results })
  };
};

exports.handler = schedule('0 22 * * *', handler);
