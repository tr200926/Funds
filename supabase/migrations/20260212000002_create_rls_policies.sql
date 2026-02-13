-- Phase 01 Plan 01 - Row Level Security policies

BEGIN;

SET search_path TO public;

-- Helper functions ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.user_org_id IS 'Returns org_id for currently authenticated user';
COMMENT ON FUNCTION public.user_role IS 'Returns role (admin/manager/viewer) for current user';

-- Enable Row Level Security on all user-facing tables ---------------------

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Organizations -----------------------------------------------------------

CREATE POLICY "Users can view their organization"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (id = public.user_org_id());

CREATE POLICY "Service role can manage organizations"
  ON organizations
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Profiles ---------------------------------------------------------------

CREATE POLICY "Users can view profiles in their org"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Service role can insert profiles"
  ON profiles
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "Users can update their own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update org profiles"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND public.user_role() = 'admin'
  )
  WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() = 'admin'
  );

CREATE POLICY "Service role can delete profiles"
  ON profiles
  FOR DELETE
  TO service_role
  USING (TRUE);

-- Ad Accounts ------------------------------------------------------------

CREATE POLICY "Users can view ad accounts in their org"
  ON ad_accounts
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Admins and managers can insert ad accounts"
  ON ad_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() IN ('admin', 'manager')
  );

CREATE POLICY "Admins and managers can update ad accounts"
  ON ad_accounts
  FOR UPDATE
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() IN ('admin', 'manager')
  );

CREATE POLICY "Admins can delete ad accounts"
  ON ad_accounts
  FOR DELETE
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND public.user_role() = 'admin'
  );

-- Spend Records ----------------------------------------------------------

CREATE POLICY "Users can view spend records in their org"
  ON spend_records
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Service role manages spend records"
  ON spend_records
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Balance Snapshots ------------------------------------------------------

CREATE POLICY "Users can view balance snapshots in their org"
  ON balance_snapshots
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Service role manages balance snapshots"
  ON balance_snapshots
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Alert Rules ------------------------------------------------------------

CREATE POLICY "Users can view alert rules in their org"
  ON alert_rules
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Admins and managers can create alert rules"
  ON alert_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() IN ('admin', 'manager')
  );

CREATE POLICY "Admins and managers can update alert rules"
  ON alert_rules
  FOR UPDATE
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() IN ('admin', 'manager')
  );

CREATE POLICY "Admins and managers can delete alert rules"
  ON alert_rules
  FOR DELETE
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND public.user_role() IN ('admin', 'manager')
  );

-- Alerts ----------------------------------------------------------------

CREATE POLICY "Users can view alerts in their org"
  ON alerts
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Service role can insert alerts"
  ON alerts
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "Users can update alerts in their org"
  ON alerts
  FOR UPDATE
  TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

CREATE POLICY "Service role can delete alerts"
  ON alerts
  FOR DELETE
  TO service_role
  USING (TRUE);

-- Alert Deliveries ------------------------------------------------------

CREATE POLICY "Users can view alert deliveries via parent org"
  ON alert_deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM alerts a
      WHERE a.id = alert_deliveries.alert_id
        AND a.org_id = public.user_org_id()
    )
  );

CREATE POLICY "Service role can insert alert deliveries"
  ON alert_deliveries
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "Users can update alert deliveries in their org"
  ON alert_deliveries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM alerts a
      WHERE a.id = alert_deliveries.alert_id
        AND a.org_id = public.user_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM alerts a
      WHERE a.id = alert_deliveries.alert_id
        AND a.org_id = public.user_org_id()
    )
  );

CREATE POLICY "Service role can delete alert deliveries"
  ON alert_deliveries
  FOR DELETE
  TO service_role
  USING (TRUE);

-- Notification Channels --------------------------------------------------

CREATE POLICY "Users can view notification channels in their org"
  ON notification_channels
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Admins can manage notification channels"
  ON notification_channels
  FOR ALL
  TO authenticated
  USING (
    org_id = public.user_org_id()
    AND public.user_role() = 'admin'
  )
  WITH CHECK (
    org_id = public.user_org_id()
    AND public.user_role() = 'admin'
  );

-- Pipeline Runs ---------------------------------------------------------

CREATE POLICY "Users can view pipeline runs in their org"
  ON pipeline_runs
  FOR SELECT
  TO authenticated
  USING (org_id = public.user_org_id());

CREATE POLICY "Service role manages pipeline runs"
  ON pipeline_runs
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

COMMIT;
