// This function now ONLY handles live, on-demand generation for the "Oracolul
// Săgetătorului" bonus button (called with ?fresh=1). It no longer touches Netlify
// Blobs at all — that dependency proved unreliable for this account (repeated
// 401/400/timeout errors with no code-side fix available).
//
// The daily official readings are generated separately, on a schedule, by a GitHub
// Action (see .github/workflows/generate-readings.yml + scripts/generate-readings.mjs),
// and served as plain static JSON files from /data/*.json — fast and reliable, since
// they're just static files, the same way index.html itself is served.

const CAT_MAP = {
  zi:    { period: 'ziua de azi',        word: 'Ziua de azi' },
  sapt:  { period: 'saptamana aceasta',  word: 'Saptamana aceasta' },
  luna:  { period: 'luna aceasta',       word: 'Luna aceasta' },
  maine: { period: 'ziua de maine',      word: 'Ziua de maine' }
};

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
  var pStyle = 'Reguli stricte de stil: NU folosi niciodata liniuta lunga "\u2014" (em-dash) in text; foloseste virgula, punct sau punct si virgula in loc, oriunde ai fi tentat sa pui o liniuta intre doua idei. Scrie cu diacritice corecte si ortografie corecta in limba romana peste tot. Scrie ca un astrolog cu experienta, care a studiat mai multe traditii si scoli de astrologie de-a lungul timpului si reinterpreteaza acea intelepciune in cuvinte proprii, originale; nu mentiona, nu cita si nu face referire explicita la nicio sursa, carte, site sau autor anume. Scrie in propozitii complete, curgatoare, naturale, ca un om care vorbeste, nu ca o lista telegrafica de fragmente lipite intre ele. ';
  var p1 = 'Scrie un horoscop detaliat, in limba romana, pentru zodia Sagetator (Sagittarius), pentru ' + cat.period + '. Ton cald, matur, direct, fara clisee ieftine. ';
  var p2 = 'Structura ceruta, EXACT (fiecare camp separat, text natural, propozitii complete): ';
  var p3 = '1) "intro": un paragraf de introducere de 3-4 propozitii, despre tema generala a perioadei. ';
  var p4 = '2) "areas": patru obiecte, fiecare cu "text" (3-4 propozitii, cu un exemplu concret) si "tip" (un sfat practic, o singura propozitie) pentru: dragoste, finante, cariera, familie. ';
  var p5 = '3) "lesson": o propozitie sau doua, o lectie de viata, ton reflexiv. ';
  var p6 = '4) "advice": o propozitie sau doua, un sfat practic pentru perioada respectiva. ';
  var p7 = '5) "affirmation": o afirmatie la persoana intai (Imi..., Aleg..., Am...), o singura propozitie. ';
  var p8 = '6) "scores": un numar de la 1 la 10 (poate avea o zecimala) pentru dragoste, finante, cariera, familie, energie. ';
  var p9 = '7) "question": o intrebare reflexiva scurta, legata de tema zilei. ';
  var p9b = '7b) "keepThought": o singura propozitie foarte scurta (max 15 cuvinte), memorabila, ton inspirational. ';
  var p11 = 'Raspunde DOAR cu JSON valid, fara text suplimentar, fara markdown, exact in acest format: ';
  var schema = '{"intro":"...","areas":{"dragoste":{"text":"...","tip":"..."},"finante":{"text":"...","tip":"..."},"cariera":{"text":"...","tip":"..."},"familie":{"text":"...","tip":"..."}},"lesson":"...","advice":"...","affirmation":"...","scores":{"dragoste":NUMAR,"finante":NUMAR,"cariera":NUMAR,"familie":NUMAR,"energie":NUMAR},"question":"...","keepThought":"..."}';
  return p0 + pStyle + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9 + p9b + p11 + schema;
}

exports.handler = async (event) => {
  var params = event.queryStringParameters || {};
  var tab = params.tab || 'zi';

  if (!CAT_MAP[tab]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid tab' }) };
  }

  var cat = CAT_MAP[tab];
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  try {
    var controller = new AbortController();
    var abortTimer = setTimeout(function () { controller.abort(); }, 25000);
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
    var parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      return { statusCode: 502, body: JSON.stringify({ error: 'JSON parse failed', detail: String(parseErr) }) };
    }

    if (!parsed.intro || !parsed.areas || !parsed.scores) {
      return { statusCode: 502, body: JSON.stringify({ error: 'malformed generation' }) };
    }

    parsed.ts = Date.now();

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
