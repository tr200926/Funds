import { createAdminClient } from "../_shared/supabase-client.ts";
import type {
  AlertWithDetails,
  NotificationChannel,
  Severity,
} from "../_shared/types.ts";
import { SEVERITY_ORDER } from "../_shared/constants.ts";
import {
  formatAlertEmailHtml,
  formatAlertTelegramText,
  formatAlertWhatsAppParams,
  isInQuietHours,
} from "../_shared/notification-formatters.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type DeliveryResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

type WhatsAppRecipient = {
  phone: string;
  user_id: string;
};

type ProfileSettings = {
  whatsapp_opt_in?: boolean;
  whatsapp_phone?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => null) as
      | { alert_id?: string }
      | null;
    const alertId = payload?.alert_id;

    if (!alertId || typeof alertId !== "string") {
      return jsonResponse({ error: "alert_id is required" }, 400);
    }

    const supabase = createAdminClient();
    const alert = await loadAlert(supabase, alertId);

    if (!alert) {
      return jsonResponse({ error: "Alert not found" }, 404);
    }

    const channels = await loadChannels(supabase, alert.org_id);
    let loggedDeliveries = 0;

    for (const channel of channels) {
      loggedDeliveries += await dispatchToChannel(supabase, alert, channel);
    }

    return jsonResponse(
      {
        alert_id: alert.id,
        deliveries_logged: loggedDeliveries,
        channel_count: channels.length,
      },
      200
    );
  } catch (error) {
    console.error("dispatch-notifications error", error);
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "Unexpected dispatch error",
      },
      500
    );
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadAlert(supabase: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await supabase
    .from("alerts")
    .select("*, alert_rules(*), ad_accounts(*)")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Failed to load alert", error);
    throw new Error("Unable to load alert");
  }

  return data as AlertWithDetails | null;
}

async function loadChannels(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string
) {
  const { data, error } = await supabase
    .from("notification_channels")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_enabled", true);

  if (error) {
    console.error("Failed to load notification channels", error);
    throw new Error("Unable to load notification channels");
  }

  return (data ?? []) as NotificationChannel[];
}

