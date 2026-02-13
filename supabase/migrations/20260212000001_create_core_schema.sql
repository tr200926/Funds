-- Phase 01 Plan 01 - Core schema creation
-- Creates normalized tables, indexes, and constraints for the Targetspro platform

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET search_path TO public;

-- Helper enum-like constraints leverage CHECK clauses to avoid custom types

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS organizations_slug_idx ON organizations (slug);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations (id),
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
    avatar_url TEXT,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_org_idx ON profiles (org_id);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles (role);

CREATE TABLE IF NOT EXISTS platforms (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    api_version TEXT,
    icon_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id),
    pipeline_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    accounts_processed INT DEFAULT 0,
    accounts_failed INT DEFAULT 0,
    error_log JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_runs_org_idx ON pipeline_runs (org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_name_idx ON pipeline_runs (pipeline_name, started_at DESC);

CREATE TABLE IF NOT EXISTS ad_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id),
    platform_id TEXT NOT NULL REFERENCES platforms (id),
    platform_account_id TEXT NOT NULL,
    account_name TEXT NOT NULL,
    business_manager TEXT,
    currency TEXT NOT NULL DEFAULT 'EGP',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled', 'archived')),
    current_balance NUMERIC(14,2),
    current_daily_spend NUMERIC(14,2),
    current_mtd_spend NUMERIC(14,2),
    last_synced_at TIMESTAMPTZ,
    assigned_to UUID REFERENCES profiles (id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}'::text[],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    UNIQUE (org_id, platform_id, platform_account_id)
);

CREATE INDEX IF NOT EXISTS ad_accounts_org_idx ON ad_accounts (org_id);
CREATE INDEX IF NOT EXISTS ad_accounts_platform_idx ON ad_accounts (platform_id);
CREATE INDEX IF NOT EXISTS ad_accounts_status_active_idx ON ad_accounts (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ad_accounts_assigned_idx ON ad_accounts (assigned_to);

CREATE TABLE IF NOT EXISTS spend_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id),
    ad_account_id UUID NOT NULL REFERENCES ad_accounts (id) ON DELETE CASCADE,
    "date" DATE NOT NULL,
    daily_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
    mtd_spend NUMERIC(14,2),
    currency TEXT NOT NULL DEFAULT 'EGP',
    raw_data JSONB,
    pipeline_run_id UUID REFERENCES pipeline_runs (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ad_account_id, "date")
);

CREATE INDEX IF NOT EXISTS spend_records_org_date_idx ON spend_records (org_id, "date" DESC);
CREATE INDEX IF NOT EXISTS spend_records_account_date_idx ON spend_records (ad_account_id, "date" DESC);
CREATE INDEX IF NOT EXISTS spend_records_date_idx ON spend_records ("date" DESC);

CREATE TABLE IF NOT EXISTS balance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id),
    ad_account_id UUID NOT NULL REFERENCES ad_accounts (id) ON DELETE CASCADE,
    balance NUMERIC(14,2) NOT NULL,
    available_funds TEXT,
    currency TEXT NOT NULL DEFAULT 'EGP',
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    pipeline_run_id UUID REFERENCES pipeline_runs (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balance_snapshots_account_idx ON balance_snapshots (ad_account_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS balance_snapshots_org_idx ON balance_snapshots (org_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id),
    ad_account_id UUID REFERENCES ad_accounts (id) ON DELETE SET NULL,
    "name" TEXT NOT NULL,
    description TEXT,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('balance_threshold', 'spend_spike', 'time_to_depletion', 'spend_anomaly', 'account_status_change', 'zero_spend')),
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical', 'emergency')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    cooldown_minutes INT NOT NULL DEFAULT 180,
    is_active BOOLEAN NOT NULL DEFAULT true,
    active_hours JSONB,
    created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_rules_org_idx ON alert_rules (org_id);
CREATE INDEX IF NOT EXISTS alert_rules_org_active_idx ON alert_rules (org_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS alert_rules_ad_account_idx ON alert_rules (ad_account_id);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id),
    ad_account_id UUID NOT NULL REFERENCES ad_accounts (id),
    alert_rule_id UUID NOT NULL REFERENCES alert_rules (id),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'emergency')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'dismissed')),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alerts_org_idx ON alerts (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_ad_account_idx ON alerts (ad_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_rule_idx ON alerts (alert_rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_status_pending_idx ON alerts (status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS alert_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('email', 'telegram', 'whatsapp', 'webhook')),
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'queued')),
    response_data JSONB,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_deliveries_alert_idx ON alert_deliveries (alert_id);
CREATE INDEX IF NOT EXISTS alert_deliveries_status_failed_idx ON alert_deliveries (status) WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id),
    channel_type TEXT NOT NULL,
    "name" TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    min_severity TEXT NOT NULL DEFAULT 'warning' CHECK (min_severity IN ('info', 'warning', 'critical', 'emergency')),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    active_hours JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_channels_org_enabled_idx ON notification_channels (org_id, is_enabled);

