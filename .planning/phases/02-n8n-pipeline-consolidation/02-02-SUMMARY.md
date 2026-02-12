---
phase: 02-n8n-pipeline-consolidation
plan: 02
subsystem: workflow-automation
tags: [n8n, supabase, tiktok, etl]

# Dependency graph
requires:
  - phase: 01-database-foundation-schema-migration
    provides: normalized spend/balance tables plus pipeline_runs telemetry
provides:
  - TikTok ingestion workflows for token groups 1 and 2 that populate spend_records, balance_snapshots, and pipeline_runs
affects: [controller-workflow, pipeline-health]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Luxon Cairo timezone calculations inside n8n Code nodes", "Per-account error logging aggregated into pipeline_runs"]

key-files:
  created: [n8n-workflows/tiktok-ingestion-1.json, n8n-workflows/tiktok-ingestion-2.json]
  modified: []

key-decisions:
  - "Dual-write targets remain 'Tiktok accounts' for group 1 and 'tiktok2' for group 2 to keep validation parity with the legacy system"
  - "Supabase writes are gated behind an explicit success branch so API failures are logged without inserting partial rows"

patterns-established:
  - "Compute Cairo dates once per workflow and reuse via expressions"
  - "Always enable Continue on Fail for TikTok API nodes to capture per-account errors"

# Metrics
duration: 5 min
completed: 2026-02-12
---

# Phase 02 Plan 02: TikTok Ingestion Workflows

**Dedicated n8n workflows ingest TikTok advertiser info, balances, and spend per credential group with Luxon-based Cairo dates, Supabase persistence, and dual-write telemetry**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-12T06:32:54Z
- **Completed:** 2026-02-12T06:38:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Authored the complete 16-node TikTok Ingestion 1 workflow with Execute Sub-workflow Trigger inputs, Luxon Cairo date calculation, Supabase pipeline_run lifecycle, and per-account HTTP polling of TikTok Business API v1.3
- Added conditional success routing, Supabase upserts/inserts, and dual-write coverage so each account logs spend_records, balance_snapshots, and the legacy "Tiktok accounts" table without converting currency units
- Generated TikTok Ingestion 2 as a structural clone with its own credential reference, token_group filter, pipeline_name defaults, and legacy `tiktok2` dual-write target to support the second credential pool

## Task Commits

1. **Task 1: Create TikTok Ingestion 1 workflow JSON** - `71b3558` (feat)
2. **Task 2: Create TikTok Ingestion 2 workflow JSON (clone with different credential)** - `447035a` (feat)

**Plan metadata:** `docs(02-02): complete TikTok ingestion workflows plan` (captures summary, state, and roadmap updates)

## Files Created/Modified

- `n8n-workflows/tiktok-ingestion-1.json` - Token group 1 workflow with Execute Sub-workflow Trigger, Supabase nodes, TikTok API calls, and dual-write logic
- `n8n-workflows/tiktok-ingestion-2.json` - Token group 2 workflow mirroring structure with unique IDs, credentials, and legacy table target

## Decisions Made

- Retained separate legacy table destinations (`Tiktok accounts` vs `tiktok2`) so the validation period can compare outputs against the exact historical sources
- Added an explicit success branch between normalization and Supabase writes to honor the per-account error-handling requirement while preventing bad rows from partial API failures

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `gsd-tools state` automation still cannot parse the bootstrap STATE.md file, so plan/phase bookkeeping remains a manual step until the canonical state format is restored.

## User Setup Required

None - no external dashboard or credential configuration changes were required beyond existing n8n credentials.

## Next Phase Readiness

- Both TikTok workflows are importable and align with the new schema, so the controller workflow (Plan 03) can now call them directly via Execute Sub-workflow nodes.
- No blockers identified; Supabase schema references and dual-write tables exist from prior work.

## Self-Check: PASSED
