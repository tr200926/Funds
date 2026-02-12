# Phase 4: Alert Engine (Email + Telegram) - Research

**Researched:** 2026-02-12
**Domain:** Supabase Edge Functions (Deno), pg_net database triggers, Resend email API, Telegram Bot API, alert evaluation/deduplication/escalation patterns
**Confidence:** HIGH

## Summary

This phase implements the core alert engine: rule evaluation triggered by database changes, multi-channel notification delivery (Email via Resend + Telegram Bot API), cooldown/deduplication logic, escalation tiers, a scheduled escalation checker, and the dashboard UI for alert rule configuration and alert history with acknowledgment. The schema already exists from Phase 1 (alert_rules, alerts, alert_deliveries, notification_channels tables with full indexes), and Phase 3 provides the dashboard shell with basic alert history display on account detail pages. Phase 4 adds the server-side engine (Edge Functions) and the admin UI.

The primary architectural decision is how to trigger alert evaluation with <60s latency. After researching all options, the recommended approach is **Database Webhooks** (which are a managed convenience wrapper around pg_net triggers). When n8n writes spend_records or balance_snapshots, the existing AFTER INSERT triggers fire, and a new webhook trigger uses pg_net to asynchronously POST to the `evaluate-alerts` Edge Function. This is non-blocking (does not delay the INSERT transaction), supports up to 200 requests/second, and the Edge Function cold start is now ~42ms median (improved 97% in 2025 with persistent storage and Deno 2). Hot function latency is ~125ms. Combined with the trigger overhead (~3% latency increase), total alert evaluation latency from data write to alert creation will be well under 60 seconds.

For notification delivery, Resend provides a simple HTTP API (POST to `https://api.resend.com/emails`) callable directly from Deno with `fetch()` -- no SDK needed. The Telegram Bot API is similarly a plain HTTP POST to `https://api.telegram.org/bot<token>/sendMessage`. Both are ideal for Edge Functions since they require zero npm dependencies. Escalation (promoting unacknowledged alerts after timeout) is handled by a pg_cron scheduled job that invokes an `escalate-alerts` Edge Function every 15 minutes.

**Primary recommendation:** Use Supabase Database Webhooks (pg_net) to trigger an `evaluate-alerts` Edge Function on spend_records/balance_snapshots INSERT. Use Resend for email and raw Telegram Bot API HTTP calls for Telegram, both invoked from a `dispatch-notifications` Edge Function. Use pg_cron + pg_net to schedule an `escalate-alerts` Edge Function every 15 minutes.

## Standard Stack

### Core
| Library/Service | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase Edge Functions | Deno 2.x runtime | Alert evaluation, notification dispatch, escalation | Runs close to data, auto-scaling, <50ms hot latency |
| pg_net extension | Built-in to Supabase | Async HTTP from triggers to Edge Functions | Official Supabase extension, 200 req/s, non-blocking |
| pg_cron extension | Built-in to Supabase | Scheduled escalation checks | Official Supabase extension, cron syntax, zero-config |
| Supabase Vault | Built-in to Supabase | Store service_role_key and API keys securely | Encrypted at rest, accessible from SQL functions |
| Resend API | v1 (HTTP) | Email delivery | Official Supabase integration, simple fetch()-based, free tier 100/day |
| Telegram Bot API | v8.0+ | Telegram message delivery | Plain HTTP POST, no SDK needed, 30 msg/s global limit |
| @supabase/supabase-js | ^2.95+ | Database client in Edge Functions | Already in project, auto-available in Edge Functions |

### Supporting
| Library/Service | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase Realtime | Built-in | Push new alerts to dashboard | Already configured in Phase 3 (alerts table in publication) |
| shadcn/ui components | Latest | Alert rule config UI, alert history UI | Alert rules page, alert list page, acknowledgment dialogs |
| @tanstack/react-table | ^8.x | Alert history DataTable | Sortable, filterable alert list with pagination |
| Zod | ^3.x | Alert rule config validation | Validate JSONB config shapes per rule_type |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Database Webhooks (pg_net) | Supabase Realtime subscription | Realtime requires an always-on listener; pg_net is fire-and-forget per transaction -- simpler, more reliable |
| Database Webhooks (pg_net) | n8n polling for new data | Adds latency (polling interval), adds n8n dependency to alerting path |
| Database Webhooks (pg_net) | pg_notify + listener | pg_notify requires a persistent listener process; Edge Functions are stateless -- bad fit |
| Resend | Nodemailer/SMTP direct | SMTP blocked on ports 25/587 in Edge Functions; Resend uses HTTPS |
| Resend | SendGrid / Mailgun | Resend has official Supabase integration guide, simpler API, generous free tier |
| Raw Telegram fetch() | gramio / telegraf library | Unnecessary dependency for sendMessage; fetch() is 5 lines of code |
| pg_cron for escalation | Edge Function self-scheduling | pg_cron is more reliable; self-scheduling adds complexity and failure modes |

