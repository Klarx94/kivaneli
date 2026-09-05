// Vercel Serverless Function: Public product catalog
// Read by catalogo.html, producto.html and assets/js/kivaneli-cart.js so the storefront
// reflects whatever the admin panel configures — no more hand-edited HTML per product.

const { sql } = require('../lib/_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const products = await sql`
      SELECT id, slug, name, short_name, description_html, category, section, badge,
             price, regular_price, impulse_price, image_url, extra_images, video_url,
             dropea_variant_id, dropea_sku, bundle_items, in_stock
      FROM products
      WHERE is_active = true
      ORDER BY sort_order ASC, created_at ASC
    `;

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    return res.status(200).json({ success: true, products });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
