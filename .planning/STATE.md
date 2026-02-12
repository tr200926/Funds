# Delivery State (bootstrap)

This repository did not include a prior `STATE.md`, so this file captures the current execution snapshot manually.

## Current Plan Progress

- **Latest Phase:** 02-n8n-pipeline-consolidation
- **Latest Plan:** 02 (TikTok Ingestion Workflows) – completed 2026-02-12.
- **Next Steps:** Execute Phase 2 Plan 03 (Controller orchestration) to wire Facebook + TikTok workflows together and finalize the pipeline health rollups.

## Decisions Recorded

1. Continue using `npx supabase` because global installs are blocked by the upstream CLI.
2. Treat NUMERIC columns as strings inside generated TypeScript types to preserve financial precision.
3. Require the legacy migration script to run in dry-run mode by default so teams can validate transformations before writes.
4. Maintain two dedicated TikTok workflows/credentials (token groups 1 & 2) and dual-write to the existing `Tiktok accounts` / `tiktok2` tables during the validation period.
5. Gate Supabase writes behind explicit success checks so TikTok API failures update pipeline_runs without inserting incomplete rows.

## Issues / Blockers

- `gsd-tools state` automation still cannot parse this bootstrap `STATE.md`, so plan/phase counters must be updated manually until the canonical format is restored.

## Session Notes

- **Last Work Session:** Completed Phase 02 Plan 02 TikTok ingestion workflows + documentation on 2026-02-12.