**Installation (Edge Functions -- no npm install needed):**
```bash
# Create Edge Functions
npx supabase functions new evaluate-alerts
npx supabase functions new dispatch-notifications
npx supabase functions new escalate-alerts

# Set secrets (on hosted Supabase)
npx supabase secrets set RESEND_API_KEY=re_xxxxx
npx supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC-DEF
npx supabase secrets set TELEGRAM_CHAT_ID=-100xxxxxxxxx

# Deploy
npx supabase functions deploy evaluate-alerts
npx supabase functions deploy dispatch-notifications
npx supabase functions deploy escalate-alerts
```

**Dashboard UI additions (in existing dashboard/ directory):**
```bash
cd dashboard
npx shadcn@latest add switch slider form label textarea radio-group toast alert-dialog
npm install zod
```

## Architecture Patterns

### Recommended Project Structure
```
supabase/
  functions/
    evaluate-alerts/
      index.ts              # Main alert evaluation logic
    dispatch-notifications/
      index.ts              # Multi-channel notification dispatch
    escalate-alerts/
      index.ts              # Scheduled escalation checker
    _shared/
      supabase-client.ts    # Shared Supabase admin client factory
      alert-evaluators.ts   # Rule evaluation functions per rule_type
      notification-formatters.ts  # Format messages for email/telegram
      types.ts              # Shared alert types
      constants.ts          # Severity ordering, default cooldowns
  migrations/
    YYYYMMDD_alert_engine_triggers.sql  # Database webhook triggers
    YYYYMMDD_alert_engine_cron.sql      # pg_cron escalation schedule
    YYYYMMDD_vault_secrets.sql          # Store API keys in Vault

dashboard/
  src/
    app/(dashboard)/
      alerts/
        page.tsx            # Alert history list with filters
        rules/
          page.tsx          # Alert rules management (CRUD)
        layout.tsx          # Alerts section layout
      settings/
        notifications/
          page.tsx          # Notification channel config
    components/
      alerts/
        alert-list.tsx        # Alert history DataTable
        alert-detail-dialog.tsx # Alert detail + acknowledge
        alert-rule-form.tsx   # Create/edit alert rule form
        alert-rule-list.tsx   # Alert rules DataTable
        severity-badge.tsx    # Colored severity indicator
      notifications/
        channel-form.tsx      # Add/edit notification channel
        channel-list.tsx      # Notification channels list
    lib/
      validators/
        alert-rules.ts       # Zod schemas per rule_type
```

### Pattern 1: Database Webhook -> Edge Function (Alert Trigger Chain)
**What:** When new data arrives (spend_records or balance_snapshots INSERT), a database trigger uses pg_net to asynchronously call the `evaluate-alerts` Edge Function.
**When to use:** Every time new financial data is written by the n8n pipeline.
**Example:**
```sql
-- Source: https://supabase.com/docs/guides/database/extensions/pg_net
-- Source: https://tomaspozo.com/articles/secure-api-calls-supabase-pg-net-vault

-- Step 1: Store secrets in Vault (run once via Dashboard or migration)
SELECT vault.create_secret(
  'https://<project-ref>.supabase.co',
  'supabase_url'
);
SELECT vault.create_secret(
  '<service-role-key>',
  'service_role_key'
);

-- Step 2: Create trigger function
CREATE OR REPLACE FUNCTION public.invoke_alert_evaluation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _url TEXT;
  _key TEXT;
BEGIN
  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  PERFORM net.http_post(
    url := _url || '/functions/v1/evaluate-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'record_id', NEW.id,
      'ad_account_id', NEW.ad_account_id,
      'org_id', NEW.org_id
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- Step 3: Attach triggers (AFTER INSERT, not before -- so the data is committed)
CREATE TRIGGER on_spend_record_evaluate_alerts
  AFTER INSERT ON spend_records
  FOR EACH ROW
  EXECUTE FUNCTION public.invoke_alert_evaluation();

CREATE TRIGGER on_balance_snapshot_evaluate_alerts
  AFTER INSERT ON balance_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.invoke_alert_evaluation();
```