async function dispatchToChannel(
  supabase: ReturnType<typeof createAdminClient>,
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<number> {
  const alertLevel = SEVERITY_ORDER[alert.severity];
  const minLevel = SEVERITY_ORDER[(channel.min_severity as Severity) ?? "info"] ?? 0;

  if (alertLevel < minLevel) {
    return 0;
  }

  const activeHours = channel.active_hours as
    | { start: string; end: string; timezone: string }
    | null;

  if (
    activeHours &&
    alert.severity !== "emergency" &&
    isInQuietHours(activeHours)
  ) {
    await logDelivery(supabase, {
      alert_id: alert.id,
      channel_type: channel.channel_type,
      recipient: describeRecipient(channel),
      status: "queued",
      response_data: { reason: "quiet_hours" },
      error_message: "Channel in quiet hours",
    });
    return 1;
  }

  switch (channel.channel_type) {
    case "email":
      return dispatchEmailChannel(supabase, alert, channel);
    case "telegram":
      return dispatchTelegramChannel(supabase, alert, channel);
    case "whatsapp":
      return dispatchWhatsAppChannel(supabase, alert, channel);
    default:
      await logDelivery(supabase, {
        alert_id: alert.id,
        channel_type: channel.channel_type,
        recipient: describeRecipient(channel),
        status: "failed",
        error_message: `Unsupported channel type: ${channel.channel_type}`,
      });
      return 1;
  }
}

async function dispatchEmailChannel(
  supabase: ReturnType<typeof createAdminClient>,
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<number> {
  const recipients = Array.isArray(channel.config?.recipients)
    ? (channel.config.recipients as string[])
    : [];

  if (!recipients.length) {
    await logDelivery(supabase, {
      alert_id: alert.id,
      channel_type: "email",
      recipient: channel.name,
      status: "failed",
      error_message: "No email recipients configured",
    });
    return 1;
  }

  const result = await sendEmail(alert, recipients);
  await logDelivery(supabase, {
    alert_id: alert.id,
    channel_type: "email",
    recipient: recipients.join(", "),
    status: result.ok ? "sent" : "failed",
    response_data: result.data ?? null,
    error_message: result.ok ? null : result.error ?? "Email send failed",
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  return 1;
}

async function dispatchTelegramChannel(
  supabase: ReturnType<typeof createAdminClient>,
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<number> {
  const chatId =
    typeof channel.config?.chat_id === "string"
      ? channel.config.chat_id
      : "";

  if (!chatId) {
    await logDelivery(supabase, {
      alert_id: alert.id,
      channel_type: "telegram",
      recipient: channel.name,
      status: "failed",
      error_message: "No Telegram chat_id configured",
    });
    return 1;
  }

  const result = await sendTelegram(alert, chatId);
  await logDelivery(supabase, {
    alert_id: alert.id,
    channel_type: "telegram",
    recipient: chatId,
    status: result.ok ? "sent" : "failed",
    response_data: result.data ?? null,
    error_message: result.ok
      ? null
      : result.error ?? "Telegram send failed",
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  return 1;
}

async function dispatchWhatsAppChannel(
  supabase: ReturnType<typeof createAdminClient>,
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<number> {
  const recipientsRaw = Array.isArray(channel.config?.recipients)
    ? (channel.config.recipients as unknown as WhatsAppRecipient[])
    : [];

  if (!recipientsRaw.length) {
    await logDelivery(supabase, {
      alert_id: alert.id,
      channel_type: "whatsapp",
      recipient: channel.name,
      status: "failed",
      error_message: "No WhatsApp recipients configured",
    });
    return 1;
  }

  const userIds = recipientsRaw
    .map((recipient) => recipient.user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const profileMap = new Map<string, ProfileSettings>();

  if (userIds.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, settings")
      .in("id", userIds);

    if (error) {
      console.error("Failed to load WhatsApp opt-in settings", error);
      for (const recipient of recipientsRaw) {
        await logDelivery(supabase, {
          alert_id: alert.id,
          channel_type: "whatsapp",
          recipient: recipient.phone ?? recipient.user_id,
          status: "failed",
          error_message: "Unable to load profile settings",
        });
      }
      return recipientsRaw.length;
    }

    for (const profile of data ?? []) {
      profileMap.set(
        profile.id,
        (profile.settings ?? {}) as ProfileSettings
      );
    }
  }

  let logged = 0;

  for (const recipient of recipientsRaw) {
    const settings = profileMap.get(recipient.user_id) ?? {};
    const optedIn = settings.whatsapp_opt_in === true;
    const phone =
      (settings.whatsapp_phone ?? recipient.phone)?.toString().trim() ?? "";

    if (!optedIn || !phone) {
      continue;
    }

    try {
      const result = await sendWhatsApp(alert, phone);
      await logDelivery(supabase, {
        alert_id: alert.id,
        channel_type: "whatsapp",
        recipient: phone,
        status: result.ok ? "sent" : "failed",
        response_data: result.data ?? null,
        error_message: result.ok
          ? null
          : result.error ?? "WhatsApp send failed",
        sent_at: result.ok ? new Date().toISOString() : null,
      });
      logged += 1;
    } catch (error) {
      await logDelivery(supabase, {
        alert_id: alert.id,
        channel_type: "whatsapp",
        recipient: phone,
        status: "failed",
        error_message:
          error instanceof Error
            ? error.message
            : "Unexpected WhatsApp error",
      });
      logged += 1;
    }
  }

  return logged;
}

async function sendEmail(
  alert: AlertWithDetails,
  recipients: string[]
): Promise<DeliveryResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const fromAddress =
    Deno.env.get("RESEND_FROM_EMAIL") ?? "Targetspro Alerts <alerts@targetspro.com>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: recipients,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      html: formatAlertEmailHtml(alert),
    }),
  });

  const data = await safeJson(response);

  if (!response.ok) {
    return {
      ok: false,
      data,
      error: (data as { message?: string })?.message ??
        `Resend API error ${response.status}`,
    };
  }

  return { ok: true, data };
}

async function sendTelegram(
  alert: AlertWithDetails,
  chatId: string
): Promise<DeliveryResult> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured" };
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatAlertTelegramText(alert),
        parse_mode: "HTML",
      }),
    }
  );

  const data = await safeJson(response);

  const okField =
    typeof data === "object" && data !== null && "ok" in data
      ? (data as { ok: boolean }).ok
      : response.ok;

  if (!okField) {
    return {
      ok: false,
      data,
      error: (data as { description?: string })?.description ??
        `Telegram API error ${response.status}`,
    };
  }

  return { ok: true, data };
}

async function sendWhatsApp(
  alert: AlertWithDetails,
  phone: string
): Promise<DeliveryResult> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!accessToken || !phoneNumberId) {
    return { ok: false, error: "WhatsApp credentials not configured" };
  }

  const template = formatAlertWhatsAppParams(alert);
  const response = await fetch(
    `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: template.templateName,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: template.params.map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      }),
    }
  );

  const data = await safeJson(response);

  if (!response.ok || (data as { error?: { message?: string } })?.error) {
    return {
      ok: false,
      data,
      error:
        (data as { error?: { message?: string } })?.error?.message ??
        `WhatsApp API error ${response.status}`,
    };
  }

  return { ok: true, data };
}

async function logDelivery(
  supabase: ReturnType<typeof createAdminClient>,
  payload: {
    alert_id: string;
    channel_type: string;
    recipient: string;
    status: "pending" | "sent" | "failed" | "queued";
    response_data?: unknown;
    error_message?: string | null;
    sent_at?: string | null;
  }
) {
  const insertPayload = {
    ...payload,
    response_data: payload.response_data ?? null,
    error_message: payload.error_message ?? null,
    sent_at: payload.sent_at ?? null,
  };

  const { error } = await supabase
    .from("alert_deliveries")
    .insert(insertPayload);

  if (error) {
    console.error("Failed to log alert delivery", error);
  }
}

function describeRecipient(channel: NotificationChannel) {
  if (channel.channel_type === "email" && Array.isArray(channel.config?.recipients)) {
    const recipients = channel.config.recipients as string[];
    return recipients.join(", ") || channel.name;
  }
  if (channel.channel_type === "telegram" && typeof channel.config?.chat_id === "string") {
    return channel.config.chat_id;
  }
  return channel.name;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
