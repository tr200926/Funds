/**
 * dispatch-notifications Edge Function
 *
 * Receives an alert_id, loads the alert with joined data, finds eligible
 * notification channels by severity, checks quiet hours (emergency bypasses),
 * and sends via Resend email and Telegram Bot API.
 *
 * Every dispatch attempt is logged to the alert_deliveries table.
 */

import { createAdminClient } from "../_shared/supabase-client.ts";
import { SEVERITY_ORDER } from "../_shared/constants.ts";
import {
  formatAlertEmailHtml,
  formatAlertTelegramText,
  isInQuietHours,
} from "../_shared/notification-formatters.ts";
import type {
  AlertWithDetails,
  DeliveryResult,
  NotificationChannel,
  Severity,
} from "../_shared/types.ts";

Deno.serve(async (req) => {
  try {
    const { alert_id } = await req.json();

    if (!alert_id) {
      return new Response(
        JSON.stringify({ error: "Missing alert_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createAdminClient();

    // Load alert with joined alert_rules and ad_accounts
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .select("*, alert_rules(*), ad_accounts(*)")
      .eq("id", alert_id)
      .single();

    if (alertError || !alert) {
      return new Response(
        JSON.stringify({ error: "Alert not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const typedAlert = alert as AlertWithDetails;

    // Load eligible notification channels
    const { data: channels, error: channelsError } = await supabase
      .from("notification_channels")
      .select("*")
      .eq("org_id", typedAlert.org_id)
      .eq("is_enabled", true);

    if (channelsError || !channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ dispatched: 0, reason: "No eligible channels" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let dispatched = 0;
    let failed = 0;

    for (const channel of channels as NotificationChannel[]) {
      try {
        // Check min_severity filter
        const alertLevel = SEVERITY_ORDER[typedAlert.severity as Severity] ?? 0;
        const channelMin = SEVERITY_ORDER[channel.min_severity as Severity] ?? 0;

        if (alertLevel < channelMin) continue;

        // Check quiet hours (emergency bypasses per R5.8)
        if (typedAlert.severity !== "emergency") {
          if (isInQuietHours(channel.active_hours)) {
            // Queue for later delivery
            await supabase.from("alert_deliveries").insert({
              alert_id: typedAlert.id,
              channel_type: channel.channel_type,
              recipient: getRecipient(channel),
              status: "queued",
              response_data: { reason: "quiet_hours" },
            });
            continue;
          }
        }

        // Dispatch based on channel type
        let result: DeliveryResult;

        if (channel.channel_type === "email") {
          result = await sendEmail(typedAlert, channel);
        } else if (channel.channel_type === "telegram") {
          result = await sendTelegram(typedAlert, channel);
        } else {
          result = { ok: false, error: `Unknown channel type: ${channel.channel_type}` };
        }

        // Log delivery attempt
        await supabase.from("alert_deliveries").insert({
          alert_id: typedAlert.id,
          channel_type: channel.channel_type,
          recipient: getRecipient(channel),
          status: result.ok ? "sent" : "failed",
          response_data: result.data ?? null,
          error_message: result.error ?? null,
          sent_at: result.ok ? new Date().toISOString() : null,
        });

        if (result.ok) {
          dispatched++;
        } else {
          failed++;
        }
      } catch (channelError) {
        // Per-channel error: don't block other channels
        console.error(
          `Error dispatching to channel ${channel.id}:`,
          channelError instanceof Error ? channelError.message : channelError
        );
        failed++;

        await supabase.from("alert_deliveries").insert({
          alert_id: typedAlert.id,
          channel_type: channel.channel_type,
          recipient: getRecipient(channel),
          status: "failed",
          error_message:
            channelError instanceof Error
              ? channelError.message
              : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({ dispatched, failed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("dispatch-notifications error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// =============================================================================
// Email via Resend API
// =============================================================================

async function sendEmail(
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<DeliveryResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const recipients = channel.config.recipients;
  if (!recipients || recipients.length === 0) {
    return { ok: false, error: "No email recipients configured" };
  }

  const html = formatAlertEmailHtml(alert);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: "Targetspro Alerts <alerts@targetspro.com>",
      to: recipients,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      html,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { ok: false, error: data.message ?? "Resend API error", data };
  }

  return { ok: true, data };
}

// =============================================================================
// Telegram via Bot API
// =============================================================================

async function sendTelegram(
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<DeliveryResult> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured" };
  }

  const chatId = channel.config.chat_id;
  if (!chatId) {
    return { ok: false, error: "No chat_id configured for telegram channel" };
  }

  const text = formatAlertTelegramText(alert);

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.description ?? "Telegram API error",
      data,
    };
  }

  return { ok: true, data };
}

// =============================================================================
// Helpers
// =============================================================================

function getRecipient(channel: NotificationChannel): string {
  if (channel.channel_type === "email") {
    return (channel.config.recipients ?? [])[0] ?? "unknown";
  }
  if (channel.channel_type === "telegram") {
    return channel.config.chat_id ?? "unknown";
  }
  return "unknown";
}
