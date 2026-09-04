// Vercel Serverless Function: Dropea Automated Order Creation & Sync (Spain Production Gateway)
// Connects to https://es.public-api.dropea.com/dropshipper/orders

const https = require('https');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DROPEA_API_TOKEN = process.env.DROPEA_API_TOKEN;
const DROPEA_STORE_ID = process.env.DROPEA_STORE_ID || 18516; // Kivaneli Store ID in Dropea

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !DROPEA_API_TOKEN) {
  throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, DROPEA_API_TOKEN');
}

async function supabaseRest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = https.request({
      hostname: SUPABASE_URL,
      path: `/rest/v1/${path}`,
      method: method,
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Send Order to Dropea Spain Gateway
async function sendOrderToDropeaPublicApi(orderData) {
  return new Promise((resolve) => {
    const variantId = orderData.dropea_variant_id || 32674;
    const quantity = parseInt(orderData.items_count || 1);
    const unitPrice = parseFloat((parseFloat(orderData.total_amount) / quantity).toFixed(2));

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
      line_items: [
        {
          variant_id: variantId,
          quantity: quantity,
          unit_price: unitPrice
        }
      ]
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
    const isOnlinePayment = body.payment_method === 'CARD' || body.payment_method === 'REVOLUT' || body.payment_method === 'STRIPE';
    const isCod = !isOnlinePayment;

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
      payment_method: isCod ? 'COD' : 'CARD',
      payment_status: isOnlinePayment ? 'COMPLETED' : 'PENDING_COD',
      shipping_status: 'PROCESSING',
      dropea_variant_id: body.dropea_variant_id || 32674,
      coupon_applied: body.coupon_applied || null,
      referral_code_used: body.referral_code_used || null,
      notes: body.notes || 'Pedido desde Tienda Oficial KIVANELI'
    };

    // 1. Save in Supabase
    await supabaseRest('orders', 'POST', orderRecord);

    // 2. Digital Guides Record
    const accessToken = crypto.randomBytes(16).toString('hex');
    await supabaseRest('customer_digital_access', 'POST', {
      order_id: orderNumber,
      customer_email: orderRecord.customer_email,
      customer_name: orderRecord.customer_name,
      access_token: accessToken,
      payment_method: orderRecord.payment_method,
      payment_status: orderRecord.payment_status,
      is_unlocked: isOnlinePayment,
      unlocked_at: isOnlinePayment ? new Date().toISOString() : null,
      guides_unlocked: isOnlinePayment ? [
        '1_Guia_Diario_Ritual_30_Dias_KIVANELI.pdf',
        '2_Guia_Secretos_Fitocosmetica_KIVANELI.pdf',
        '3_Guia_Protocolo_Mirada_Radiante_KIVANELI.pdf'
      ] : []
    });

    // 3. Dispatch directly to Dropea Public API
    const dropeaRes = await sendOrderToDropeaPublicApi(orderRecord);
    let dropeaOrderId = null;
    let dropeaStatus = 'SYNC_PENDING';

    if (dropeaRes && dropeaRes.data && dropeaRes.data.success && dropeaRes.data.data) {
      dropeaOrderId = dropeaRes.data.data.id;
      dropeaStatus = 'SYNCED_DROPEA_LIVE';
      
      await supabaseRest(`orders?order_number=eq.${encodeURIComponent(orderNumber)}`, 'PATCH', {
        dropea_order_id: String(dropeaOrderId),
        shipping_status: 'CONFIRMED'
      });
    }

    return res.status(200).json({
      success: true,
      order_number: orderNumber,
      dropea_order_id: dropeaOrderId,
      dropea_sync_status: dropeaStatus,
      payment_method: orderRecord.payment_method,
      digital_access_unlocked: isOnlinePayment,
      dropea_response: dropeaRes.data || dropeaRes.error,
      message: isCod 
        ? 'Pedido contra reembolso transmitido a Dropea Logistics con éxito.' 
        : 'Pago confirmado. Pedido transmitido a Dropea y guías desbloqueadas.'
    });

  } catch (error) {
    console.error('Order Dispatch Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
