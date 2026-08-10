// Computes statistical insights from a user's journal history. Only recomputes
// when there's meaningfully new data (at least 5 new entries since the last
// calculation) — otherwise returns the cached version instantly. This keeps
// costs low and respects the "insight_version / generated_at" caching pattern
// used throughout the app.
const { createClient } = require('@supabase/supabase-js');

// bump this whenever the insight-computation algorithm changes meaningfully
const INSIGHT_VERSION = 1;

const RO_WEEKDAYS = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă'];
const DOMAINS = ['love_score','career_score','finance_score','health_score'];
const DOMAIN_LABELS = { love_score:'dragoste', career_score:'carieră', finance_score:'finanțe', health_score:'sănătate' };

function avg(nums){
  const valid = nums.filter(n => typeof n === 'number');
  if(!valid.length) return null;
  return valid.reduce((a,b)=>a+b,0) / valid.length;
}
function stddev(nums){
  const valid = nums.filter(n => typeof n === 'number');
  if(valid.length < 2) return 0;
  const m = avg(valid);
  return Math.sqrt(avg(valid.map(n => (n-m)*(n-m))));
}

function computeInsights(entries){
  const patterns = [];

  // best weekday for energy
  const byWeekday = {};
  entries.forEach(e => {
    if(typeof e.energy_level !== 'number') return;
    const wd = new Date(e.entry_date + 'T12:00:00').getDay();
    (byWeekday[wd] = byWeekday[wd] || []).push(e.energy_level);
  });
  let bestWeekday = null;
  let bestWeekdayAvg = -1;
  Object.entries(byWeekday).forEach(([wd, vals]) => {
    const a = avg(vals);
    if(a !== null && a > bestWeekdayAvg && vals.length >= 2){ bestWeekdayAvg = a; bestWeekday = RO_WEEKDAYS[wd]; }
  });

  // new moon vs full moon comparison
  const newMoonEnergy = avg(entries.filter(e => e.moon_phase === 'Lună Nouă').map(e => e.energy_level));
  const fullMoonEnergy = avg(entries.filter(e => e.moon_phase === 'Lună Plină').map(e => e.energy_level));
  let moonComparison = null;
  if(newMoonEnergy !== null && fullMoonEnergy !== null){
    moonComparison = { newMoonEnergy: Math.round(newMoonEnergy*10)/10, fullMoonEnergy: Math.round(fullMoonEnergy*10)/10 };
  }

  // 30-day energy trend (chronological points)
  const sorted = [...entries].sort((a,b) => a.entry_date.localeCompare(b.entry_date));
  const last30 = sorted.slice(-30);
  const energyTrend = last30.map(e => ({ date: e.entry_date, energy: e.energy_level }));

  // domain with most variation
  let mostVariableDomain = null, maxStd = -1;
  DOMAINS.forEach(d => {
    const std = stddev(entries.map(e => e[d]));
    if(std > maxStd){ maxStd = std; mostVariableDomain = DOMAIN_LABELS[d]; }
  });

  // pattern: high astro energy score days vs reported energy (needs enough data)
  if(entries.length >= 15){
    const highAstroDays = entries.filter(e => e.astro_energy_score >= 80 && typeof e.energy_level === 'number');
    if(highAstroDays.length >= 5){
      const a = avg(highAstroDays.map(e => e.energy_level));
      patterns.push(`În zilele cu scor astrologic peste 80, ai raportat o energie medie de ${Math.round(a*10)/10}/10 (pe baza a ${highAstroDays.length} zile).`);
    }
  }

  // pattern: important events near full moon
  if(entries.length >= 15){
    const fullMoonEvents = entries.filter(e => e.moon_phase === 'Lună Plină' && e.important_event);
    if(fullMoonEvents.length >= 3){
      patterns.push(`Ai notat evenimente importante în ${fullMoonEvents.length} zile de Lună Plină.`);
    }
  }

  if(bestWeekday && bestWeekdayAvg > 0){
    patterns.push(`În medie, energia ta e cea mai ridicată în zilele de ${bestWeekday} (${Math.round(bestWeekdayAvg*10)/10}/10).`);
  }
  if(moonComparison){
    const diff = moonComparison.fullMoonEnergy - moonComparison.newMoonEnergy;
    if(Math.abs(diff) >= 0.5){
      patterns.push(diff > 0
        ? `Energia ta e, în medie, mai ridicată la Lună Plină (${moonComparison.fullMoonEnergy}) decât la Lună Nouă (${moonComparison.newMoonEnergy}).`
        : `Energia ta e, în medie, mai ridicată la Lună Nouă (${moonComparison.newMoonEnergy}) decât la Lună Plină (${moonComparison.fullMoonEnergy}).`);
    }
  }

  return {
    bestWeekday,
    moonComparison,
    energyTrend,
    mostVariableDomain,
    patterns,
    note: 'Acestea sunt observații statistice, pe baza notițelor tale, nu relații de cauzalitate demonstrate.'
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'server not configured' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId } = body;
    if (!userId) return { statusCode: 400, body: JSON.stringify({ error: 'missing userId' }) };

    const { data: entries } = await supabase.from('journal_entries').select('*').eq('user_id', userId);
    const entryCount = (entries || []).length;

    if (entryCount < 7) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notEnoughData: true, entryCount })
      };
    }

    // only recompute if there's meaningfully new data since the last calculation
    const { data: cached } = await supabase.from('journal_insights').select('*').eq('user_id', userId).single();
    if (cached && entryCount - cached.data_points_count < 5) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cached.insights, fromCache: true, entryCount })
      };
    }

    const insights = computeInsights(entries);

    await supabase.from('journal_insights').upsert({
      user_id: userId,
      insights,
      data_points_count: entryCount,
      insight_version: INSIGHT_VERSION,
      generated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...insights, entryCount })
    };
  } catch (e) {
    try {
      await supabase.from('error_log').insert({ function_name: 'journal-insights', error_message: String(e) });
    } catch (logErr) { /* best-effort */ }
    return { statusCode: 500, body: JSON.stringify({ error: 'insights computation failed', detail: String(e) }) };
  }
};
