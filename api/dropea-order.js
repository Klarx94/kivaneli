// Vercel Serverless Function: COD order creation (card payments go through
// api/create-checkout-session.js + api/stripe-webhook.js instead).

const crypto = require('crypto');
const { sql } = require('../lib/_db');
const { resolveDropeaLineItems, sendOrderToDropeaPublicApi } = require('../lib/_dropea');
const { upsertCustomer, creditReferralIfAny } = require('../lib/_customers');
const { computeAuthoritativeOrder } = require('../lib/_pricing');
const { sendOrderConfirmationEmails } = require('../lib/_email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+ ()-]{7,20}$/;

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

    // Honeypot: a real customer never fills this (it's not visible in the form). A bot
    // filling every field usually fills it too — silently pretend success without doing
    // anything real, so the bot doesn't learn to look for a different signal.
    if (body.website) {
      return res.status(200).json({ success: true, order_number: 'KV-000000', message: 'Pedido recibido.' });
    }

    const customerName = String(body.customer_name || body.name || '').trim();
    const customerEmail = String(body.customer_email || body.email || '').toLowerCase().trim();
    const customerPhone = String(body.customer_phone || body.phone || '').trim();
    const customerAddress = String(body.customer_address || body.address || '').trim();
    const customerZip = String(body.customer_zip || body.zip || '').trim();
    const customerCity = String(body.customer_city || body.city || '').trim();

    if (!customerName || customerName.length < 3) {
      return res.status(400).json({ success: false, error: 'Nombre inválido' });
    }
    if (!EMAIL_RE.test(customerEmail)) {
      return res.status(400).json({ success: false, error: 'Email inválido' });
    }
    if (!PHONE_RE.test(customerPhone)) {
      return res.status(400).json({ success: false, error: 'Teléfono inválido' });
    }
    if (!customerAddress || customerAddress.length < 5) {
      return res.status(400).json({ success: false, error: 'Dirección inválida' });
    }
    if (!customerZip || customerZip.length < 4) {
      return res.status(400).json({ success: false, error: 'Código postal inválido' });
    }
    if (!customerCity) {
      return res.status(400).json({ success: false, error: 'Ciudad requerida' });
    }

    // Basic abuse guard: too many orders from the same email/phone in a short window is
    // almost always a bot or a mistake, never a legitimate rush of separate real purchases.
    const [recent] = await sql`
      SELECT count(*)::int AS n FROM orders
      WHERE (customer_email = ${customerEmail} OR customer_phone = ${customerPhone})
        AND created_at > now() - interval '10 minutes'
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
      pack_selected: body.pack_selected || body.pack || 'Pedido KIVANELI',
      items_count: priced.items.reduce((acc, i) => acc + i.quantity, 0),
      total_amount: priced.total,
      payment_method: 'COD',
      payment_status: 'PENDING_COD',
      shipping_status: 'PROCESSING',
      dropea_variant_id: body.dropea_variant_id || 32674,
      coupon_applied: priced.appliedCoupon,
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
        ${orderRecord.referral_code_used}, ${orderRecord.notes}, ${JSON.stringify(priced.items)}::jsonb
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
    const lineItems = await resolveDropeaLineItems(priced.items, orderRecord);
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

    // 4. Register/update the customer and credit whoever referred them, if anyone
    let referralCode = null;
    let referralCredit = null;
    try {
      referralCode = await upsertCustomer({
        email: orderRecord.customer_email,
        name: orderRecord.customer_name,
        phone: orderRecord.customer_phone,
        city: orderRecord.customer_city,
        orderAmount: orderRecord.total_amount
      });
      referralCredit = await creditReferralIfAny({
        referralCodeUsed: orderRecord.referral_code_used,
        buyerEmail: orderRecord.customer_email,
        orderNumber
      });
    } catch (custErr) {
      console.error('Customer/referral tracking error (non-fatal):', custErr.message);
    }

    // 5. Email confirmation to the customer + notification to the admin inbox (non-fatal)
    try {
      await sendOrderConfirmationEmails({ ...orderRecord, referralCredit });
    } catch (emailErr) {
      console.error('Order email error (non-fatal):', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      order_number: orderNumber,
      dropea_order_id: dropeaOrderId,
      dropea_sync_status: dropeaStatus,
      payment_method: 'COD',
      digital_access_unlocked: false,
      dropea_response: dropeaRes.data || dropeaRes.error,
      referral_code: referralCode,
      referral_credit_issued: !!referralCredit,
      total_amount: priced.total,
      message: 'Pedido contra reembolso transmitido con éxito.'
    });

  } catch (error) {
    console.error('Order Dispatch Error:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};
