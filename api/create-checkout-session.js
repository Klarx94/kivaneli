// Vercel Serverless Function: Create a Stripe Checkout Session for card payments.
// COD orders never touch this file — they go straight through api/dropea-order.js.
// Real payment confirmation happens server-side in api/stripe-webhook.js; this endpoint
// only ever creates a PENDING order, it never marks anything as paid.

const Stripe = require('stripe');
const { sql } = require('../lib/_db');
const { computeAuthoritativeOrder } = require('../lib/_pricing');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = process.env.SITE_URL || 'https://kivaneli.es';

if (!STRIPE_SECRET_KEY) {
  throw new Error('Missing required env var STRIPE_SECRET_KEY');
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+ ()-]{7,20}$/;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = req.body || {};

    // Honeypot — see api/dropea-order.js for the rationale.
    if (body.website) {
      return res.status(200).json({ success: true, order_number: 'KV-000000', checkout_url: null });
    }

    const customerName = String(body.customer_name || '').trim() || 'Clienta Kivaneli';
    const customerEmail = String(body.customer_email || '').toLowerCase().trim();
    const customerPhone = String(body.customer_phone || '').trim();
    const customerAddress = String(body.customer_address || '').trim();
    const customerZip = String(body.customer_zip || '').trim();
    const customerCity = String(body.customer_city || '').trim();

    if (!EMAIL_RE.test(customerEmail)) {
      return res.status(400).json({ success: false, error: 'Email inválido' });
    }
    if (customerPhone && !PHONE_RE.test(customerPhone)) {
      return res.status(400).json({ success: false, error: 'Teléfono inválido' });
    }

    const [recent] = await sql`
      SELECT count(*)::int AS n FROM orders
      WHERE customer_email = ${customerEmail} AND created_at > now() - interval '10 minutes'
    `;
    if (recent && recent.n >= 3) {
      return res.status(429).json({ success: false, error: 'Demasiados pedidos en poco tiempo. Inténtalo de nuevo en unos minutos.' });
    }

    // Real price computation — body.total_amount/body.items[].price are never trusted.
    const priced = await computeAuthoritativeOrder(body.items, body.coupon_applied);

    const orderNumber = body.order_number || `KV-${Date.now().toString().slice(-6)}`;
    const orderRecord = {
      order_number: orderNumber,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      customer_zip: customerZip,
      customer_city: customerCity,
      pack_selected: body.pack_selected || '',
      items_count: priced.items.reduce((acc, i) => acc + i.quantity, 0),
      total_amount: priced.total,
      coupon_applied: priced.appliedCoupon,
      referral_code_used: body.referral_code_used || null
    };

    // Order row starts as PENDING — the Stripe webhook flips it to COMPLETED once payment
    // actually clears, and only then dispatches to Dropea and unlocks the digital guides.
    await sql`
      INSERT INTO orders (
        order_number, customer_name, customer_email, customer_phone, customer_address,
        customer_zip, customer_city, pack_selected, items_count, total_amount,
        payment_method, payment_status, shipping_status, coupon_applied, referral_code_used, cart_items
      ) VALUES (
        ${orderRecord.order_number}, ${orderRecord.customer_name}, ${orderRecord.customer_email},
        ${orderRecord.customer_phone}, ${orderRecord.customer_address}, ${orderRecord.customer_zip},
        ${orderRecord.customer_city}, ${orderRecord.pack_selected}, ${orderRecord.items_count},
        ${orderRecord.total_amount}, 'CARD', 'PENDING_STRIPE', 'AWAITING_PAYMENT',
        ${orderRecord.coupon_applied}, ${orderRecord.referral_code_used}, ${JSON.stringify(priced.items)}::jsonb
      )
    `;

    await sql`
      INSERT INTO customer_digital_access (
        order_id, customer_email, customer_name, payment_method, payment_status, is_unlocked
      ) VALUES (
        ${orderNumber}, ${orderRecord.customer_email}, ${orderRecord.customer_name}, 'CARD', 'PENDING_STRIPE', false
      )
    `;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: orderRecord.customer_email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: orderRecord.pack_selected || 'Pedido KIVANELI' },
          unit_amount: Math.round(priced.total * 100)
        },
        quantity: 1
      }],
      metadata: { order_number: orderNumber },
      success_url: `${SITE_URL}/checkout.html?stripe_success=1&order=${orderNumber}&email=${encodeURIComponent(orderRecord.customer_email)}`,
      cancel_url: `${SITE_URL}/checkout.html?stripe_cancelled=1&order=${orderNumber}`
    });

    return res.status(200).json({ success: true, order_number: orderNumber, checkout_url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Session Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
