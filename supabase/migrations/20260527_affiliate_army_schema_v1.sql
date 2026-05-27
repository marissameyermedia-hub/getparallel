-- ============================================================
-- Parallel Affiliate Army — Schema v1
-- Applied: 2026-05-27 via Supabase MCP apply_migration
-- Chunks: 1.1 (schema + RLS) + 1.4 (code generators)
-- Tables: affiliates, affiliate_applications, affiliate_attributions,
--         affiliate_payouts, affiliate_clicks,
--         affiliate_content_submissions, affiliate_strikes
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────

CREATE TYPE affiliate_tier AS ENUM ('seeds', 'voices', 'anchors');
CREATE TYPE affiliate_status AS ENUM ('pending', 'approved', 'active', 'paused', 'banned');
CREATE TYPE affiliate_persona_status AS ENUM ('not_started', 'pending', 'approved', 'declined', 'expired');
CREATE TYPE affiliate_app_audit_status AS ENUM ('pending', 'in_review', 'approved', 'rejected', 'needs_info');
CREATE TYPE attribution_method AS ENUM ('cookie', 'promo_code', 'manual');
CREATE TYPE commission_status AS ENUM ('pending', 'releasable', 'released', 'clawed_back', 'fraud');
CREATE TYPE mercury_payout_status AS ENUM ('pending_approval', 'approved', 'sent', 'completed', 'failed', 'cancelled');
CREATE TYPE content_platform AS ENUM ('instagram', 'tiktok', 'youtube');
CREATE TYPE content_post_type AS ENUM ('post', 'story', 'reel', 'video');
CREATE TYPE content_audit_status AS ENUM ('pending', 'compliant', 'missing_disclosure', 'off_brand', 'removed');
CREATE TYPE affiliate_strike_type AS ENUM ('fraud', 'ftc_violation', 'content_violation', 'terms_breach');

-- ─── affiliates ──────────────────────────────────────────────

CREATE TABLE affiliates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tier                        affiliate_tier NOT NULL,
  status                      affiliate_status NOT NULL DEFAULT 'pending',
  display_name                text NOT NULL,
  legal_name                  text,
  email                       text NOT NULL UNIQUE,
  mercury_recipient_id        text,
  bank_account_collected_at   timestamptz,
  promo_code                  text UNIQUE,
  tracked_link_slug           text UNIQUE,
  commission_rate             numeric(5,4) NOT NULL,
  subscription_discount_pct   int NOT NULL DEFAULT 20,
  instagram_handle            text,
  tiktok_handle               text,
  youtube_handle              text,
  follower_count_at_approval  int,
  engagement_rate_at_approval numeric(6,4),
  audience_primary_country    text,
  audience_primary_cities     text[],
  persona_inquiry_id          text,
  persona_status              affiliate_persona_status NOT NULL DEFAULT 'not_started',
  verified_legal_name         text,
  w9_collected_at             timestamptz,
  w9_file_url                 text,
  tax_id_last4                text,
  approved_at                 timestamptz,
  total_conversions           int NOT NULL DEFAULT 0,
  total_paid_lifetime         numeric(12,2) NOT NULL DEFAULT 0,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliates_user_id           ON affiliates(user_id);
CREATE INDEX idx_affiliates_status            ON affiliates(status);
CREATE INDEX idx_affiliates_promo_code        ON affiliates(promo_code) WHERE promo_code IS NOT NULL;
CREATE INDEX idx_affiliates_tracked_link_slug ON affiliates(tracked_link_slug) WHERE tracked_link_slug IS NOT NULL;

CREATE TRIGGER affiliates_updated_at
  BEFORE UPDATE ON affiliates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── affiliate_applications ──────────────────────────────────

