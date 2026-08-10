// Simple admin panel backend: only responds if the caller's email matches
// ADMIN_EMAIL (set as a Netlify environment variable) — never hardcoded,
// never exposed in client-side code.
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!supabaseUrl || !supabaseServiceKey || !adminEmail) {
    return { statusCode: 500, body: JSON.stringify({ error: 'server not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, action } = body;

    if (!email || email.toLowerCase() !== adminEmail.toLowerCase()) {
      return { statusCode: 403, body: JSON.stringify({ error: 'not authorized' }) };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'stats' || !action) {
      const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: premiumUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'active');
      const { count: pastDue } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'past_due');
      const { count: pushSubs } = await supabase.from('push_subscriptions').select('*', { count: 'exact', head: true });
      const { count: natalCharts } = await supabase.from('natal_charts').select('*', { count: 'exact', head: true });
      const { count: compatReports } = await supabase.from('compatibility_reports').select('*', { count: 'exact', head: true });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalUsers: totalUsers || 0,
          premiumUsers: premiumUsers || 0,
          pastDueUsers: pastDue || 0,
          conversionRate: totalUsers ? Math.round((premiumUsers / totalUsers) * 1000) / 10 : 0,
          pushSubscribers: pushSubs || 0,
          natalChartsComputed: natalCharts || 0,
          compatibilityReports: compatReports || 0
        })
      };
    }

    if (action === 'diagnostics') {
      const diagnosticsStart = Date.now();
      let supabaseConnected = false;
      try {
        const { error: pingError } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
        supabaseConnected = !pingError;
      } catch (e) { supabaseConnected = false; }
      const latencyMs = Date.now() - diagnosticsStart;

      const { data: recentErrors } = await supabase
        .from('error_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseConnected,
          supabaseLatencyMs: latencyMs,
          schemaVersion: 'v1 (vezi comentariile din schema.sql)',
          natalChartAlgorithmVersion: 1,
          insightAlgorithmVersion: 1,
          recentErrors: recentErrors || []
        })
      };
    }

    if (action === 'broadcast') {
      const vapidPublic = process.env.VAPID_PUBLIC_KEY;
      const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
      if (!vapidPublic || !vapidPrivate) {
        return { statusCode: 500, body: JSON.stringify({ error: 'VAPID not configured' }) };
      }
      webpush.setVapidDetails('mailto:contact@sagittariusdecoded.app', vapidPublic, vapidPrivate);

      const { message, audience } = body; // audience: 'all' | 'premium'
      let query = supabase.from('push_subscriptions').select('*');
      const { data: subs } = await query;

      let targetSubs = subs || [];
      if (audience === 'premium') {
        const userIds = [...new Set(targetSubs.map(s => s.user_id).filter(Boolean))];
        const { data: profiles } = await supabase.from('profiles').select('id, subscription_status').in('id', userIds);
        const premiumIds = new Set((profiles || []).filter(p => p.subscription_status === 'active').map(p => p.id));
        targetSubs = targetSubs.filter(s => s.user_id && premiumIds.has(s.user_id));
      }

      let sent = 0, failed = 0;
      for (const sub of targetSubs) {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify({ title: 'Săgetător', body: message, url: '/' }));
          sent++;
        } catch (e) { failed++; }
      }

      return { statusCode: 200, body: JSON.stringify({ sent, failed, audience: audience || 'all' }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'unknown action' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'admin function failed', detail: String(e) }) };
  }
};
