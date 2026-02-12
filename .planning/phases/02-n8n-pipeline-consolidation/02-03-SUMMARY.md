---
phase: 02-n8n-pipeline-consolidation
plan: 03
subsystem: automation
tags: [n8n, supabase, cron, orchestration]

# Dependency graph
requires:
  - phase: 02-01
    provides: Facebook ingestion workflow + Supabase schema write pattern
  - phase: 02-02
    provides: TikTok ingestion workflows with Execute Sub-workflow triggers
provides:
  - Controller workflow that schedules and orchestrates all ingestion sub-workflows
  - Global error handler workflow that finalizes stuck pipeline_runs after crashes
affects: [03-dashboard-mvp, monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Sequential Execute Workflow orchestration with continueOnFail enabled per sub-workflow
    - Supabase pipeline_run lifecycle logging with aggregated sub-workflow summaries

key-files:
  created:
    - n8n-workflows/controller.json
    - n8n-workflows/error-handler.json
  modified: []

key-decisions:
  - "Controller executes Facebook then TikTok groups sequentially to avoid saturating Supabase"
  - "Error handler treats pipeline_runs older than 30 minutes as failed to keep observability clean"

patterns-established:
  - "Controller orchestration: Cron schedule → pipeline_run insert → Execute Workflow chain → aggregated Supabase update"
  - "Global error recovery: n8n Error Trigger feeding Supabase updates with structured error_log payloads"

# Metrics
duration: 44 min
completed: 2026-02-12
---

# Phase 02 Plan 03: Controller + Error Handler Summary

**Controller cron workflow now orchestrates Facebook + TikTok ingestions and hands failures to a global error handler backed by Supabase.**

## Performance

- **Duration:** 44 min
- **Started:** 2026-02-12T06:44:43Z
- **Completed:** 2026-02-12T07:29:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added a scheduled controller workflow that inserts its own pipeline_run, calls each ingestion workflow sequentially with Continue on Error, and aggregates downstream results for final logging.
- Delivered a global error handler workflow using the n8n Error Trigger to find pipeline_runs stuck in `running` for 30+ minutes and mark them failed with structured error metadata.
- Verified the complete five-workflow system (controller + Facebook + TikTok 1 + TikTok 2 + error handler) and confirmed it satisfies R3.1–R3.8 with zero Google Sheets dependencies.

## Task Commits

Each task was committed or approved atomically:

1. **Task 1: Create Controller and Error Handler workflow JSONs** - `adb5ad2` (feat)
2. **Task 2: Verify complete workflow system** - *(checkpoint, human verification only)*

**Plan metadata:** _pending (this summary commit)_

## Files Created/Modified
- `n8n-workflows/controller.json` - Schedules the ingestion cadence, creates controller pipeline_runs, executes sub-workflows sequentially, and finalizes run status with aggregated summaries.
- `n8n-workflows/error-handler.json` - Listens for workflow crashes via Error Trigger and updates stuck pipeline_runs to failed with contextual error logs.

## Decisions Made
- Controller runs sub-workflows sequentially with Continue on Error, prioritizing observability and Supabase stability over concurrency spikes.
- Error handler treats executions older than 30 minutes as failed to ensure Ops dashboards never show stale `running` rows.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four ingestion workflows now hang off a single controller and global error recovery path, so downstream dashboard work (Phase 03) can rely on consistent `pipeline_runs`, `spend_records`, and `balance_snapshots` data.
- Phase 02 is complete; proceed to the dashboard milestone.

---
*Phase: 02-n8n-pipeline-consolidation*
*Completed: 2026-02-12*
