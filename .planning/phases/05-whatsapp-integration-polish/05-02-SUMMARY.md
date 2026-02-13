---
phase: 05-whatsapp-integration-polish
plan: 02
subsystem: ui
tags: [nextjs, supabase, whatsapp, zod]

# Dependency graph
requires:
  - phase: 05-01
    provides: WhatsApp dispatch backend + profile settings metadata
provides:
  - WhatsApp channel configuration UI with validated recipients
  - User-facing WhatsApp opt-in control under /settings/profile
affects: [dashboard, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated union schema for per-channel notification config"
    - "Profiles.settings merge helper for WhatsApp consent + timestamps"

key-files:
  created:
    - dashboard/src/components/notifications/whatsapp-opt-in.tsx
    - dashboard/src/app/(dashboard)/settings/profile/page.tsx
  modified:
    - dashboard/src/lib/validators/notification-channels.ts
    - dashboard/src/components/notifications/channel-form.tsx
    - dashboard/src/components/notifications/channel-list.tsx

key-decisions:
  - "Surface opt-in badges in the WhatsApp recipient selector instead of hard blocking selection so admins can make informed overrides"

patterns-established:
  - "WhatsApp recipients stored as an array of {user_id, phone} validated once in a shared schema"
  - "Per-user consent cards live under /settings/profile with Supabase client updates"

# Metrics
duration: 8 min
completed: 2026-02-13
---

# Phase 05 Plan 02: WhatsApp Integration Polish Summary

**Dashboard surfaces WhatsApp recipient management plus a per-user opt-in card backed by merged Supabase profile settings**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-13T05:12:14Z
- **Completed:** 2026-02-13T05:20:23Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a shared `notification-channels` validator that now treats WhatsApp configs as a discriminated union with reusable recipient schema.
- Expanded the channel form to load organization profiles, show opt-in indicators, reset configs per channel, and serialize WhatsApp recipients with E.164 validation.
- Updated channel list cards so WhatsApp channels render the proper icon, summary counts, and edit/create flows hydrate existing configs accurately.
- Built the `WhatsAppOptIn` client card plus `/settings/profile` server page so every user can manage consent and phone numbers without clobbering other profile settings.

## Task Commits

1. **Task 1: Extend channel form + validation for WhatsApp** - `59d8aea` (feat)
2. **Task 2: Build WhatsApp opt-in component and wire /settings/profile** - `cac0db4` (feat)

**Plan metadata:** docs(05-02):complete-whatsapp-ui-plan

## Files Created/Modified

- `dashboard/src/lib/validators/notification-channels.ts` - central Zod schema with WhatsApp recipient validation and channel enum.
- `dashboard/src/components/notifications/channel-form.tsx` - loads org users, displays opt-in badges, and renders WhatsApp-specific controls.
- `dashboard/src/components/notifications/channel-list.tsx` - WhatsApp-aware icons, summaries, and safer edit hydration.
- `dashboard/src/components/notifications/whatsapp-opt-in.tsx` - client opt-in card persisting consent/phone/timestamp to Supabase.
- `dashboard/src/app/(dashboard)/settings/profile/page.tsx` - server page showing account info alongside the WhatsApp opt-in control.

## Decisions Made

- Highlighted opt-in status in the WhatsApp recipient selector while still allowing admins to add non-opted users explicitly when necessary (e.g., emergency overrides).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reset channel form state when editing**
- **Found during:** Task 1 (Extend channel form + validation for WhatsApp)
- **Issue:** Channel dialog state never rehydrated when reopening, so edits showed stale values and broke WhatsApp config hydration.
- **Fix:** Added an `open`/`initialValues` effect to repopulate every controlled field (name, quiet hours, per-channel config) and reset validation errors whenever the modal opens.
- **Files modified:** dashboard/src/components/notifications/channel-form.tsx
- **Verification:** `npx tsc --noEmit` plus manual flow review ensured edits now load current configs for email/telegram/whatsapp.
- **Committed in:** 59d8aea

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required to keep edit flows functional once additional WhatsApp state was introduced.

## Issues Encountered

- `gsd-tools state` commands still cannot parse the bootstrap STATE.md, so plan progress was updated manually per the existing blocker note.

## User Setup Required

None - existing Supabase env vars continue to power the dashboard.

## Next Phase Readiness

- Ready for 05-03 to run end-to-end WhatsApp validation and smoke tests now that admins can configure recipients and users can grant consent.

---
*Phase: 05-whatsapp-integration-polish*
*Completed: 2026-02-13*

## Self-Check: PASSED
