# Delivery State (bootstrap)

This repository still uses a bootstrap-style `STATE.md` because the canonical GSD format has not been re-established. Updates below are maintained manually.

## Current Plan Progress

- **Latest Phase:** 05-whatsapp-integration-polish (Complete)
- **Latest Plan:** 03 (E2E Verification) -- completed 2026-02-13. Automated code-level verification passed (8/8 artifacts). Human E2E testing (Meta prerequisites, live WhatsApp) deferred by user.
- **Completed Plans:** 04-01, 04-02, 04-03, 04-04, 05-01, 05-02, 05-03
- **Next Steps:** Milestone 1 complete. All 6 phases (0-5) delivered.

## Decisions Recorded

1. Continue using `npx supabase` because global installs are blocked by the upstream CLI.
2. Treat NUMERIC columns as strings inside generated TypeScript types to preserve financial precision.
3. Require the legacy migration script to run in dry-run mode by default so teams can validate transformations before writes.
4. Dual-write to legacy Facebook tables until operators observe seven discrepancy-free days, then disable the legacy writers.
5. Disable workflow-level retry-on-fail flags so the controller remains the single scheduler/error owner across all ingestion pipelines.
6. Run controller Execute Workflow calls sequentially with `continueOnFail` to limit Supabase load spikes and keep observability intact.
7. Treat any pipeline_run stuck in `running` for 30+ minutes as failed via the global error handler to keep dashboards accurate.
8. Keep the Next.js dashboard isolated inside `dashboard/` so pipeline tooling and dependencies in the repo root remain untouched.
9. Use Supabase's `getUser()` middleware refresh pattern (instead of deprecated helpers) to guarantee fresh JWTs during SSR.
10. Standardize all Recharts usage behind a shared ChartWrapper component so chart heights are explicit and hydration bugs are avoided.
11. Focus pipeline health stats on the most recent 24 hours (runs, success %, last success, failed accounts) to give operators immediate SLA insight.
12. Alert evaluation triggers fire on INSERT only (not UPDATE) on spend_records to avoid double evaluation during UPSERT re-pulls.
13. Account status change uses a separate trigger with WHEN (OLD.status IS DISTINCT FROM NEW.status) guard rather than evaluating in the generic trigger.
14. time_to_depletion evaluator tries the database RPC first, then falls back to manual balance/avg-spend calculation from spend_records.
15. Quiet hours use per-channel configurable timezone (not hardcoded to Cairo) with midnight-wrapping window support.
16. Use untyped useForm() (no generic parameter) with Zod v4 resolver to avoid nullable field type inference conflicts.
17. Validate alert rule config separately per rule_type on form submit rather than using a discriminated union in the form resolver.
18. Cast Record<string, unknown> to Json via `as unknown as Json` for Supabase insert/update compatibility with JSONB columns.
19. Use sonner for toast notifications instead of shadcn toast (simpler API, zero boilerplate Toaster component).
20. Refetch full alert list on realtime INSERT because Supabase realtime payload lacks joined relations.
21. Display notification channels as cards (not DataTable) since channels are typically few items with rich visual density needs.
22. Use controlled React state for channel form instead of react-hook-form to handle dynamic email/telegram config fields cleanly.
23. WhatsApp channels store recipients as Array<{ phone, user_id }> to support per-user opt-in verification before every dispatch.
24. Template selection uses severity-based mapping: critical/emergency -> critical_alert, all others -> balance_warning.
25. dispatchWhatsApp handles its own delivery logging per recipient rather than using the shared single-delivery path, because WhatsApp requires per-recipient opt-in checks.
26. Use profiles.full_name (not display_name) for org user dropdown display since profiles table schema uses full_name column.
27. Prefill phone from user profile settings when selecting a WhatsApp recipient in the admin channel form to reduce manual entry.
28. WhatsApp opt-in timestamp (whatsapp_opted_in_at) is preserved on re-save if already set, only reset to null when opting out.

## Issues / Blockers

- `gsd-tools state` automation still cannot parse this bootstrap `STATE.md`, so plan/phase counters must be updated manually until the canonical format is restored.
- Dashboard requires Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) from the user setup file before login/data paths can be exercised locally.

## Session Notes

- **Last Work Session:** Completed Phase 05 (all 3 plans) on 2026-02-13. Plan 01: WhatsApp backend (schema migration, formatter, dispatch wiring). Plan 02: Dashboard UI (channel form, opt-in component, profile page). Plan 03: E2E verification (automated code checks passed, human testing deferred). Milestone 1 MVP Platform fully delivered.
