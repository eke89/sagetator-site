// The AI Astrologer's context engine: gathers everything real and known about
// the user before a single word is generated — natal chart, today's astrological
// energy, calendar events, recent journal, statistical insights, and conversation
// memory. This is the layer that makes responses feel personal instead of generic.
const { createClient } = require('@supabase/supabase-js');

function todayInBucharest() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day}`;
}

function getMoonPhaseInfo(date) {
  const synodic = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const diffDays = (date.getTime() - knownNewMoon) / 86400000;
  const frac = (((diffDays % synodic) + synodic) % synodic) / synodic;
  if (frac < 0.03 || frac > 0.97) return 'Lună Nouă';
  if (frac < 0.22) return 'Lună crescătoare';
  if (frac < 0.28) return 'Primul pătrar';
  if (frac < 0.47) return 'Lună crescătoare gibboasă';
  if (frac < 0.53) return 'Lună Plină';
  if (frac < 0.72) return 'Lună descrescătoare gibboasă';
  if (frac < 0.78) return 'Ultimul pătrar';
  return 'Lună descrescătoare';
}

// same calendar used on the front end, kept in sync manually
const CALENDAR_EVENTS = [
  { month:7, day:22, title:"Soarele intră în Leu", sagittariusImpact:"Se activează zona ta de aventură, filosofie și expansiune." },
  { month:7, day:23, title:"Mercur devine direct", sagittariusImpact:"Comunicarea și proiectele amânate încep să avanseze din nou." },
  { month:7, day:26, title:"Saturn intră retrograd", sagittariusImpact:"O lecție de răbdare tocmai când vrei să accelerezi." },
  { month:7, day:29, title:"Lună Plină în Vărsător", sagittariusImpact:"Aspect favorabil cu Jupiter, una dintre cele mai norocoase zile ale anului." },
  { month:8, day:3,  title:"Chiron intră retrograd", sagittariusImpact:"Un ciclu bun pentru introspecție și vindecare." },
  { month:8, day:12, title:"Eclipsă totală de Soare", sagittariusImpact:"Un moment intens pentru începuturi." },
  { month:8, day:22, title:"Soarele intră în Fecioară", sagittariusImpact:"Accent pe ordine, sănătate și detalii practice." },
  { month:8, day:28, title:"Eclipsă parțială de Lună", sagittariusImpact:"O închidere de ciclu emoțională." }
];

function computeTodayEnergyScore() {
  const now = new Date();
  const moon = getMoonPhaseInfo(now);
  let score = 55;
  const reasons = [];
  if (moon === 'Lună Plină') { score += 18; reasons.push('Lună Plină'); }
  else if (moon === 'Lună Nouă') { score += 10; reasons.push('Lună Nouă'); }
  const mercuryRetro = now >= new Date(2026,5,29) && now <= new Date(2026,6,23);
  if (mercuryRetro) { score -= 10; reasons.push('Mercur retrograd'); }
  const todaysEvent = CALENDAR_EVENTS.find(e => e.month === now.getMonth()+1 && e.day === now.getDate());
  if (todaysEvent) { score += 10; reasons.push(todaysEvent.title); }
  score = Math.max(8, Math.min(98, Math.round(score)));
  return { score, moon, reasons, todaysEvent };
}

async function buildUserContext(supabase, userId, isPremium) {
  const parts = [];

  const { score, moon, todaysEvent } = computeTodayEnergyScore();
  parts.push(`Data de azi: ${todayInBucharest()}. Faza lunii: ${moon}. Scorul energiei astrologice de azi: ${score}/100.${todaysEvent ? ` Eveniment astrologic azi: ${todaysEvent.title} — pentru Săgetător: ${todaysEvent.sagittariusImpact}` : ''}`);

  const upcoming = CALENDAR_EVENTS
    .filter(e => { const now = new Date(); return (e.month*100+e.day) >= (now.getMonth()+1)*100+now.getDate(); })
    .slice(0, 3);
  if (upcoming.length) {
    parts.push(`Evenimente astrologice care urmează: ${upcoming.map(e => `${e.title} (${e.day}/${e.month}) — ${e.sagittariusImpact}`).join('; ')}`);
  }

  if (isPremium) {
    const { data: chart } = await supabase.from('natal_charts').select('positions, ascendant').eq('user_id', userId).single();
    if (chart && chart.positions) {
      const posLines = Object.entries(chart.positions).map(([label, pos]) => `${label} în ${pos.sign}`).join(', ');
      parts.push(`Harta natală reală a utilizatorului: ${posLines}${chart.ascendant ? `, Ascendent în ${chart.ascendant.sign}` : ''}.`);
    } else {
      parts.push('Utilizatorul nu și-a calculat încă harta natală completă — dacă e relevant, sugerează-i să o completeze din secțiunea Cont.');
    }
  }

  const { data: recentJournal } = await supabase
    .from('journal_entries')
    .select('entry_date, mood_score, energy_level, love_score, career_score, finance_score, health_score, important_event, tags, notes, moon_phase')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(14);
  if (recentJournal && recentJournal.length) {
    const journalLines = recentJournal.map(e =>
      `${e.entry_date}: energie ${e.energy_level}/10, stare ${e.mood_score}/5${e.important_event ? `, eveniment: ${e.important_event}` : ''}${e.tags && e.tags.length ? `, etichete: ${e.tags.join(',')}` : ''}${e.notes ? `, notă: "${e.notes.slice(0,120)}"` : ''}`
    ).join('\n');
    parts.push(`Ultimele ${recentJournal.length} intrări din jurnalul personal al utilizatorului:\n${journalLines}`);
  } else {
    parts.push('Utilizatorul nu are încă intrări în jurnal.');
  }

  const { data: insights } = await supabase.from('journal_insights').select('insights').eq('user_id', userId).single();
  if (insights && insights.insights && insights.insights.patterns && insights.insights.patterns.length) {
    parts.push(`Tipare statistice observate deja în istoricul utilizatorului: ${insights.insights.patterns.join(' ')}`);
  }

  parts.push(`Statutul abonamentului: ${isPremium ? 'Premium' : 'gratuit'}.`);

  return parts.join('\n\n');
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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, conversationId, message } = body;
    if (!userId || !message) {
      return { statusCode: 400, body: JSON.stringify({ error: 'missing userId or message' }) };
    }

    const { data: profile } = await supabase.from('profiles').select('subscription_status').eq('id', userId).single();
    const isPremium = !!(profile && profile.subscription_status === 'active');

    // free tier: 5 questions/day. Premium: unlimited.
    if (!isPremium) {
      const dayStart = todayInBucharest() + 'T00:00:00Z';
      const { data: userConvs } = await supabase.from('ai_conversations').select('id').eq('user_id', userId);
      const convIds = (userConvs || []).map(c => c.id);
      let todayCount = 0;
      if (convIds.length) {
        const { count } = await supabase
          .from('ai_messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .eq('role', 'user')
          .gte('created_at', dayStart);
        todayCount = count || 0;
      }
      if (todayCount >= 5) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limitReached: true,
            reply: 'Ai folosit deja cele 5 întrebări gratuite de azi. Devino Premium pentru conversații nelimitate cu Astrologul tău AI.'
          })
        };
      }
    }

    let convId = conversationId;
    if (!convId) {
      const { data: newConv } = await supabase.from('ai_conversations').insert({
        user_id: userId,
        title: message.slice(0, 60)
      }).select().single();
      convId = newConv.id;
    }

    const { data: history } = await supabase
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    const userContext = await buildUserContext(supabase, userId, isPremium);

    const systemPrompt = `Ești un astrolog personal, cald, matur, direct, care vorbește în limba română, fără liniuță lungă "—". Ai acces la datele reale ale utilizatorului, prezentate mai jos — folosește-le concret în răspuns, nu vorbi generic. Nu inventa poziții astrologice sau evenimente care nu apar în context. Formulează orice tipar observat din jurnal ca observație statistică ("am observat că...", "în ultimele zile..."), niciodată ca certitudine absolută. Răspunsurile tale sunt informative și de divertisment, nu consultanță medicală, psihologică, juridică sau financiară. Fii concis: 3-6 propoziții, nu un eseu.

