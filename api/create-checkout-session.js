// Vercel Serverless Function: Create a Stripe Checkout Session for card payments.
// COD orders never touch this file — they go straight through api/dropea-order.js.
// Real payment confirmation happens server-side in api/stripe-webhook.js; this endpoint
// only ever creates a PENDING order, it never marks anything as paid.

const Stripe = require('stripe');
const { sql } = require('./_db');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = process.env.SITE_URL || 'https://kivaneli.es';

if (!STRIPE_SECRET_KEY) {
  throw new Error('Missing required env var STRIPE_SECRET_KEY');
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = req.body || {};
    const orderNumber = body.order_number || `KV-${Date.now().toString().slice(-6)}`;
    const total = parseFloat(body.total_amount || 0);

    if (!total || total <= 0) {
      return res.status(400).json({ success: false, error: 'total_amount inválido' });
    }

    const orderRecord = {
      order_number: orderNumber,
      customer_name: body.customer_name || 'Clienta Kivaneli',
      customer_email: (body.customer_email || 'beauty@kivaneli.es').toLowerCase().trim(),
      customer_phone: body.customer_phone || '',
      customer_address: body.customer_address || '',
      customer_zip: body.customer_zip || '',
      customer_city: body.customer_city || '',
      pack_selected: body.pack_selected || '',
      items_count: parseInt(body.items_count || 1),
      total_amount: total,
      coupon_applied: body.coupon_applied || null
    };

    // Order row starts as PENDING — the Stripe webhook flips it to COMPLETED once payment
    // actually clears, and only then dispatches to Dropea and unlocks the digital guides.
    await sql`
      INSERT INTO orders (
        order_number, customer_name, customer_email, customer_phone, customer_address,
        customer_zip, customer_city, pack_selected, items_count, total_amount,
        payment_method, payment_status, shipping_status, coupon_applied, cart_items
      ) VALUES (
        ${orderRecord.order_number}, ${orderRecord.customer_name}, ${orderRecord.customer_email},
        ${orderRecord.customer_phone}, ${orderRecord.customer_address}, ${orderRecord.customer_zip},
        ${orderRecord.customer_city}, ${orderRecord.pack_selected}, ${orderRecord.items_count},
        ${orderRecord.total_amount}, 'CARD', 'PENDING_STRIPE', 'AWAITING_PAYMENT',
        ${orderRecord.coupon_applied}, ${JSON.stringify(body.items || [])}::jsonb
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
          unit_amount: Math.round(total * 100)
        },
        quantity: 1
      }],
      metadata: { order_number: orderNumber },
      success_url: `${SITE_URL}/checkout.html?stripe_success=1&order=${orderNumber}`,
      cancel_url: `${SITE_URL}/checkout.html?stripe_cancelled=1&order=${orderNumber}`
    });

    return res.status(200).json({ success: true, order_number: orderNumber, checkout_url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Session Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
