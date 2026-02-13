---
phase: 05-whatsapp-integration-polish
plan: 01
subsystem: alert-engine
tags: [supabase-functions, whatsapp, deno, postgres]

# Dependency graph
requires:
  - phase: 04-alert-engine-email-telegram
    provides: notification channel schema + alert engine triggers
provides:
  - WhatsApp-safe schema guardrails and opt-in index
  - WhatsApp template formatter + dispatch-notifications Edge Function
affects: [05-02-whatsapp-settings-ui, 05-03-end-to-end-verification]

# Tech tracking
tech-stack:
  added: ["WhatsApp Cloud API v23.0"]
  patterns: ["Edge functions share DeliveryResult helpers per provider"]

key-files:
  created:
    - supabase/migrations/20260213000001_whatsapp_channel_support.sql
    - supabase/functions/dispatch-notifications/index.ts
    - .planning/phases/05-whatsapp-integration-polish/05-whatsapp-integration-polish-USER-SETUP.md
  modified:
    - supabase/functions/_shared/notification-formatters.ts

key-decisions:
  - "Documented whatsapp_opt_in fields directly on profiles.settings to keep consent data co-located with profile preferences."
  - "Recreated the dispatch-notifications Edge Function (missing in repo) so WhatsApp, email, and Telegram share one logging and opt-in enforcement implementation."

patterns-established:
  - "Centralized WhatsApp template selection inside formatAlertWhatsAppParams (severity-aware, Cairo timestamps)."
  - "Queued deliveries are logged before dispatch when quiet hours apply, keeping audit trails consistent."

# Metrics
duration: 7 min
completed: 2026-02-13
---

# Phase 05 Plan 01: WhatsApp Backend Summary

**WhatsApp channel schema guardrails plus dispatch-notifications Edge Function posting approved templates via Graph API**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-13T05:01:40Z
- **Completed:** 2026-02-13T05:09:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added migration enforcing notification channel types, documenting WhatsApp opt-in metadata, and indexing opted-in profiles for dispatch lookups.
- Extended shared formatters with `formatAlertWhatsAppParams`, mapping severity to approved templates and ensuring Cairo timestamps/number coercion.
- Implemented the dispatch-notifications Edge Function (email, Telegram, and new WhatsApp branch) with env-secret reads, per-recipient opt-in enforcement, and alert_deliveries logging.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add WhatsApp-safe schema guardrails** - `4ed7dfa` (feat)
2. **Task 2: Implement WhatsApp formatter and dispatch case** - `e974ed5` (feat)

Plan metadata: (pending docs commit)

## Files Created/Modified

- `supabase/migrations/20260213000001_whatsapp_channel_support.sql` - Encapsulated constraint/comment/index changes inside idempotent migration guarded by DO $$
- `supabase/functions/_shared/notification-formatters.ts` - Added severity-aware WhatsApp params helper with Cairo timestamps and numeric coercion
- `supabase/functions/dispatch-notifications/index.ts` - New Deno Edge Function covering email, Telegram, and WhatsApp with quiet-hours queueing + delivery logging
- `.planning/phases/05-whatsapp-integration-polish/05-whatsapp-integration-polish-USER-SETUP.md` - Human checklist for Meta templates, permanent token, and Supabase secrets

## Decisions Made

- Rebuilt the dispatch-notifications entry point that plans referenced but the repo lacked, ensuring future plans can extend one canonical function.
- Logged quiet-hour deferrals as `queued` rows so operators see why a channel skipped delivery before automation resumes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing dispatch-notifications Edge Function**
- **Found during:** Task 2 (WhatsApp formatter and dispatch)
- **Issue:** `supabase/functions/dispatch-notifications/index.ts` did not exist even though the plan required extending it.
- **Fix:** Created the full Edge Function: loads alert + channels, filters by severity/quiet hours, sends via Resend, Telegram Bot API, and WhatsApp Graph API v23.0, and logs results.
- **Files modified:** supabase/functions/dispatch-notifications/index.ts, supabase/functions/_shared/notification-formatters.ts
- **Verification:** Manual invocation paths now import the helper, and alert_deliveries logging covers email/telegram/whatsapp branches for future Supabase deploys.
- **Committed in:** e974ed5

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required recreating the referenced Edge Function so the WhatsApp work had an entry point; scope stays aligned with notifications backend.

## Issues Encountered

- `npx supabase db lint` requires the Supabase local Docker stack (port 54322). The CLI could not connect and attempted to `supabase start`, which is still downloading multi-hundred-MB images on this host. Lint remains pending until the local stack can run.
- `npx supabase functions deploy dispatch-notifications` failed because no Supabase access token is configured (`supabase login` required). Deployment/secret steps are captured in the user setup checklist.

## User Setup Required

External WhatsApp configuration is still manual. See [05-whatsapp-integration-polish-USER-SETUP.md](./05-whatsapp-integration-polish-USER-SETUP.md) for Meta template approvals, permanent tokens, and Supabase secret instructions.

## Next Phase Readiness

- Backend now enforces WhatsApp-ready schema and dispatch logic; ready for Plan 05-02 to add dashboard UX for opt-ins/channel config.
- Ensure Meta templates are approved and Supabase secrets are populated before running end-to-end tests in Plan 05-03.

---
*Phase: 05-whatsapp-integration-polish*
*Completed: 2026-02-13*

## Self-Check: PASSED
