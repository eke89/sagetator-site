// Real astronomical compatibility: computes both people's Sun/Moon/Venus/Mars
// positions (same engine as natal-chart.js), then Claude interprets the pairing.
const Astronomy = require('astronomy-engine');
const { createClient } = require('@supabase/supabase-js');

const SIGNS = ['Berbec','Taur','Gemeni','Rac','Leu','Fecioară','Balanță','Scorpion','Săgetător','Capricorn','Vărsător','Pești'];
const BODIES = [['Sun','Soare'], ['Moon','Lună'], ['Venus','Venus'], ['Mars','Marte']];

function signFor(lon) {
  const norm = ((lon % 360) + 360) % 360;
  return SIGNS[Math.floor(norm / 30)];
}
function eclipticLongitude(body, time) {
  const vec = Astronomy.GeoVector(body, time, true);
  return Astronomy.Ecliptic(vec).elon;
}
function positionsFor(birthDate, birthTime, utcOffsetHours) {
  const [y, m, d] = birthDate.split('-').map(Number);
  const [hh, mm] = birthTime.split(':').map(Number);
  const localAsUTC = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const utcInstant = new Date(localAsUTC.getTime() - utcOffsetHours * 3600000);
  const astroTime = Astronomy.MakeTime(utcInstant);

  const positions = {};
  for (const [key, label] of BODIES) {
    positions[label] = signFor(eclipticLongitude(Astronomy.Body[key], astroTime));
  }
  return positions;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!supabaseUrl || !supabaseServiceKey || !apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'server not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, personA, personB } = body;
    if (!personA || !personB || !personA.birthDate || !personB.birthDate) {
      return { statusCode: 400, body: JSON.stringify({ error: 'missing birth data for one or both people' }) };
    }

    const posA = positionsFor(personA.birthDate, personA.birthTime || '12:00', personA.utcOffsetHours ?? 2);
    const posB = positionsFor(personB.birthDate, personB.birthTime || '12:00', personB.utcOffsetHours ?? 2);

    const prompt = `Analizează compatibilitatea astrologică reală dintre două persoane, pe baza pozițiilor calculate astronomic (nu le inventa, folosește-le exact):
${personA.name || 'Persoana A'}: Soare ${posA['Soare']}, Lună ${posA['Lună']}, Venus ${posA['Venus']}, Marte ${posA['Marte']}.
${personB.name || 'Persoana B'}: Soare ${posB['Soare']}, Lună ${posB['Lună']}, Venus ${posB['Venus']}, Marte ${posB['Marte']}.

Scrie în limba română, natural, fără liniuță lungă "—". Structura EXACTĂ, ca JSON:
{"pct": NUMAR_30_98, "overview":"3-4 propoziții, sinteza generală a relației", "strengths":"2-3 propoziții, punctele forte", "challenges":"2-3 propoziții, provocările posibile", "categories":{"love":{"score":NUMAR_30_98,"text":"1-2 propoziții despre iubire și atracție romantică"},"communication":{"score":NUMAR_30_98,"text":"1-2 propoziții despre cum comunică"},"chemistry":{"score":NUMAR_30_98,"text":"1-2 propoziții despre chimie și energie"},"family":{"score":NUMAR_30_98,"text":"1-2 propoziții despre viața de familie"},"longTerm":{"score":NUMAR_30_98,"text":"1-2 propoziții despre potențialul pe termen lung"}}}
Răspunde DOAR cu JSON valid, fără markdown.`;

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(abortTimer);
    }

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Anthropic API error', detail: errText }) };
    }

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('').trim();
    const clean = text.replace(/```json|```/g, '').trim();
    let result;
    try {
      result = JSON.parse(clean);
    } catch (parseErr) {
      return { statusCode: 502, body: JSON.stringify({ error: 'JSON parse failed', detail: String(parseErr) }) };
    }

    result.positionsA = posA;
    result.positionsB = posB;

    if (userId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await supabase.from('compatibility_reports').insert({
        requested_by: userId,
        person_a_name: personA.name || null,
        person_a_birth_date: personA.birthDate,
        person_a_birth_time: personA.birthTime || null,
        person_b_name: personB.name || null,
        person_b_birth_date: personB.birthDate,
        person_b_birth_time: personB.birthTime || null,
        result
      });
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  } catch (e) {
    const isTimeout = e && e.name === 'AbortError';
    return { statusCode: isTimeout ? 504 : 500, body: JSON.stringify({ error: isTimeout ? 'timed out' : 'compatibility failed', detail: String(e) }) };
  }
};
