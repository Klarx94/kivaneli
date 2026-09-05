// Vercel Serverless Function: Coupon management (create / toggle active)
// Replaces admin.html's direct supabaseClient.from('discount_coupons') calls.

const { sql } = require('./_db');
const { requireAdmin } = require('./_auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ success: false, error: e.message });
  }

  try {
    if (req.method === 'POST') {
      const { code, discount_type, discount_value, min_order_amount, landing_id } = req.body || {};
      if (!code || !discount_type || discount_value == null) {
        return res.status(400).json({ success: false, error: 'code, discount_type y discount_value son requeridos' });
      }

      const [coupon] = await sql`
        INSERT INTO discount_coupons (code, discount_type, discount_value, min_order_amount, landing_id, is_active)
        VALUES (${code.toUpperCase()}, ${discount_type}, ${discount_value}, ${min_order_amount || 0}, ${landing_id || null}, true)
        RETURNING *
      `;
      return res.status(200).json({ success: true, coupon });
    }

    if (req.method === 'PATCH') {
      const { id, is_active } = req.body || {};
      if (!id || typeof is_active !== 'boolean') {
        return res.status(400).json({ success: false, error: 'id e is_active son requeridos' });
      }

      const [coupon] = await sql`
        UPDATE discount_coupons SET is_active = ${is_active} WHERE id = ${id} RETURNING *
      `;
      return res.status(200).json({ success: true, coupon });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
