// Real astronomical calculation (not AI-guessed) of where the Sun, Moon, and
// planets actually were at the moment of birth, using the astronomy-engine
// library. Claude then turns those precise positions into natural-language
// interpretation — it never invents the positions themselves.
const Astronomy = require('astronomy-engine');
const { createClient } = require('@supabase/supabase-js');

// bump this whenever the calculation or interpretation prompt changes meaningfully —
// lets the admin panel + future targeted-regeneration logic know which charts are stale
const NATAL_CHART_VERSION = 1;

const SIGNS = ['Berbec','Taur','Gemeni','Rac','Leu','Fecioară','Balanță','Scorpion','Săgetător','Capricorn','Vărsător','Pești'];
const BODIES = [
  ['Sun', 'Soare'], ['Moon', 'Lună'], ['Mercury', 'Mercur'], ['Venus', 'Venus'],
  ['Mars', 'Marte'], ['Jupiter', 'Jupiter'], ['Saturn', 'Saturn'],
  ['Uranus', 'Uranus'], ['Neptune', 'Neptun'], ['Pluto', 'Pluto']
];

function signFor(eclipticLongitudeDeg) {
  const norm = ((eclipticLongitudeDeg % 360) + 360) % 360;
  const idx = Math.floor(norm / 30);
  const degInSign = norm - idx * 30;
  return { sign: SIGNS[idx], degree: Math.round(degInSign * 10) / 10 };
}

function eclipticLongitude(body, time) {
  const vec = Astronomy.GeoVector(body, time, true);
  const ecl = Astronomy.Ecliptic(vec);
  return ecl.elon;
}

// Standard astronomical formulas (Meeus) for the Ascendant — the zodiac sign
// rising on the eastern horizon at the exact moment and place of birth.
function computeAscendant(julianDay, latDeg, lngDeg) {
  const T = (julianDay - 2451545.0) / 36525;
  let gmst = 280.46061837 + 360.98564736629 * (julianDay - 2451545.0)
           + 0.000387933 * T * T - (T * T * T) / 38710000;
  gmst = ((gmst % 360) + 360) % 360;

  const lst = ((gmst + lngDeg) % 360 + 360) % 360; // Local Sidereal Time, in degrees
  const obliquity = 23.4367; // obliquity of the ecliptic, degrees (accurate enough for this purpose)

  const lstRad = lst * Math.PI / 180;
  const latRad = latDeg * Math.PI / 180;
  const oblRad = obliquity * Math.PI / 180;

  const y = Math.cos(lstRad);
  const x = -(Math.sin(lstRad) * Math.cos(oblRad) + Math.tan(latRad) * Math.sin(oblRad));
  let asc = Math.atan2(y, x) * 180 / Math.PI;
  asc = ((asc % 360) + 360) % 360;
  return asc;
}

function toJulianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
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
    const { userId, birthDate, birthTime, utcOffsetHours, lat, lng } = body;

    if (!userId || !birthDate || !birthTime || utcOffsetHours === undefined || lat === undefined || lng === undefined) {
      return { statusCode: 400, body: JSON.stringify({ error: 'missing birth data' }) };
    }

    const fingerprint = `${birthDate}|${birthTime}|${utcOffsetHours}|${lat}|${lng}`;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // if the birth data hasn't changed since the last computation, return the cached
    // chart instantly — no astronomical recalculation, no new AI call, no cost
    const { data: existing } = await supabase
      .from('natal_charts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existing && existing.birth_data_fingerprint === fingerprint) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions: existing.positions,
          ascendant: existing.ascendant,
          interpretation: existing.interpretation,
          generatedAt: new Date(existing.computed_at).getTime(),
          fromCache: true
        })
      };
    }

    // convert local birth date/time + UTC offset into a real UTC instant
    const [y, m, d] = birthDate.split('-').map(Number);
    const [hh, mm] = birthTime.split(':').map(Number);
    const localAsUTC = new Date(Date.UTC(y, m - 1, d, hh, mm));
    const utcInstant = new Date(localAsUTC.getTime() - utcOffsetHours * 3600000);

    const astroTime = Astronomy.MakeTime(utcInstant);
    const jd = toJulianDay(utcInstant);

    const positions = {};
    for (const [bodyKey, roLabel] of BODIES) {
      const elon = eclipticLongitude(Astronomy.Body[bodyKey], astroTime);
      positions[roLabel] = signFor(elon);
    }

    const ascLon = computeAscendant(jd, lat, lng);
    const ascendant = signFor(ascLon);

    const chartSummary = Object.entries(positions)
      .map(([label, pos]) => `${label} în ${pos.sign} (${pos.degree}°)`)
      .join(', ');

    const prompt = `Ai la dispoziție o hartă natală calculată astronomic real, exact, pentru o persoană. NU inventa sau schimba nicio poziție, folosește-le exact cum sunt date. Pozițiile: ${chartSummary}. Ascendent: ${ascendant.sign} (${ascendant.degree}°).

Scrie o interpretare caldă, personală, în limba română, ca un astrolog cu experiență, natural, fără liniuță lungă "—", cu propoziții complete și curgătoare. Structura cerută, EXACT, ca JSON:
{"overview": "un paragraf de 4-5 propoziții, sinteza generală a hărții, tema centrală a personalității", "sun": "2-3 propoziții despre ce înseamnă Soarele în acel semn pentru identitatea persoanei", "moon": "2-3 propoziții despre Lună, lumea emoțională", "ascendant": "2-3 propoziții despre cum se prezintă persoana în lume", "loveAndCareer": "3-4 propoziții combinând Venus și Marte, despre dragoste și ambiție", "strengthsAndChallenges": "3-4 propoziții, punctele forte și provocările reieșite din întreaga hartă"}

Răspunde DOAR cu JSON valid, fără markdown, fără text suplimentar.`;

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 25000);
    let response;
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
          max_tokens: 1600,
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
    let interpretation;
    try {
      interpretation = JSON.parse(clean);
    } catch (parseErr) {
      return { statusCode: 502, body: JSON.stringify({ error: 'JSON parse failed', detail: String(parseErr) }) };
    }

    const result = {
      positions,
      ascendant,
      interpretation,
      generatedAt: Date.now()
    };

    // cache the result, with a fingerprint of the birth data used, so future
    // requests with the SAME birth data return instantly without recalculating
    await supabase.from('natal_charts').upsert({
      user_id: userId,
      positions,
      ascendant,
      interpretation,
      birth_data_fingerprint: fingerprint,
      natal_chart_version: NATAL_CHART_VERSION,
      computed_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (e) {
    const isTimeout = e && e.name === 'AbortError';
    try {
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      await sb.from('error_log').insert({ function_name: 'natal-chart', error_message: String(e) });
    } catch (logErr) { /* logging is best-effort, never block the response on it */ }
    return { statusCode: isTimeout ? 504 : 500, body: JSON.stringify({ error: isTimeout ? 'generation timed out' : 'natal chart failed', detail: String(e) }) };
  }
};
