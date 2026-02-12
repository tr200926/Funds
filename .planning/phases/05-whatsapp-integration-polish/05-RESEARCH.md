# Phase 5: WhatsApp Integration & Polish - Research

**Researched:** 2026-02-12
**Domain:** WhatsApp Cloud API (Meta Graph API), message template management, per-user opt-in notification preferences, Supabase Edge Functions (Deno) extension for new channel
**Confidence:** HIGH

## Summary

This phase adds WhatsApp as a third notification channel to the existing alert engine built in Phase 4. The architecture is deliberately minimal: the `dispatch-notifications` Edge Function already has a switch statement dispatching per `channel_type`, the `notification_channels` table already accepts `'whatsapp'` as a valid `channel_type`, and the `alert_deliveries` table already tracks `'whatsapp'` deliveries. The core work is: (1) implement the WhatsApp Cloud API HTTP call in the dispatch function, (2) create and get Meta-approved message templates for three alert types, (3) build per-user opt-in preferences so individual users can enable/disable WhatsApp alerts, and (4) add WhatsApp as a channel option in the dashboard notification settings UI.

WhatsApp Cloud API is a plain HTTP POST to `https://graph.facebook.com/v{VERSION}/{PHONE_NUMBER_ID}/messages` with a Bearer token -- identical in pattern to the Resend and Telegram calls already implemented. No SDK is needed. The only significant difference from other channels is that WhatsApp requires pre-approved message templates (you cannot send free-form text to initiate a conversation), and there is a per-message cost (~$0.0036 USD per utility message in Egypt as of January 2026).

The "polish" portion of this phase covers per-user notification preferences (stored in `profiles.settings` JSONB), a WhatsApp channel configuration form in the dashboard, and template submission/approval workflow documentation. There is no new Edge Function to create -- just extending the existing `dispatch-notifications` function with a `'whatsapp'` case.

**Primary recommendation:** Add a `sendWhatsApp()` function to the existing `dispatch-notifications` Edge Function that POSTs to the WhatsApp Cloud API using a permanent System User access token. Submit three utility-category templates to Meta for approval before writing code. Build per-user opt-in as a JSONB field on `profiles.settings` with a simple UI toggle on the user settings page.

## Standard Stack

### Core
| Library/Service | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WhatsApp Cloud API (Meta Graph API) | v23.0 | Send template messages via HTTP POST | Official Meta API; same Graph API version as Facebook ingestion (Phase 2); plain fetch() call from Deno |
| Supabase Edge Functions (Deno 2.x) | Existing | Extend dispatch-notifications with WhatsApp case | Already deployed in Phase 4; no new function needed |
| Meta Business Manager | N/A | Template creation, phone number registration, System User token | Required for WhatsApp Business Platform access; Targetspro already has a Meta Business account for Facebook API |

### Supporting
| Library/Service | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Meta WhatsApp Manager UI | N/A | Create and submit message templates for approval | Before coding -- templates must be approved first |
| Supabase Vault | Built-in | Store WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID | Same pattern as Resend/Telegram secrets from Phase 4 |
| shadcn/ui components | Existing | WhatsApp channel form, user preference toggles | Dashboard UI for channel config and opt-in |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw fetch() to Graph API | Official WhatsApp Node.js SDK (`whatsapp` npm) | SDK is **archived** (project discontinued by Meta); not Deno-compatible; fetch() is 15 lines of code -- no SDK needed |
| Raw fetch() to Graph API | Third-party BSP (Twilio, MessageBird, etc.) | Adds middleman cost + dependency; Cloud API direct is cheaper and simpler for low-volume alerting |
| Per-user profiles.settings JSONB | Separate user_notification_preferences table | Over-engineering for ~5-10 users; JSONB on profiles is sufficient and already exists |
| Meta WhatsApp Manager UI for templates | Business Management API (POST to /message_templates) | API-based template creation adds complexity; Manager UI is simpler for 3 templates |

