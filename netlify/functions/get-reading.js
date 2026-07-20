const { getStore } = require('@netlify/blobs');

const CAT_MAP = {
  zi:   { period: 'ziua de azi',       labels: ['Energie', 'Dragoste', 'Carieră'] },
  sapt: { period: 'săptămâna aceasta', labels: ['Focus', 'Social', 'Finanțe'] },
  luna: { period: 'luna aceasta',      labels: ['Creștere', 'Stabilitate', 'Noroc'] }
};

function buildPrompt(cat) {
  return `Scrie un horoscop scurt, scanabil, în limba română, pentru zodia Săgetător (Sagittarius), pentru ${cat.period}. Format: o propoziție-titlu, foarte scurtă și directă (max 12 cuvinte), plus exact 3 bullet-uri scurte (max 8 cuvinte fiecare) pentru Dragoste / Finanțe / Carieră. Adaugă separat un "mesaj al universului" — o propoziție emoțională, caldă, diferită ca ton de horoscop (nu despre zodie, despre viață în general). Răspunde DOAR cu JSON valid, fără text suplimentar, fără markdown, exact în acest format:
{"head":"...","bullets":["Dragoste: ...","Finanțe: ...","Carieră: ..."],"universe":"...","stats":[{"label":"${cat.labels[0]}","value":NUMĂR_0_100},{"label":"${cat.labels[1]}","value":NUMĂR_0_100},{"label":"${cat.labels[2]}","value":NUMĂR_0_100}]}`;
}

function todayKey() {
  const d = new Date();
  return ${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()};
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const tab = params.tab || 'zi';
  const isFresh = params.fresh === '1';

  if (!CAT_MAP[tab]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid tab' }) };
  }

  const store = getStore('sagetator-readings');
  const cacheKey = ${tab}:${todayKey()};

  if (!isFresh) {
    try {
      const cached = await store.get(cacheKey, { type: 'json' });
      if (cached) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
          body: JSON.stringify(cached)
        };
      }
    } catch (e) {}
  }

  const cat = CAT_MAP[tab];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      const errText = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Anthropic API error', detail: errText }) };
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || '').join('').trim();
    const clean = text.replace(/json|/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!parsed.head || !Array.isArray(parsed.bullets) || !Array.isArray(parsed.stats)) {
      return { statusCode: 502, body: JSON.stringify({ error: 'malformed generation' }) };
    }

    parsed.ts = Date.now();

    if (!isFresh) {
      await store.setJSON(cacheKey, parsed);
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
