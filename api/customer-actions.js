// Vercel Serverless Function: public customer-facing actions — coupon validation,
// newsletter signup, and "Club Amigas" referral link generation. Consolidated into one
// function (Vercel Hobby caps a deployment at 12 serverless functions) since none of these
// individually need their own — they're small, public, unauthenticated reads/writes.

const { sql } = require('../lib/_db');
const { upsertCustomer, ensureReferralCode } = require('../lib/_customers');

const SITE_URL = process.env.SITE_URL || 'https://kivaneli.es';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const action = req.query.action;

      if (action === 'validate_coupon') {
        const code = String(req.query.code || '').trim().toUpperCase();
        if (!code) return res.status(200).json({ success: false, error: 'Código requerido' });

        const [coupon] = await sql`
          SELECT code, discount_type, discount_value, min_order_amount, is_active, max_uses, uses_count, expires_at
          FROM discount_coupons WHERE code = ${code}
        `;

        if (!coupon || !coupon.is_active) return res.status(200).json({ success: false, error: 'Código no válido' });
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(200).json({ success: false, error: 'Cupón caducado' });
        if (coupon.uses_count >= coupon.max_uses) return res.status(200).json({ success: false, error: 'Cupón agotado' });

        return res.status(200).json({
          success: true,
          code: coupon.code,
          discount_type: coupon.discount_type,
          discount_value: parseFloat(coupon.discount_value),
          min_order_amount: parseFloat(coupon.min_order_amount || 0)
        });
      }

      if (action === 'referral_info') {
        const email = String(req.query.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ success: false, error: 'email es requerido' });

        const [customer] = await sql`SELECT name, referral_code FROM customers WHERE email = ${email}`;
        if (!customer) return res.status(200).json({ success: false, error: 'Clienta no encontrada' });

        return res.status(200).json({
          success: true,
          referral_code: customer.referral_code,
          referral_link: `${SITE_URL}/?ref=${customer.referral_code}`
        });
      }

      return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    if (req.method === 'POST') {
      const { action, ...body } = req.body || {};

      if (action === 'newsletter_signup') {
        const email = String(body.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ success: false, error: 'email es requerido' });

        const referralCode = await upsertCustomer({ email, name: body.name, orderAmount: 0 });
        return res.status(200).json({
          success: true,
          coupon: 'SEDA10',
          referral_code: referralCode,
          referral_link: `${SITE_URL}/?ref=${referralCode}`
        });
      }

      if (action === 'generate_referral') {
        const email = String(body.email || '').toLowerCase().trim();
        if (!email || !body.name) return res.status(400).json({ success: false, error: 'name y email son requeridos' });

        const referralCode = await upsertCustomer({ email, name: body.name, phone: body.phone, orderAmount: 0 });
        return res.status(200).json({
          success: true,
          referral_code: referralCode,
          referral_link: `${SITE_URL}/?ref=${referralCode}`
        });
      }

      return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
