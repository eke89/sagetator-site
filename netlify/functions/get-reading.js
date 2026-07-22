const { getStore } = require('@netlify/blobs');

const CAT_MAP = {
  zi:    { period: 'ziua de azi',        word: 'Ziua de azi' },
  sapt:  { period: 'saptamana aceasta',  word: 'Saptamana aceasta' },
  luna:  { period: 'luna aceasta',       word: 'Luna aceasta' },
  maine: { period: 'ziua de maine',      word: 'Ziua de maine' }
};

var SIGNS = ['Berbec','Taur','Gemeni','Rac','Leu','Fecioara','Balanta','Scorpion','Sagetator','Capricorn','Varsator','Pesti'];

// ---------- real astrological context, computed from the actual date, injected into the prompt ----------
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

// known real transits for 2026 relevant to this window (extend over time as needed)
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
  var p3 = '1) "intro": un paragraf de introducere de 3-4 propozitii, despre tema generala a perioadei. ';
  var p4 = '2) "areas": patru obiecte, fiecare cu "text" (3-4 propozitii, cu un exemplu concret) si "tip" (un sfat practic, concret, o singura propozitie, actionabila) pentru: dragoste, finante, cariera, familie. ';
  var p5 = '3) "lesson": o propozitie sau doua, o lectie de viata, ton reflexiv. ';
  var p6 = '4) "advice": o propozitie sau doua, un sfat practic pentru perioada respectiva. ';
  var p7 = '5) "affirmation": o afirmatie la persoana intai (Imi..., Aleg..., Am...), o singura propozitie. ';
  var p8 = '6) "scores": un numar de la 1 la 10 (poate avea o zecimala, ex 9.5) pentru dragoste, finante, cariera, familie, energie. ';
  var p9 = '7) "question": o intrebare reflexiva scurta, pentru cititor, legata de tema zilei. ';
  var p9b = '7b) "keepThought": o singura propozitie foarte scurta (max 15 cuvinte), memorabila, gen citat de retinut, ton inspirational, potrivita pentru a fi distribuita separat. ';
  var p10 = '8) "compat": compatibilitatea Sagetatorului cu fiecare din celelalte 12 zodii, PE BAZA CONTEXTULUI ASTROLOGIC DE MAI SUS (faza lunii si tranzitele active enumerate). Pentru fiecare zodie da: "pct" (procent 30-98), "msg" (mesaj scurt, max 10 cuvinte, care mentioneaza explicit, macar pentru cateva zodii, cum influenteaza faza lunii sau tranzitul activ relatia cu acea zodie, fara sa repete acelasi tipar de propozitie la toate), "provocari" (max 6 cuvinte, ce anume ar putea crea friciune azi), "comunicare" (max 6 cuvinte, cum curge dialogul azi), "energie" (un singur cuvant: Scazuta, Moderata sau Ridicata), "sfat" (max 10 cuvinte, un sfat practic, actionabil, pentru relatia cu acea zodie azi). ';
  var p11 = 'Raspunde DOAR cu JSON valid, fara text suplimentar, fara markdown, exact in acest format: ';
  var schema = '{"intro":"...","areas":{"dragoste":{"text":"...","tip":"..."},"finante":{"text":"...","tip":"..."},"cariera":{"text":"...","tip":"..."},"familie":{"text":"...","tip":"..."}},"lesson":"...","advice":"...","affirmation":"...","scores":{"dragoste":NUMAR,"finante":NUMAR,"cariera":NUMAR,"familie":NUMAR,"energie":NUMAR},"question":"...","keepThought":"...","compat":{';
  schema += SIGNS.map(function(s){ return '"' + s + '":{"pct":NUMAR_30_98,"msg":"...","provocari":"...","comunicare":"...","energie":"...","sfat":"..."}'; }).join(',');
  schema += '}}';
  return p0 + pStyle + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p9b + p10 + p11 + schema;
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

function getConfiguredStore() {
  // Prefer Netlify's automatic Blobs context — it's provided natively at runtime for any
  // function actually deployed on Netlify, and is always correctly scoped to this exact site.
  // Manual siteID/token are only needed for tools running OUTSIDE Netlify's own infrastructure
  // (e.g. a local script) — using them here risks silent failures if they ever go stale or
  // point at the wrong site, which would make every single request regenerate from scratch.
  try {
    return getStore('sagetator-readings');
  } catch (e) {
    var siteID = process.env.NETLIFY_SITE_ID;
    var token = process.env.NETLIFY_TOKEN;
    if (siteID && token) {
      return getStore({ name: 'sagetator-readings', siteID: siteID, token: token });
    }
    throw e;
  }
}

exports.handler = async (event) => {
  var params = event.queryStringParameters || {};
  var tab = params.tab || 'zi';
  var isFresh = params.fresh === '1';

  if (!CAT_MAP[tab]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid tab' }) };
  }

  var store = getConfiguredStore();

  // ---------- archive: list past cached readings for this tab ----------
  if (params.list === '1') {
    try {
      var listResult = await store.list({ prefix: tab + ':' });
      var blobs = [];
      if (listResult && Array.isArray(listResult.blobs)) {
        blobs = listResult.blobs;
      } else if (Array.isArray(listResult)) {
        blobs = listResult;
      }
      var items = blobs.map(function (b) {
        var key = (typeof b === 'string') ? b : b.key;
        var day = key.slice(tab.length + 1);
        var parts = day.split('-').map(Number);
        var sortVal = (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
        return { key: key, day: day, sortVal: sortVal };
      });
      items.sort(function (a, b) { return b.sortVal - a.sortVal; });
      items = items.slice(0, 14);

      var results = [];
      for (var i = 0; i < items.length; i++) {
        try {
          var val = await store.get(items[i].key, { type: 'json' });
          if (val) {
            results.push({
              date: items[i].day,
              intro: val.intro || '',
              keepThought: val.keepThought || '',
              scores: val.scores || null,
              ts: val.ts || null
            });
          }
        } catch (e) { /* skip unreadable entry */ }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: results })
      };
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: 'list failed', detail: String(e) }) };
    }
  }

  // ---------- archive: read one specific past day (never generates new content) ----------
  if (params.date) {
    var archiveKey = tab + ':' + params.date;
    try {
      var archived = await store.get(archiveKey, { type: 'json' });
      if (archived) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
          body: JSON.stringify(archived)
        };
      }
    } catch (e) { /* fall through to 404 */ }
    return { statusCode: 404, body: JSON.stringify({ error: 'not found in archive' }) };
  }

  var cacheKey = tab + ':' + todayKey();

  if (!isFresh) {
    try {
      var cached = await store.get(cacheKey, { type: 'json' });
      if (cached) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
          body: JSON.stringify(cached)
        };
      }
    } catch (e) {
      console.error('cache read failed for', cacheKey, ':', String(e));
    }
  }

  var cat = CAT_MAP[tab];
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2200,
        messages: [{ role: 'user', content: buildPrompt(cat) }]
      })
    });

    if (!response.ok) {
      var errText = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Anthropic API error', detail: errText }) };
    }

    var data = await response.json();
    var text = (data.content || []).map(function (b) { return b.text || ''; }).join('').trim();
    var clean = text.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);

    if (!parsed.intro || !parsed.areas || !parsed.scores) {
      return { statusCode: 502, body: JSON.stringify({ error: 'malformed generation' }) };
    }

    parsed.ts = Date.now();

    if (!isFresh) {
      try { await store.setJSON(cacheKey, parsed); } catch (e) { console.error('cache write failed for', cacheKey, ':', String(e)); }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'generation failed', detail: String(e) }) };
  }
};