CREATE TABLE affiliate_applications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL,
  instagram_handle      text,
  tiktok_handle         text,
  youtube_handle        text,
  tier_applied_for      affiliate_tier NOT NULL,
  why_parallel          text,
  audience_description  text,
  phase1_city_audience  boolean NOT NULL DEFAULT false,
  persona_inquiry_id    text,
  persona_status        affiliate_persona_status NOT NULL DEFAULT 'not_started',
  persona_completed_at  timestamptz,
  verified_legal_name   text,
  verified_dob          date,
  audit_data            jsonb,
  audit_status          affiliate_app_audit_status NOT NULL DEFAULT 'pending',
  reviewed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  rejection_reason      text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliate_apps_audit_status ON affiliate_applications(audit_status);
CREATE INDEX idx_affiliate_apps_email        ON affiliate_applications(email);
CREATE INDEX idx_affiliate_apps_created_at   ON affiliate_applications(created_at DESC);

-- ─── affiliate_payouts (before attributions — FK target) ─────

CREATE TABLE affiliate_payouts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id            uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  period_start            date NOT NULL,
  period_end              date NOT NULL,
  gross_amount            numeric(12,2) NOT NULL DEFAULT 0,
  clawback_amount         numeric(12,2) NOT NULL DEFAULT 0,
  net_amount              numeric(12,2) NOT NULL DEFAULT 0,
  mercury_request_id      text,
  mercury_transaction_id  text,
  mercury_status          mercury_payout_status NOT NULL DEFAULT 'pending_approval',
  failure_reason          text,
  paid_at                 timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payouts_affiliate_id   ON affiliate_payouts(affiliate_id);
CREATE INDEX idx_payouts_mercury_status ON affiliate_payouts(mercury_status);
CREATE INDEX idx_payouts_period         ON affiliate_payouts(period_start, period_end);

-- ─── affiliate_attributions ──────────────────────────────────

CREATE TABLE affiliate_attributions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  referred_user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  attribution_method  attribution_method NOT NULL,
  promo_code_used     text,
  clicked_at          timestamptz,
  signed_up_at        timestamptz NOT NULL DEFAULT now(),
  verified_at         timestamptz,
  subscribed_at       timestamptz,
  commission_amount   numeric(10,2) NOT NULL DEFAULT 0,
  commission_status   commission_status NOT NULL DEFAULT 'pending',
  clawback_deadline   timestamptz,
  fraud_flags         text[] NOT NULL DEFAULT '{}',
  payout_id           uuid REFERENCES affiliate_payouts(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attributions_affiliate_id      ON affiliate_attributions(affiliate_id);
CREATE INDEX idx_attributions_referred_user_id  ON affiliate_attributions(referred_user_id);
CREATE INDEX idx_attributions_commission_status ON affiliate_attributions(commission_status);
CREATE INDEX idx_attributions_clawback          ON affiliate_attributions(clawback_deadline)
  WHERE commission_status = 'pending';

CREATE TRIGGER affiliate_attributions_updated_at
  BEFORE UPDATE ON affiliate_attributions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── affiliate_clicks ────────────────────────────────────────

CREATE TABLE affiliate_clicks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id          uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  ip_hash               text,
  user_agent            text,
  referrer              text,
  country_code          text,
  is_vpn_or_datacenter  boolean NOT NULL DEFAULT false,
  clicked_at            timestamptz NOT NULL DEFAULT now(),
  converted_to_signup   boolean NOT NULL DEFAULT false,
  signup_attribution_id uuid REFERENCES affiliate_attributions(id) ON DELETE SET NULL
);

CREATE INDEX idx_clicks_affiliate_id ON affiliate_clicks(affiliate_id);
CREATE INDEX idx_clicks_clicked_at   ON affiliate_clicks(clicked_at);
CREATE INDEX idx_clicks_ip_hash      ON affiliate_clicks(ip_hash, clicked_at);

-- ─── affiliate_content_submissions ───────────────────────────

CREATE TABLE affiliate_content_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id   uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  platform       content_platform NOT NULL,
  post_url       text NOT NULL,
  post_type      content_post_type NOT NULL,
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  audit_status   content_audit_status NOT NULL DEFAULT 'pending',
  auditor_notes  text
);

