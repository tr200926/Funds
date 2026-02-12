---
phase: 02-n8n-pipeline-consolidation
plan: 01
subsystem: automation
tags: [n8n, facebook-ads, supabase]

# Dependency graph
requires:
  - phase: 01-database-foundation-schema-migration
    provides: Normalized spend_records and balance_snapshots tables for ingestion targets
provides:
  - Batch-oriented Facebook ingestion workflow JSON with pipeline_run lifecycle logging
  - Workflow import/credential guide covering consolidated architecture and dual-write policy
affects: [controller-workflow, tiktok-ingestion, supabase-ingestion]

# Tech tracking
tech-stack:
  added: [Luxon, Facebook Graph API v23.0, Supabase service role credential]
  patterns: [Execute Sub-workflow trigger inputs, pipeline_runs lifecycle logging, Supabase dual-write validation]

key-files:
  created: [n8n-workflows/facebook-ingestion.json, n8n-workflows/README.md]
  modified: []

key-decisions:
  - "Keep dual-write enabled until seven consecutive discrepancy-free days before shutting legacy tables"
  - "Disable workflow-level retries so the controller owns scheduling and failure escalation"

patterns-established:
  - "Batch Facebook Graph API usage with 50-request chunks and continue-on-fail semantics"
  - "Luxon Cairo timezone helper feeding all downstream nodes"

# Metrics
duration: 8 min
completed: 2026-02-12
---

# Phase 02 Plan 01: Facebook Ingestion Workflow

**Batch-based Facebook ingestion workflow with Luxon Cairo dates, Supabase dual-write logging, and documented import/credential guidance**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-12T06:32:52Z
- **Completed:** 2026-02-12T06:41:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Authored an importable n8n workflow JSON that consolidates Facebook account processing via Graph API batch requests, Luxon Cairo timestamps, and pipeline_run lifecycle updates.
- Captured the operational runbook (import order, credential mapping, validation checklist, rollback plan) in `n8n-workflows/README.md` for future operators.
- Ensured the workflow satisfies all must-haves: divide monetary micro-units by 100, enforce Supabase upserts/inserts, dual-write to legacy tables, and omit Google Sheets entirely.

## Task Commits

1. **Task 1: Create Facebook Ingestion workflow JSON** - `d96e68a` (feat)
2. **Task 2: Create workflow documentation and credential setup guide** - `b43013c` (docs)

Plan metadata commit pending (added later in this process).

## Files Created/Modified
- `n8n-workflows/facebook-ingestion.json` - Fully-defined n8n workflow covering Execute Sub-workflow trigger, Luxon Cairo code node, batch HTTP requests, Supabase writes, and pipeline_run finalization.
- `n8n-workflows/README.md` - Documentation covering architecture overview, import steps, credential table, configuration, legacy mapping, validation checklist, and rollback instructions.

## Decisions Made
- Retain dual-write behavior until seven consecutive days without discrepancies to protect legacy dashboards during transition.
- Let the controller manage retries/alerts while each ingestion workflow disables local retry-on-fail but sets an error workflow reference for centralized handling.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- GSD state automation (`gsd-tools state advance-plan`) could not parse the bootstrap STATE.md format, so plan bookkeeping remains in the manual file for now.

## User Setup Required

None - no separate USER-SETUP.md file was generated; follow README instructions inside `n8n-workflows/` for credential provisioning.

## Next Phase Readiness

- Facebook ingestion workflow and documentation are ready for controller integration and for mirroring patterns in the upcoming TikTok ingestion plans.
- No blockers identified; next plan can focus on TikTok token splits and controller orchestration updates.

## Self-Check: PASSED
