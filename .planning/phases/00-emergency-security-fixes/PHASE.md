# Phase 0: Emergency Security Fixes

## Goal
Eliminate critical credential/security risks without breaking current data pulls.

## Scope Checklist
- [x] Define in-scope technical changes.
- [x] Confirm dependencies from previous phase.
- [x] Confirm no disruption to current production pulls.

## Execution Checklist
- [x] Redact exposed secrets in workflow JSON exports committed to repository.
- [x] Redact hardcoded recipient emails from workflow JSON exports.
- [x] Redact hardcoded Google Sheets document IDs from workflow JSON exports.
- [ ] Rotate live TikTok/Facebook tokens in n8n credentials and invalidate old tokens. (Manual external action)
- [ ] Configure token health-check alerting in running n8n/Supabase environments. (Manual external action)
- [ ] Decide and document disabled Main Facebook controller path behavior. (Operational decision)

## Deliverables
Rotated tokens, secrets removed from workflows, token health checks, incident notes.

## Acceptance Criteria
- [x] No previously identified hardcoded tokens/emails/sheet IDs remain in committed workflow files.
- [ ] All production API calls succeed after live credential rotation.
- [ ] Token health-check alerts verified in runtime environment.
- [ ] Rollback approach documented for credential rotation.

## Exit Notes
- Status: In Progress
- Owner: TBD
- Date: 2026-02-11