### Pattern 2: Edge Function Alert Evaluation (evaluate-alerts)
**What:** Receives trigger payload, loads active rules for the account, evaluates each rule, checks cooldown, creates alerts, and calls dispatch-notifications.
**When to use:** Invoked automatically by database triggers.
**Example:**
```typescript
// Source: https://supabase.com/docs/guides/functions/quickstart
// supabase/functions/evaluate-alerts/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TriggerPayload {
  table: string
  record_id: string
  ad_account_id: string
  org_id: string
}

Deno.serve(async (req) => {
  const payload: TriggerPayload = await req.json()
  const { ad_account_id, org_id } = payload

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Load active rules for this account (specific + org-wide)
  const { data: rules } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('org_id', org_id)
    .eq('is_active', true)
    .or(`ad_account_id.eq.${ad_account_id},ad_account_id.is.null`)

  // 2. Load current account data (denormalized fields are already updated by prior trigger)
  const { data: account } = await supabase
    .from('ad_accounts')
    .select('*')
    .eq('id', ad_account_id)
    .single()

  if (!rules || !account) {
    return new Response(JSON.stringify({ evaluated: 0 }), { status: 200 })
  }

  let alertsCreated = 0

  for (const rule of rules) {
    const result = await evaluateRule(supabase, rule, account)
    if (!result.triggered) continue

    // 3. Cooldown check
    const { data: inCooldown } = await supabase.rpc('is_alert_in_cooldown', {
      p_ad_account_id: ad_account_id,
      p_alert_rule_id: rule.id,
      p_cooldown_minutes: rule.cooldown_minutes,
    })
    if (inCooldown) continue

    // 4. Create alert
    const { data: alert } = await supabase
      .from('alerts')
      .insert({
        org_id,
        ad_account_id,
        alert_rule_id: rule.id,
        severity: rule.severity,
        title: result.title,
        message: result.message,
        context_data: result.context,
      })
      .select('id')
      .single()

    if (alert) {
      alertsCreated++
      // 5. Invoke dispatch-notifications (fire-and-forget via fetch)
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ alert_id: alert.id }),
      })
      // intentionally not awaited -- fire-and-forget
    }
  }

  return new Response(
    JSON.stringify({ evaluated: rules.length, alerts_created: alertsCreated }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
```

### Pattern 3: Notification Dispatch (dispatch-notifications)
**What:** Receives an alert_id, determines which channels to notify based on severity and channel config, formats messages, sends via Resend/Telegram, logs deliveries.
**When to use:** Called by evaluate-alerts after creating an alert, or for retry of failed deliveries.
**Example:**
```typescript
// supabase/functions/dispatch-notifications/index.ts

Deno.serve(async (req) => {
  const { alert_id } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Load alert + rule + account
  const { data: alert } = await supabase
    .from('alerts')
    .select('*, alert_rules(*), ad_accounts(*)')
    .eq('id', alert_id)
    .single()

  if (!alert) return new Response('Alert not found', { status: 404 })

  // Severity ordering for min_severity filtering
  const SEVERITY_ORDER = { info: 0, warning: 1, critical: 2, emergency: 3 }
  const alertSeverityLevel = SEVERITY_ORDER[alert.severity]

  // Load eligible channels
  const { data: channels } = await supabase
    .from('notification_channels')
    .select('*')
    .eq('org_id', alert.org_id)
    .eq('is_enabled', true)

  for (const channel of channels ?? []) {
    const channelMinLevel = SEVERITY_ORDER[channel.min_severity]
    if (alertSeverityLevel < channelMinLevel) continue

    // Quiet hours check (emergency bypasses)
    if (alert.severity !== 'emergency' && isInQuietHours(channel.active_hours)) {
      // Queue for later delivery
      await supabase.from('alert_deliveries').insert({
        alert_id,
        channel_type: channel.channel_type,
        recipient: getRecipient(channel),
        status: 'queued',
      })
      continue
    }

    // Dispatch based on channel type
    let deliveryStatus = 'failed'
    let responseData = null
    let errorMessage = null

    try {
      if (channel.channel_type === 'email') {
        const result = await sendEmail(alert, channel)
        deliveryStatus = result.ok ? 'sent' : 'failed'
        responseData = result.data
        errorMessage = result.error
      } else if (channel.channel_type === 'telegram') {
        const result = await sendTelegram(alert, channel)
        deliveryStatus = result.ok ? 'sent' : 'failed'
        responseData = result.data
        errorMessage = result.error
      }
    } catch (e) {
      errorMessage = e.message
    }

    // Log delivery attempt
    await supabase.from('alert_deliveries').insert({
      alert_id,
      channel_type: channel.channel_type,
      recipient: getRecipient(channel),
      status: deliveryStatus,
      response_data: responseData,
      error_message: errorMessage,
      sent_at: deliveryStatus === 'sent' ? new Date().toISOString() : null,
    })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
```

