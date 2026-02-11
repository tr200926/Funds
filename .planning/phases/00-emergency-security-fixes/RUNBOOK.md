# Phase 0 Runbook: Emergency Security Fixes

## Purpose
Execute remaining manual/external security actions after repository redaction.

## Prerequisites
- Access to n8n admin UI (credentials + workflows).
- Access to TikTok Business API app credentials.
- Access to Facebook Business Manager / Meta app credentials.
- Access to Supabase project settings (if tokens/keys are stored there).
- Approval window for short maintenance/check period.

## Step 1: Rotate TikTok Tokens
1. Generate new TikTok access token(s) in TikTok developer portal.
2. In n8n, open the TikTok credential used by both workflows.
3. Replace token value with the newly generated token.
4. Save credential and test connection.
5. Immediately revoke old exposed token(s) in TikTok portal.

Verification:
- Trigger `Tiktok Data Pull —Tiktok accounts` manually.
- Trigger `Tiktok Data Pull —tiktok2` manually.
- Confirm successful API responses and Supabase updates.

## Step 2: Verify/Rotate Facebook Credential
1. Identify current Facebook credential in n8n (Graph API credential).
2. Confirm token type (System User preferred for long-lived stability).
3. If token is weak/expiring, generate replacement and update n8n credential.
4. Test API calls from all FB workflows.

Verification:
- Trigger each workflow manually:
  - `Facebook Data Pull —Main accounts`
  - `Facebook Data Pull —Pasant`
  - `Facebook Data Pull —aligomarketing`
  - `Facebook Data Pull —Xlerate`
- Confirm no auth/permission failures.

## Step 3: Replace Placeholder Runtime Config
Repository exports now contain placeholders and should not be imported as-is.
1. Ensure all runtime secrets are injected via n8n credentials.
2. Ensure email recipient lists are loaded from runtime config (not hardcoded code node arrays).
3. Ensure Google Sheet usage (if still needed temporarily) references secure runtime config values.

## Step 4: Add Token Health Monitoring
1. Create a lightweight n8n health workflow (runs every 30-60 min).
2. Call one low-cost endpoint per provider using the production credential.
3. On failure, send alert to Telegram/Email and write event to `STATUS WORKFLOWS` or `pipeline_runs`.

Minimum checks:
- TikTok: simple advertiser info endpoint.
- Facebook: simple account read endpoint.

## Step 5: Resolve Disabled Main Facebook Controller Node
Current finding: `Main_Controller =_ Facebook.json` has a disabled sub-workflow path.
1. Decide target behavior:
- Option A: re-enable controller call for Main accounts.
- Option B: keep separate schedule and document reason + owner.
2. Update workflow config accordingly.
3. Validate no duplicate overlapping executions.

## Step 6: Incident Follow-up (Git History Exposure)
1. Determine whether repository was shared externally while secrets were present.
2. If yes, perform history cleanup and force-push policy process.
3. Even with cleanup, keep all exposed tokens revoked permanently.

## Rollback Plan
- Keep previous credentials archived securely for emergency reversion window only.
- If new token fails:
  1. Revert to previous working credential (if still valid and not yet revoked).
  2. Re-run critical workflows manually.
  3. Open incident record and issue fresh token.
- Target rollback completion: <30 minutes.

## Sign-off Checklist
- [ ] TikTok tokens rotated and old tokens revoked.
- [ ] Facebook credential validated (or rotated) and verified.
- [ ] Manual test run passed for all 6 data-pull workflows.
- [ ] Health-check workflow active and alerting.
- [ ] Disabled Main FB controller behavior resolved/documented.
- [ ] Incident notes completed in `EVIDENCE.md`.

## Evidence to Capture
- Screenshot or log of credential update timestamps.
- Manual run execution IDs and success outputs.
- Alert test message IDs (Email/Telegram).
- Final sign-off date, owner, reviewer.