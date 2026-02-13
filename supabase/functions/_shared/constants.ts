/**
 * Shared constants for the alert engine Edge Functions.
 *
 * Severity ordering, default values, and escalation configuration
 * used across evaluate-alerts, dispatch-notifications, and escalate-alerts.
 */

import type { Severity } from "./types.ts";

/**
 * Numeric ordering of severity levels for comparison.
 * Higher number = more severe. Used to filter channels by min_severity.
 */
export const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
  emergency: 3,
};

/**
 * Default cooldown between repeated firings of the same alert rule
 * for the same ad account (in minutes). Can be overridden per-rule
 * via alert_rules.cooldown_minutes.
 */
export const DEFAULT_COOLDOWN_MINUTES = 180;

/**
 * Minutes an unacknowledged alert waits at each severity level before
 * escalating to the next severity. Emergency never escalates further.
 */
export const ESCALATION_TIMEOUTS: Record<Severity, number> = {
  info: 240,
  warning: 120,
  critical: 60,
  emergency: 0,
};

/**
 * Maps each severity to the next higher level for escalation.
 * Emergency has no next level (null = cannot escalate further).
 */
export const SEVERITY_NEXT: Record<Severity, Severity | null> = {
  info: "warning",
  warning: "critical",
  critical: "emergency",
  emergency: null,
};
