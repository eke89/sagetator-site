const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function getConfiguredStore() {
  var siteID = process.env.NETLIFY_SITE_ID;
  var token = process.env.NETLIFY_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'sagetator-push-subs', siteID: siteID, token: token });
  }
  return getStore('sagetator-push-subs');
}

function keyFor(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

exports.handler = async (event) => {
  var store = getConfiguredStore();

  if (event.httpMethod === 'POST') {
    try {
      var body = JSON.parse(event.body || '{}');

      if (body.action === 'unsubscribe' && body.endpoint) {
        await store.delete(keyFor(body.endpoint));
        return { statusCode: 200, body: JSON.stringify({ ok: true, action: 'unsubscribed' }) };
      }

      if (body.subscription && body.subscription.endpoint) {
        var key = keyFor(body.subscription.endpoint);
        await store.setJSON(key, body.subscription);
        return { statusCode: 200, body: JSON.stringify({ ok: true, action: 'subscribed' }) };
      }

      return { statusCode: 400, body: JSON.stringify({ error: 'invalid payload' }) };
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: 'server error', detail: String(e) }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};
