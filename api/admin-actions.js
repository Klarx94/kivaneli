// Vercel Serverless Function: small admin write actions, consolidated into one function
// (Vercel Hobby caps a deployment at 12 serverless functions — coupons, broadcast and
// mark-delivered were 3 separate tiny endpoints with nothing else needing that headroom).

const { sql } = require('../lib/_db');
const { requireAdmin } = require('../lib/_auth');
const { cancelDropeaOrder, getShopStockLevels } = require('../lib/_dropea');
const { sendEmail } = require('../lib/_email');
const { put } = require('@vercel/blob');

const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'beauty@kivaneli.es';
const LOW_STOCK_THRESHOLD = 15;

// Vercel serverless functions cap the whole JSON request body around ~4.5MB, and base64
// inflates the raw file by ~33% on top of that — these caps are sized to stay safely under
// that ceiling with the request as a whole, not just the file itself.
const UPLOAD_MAX_BYTES = { image: 3 * 1024 * 1024, video: 3 * 1024 * 1024 };
const BLOB_TOKEN = process.env.BLOBKIVANELI_READ_WRITE_TOKEN;

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
      await sendEmail({
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
      const { code, discount_type, discount_value, min_order_amount, landing_id, description } = body;
      if (!code || !discount_type || discount_value == null) {
        return res.status(400).json({ success: false, error: 'code, discount_type y discount_value son requeridos' });
      }
      if (!description || !description.trim()) {
        return res.status(400).json({ success: false, error: 'La descripción (para qué es este cupón) es obligatoria' });
      }

      const [coupon] = await sql`
        INSERT INTO discount_coupons (code, discount_type, discount_value, min_order_amount, landing_id, description, is_active)
        VALUES (${code.toUpperCase()}, ${discount_type}, ${discount_value}, ${min_order_amount || 0}, ${landing_id || null}, ${description.trim()}, true)
        ON CONFLICT (code) DO UPDATE SET
          discount_type = excluded.discount_type,
          discount_value = excluded.discount_value,
          min_order_amount = excluded.min_order_amount,
          landing_id = excluded.landing_id,
          description = excluded.description,
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

      const list = Array.isArray(recipients) ? recipients.filter(r => r && r.email) : [];
      if (!list.length) {
        return res.status(400).json({ success: false, error: 'No hay destinatarias reales todavía (la base de clientas está vacía).' });
      }

      const [template] = await sql`SELECT subject, html_body FROM email_templates WHERE slug = ${template_slug} AND is_active = true`;
      if (!template) {
        return res.status(400).json({ success: false, error: `Plantilla "${template_slug}" no encontrada o inactiva` });
      }

      let sent = 0;
      let failed = 0;

      for (const r of list) {
        // Generic substitution — a manual broadcast only ever knows the recipient's name and
        // an optional coupon, never order-specific fields (those templates fire automatically
        // from the order flow instead, not from here).
        const html = template.html_body
          .replace(/\{\{customer_name\}\}/g, r.name || 'clienta')
          .replace(/\{\{referrer_name\}\}/g, r.name || 'clienta')
          .replace(/\{\{recovery_discount_code\}\}/g, coupon_included || '')
          .replace(/\{\{voucher_code\}\}/g, coupon_included || '')
          .replace(/\{\{vip_code\}\}/g, coupon_included || '')
          .replace(/\{\{referral_code\}\}/g, coupon_included || '')
          .replace(/\{\{[a-z_]+\}\}/gi, '');
        const subject = (template.subject || '').replace(/\{\{customer_name\}\}/g, r.name || 'clienta').replace(/\{\{[a-z_]+\}\}/gi, '');

        let status = 'SENT';
        try {
          await sendEmail({ to: r.email, subject, html });
          sent++;
        } catch (e) {
          status = 'FAILED';
          failed++;
          console.error('Broadcast send error (non-fatal) for', r.email, ':', e.message);
        }

        await sql`
          INSERT INTO email_campaign_logs (recipient_email, recipient_name, template_slug, coupon_included, status)
          VALUES (${r.email}, ${r.name || null}, ${template_slug}, ${coupon_included || null}, ${status})
        `;
      }
      return res.status(200).json({ success: true, sent, failed });
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

    if (action === 'upload_media') {
      const { filename, content_type, data_base64, media_type } = body;
      if (!filename || !content_type || !data_base64) {
        return res.status(400).json({ success: false, error: 'filename, content_type y data_base64 son requeridos' });
      }
      if (!BLOB_TOKEN) {
        return res.status(500).json({ success: false, error: 'Almacén de archivos no configurado (falta BLOBKIVANELI_READ_WRITE_TOKEN)' });
      }

      const kind = media_type === 'video' ? 'video' : 'image';
      const validPrefix = kind === 'video' ? 'video/' : 'image/';
      if (!content_type.startsWith(validPrefix)) {
        return res.status(400).json({ success: false, error: `El archivo debe ser de tipo ${validPrefix}*` });
      }

      const buffer = Buffer.from(data_base64, 'base64');
      if (buffer.length > UPLOAD_MAX_BYTES[kind]) {
        return res.status(400).json({ success: false, error: `Archivo demasiado grande (máx ${(UPLOAD_MAX_BYTES[kind] / (1024 * 1024)).toFixed(1)}MB)` });
      }

      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const blob = await put(`products/${kind}s/${Date.now()}-${safeName}`, buffer, {
        access: 'public',
        contentType: content_type,
        token: BLOB_TOKEN,
        addRandomSuffix: true
      });

      return res.status(200).json({ success: true, url: blob.url });
    }

    if (action === 'delete_order') {
      const { order_number } = body;
      if (!order_number) {
        return res.status(400).json({ success: false, error: 'order_number es requerido' });
      }
      // Real, permanent removal — for test/debug orders that should never have counted as
      // real activity. A genuine order that just didn't work out stays as CANCELLED instead.
      await sql`DELETE FROM orders WHERE order_number = ${order_number}`;
      return res.status(200).json({ success: true, order_number });
    }

    if (action === 'delete_customer') {
      const { email } = body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'email es requerido' });
      }
      // Permanent removal — for test/debug customer rows only. A real customer's history
      // stays intact even if their orders get cancelled.
      await sql`DELETE FROM customers WHERE email = ${String(email).toLowerCase().trim()}`;
      return res.status(200).json({ success: true, email });
    }

    if (action === 'save_pixel_config') {
      const { meta_pixel_id, tiktok_pixel_id, google_ads_id, ga4_measurement_id } = body;
      const config = {
        META_PIXEL_ID: (meta_pixel_id || '').trim(),
        TIKTOK_PIXEL_ID: (tiktok_pixel_id || '').trim(),
        GOOGLE_ADS_ID: (google_ads_id || '').trim(),
        GA4_MEASUREMENT_ID: (ga4_measurement_id || '').trim()
      };
      await sql`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('pixel_config', ${JSON.stringify(config)}::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
      `;
      return res.status(200).json({ success: true, config });
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
