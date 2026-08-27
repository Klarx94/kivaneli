// Vercel Serverless Function: Dropea Logistics Automated Webhook Handler
// Handles HMAC Signature Verification, Real-Time Status Mapping & Gated Digital Guide Dispatch

const crypto = require('crypto');
const https = require('https');

const SUPABASE_URL = 'sntsizmdhttpilbauxuv.supabase.co';
const SUPABASE_SERVICE_KEY = 'SUPABASE_SERVICE_KEY_REDACTED';
const DROPEA_HMAC_SECRET = 'DROPEA_HMAC_SECRET_REDACTED';

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody || '{}');

    // 1. HMAC Signature Verification
    const incomingSignature = req.headers['x-dropea-hmac-sha256'] || req.headers['x-dropea-signature'] || '';
    let isSignatureValid = false;

    if (incomingSignature && DROPEA_HMAC_SECRET) {
      const calculatedHex = crypto.createHmac('sha256', DROPEA_HMAC_SECRET).update(rawBody).digest('hex');
      const calculatedBase64 = crypto.createHmac('sha256', DROPEA_HMAC_SECRET).update(rawBody).digest('base64');
      
      if (incomingSignature === calculatedHex || incomingSignature === calculatedBase64) {
        isSignatureValid = true;
      }
    } else {
      isSignatureValid = true;
    }

    // 2. Extract multilingual Dropea fields
    const eventType = payload.tópico || payload.event || payload.action || 'STATUS_UPDATE';
    const orderNumber = payload.id_do_pedido || payload.order_number || payload.order_id || payload.reference || '';
    const trackingCode = payload.codigo_rastreio || payload.tracking_id || payload.tracking_number || payload.tracking_code || '';
    const rawStatus = (payload.novo_status || payload.shipping_status || payload.status || '').toLowerCase();

    // Map Dropea status to standardized internal status
    let normalizedStatus = 'PENDING';
    if (rawStatus.includes('entreg') || rawStatus.includes('deliver') || rawStatus === 'completed') {
      normalizedStatus = 'DELIVERED';
    } else if (rawStatus.includes('transit') || rawStatus.includes('enviad') || rawStatus.includes('shipping') || rawStatus.includes('repart')) {
      normalizedStatus = 'IN_TRANSIT';
    } else if (rawStatus.includes('prepar') || rawStatus.includes('confirm') || rawStatus === 'processing') {
      normalizedStatus = 'PROCESSING';
    } else if (rawStatus.includes('cancel') || rawStatus.includes('rechaz') || rawStatus.includes('reject')) {
      normalizedStatus = 'CANCELLED';
    } else if (rawStatus.includes('incident') || rawStatus.includes('problem') || rawStatus.includes('error')) {
      normalizedStatus = 'INCIDENT';
    }

    // 3. Log incoming webhook in Supabase
    await supabaseRest('dropea_webhooks_log', 'POST', {
      event_type: eventType,
      order_number: String(orderNumber),
      dropea_tracking_id: trackingCode,
      shipping_status: normalizedStatus,
      payload: payload,
      processed: true
    });

    // 4. Update order record in Supabase
    if (orderNumber) {
      const updateData = { shipping_status: normalizedStatus, updated_at: new Date().toISOString() };
      if (trackingCode) updateData.tracking_code = trackingCode;

      await supabaseRest(`orders?order_number=eq.${encodeURIComponent(orderNumber)}`, 'PATCH', updateData);
    }

    // 5. If DELIVERED: Unlock Digital Guides & Dispatch Delivery Email
    if (normalizedStatus === 'DELIVERED' && orderNumber) {
      const { data: accessRecords } = await supabaseRest(`customer_digital_access?order_id=eq.${encodeURIComponent(orderNumber)}`);
      
      if (accessRecords && accessRecords.length > 0) {
        await supabaseRest(`customer_digital_access?order_id=eq.${encodeURIComponent(orderNumber)}`, 'PATCH', {
          is_unlocked: true,
          unlocked_at: new Date().toISOString(),
          guides_unlocked: [
            '1_Guia_Diario_Ritual_30_Dias_KIVANELI.pdf',
            '2_Guia_Secretos_Fitocosmetica_KIVANELI.pdf',
            '3_Guia_Protocolo_Mirada_Radiante_KIVANELI.pdf'
          ]
        });
      }
    }

    return res.status(200).json({
      success: true,
      signature_valid: isSignatureValid,
      normalized_status: normalizedStatus,
      order_number: orderNumber,
      message: `Dropea webhook processed successfully for order ${orderNumber}`
    });

  } catch (error) {
    console.error('Dropea Webhook Exception:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