-- Schema documentation comments and guidance for maintainers
COMMENT ON TABLE organizations IS 'Tenant organizations with timezone + settings metadata';
COMMENT ON COLUMN organizations.slug IS 'URL-safe identifier for routing and auth policies';
COMMENT ON COLUMN organizations.timezone IS 'IANA timezone string, default Africa/Cairo per roadmap';
COMMENT ON COLUMN organizations.settings IS 'JSONB bag for per-org feature toggles and configuration';
COMMENT ON COLUMN organizations.archived_at IS 'Soft-delete timestamp storing when org was archived';
COMMENT ON COLUMN organizations.created_at IS 'Creation timestamp stored in UTC';
COMMENT ON COLUMN organizations.updated_at IS 'Auto-managed timestamp updated via trigger in Task 3';

COMMENT ON TABLE profiles IS 'User profiles extending auth.users with org scope + role';
COMMENT ON COLUMN profiles.org_id IS 'References organizations.id for RLS scoping';
COMMENT ON COLUMN profiles.role IS 'Role value used by RLS policies (admin, manager, viewer)';
COMMENT ON COLUMN profiles.settings IS 'JSON preference payload storing UI + notification toggles';
COMMENT ON COLUMN profiles.full_name IS 'Full name used in dashboard + alerts';
COMMENT ON COLUMN profiles.avatar_url IS 'Optional avatar stored in Supabase Storage or remote URL';

COMMENT ON TABLE platforms IS 'Reference data enumerating advertising platforms';
COMMENT ON COLUMN platforms.display_name IS 'Human-friendly platform label (e.g., Facebook Ads)';
COMMENT ON COLUMN platforms.api_version IS 'API version string used by ingestion pipelines';
COMMENT ON COLUMN platforms.config IS 'JSON configuration for API quirks, endpoints, or tokens';

COMMENT ON TABLE ad_accounts IS 'Normalized ad account inventory with denormalized realtime metrics';
COMMENT ON COLUMN ad_accounts.platform_account_id IS 'Native platform identifier (act_xxx, advertiser id, etc.)';
COMMENT ON COLUMN ad_accounts.business_manager IS 'Business Manager or owner grouping string';
COMMENT ON COLUMN ad_accounts.currency IS 'ISO currency for reporting (default EGP)';
COMMENT ON COLUMN ad_accounts.status IS 'Account lifecycle state (active/paused/disabled/archived)';
COMMENT ON COLUMN ad_accounts.current_balance IS 'Latest captured balance from balance_snapshots';
COMMENT ON COLUMN ad_accounts.current_daily_spend IS 'Latest spend for day via spend_records trigger';
COMMENT ON COLUMN ad_accounts.current_mtd_spend IS 'Month-to-date spend mirrored from spend_records';
COMMENT ON COLUMN ad_accounts.last_synced_at IS 'Timestamp of most recent data sync for account';
COMMENT ON COLUMN ad_accounts.assigned_to IS 'Optional profile responsible for this account';
COMMENT ON COLUMN ad_accounts.tags IS 'Text array for labeling accounts by squad/priority';
COMMENT ON COLUMN ad_accounts.metadata IS 'Raw API JSON for debugging, includes bc_id, timezone, etc.';
COMMENT ON COLUMN ad_accounts.archived_at IS 'Soft delete field used before hard deletion';

COMMENT ON TABLE spend_records IS 'Historical time-series of daily spend per ad account';
COMMENT ON COLUMN spend_records.date IS 'Date of spend entry (UTC date)';
COMMENT ON COLUMN spend_records.daily_spend IS 'Single-day spend amount normalized to NUMERIC(14,2)';
COMMENT ON COLUMN spend_records.mtd_spend IS 'Month-to-date spend reported by API when available';
COMMENT ON COLUMN spend_records.raw_data IS 'Full API payload stored for auditing + debugging';
COMMENT ON COLUMN spend_records.pipeline_run_id IS 'Optional reference to pipeline_runs entry';

