// Shared Dropea dispatch logic — used by both the COD checkout path (api/dropea-order.js)
// and the Stripe payment-confirmation path (api/stripe-webhook.js), so a card order and a
// COD order end up shipped through Dropea exactly the same way.

const https = require('https');
const crypto = require('crypto');
const { sql } = require('./_db');

const DROPEA_API_TOKEN = process.env.DROPEA_API_TOKEN;
const DROPEA_STORE_ID = process.env.DROPEA_STORE_ID || 18516;

if (!DROPEA_API_TOKEN) {
  throw new Error('Missing required env var DROPEA_API_TOKEN');
}

// Resolve the cart's items into real Dropea line_items, expanding any bundle product
// (e.g. "Pack Ritual 3-en-1") into its individual component variants — Dropea has no
// concept of a Kivaneli bundle, it only ships real, individually stocked variant_ids.
async function resolveDropeaLineItems(cartItems, fallback) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return [{
      variant_id: fallback.dropea_variant_id || 32674,
      quantity: fallback.items_count || 1,
      unit_price: parseFloat((fallback.total_amount / (fallback.items_count || 1)).toFixed(2))
    }];
  }

  const lineItems = [];
  for (const item of cartItems) {
    const quantity = parseInt(item.quantity || 1);
    const price = parseFloat(item.price || 0);
    let product = null;
    if (item.id) {
      const rows = await sql`SELECT dropea_variant_id, bundle_items FROM products WHERE slug = ${item.id}`;
      product = rows[0] || null;
    }

    if (product && product.bundle_items && product.bundle_items.length) {
      const n = product.bundle_items.length;
      const perComponentPrice = parseFloat((price / n).toFixed(2));
      for (const comp of product.bundle_items) {
        lineItems.push({
          variant_id: comp.dropea_variant_id,
          quantity: comp.quantity * quantity,
          unit_price: perComponentPrice
        });
      }
    } else {
      const variantId = (product && product.dropea_variant_id) || item.dropeaVariantId || 32674;
      lineItems.push({ variant_id: variantId, quantity, unit_price: price });
    }
  }
  return lineItems;
}

function sendOrderToDropeaPublicApi(orderData, lineItems) {
  return new Promise((resolve) => {
    const nameParts = (orderData.customer_name || 'Clienta Kivaneli').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Clienta';
    const lastName = nameParts.slice(1).join(' ') || 'Kivaneli';

    const dropeaBody = JSON.stringify({
      store_id: DROPEA_STORE_ID,
      external_order_id: orderData.order_number,
      payment_method: orderData.payment_method === 'COD' ? 'COD' : 'PAID',
      carrier: 'GLS',
      service_type: '96|18', // GLS 24h
      customer_details: {
        name: orderData.customer_name,
        first_name: firstName,
        last_name: lastName,
        email: orderData.customer_email,
        phone: orderData.customer_phone,
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          address_line_1: orderData.customer_address,
          city: orderData.customer_city,
          state: orderData.customer_city || 'Madrid',
          postal_code: orderData.customer_zip,
          country: 'ES'
        }
      },
      line_items: lineItems
    });

    const options = {
      hostname: 'es.public-api.dropea.com',
      path: '/dropshipper/orders',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPEA_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        'Content-Length': Buffer.byteLength(dropeaBody)
      },
      timeout: 7000
    };

    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: d });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'TIMEOUT' }); });
    req.write(dropeaBody);
    req.end();
  });
}

// Dispatches an already-persisted order to Dropea and updates its row with the result.
async function dispatchOrderToDropea(orderNumber) {
  const [order] = await sql`SELECT * FROM orders WHERE order_number = ${orderNumber}`;
  if (!order) throw new Error(`Order ${orderNumber} not found`);

  const lineItems = await resolveDropeaLineItems(order.cart_items, order);
  const dropeaRes = await sendOrderToDropeaPublicApi(order, lineItems);

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

  return { dropeaOrderId, dropeaStatus, dropeaResponse: dropeaRes.data || dropeaRes.error };
}

module.exports = { resolveDropeaLineItems, sendOrderToDropeaPublicApi, dispatchOrderToDropea };
