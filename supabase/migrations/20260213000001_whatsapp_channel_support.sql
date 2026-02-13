-- Phase 05 Plan 01 - WhatsApp channel schema guardrails
-- Reminder: run migrations via `npx supabase db push` per repo-wide CLI decision.

BEGIN;

SET LOCAL search_path TO public;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notification_channels_channel_type_check'
    ) THEN
        ALTER TABLE notification_channels
            ADD CONSTRAINT notification_channels_channel_type_check
            CHECK (channel_type IN ('email', 'telegram', 'whatsapp', 'webhook'));
    END IF;
END
$$;

ALTER TABLE profiles
    ALTER COLUMN settings SET DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.settings IS 'JSON preference payload storing UI toggles plus WhatsApp opt-in metadata (whatsapp_opt_in boolean, whatsapp_phone E.164 string, whatsapp_opted_in_at ISO-8601 timestamp)';

CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_opt_in
    ON profiles ((settings->>'whatsapp_phone'))
    WHERE settings->>'whatsapp_opt_in' = 'true';

COMMENT ON INDEX idx_profiles_whatsapp_opt_in IS 'Phone lookup index for profiles that opted into WhatsApp alerts';

COMMIT;
