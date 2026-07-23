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
  var p11 = 'Raspunde DOAR cu JSON valid, fara text suplimentar, fara markdown, exact in acest format: ';
  var schema = '{"intro":"...","areas":{"dragoste":{"text":"...","tip":"..."},"finante":{"text":"...","tip":"..."},"cariera":{"text":"...","tip":"..."},"familie":{"text":"...","tip":"..."}},"lesson":"...","advice":"...","affirmation":"...","scores":{"dragoste":NUMAR,"finante":NUMAR,"cariera":NUMAR,"familie":NUMAR,"energie":NUMAR},"question":"...","keepThought":"..."}';
  return p0 + pStyle + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p9b + p11 + schema;
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
  // Confirmed by direct testing: this site's functions do NOT have Netlify's automatic
  // Blobs context available, so manual credentials are required. Use them directly.
  var siteID = process.env.NETLIFY_SITE_ID;
  var token = process.env.NETLIFY_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'sagetator-readings', siteID: siteID, token: token });
  }
  // fall back to automatic context only if manual credentials aren't set at all
  return getStore('sagetator-readings');
}

// races a promise against a timeout so a slow/hanging Blobs call can never
// eat into the platform's own hard function timeout unnoticed
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timed out after ' + ms + 'ms')), ms))
  ]);
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
      var listResult = await withTimeout(store.list({ prefix: tab + ':' }), 5000);
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
          var val = await withTimeout(store.get(items[i].key, { type: 'json' }), 4000);
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
      var archived = await withTimeout(store.get(archiveKey, { type: 'json' }), 4000);
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
      var cached = await withTimeout(store.get(cacheKey, { type: 'json' }), 1200);
      if (cached) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
          body: JSON.stringify(cached)
        };
      }
    } catch (e) {
      console.error('cache read failed or timed out for', cacheKey, ':', String(e));
    }
  }

  // normal page loads never wait on live generation — only fresh=1 (the "Oracolul"
  // bonus button, where waiting is expected) or the scheduled function actually generate.
  // this guarantees every regular visitor gets an instant response, either from cache
  // or this quick "not ready yet" signal, so the client can fall back to local content
  // right away instead of waiting 20+ seconds on a live AI call.
  if (!isFresh) {
    return { statusCode: 404, body: JSON.stringify({ error: 'not cached yet' }) };
  }

  var cat = CAT_MAP[tab];
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  try {
    var controller = new AbortController();
    var abortTimer = setTimeout(function () { controller.abort(); }, 20000);
    var response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 2000,
          messages: [{ role: 'user', content: buildPrompt(cat) }]
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(abortTimer);
    }

    if (!response.ok) {
      var errText = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Anthropic API error', detail: errText }) };
    }

    var data = await response.json();
    var text = (data.content || []).map(function (b) { return b.text || ''; }).join('').trim();
    var clean = text.replace(/```json|```/g, '').trim();
    var stopReason = data.stop_reason || 'unknown';
    var parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'JSON parse failed',
          detail: String(parseErr),
          stop_reason: stopReason,
          text_length: clean.length,
          text_end: clean.slice(-300),
          text_start: clean.slice(0, 200)
        })
      };
    }

    if (!parsed.intro || !parsed.areas || !parsed.scores) {
      return { statusCode: 502, body: JSON.stringify({ error: 'malformed generation' }) };
    }

    parsed.ts = Date.now();

    if (!isFresh) {
      // bounded wait: cache it if we can within a few seconds, but never let a slow/hanging
      // write hold up the response longer than that — the reading is ready either way
      try {
        await withTimeout(store.setJSON(cacheKey, parsed), 1200);
      } catch (e) {
        console.error('cache write failed or timed out for', cacheKey, ':', String(e));
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (e) {
    var isTimeout = e && e.name === 'AbortError';
    return { statusCode: isTimeout ? 504 : 500, body: JSON.stringify({ error: isTimeout ? 'generation timed out' : 'generation failed', detail: String(e) }) };
  }
};