**Installation:**
```bash
# No new packages needed -- WhatsApp is a fetch() call from existing Edge Function

# Set Edge Function secrets (after obtaining from Meta Business Manager)
npx supabase secrets set WHATSAPP_ACCESS_TOKEN=EAA...
npx supabase secrets set WHATSAPP_PHONE_NUMBER_ID=123456789012345
```

## Architecture Patterns

### Recommended Project Structure
```
supabase/
  functions/
    dispatch-notifications/
      index.ts              # ADD: 'whatsapp' case to existing channel switch
    _shared/
      notification-formatters.ts  # ADD: formatAlertWhatsAppParams() helper
      types.ts              # ADD: WhatsAppTemplateConfig type
  migrations/
    YYYYMMDD_whatsapp_user_preferences.sql  # Per-user opt-in fields + profile settings defaults

dashboard/
  src/
    app/(dashboard)/
      settings/
        notifications/
          page.tsx          # EXTEND: Add 'whatsapp' to channel type selector
        profile/
          page.tsx          # ADD or EXTEND: Personal notification preferences with WhatsApp opt-in toggle
    components/
      notifications/
        channel-form.tsx    # EXTEND: Add WhatsApp config fields (phone_number_id is org-level)
        whatsapp-opt-in.tsx # NEW: Per-user WhatsApp opt-in toggle component
    lib/
      validators/
        notification-channels.ts  # EXTEND: Add WhatsApp channel validation
```

### Pattern 1: WhatsApp Template Message Sending (fetch-based)
**What:** Send a pre-approved template message via the WhatsApp Cloud API. The API endpoint is the same Graph API used for Facebook in Phase 2.
**When to use:** Every time dispatch-notifications handles a `channel_type === 'whatsapp'` delivery.
**Example:**
```typescript
// Source: Meta WhatsApp Cloud API docs + existing tech.md research
// Added to: supabase/functions/dispatch-notifications/index.ts

async function sendWhatsApp(
  alert: AlertWithDetails,
  channel: NotificationChannel
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')

  if (!accessToken || !phoneNumberId) {
    return { ok: false, error: 'WhatsApp credentials not configured' }
  }

  // Determine template name based on alert severity/context
  const templateName = getWhatsAppTemplateName(alert)
  const templateParams = getWhatsAppTemplateParams(alert)

  const res = await fetch(
    `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: channel.config.phone_number,  // Recipient phone with country code
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: templateParams.map(p => ({
                type: 'text',
                text: p,
              })),
            },
          ],
        },
      }),
    }
  )

  const data = await res.json()
  if (data.error) {
    return { ok: false, data, error: data.error.message || `HTTP ${res.status}` }
  }
  return { ok: true, data }
}

function getWhatsAppTemplateName(alert: AlertWithDetails): string {
  // Map alert characteristics to approved template names
  if (alert.severity === 'critical' || alert.severity === 'emergency') {
    return 'critical_alert'
  }
  // Could also check for daily summary context
  if (alert.alert_rules?.rule_type === 'balance_threshold' ||
      alert.alert_rules?.rule_type === 'time_to_depletion') {
    return 'balance_warning'
  }
  return 'balance_warning'  // Default template
}

function getWhatsAppTemplateParams(alert: AlertWithDetails): string[] {
  // Return ordered params matching the template's {{1}}, {{2}}, etc.
  return [
    alert.ad_accounts?.account_name || 'Unknown Account',
    alert.message,
    new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }),
  ]
}
```

### Pattern 2: Extending dispatch-notifications Switch
**What:** Add the WhatsApp case to the existing channel dispatch loop. The Phase 4 dispatch function already has `if (channel.channel_type === 'email')` and `else if (channel.channel_type === 'telegram')`. Adding WhatsApp is one more `else if`.
**When to use:** When modifying the dispatch-notifications Edge Function.
**Example:**
```typescript
// In the existing dispatch loop (supabase/functions/dispatch-notifications/index.ts)

