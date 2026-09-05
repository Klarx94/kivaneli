// Vercel Serverless Function: One-off Neon schema setup + seed
// Protected by ADMIN_JWT_SECRET as a shared setup key (no admin session exists yet at this point).
// Safe to call more than once: every statement is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
// Delete this file once the migration has been run and verified against production.

const { sql } = require('../lib/_db');
const emailTemplates = require('../db/seed-email-templates.json');
const discountCoupons = require('../db/seed-discount-coupons.json');
const products = require('../db/seed-products.json');

if (!process.env.ADMIN_JWT_SECRET) {
  throw new Error('Missing required env var ADMIN_JWT_SECRET');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const providedKey = req.headers['x-setup-key'] || '';
  if (providedKey !== process.env.ADMIN_JWT_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid setup key' });
  }

  const steps = [];

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        order_number         TEXT PRIMARY KEY,
        customer_name        TEXT NOT NULL,
        customer_email       TEXT,
        customer_phone       TEXT,
        customer_address     TEXT,
        customer_zip         TEXT,
        customer_city        TEXT,
        pack_selected        TEXT,
        items_count          INTEGER DEFAULT 1,
        total_amount         NUMERIC(10,2) DEFAULT 0,
        payment_method       TEXT,
        payment_status       TEXT,
        shipping_status      TEXT,
        dropea_variant_id    INTEGER,
        dropea_order_id      TEXT,
        tracking_code        TEXT,
        coupon_applied       TEXT,
        referral_code_used   TEXT,
        notes                TEXT,
        cart_items           JSONB,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cart_items JSONB`;
    steps.push('orders');

    await sql`
      CREATE TABLE IF NOT EXISTS customer_digital_access (
        id                SERIAL PRIMARY KEY,
        order_id          TEXT NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
        customer_email    TEXT,
        customer_name     TEXT,
        access_token      TEXT,
        payment_method    TEXT,
        payment_status    TEXT,
        is_unlocked       BOOLEAN DEFAULT false,
        unlocked_at       TIMESTAMPTZ,
        guides_unlocked   JSONB DEFAULT '[]'::jsonb,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('customer_digital_access');

    await sql`
      CREATE TABLE IF NOT EXISTS dropea_webhooks_log (
        id                  SERIAL PRIMARY KEY,
        event_type          TEXT,
        order_number        TEXT,
        dropea_tracking_id  TEXT,
        shipping_status     TEXT,
        payload             JSONB,
        processed           BOOLEAN DEFAULT false,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('dropea_webhooks_log');

    await sql`
      CREATE TABLE IF NOT EXISTS email_templates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug            TEXT UNIQUE NOT NULL,
        name            TEXT NOT NULL,
        category        TEXT,
        subject         TEXT,
        html_body       TEXT,
        variables_list  JSONB DEFAULT '[]'::jsonb,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('email_templates');

    await sql`
      CREATE TABLE IF NOT EXISTS discount_coupons (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code                TEXT UNIQUE NOT NULL,
        discount_type       TEXT NOT NULL,
        discount_value      NUMERIC(10,2) NOT NULL,
        min_order_amount    NUMERIC(10,2) DEFAULT 0,
        uses_count          INTEGER DEFAULT 0,
        max_uses            INTEGER DEFAULT 999999,
        is_active           BOOLEAN DEFAULT true,
        landing_id          TEXT,
        expires_at          TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('discount_coupons');

    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dropea_product_id   INTEGER,
        dropea_variant_id   INTEGER,
        dropea_sku          TEXT,
        slug                TEXT UNIQUE NOT NULL,
        name                TEXT NOT NULL,
        short_name          TEXT,
        description_html    TEXT,
        category            TEXT,
        section             TEXT DEFAULT 'CATALOG',
        badge               TEXT,
        price               NUMERIC(10,2) NOT NULL,
        regular_price       NUMERIC(10,2),
        impulse_price       NUMERIC(10,2),
        image_url           TEXT,
        extra_images        JSONB DEFAULT '[]'::jsonb,
        bundle_items        JSONB,
        is_active           BOOLEAN DEFAULT true,
        sort_order          INTEGER DEFAULT 0,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('products');

    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            TEXT,
        email           TEXT UNIQUE,
        phone           TEXT,
        city            TEXT,
        total_spent     NUMERIC(10,2) DEFAULT 0,
        referral_code   TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('customers');

    await sql`
      CREATE TABLE IF NOT EXISTS referrals (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_email      TEXT,
        referred_email      TEXT,
        referral_code       TEXT,
        reward_status       TEXT DEFAULT 'PENDING',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('referrals');

    await sql`
      CREATE TABLE IF NOT EXISTS email_campaign_logs (
        id                  SERIAL PRIMARY KEY,
        recipient_email     TEXT,
        recipient_name      TEXT,
        template_slug       TEXT,
        coupon_included     TEXT,
        status              TEXT,
        sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    steps.push('email_campaign_logs');

    await sql`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_customer_digital_access_order_id ON customer_digital_access(order_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_sent_at ON email_campaign_logs(sent_at DESC)`;
    steps.push('indexes');

    for (const t of emailTemplates) {
      await sql`
        INSERT INTO email_templates (id, slug, name, category, subject, html_body, variables_list, is_active)
        VALUES (${t.id}, ${t.slug}, ${t.name}, ${t.category}, ${t.subject}, ${t.html_body}, ${JSON.stringify(t.variables_list)}::jsonb, ${t.is_active})
        ON CONFLICT (slug) DO NOTHING
      `;
    }
    steps.push(`email_templates seeded (${emailTemplates.length})`);

    for (const c of discountCoupons) {
      await sql`
        INSERT INTO discount_coupons (id, code, discount_type, discount_value, min_order_amount, uses_count, max_uses, is_active, landing_id, expires_at)
        VALUES (${c.id}, ${c.code}, ${c.discount_type}, ${c.discount_value}, ${c.min_order_amount}, ${c.uses_count}, ${c.max_uses}, ${c.is_active}, ${c.landing_id}, ${c.expires_at})
        ON CONFLICT (code) DO NOTHING
      `;
    }
    steps.push(`discount_coupons seeded (${discountCoupons.length})`);

    for (const p of products) {
      await sql`
        INSERT INTO products (
          dropea_product_id, dropea_variant_id, dropea_sku, slug, name, short_name,
          description_html, category, section, badge, price, regular_price, impulse_price,
          image_url, extra_images, bundle_items, is_active, sort_order
        ) VALUES (
          ${p.dropea_product_id}, ${p.dropea_variant_id}, ${p.dropea_sku}, ${p.slug}, ${p.name}, ${p.short_name},
          ${p.description_html}, ${p.category}, ${p.section}, ${p.badge}, ${p.price}, ${p.regular_price}, ${p.impulse_price},
          ${p.image_url}, ${JSON.stringify(p.extra_images)}::jsonb,
          ${p.bundle_items ? JSON.stringify(p.bundle_items) : null}::jsonb,
          ${p.is_active}, ${p.sort_order}
        )
        ON CONFLICT (slug) DO NOTHING
      `;
    }
    steps.push(`products seeded (${products.length})`);

    return res.status(200).json({ success: true, steps });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message, steps });
  }
};
