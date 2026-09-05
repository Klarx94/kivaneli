// Vercel Serverless Function: Stripe payment confirmation webhook.
// Mirrors api/dropea-webhook.js's signature-verification pattern — only a request whose
// signature we can verify with our own webhook secret is ever trusted to mark a payment
// as real and unlock anything.

const Stripe = require('stripe');
const { sql } = require('./_db');
const { dispatchOrderToDropea } = require('./_dropea');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  throw new Error('Missing required env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET');
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Vercel parses JSON bodies by default, but Stripe's signature is computed over the raw
// (unparsed) request bytes — this endpoint must receive them exactly as sent.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let event;
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(401).json({ success: false, error: 'Invalid Stripe signature' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderNumber = session.metadata && session.metadata.order_number;

      if (orderNumber) {
        await sql`
          UPDATE orders SET payment_status = 'COMPLETED', shipping_status = 'PROCESSING', updated_at = now()
          WHERE order_number = ${orderNumber}
        `;

        await sql`
          UPDATE customer_digital_access
          SET is_unlocked = true,
              unlocked_at = now(),
              payment_status = 'COMPLETED',
              guides_unlocked = '["1_Guia_Diario_Ritual_30_Dias_KIVANELI.pdf","2_Guia_Secretos_Fitocosmetica_KIVANELI.pdf","3_Guia_Protocolo_Mirada_Radiante_KIVANELI.pdf"]'::jsonb
          WHERE order_id = ${orderNumber}
        `;

        await dispatchOrderToDropea(orderNumber);
      }
    }

    return res.status(200).json({ success: true, received: true });
  } catch (error) {
    console.error('Stripe Webhook Processing Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
