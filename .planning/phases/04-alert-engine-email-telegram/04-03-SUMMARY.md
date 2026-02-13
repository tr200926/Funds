---
phase: 04-alert-engine-email-telegram
plan: 03
subsystem: ui
tags: [zod, react-hook-form, shadcn-ui, alert-rules, supabase, rbac]

# Dependency graph
requires:
  - phase: 01-schema
    provides: alert_rules table with rule_type enum and config JSONB
  - phase: 03-dashboard-mvp-nextjs
    provides: dashboard shell, supabase client pattern, shadcn/ui components, useUser hook
provides:
  - Zod validation schemas for all 5 alert rule type configurations
  - AlertRuleForm component with dynamic config fields per rule type
  - AlertRuleList component with CRUD operations and toggle switch
  - /alerts/rules page with server-side auth and role-based access
  - SeverityBadge reusable component for colored severity indicators
  - RULE_TYPES, SEVERITIES constants and label maps
affects: [04-04, 04-05, alert-history-ui, notification-channels-ui]

# Tech tracking
tech-stack:
  added: [zod, react-hook-form, @hookform/resolvers]
  patterns: [zod-validated-forms, dynamic-config-per-rule-type, role-based-ui-visibility]

key-files:
  created:
    - dashboard/src/lib/validators/alert-rules.ts
    - dashboard/src/components/alerts/severity-badge.tsx
    - dashboard/src/components/alerts/alert-rule-form.tsx
    - dashboard/src/components/alerts/alert-rule-list.tsx
    - dashboard/src/app/(dashboard)/alerts/rules/page.tsx
    - dashboard/src/components/ui/switch.tsx
    - dashboard/src/components/ui/textarea.tsx
    - dashboard/src/components/ui/label.tsx
    - dashboard/src/components/ui/checkbox.tsx
  modified:
    - dashboard/package.json

key-decisions:
  - "Use untyped useForm (no generic parameter) to avoid Zod v4 resolver type conflicts with nullable fields"
  - "Validate config separately per rule_type on submit rather than using Zod discriminated union in form resolver"
  - "Cast Record<string, unknown> to Json via unknown for Supabase insert/update compatibility"
  - "Use inline feedback banners instead of toast library for success/error messages"

patterns-established:
  - "Dynamic form config: watch rule_type and render different config field components per type"
  - "Role-based UI: pass canManage boolean from server page to client components for conditional rendering"
  - "Config field sub-components use UseFormRegister<any> to avoid generic type propagation issues"

# Metrics
duration: 5min
completed: 2026-02-13
---

# Phase 4 Plan 3: Alert Rules UI Summary

**Zod-validated alert rule management page with dynamic config forms per rule type, CRUD via Supabase, and role-based access control**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T04:40:42Z
- **Completed:** 2026-02-13T04:46:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Zod validation schemas for all 5 alert rule types (balance_threshold, spend_spike, time_to_depletion, zero_spend, account_status_change) with proper z.coerce for form inputs
- AlertRuleForm component with dynamic config fields that change based on selected rule_type, powered by react-hook-form with Zod resolver
- AlertRuleList component with DataTable, active/inactive toggle switch, and create/edit dialogs
- /alerts/rules server page with authentication, org_id extraction from JWT, and role-based visibility (viewer = read-only)
- SeverityBadge component rendering color-coded badges for info/warning/critical/emergency levels

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zod validators and severity badge component** - `ec9dc12` (feat)
2. **Task 2: Create alert rule form, list, and management page** - `112c295` (feat)

## Files Created/Modified
- `dashboard/src/lib/validators/alert-rules.ts` - Zod schemas for all 5 rule type configs, base form schema, getConfigSchema helper, type/severity constants
- `dashboard/src/components/alerts/severity-badge.tsx` - Colored severity badge component (info=blue, warning=yellow, critical=red, emergency=bold-red)
- `dashboard/src/components/alerts/alert-rule-form.tsx` - Form component with dynamic config fields per rule_type, dialog wrapper, react-hook-form integration
- `dashboard/src/components/alerts/alert-rule-list.tsx` - Client component fetching rules from Supabase, rendering table with toggle/edit/create controls
- `dashboard/src/app/(dashboard)/alerts/rules/page.tsx` - Server page with auth, org_id extraction, ad_accounts fetch, role-based canManage flag
- `dashboard/src/components/ui/switch.tsx` - shadcn/ui Switch component
- `dashboard/src/components/ui/textarea.tsx` - shadcn/ui Textarea component
- `dashboard/src/components/ui/label.tsx` - shadcn/ui Label component
- `dashboard/src/components/ui/checkbox.tsx` - shadcn/ui Checkbox component (installed as dependency)
- `dashboard/package.json` - Added zod, react-hook-form, @hookform/resolvers dependencies

## Decisions Made
- **Untyped useForm:** Used `useForm()` without generic type parameter to avoid Zod v4 type inference conflicts with the resolver. The resolver still validates correctly at runtime.
- **Separate config validation:** Rather than using a discriminated union in the form resolver (which would require the form to know about all config shapes upfront), config is validated separately on submit using getConfigSchema(ruleType). This keeps the form schema simple and the config fields dynamic.
- **Json type casting:** Supabase's generated types use a `Json` type for JSONB columns. Config values (typed as `Record<string, unknown>`) are cast via `as unknown as Json` for insert/update compatibility.
- **Inline feedback:** Used simple state-based feedback banners with auto-dismiss instead of adding a toast library, keeping dependencies minimal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed z.record() call for Zod v4 compatibility**
- **Found during:** Task 1 (Zod validators)
- **Issue:** `z.record(z.unknown())` requires two arguments in Zod v4 (key schema + value schema)
- **Fix:** Changed to `z.record(z.string(), z.unknown())`
- **Files modified:** dashboard/src/lib/validators/alert-rules.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** ec9dc12 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed TypeScript type conflicts with react-hook-form + Zod v4 resolver**
- **Found during:** Task 2 (Form component)
- **Issue:** `zodResolver(alertRuleFormSchema)` produced type incompatibility with `useForm<AlertRuleFormValues>` because Zod v4 infers nullable fields differently than Zod v3
- **Fix:** Removed generic type parameter from useForm, used `as` casts for watched values, typed config field sub-components with `UseFormRegister<any>`
- **Files modified:** dashboard/src/components/alerts/alert-rule-form.tsx
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 112c295 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed Record<string, unknown> to Json type mismatch for Supabase inserts**
- **Found during:** Task 2 (List component)
- **Issue:** Supabase generated types expect `Json` for config column, but form returns `Record<string, unknown>`
- **Fix:** Cast config values via `as unknown as Json` in insert/update calls
- **Files modified:** dashboard/src/components/alerts/alert-rule-list.tsx
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 112c295 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes necessary for TypeScript correctness with Zod v4 and Supabase generated types. No scope creep.

## Issues Encountered
None beyond the auto-fixed type issues above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Alert rule management UI is complete and ready for integration with the alert evaluation engine (Plan 01-02)
- The /alerts/rules page is accessible from the existing Alerts nav item in the sidebar
- Alert history page (Plan 04) and notification channel configuration (Plan 05) can build on the patterns established here

## Self-Check: PASSED

All 9 created files verified present on disk. Both task commits (ec9dc12, 112c295) verified in git log.

---
*Phase: 04-alert-engine-email-telegram*
*Completed: 2026-02-13*