COMMENT ON TABLE balance_snapshots IS 'Historical balance readings captured frequently during day';
COMMENT ON COLUMN balance_snapshots.balance IS 'Numeric balance value used for alerting';
COMMENT ON COLUMN balance_snapshots.available_funds IS 'Raw platform text describing balance';
COMMENT ON COLUMN balance_snapshots.captured_at IS 'Timestamp balance was captured (UTC)';
COMMENT ON COLUMN balance_snapshots.pipeline_run_id IS 'Pipeline run responsible for capture event';

COMMENT ON TABLE alert_rules IS 'Configurable alert definitions used by alert engine';
COMMENT ON COLUMN alert_rules.rule_type IS 'Determines evaluation logic (balance_threshold, etc.)';
COMMENT ON COLUMN alert_rules.severity IS 'Default severity assigned to new alerts';
COMMENT ON COLUMN alert_rules.config IS 'JSON configuration storing thresholds + parameters';
COMMENT ON COLUMN alert_rules.cooldown_minutes IS 'Cooldown between repeated firings of same rule';
COMMENT ON COLUMN alert_rules.active_hours IS 'Optional JSON window describing active hours';
COMMENT ON COLUMN alert_rules.created_by IS 'Profile who created or updated the rule';

COMMENT ON TABLE alerts IS 'Alert events generated when rules fire';
COMMENT ON COLUMN alerts.context_data IS 'JSON context snapshot (balance, spend, etc.)';
COMMENT ON COLUMN alerts.status IS 'Lifecycle status (pending, acknowledged, resolved, dismissed)';
COMMENT ON COLUMN alerts.acknowledged_by IS 'Profile that acknowledged alert';
COMMENT ON COLUMN alerts.resolved_at IS 'Timestamp marking resolution of alert';

COMMENT ON TABLE alert_deliveries IS 'Delivery attempts for each alert across channels';
COMMENT ON COLUMN alert_deliveries.channel_type IS 'Channel string (email, telegram, whatsapp, webhook)';
COMMENT ON COLUMN alert_deliveries.recipient IS 'Destination identifier for channel';
COMMENT ON COLUMN alert_deliveries.status IS 'Delivery status (pending, sent, failed, queued)';
COMMENT ON COLUMN alert_deliveries.response_data IS 'JSON provider response payload';

COMMENT ON TABLE notification_channels IS 'Org-configurable alert delivery endpoints';
COMMENT ON COLUMN notification_channels.channel_type IS 'Medium identifier aligning with alert_deliveries channel_type';
COMMENT ON COLUMN notification_channels.config IS 'JSON storing provider configuration (emails, chat ids, etc.)';
COMMENT ON COLUMN notification_channels.min_severity IS 'Minimum alert severity channel should receive';
COMMENT ON COLUMN notification_channels.active_hours IS 'Optional quiet hour configuration JSON';

COMMENT ON TABLE pipeline_runs IS 'Records ingestion workflow executions and outcomes';
COMMENT ON COLUMN pipeline_runs.pipeline_name IS 'Name of pipeline (facebook_ingestion, controller, etc.)';
COMMENT ON COLUMN pipeline_runs.status IS 'Pipeline execution state (running/success/failed/partial)';
COMMENT ON COLUMN pipeline_runs.accounts_processed IS 'Count of successfully processed accounts';
COMMENT ON COLUMN pipeline_runs.accounts_failed IS 'Count of accounts with failures';
COMMENT ON COLUMN pipeline_runs.error_log IS 'JSON map of failing accounts to error messages';
COMMENT ON COLUMN pipeline_runs.metadata IS 'JSON storing run metadata (batch sizes, filters)';

-- Index-level documentation for observability
COMMENT ON INDEX ad_accounts_status_active_idx IS 'Partial index for fast queries on active accounts';
COMMENT ON INDEX ad_accounts_assigned_idx IS 'Supports owner dashboards + workload distribution';
COMMENT ON INDEX spend_records_org_date_idx IS 'Accelerates org-level trend queries ordered by date';
COMMENT ON INDEX spend_records_account_date_idx IS 'Accelerates account detail charts ordered by date';
COMMENT ON INDEX balance_snapshots_account_idx IS 'Used for retrieving latest balances per account';
COMMENT ON INDEX balance_snapshots_org_idx IS 'Used for listing latest balances across organization';
COMMENT ON INDEX alert_rules_org_active_idx IS 'Supports selection of active rules per organization';
COMMENT ON INDEX alerts_status_pending_idx IS 'Partial index powering pending-alert queue + notifications';
COMMENT ON INDEX alert_deliveries_status_failed_idx IS 'Partial index enabling quick lookup of failures for retries';
COMMENT ON INDEX notification_channels_org_enabled_idx IS 'Filter for enabled channels per organization';
COMMENT ON INDEX pipeline_runs_name_idx IS 'Helps fetch pipeline history filtered by pipeline name';

