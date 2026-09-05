// Vercel Serverless Function: Admin product management (full CRUD)
// This is what makes the catalog independent of a developer — the client links a Dropea
// product, then edits every commercial detail here and it goes live immediately.

const { sql } = require('../lib/_db');
const { requireAdmin } = require('../lib/_auth');

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ success: false, error: e.message });
  }

  try {
    if (req.method === 'GET') {
      const products = await sql`SELECT * FROM products ORDER BY sort_order ASC, created_at ASC`;
      return res.status(200).json({ success: true, products });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.name || b.price == null) {
        return res.status(400).json({ success: false, error: 'name y price son requeridos' });
      }

      let slug = b.slug ? slugify(b.slug) : slugify(b.name);
      const existing = await sql`SELECT 1 FROM products WHERE slug = ${slug}`;
      if (existing.length > 0) slug = `${slug}-${Date.now().toString().slice(-5)}`;

      const [product] = await sql`
        INSERT INTO products (
          dropea_product_id, dropea_variant_id, dropea_sku, slug, name, short_name,
          description_html, category, section, badge, price, regular_price, impulse_price,
          image_url, extra_images, bundle_items, is_active, sort_order
        ) VALUES (
          ${b.dropea_product_id || null}, ${b.dropea_variant_id || null}, ${b.dropea_sku || null},
          ${slug}, ${b.name}, ${b.short_name || b.name}, ${b.description_html || ''},
          ${b.category || null}, ${b.section || 'CATALOG'}, ${b.badge || null},
          ${b.price}, ${b.regular_price || null}, ${b.impulse_price || null},
          ${b.image_url || null}, ${JSON.stringify(b.extra_images || [])}::jsonb,
          ${b.bundle_items ? JSON.stringify(b.bundle_items) : null}::jsonb,
          ${b.is_active !== false}, ${b.sort_order || 0}
        )
        RETURNING *
      `;
      return res.status(200).json({ success: true, product });
    }

    if (req.method === 'PATCH') {
      const { id, ...fields } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id es requerido' });

      const allowed = [
        'name', 'short_name', 'description_html', 'category', 'section', 'badge',
        'price', 'regular_price', 'impulse_price', 'image_url', 'extra_images',
        'bundle_items', 'is_active', 'sort_order', 'dropea_product_id', 'dropea_variant_id', 'dropea_sku'
      ];

      const [current] = await sql`SELECT * FROM products WHERE id = ${id}`;
      if (!current) return res.status(404).json({ success: false, error: 'Producto no encontrado' });

      const merged = { ...current, ...fields };
      const [product] = await sql`
        UPDATE products SET
          name = ${merged.name},
          short_name = ${merged.short_name},
          description_html = ${merged.description_html},
          category = ${merged.category},
          section = ${merged.section},
          badge = ${merged.badge},
          price = ${merged.price},
          regular_price = ${merged.regular_price},
          impulse_price = ${merged.impulse_price},
          image_url = ${merged.image_url},
          extra_images = ${JSON.stringify(merged.extra_images || [])}::jsonb,
          bundle_items = ${merged.bundle_items ? JSON.stringify(merged.bundle_items) : null}::jsonb,
          is_active = ${merged.is_active},
          sort_order = ${merged.sort_order},
          dropea_product_id = ${merged.dropea_product_id},
          dropea_variant_id = ${merged.dropea_variant_id},
          dropea_sku = ${merged.dropea_sku},
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return res.status(200).json({ success: true, product });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id es requerido' });
      await sql`UPDATE products SET is_active = false, updated_at = now() WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
