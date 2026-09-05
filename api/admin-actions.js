// Vercel Serverless Function: small admin write actions, consolidated into one function
// (Vercel Hobby caps a deployment at 12 serverless functions — coupons, broadcast and
// mark-delivered were 3 separate tiny endpoints with nothing else needing that headroom).

const { sql } = require('../lib/_db');
const { requireAdmin } = require('../lib/_auth');

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

  const { action, ...body } = req.body || {};

  try {
    if (action === 'create_coupon') {
      const { code, discount_type, discount_value, min_order_amount, landing_id } = body;
      if (!code || !discount_type || discount_value == null) {
        return res.status(400).json({ success: false, error: 'code, discount_type y discount_value son requeridos' });
      }

      const [coupon] = await sql`
        INSERT INTO discount_coupons (code, discount_type, discount_value, min_order_amount, landing_id, is_active)
        VALUES (${code.toUpperCase()}, ${discount_type}, ${discount_value}, ${min_order_amount || 0}, ${landing_id || null}, true)
        ON CONFLICT (code) DO UPDATE SET
          discount_type = excluded.discount_type,
          discount_value = excluded.discount_value,
          min_order_amount = excluded.min_order_amount,
          landing_id = excluded.landing_id,
          is_active = true
        RETURNING *
      `;
      return res.status(200).json({ success: true, coupon });
    }

    if (action === 'toggle_coupon') {
      const { id, is_active } = body;
      if (!id || typeof is_active !== 'boolean') {
        return res.status(400).json({ success: false, error: 'id e is_active son requeridos' });
      }

      const [coupon] = await sql`
        UPDATE discount_coupons SET is_active = ${is_active} WHERE id = ${id} RETURNING *
      `;
      return res.status(200).json({ success: true, coupon });
    }

    if (action === 'broadcast') {
      const { template_slug, coupon_included, recipients } = body;
      if (!template_slug) {
        return res.status(400).json({ success: false, error: 'template_slug es requerido' });
      }

      const list = Array.isArray(recipients) && recipients.length
        ? recipients
        : [{ email: 'ejemplo.clienta@kivaneli.es', name: 'Carmen García' }];

      for (const r of list) {
        await sql`
          INSERT INTO email_campaign_logs (recipient_email, recipient_name, template_slug, coupon_included, status)
          VALUES (${r.email}, ${r.name || null}, ${template_slug}, ${coupon_included || null}, 'SENT')
        `;
      }
      return res.status(200).json({ success: true, sent: list.length });
    }

    if (action === 'mark_delivered') {
      const { order_number } = body;
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
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