### Pattern 4: Scheduled Escalation (pg_cron + escalate-alerts)
**What:** Every 15 minutes, pg_cron invokes `escalate-alerts` Edge Function which promotes unacknowledged alerts past their escalation timeout.
**When to use:** Continuous background process.
**Example:**
```sql
-- Source: https://supabase.com/docs/guides/functions/schedule-functions

SELECT cron.schedule(
  'escalate-alerts-check',
  '*/15 * * * *',  -- every 15 minutes
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
           || '/functions/v1/escalate-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"source": "pg_cron"}'::jsonb
  ) AS request_id;
  $$
);
```

### Anti-Patterns to Avoid
- **Synchronous notification sending in triggers:** Never call external APIs (Resend, Telegram) directly from PostgreSQL triggers. Use pg_net for async handoff to Edge Functions.
- **Business logic in n8n for alerting:** Alert evaluation must happen in Edge Functions / database, not in n8n workflows. n8n should only write data; alerting is data-driven from the database layer.
- **Hardcoded API keys in trigger functions:** Store all secrets in Supabase Vault. Never embed service_role_key or API tokens directly in SQL.
- **Blocking dispatch on all channels before responding:** Use fire-and-forget pattern for dispatch-notifications call from evaluate-alerts. If one channel is slow, it should not delay other alert evaluations.
- **Using SMTP ports (25/587) from Edge Functions:** Supabase Edge Functions block outbound ports 25 and 587. Use Resend's HTTPS API instead of raw SMTP.
- **Evaluating rules on UPDATE triggers:** Only evaluate on INSERT to spend_records and balance_snapshots. The UPDATE trigger on spend_records (UPSERT) could also fire, but the existing schema uses `AFTER INSERT OR UPDATE` for denormalization -- alert evaluation should be INSERT-only to avoid double evaluation on re-pulled data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery | Custom SMTP client | Resend API (HTTPS POST) | SMTP ports blocked in Edge Functions; Resend handles deliverability, bounces, reputation |
| Telegram messaging | Custom bot framework | Raw `fetch()` to Bot API | sendMessage is a single HTTP POST; no framework needed for one-way notifications |
| Scheduled jobs | Custom setTimeout/setInterval loops | pg_cron + pg_net | Survives function cold starts, restarts; managed by PostgreSQL |
| Secret storage | Environment variables in SQL | Supabase Vault | Encrypted at rest, accessible from triggers without exposing in code |
| Alert deduplication | Custom in-memory tracking | SQL cooldown check (is_alert_in_cooldown RPC) | Already exists in Phase 1 schema; database is the source of truth |
| Time-to-depletion calculation | JavaScript math in Edge Function | SQL function (calculate_time_to_depletion RPC) | Already exists in Phase 1 schema; runs close to data, uses indexes |
| Form validation | Manual if/else checking | Zod schemas per rule_type | Type-safe, composable, reusable between client and server |
| Severity ordering/comparison | String comparison | Numeric map constant | "warning" > "info" is not alphabetical; use { info: 0, warning: 1, critical: 2, emergency: 3 } |

**Key insight:** The Phase 1 schema already provides `is_alert_in_cooldown` and `calculate_time_to_depletion` as database functions. The alert engine should call these via Supabase RPC rather than reimplementing the logic in TypeScript.

## Common Pitfalls

### Pitfall 1: pg_net Requests Execute After Transaction Commit
**What goes wrong:** The pg_net HTTP request is queued and only sent after the INSERT transaction commits. If the trigger function throws an error after the PERFORM net.http_post() call, the request may or may not fire depending on whether the transaction commits.
**Why it happens:** pg_net is designed to be non-blocking; requests are batched and sent asynchronously after commit.
**How to avoid:** Keep trigger functions simple -- just build the payload and call net.http_post(). Don't do complex logic that might fail after the HTTP call is queued. Validate assumptions before the http_post call.
**Warning signs:** Alerts not firing despite data being inserted. Check `net._http_response` table for queued/failed requests.

### Pitfall 2: Edge Function Cold Starts Adding Latency
**What goes wrong:** If the Edge Function hasn't been called recently, cold start adds latency. With Supabase's 2025 improvements, median cold start is ~42ms, but worst case (P99) is under 500ms.
**Why it happens:** V8 isolate needs to be spun up for first request in a region.
**How to avoid:** Keep functions small (under 20MB bundled). Use the pg_cron escalation job as a natural "keep warm" mechanism (it invokes every 15 min). For critical latency requirements, the data path (trigger -> evaluate -> create alert) is typically under 2 seconds total.
**Warning signs:** Intermittent slow alert evaluation. Monitor via Supabase dashboard Edge Function logs.

