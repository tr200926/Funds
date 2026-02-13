---
phase: 04-alert-engine-email-telegram
plan: 01
subsystem: database, api
tags: [pg_net, pg_cron, vault, edge-functions, deno, alerts, triggers, typescript]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Core schema (alert_rules, alerts, alert_deliveries, notification_channels tables), denormalization triggers"
provides:
  - "pg_net triggers on spend_records INSERT and balance_snapshots INSERT that invoke evaluate-alerts Edge Function"
  - "Account status change trigger on ad_accounts UPDATE (status column)"
  - "is_alert_in_cooldown RPC for alert deduplication"
  - "pg_cron escalation schedule running every 15 minutes"
  - "Shared TypeScript modules: types, constants, supabase-client, alert-evaluators, notification-formatters"
affects: [04-02-evaluate-alerts, 04-03-dispatch-notifications, 04-04-escalate-alerts, 04-05-alert-dashboard-ui]

# Tech tracking
tech-stack:
  added: [pg_net, pg_cron, supabase-vault]
  patterns: [vault-secret-retrieval, pg_net-fire-and-forget, deno-esm-imports, severity-ordering-map]

key-files:
  created:
    - supabase/migrations/20260212200001_alert_engine_triggers.sql
    - supabase/functions/_shared/types.ts
    - supabase/functions/_shared/constants.ts
    - supabase/functions/_shared/supabase-client.ts
    - supabase/functions/_shared/alert-evaluators.ts
    - supabase/functions/_shared/notification-formatters.ts
  modified: []

key-decisions:
  - "Alert evaluation triggers fire on INSERT only (not UPDATE) to avoid double evaluation on spend_records UPSERT"
  - "Account status change uses a separate trigger with WHEN (OLD.status IS DISTINCT FROM NEW.status) guard"
  - "evaluateRule accepts optional TriggerPayload parameter so status_change events can pass old/new status"
  - "time_to_depletion evaluator tries RPC first then falls back to manual calculation from spend_records"
  - "Quiet hours use channel-configured timezone (not hardcoded) with midnight-wrapping support"

patterns-established:
  - "Vault secret retrieval: SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'secret_name'"
  - "pg_net fire-and-forget: PERFORM net.http_post() in AFTER INSERT trigger, executes after transaction commit"
  - "Deno ESM imports: relative ./file.ts for local, https://esm.sh/ for external packages"
  - "Severity ordering: numeric map {info:0, warning:1, critical:2, emergency:3} for comparison"
  - "NUMERIC-as-string conversion: always use Number() before arithmetic on current_balance, daily_spend"

# Metrics
duration: 4min
completed: 2026-02-13
---

# Phase 4 Plan 1: Alert Engine Foundation Summary

**pg_net database triggers + shared Edge Function modules (types, evaluators, formatters) providing the complete foundation for alert evaluation, notification dispatch, and escalation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-13T04:40:15Z
- **Completed:** 2026-02-13T04:44:12Z
- **Tasks:** 2
- **Files created:** 6

## Accomplishments
- SQL migration with pg_net extension, 3 trigger functions, 3 triggers (spend INSERT, balance INSERT, status UPDATE), cooldown RPC, and pg_cron escalation schedule
- 5 shared TypeScript modules for Edge Functions with Deno-compatible imports
- Rule evaluators for all 5 core types: balance_threshold, time_to_depletion, spend_spike, zero_spend, account_status_change
- Email HTML and Telegram text formatters with severity badges, Cairo timezone, and quiet hours support

## Task Commits

Each task was committed atomically:

1. **Task 1: Create alert engine database migration** - `c5a4cd3` (feat)
2. **Task 2: Create shared Edge Function modules** - `5df1de7` (feat)

## Files Created/Modified
- `supabase/migrations/20260212200001_alert_engine_triggers.sql` - pg_net triggers, cooldown RPC, status change trigger, pg_cron escalation
- `supabase/functions/_shared/types.ts` - TriggerPayload, EvalResult, AlertWithDetails, NotificationChannel, DeliveryResult, Severity
- `supabase/functions/_shared/constants.ts` - SEVERITY_ORDER, DEFAULT_COOLDOWN_MINUTES, ESCALATION_TIMEOUTS, SEVERITY_NEXT
- `supabase/functions/_shared/supabase-client.ts` - createAdminClient factory using Deno.env
- `supabase/functions/_shared/alert-evaluators.ts` - evaluateRule with switch on 5 core rule types
- `supabase/functions/_shared/notification-formatters.ts` - formatAlertEmailHtml, formatAlertTelegramText, isInQuietHours

## Decisions Made
- Alert evaluation triggers fire on INSERT only (not INSERT OR UPDATE) on spend_records to avoid double evaluation during UPSERT re-pulls
- Account status change gets its own dedicated trigger with WHEN guard (only fires when status actually changes)
- evaluateRule accepts optional TriggerPayload parameter so the status_change rule type can access old/new status from the trigger payload
- time_to_depletion evaluator tries the calculate_time_to_depletion RPC first, then falls back to manual balance/avg-spend calculation if RPC is unavailable
- Quiet hours support configurable timezone per channel (not hardcoded to Cairo) with midnight-wrapping window logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Vault secrets (supabase_url, service_role_key) must be populated before triggers fire in production, but this is documented in the migration file header.

## Next Phase Readiness
- All shared modules are ready for the evaluate-alerts Edge Function (Plan 02)
- Database triggers will invoke evaluate-alerts once the function is deployed
- pg_cron escalation job will invoke escalate-alerts once that function is deployed
- Notification formatters are ready for dispatch-notifications (Plan 03)

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (c5a4cd3, 5df1de7) verified in git log.

---
*Phase: 04-alert-engine-email-telegram*
*Completed: 2026-02-13*