CREATE INDEX idx_content_affiliate_id ON affiliate_content_submissions(affiliate_id);
CREATE INDEX idx_content_audit_status ON affiliate_content_submissions(audit_status);

-- ─── affiliate_strikes ───────────────────────────────────────

CREATE TABLE affiliate_strikes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  strike_type   affiliate_strike_type NOT NULL,
  description   text NOT NULL,
  evidence_url  text,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz
);

CREATE INDEX idx_strikes_affiliate_id ON affiliate_strikes(affiliate_id);
CREATE INDEX idx_strikes_expires_at   ON affiliate_strikes(expires_at) WHERE expires_at IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE affiliates                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_applications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_attributions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_content_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_strikes             ENABLE ROW LEVEL SECURITY;

-- affiliates --
CREATE POLICY "service_role_all_affiliates"
  ON affiliates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "affiliate_select_own"
  ON affiliates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "affiliate_update_own"
  ON affiliates FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin_read_affiliates"
  ON affiliates FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- affiliate_applications --
CREATE POLICY "service_role_all_affiliate_applications"
  ON affiliate_applications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_affiliate_applications"
  ON affiliate_applications FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- affiliate_attributions --
CREATE POLICY "service_role_all_affiliate_attributions"
  ON affiliate_attributions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_affiliate_attributions"
  ON affiliate_attributions FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "affiliate_select_own_attributions"
  ON affiliate_attributions FOR SELECT TO authenticated
  USING (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));

-- affiliate_payouts --
CREATE POLICY "service_role_all_affiliate_payouts"
  ON affiliate_payouts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_affiliate_payouts"
  ON affiliate_payouts FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "affiliate_select_own_payouts"
  ON affiliate_payouts FOR SELECT TO authenticated
  USING (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));

-- affiliate_clicks (admin + service only — contains IP hashes) --
CREATE POLICY "service_role_all_affiliate_clicks"
  ON affiliate_clicks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_affiliate_clicks"
  ON affiliate_clicks FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- affiliate_content_submissions --
CREATE POLICY "service_role_all_affiliate_content"
  ON affiliate_content_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_affiliate_content"
  ON affiliate_content_submissions FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "affiliate_select_own_content"
  ON affiliate_content_submissions FOR SELECT TO authenticated
  USING (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));
CREATE POLICY "affiliate_insert_own_content"
  ON affiliate_content_submissions FOR INSERT TO authenticated
  WITH CHECK (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));

-- affiliate_strikes --
CREATE POLICY "service_role_all_affiliate_strikes"
  ON affiliate_strikes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_affiliate_strikes"
  ON affiliate_strikes FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "affiliate_select_own_strikes"
  ON affiliate_strikes FOR SELECT TO authenticated
  USING (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));

-- ─── Chunk 1.4: Promo code + tracked link slug generators ────

CREATE OR REPLACE FUNCTION generate_promo_code(p_display_name text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  base    text;
  suffix  text;
  attempt int := 0;
  code    text;
BEGIN
  base := upper(regexp_replace(p_display_name, '[^a-zA-Z]', '', 'g'));
  base := left(base, 6);
  IF length(base) < 2 THEN base := 'AFF'; END IF;
  LOOP
    attempt := attempt + 1;
    IF attempt > 5 THEN
      RAISE EXCEPTION 'Could not generate unique promo code after 5 attempts for: %', p_display_name;
    END IF;
    suffix := lpad(floor(random() * 90 + 10)::int::text, 2, '0');
    code := base || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM affiliates WHERE promo_code = code);
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION generate_tracked_link_slug()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars   text := 'abcdefghijkmnpqrstuvwxyz23456789';
  slug    text;
  attempt int := 0;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > 5 THEN
      RAISE EXCEPTION 'Could not generate unique tracked link slug after 5 attempts';
    END IF;
    slug := '';
    FOR i IN 1..8 LOOP
      slug := slug || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM affiliates WHERE tracked_link_slug = slug);
  END LOOP;
  RETURN slug;
END;
$$;
