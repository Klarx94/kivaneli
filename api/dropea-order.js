// Vercel Serverless Function: COD order creation (card payments go through
// api/create-checkout-session.js + api/stripe-webhook.js instead).

const crypto = require('crypto');
const { sql } = require('./_db');
const { resolveDropeaLineItems, sendOrderToDropeaPublicApi } = require('./_dropea');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body || {};
    const orderNumber = body.order_number || `KV-${Date.now().toString().slice(-6)}`;

    const orderRecord = {
      order_number: orderNumber,
      customer_name: body.customer_name || body.name || 'Clienta Kivaneli',
      customer_email: (body.customer_email || body.email || 'beauty@kivaneli.es').toLowerCase().trim(),
      customer_phone: body.customer_phone || body.phone || '',
      customer_address: body.customer_address || body.address || '',
      customer_zip: body.customer_zip || body.zip || '',
      customer_city: body.customer_city || body.city || '',
      pack_selected: body.pack_selected || body.pack || 'ADEUS Creme para Massagem Corporal 300 g',
      items_count: parseInt(body.items_count || 1),
      total_amount: parseFloat(body.total_amount || body.total || 0),
      payment_method: 'COD',
      payment_status: 'PENDING_COD',
      shipping_status: 'PROCESSING',
      dropea_variant_id: body.dropea_variant_id || 32674,
      coupon_applied: body.coupon_applied || null,
      referral_code_used: body.referral_code_used || null,
      notes: body.notes || 'Pedido desde Tienda Oficial KIVANELI'
    };

    // 1. Save in Neon
    await sql`
      INSERT INTO orders (
        order_number, customer_name, customer_email, customer_phone, customer_address,
        customer_zip, customer_city, pack_selected, items_count, total_amount,
        payment_method, payment_status, shipping_status, dropea_variant_id,
        coupon_applied, referral_code_used, notes, cart_items
      ) VALUES (
        ${orderRecord.order_number}, ${orderRecord.customer_name}, ${orderRecord.customer_email},
        ${orderRecord.customer_phone}, ${orderRecord.customer_address}, ${orderRecord.customer_zip},
        ${orderRecord.customer_city}, ${orderRecord.pack_selected}, ${orderRecord.items_count},
        ${orderRecord.total_amount}, ${orderRecord.payment_method}, ${orderRecord.payment_status},
        ${orderRecord.shipping_status}, ${orderRecord.dropea_variant_id}, ${orderRecord.coupon_applied},
        ${orderRecord.referral_code_used}, ${orderRecord.notes}, ${JSON.stringify(body.items || [])}::jsonb
      )
    `;

    // 2. Digital Guides Record — locked for COD until Dropea confirms real-world delivery
    const accessToken = crypto.randomBytes(16).toString('hex');
    await sql`
      INSERT INTO customer_digital_access (
        order_id, customer_email, customer_name, access_token, payment_method,
        payment_status, is_unlocked, unlocked_at, guides_unlocked
      ) VALUES (
        ${orderNumber}, ${orderRecord.customer_email}, ${orderRecord.customer_name}, ${accessToken},
        ${orderRecord.payment_method}, ${orderRecord.payment_status}, false, null, '[]'::jsonb
      )
    `;

    // 3. Dispatch directly to Dropea Public API
    const lineItems = await resolveDropeaLineItems(body.items, orderRecord);
    const dropeaRes = await sendOrderToDropeaPublicApi(orderRecord, lineItems);
    let dropeaOrderId = null;
    let dropeaStatus = 'SYNC_PENDING';

    if (dropeaRes && dropeaRes.data && dropeaRes.data.success && dropeaRes.data.data) {
      dropeaOrderId = dropeaRes.data.data.id;
      dropeaStatus = 'SYNCED_DROPEA_LIVE';

      await sql`
        UPDATE orders SET dropea_order_id = ${String(dropeaOrderId)}, shipping_status = 'CONFIRMED', updated_at = now()
        WHERE order_number = ${orderNumber}
      `;
    }

    return res.status(200).json({
      success: true,
      order_number: orderNumber,
      dropea_order_id: dropeaOrderId,
      dropea_sync_status: dropeaStatus,
      payment_method: 'COD',
      digital_access_unlocked: false,
      dropea_response: dropeaRes.data || dropeaRes.error,
      message: 'Pedido contra reembolso transmitido a Dropea Logistics con éxito.'
    });

  } catch (error) {
    console.error('Order Dispatch Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
