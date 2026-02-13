/**
 * Notification formatters for the alert engine.
 *
 * Provides Email HTML and Telegram text formatting for alert notifications,
 * plus quiet hours checking for notification channel active_hours.
 *
 * All timestamps displayed in Africa/Cairo timezone (per project decision #3).
 */

import type { AlertWithDetails, Severity } from "./types.ts";

// =============================================================================
// Email HTML Formatter
// =============================================================================

/** Severity badge colors for email HTML */
const SEVERITY_COLORS: Record<Severity, { bg: string; text: string }> = {
  info: { bg: "#3B82F6", text: "#FFFFFF" },
  warning: { bg: "#F59E0B", text: "#000000" },
  critical: { bg: "#EF4444", text: "#FFFFFF" },
  emergency: { bg: "#7F1D1D", text: "#FFFFFF" },
};

/**
 * Formats an alert as an HTML email body.
 *
 * Produces a clean, responsive HTML email with:
 * - Colored severity badge
 * - Alert title and message
 * - Account details (name, platform, balance if available)
 * - Timestamp in Africa/Cairo timezone
 * - Link placeholder to dashboard alert page
 */
export function formatAlertEmailHtml(alert: AlertWithDetails): string {
  const severity = alert.severity;
  const colors = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info;
  const account = alert.ad_accounts;
  const cairoTimestamp = formatCairoTimestamp(alert.created_at);

  const balanceRow =
    account?.current_balance != null
      ? `
      <tr>
        <td style="padding: 6px 12px; color: #6B7280; font-size: 14px;">Balance</td>
        <td style="padding: 6px 12px; font-size: 14px; font-weight: 600;">${account.currency} ${Number(account.current_balance).toLocaleString()}</td>
      </tr>`
      : "";

  const contextRows = buildContextRows(alert.context_data);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; padding: 24px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px; background-color: ${colors.bg};">
              <span style="display: inline-block; padding: 4px 12px; background-color: rgba(255,255,255,0.2); border-radius: 4px; color: ${colors.text}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${severity}</span>
              <h1 style="margin: 12px 0 0; color: ${colors.text}; font-size: 20px; font-weight: 600;">${escapeHtml(alert.title)}</h1>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding: 24px;">
              <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.5;">${escapeHtml(alert.message)}</p>

              <!-- Account Details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; border-radius: 6px; margin-bottom: 16px;">
                <tr>
                  <td style="padding: 6px 12px; color: #6B7280; font-size: 14px;">Account</td>
                  <td style="padding: 6px 12px; font-size: 14px; font-weight: 600;">${escapeHtml(account?.account_name ?? "Unknown")}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 12px; color: #6B7280; font-size: 14px;">Platform</td>
                  <td style="padding: 6px 12px; font-size: 14px;">${escapeHtml(account?.platform_id ?? "Unknown")}</td>
                </tr>
                ${balanceRow}
                ${contextRows}
                <tr>
                  <td style="padding: 6px 12px; color: #6B7280; font-size: 14px;">Time</td>
                  <td style="padding: 6px 12px; font-size: 14px;">${cairoTimestamp}</td>
                </tr>
              </table>

              <!-- Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 12px 24px; background-color: #3B82F6; border-radius: 6px;">
                    <a href="#/alerts/${alert.id}" style="color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600;">View in Dashboard</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 24px; background-color: #F9FAFB; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px; text-align: center;">Targetspro Alert Engine &mdash; ${cairoTimestamp}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// =============================================================================
// Telegram Text Formatter
// =============================================================================

/** Severity emoji prefixes for Telegram messages */
const SEVERITY_EMOJI: Record<Severity, string> = {
  info: "\u2139\uFE0F",       // information
  warning: "\u26A0\uFE0F",    // warning
  critical: "\uD83D\uDD34",   // red circle
  emergency: "\uD83D\uDEA8",  // rotating light (siren)
};

/**
 * Formats an alert as Telegram HTML text (parse_mode='HTML').
 *
 * Produces a message with:
 * - Severity emoji prefix
 * - Bold title and message body
 * - Account name, platform, balance/days-remaining from context_data
 * - Cairo timezone timestamp
 */
export function formatAlertTelegramText(alert: AlertWithDetails): string {
  const emoji = SEVERITY_EMOJI[alert.severity] ?? "";
  const account = alert.ad_accounts;
  const context = alert.context_data ?? {};
  const cairoTimestamp = formatCairoTimestamp(alert.created_at);

  const lines: (string | null)[] = [
    `${emoji} <b>${escapeTelegramHtml(alert.severity.toUpperCase())}: ${escapeTelegramHtml(alert.title)}</b>`,
    "",
    escapeTelegramHtml(alert.message),
    "",
    `Account: <b>${escapeTelegramHtml(account?.account_name ?? "Unknown")}</b>`,
    `Platform: ${escapeTelegramHtml(account?.platform_id ?? "Unknown")}`,
    context.balance !== undefined
      ? `Balance: ${escapeTelegramHtml(account?.currency ?? "EGP")} ${Number(context.balance).toLocaleString()}`
      : null,
    context.days_remaining !== undefined
      ? `Days remaining: ${context.days_remaining}`
      : null,
    context.pct_change !== undefined
      ? `Spike: +${Number(context.pct_change).toFixed(0)}% above average`
      : null,
    context.old_status !== undefined && context.new_status !== undefined
      ? `Status: ${context.old_status} -> ${context.new_status}`
      : null,
    "",
    `Time: ${cairoTimestamp}`,
  ];

  return lines.filter((line) => line !== null).join("\n");
}

// =============================================================================
// Quiet Hours Check
// =============================================================================

/**
 * Determines if the current time falls within the notification channel's
 * quiet hours (active_hours window).
 *
 * @param activeHours - Quiet hours config, or null for 24/7 delivery
 * @returns true if currently in quiet hours (should suppress notification)
 *
 * Handles midnight-wrapping windows (e.g., 22:00-06:00) correctly.
 * null activeHours = no quiet hours = always deliver (returns false).
 */
export function isInQuietHours(
  activeHours: { start: string; end: string; timezone: string } | null
): boolean {
  // null = 24/7 delivery, no quiet hours
  if (!activeHours) return false;

  const { start, end, timezone } = activeHours;

  // Get current time in the specified timezone as HH:MM
  const now = new Date();
  const currentTime = now.toLocaleTimeString("en-GB", {
    timeZone: timezone || "Africa/Cairo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }); // e.g., "03:45"

  // If start < end: quiet hours are within the same day (e.g., 00:00-08:00)
  // If start > end: quiet hours wrap around midnight (e.g., 22:00-06:00)
  if (start <= end) {
    return currentTime >= start && currentTime < end;
  } else {
    return currentTime >= start || currentTime < end;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a timestamp in Africa/Cairo timezone for display.
 * Falls back to the raw string if parsing fails.
 */
function formatCairoTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return isoString;
  }
}

/** Escape HTML entities for email body content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape HTML entities for Telegram HTML parse_mode */
function escapeTelegramHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build extra context rows for the email details table from context_data.
 * Renders days_remaining and pct_change if present.
 */
function buildContextRows(context: Record<string, unknown>): string {
  let rows = "";

  if (context.days_remaining !== undefined) {
    rows += `
      <tr>
        <td style="padding: 6px 12px; color: #6B7280; font-size: 14px;">Days Remaining</td>
        <td style="padding: 6px 12px; font-size: 14px; font-weight: 600;">${context.days_remaining}</td>
      </tr>`;
  }

  if (context.pct_change !== undefined) {
    rows += `
      <tr>
        <td style="padding: 6px 12px; color: #6B7280; font-size: 14px;">Spend Change</td>
        <td style="padding: 6px 12px; font-size: 14px; font-weight: 600;">+${Number(context.pct_change).toFixed(0)}%</td>
      </tr>`;
  }

  if (context.old_status !== undefined && context.new_status !== undefined) {
    rows += `
      <tr>
        <td style="padding: 6px 12px; color: #6B7280; font-size: 14px;">Status Change</td>
        <td style="padding: 6px 12px; font-size: 14px; font-weight: 600;">${escapeHtml(String(context.old_status))} &rarr; ${escapeHtml(String(context.new_status))}</td>
      </tr>`;
  }

  return rows;
}
