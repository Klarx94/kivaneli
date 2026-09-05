// Shared customer/referral logic — called from both order-completion paths
// (api/dropea-order.js for COD, api/stripe-webhook.js for card) and from
// api/customer-actions.js (newsletter/referral-link self-service, before any purchase).

const crypto = require('crypto');
const { sql } = require('./_db');

function slugifyName(name) {
  return String(name || 'AMIGA')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 8) || 'AMIGA';
}

async function ensureReferralCode(email, name) {
  const [existing] = await sql`SELECT referral_code FROM customers WHERE email = ${email}`;
  if (existing && existing.referral_code) return existing.referral_code;

  const base = slugifyName(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${base}-${suffix}`;
    const [taken] = await sql`SELECT 1 FROM customers WHERE referral_code = ${code}`;
    if (!taken) {
      await sql`UPDATE customers SET referral_code = ${code} WHERE email = ${email}`;
      return code;
    }
  }
  throw new Error('Could not generate a unique referral code');
}

// Upserts a customer record and ensures they have a referral code — used both for
// self-service signups (newsletter/"Club Amigas" forms) and automatically on every
// completed order, so the customers table reflects real people, not a decorative form.
async function upsertCustomer({ email, name, phone, city, orderAmount }) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) throw new Error('email es requerido');

  const [existing] = await sql`SELECT id, total_spent FROM customers WHERE email = ${cleanEmail}`;

  if (existing) {
    const newTotal = parseFloat(existing.total_spent || 0) + parseFloat(orderAmount || 0);
    await sql`
      UPDATE customers SET
        name = COALESCE(${name || null}, name),
        phone = COALESCE(${phone || null}, phone),
        city = COALESCE(${city || null}, city),
        total_spent = ${newTotal}
      WHERE email = ${cleanEmail}
    `;
  } else {
    await sql`
      INSERT INTO customers (name, email, phone, city, total_spent)
      VALUES (${name || 'Clienta Kivaneli'}, ${cleanEmail}, ${phone || null}, ${city || null}, ${orderAmount || 0})
    `;
  }

  const referralCode = await ensureReferralCode(cleanEmail, name);
  return referralCode;
}

// Generates a single-use reward coupon for a referrer once someone they referred
// completes a real order. Returns the new coupon code, or null if there's nothing to credit
// (no referral code used, code doesn't belong to anyone, or a self-referral).
async function creditReferralIfAny({ referralCodeUsed, buyerEmail, orderNumber }) {
  if (!referralCodeUsed) return null;

  const [referrer] = await sql`SELECT email, name FROM customers WHERE referral_code = ${referralCodeUsed}`;
  if (!referrer || referrer.email === String(buyerEmail || '').toLowerCase().trim()) return null;

  const rewardCode = `GRACIAS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  await sql`
    INSERT INTO discount_coupons (code, discount_type, discount_value, min_order_amount, max_uses, is_active)
    VALUES (${rewardCode}, 'FIXED', 15.00, 0, 1, true)
  `;

  await sql`
    INSERT INTO referrals (referrer_email, referred_email, referral_code, reward_status, reward_coupon_code, order_number)
    VALUES (${referrer.email}, ${buyerEmail}, ${referralCodeUsed}, 'REWARDED', ${rewardCode}, ${orderNumber})
  `;

  return { referrerEmail: referrer.email, rewardCode };
}

module.exports = { upsertCustomer, ensureReferralCode, creditReferralIfAny };
