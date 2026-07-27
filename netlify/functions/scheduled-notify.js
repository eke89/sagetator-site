const { schedule } = require('@netlify/functions');
const { getStore } = require('@netlify/blobs');
const webpush = require('web-push');

function getSubsStore() {
  var siteID = process.env.NETLIFY_SITE_ID;
  var token = process.env.NETLIFY_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'sagetator-push-subs', siteID: siteID, token: token });
  }
  return getStore('sagetator-push-subs');
}

async function sendDailyNotifications() {
  var vapidPublic = process.env.VAPID_PUBLIC_KEY;
  var vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return { status: 'no-vapid-keys' };
  }

  webpush.setVapidDetails('mailto:contact@sagittariusdecoded.app', vapidPublic, vapidPrivate);

  var subsStore = getSubsStore();
  var listResult = await subsStore.list();
  var blobs = (listResult && listResult.blobs) || [];

  var sent = 0, removed = 0, failed = 0;

  for (var i = 0; i < blobs.length; i++) {
    var key = blobs[i].key;
    try {
      var sub = await subsStore.get(key, { type: 'json' });
      if (!sub) continue;
      await webpush.sendNotification(sub, JSON.stringify({
        title: 'Săgetător',
        body: 'Horoscopul zilei e gata. ✨',
        url: '/'
      }));
      sent++;
    } catch (e) {
      // a 404/410 means the subscription is dead (user uninstalled, revoked permission, etc.) — clean it up
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        try { await subsStore.delete(key); removed++; } catch (e2) { /* ignore cleanup failure */ }
      } else {
        failed++;
      }
    }
  }

  return { status: 'done', sent: sent, removed: removed, failed: failed };
}

// runs daily at 10:00 UTC — 12:00 (noon) in Romania during winter (UTC+2), 13:00 during summer DST (UTC+3).
// content is already generated and cached by scheduled-refresh.js (which runs at midnight), so this
// function only needs to notify people that today's reading is ready — it never generates anything itself.
const handler = async () => {
  var result = { status: 'skipped' };
  try {
    result = await sendDailyNotifications();
  } catch (e) {
    result = { status: 'error', detail: String(e) };
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ notifications: result })
  };
};

exports.handler = schedule('0 10 * * *', handler);