### Pitfall 3: Denormalized Fields Not Yet Updated When Alert Evaluates
**What goes wrong:** The alert evaluation trigger fires on balance_snapshots INSERT, but the denormalized `current_balance` on ad_accounts might not be updated yet because both triggers fire on the same INSERT event.
**Why it happens:** PostgreSQL trigger execution order is alphabetical by trigger name within the same event. If `on_balance_snapshot_insert` (denormalize) runs before `on_balance_snapshot_evaluate_alerts` (alert trigger), it works. But the alert Edge Function runs asynchronously after the transaction commits, so by then the denormalization trigger has already completed.
**How to avoid:** Since pg_net requests only execute after transaction commit, ALL synchronous triggers (including denormalization) will have completed by the time the Edge Function receives the request. This is actually a feature of pg_net's async nature. No special ordering needed.
**Warning signs:** None expected -- this is a non-issue thanks to pg_net's post-commit execution. Document this in code comments so future developers don't worry about it.

### Pitfall 4: Duplicate Alert Evaluation from spend_records UPSERT
**What goes wrong:** When n8n re-pulls data for the same day, the UPSERT on spend_records triggers both the INSERT and UPDATE paths. The denormalization trigger fires on `AFTER INSERT OR UPDATE`, so it works correctly. But if the alert evaluation trigger also fires on UPDATE, the same account gets evaluated twice.
**Why it happens:** The existing trigger `on_spend_record_upsert` uses `AFTER INSERT OR UPDATE`. A new alert evaluation trigger needs to be careful about which events it fires on.
**How to avoid:** Create the alert evaluation trigger as `AFTER INSERT` only on spend_records (not `AFTER INSERT OR UPDATE`). For balance_snapshots, it's always INSERT (append-only table), so this is not an issue there.
**Warning signs:** Double evaluation logged in Edge Function responses; duplicate alert creation attempts (caught by cooldown).

### Pitfall 5: Resend Daily Limit on Free Tier
**What goes wrong:** Resend free tier allows only 100 emails per day and 3,000 per month. A spike in alerts could exhaust the daily limit.
**Why it happens:** Multiple accounts triggering alerts simultaneously during a market event or budget cycle.
**How to avoid:** Implement email delivery rate awareness in dispatch-notifications. Log failed deliveries with error "rate_limited" status. If email fails, Telegram should still succeed (different service). Consider upgrading to Resend Pro ($20/month for 50,000 emails) if alert volume justifies it.
**Warning signs:** Resend API returning 429 status codes. Check alert_deliveries table for `status = 'failed'` with rate limit errors.

### Pitfall 6: Telegram Bot Token Exposure
**What goes wrong:** Telegram bot token embedded in environment variables or code gets exposed.
**Why it happens:** Bot tokens are long-lived and grant full bot control.
**How to avoid:** Store TELEGRAM_BOT_TOKEN in Supabase Edge Function secrets (not in code, not in Vault for SQL access -- only Edge Functions need it). The token format is `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`. Treat it like a password.
**Warning signs:** Unauthorized messages from your bot. Telegram's @BotFather can revoke tokens.

### Pitfall 7: Quiet Hours Timezone Confusion
**What goes wrong:** Quiet hours check uses wrong timezone, resulting in alerts being suppressed during business hours or sent during sleep.
**Why it happens:** All timestamps stored in UTC, but quiet hours are defined in local time (Africa/Cairo, UTC+2).
**How to avoid:** The `active_hours` JSONB on notification_channels should include the timezone: `{"start": "00:00", "end": "08:00", "timezone": "Africa/Cairo"}`. In the Edge Function, use `new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })` to get the current Cairo time for comparison.
**Warning signs:** Alerts arriving at unexpected times. Test with explicit timezone values.

## Code Examples

Verified patterns from official sources:

### Sending Email via Resend
```typescript
// Source: https://resend.com/docs/send-with-supabase-edge-functions
// Source: https://supabase.com/docs/guides/functions/examples/send-emails

async function sendEmail(
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const recipients = channel.config.recipients as string[] // e.g., ["ops@targetspro.com"]

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Targetspro Alerts <alerts@targetspro.com>',  // Must be verified domain
      to: recipients,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      html: formatAlertEmailHtml(alert),
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return { ok: false, data, error: data.message || `HTTP ${res.status}` }
  }
  return { ok: true, data }
}
```

