ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS w9_reminder_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS w9_reminder_count    INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN affiliates.w9_reminder_sent_at IS 'Timestamp of the most recent cron-based W-9 reminder email sent to this affiliate.';
COMMENT ON COLUMN affiliates.w9_reminder_count   IS 'Number of cron-based W-9 reminder emails sent (0 = none yet; the initial bank-connected email is not counted here).';