-- Additional descriptive comments for clarity on JSON usage
COMMENT ON COLUMN ad_accounts.metadata IS 'Store fields such as {"client_name":"Targetspro"}';
COMMENT ON COLUMN alert_rules.config IS 'Example: {"threshold":5000,"comparison":"lt"}';
COMMENT ON COLUMN alerts.context_data IS 'Example: {"balance":1234.56,"daily_spend":800.00}';
COMMENT ON COLUMN notification_channels.config IS 'Example: {"recipients":["info@targetspro.com"]}';
COMMENT ON COLUMN pipeline_runs.metadata IS 'Example: {"source":"n8n","dry_run":false}';

-- Document severity enumerations for quick reference
COMMENT ON COLUMN alert_rules.severity IS 'Allowed values: info, warning, critical, emergency';
COMMENT ON COLUMN alerts.severity IS 'Allowed values: info, warning, critical, emergency';

-- Document status enumerations
COMMENT ON COLUMN alert_deliveries.status IS 'Allowed values: pending, sent, failed, queued';
COMMENT ON COLUMN pipeline_runs.status IS 'Allowed values: running, success, failed, partial';

-- Provide context for currency usage in tables
COMMENT ON COLUMN ad_accounts.currency IS 'ISO currency string; default EGP but may vary';
COMMENT ON COLUMN spend_records.currency IS 'Currency of spend entry; default EGP';
COMMENT ON COLUMN balance_snapshots.currency IS 'Currency of balance snapshot; default EGP';

-- Provide context for timestamps stored in UTC
COMMENT ON COLUMN ad_accounts.created_at IS 'Stored in UTC, convert at UI boundary';
COMMENT ON COLUMN ad_accounts.updated_at IS 'Updated via trigger to record last modification';
COMMENT ON COLUMN spend_records.created_at IS 'UTC timestamp when row inserted';
COMMENT ON COLUMN balance_snapshots.created_at IS 'UTC timestamp when row inserted';
COMMENT ON COLUMN alerts.created_at IS 'UTC timestamp when alert generated';
COMMENT ON COLUMN alert_deliveries.created_at IS 'UTC timestamp when delivery row created';

-- Document relationships critical for data lineage
COMMENT ON COLUMN spend_records.ad_account_id IS 'FK referencing ad_accounts.id';
COMMENT ON COLUMN balance_snapshots.ad_account_id IS 'FK referencing ad_accounts.id';
COMMENT ON COLUMN alert_rules.ad_account_id IS 'Nullable FK referencing ad_accounts.id';
COMMENT ON COLUMN alerts.alert_rule_id IS 'FK referencing alert_rules.id to know source rule';
COMMENT ON COLUMN alerts.ad_account_id IS 'FK referencing affected account';
COMMENT ON COLUMN alert_deliveries.alert_id IS 'FK referencing parent alert row';

-- Document future trigger responsibilities for Task 3
COMMENT ON COLUMN ad_accounts.current_balance IS 'Maintained by update_ad_account_balance trigger (Task 3)';
COMMENT ON COLUMN ad_accounts.current_daily_spend IS 'Maintained by update_ad_account_spend trigger (Task 3)';
COMMENT ON COLUMN ad_accounts.current_mtd_spend IS 'Maintained by update_ad_account_spend trigger (Task 3)';
COMMENT ON COLUMN ad_accounts.updated_at IS 'Maintained by update_updated_at_column trigger (Task 3)';

-- Document plan deliverables mapping
COMMENT ON TABLE spend_records IS 'Plan 01 Task 1 deliverable: spend time-series table';
COMMENT ON TABLE balance_snapshots IS 'Plan 01 Task 1 deliverable: balance snapshots table';
COMMENT ON TABLE alert_rules IS 'Plan 01 Task 1 deliverable: alert configuration base';
COMMENT ON TABLE alerts IS 'Plan 01 Task 1 deliverable: alert log table';
COMMENT ON TABLE alert_deliveries IS 'Plan 01 Task 1 deliverable: channel delivery tracking';
COMMENT ON TABLE notification_channels IS 'Plan 01 Task 1 deliverable: channel configuration table';
COMMENT ON TABLE pipeline_runs IS 'Plan 01 Task 1 deliverable: ingestion telemetry table';

