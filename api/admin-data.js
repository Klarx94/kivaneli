// Vercel Serverless Function: Aggregated admin dashboard data
// Replaces the 6 separate direct-from-browser Supabase queries in admin.html's loadAdminData().

const { sql } = require('./_db');
const { requireAdmin } = require('./_auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    requireAdmin(req);
  } catch (e) {
    return res.status(e.statusCode || 401).json({ success: false, error: e.message });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const [orders, templates, coupons, customers, referrals, logs, products] = await Promise.all([
      sql`SELECT * FROM orders ORDER BY created_at DESC`,
      sql`SELECT * FROM email_templates ORDER BY created_at ASC`,
      sql`SELECT * FROM discount_coupons ORDER BY created_at DESC`,
      sql`SELECT * FROM customers`,
      sql`SELECT * FROM referrals`,
      sql`SELECT * FROM email_campaign_logs ORDER BY sent_at DESC LIMIT 20`,
      sql`SELECT * FROM products ORDER BY sort_order ASC, created_at ASC`
    ]);

    return res.status(200).json({ success: true, orders, templates, coupons, customers, referrals, logs, products });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