### Sending Telegram Message
```typescript
// Source: https://core.telegram.org/bots/api#sendmessage

async function sendTelegram(
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = channel.config.chat_id as string // e.g., "-100123456789"

  const text = formatAlertTelegramText(alert)

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',  // Supports <b>, <i>, <code>, <a href="...">
      }),
    }
  )

  const data = await res.json()
  if (!data.ok) {
    return { ok: false, data, error: data.description || 'Telegram API error' }
  }
  return { ok: true, data }
}

function formatAlertTelegramText(alert: AlertWithDetails): string {
  const severityEmoji: Record<string, string> = {
    info: '\u2139\uFE0F',      // information
    warning: '\u26A0\uFE0F',   // warning
    critical: '\uD83D\uDD34',  // red circle
    emergency: '\uD83D\uDEA8', // rotating light
  }
  const emoji = severityEmoji[alert.severity] || ''

  return [
    `${emoji} <b>${alert.severity.toUpperCase()}: ${alert.title}</b>`,
    ``,
    alert.message,
    ``,
    `Account: <b>${alert.ad_accounts?.account_name}</b>`,
    `Platform: ${alert.ad_accounts?.platform_id}`,
    alert.context_data?.balance !== undefined
      ? `Balance: ${alert.ad_accounts?.currency} ${alert.context_data.balance}`
      : null,
    alert.context_data?.days_remaining !== undefined
      ? `Days remaining: ${alert.context_data.days_remaining}`
      : null,
    ``,
    `Time: ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })}`,
  ]
    .filter(Boolean)
    .join('\n')
}
```

### Rule Evaluation per Type
```typescript
// supabase/functions/_shared/alert-evaluators.ts

interface EvalResult {
  triggered: boolean
  title: string
  message: string
  context: Record<string, unknown>
}

async function evaluateRule(
  supabase: SupabaseClient,
  rule: AlertRule,
  account: AdAccount
): Promise<EvalResult> {
  const config = rule.config as Record<string, unknown>

  switch (rule.rule_type) {
    case 'balance_threshold': {
      const balance = Number(account.current_balance) || 0
      const threshold = Number(config.threshold_value) || 0
      return {
        triggered: balance <= threshold,
        title: `Low Balance: ${account.account_name}`,
        message: `Balance is ${account.currency} ${balance.toLocaleString()} (threshold: ${threshold.toLocaleString()})`,
        context: { balance, threshold, currency: account.currency },
      }
    }

    case 'time_to_depletion': {
      const lookbackDays = Number(config.lookback_days) || 7
      const daysThreshold = Number(config.days_remaining) || 3
      const { data: daysRemaining } = await supabase.rpc(
        'calculate_time_to_depletion',
        { p_ad_account_id: account.id, p_lookback_days: lookbackDays }
      )
      return {
        triggered: daysRemaining !== null && Number(daysRemaining) <= daysThreshold,
        title: `Funds Depleting: ${account.account_name}`,
        message: `Estimated ${daysRemaining} days remaining (threshold: ${daysThreshold} days)`,
        context: { days_remaining: daysRemaining, threshold_days: daysThreshold },
      }
    }

    case 'spend_spike': {
      const lookbackDays = Number(config.lookback_days) || 7
      const pctIncrease = Number(config.percentage_increase) || 50
      const { data: recentSpend } = await supabase
        .from('spend_records')
        .select('daily_spend')
        .eq('ad_account_id', account.id)
        .gte('date', new Date(Date.now() - lookbackDays * 86400000).toISOString().split('T')[0])
        .order('date', { ascending: false })

      if (!recentSpend || recentSpend.length < 2) {
        return { triggered: false, title: '', message: '', context: {} }
      }

      const todaySpend = Number(recentSpend[0].daily_spend) || 0
      const avgSpend =
        recentSpend.slice(1).reduce((s, r) => s + (Number(r.daily_spend) || 0), 0) /
        (recentSpend.length - 1)
      const pctChange = avgSpend > 0 ? ((todaySpend - avgSpend) / avgSpend) * 100 : 0

      return {
        triggered: pctChange >= pctIncrease,
        title: `Spend Spike: ${account.account_name}`,
        message: `Daily spend ${account.currency} ${todaySpend.toLocaleString()} is ${pctChange.toFixed(0)}% above ${lookbackDays}-day average (${account.currency} ${avgSpend.toLocaleString()})`,
        context: { today_spend: todaySpend, avg_spend: avgSpend, pct_change: pctChange },
      }
    }

    case 'zero_spend': {
      const consecutiveDays = Number(config.consecutive_days) || 2
      const { data: recentSpend } = await supabase
        .from('spend_records')
        .select('daily_spend, date')
        .eq('ad_account_id', account.id)
        .order('date', { ascending: false })
        .limit(consecutiveDays)

      const zeroCount = (recentSpend ?? []).filter(
        (r) => Number(r.daily_spend) === 0
      ).length

      return {
        triggered: zeroCount >= consecutiveDays,
        title: `Zero Spend: ${account.account_name}`,
        message: `Account has had zero spend for ${zeroCount} consecutive days`,
        context: { consecutive_zero_days: zeroCount, threshold_days: consecutiveDays },
      }
    }

    case 'account_status_change': {
      // This is triggered differently -- needs comparison with previous status
      // Best handled by an UPDATE trigger on ad_accounts.status, not spend/balance INSERT
      // Store previous status in context_data when status changes
      return { triggered: false, title: '', message: '', context: {} }
    }

    default:
      return { triggered: false, title: '', message: '', context: {} }
  }
}
```

