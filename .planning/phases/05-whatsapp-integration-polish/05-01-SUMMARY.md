---
phase: 05-whatsapp-integration-polish
plan: 01
subsystem: api
tags: [whatsapp, graph-api, meta, edge-functions, deno, notification, template-messages]

# Dependency graph
requires:
  - phase: 04-alert-engine-email-telegram
    provides: dispatch-notifications Edge Function, alert_deliveries table, notification_channels table, notification-formatters module
provides:
  - CHECK constraint on notification_channels.channel_type (email/telegram/whatsapp/webhook)
  - formatAlertWhatsAppParams helper with template selection logic
  - sendWhatsApp function using Graph API v23.0
  - dispatchWhatsApp orchestrator with per-user opt-in enforcement
  - Partial index idx_profiles_whatsapp_opt_in for opted-in user lookups
affects: [05-02, 05-03, dashboard-notification-settings, user-profile-settings]

# Tech tracking
tech-stack:
  added: [WhatsApp Cloud API v23.0]
  patterns: [per-recipient opt-in check before WhatsApp dispatch, template parameter formatter per channel type]

key-files:
  created:
    - supabase/migrations/20260213000001_whatsapp_channel_support.sql
  modified:
    - supabase/functions/_shared/notification-formatters.ts
    - supabase/functions/dispatch-notifications/index.ts

key-decisions:
  - "WhatsApp channels store recipients as Array<{ phone, user_id }> to support per-user opt-in verification"
  - "Template selection uses severity-based mapping: critical/emergency -> critical_alert, all others -> balance_warning"
  - "dispatchWhatsApp handles its own delivery logging per recipient rather than using the shared single-delivery path"

patterns-established:
  - "Per-recipient dispatch: WhatsApp case iterates recipients independently with try/catch isolation per phone number"
  - "Opt-in gate: every WhatsApp send checks profiles.settings.whatsapp_opt_in before sending, silently skipping non-opted-in users"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 5 Plan 1: WhatsApp Backend Foundation Summary

**WhatsApp Cloud API dispatch via Graph API v23.0 with per-user opt-in enforcement, template parameter formatting, and schema guardrails for channel_type constraint**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T05:57:57Z
- **Completed:** 2026-02-13T06:00:14Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Database enforces notification_channels.channel_type to email/telegram/whatsapp/webhook via CHECK constraint
- WhatsApp template parameter formatter selects critical_alert or balance_warning template based on alert severity
- dispatch-notifications Edge Function handles whatsapp channels with per-recipient opt-in verification and per-recipient delivery logging
- Partial index on profiles for fast WhatsApp opted-in user lookups

## Task Commits

Each task was committed atomically:

1. **Task 1: Add WhatsApp-safe schema guardrails** - `425dccd` (feat)
2. **Task 2: Implement WhatsApp formatter and dispatch case** - `318be75` (feat)

## Files Created/Modified
- `supabase/migrations/20260213000001_whatsapp_channel_support.sql` - CHECK constraint on notification_channels.channel_type, profiles.settings JSONB documentation, partial index for WhatsApp opt-in
- `supabase/functions/_shared/notification-formatters.ts` - Added formatAlertWhatsAppParams export with WhatsAppTemplateParams interface and severity-based template selection
- `supabase/functions/dispatch-notifications/index.ts` - Added sendWhatsApp (Graph API v23.0), dispatchWhatsApp orchestrator with opt-in checks, updated getRecipient for whatsapp type

## Decisions Made
- WhatsApp channels store recipients as `Array<{ phone: string; user_id: string }>` to support per-user opt-in verification against profiles.settings.whatsapp_opt_in
- Template selection uses severity mapping: critical/emergency severity maps to `critical_alert` template, all others map to `balance_warning` template
- dispatchWhatsApp manages its own delivery logging loop (per recipient) rather than using the shared single-delivery code path used by email/telegram, because WhatsApp requires per-recipient opt-in checks and independent error isolation
- Balance string in critical_alert template falls back from context_data.balance to ad_accounts.current_balance to "N/A" for robustness

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

External services require manual configuration before WhatsApp dispatch will function:

1. **Meta Business Manager** - Register a dedicated WhatsApp Business phone number (not tied to WhatsApp App)
2. **WhatsApp Manager** - Submit `balance_warning`, `critical_alert`, `daily_summary` templates (UTILITY category) for Meta approval
3. **System User Token** - Generate a permanent System User access token with `whatsapp_business_messaging` + `whatsapp_business_management` permissions
4. **Edge Function Secrets** - Run: `npx supabase secrets set WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=...`

## Issues Encountered
None

## Next Phase Readiness
- Backend WhatsApp dispatch is complete and ready for plan 05-02 (dashboard WhatsApp channel configuration UI) and 05-03 (user profile opt-in toggle)
- Templates must be approved by Meta before live WhatsApp messages can be sent
- Schema migration should be applied via `npx supabase db push` before testing

## Self-Check: PASSED

- All 3 created/modified files verified on disk
- Commit `425dccd` (Task 1) verified in git log
- Commit `318be75` (Task 2) verified in git log
- must_haves artifact patterns verified: `formatAlertWhatsAppParams`, `sendWhatsApp`, `notification_channels_channel_type_check`, Graph API v23.0 endpoint, `whatsapp_opt_in` gate

---
*Phase: 05-whatsapp-integration-polish*
*Completed: 2026-02-13*