// ... existing email and telegram cases ...

} else if (channel.channel_type === 'whatsapp') {
  // WhatsApp requires per-user opt-in check
  const recipients = channel.config.recipients as { phone: string; user_id: string }[]
  for (const recipient of recipients) {
    // Check if this user has opted in to WhatsApp
    const { data: profile } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', recipient.user_id)
      .single()

    const whatsappEnabled = profile?.settings?.whatsapp_opt_in === true
    if (!whatsappEnabled) continue

    const result = await sendWhatsApp(alert, {
      ...channel,
      config: { ...channel.config, phone_number: recipient.phone },
    })
    deliveryStatus = result.ok ? 'sent' : 'failed'
    responseData = result.data
    errorMessage = result.error

    // Log per-recipient delivery
    await supabase.from('alert_deliveries').insert({
      alert_id,
      channel_type: 'whatsapp',
      recipient: recipient.phone,
      status: deliveryStatus,
      response_data: responseData,
      error_message: errorMessage,
      sent_at: deliveryStatus === 'sent' ? new Date().toISOString() : null,
    })
  }
}
```

### Pattern 3: Per-User Opt-In via profiles.settings JSONB
**What:** Store WhatsApp opt-in preference in the existing `profiles.settings` JSONB column. This avoids a new table and leverages the existing profile system.
**When to use:** For R6.3 (opt-in per user).
**Example:**
```typescript
// profiles.settings shape after Phase 5:
{
  "whatsapp_opt_in": true,       // User has opted in to WhatsApp alerts
  "whatsapp_phone": "+201234567890",  // User's WhatsApp number (with country code)
  // ... other existing settings
}

