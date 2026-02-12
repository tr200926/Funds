-- Phase 01 Plan 01 - Seed initial reference data + Supabase Auth triggers

BEGIN;

SET search_path TO public;

-- Seed Targetspro organization -------------------------------------------

INSERT INTO organizations (id, name, slug, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Targetspro',
  'targetspro',
  'Africa/Cairo'
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  timezone = EXCLUDED.timezone;

-- Seed supported platforms ----------------------------------------------

INSERT INTO platforms (id, display_name, api_version, is_active)
VALUES
  ('facebook', 'Facebook Ads', 'v23.0', TRUE),
  ('tiktok', 'TikTok Ads', 'v1.3', TRUE)
ON CONFLICT (id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  api_version = EXCLUDED.api_version,
  is_active = EXCLUDED.is_active;

-- Trigger: auto-create profile for new auth user -------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_name TEXT;
  default_role TEXT;
BEGIN
  default_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  default_role := COALESCE(NEW.raw_user_meta_data->>'role', 'viewer');

  INSERT INTO public.profiles (id, org_id, full_name, role)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001',
    default_name,
    default_role
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger: sync profile role/org into auth.users custom claims ------------

CREATE OR REPLACE FUNCTION public.update_user_role_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', NEW.role, 'org_id', NEW.org_id)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_role_change ON profiles;
CREATE TRIGGER on_profile_role_change
  AFTER INSERT OR UPDATE OF role, org_id ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_role_claim();

-- Seed default notification channel --------------------------------------

INSERT INTO notification_channels (
  org_id,
  channel_type,
  name,
  config,
  min_severity,
  is_enabled
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'email',
  'Default Email Alerts',
  '{"recipients": ["info@targetspro.com"]}'::jsonb,
  'warning',
  TRUE
)
ON CONFLICT DO NOTHING;

COMMIT;
