// Vercel Serverless Function: Public coupon validation
// checkout.html previously "validated" coupons against two hardcoded strings in its own
// JS — any coupon created from the admin panel (discount_coupons table) was invisible to
// the actual checkout. This is the missing link between the two.

const { sql } = require('../lib/_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!code) return res.status(200).json({ success: false, error: 'Código requerido' });

    const [coupon] = await sql`
      SELECT code, discount_type, discount_value, min_order_amount, is_active, max_uses, uses_count, expires_at
      FROM discount_coupons WHERE code = ${code}
    `;

    if (!coupon || !coupon.is_active) {
      return res.status(200).json({ success: false, error: 'Código no válido' });
    }
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(200).json({ success: false, error: 'Cupón caducado' });
    }
    if (coupon.uses_count >= coupon.max_uses) {
      return res.status(200).json({ success: false, error: 'Cupón agotado' });
    }

    return res.status(200).json({
      success: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: parseFloat(coupon.discount_value),
      min_order_amount: parseFloat(coupon.min_order_amount || 0)
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
