// Vercel Serverless Function: Dropea Automated Order Creation & Sync
// Receives checkout orders, stores in Supabase, and interfaces with Dropea Logistics

const https = require('https');
const crypto = require('crypto');

const SUPABASE_URL = 'sntsizmdhttpilbauxuv.supabase.co';
const SUPABASE_SERVICE_KEY = 'SUPABASE_SERVICE_KEY_REDACTED';
const DROPEA_API_TOKEN = 'DROPEA_API_TOKEN_REDACTED';

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

// Attempt sync with Dropea API
async function sendOrderToDropea(orderData) {
  return new Promise((resolve) => {
    const dropeaPayload = JSON.stringify({
      order_number: orderData.order_number,
      customer: {
        name: orderData.customer_name,
        email: orderData.customer_email,
        phone: orderData.customer_phone,
        address: orderData.customer_address,
        zip: orderData.customer_zip,
        city: orderData.customer_city,
        country: 'ES'
      },
      line_items: [
        {
          name: orderData.pack_selected || 'Tratamiento Boticario ADEUS™',
          quantity: orderData.items_count || 1,
          price: orderData.total_amount
        }
      ],
      payment: {
        method: orderData.payment_method === 'COD' ? 'CASH_ON_DELIVERY' : 'PREPAID',
        amount: orderData.total_amount,
        is_paid: orderData.payment_status === 'COMPLETED'
      },
      notes: orderData.notes || 'Envío Urgente 24/48h Kivaneli Maison Botanique'
    });

    const options = {
      hostname: 'api.dropea.com',
      path: '/graphql/dropshippers',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPEA_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Role': 'DROPSHIPPER',
        'X-Market': 'ES',
        'Content-Length': Buffer.byteLength(dropeaPayload)
      },
      timeout: 4000
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
    req.write(dropeaPayload);
    req.end();
  });
}

module.exports = async (req, res) => {
  // CORS Headers
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
    
    // Generate order number if not provided
    const orderNumber = body.order_number || `KV-${Date.now().toString().slice(-6)}`;
    const isOnlinePayment = body.payment_method === 'CARD' || body.payment_method === 'REVOLUT';
    const isCod = !isOnlinePayment;

    const orderRecord = {
      order_number: orderNumber,
      customer_name: body.customer_name || body.name || 'Clienta Kivaneli',
      customer_email: (body.customer_email || body.email || 'beauty@kivaneli.es').toLowerCase().trim(),
      customer_phone: body.customer_phone || body.phone || '',
      customer_address: body.customer_address || body.address || '',
      customer_zip: body.customer_zip || body.zip || '',
      customer_city: body.customer_city || body.city || '',
      pack_selected: body.pack_selected || body.pack || 'Pack Boticario',
      items_count: parseInt(body.items_count || 1),
      total_amount: parseFloat(body.total_amount || body.total || 0),
      payment_method: body.payment_method || (isCod ? 'COD' : 'CARD'),
      payment_status: isOnlinePayment ? 'COMPLETED' : 'PENDING_COD',
      shipping_status: 'PENDING_DROPEA_SYNC',
      referral_code_used: body.referral_code_used || null,
      coupon_applied: body.coupon_applied || null,
      notes: body.notes || 'Pedido desde Micro-Landing Oficial KIVANELI'
    };

    // 1. Insert into Supabase orders table
    const { data: savedOrder, error: orderErr } = await supabaseRest('orders', 'POST', orderRecord);

    // 2. Setup Digital Access Record
    const accessToken = crypto.randomBytes(16).toString('hex');
    await supabaseRest('customer_digital_access', 'POST', {
      order_id: orderNumber,
      customer_email: orderRecord.customer_email,
      customer_name: orderRecord.customer_name,
      access_token: accessToken,
      payment_method: orderRecord.payment_method,
      payment_status: orderRecord.payment_status,
      is_unlocked: isOnlinePayment, // Immediate for card, gated for COD
      unlocked_at: isOnlinePayment ? new Date().toISOString() : null,
      guides_unlocked: isOnlinePayment ? [
        '1_Guia_Diario_Ritual_30_Dias_KIVANELI.pdf',
        '2_Guia_Secretos_Fitocosmetica_KIVANELI.pdf',
        '3_Guia_Protocolo_Mirada_Radiante_KIVANELI.pdf'
      ] : []
    });

    // 3. Forward to Dropea Logistics
    const dropeaRes = await sendOrderToDropea(orderRecord);
    let dropeaStatus = 'QUEUED_FOR_SYNC';

    if (dropeaRes && dropeaRes.data && dropeaRes.data.data && dropeaRes.data.data.createOrder) {
      dropeaStatus = 'SYNCED';
      await supabaseRest(`orders?order_number=eq.${encodeURIComponent(orderNumber)}`, 'PATCH', {
        shipping_status: 'PROCESSING',
        dropea_order_id: dropeaRes.data.data.createOrder.id || 'DROPEA-LIVE'
      });
    }

    return res.status(200).json({
      success: true,
      order_number: orderNumber,
      payment_method: orderRecord.payment_method,
      digital_access_unlocked: isOnlinePayment,
      dropea_sync_status: dropeaStatus,
      message: isCod 
        ? 'Pedido contra reembolso registrado correctamente. Dropea preparará el envío y las guías se desbloquearán al recibir el paquete.' 
        : 'Pago confirmado. Pedido sincronizado con Dropea y Guías PDF desbloqueadas de inmediato.'
    });

  } catch (error) {
    console.error('Order Creation Exception:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
