// Stripe calls THIS function automatically whenever something happens with a
// payment or subscription (a new payment succeeds, a subscription is cancelled,
// a renewal fails, etc.) — we listen for those events and update the user's
// subscription_status in Supabase accordingly.
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, body: 'server not configured' };
  }

  const stripe = Stripe(stripeKey);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let stripeEvent;
  try {
    const sig = event.headers['stripe-signature'];
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (e) {
    return { statusCode: 400, body: `Webhook signature verification failed: ${e.message}` };
  }

  async function setStatus(userId, status, subscriptionId, customerId, periodEnd) {
    if (!userId) return;
    await supabase.from('profiles').update({
      subscription_status: status,
      stripe_subscription_id: subscriptionId || null,
      stripe_customer_id: customerId || null,
      subscription_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null
    }).eq('id', userId);
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const userId = session.metadata && session.metadata.supabase_user_id;
        await setStatus(userId, 'active', session.subscription, session.customer, null);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        // find the user by their stored stripe_customer_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', sub.customer)
          .single();
        if (profile) {
          const status = sub.status === 'active' ? 'active'
            : sub.status === 'past_due' ? 'past_due'
            : 'canceled';
          await setStatus(profile.id, status, sub.id, sub.customer, sub.current_period_end);
        }
        break;
      }
      default:
        // ignore other event types
        break;
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'webhook processing failed', detail: String(e) }) };
  }
};
