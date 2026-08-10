const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

// same major-event list used on the front end, kept in sync manually for now
const MAJOR_EVENTS = [
  { month: 7, day: 22, title: 'Soarele intră în Leu' },
  { month: 7, day: 23, title: 'Mercur devine direct' },
  { month: 7, day: 26, title: 'Saturn intră retrograd' },
  { month: 7, day: 29, title: 'Lună Plină în Vărsător' },
  { month: 8, day: 3,  title: 'Chiron intră retrograd' },
  { month: 8, day: 12, title: 'Eclipsă totală de Soare' },
  { month: 8, day: 22, title: 'Soarele intră în Fecioară' },
  { month: 8, day: 28, title: 'Eclipsă parțială de Lună' }
];

function todayInBucharest() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  return { year: +map.year, month: +map.month, day: +map.day };
}

function messageFor(isPremium) {
  const today = todayInBucharest();
  const majorEvent = MAJOR_EVENTS.find(e => e.month === today.month && e.day === today.day);

  if (majorEvent) {
    return isPremium
      ? `✨ Azi: ${majorEvent.title}. Ca abonat Premium, ai deja interpretarea completă pregătită.`
      : `✨ Azi: ${majorEvent.title}. Deschide aplicația pentru interpretare.`;
  }

  return isPremium
    ? 'Horoscopul tău Premium (zilnic, lunar, anual) e gata. ✨'
    : 'Horoscopul zilei e gata. ✨';
}

exports.handler = schedule('0 10 * * *', async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  if (!supabaseUrl || !supabaseServiceKey || !vapidPublic || !vapidPrivate) {
    return { statusCode: 200, body: JSON.stringify({ status: 'not-configured' }) };
  }

  webpush.setVapidDetails('mailto:contact@sagittariusdecoded.app', vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: subs, error } = await supabase.from('push_subscriptions').select('*');
  if (error) {
    return { statusCode: 200, body: JSON.stringify({ status: 'error', detail: error.message }) };
  }

  // look up premium status for any subscription tied to a user account
  const userIds = [...new Set((subs || []).map(s => s.user_id).filter(Boolean))];
  let premiumSet = new Set();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, subscription_status')
      .in('id', userIds);
    (profiles || []).forEach(p => { if (p.subscription_status === 'active') premiumSet.add(p.id); });
  }

  let sent = 0, removed = 0, failed = 0;
  for (const sub of subs || []) {
    const isPremium = sub.user_id && premiumSet.has(sub.user_id);
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({
        title: 'Săgetător',
        body: messageFor(isPremium),
        url: '/'
      }));
      sent++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        removed++;
      } else {
        failed++;
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ status: 'done', sent, removed, failed }) };
});