// Dashboard: toggle opt-in
async function toggleWhatsAppOptIn(userId: string, optIn: boolean, phone?: string) {
  const updates: Record<string, unknown> = { whatsapp_opt_in: optIn }
  if (phone) updates.whatsapp_phone = phone

  await supabase
    .from('profiles')
    .update({
      settings: supabase.rpc('jsonb_set_nested', {
        // Or use raw SQL: settings || jsonb_build_object(...)
        target: 'settings',
        path: '{}',
        value: updates,
      }),
    })
    .eq('id', userId)
}
```

### Anti-Patterns to Avoid
- **Sending free-form text messages via WhatsApp:** WhatsApp requires approved templates for business-initiated messages. You CANNOT send arbitrary text like with Telegram. Always use template messages.
- **Using the archived WhatsApp Node.js SDK:** The official `whatsapp` npm package is archived by Meta. Use raw `fetch()` instead -- it is 15 lines of code for the entire integration.
- **Storing the WhatsApp access token in client-side code:** The permanent System User token grants full messaging access. Store it ONLY in Edge Function secrets (Deno.env) or Supabase Vault.
- **Skipping opt-in verification:** WhatsApp's Business Policy requires user opt-in before sending messages. The platform must verify opt-in before every dispatch, not just at configuration time.
- **Using temporary access tokens in production:** Temporary tokens expire in 24 hours. Production MUST use a permanent System User access token generated in Meta Business Manager.
- **Hardcoding template names:** Template names should be stored in configuration (Edge Function env or a constants file), not embedded in switch statements. Templates can be paused or disabled by Meta.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WhatsApp message sending | Custom SDK wrapper or npm package | Raw fetch() to Graph API | SDK is archived; fetch() is 15 lines; identical pattern to Resend/Telegram in Phase 4 |
| Template approval workflow | Automated template submission pipeline | Meta WhatsApp Manager UI | Only 3 templates needed; UI is simpler; approval is manual review by Meta regardless |
| Phone number validation | Regex-based phone parser | International phone format requirement (E.164) + simple `+` prefix check | WhatsApp API validates format and returns clear errors; over-validating client-side adds complexity |
| Opt-in consent tracking | Custom consent audit table | `profiles.settings` JSONB with `whatsapp_opt_in` boolean | Only ~5-10 users; JSONB is sufficient; profiles table already exists |
| Rate limiting for WhatsApp | Custom rate limiter | WhatsApp Cloud API built-in rate limiting (80 msg/s standard) | At ~5-10 alerts/day, rate limiting is irrelevant; API returns 429 if exceeded |

**Key insight:** Phase 5 is an incremental extension of Phase 4, not a new system. The existing dispatch-notifications Edge Function, notification_channels table, and alert_deliveries tracking all already support WhatsApp as a channel type. The work is adding the HTTP call, the templates, and the opt-in UI.

## Common Pitfalls

### Pitfall 1: Template Not Approved Before Code Goes Live
**What goes wrong:** Code is deployed but templates are still "Pending" review by Meta. All WhatsApp deliveries fail with error "Template not found" or "Template not approved."
**Why it happens:** Template approval can take 30 minutes to 48 hours. Developers often submit templates after writing code.
**How to avoid:** Submit templates to Meta as the FIRST task of Phase 5, before writing any code. Templates should be submitted via WhatsApp Manager UI. Have backup template wording prepared in case of rejection.
**Warning signs:** API responses with error code 132000 ("template not found") or 132015 ("template paused").

### Pitfall 2: Pricing Model Misunderstanding
**What goes wrong:** Unexpected costs from WhatsApp messaging, or confusion about when messages are free vs. paid.
**Why it happens:** WhatsApp pricing changed from per-conversation to per-message on July 1, 2025. Old documentation still references the conversation model.
**How to avoid:** Understand current pricing: utility template messages cost ~$0.0036/message in Egypt (as of January 2026). At 10 alerts/day to 5 users = 50 messages/day = ~$5.40/month. Service messages (within customer response window) are free. Set up billing alerts in Meta Business Suite.
**Warning signs:** Unexpectedly high bills. Monitor via Meta Business Suite billing dashboard.

### Pitfall 3: Phone Number Already Registered with WhatsApp
**What goes wrong:** The designated business phone number cannot be registered because it is already associated with a personal WhatsApp or WhatsApp Business App account.
**Why it happens:** WhatsApp enforces one-account-per-number. A number registered with the WhatsApp app cannot simultaneously be used with the Cloud API.
**How to avoid:** Use a dedicated phone number that has never been registered with WhatsApp, OR delete the existing WhatsApp account on that number before registering it with the Cloud API. The Meta test phone number can be used during development.
**Warning signs:** Registration fails with "number already in use" error.

### Pitfall 4: Template Rejection for Vague Content
**What goes wrong:** Meta rejects template submissions for being too generic, lacking context, or resembling marketing content.
**Why it happens:** Meta's automated review flags templates that don't clearly identify as utility messages (order updates, alerts, etc.).
**How to avoid:** Use clear, specific utility language. Include the business name. Avoid promotional language. Structure: "[Business Name]: Your [specific thing] is [specific state]. [Action to take]." Submit as "UTILITY" category, not marketing.
**Warning signs:** Template status changes to "Rejected" in WhatsApp Manager with a reason code.

### Pitfall 5: Temporary Access Token Expiring in Production
**What goes wrong:** WhatsApp messages stop sending after 24 hours because the temporary token expired.
**Why it happens:** During development, the Meta dashboard provides a temporary access token for quick testing. If this token is accidentally used in production, it expires within 24 hours.
**How to avoid:** Generate a permanent System User access token in Meta Business Manager. Steps: Business Settings > Users > System Users > Add > Generate Token with `whatsapp_business_messaging` + `whatsapp_business_management` permissions. Store as Edge Function secret.
**Warning signs:** API returning 190 error ("Invalid OAuth 2.0 Access Token") after working initially.

### Pitfall 6: Missing Opt-In Compliance
**What goes wrong:** Sending WhatsApp messages without proper user consent, risking account suspension by Meta.
**Why it happens:** Developers treat WhatsApp like Telegram/email and send to all configured numbers without checking opt-in.
**How to avoid:** Implement explicit opt-in flow in the dashboard: user must toggle "Enable WhatsApp alerts" AND provide their phone number. Store opt-in state in `profiles.settings.whatsapp_opt_in`. Check this before EVERY dispatch. Log opt-in timestamps for audit trail.
**Warning signs:** Meta Business account receiving policy violation warnings or messaging limits being reduced.

### Pitfall 7: Template Category Auto-Reclassification
**What goes wrong:** A template submitted as "UTILITY" is auto-reclassified by Meta as "MARKETING", resulting in higher per-message costs.
**Why it happens:** As of April 2025, Meta can automatically change your template category if the content fits a different category. The `allow_category_change` setting is no longer supported.
**How to avoid:** Write templates that clearly match utility criteria: "related to a specific, agreed-upon transaction" -- balance alerts and critical notifications qualify. Avoid promotional language, calls-to-action that drive sales, or brand promotion. If reclassified, appeal within 60 days.
**Warning signs:** Template category changes in WhatsApp Manager; higher-than-expected billing.

## Code Examples

Verified patterns from official and project sources:

### WhatsApp Template Message Definitions (for Meta approval)

These are the three templates to submit via WhatsApp Manager UI before writing code:

```
Template 1: balance_warning (UTILITY category)
Language: English (en)
Body: "Targetspro Alert: Account {{1}} balance is {{2}}. {{3}}. Time: {{4}}"
Footer: "Targetspro Ad Monitor"
Sample values: "Main Facebook Ads", "EGP 3,500 (threshold: EGP 5,000)", "Funds may deplete in ~4 days", "Feb 12, 2026 3:45 PM"

