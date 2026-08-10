// Creates a Stripe Checkout session (a hosted, pre-built payment page —
// no need to build a card form ourselves, Stripe handles all of that securely).
const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID; // the ID of your monthly subscription price, from Stripe dashboard
  const siteUrl = process.env.SITE_URL || 'https://sagittarius-decoded.netlify.app';

  if (!stripeKey || !priceId) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe not configured' }) };
  }

  const stripe = Stripe(stripeKey);

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, email } = body;
    if (!userId || !email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'missing userId or email' }) };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/?premium=success`,
      cancel_url: `${siteUrl}/?premium=cancelled`,
      // this metadata comes back in the webhook, so we know WHICH user just paid
      metadata: { supabase_user_id: userId }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'checkout session failed', detail: String(e) }) };
  }
};
