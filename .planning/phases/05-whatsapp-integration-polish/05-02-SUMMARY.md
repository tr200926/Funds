---
phase: 05-whatsapp-integration-polish
plan: 02
subsystem: ui
tags: [whatsapp, dashboard, nextjs, zod, notification-channels, opt-in, profile-settings, e164]

# Dependency graph
requires:
  - phase: 05-whatsapp-integration-polish
    plan: 01
    provides: CHECK constraint on channel_type, WhatsApp dispatch logic, profiles.settings JSONB schema for whatsapp_opt_in
  - phase: 04-alert-engine-email-telegram
    provides: notification_channels table, channel-form component, channel-list component
provides:
  - Zod validator with whatsapp channel type and E.164 recipients schema
  - WhatsApp-specific channel form UI with org user dropdown and opt-in badges
  - WhatsAppOptIn client component for per-user opt-in toggle and phone input
  - /settings/profile page rendering WhatsAppOptIn with SSR-provided data
affects: [05-03, dashboard-notification-settings, user-profile-settings]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-recipient WhatsApp config with user_id+phone pairs, JSONB settings merge pattern for whatsapp_opt_in fields]

key-files:
  created:
    - dashboard/src/lib/validators/notification-channels.ts
    - dashboard/src/components/notifications/whatsapp-opt-in.tsx
    - dashboard/src/app/(dashboard)/settings/profile/page.tsx
  modified:
    - dashboard/src/components/notifications/channel-form.tsx
    - dashboard/src/components/notifications/channel-list.tsx

key-decisions:
  - "Use profiles.full_name (not display_name) for org user dropdown since profiles table schema uses full_name column"
  - "Cast merged JSONB settings via as unknown as Json for Supabase update compatibility (established pattern from decision #18)"
  - "Prefill phone from user profile settings when selecting a WhatsApp recipient to reduce manual entry"

patterns-established:
  - "JSONB settings merge: fetch existing settings, spread, overwrite specific keys, update -- prevents clobbering unrelated keys"
  - "Org user dropdown with opt-in status badges: query profiles with settings to surface consent state in admin UI"

# Metrics
duration: 5min
completed: 2026-02-13
---

# Phase 5 Plan 2: WhatsApp Channel Configuration UI Summary

**WhatsApp channel form with org user recipient selector, E.164 phone validation, opt-in status badges, and per-user WhatsApp preferences toggle on /settings/profile**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T06:03:14Z
- **Completed:** 2026-02-13T06:08:35Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Channel form now supports WhatsApp as a first-class channel type with dedicated recipient rows containing user selection and E.164 phone validation
- Org users loaded from profiles table with opt-in badges so admins can see who has consented to WhatsApp alerts
- WhatsAppOptIn component allows users to toggle opt-in and save phone number, merging into profiles.settings JSONB without losing other keys
- /settings/profile page created with SSR auth and profile data fetching, rendering the WhatsAppOptIn component

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend channel form + validation for WhatsApp** - `4bcc063` (feat)
2. **Task 2: Build WhatsApp opt-in component and wire /settings/profile** - `88ac3d3` (feat)

## Files Created/Modified
- `dashboard/src/lib/validators/notification-channels.ts` - Zod schema with channelTypeEnum including whatsapp, E.164 whatsappRecipientsSchema, superRefine config validation per channel type
- `dashboard/src/components/notifications/channel-form.tsx` - WhatsApp channel type option, recipient rows with org user dropdown + phone input + opt-in badges, config reset on type switch, orgId prop for user fetching
- `dashboard/src/components/notifications/channel-list.tsx` - WhatsApp icon mapping (Smartphone), recipient count in card summary, orgId passthrough to ChannelForm
- `dashboard/src/components/notifications/whatsapp-opt-in.tsx` - Client component with Switch/Input/Button for managing whatsapp_opt_in, whatsapp_phone, whatsapp_opted_in_at in profiles.settings
- `dashboard/src/app/(dashboard)/settings/profile/page.tsx` - SSR page fetching auth user + profile, rendering WhatsAppOptIn with initial props

## Decisions Made
- Used `full_name` from profiles table (not `display_name` which doesn't exist) for the org user dropdown display text
- Applied `as unknown as Json` cast pattern (decision #18) for JSONB settings update compatibility
- Phone number auto-prefills from user's saved whatsapp_phone when selecting a recipient in the admin channel form
- WhatsApp opt-in timestamp (`whatsapp_opted_in_at`) is preserved on re-save if already set, only reset to null when opting out

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed profiles table column name mismatch**
- **Found during:** Task 1 (channel form org user fetch)
- **Issue:** Plan referenced `display_name` column which does not exist on profiles table; actual column is `full_name`
- **Fix:** Changed query to select `full_name` instead of `display_name`, updated interface and display logic
- **Files modified:** dashboard/src/components/notifications/channel-form.tsx
- **Verification:** TypeScript build passes clean with correct column
- **Committed in:** `4bcc063` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed profiles table missing email column reference**
- **Found during:** Task 1 (channel form org user fetch)
- **Issue:** Plan referenced `email` column on profiles table which does not exist; email is only available via auth.users
- **Fix:** Removed email from select query and interface, use full_name or user ID as display fallback
- **Files modified:** dashboard/src/components/notifications/channel-form.tsx
- **Verification:** TypeScript build passes clean
- **Committed in:** `4bcc063` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs - column name mismatches)
**Impact on plan:** Both auto-fixes necessary for type correctness against actual database schema. No scope creep.

## Issues Encountered
None beyond the column name deviations documented above.

## User Setup Required
None - no external service configuration required. WhatsApp backend secrets were configured in Plan 01.

## Next Phase Readiness
- WhatsApp channel configuration UI complete: admins can add/edit channels with validated recipients
- User opt-in flow complete: users can toggle WhatsApp alerts and save phone from /settings/profile
- Plan 05-03 can proceed with any remaining polish, testing, or integration work
- The profile page route (/settings/profile) may benefit from a sidebar navigation link in a future pass

## Self-Check: PASSED

- All 5 created/modified files verified on disk
- Commit `4bcc063` (Task 1) verified in git log
- Commit `88ac3d3` (Task 2) verified in git log
- must_haves artifact patterns verified: `z.enum(['email', 'telegram', 'whatsapp'])`, `channel_type === 'whatsapp'`, `WhatsAppOptIn`, `<WhatsAppOptIn`, `channelFormSchema`

---
*Phase: 05-whatsapp-integration-polish*
*Completed: 2026-02-13*
