# Delivery State (bootstrap)

This repository still uses a bootstrap-style `STATE.md` because the canonical GSD format has not been re-established. Updates below are maintained manually.

## Current Plan Progress

- **Latest Phase:** 02-n8n-pipeline-consolidation
- **Latest Plan:** 01 (Facebook Ingestion Workflow) – completed 2026-02-12.
- **Next Steps:** Execute Phase 2 Plan 02 (TikTok Token Group 1 ingestion) to mirror the batch/error-handling patterns documented in Plan 01 before wiring everything into the controller.

## Decisions Recorded

1. Continue using `npx supabase` because global installs are blocked by the upstream CLI.
2. Treat NUMERIC columns as strings inside generated TypeScript types to preserve financial precision.
3. Require the legacy migration script to run in dry-run mode by default so teams can validate transformations before writes.
4. Dual-write to legacy Facebook tables until operators observe seven discrepancy-free days, then disable the legacy writers.
5. Disable workflow-level retry-on-fail flags so the controller remains the single scheduler/error owner across all ingestion pipelines.

## Issues / Blockers

- `gsd-tools state` automation still cannot parse this bootstrap `STATE.md`, so plan/phase counters must be updated manually until the canonical format is restored.

## Session Notes

- **Last Work Session:** Completed Phase 02 Plan 01 Facebook ingestion workflow + documentation on 2026-02-12.
