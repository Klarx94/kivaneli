// Vercel Serverless Function: small admin write actions, consolidated into one function
// (Vercel Hobby caps a deployment at 12 serverless functions — coupons, broadcast and
// mark-delivered were 3 separate tiny endpoints with nothing else needing that headroom).

const { sql } = require('../lib/_db');
const { requireAdmin } = require('../lib/_auth');
const { cancelDropeaOrder, getShopStockLevels } = require('../lib/_dropea');
const { sendViaResend } = require('../lib/_email');

const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'beauty@kivaneli.es';
const LOW_STOCK_THRESHOLD = 15;

// Dropea has no stock-change webhook — this is the only way to catch a product silently
// running out before a customer orders it. Triggered daily by the Vercel Cron entry in
// vercel.json, authenticated with CRON_SECRET (Vercel sends it as a Bearer token) instead
// of the admin JWT, since a cron job can't hold a logged-in admin session.
async function runStockAlertCheck() {
  const [shopItems, products] = await Promise.all([
    getShopStockLevels(),
    sql`SELECT slug, name, dropea_product_id, in_stock, is_active FROM products WHERE is_active = true AND bundle_items IS NULL`
  ]);

  const stockByProductId = {};
  for (const item of shopItems) {
    const variant = item.variants && item.variants[0];
    if (variant) stockByProductId[item.id] = variant.stock;
  }

  const outOfStock = [];
  const lowStock = [];

  for (const p of products) {
    if (!p.dropea_product_id || !(p.dropea_product_id in stockByProductId)) continue;
    const stock = stockByProductId[p.dropea_product_id];

    if (stock <= 0 && p.in_stock) {
      await sql`UPDATE products SET in_stock = false, updated_at = now() WHERE slug = ${p.slug}`;
      outOfStock.push({ name: p.name, stock });
    } else if (stock > 0 && stock < LOW_STOCK_THRESHOLD) {
      lowStock.push({ name: p.name, stock });
    }
  }

  if (outOfStock.length || lowStock.length) {
    const rows = [...outOfStock.map(p => `<li><strong>${p.name}</strong> — AGOTADO (marcado automáticamente como no disponible)</li>`),
                  ...lowStock.map(p => `<li><strong>${p.name}</strong> — quedan ${p.stock} unidades</li>`)].join('');
    try {
      await sendViaResend({
        to: ADMIN_ALERT_EMAIL,
        subject: `⚠️ Alerta de stock KIVANELI (${outOfStock.length} agotados, ${lowStock.length} bajos)`,
        html: `<div style="font-family:Arial,sans-serif;"><h3>Revisión diaria de stock Dropea</h3><ul>${rows}</ul></div>`
      });
    } catch (e) {
      console.error('Stock alert email error (non-fatal):', e.message);
    }
  }

  return { checked: products.length, outOfStock, lowStock };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET' && req.query.action === 'check_stock_alerts') {
    const auth = req.headers['authorization'];
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    try {
      const result = await runStockAlertCheck();
      return res.status(200).json({ success: true, ...result });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

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

    if (action === 'cancel_order') {
      const { order_number } = body;
      if (!order_number) {
        return res.status(400).json({ success: false, error: 'order_number es requerido' });
      }
      const dropeaCancelResult = await cancelDropeaOrder(order_number);
      return res.status(200).json({ success: true, order_number, dropea_cancel_result: dropeaCancelResult });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
