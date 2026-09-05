// Vercel Serverless Function: Manually mark an order delivered & unlock digital guides
// Replaces admin.html's confirmDropeaDeliveryManually() direct table updates
// (and the dead RPC-based duplicate of that same function that was never reachable).

const { sql } = require('./_db');
const { requireAdmin } = require('./_auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ success: false, error: e.message });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { order_number } = req.body || {};
    if (!order_number) {
      return res.status(400).json({ success: false, error: 'order_number es requerido' });
    }

    await sql`
      UPDATE orders SET shipping_status = 'DELIVERED', payment_status = 'PAID', updated_at = now()
      WHERE order_number = ${order_number}
    `;

    await sql`
      UPDATE customer_digital_access
      SET is_unlocked = true,
          unlocked_at = now(),
          payment_status = 'PAID',
          guides_unlocked = '["1_Guia_Diario_Ritual_30_Dias_KIVANELI.pdf","2_Guia_Secretos_Fitocosmetica_KIVANELI.pdf","3_Guia_Protocolo_Mirada_Radiante_KIVANELI.pdf"]'::jsonb
      WHERE order_id = ${order_number}
    `;

    return res.status(200).json({ success: true, order_number });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
