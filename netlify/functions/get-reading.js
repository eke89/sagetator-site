const { getStore } = require('@netlify/blobs');

const CAT_MAP = {
  zi:   { period: 'ziua de azi',       labels: ['Energie', 'Dragoste', 'Carieră'] },
  sapt: { period: 'săptămâna aceasta', labels: ['Focus', 'Social', 'Finanțe'] },
  luna: { period: 'luna aceasta',      labels: ['Creștere', 'Stabilitate', 'Noroc'] }
};

function buildPrompt(cat) {
  var p1 = 'Scrie un horoscop scurt, scanabil, in limba romana, pentru zodia Sagetator (Sagittarius), pentru ' + cat.period + '. ';
  var p2 = 'Format: o propozitie-titlu, foarte scurta si directa (max 12 cuvinte), plus exact 3 bullet-uri scurte (max 8 cuvinte fiecare) pentru Dragoste / Finante / Cariera. ';
  var p3 = 'Adauga separat un "mesaj al universului" - o propozitie emotionala, calda, diferita ca ton de horoscop (nu despre zodie, despre viata in general). ';
  var p4 = 'Raspunde DOAR cu JSON valid, fara text suplimentar, fara markdown, exact in acest format: ';
  var schema = '{"head":"...","bullets":["Dragoste: ...","Finante: ...","Cariera: ..."],"universe":"...","stats":[';
  schema += '{"label":"' + cat.labels[0] + '","value":NUMAR_0_100},';
  schema += '{"label":"' + cat.labels[1] + '","value":NUMAR_0_100},';
  schema += '{"label":"' + cat.labels[2] + '","value":NUMAR_0_100}]}';
  return p1 + p2 + p3 + p4 + schema;
}

function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function getConfiguredStore() {
  var siteID = process.env.NETLIFY_SITE_ID;
  var token = process.env.NETLIFY_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'sagetator-readings', siteID: siteID, token: token });
  }
  return getStore('sagetator-readings');
}

exports.handler = async (event) => {
  var params = event.queryStringParameters || {};
  var tab = params.tab || 'zi';
  var isFresh = params.fresh === '1';

  if (!CAT_MAP[tab]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid tab' }) };
  }

  var store = getConfiguredStore();
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
      // fall through and generate
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
        max_tokens: 1000,
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

    if (!parsed.head || !Array.isArray(parsed.bullets) || !Array.isArray(parsed.stats)) {
      return { statusCode: 502, body: JSON.stringify({ error: 'malformed generation' }) };
    }

    parsed.ts = Date.now();

    if (!isFresh) {
      try { await store.setJSON(cacheKey, parsed); } catch (e) { /* caching failed, still return the reading */ }
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