### Quiet Hours Check
```typescript
function isInQuietHours(activeHours: { start: string; end: string; timezone: string } | null): boolean {
  if (!activeHours) return false  // null = 24/7, no quiet hours

  const { start, end, timezone } = activeHours
  const now = new Date()
  const cairoTime = now.toLocaleTimeString('en-GB', {
    timeZone: timezone || 'Africa/Cairo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })  // e.g., "03:45"

  // If start < end: quiet hours are start-end (e.g., 00:00-08:00)
  // If start > end: quiet hours wrap midnight (e.g., 22:00-06:00)
  if (start <= end) {
    return cairoTime >= start && cairoTime < end
  } else {
    return cairoTime >= start || cairoTime < end
  }
}
```

### Alert Rule Config Zod Schemas
```typescript
// dashboard/src/lib/validators/alert-rules.ts
import { z } from 'zod'

const balanceThresholdConfig = z.object({
  threshold_value: z.number().positive('Threshold must be positive'),
  currency: z.string().default('EGP'),
})

const spendSpikeConfig = z.object({
  percentage_increase: z.number().min(10).max(500),
  lookback_days: z.number().min(2).max(30).default(7),
})

const timeToDepletionConfig = z.object({
  days_remaining: z.number().min(1).max(30).default(3),
  lookback_days: z.number().min(3).max(30).default(7),
})

const zeroSpendConfig = z.object({
  consecutive_days: z.number().min(1).max(14).default(2),
})

const accountStatusChangeConfig = z.object({
  // No additional config needed -- triggers on any status change
})

export const alertRuleConfigSchema = z.discriminatedUnion('rule_type', [
  z.object({ rule_type: z.literal('balance_threshold'), config: balanceThresholdConfig }),
  z.object({ rule_type: z.literal('spend_spike'), config: spendSpikeConfig }),
  z.object({ rule_type: z.literal('time_to_depletion'), config: timeToDepletionConfig }),
  z.object({ rule_type: z.literal('zero_spend'), config: zeroSpendConfig }),
  z.object({ rule_type: z.literal('account_status_change'), config: accountStatusChangeConfig }),
])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Edge Function cold start ~870ms | Cold start ~42ms (97% faster) | 2025 (persistent storage + Deno 2) | Alert latency is now well within <60s requirement |
| Supabase auth-helpers package | @supabase/ssr package | 2024 | Already adopted in Phase 3 |
| pg_net manual trigger SQL | Database Webhooks (Dashboard UI) | 2024 | Can configure webhooks via UI or SQL; both use pg_net underneath |
| SMTP from Edge Functions | HTTPS-based email APIs (Resend) | Ongoing | Ports 25/587 blocked; must use HTTPS-based providers |
| Telegram Bot API fixed 30/s limit | Adaptive rate limits (API 8.0+) | Nov 2025 | New `adaptive_retry` field in 429 responses; bot reputation affects limits |

**Deprecated/outdated:**
- **pgsodium extension:** Pending deprecation, but Vault (which uses pgsodium internally) will NOT be affected -- its API remains stable. No action needed.
- **Supabase auth-helpers:** Deprecated in favor of `@supabase/ssr`. Phase 3 already uses the correct package.

## Open Questions

1. **Account Status Change Detection**
   - What we know: The alert_rules schema supports `account_status_change` rule_type. The trigger chain fires on spend_records/balance_snapshots INSERT.
   - What's unclear: Account status changes come from n8n updating ad_accounts.status, not from spend/balance inserts. A separate trigger on `ad_accounts` UPDATE (watching for status column changes) is needed.
   - Recommendation: Add a separate `AFTER UPDATE` trigger on `ad_accounts` that only fires when `OLD.status IS DISTINCT FROM NEW.status`, then calls the evaluate-alerts Edge Function with the account's org_id and id. This is a small migration addition.

2. **Resend Domain Verification**
   - What we know: Resend requires sending domain verification (DNS records) for production use. The free tier uses `onboarding@resend.dev` as the sender.
   - What's unclear: Whether targetspro.com DNS is managed by the team and how quickly verification can be completed.
   - Recommendation: Start with Resend's test sender during development. Plan a task to verify the production domain before go-live.

3. **Telegram Bot Setup**
   - What we know: A Telegram bot needs to be created via @BotFather, added to the target group/channel, and its chat_id configured.
   - What's unclear: Whether the team already has a Telegram bot or group set up, and who the target audience is (ops team group chat? individual managers?).
   - Recommendation: Include a setup task in the plan that documents: (1) create bot via BotFather, (2) add to group, (3) get chat_id, (4) store in Edge Function secrets. This is a manual operations task.

4. **Spend Anomaly Rule Type**
   - What we know: The schema includes `spend_anomaly` as a rule_type (uses standard deviation from historical pattern).
   - What's unclear: The exact algorithm (Z-score? percentage of std dev?), minimum data required, and how to handle new accounts with little history.
   - Recommendation: Implement as a future enhancement. Focus on the 5 core rule types first. The schema already supports it; only the evaluator function needs to be added later.

5. **Alert Acknowledgment from Telegram**
   - What we know: Telegram Bot API supports inline keyboards and callback queries, allowing users to tap "Acknowledge" directly in the chat.
   - What's unclear: Whether this is needed for MVP or can be deferred.
   - Recommendation: Defer to Phase 5. For now, acknowledgment happens only in the dashboard UI. The Telegram message can include a link to the dashboard alert page.

## Sources

### Primary (HIGH confidence)
- [Supabase pg_net Extension Docs](https://supabase.com/docs/guides/database/extensions/pg_net) - API reference, rate limits (200 req/s), response debugging
- [Supabase Database Webhooks Docs](https://supabase.com/docs/guides/database/webhooks) - Webhook setup, payload format, Edge Function integration
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions) - Quickstart, architecture, Deno.serve pattern
- [Supabase Edge Functions Limits](https://supabase.com/docs/guides/functions/limits) - 256MB memory, 2s CPU, 150s/400s wall clock, 100 secrets
- [Supabase Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) - pg_cron + pg_net + Vault pattern
- [Supabase Edge Functions Environment Variables](https://supabase.com/docs/guides/functions/secrets) - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY auto-populated
- [Resend + Supabase Edge Functions](https://resend.com/docs/send-with-supabase-edge-functions) - Official integration, complete code example
- [Supabase Send Emails Guide](https://supabase.com/docs/guides/functions/examples/send-emails) - Resend deployment with Edge Functions
- [Telegram Bot API Reference](https://core.telegram.org/bots/api) - sendMessage params, auth, response format
- [Supabase Edge Functions Persistent Storage & Faster Cold Starts](https://supabase.com/blog/persistent-storage-for-faster-edge-functions) - 97% cold start improvement in 2025

### Secondary (MEDIUM confidence)
- [Secure API Calls from DB Functions with Vault](https://tomaspozo.com/articles/secure-api-calls-supabase-pg-net-vault) - Vault secret retrieval pattern for pg_net triggers
- [Supabase Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture) - V8 isolates, ESZip, global distribution
- [Resend Pricing](https://resend.com/pricing) - Free tier: 100/day, 3,000/month; Pro: $20/mo for 50,000
- [Telegram Bot API Rate Limits](https://core.telegram.org/bots/faq) - 30 msg/s global, 1 msg/s per chat, adaptive in API 8.0+
- [Grafana Alerting Best Practices](https://grafana.com/docs/grafana/latest/alerting/guides/best-practices/) - Cooldown, deduplication, escalation patterns
- [Benchmarking pg_net Part 1](https://blog.sequinstream.com/benchmarking-pg_net-part-1/) - 900+ req/s on bare metal, 200 req/s managed
- [Supabase Vault Tutorial](https://makerkit.dev/blog/tutorials/supabase-vault) - Vault encrypted secret storage pattern

### Tertiary (LOW confidence)
- [Supabase pg_net Silent Failure Discussion #37591](https://github.com/orgs/supabase/discussions/37591) - Edge Function auth issues from pg_net triggers
- [Calling Edge Functions from Postgres Discussion #28341](https://github.com/orgs/supabase/discussions/28341) - Community patterns for trigger-to-function calls

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components verified with official documentation; Resend and Telegram APIs are simple HTTP, well-documented
- Architecture (trigger -> Edge Function chain): HIGH - Official pg_net docs + Database Webhooks docs confirm this pattern; pg_cron scheduling pattern from official Supabase guide
- Alert evaluation logic: HIGH - Rule types, cooldown, deduplication patterns well-established; existing database functions (is_alert_in_cooldown, calculate_time_to_depletion) from Phase 1 are verified
- Edge Function performance: HIGH - 2025 cold start improvements verified from Supabase blog; median hot latency 125ms confirmed from multiple sources
- Pitfalls: MEDIUM - Based on community discussions and general alerting system design experience; quiet hours timezone handling is a known class of bug
- UI components: HIGH - Phase 3 established the shadcn/ui + DataTable pattern; alert pages follow the same conventions

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - Supabase Edge Functions and pg_net are stable; Resend and Telegram APIs are stable)
