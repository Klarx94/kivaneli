-- KIVANELI — Neon Postgres schema
-- Replaces the Supabase project sntsizmdhttpilbauxuv (migration 2026-09-05).
-- Run this once against the new Neon database (via a deployed /api/admin-setup-db call).

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
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
);

CREATE TABLE IF NOT EXISTS dropea_webhooks_log (
  id                  SERIAL PRIMARY KEY,
  event_type          TEXT,
  order_number        TEXT,
  dropea_tracking_id  TEXT,
  shipping_status     TEXT,
  payload             JSONB,
  processed           BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
);

CREATE TABLE IF NOT EXISTS discount_coupons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  discount_type       TEXT NOT NULL, -- 'PERCENTAGE' | 'FIXED'
  discount_value      NUMERIC(10,2) NOT NULL,
  min_order_amount    NUMERIC(10,2) DEFAULT 0,
  uses_count          INTEGER DEFAULT 0,
  max_uses            INTEGER DEFAULT 999999,
  is_active           BOOLEAN DEFAULT true,
  landing_id          TEXT,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,
  email           TEXT UNIQUE,
  phone           TEXT,
  city            TEXT,
  total_spent     NUMERIC(10,2) DEFAULT 0,
  referral_code   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_email      TEXT,
  referred_email      TEXT,
  referral_code       TEXT,
  reward_status       TEXT DEFAULT 'PENDING',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_campaign_logs (
  id                  SERIAL PRIMARY KEY,
  recipient_email     TEXT,
  recipient_name      TEXT,
  template_slug       TEXT,
  coupon_included     TEXT,
  status              TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_digital_access_order_id ON customer_digital_access(order_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_sent_at ON email_campaign_logs(sent_at DESC);
