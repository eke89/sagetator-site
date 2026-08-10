// Push subscriptions now live in Supabase, not Netlify Blobs — Blobs proved
// unreliable for this account (repeated 401/400/timeout errors). Supabase is
// already the reliable backbone for accounts and profiles, so this consolidates
// everything into one place.
const { createClient } = require('@supabase/supabase-js');

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

    if (body.action === 'unsubscribe' && body.endpoint) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint);
      return { statusCode: 200, body: JSON.stringify({ ok: true, action: 'unsubscribed' }) };
    }

    if (body.subscription && body.subscription.endpoint) {
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: body.userId || null,
        endpoint: body.subscription.endpoint,
        subscription: body.subscription
      }, { onConflict: 'endpoint' });
      if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: 'db error', detail: error.message }) };
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true, action: 'subscribed' }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'invalid payload' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'server error', detail: String(e) }) };
  }
};