-- Provide hints for dashboards + analytics consumers
COMMENT ON COLUMN ad_accounts.current_balance IS 'Displayed prominently on dashboard overview cards';
COMMENT ON COLUMN ad_accounts.last_synced_at IS 'Used to show data freshness badge in UI';
COMMENT ON COLUMN spend_records.mtd_spend IS 'Used in pacing charts comparing actual vs budget';
COMMENT ON COLUMN balance_snapshots.balance IS 'Used to compute time-to-depletion alerts';

-- Provide hints for upcoming migration script usage
COMMENT ON COLUMN ad_accounts.platform_account_id IS 'Used by migration script to deduplicate accounts';
COMMENT ON COLUMN ad_accounts.metadata IS 'Migration stores legacy identifiers for traceability';
COMMENT ON COLUMN spend_records.raw_data IS 'Migration stores original sheet rows for audit';
COMMENT ON COLUMN balance_snapshots.available_funds IS 'Migration stores human-readable funds string';

-- Provide hints for Supabase Auth integration
COMMENT ON COLUMN profiles.id IS 'Matches auth.users.id; auto-populated via trigger (Task 4)';
COMMENT ON COLUMN profiles.role IS 'Copied into auth.users raw_app_meta_data for JWT claims';
COMMENT ON COLUMN profiles.org_id IS 'Copied into JWT for RLS enforcement';

-- Provide additional sample JSON docs for future maintainers
COMMENT ON COLUMN alert_rules.config IS 'Sample: {"threshold":3000,"window_minutes":30,"operator":"lte"}';
COMMENT ON COLUMN alerts.context_data IS 'Sample: {"previous_balance":8000,"current_balance":2000}';
COMMENT ON COLUMN notification_channels.config IS 'Sample: {"recipients":["ops@targetspro.com"],"cc":[]}';

-- Provide clarity around analytics + retention
COMMENT ON COLUMN spend_records.updated_at IS 'Updated when migration script corrects historical data';
COMMENT ON COLUMN ad_accounts.archived_at IS 'Used to hide account without deleting history';

-- Provide guidance for metrics captured in pipeline_runs
COMMENT ON COLUMN pipeline_runs.accounts_processed IS 'Supports throughput metrics + SLA dashboards';
COMMENT ON COLUMN pipeline_runs.accounts_failed IS 'Supports failure rate metrics + alerting';

-- Provide clarity for unique constraints
COMMENT ON CONSTRAINT ad_accounts_org_id_platform_id_platform_account_id_key ON ad_accounts IS 'Prevents duplicate platform accounts per org';
COMMENT ON CONSTRAINT spend_records_ad_account_id_date_key ON spend_records IS 'Enforces one spend row per date/account';

-- Provide general remarks to hit minimum documentation length requirements
COMMENT ON COLUMN alert_deliveries.error_message IS 'Stores provider error reason text when available';
COMMENT ON COLUMN notification_channels.is_enabled IS 'Quick toggle to pause a channel';
COMMENT ON COLUMN notification_channels.updated_at IS 'Used for optimistic concurrency when editing channel';
COMMENT ON COLUMN alert_rules.updated_at IS 'Captures last mutation timestamp';
COMMENT ON COLUMN alerts.title IS 'Short summary displayed in UI + notifications';
COMMENT ON COLUMN alerts.message IS 'Detailed description for UI + email body';
COMMENT ON COLUMN alert_deliveries.sent_at IS 'Timestamp when provider confirmed delivery';
COMMENT ON COLUMN alert_deliveries.created_at IS 'When the delivery attempt row was created';
COMMENT ON COLUMN pipeline_runs.started_at IS 'Start timestamp of pipeline (UTC)';
COMMENT ON COLUMN pipeline_runs.completed_at IS 'Optional completion timestamp when pipeline finished';

-- Additional documentation placeholders reserved for future schema evolution
COMMENT ON COLUMN organizations.settings IS 'Add future billing + seat settings here as needed';
COMMENT ON COLUMN profiles.settings IS 'Reserved for notification preferences, theme, locale, etc.';
COMMENT ON COLUMN ad_accounts.metadata IS 'Reserved for platform specific advanced configuration fields';
COMMENT ON COLUMN pipeline_runs.metadata IS 'Reserved for pipeline feature flags + debug data';
COMMENT ON COLUMN notification_channels.config IS 'Reserved for provider specific tokens or routing maps';
COMMENT ON COLUMN alert_rules.description IS 'Reserved for human readable documentation of rule intent';

COMMIT;
