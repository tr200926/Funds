-- Phase 01 Plan 01 - Trigger functions for denormalized metrics + updated_at columns

BEGIN;

SET search_path TO public;

-- Trigger: update ad account balance after balance snapshot insert ---------

CREATE OR REPLACE FUNCTION public.update_ad_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ad_accounts
  SET
    current_balance = NEW.balance,
    last_synced_at = NEW.captured_at,
    updated_at = now()
  WHERE id = NEW.ad_account_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_balance_snapshot_insert ON balance_snapshots;
CREATE TRIGGER on_balance_snapshot_insert
  AFTER INSERT ON balance_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ad_account_balance();

-- Trigger: update ad account spend after spend record insert/update --------

CREATE OR REPLACE FUNCTION public.update_ad_account_spend()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ad_accounts
  SET
    current_daily_spend = NEW.daily_spend,
    current_mtd_spend = NEW.mtd_spend,
    last_synced_at = now(),
    updated_at = now()
  WHERE id = NEW.ad_account_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_spend_record_upsert ON spend_records;
CREATE TRIGGER on_spend_record_upsert
  AFTER INSERT OR UPDATE ON spend_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ad_account_spend();

-- Trigger: generic updated_at setter --------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_organizations ON organizations;
CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_profiles ON profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_ad_accounts ON ad_accounts;
CREATE TRIGGER set_updated_at_ad_accounts
  BEFORE UPDATE ON ad_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_spend_records ON spend_records;
CREATE TRIGGER set_updated_at_spend_records
  BEFORE UPDATE ON spend_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_alert_rules ON alert_rules;
CREATE TRIGGER set_updated_at_alert_rules
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_notification_channels ON notification_channels;
CREATE TRIGGER set_updated_at_notification_channels
  BEFORE UPDATE ON notification_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