Context real despre acest utilizator:
${userContext}

Răspunde DOAR cu JSON valid, fără markdown, EXACT în acest format:
{"reply": "răspunsul tău complet", "suggestions": ["întrebare de continuare 1, scurtă", "întrebare de continuare 2, scurtă"]}`;

    const messages = (history || []).map(m => ({ role: m.role, content: m.content }));
    messages.push({ role: 'user', content: message });

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 800,
          system: systemPrompt,
          messages
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
    const rawText = (data.content || []).map(b => b.text || '').join('').trim();
    const clean = rawText.replace(/```json|```/g, '').trim();

    let replyText, suggestions;
    try {
      const parsed = JSON.parse(clean);
      replyText = parsed.reply;
      suggestions = parsed.suggestions || [];
    } catch (e) {
      // if the model didn't return valid JSON for some reason, fall back to raw text
      replyText = rawText;
      suggestions = [];
    }

    await supabase.from('ai_messages').insert([
      { conversation_id: convId, role: 'user', content: message },
      { conversation_id: convId, role: 'assistant', content: replyText, suggestions }
    ]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: replyText, suggestions, conversationId: convId })
    };
  } catch (e) {
    const isTimeout = e && e.name === 'AbortError';
    try {
      await supabase.from('error_log').insert({ function_name: 'ai-astrologer', error_message: String(e) });
    } catch (logErr) { /* best-effort */ }
    return { statusCode: isTimeout ? 504 : 500, body: JSON.stringify({ error: isTimeout ? 'timed out' : 'ai astrologer failed', detail: String(e) }) };
  }
};
