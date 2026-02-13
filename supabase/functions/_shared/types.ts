/**
 * Shared TypeScript types for the alert engine Edge Functions.
 *
 * These types correspond to the database schema created in Phase 1 and
 * are used across evaluate-alerts, dispatch-notifications, and escalate-alerts.
 *
 * IMPORTANT: NUMERIC columns from PostgreSQL are represented as strings in
 * TypeScript (per project decision #2). Use Number() to convert before
 * arithmetic comparisons.
 */

/** Payload sent by pg_net triggers to the evaluate-alerts Edge Function */
export interface TriggerPayload {
  table: string;
  record_id: string;
  ad_account_id: string;
  org_id: string;
  /** Set to 'status_change' by the ad_accounts status trigger */
  event?: string;
  /** Previous status value (only present for status_change events) */
  old_status?: string;
  /** New status value (only present for status_change events) */
  new_status?: string;
}

/** Result of evaluating a single alert rule against an account */
export interface EvalResult {
  triggered: boolean;
  title: string;
  message: string;
  context: Record<string, unknown>;
}

/** Severity levels matching the database CHECK constraint */
export type Severity = "info" | "warning" | "critical" | "emergency";

/**
 * Alert row joined with alert_rules and ad_accounts for notification formatting.
 * Matches the shape returned by:
 *   supabase.from('alerts').select('*, alert_rules(*), ad_accounts(*)').single()
 */
export interface AlertWithDetails {
  id: string;
  org_id: string;
  ad_account_id: string;
  alert_rule_id: string;
  severity: Severity;
  title: string;
  message: string;
  context_data: Record<string, unknown>;
  status: "pending" | "acknowledged" | "resolved" | "dismissed";
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  created_at: string;
  /** Nested ad_accounts join */
  ad_accounts: {
    account_name: string;
    platform_id: string;
    currency: string;
    current_balance: string | null;
    current_daily_spend: string | null;
    status: string;
  } | null;
  /** Nested alert_rules join */
  alert_rules: {
    rule_type: string;
    config: Record<string, unknown>;
    cooldown_minutes: number;
    severity: Severity;
    name: string;
  } | null;
}

/**
 * Notification channel configuration from the notification_channels table.
 * The `config` field is typed based on channel_type:
 *   - email: { recipients: string[] }
 *   - telegram: { chat_id: string }
 */
export interface NotificationChannel {
  id: string;
  org_id: string;
  channel_type: string;
  name: string;
  config: {
    recipients?: string[];
    chat_id?: string;
    [key: string]: unknown;
  };
  min_severity: Severity;
  is_enabled: boolean;
  active_hours: { start: string; end: string; timezone: string } | null;
  created_at: string;
  updated_at: string;
}

/** Result of attempting to deliver a notification via a channel */
export interface DeliveryResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}
