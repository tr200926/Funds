# Delivery State (bootstrap)

This repository still uses a bootstrap-style `STATE.md` because the canonical GSD format has not been re-established. Updates below are maintained manually.

## Current Plan Progress

- **Latest Phase:** 04-alert-engine-email-telegram
- **Latest Plan:** 01 (Alert engine foundation: triggers + shared modules) -- completed 2026-02-13. pg_net triggers on spend_records/balance_snapshots INSERT, status change trigger, cooldown RPC, pg_cron escalation, and 5 shared TypeScript modules for Edge Functions.
- **Next Steps:** Execute Phase 04 Plan 02 (evaluate-alerts Edge Function).

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

## Issues / Blockers

- `gsd-tools state` automation still cannot parse this bootstrap `STATE.md`, so plan/phase counters must be updated manually until the canonical format is restored.
- Dashboard requires Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) from the user setup file before login/data paths can be exercised locally.

## Session Notes

- **Last Work Session:** Completed Phase 04 Plan 01 (Alert engine foundation) on 2026-02-13; commits `c5a4cd3` (database migration) and `5df1de7` (shared Edge Function modules) create the trigger/RPC/cron infrastructure and typed evaluators/formatters for the alert engine.
