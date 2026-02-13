-- Phase 05 Plan 01 - WhatsApp channel support schema guardrails
--
-- Makes the database WhatsApp-ready without introducing new tables:
-- 1. Adds CHECK constraint on notification_channels.channel_type
-- 2. Documents profiles.settings WhatsApp opt-in fields
-- 3. Creates partial index for opted-in WhatsApp users
--
-- Idempotent: safe to rerun via `npx supabase db push` (per project decision #1).
-- All statements use IF NOT EXISTS guards or DO $$ existence checks.

BEGIN;

-- 1. Lock channel types on notification_channels
--    alert_deliveries already has this constraint; notification_channels was missing it.
--    Allowed values: email, telegram, whatsapp, webhook
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notification_channels_channel_type_check'
      AND table_name = 'notification_channels'
  ) THEN
    ALTER TABLE notification_channels
      ADD CONSTRAINT notification_channels_channel_type_check
      CHECK (channel_type IN ('email', 'telegram', 'whatsapp', 'webhook'));
  END IF;
END $$;

-- 2. Ensure profiles.settings has a sensible default (already set in core schema,
--    but re-applying for safety) and document WhatsApp opt-in JSONB fields.
ALTER TABLE profiles
  ALTER COLUMN settings SET DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.settings IS
  'JSONB user preferences. WhatsApp opt-in fields:
   - whatsapp_opt_in (boolean): true if user consented to WhatsApp alerts
   - whatsapp_phone (string): E.164 phone number e.g. +201234567890
   - whatsapp_opted_in_at (string): ISO 8601 timestamp of opt-in for audit trail';

-- 3. Partial index for fast lookup of WhatsApp opted-in profiles during dispatch.
--    Uses the JSONB containment operator to filter on whatsapp_opt_in = true.
CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_opt_in
  ON profiles USING btree (id)
  WHERE (settings @> '{"whatsapp_opt_in": true}'::jsonb);

COMMENT ON INDEX idx_profiles_whatsapp_opt_in IS
  'Partial index accelerating dispatch-notifications lookup of WhatsApp opted-in users';

COMMIT;
