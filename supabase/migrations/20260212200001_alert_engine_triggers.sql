-- Phase 04 Plan 01 - Alert Engine Database Infrastructure
-- Creates pg_net triggers, cooldown RPC, account status change trigger,
-- and pg_cron escalation schedule for the alert engine.
--
-- PREREQUISITE: Vault secrets must be populated before these triggers will work.
-- Run the following in the Supabase SQL Editor or via vault.create_secret():
--
--   SELECT vault.create_secret('https://<project-ref>.supabase.co', 'supabase_url');
--   SELECT vault.create_secret('<your-service-role-key>', 'service_role_key');
--
-- These secrets are referenced by name in the trigger functions below.
-- Do NOT embed actual secret values in this migration file.
--
-- NOTE ON TRIGGER ORDERING:
-- pg_net HTTP requests execute AFTER the transaction commits. This means all
-- synchronous triggers (e.g., denormalization triggers from migration 000003
-- that update ad_accounts.current_balance and current_daily_spend) will have
-- already completed by the time the Edge Function receives the request.
-- This is a feature of pg_net's async nature -- no special ordering is needed.

BEGIN;

SET search_path TO public;

-- =============================================================================
-- 1. Enable pg_net extension for async HTTP calls from triggers
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

COMMENT ON EXTENSION pg_net IS 'Async HTTP client for PostgreSQL, used by alert engine triggers to invoke Edge Functions';

-- =============================================================================
-- 2. Cooldown check RPC function (is_alert_in_cooldown)
-- =============================================================================
-- Used by the evaluate-alerts Edge Function to prevent duplicate alerts
-- within a configurable cooldown window per ad_account + alert_rule pair.

CREATE OR REPLACE FUNCTION public.is_alert_in_cooldown(
  p_ad_account_id UUID,
  p_alert_rule_id UUID,
  p_cooldown_minutes INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM alerts
    WHERE ad_account_id = p_ad_account_id
      AND alert_rule_id = p_alert_rule_id
      AND created_at > (now() - (p_cooldown_minutes || ' minutes')::interval)
  ) INTO _exists;

  RETURN _exists;
END;
$$;

COMMENT ON FUNCTION public.is_alert_in_cooldown(UUID, UUID, INT)
  IS 'Returns TRUE if an alert exists for the given account+rule within the cooldown window. Called by evaluate-alerts Edge Function.';

-- =============================================================================
-- 3. Trigger function: invoke alert evaluation via pg_net
-- =============================================================================
-- Called AFTER INSERT on spend_records and balance_snapshots.
-- Reads Vault secrets and POSTs to the evaluate-alerts Edge Function.

CREATE OR REPLACE FUNCTION public.invoke_alert_evaluation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url TEXT;
  _key TEXT;
BEGIN
  -- Read secrets from Vault (populated via Supabase Dashboard or vault.create_secret)
  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  -- Fire-and-forget HTTP POST to evaluate-alerts Edge Function
  -- The request is queued and sent after the current transaction commits
  PERFORM net.http_post(
    url := _url || '/functions/v1/evaluate-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'record_id', NEW.id::text,
      'ad_account_id', NEW.ad_account_id::text,
      'org_id', NEW.org_id::text
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.invoke_alert_evaluation()
  IS 'Trigger function that asynchronously invokes the evaluate-alerts Edge Function via pg_net. Non-blocking.';

-- =============================================================================
-- 4. Attach triggers: spend_records INSERT and balance_snapshots INSERT
-- =============================================================================
-- AFTER INSERT only (not UPDATE) to avoid double evaluation on spend_records UPSERT.
-- The existing on_spend_record_upsert trigger handles denormalization on INSERT OR UPDATE,
-- but alert evaluation should only fire on new data, not re-pulled data.

DROP TRIGGER IF EXISTS on_spend_record_evaluate_alerts ON spend_records;
CREATE TRIGGER on_spend_record_evaluate_alerts
  AFTER INSERT ON spend_records
  FOR EACH ROW
  EXECUTE FUNCTION public.invoke_alert_evaluation();

COMMENT ON TRIGGER on_spend_record_evaluate_alerts ON spend_records
  IS 'Fires alert evaluation when new spend data arrives. INSERT only to avoid duplicate evaluation on UPSERT.';

DROP TRIGGER IF EXISTS on_balance_snapshot_evaluate_alerts ON balance_snapshots;
CREATE TRIGGER on_balance_snapshot_evaluate_alerts
  AFTER INSERT ON balance_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.invoke_alert_evaluation();

COMMENT ON TRIGGER on_balance_snapshot_evaluate_alerts ON balance_snapshots
  IS 'Fires alert evaluation when a new balance snapshot is captured.';

-- =============================================================================
-- 5. Account status change trigger function and trigger
-- =============================================================================
-- Fires only when ad_accounts.status actually changes (not on every UPDATE).
-- Sends status change event to evaluate-alerts with old/new status in payload.

CREATE OR REPLACE FUNCTION public.invoke_status_change_evaluation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url TEXT;
  _key TEXT;
BEGIN
  -- Read secrets from Vault
  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  -- Fire-and-forget HTTP POST with status change context
  PERFORM net.http_post(
    url := _url || '/functions/v1/evaluate-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body := jsonb_build_object(
      'table', 'ad_accounts',
      'record_id', NEW.id::text,
      'ad_account_id', NEW.id::text,
      'org_id', NEW.org_id::text,
      'event', 'status_change',
      'old_status', OLD.status,
      'new_status', NEW.status
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.invoke_status_change_evaluation()
  IS 'Trigger function that invokes evaluate-alerts when ad_accounts.status changes. Includes old/new status in payload.';

DROP TRIGGER IF EXISTS on_ad_account_status_change ON ad_accounts;
CREATE TRIGGER on_ad_account_status_change
  AFTER UPDATE ON ad_accounts
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.invoke_status_change_evaluation();

COMMENT ON TRIGGER on_ad_account_status_change ON ad_accounts
  IS 'Fires alert evaluation only when the account status column actually changes (active/paused/disabled/archived).';

-- =============================================================================
-- 6. pg_cron schedule for escalation (every 15 minutes)
-- =============================================================================
-- Invokes the escalate-alerts Edge Function to promote unacknowledged alerts
-- past their escalation timeout to a higher severity.

SELECT cron.schedule(
  'escalate-alerts-check',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1)
           || '/functions/v1/escalate-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{"source": "pg_cron"}'::jsonb,
    timeout_milliseconds := 10000
  ) AS request_id;
  $$
);

COMMENT ON COLUMN cron.job.jobname IS 'Human-readable name for scheduled jobs';

-- =============================================================================
-- 7. Documentation for the alert engine database infrastructure
-- =============================================================================

COMMENT ON FUNCTION public.is_alert_in_cooldown(UUID, UUID, INT)
  IS 'Cooldown check: returns TRUE if a matching alert exists within the cooldown window. Prevents duplicate alerts.';

COMMIT;
