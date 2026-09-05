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
        await sql`
          INSERT INTO referral_optins (email, name, referral_code, source)
          VALUES (${email}, ${body.name}, ${referralCode}, 'club_amigas_form')
        `;
        return res.status(200).json({
          success: true,
          referral_code: referralCode,
          referral_link: `${SITE_URL}/?ref=${referralCode}`
        });
      }

      // Post-purchase "invite a friend" opt-in — deliberately a separate confirmed action,
      // not something auto-generated the moment an order completes. Each confirmation is
      // logged as its own row in referral_optins (a real, commercially-usable leads list),
      // distinct from the customers table that every buyer already lands in regardless.
      if (action === 'confirm_referral_optin') {
        const email = String(body.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ success: false, error: 'email es requerido' });

        const referralCode = await ensureReferralCode(email, body.name);
        await sql`
          INSERT INTO referral_optins (email, name, referral_code, source, order_number)
          VALUES (${email}, ${body.name || null}, ${referralCode}, 'post_purchase', ${body.order_number || null})
        `;
        return res.status(200).json({
          success: true,
          referral_code: referralCode,
          referral_link: `${SITE_URL}/?ref=${referralCode}`
        });
      }

      if (action === 'track_order') {
        const orderNumber = String(body.order_number || '').trim();
        const email = String(body.email || '').toLowerCase().trim();
        if (!orderNumber) return res.status(400).json({ success: false, error: 'order_number es requerido' });

        const [order] = await sql`
          SELECT order_number, customer_email, shipping_status, payment_status, payment_method, tracking_code, created_at
          FROM orders WHERE order_number = ${orderNumber}
        `;
        if (!order || (email && order.customer_email !== email)) {
          return res.status(200).json({ success: false, error: 'No encontramos ningún pedido con esos datos.' });
        }

        return res.status(200).json({
          success: true,
          order_number: order.order_number,
          shipping_status: order.shipping_status,
          payment_status: order.payment_status,
          payment_method: order.payment_method,
          tracking_code: order.tracking_code,
          tracking_url: order.tracking_code ? `https://www.gls-spain.es/es/seguimiento/?match=${encodeURIComponent(order.tracking_code)}` : null,
          created_at: order.created_at
        });
      }

      return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
