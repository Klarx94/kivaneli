// Vercel Serverless Function: Dropea Logistics Automated Webhook Handler
// Handles HMAC Signature Verification, Real-Time Status Mapping & Gated Digital Guide Dispatch

const crypto = require('crypto');
const { sql } = require('./_db');

const DROPEA_HMAC_SECRET = process.env.DROPEA_HMAC_SECRET;

if (!DROPEA_HMAC_SECRET) {
  throw new Error('Missing required env var DROPEA_HMAC_SECRET');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody || '{}');

    // 1. HMAC Signature Verification (enforced — requests without a valid signature are rejected)
    const incomingSignature = req.headers['x-dropea-hmac-sha256'] || req.headers['x-dropea-signature'] || '';
    let isSignatureValid = false;

    if (incomingSignature) {
      const calculatedHex = crypto.createHmac('sha256', DROPEA_HMAC_SECRET).update(rawBody).digest('hex');
      const calculatedBase64 = crypto.createHmac('sha256', DROPEA_HMAC_SECRET).update(rawBody).digest('base64');
      const incomingBuf = Buffer.from(incomingSignature);

      isSignatureValid =
        (incomingBuf.length === calculatedHex.length && crypto.timingSafeEqual(incomingBuf, Buffer.from(calculatedHex))) ||
        (incomingBuf.length === calculatedBase64.length && crypto.timingSafeEqual(incomingBuf, Buffer.from(calculatedBase64)));
    }

    if (!isSignatureValid) {
      return res.status(401).json({ success: false, error: 'Invalid or missing Dropea webhook signature' });
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

    // 3. Log incoming webhook in Neon
    await sql`
      INSERT INTO dropea_webhooks_log (event_type, order_number, dropea_tracking_id, shipping_status, payload, processed)
      VALUES (${eventType}, ${String(orderNumber)}, ${trackingCode}, ${normalizedStatus}, ${JSON.stringify(payload)}::jsonb, true)
    `;

    // 4. Update order record in Neon
    if (orderNumber) {
      if (trackingCode) {
        await sql`
          UPDATE orders SET shipping_status = ${normalizedStatus}, tracking_code = ${trackingCode}, updated_at = now()
          WHERE order_number = ${orderNumber}
        `;
      } else {
        await sql`
          UPDATE orders SET shipping_status = ${normalizedStatus}, updated_at = now()
          WHERE order_number = ${orderNumber}
        `;
      }
    }

    // 5. If DELIVERED: Unlock Digital Guides & Dispatch Delivery Email
    if (normalizedStatus === 'DELIVERED' && orderNumber) {
      const accessRecords = await sql`SELECT id FROM customer_digital_access WHERE order_id = ${orderNumber}`;

      if (accessRecords && accessRecords.length > 0) {
        await sql`
          UPDATE customer_digital_access
          SET is_unlocked = true,
              unlocked_at = now(),
              guides_unlocked = '["1_Guia_Diario_Ritual_30_Dias_KIVANELI.pdf","2_Guia_Secretos_Fitocosmetica_KIVANELI.pdf","3_Guia_Protocolo_Mirada_Radiante_KIVANELI.pdf"]'::jsonb
          WHERE order_id = ${orderNumber}
        `;
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