Template 2: critical_alert (UTILITY category)
Language: English (en)
Body: "URGENT - Targetspro: {{1}} requires immediate attention. {{2}}. Current balance: {{3}}. Time: {{4}}"
Footer: "Targetspro Ad Monitor"
Sample values: "Pasant Facebook Ads", "Balance critically low", "EGP 800", "Feb 12, 2026 3:45 PM"

Template 3: daily_summary (UTILITY category)
Language: English (en)
Body: "Targetspro Daily Summary ({{1}}): {{2}} accounts active. {{3}} need attention. Total spend today: {{4}}."
Footer: "Targetspro Ad Monitor"
Sample values: "Feb 12, 2026", "15", "3", "EGP 45,200"
```

### Extending dispatch-notifications for WhatsApp
```typescript
// Source: Existing Phase 4 dispatch pattern + WhatsApp Cloud API docs
// File: supabase/functions/dispatch-notifications/index.ts (EXTEND existing)

// Add to the channel dispatch loop:
else if (channel.channel_type === 'whatsapp') {
  // WhatsApp channels store recipients as array of { phone, user_id }
  const recipients = (channel.config.recipients ?? []) as Array<{
    phone: string
    user_id: string
  }>

  for (const recipient of recipients) {
    // Per-user opt-in check (R6.3)
    const { data: profile } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', recipient.user_id)
      .single()

    if (!profile?.settings?.whatsapp_opt_in) {
      // User has not opted in -- skip silently
      continue
    }

    try {
      const result = await sendWhatsApp(alert, recipient.phone)
      await supabase.from('alert_deliveries').insert({
        alert_id,
        channel_type: 'whatsapp',
        recipient: recipient.phone,
        status: result.ok ? 'sent' : 'failed',
        response_data: result.data,
        error_message: result.error,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
    } catch (e) {
      await supabase.from('alert_deliveries').insert({
        alert_id,
        channel_type: 'whatsapp',
        recipient: recipient.phone,
        status: 'failed',
        error_message: e.message,
      })
    }
  }
}
```

### sendWhatsApp Function (in dispatch-notifications)
```typescript
// Source: WhatsApp Cloud API docs (graph.facebook.com endpoint)
// File: supabase/functions/dispatch-notifications/index.ts or _shared/

async function sendWhatsApp(
  alert: AlertWithDetails,
  recipientPhone: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')

  if (!accessToken || !phoneNumberId) {
    return { ok: false, error: 'WhatsApp credentials not configured' }
  }

  const templateName = selectTemplate(alert)
  const params = buildTemplateParams(alert)

  const res = await fetch(
    `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: params.map(p => ({ type: 'text', text: p })),
            },
          ],
        },
      }),
    }
  )

  const data = await res.json()
  if (data.error) {
    return {
      ok: false,
      data,
      error: data.error.message || `WhatsApp API error ${res.status}`,
    }
  }
  return { ok: true, data }
}

function selectTemplate(alert: AlertWithDetails): string {
  // Map to approved template names
  if (alert.severity === 'critical' || alert.severity === 'emergency') {
    return 'critical_alert'
  }
  // daily_summary would be selected by a scheduled summary job (future enhancement)
  return 'balance_warning'
}

function buildTemplateParams(alert: AlertWithDetails): string[] {
  const accountName = alert.ad_accounts?.account_name || 'Unknown'
  const cairoTime = new Date().toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  if (alert.severity === 'critical' || alert.severity === 'emergency') {
    // critical_alert: {{1}}=account, {{2}}=message, {{3}}=balance, {{4}}=time
    return [
      accountName,
      alert.message,
      alert.context_data?.balance !== undefined
        ? `${alert.ad_accounts?.currency} ${alert.context_data.balance}`
        : 'N/A',
      cairoTime,
    ]
  }

  // balance_warning: {{1}}=account, {{2}}=details, {{3}}=projection, {{4}}=time
  return [
    accountName,
    alert.message,
    alert.context_data?.days_remaining !== undefined
      ? `Funds may deplete in ~${alert.context_data.days_remaining} days`
      : '',
    cairoTime,
  ]
}
```

### Per-User WhatsApp Opt-In Toggle (Dashboard)
```typescript
// File: dashboard/src/components/notifications/whatsapp-opt-in.tsx

'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface WhatsAppOptInProps {
  userId: string
  initialOptIn: boolean
  initialPhone: string
}

export function WhatsAppOptIn({ userId, initialOptIn, initialPhone }: WhatsAppOptInProps) {
  const [optIn, setOptIn] = useState(initialOptIn)
  const [phone, setPhone] = useState(initialPhone)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleSave() {
    setSaving(true)
    try {
      // Read current settings, merge WhatsApp fields
      const { data: profile } = await supabase
        .from('profiles')
        .select('settings')
        .eq('id', userId)
        .single()

      const currentSettings = profile?.settings ?? {}
      const updatedSettings = {
        ...currentSettings,
        whatsapp_opt_in: optIn,
        whatsapp_phone: optIn ? phone : null,
        whatsapp_opted_in_at: optIn ? new Date().toISOString() : null,
      }

      await supabase
        .from('profiles')
        .update({ settings: updatedSettings })
        .eq('id', userId)

      // Toast success
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="whatsapp-opt-in">Enable WhatsApp Alerts</Label>
        <Switch
          id="whatsapp-opt-in"
          checked={optIn}
          onCheckedChange={setOptIn}
        />
      </div>
      {optIn && (
        <div className="space-y-2">
          <Label htmlFor="whatsapp-phone">WhatsApp Phone Number</Label>
          <Input
            id="whatsapp-phone"
            type="tel"
            placeholder="+201234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Include country code (e.g., +20 for Egypt). This number must have WhatsApp installed.
          </p>
        </div>
      )}
      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Preferences'}
      </Button>
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-conversation pricing (24-hour window) | Per-message pricing | July 1, 2025 | Alert costs now ~$0.0036/msg in Egypt instead of ~$0.045-0.065/conversation |
| On-Premises API (self-hosted) | Cloud API only (Meta-hosted) | 2025 | On-Premises API deprecated; Cloud API is the only supported option for new integrations |
| Template category selected by business (immutable) | Meta can auto-reclassify template categories | April 9, 2025 | `allow_category_change` setting removed; businesses can appeal within 60 days |
| Official WhatsApp Node.js SDK (`whatsapp` npm) | SDK archived; raw HTTP recommended | 2024-2025 | SDK is unmaintained; fetch()-based integration is standard |
| Conversation-level free tier (1,000 free conversations/month) | No conversation-level free tier | July 1, 2025 | Service messages within 24h window remain free; utility templates in customer window are free |

**Deprecated/outdated:**
- **WhatsApp On-Premises API:** Fully deprecated. Cloud API is the only option for new projects.
- **`whatsapp` npm package:** Archived by Meta. Do not use.
- **Conversation-based pricing model:** Replaced by per-message pricing as of July 2025.
- **`allow_category_change` template parameter:** No longer supported as of April 2025.

## Open Questions

1. **Meta Business Verification Status**
   - What we know: Targetspro already has a Meta Business account (used for Facebook API in Phase 2). WhatsApp Cloud API requires the same Meta Business account plus WhatsApp Business registration.
   - What's unclear: Whether Targetspro's Meta Business account is already verified for WhatsApp, or whether verification needs to be initiated (1-4 weeks process).
   - Recommendation: Check verification status in Meta Business Suite immediately as a prerequisite task. If not verified, initiate before Phase 5 coding begins.

2. **Dedicated WhatsApp Phone Number**
   - What we know: WhatsApp Cloud API requires a dedicated phone number that is NOT registered with any WhatsApp or WhatsApp Business App account.
   - What's unclear: Whether Targetspro has a spare number available, or if one needs to be acquired.
   - Recommendation: Include "acquire/designate WhatsApp Business phone number" as a prerequisite task. During development, use Meta's test phone number (sends to up to 5 verified recipients).

3. **Arabic Template Variants**
   - What we know: The Egypt-based team may prefer Arabic message templates. WhatsApp supports multi-language templates.
   - What's unclear: Whether English-only templates are sufficient or Arabic variants are also needed.
   - Recommendation: Start with English templates (simpler approval, faster iteration). Add Arabic variants as a follow-up if needed. The code already supports a `language.code` parameter.

4. **Daily Summary Template Trigger**
   - What we know: R6.2 lists "daily summary" as one of the three required templates. The current alert engine is event-driven (triggers on data INSERT), not scheduled-summary-driven.
   - What's unclear: How daily summaries will be generated. The existing pg_cron escalation job runs every 15 minutes but does not generate summaries.
   - Recommendation: Add a new pg_cron job that runs once daily (e.g., 9:00 AM Cairo time) to generate a daily summary alert. This alert would use the `daily_summary` template. This is a small addition to the existing pg_cron infrastructure.

5. **notification_channels Table - Channel Type Constraint**
   - What we know: The `notification_channels` table has `channel_type TEXT NOT NULL` without a CHECK constraint (unlike `alert_deliveries` which has `CHECK (channel_type IN ('email', 'telegram', 'whatsapp', 'webhook'))`).
   - What's unclear: Whether a CHECK constraint should be added to `notification_channels.channel_type` for consistency.
   - Recommendation: Add a CHECK constraint in the Phase 5 migration: `ALTER TABLE notification_channels ADD CONSTRAINT notification_channels_channel_type_check CHECK (channel_type IN ('email', 'telegram', 'whatsapp', 'webhook'))`. This is a safety net for data integrity.

6. **WhatsApp Channel Config Shape**
   - What we know: Email channels store `{ "recipients": ["email@example.com"] }` and Telegram stores `{ "chat_id": "-100xxx" }` in the `config` JSONB column.
   - What's unclear: The best structure for WhatsApp config in notification_channels.
   - Recommendation: Store as `{ "recipients": [{ "phone": "+201234567890", "user_id": "uuid" }] }`. The phone is needed for the API call; the user_id is needed for the opt-in check. This mirrors the email pattern but adds user association for opt-in verification.

## Sources

### Primary (HIGH confidence)
- [WhatsApp Cloud API send endpoint](https://www.devopsschool.com/blog/whatsapp-cloud-api-direct-integration-with-meta/) - Endpoint: `POST https://graph.facebook.com/v{VERSION}/{PHONE_NUMBER_ID}/messages`, Bearer auth, template message JSON structure
- [WhatsApp Template Messages Integration](https://engineering.teknasyon.com/whatsapp-template-messages-integration-3db5b535387d) - Template component structure with body parameters
- [WhatsApp Business Platform Pricing](https://business.whatsapp.com/products/platform-pricing) - Official Meta pricing page
- [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy) - Official opt-in requirements and messaging policies
- [WhatsApp Node.js SDK (archived)](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/) - SDK confirmed archived; template function signature reference
- Existing project: Phase 4 Research (`.planning/phases/04-alert-engine-email-telegram/04-RESEARCH.md`) - dispatch-notifications architecture, pg_net triggers, Edge Function patterns
- Existing project: Core schema migration (Phase 1) - `notification_channels` and `alert_deliveries` tables already support `'whatsapp'` channel_type
- Existing project: tech.md research - WhatsApp Cloud API code pattern, template definitions, pricing estimates

### Secondary (MEDIUM confidence)
- [WhatsApp Business API Pricing 2026 - Country Rates](https://flowcall.co/blog/whatsapp-business-api-pricing-2026) - Egypt: $0.1073 marketing, $0.0036 utility, $0.0036 authentication per message
- [WhatsApp API Pricing Update July 2025](https://www.ycloud.com/blog/whatsapp-api-pricing-update) - Per-message pricing change from per-conversation model
- [Meta Template Approval Updates](https://support.wati.io/en/articles/12320234-understanding-meta-s-latest-updates-on-template-approval) - Auto-reclassification, approval timelines, category changes
- [WhatsApp Cloud API Permanent Access Token Guide 2026](https://anjoktechnologies.in/blog/-whatsapp-cloud-api-permanent-access-token-step-by-step-system-user-2026-complete-correct-guide-by-anjok-technologies) - System User token generation steps
- [WhatsApp Opt-In Best Practices (Infobip)](https://www.infobip.com/docs/whatsapp/compliance/user-opt-ins) - Opt-in collection methods, documentation requirements
- [WhatsApp API Compliance 2026](https://gmcsco.com/your-simple-guide-to-whatsapp-api-compliance-2026/) - Compliance requirements, opt-in rules
- [n8n WhatsApp Business Cloud credentials](https://docs.n8n.io/integrations/builtin/credentials/whatsapp/) - Alternative: n8n has built-in WhatsApp node (not needed since we use Edge Functions, but available if needed)

### Tertiary (LOW confidence)
- Existing project: concerns.md research - WhatsApp pricing estimates (pre-July 2025 conversation model -- now outdated, replaced by per-message pricing above)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - WhatsApp Cloud API is a plain HTTP POST to Graph API (same API family as Facebook used in Phase 2); pattern identical to Resend/Telegram from Phase 4; no SDK needed
- Architecture (extending dispatch-notifications): HIGH - The existing Edge Function, notification_channels table, and alert_deliveries table all already support 'whatsapp' as a channel type; this is a switch-case addition
- Template approval process: MEDIUM - Verified via multiple sources that templates require Meta approval (30min-48hr) and must be utility category; exact approval UX may differ from documentation
- Pricing: MEDIUM - Per-message pricing confirmed from multiple sources; Egypt-specific rates from secondary sources; Meta changes pricing periodically
- Opt-in compliance: MEDIUM - Requirements verified from WhatsApp Business Policy and third-party compliance guides; exact enforcement varies
- Pitfalls: HIGH - Based on confirmed API behaviors (template requirement, token expiration, phone number registration) and Phase 4 established patterns

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - WhatsApp Cloud API is stable; pricing subject to change; template policies subject to Meta updates)
