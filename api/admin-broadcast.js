// Vercel Serverless Function: Log a retargeting email broadcast
// Replaces admin.html's direct supabaseClient.from('email_campaign_logs').insert() calls.

const { sql } = require('./_db');
const { requireAdmin } = require('./_auth');

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

  try {
    const { template_slug, coupon_included, recipients } = req.body || {};
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
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
