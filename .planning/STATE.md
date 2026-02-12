# Delivery State (bootstrap)

This repository still uses a bootstrap-style `STATE.md` because the canonical GSD format has not been re-established. Updates below are maintained manually.

## Current Plan Progress

- **Latest Phase:** 02-n8n-pipeline-consolidation
- **Latest Plan:** 03 (Controller + Error Handler) – completed 2026-02-12. Controller workflow now schedules Facebook + TikTok sub-workflows every three hours, logs its own `pipeline_runs`, and aggregates downstream statuses.
- **Next Steps:** Transition to Phase 03 (Dashboard MVP) work since all five ingestion workflows are consolidated and verified end-to-end.

## Decisions Recorded

1. Continue using `npx supabase` because global installs are blocked by the upstream CLI.
2. Treat NUMERIC columns as strings inside generated TypeScript types to preserve financial precision.
3. Require the legacy migration script to run in dry-run mode by default so teams can validate transformations before writes.
4. Dual-write to legacy Facebook tables until operators observe seven discrepancy-free days, then disable the legacy writers.
5. Disable workflow-level retry-on-fail flags so the controller remains the single scheduler/error owner across all ingestion pipelines.
6. Run controller Execute Workflow calls sequentially with `continueOnFail` to limit Supabase load spikes and keep observability intact.
7. Treat any pipeline_run stuck in `running` for 30+ minutes as failed via the global error handler to keep dashboards accurate.

## Issues / Blockers

- `gsd-tools state` automation still cannot parse this bootstrap `STATE.md`, so plan/phase counters must be updated manually until the canonical format is restored.

## Session Notes

- **Last Work Session:** Completed Phase 02 Plan 03 (Controller + Error Handler) on 2026-02-12; five workflow JSONs and the README passed the R3.1–R3.8 verification checkpoint and are ready for import.
