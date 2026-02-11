# Concerns & Risk Assessment: Targetspro Ad Spend Monitoring Platform

**Domain:** Ad spend monitoring platform (Facebook + TikTok), multi-channel alerting
**Researched:** 2026-02-11
**Overall Confidence:** MEDIUM (based on training data through May 2025; web verification unavailable during research -- all version-specific claims should be verified against current official docs before implementation)

---

## Table of Contents

1. [Risk Summary Matrix](#risk-summary-matrix)
2. [Facebook API Risks](#1-facebook-api-risks)
3. [TikTok API Risks](#2-tiktok-api-risks)
4. [WhatsApp Business API Concerns](#3-whatsapp-business-api-concerns)
5. [Migration Risks](#4-migration-risks)
6. [Operational Risks](#5-operational-risks)
7. [Compliance & Data Concerns](#6-compliance--data-concerns)
8. [Scalability Concerns](#7-scalability-concerns)
9. [Current System Vulnerabilities](#8-current-system-vulnerabilities-discovered-from-workflow-analysis)
10. [Prioritized Action Plan](#9-prioritized-action-plan)

---

## Risk Summary Matrix

| # | Risk | Severity | Likelihood | Impact | Priority |
|---|------|----------|------------|--------|----------|
| 1.1 | Hardcoded TikTok tokens in workflow files | **CRITICAL** | Confirmed | System-wide compromise | Immediate |
| 1.2 | Facebook token expiration breaking data pulls | **CRITICAL** | High | Total data collection outage | Phase 1 |
| 1.3 | Facebook API version deprecation (v22) | **HIGH** | Certain | Workflow breakage within months | Phase 1 |
| 2.1 | TikTok token expiration with no refresh logic | **CRITICAL** | High | TikTok data collection outage | Phase 1 |
| 3.1 | WhatsApp 24-hour messaging window | **HIGH** | High | Missed alert delivery | Phase 2 |
| 3.2 | WhatsApp message template approval delays | **MEDIUM** | Medium | Feature launch delay | Phase 2 |
| 4.1 | Data loss during schema migration | **HIGH** | Medium | Historical data corruption | Phase 1 |
| 4.2 | Alert gaps during transition | **HIGH** | High | Missed funding alerts | Phase 1 |
| 5.1 | n8n self-hosted instance downtime | **HIGH** | Medium | Data collection outage | Phase 1 |
| 5.2 | Supabase tier limits | **MEDIUM** | Medium | Service throttling or charges | Phase 2 |
| 6.1 | API terms of service compliance | **MEDIUM** | Low | Account suspension | Ongoing |
| 7.1 | Time-series data growth unbounded | **MEDIUM** | Certain | Performance degradation | Phase 3 |
| 7.2 | Alert storm during high-activity periods | **MEDIUM** | Medium | Alert fatigue / system overload | Phase 2 |

---

## 1. Facebook API Risks

### 1.1 Token Expiration and Rotation Complexity

**Severity: CRITICAL**
**Confidence: HIGH** (well-documented Facebook behavior, confirmed by workflow analysis)

**What the current system does:**
The workflows use a stored Facebook Graph API credential (`facebookGraphApi` id: `x0GIizNGjoBNjkuZ` - "Facebook Graph account 2") across all four Facebook sub-workflows. This appears to be a single credential shared across Main accounts, Pasant, Aligomarketing, and Xlerate workflows.

**The problem:**
Facebook access tokens come in multiple types with different lifetimes:

| Token Type | Lifetime | Refresh Method |
|------------|----------|----------------|
| **Short-lived User Token** | ~1-2 hours | Cannot be refreshed; requires new login |
| **Long-lived User Token** | ~60 days | Exchange short-lived token via API call |
| **System User Token** | Never expires (until revoked) | Generated in Business Manager |
| **Page Token (long-lived)** | Never expires (if from long-lived user token) | Derived from user token |

**Risk analysis:**
- If the current credential is a **User Token**, it will expire within 60 days maximum. The workflow will silently fail, and the `onError: "continueRegularOutput"` setting on the Facebook Graph API nodes means the error may be swallowed without clear notification.
- If it is a **System User Token**, it does not expire but is tied to a specific Business Manager. If the BM is restricted or the system user is removed, all workflows break simultaneously.
- The current error detection code in `Code in JavaScript2` (the batch evaluator) does check for token-related errors, but the response is only logged to a `STATUS WORKFLOWS` Supabase table -- there is no proactive alert sent to the team when tokens expire.

**Mitigation strategy:**
1. **Immediately determine token type.** Check in Facebook Business Manager what credential type is configured in n8n. If it is a User Token, this is an urgent risk.
2. **Migrate to System User Tokens.** For each Business Manager (Main, Pasant, Aligomarketing, Xlerate), create a dedicated System User with the `ads_read` permission. System User tokens do not expire.
3. **Implement token health monitoring.** Add a dedicated health-check workflow that runs daily, calls a lightweight FB API endpoint (e.g., `/me`), and sends a Telegram alert on failure.
4. **Store tokens in n8n credentials, not in workflow JSON.** The current approach of referencing credential IDs is correct for Facebook, but the credential store itself must be backed up.
5. **Document the token refresh procedure** as a runbook for the team so anyone can rotate tokens without developer involvement.

**VERIFY BEFORE IMPLEMENTATION:** Check current Facebook docs for any changes to System User token behavior. As of training data (May 2025), System User tokens generated in Business Manager do not expire unless the BM or system user is deactivated.

---

### 1.2 Rate Limiting (Multiple Ad Accounts)

**Severity: HIGH**
**Confidence: MEDIUM** (rate limit specifics may have changed)

**What the current system does:**
The workflows use `Split In Batches` with batch sizes of 30, with explicit `Wait` nodes (1-2 minutes between operations). The Facebook Controller runs sub-workflows sequentially with 2-3 minute waits between them. This means a full cycle through all four BMs takes approximately 10+ minutes.

**The problem:**
Facebook uses **Business Use Case Rate Limiting** (BUCRL) for Marketing API calls:

- Rate limits are per **app per Business Manager**, not per ad account
- The throttling uses a points system: each API call costs points, and you have a budget that refills over time
- When the budget is exhausted, the API returns HTTP 429 or error code 32 ("Application request limit reached")
- The current `retryOnFail: true, maxTries: 2, waitBetweenTries: 2000` is **insufficient** -- a 2-second retry will fail again if rate-limited

**Current exposure:**
Per 3-hour cycle, the system makes approximately:
- 4 sub-workflows x ~N accounts per BM
- Per account: 1 account info call (v23.0) + 1 daily insights call (v22.0) + 1 monthly insights call (v22.0) = 3 calls
- Estimated: 3 calls x ~20-40 accounts = 60-120 API calls per cycle
- At 8 cycles/day = 480-960 calls/day

This is likely within limits for a standard app, but it becomes a concern as accounts are added.

**Mitigation strategy:**
1. **Implement exponential backoff.** Replace the fixed 2-second retry with exponential backoff (2s, 8s, 32s) on HTTP 429 responses.
2. **Read rate limit headers.** Facebook returns `x-business-use-case-usage` headers showing current usage percentage. Monitor these and throttle proactively when approaching 80%.
3. **Batch API calls where possible.** Facebook supports batch requests (up to 50 calls per batch request). Instead of N individual account calls, batch them. This reduces HTTP overhead and can improve rate limit budget utilization.
4. **Reduce polling frequency for stable accounts.** Accounts with consistent spend patterns do not need 3-hourly polling. Consider adaptive polling: 3-hourly for active/volatile accounts, 6-hourly for stable ones.

**VERIFY BEFORE IMPLEMENTATION:** Check current Facebook BUCRL documentation for exact thresholds. The points budget and refill rate have changed multiple times historically.

---

### 1.3 API Version Deprecation

**Severity: HIGH**
**Confidence: MEDIUM** (deprecation schedule specifics need verification)

**What the current system does:**
The workflows use **two different API versions simultaneously**:
- `v23.0` for account info calls (funding_source_details, name, balance, account_status)
- `v22.0` for insights calls (spend, date_start, date_stop)

**The problem:**
Facebook deprecates API versions on a rolling basis. Historically, each version has approximately a 2-year lifespan from release:

| Version | Approximate Release | Approximate End-of-Life |
|---------|--------------------|-----------------------|
| v22.0 | ~Late 2024 | ~Late 2026 (estimated) |
| v23.0 | ~Early 2025 | ~Early 2027 (estimated) |

Using v22.0 means that version could reach end-of-life within this project's first year. When a version is deprecated:
- It returns errors for all calls
- There is typically a 90-day warning period before complete shutdown
- Breaking changes between versions can alter response schemas

**Mitigation strategy:**
1. **Standardize on v23.0 (or latest) immediately.** There is no reason to use v22.0 for insights calls. Test the insights endpoint with v23.0 to confirm identical response format.
2. **Abstract the API version.** Store the version string in a single n8n credential or environment variable, not hardcoded in each node. This allows updating the version in one place.
3. **Subscribe to Facebook Platform Changelog.** Set up monitoring for https://developers.facebook.com/docs/graph-api/changelog to receive deprecation notices.
4. **Build a version migration test workflow.** Before switching versions, run a parallel test workflow comparing old-version and new-version responses for a subset of accounts.

**VERIFY BEFORE IMPLEMENTATION:** Check the exact deprecation date for v22.0 on the Facebook changelog. The 2-year estimate is based on historical patterns and may not be exact.

---

### 1.4 Business Verification Requirements

**Severity: MEDIUM**
**Confidence: MEDIUM**

**The problem:**
Facebook requires Business Verification for apps that access the Marketing API beyond development mode. Without verification:
- App is limited to development mode (only test accounts)
- Rate limits are significantly lower
- Some permissions are restricted

Since the current system is already operational with real ad accounts, verification is presumably complete. However:
- Adding new Business Managers (e.g., if Targetspro onboards new agencies or partners) requires additional verification
- Changes to app permissions or data use declarations can trigger re-review
- Business verification can be revoked if policy violations are detected

**Mitigation strategy:**
1. **Document the current verification status** of the Facebook app and all connected Business Managers.
2. **Maintain compliance records** for data use declarations.
3. **Do not request unnecessary permissions.** Only request `ads_read` and `business_management` -- do not request `ads_management` unless the platform will make changes to ad campaigns.

---

## 2. TikTok API Risks

### 2.1 Access Token Management and Refresh Flow

**Severity: CRITICAL**
**Confidence: HIGH** (confirmed by direct workflow inspection)

**What the current system does:**
The TikTok workflows contain **hardcoded access tokens in plain text** within HTTP Request nodes:

```
Access-Token: 9f2251a6be41003cfb076845a55de15c3fcf884b
```

This same token appears in multiple nodes across the TikTok workflow (HTTP Request5, HTTP Request7, HTTP Request9, HTTP Request11). The token is visible to anyone with access to the n8n workflow JSON files, which are now committed to a git repository.

**The problem:**
This is a **confirmed critical security vulnerability**:

1. **Token exposure:** The token is in the git history. Even if removed from current files, it persists in git history forever unless the history is rewritten.
2. **Token lifetime:** TikTok Business API access tokens obtained through the authorization code flow have varying lifetimes. Some are long-lived (valid for extended periods), but they can be revoked by TikTok at any time for policy violations or security concerns.
3. **No refresh logic:** Unlike OAuth2 flows with refresh tokens, the current implementation uses a static token with no rotation mechanism. If TikTok invalidates this token, all TikTok data collection stops immediately.
4. **Single point of failure:** One token serves all TikTok workflows. Token revocation means 100% TikTok outage.

**Mitigation strategy:**
1. **IMMEDIATE: Rotate the exposed token.** Generate a new access token in the TikTok Business API developer portal and update n8n credentials. The old token (now in git history) should be considered compromised.
2. **Move tokens to n8n credentials store.** Create a TikTok API credential type in n8n rather than hardcoding in HTTP Request headers.
3. **Implement OAuth2 refresh flow.** TikTok's Marketing API supports OAuth2 with refresh tokens. The access token has a finite lifetime, and the refresh token can be used to obtain new access tokens. Build a dedicated "token refresh" workflow that runs periodically.
4. **Add .gitignore rules.** Ensure workflow JSON files with tokens are never committed. Better yet, use n8n's credential encryption and exclude credential exports from git.
5. **Consider git history cleanup.** If this repository could be accessed by unauthorized parties, use `git filter-branch` or BFG Repo-Cleaner to remove the token from history.

**VERIFY BEFORE IMPLEMENTATION:** Check the current TikTok Business API authentication documentation for the exact OAuth2 flow, token lifetimes, and refresh token behavior. The specifics may have changed since training data.

---

### 2.2 API Stability and Documentation Quality

**Severity: MEDIUM**
**Confidence: MEDIUM** (based on general developer community sentiment through May 2025)

**The problem:**
The TikTok Business API is significantly less mature than the Facebook Marketing API:

- **Documentation gaps:** Endpoint behaviors sometimes differ from what is documented. Error responses can be inconsistent.
- **Breaking changes:** TikTok has historically made breaking changes to API response formats with shorter deprecation windows than Facebook.
- **Regional differences:** API behavior can differ between regions. Since Targetspro operates from Egypt, latency to TikTok API servers (primarily US/Singapore) may be higher.
- **Rate limit clarity:** TikTok's rate limit documentation is less detailed than Facebook's. Exact limits depend on the app's tier/level.

**Current workflow evidence:**
The TikTok workflow already shows signs of working around API quirks:
- Multiple fallback code paths (`if (Array.isArray(list) && list.length)` with fallbacks)
- Explicit `alwaysOutputData: true` on many nodes to prevent workflow stoppage
- Use of v1.3 endpoint -- it is unclear if this is still the current recommended version

**Mitigation strategy:**
1. **Add comprehensive error logging for TikTok API responses.** Log the full response body on errors, not just the error code.
2. **Build a TikTok API health check.** A simple workflow that calls `/advertiser/info/` with a known advertiser ID and validates the response schema.
3. **Pin the API version** and monitor TikTok developer announcements for deprecation notices.
4. **Abstract TikTok API calls into a single sub-workflow** that handles authentication, retry logic, and error normalization. This reduces the blast radius of API changes.

---

### 2.3 TikTok Rate Limits

**Severity: MEDIUM**
**Confidence: LOW** (specific thresholds need verification)

**The problem:**
TikTok Business API rate limits are typically:
- **App-level:** Varies by app tier (Basic, Advanced, etc.)
- **Endpoint-specific:** Report endpoints typically have stricter limits than info endpoints
- **The `report/integrated/get` endpoint** (used in the current workflow for spend data) is likely more rate-limited than basic info endpoints

The current system processes accounts one-by-one with 10-20 second waits between calls, which is conservative but slow.

**Mitigation strategy:**
1. **Request rate limit increase** from TikTok if the app is on a basic tier.
2. **Optimize API calls:** The balance/get and advertiser/info endpoints could potentially be batched or called less frequently for accounts with stable balances.
3. **Implement proper rate limit handling** by checking response headers for rate limit metadata.

---

## 3. WhatsApp Business API Concerns

### 3.1 Cloud API vs On-Premises API Decision

**Severity: MEDIUM (decision required before implementation)**
**Confidence: MEDIUM**

**Recommendation: Use Cloud API.** For the following reasons:

| Factor | Cloud API | On-Premises API |
|--------|-----------|-----------------|
| **Setup complexity** | Minutes (via Meta dashboard) | Days/weeks (requires server infrastructure) |
| **Maintenance** | Meta-managed | Self-managed, including updates |
| **Cost** | Per-conversation pricing | Server costs + per-conversation pricing |
| **Reliability** | Meta's infrastructure | Your infrastructure |
| **Rate limits** | 80 messages/second (standard) | Depends on your hardware |
| **Suitability for alerts** | Ideal for low-volume transactional | Overkill for alerting use case |

Given that Targetspro needs WhatsApp for **alerting only** (not bulk messaging), the Cloud API is the clear choice. On-Premises is designed for high-volume use cases like customer support chatbots.

---

### 3.2 Message Template Approval Process

**Severity: HIGH**
**Confidence: MEDIUM**

**The problem:**
WhatsApp requires pre-approved message templates for business-initiated conversations (i.e., sending alerts to users who have not messaged the business in the last 24 hours). This is the primary use case for this platform.

**Key constraints:**
- **Templates must be submitted and approved by Meta** before they can be used. Approval can take 24 hours to several days.
- **Template content restrictions:** Templates cannot be promotional or marketing-focused. Alert templates ("Your ad account X has low balance") should be approved as **utility** category.
- **Template variables:** Dynamic content (account names, amounts, timestamps) must be passed as template parameters, not embedded in the template text.
- **Language requirements:** Templates must specify a language. For an Egypt-based agency, you may need templates in both English and Arabic.
- **Rejection reasons:** Templates can be rejected for vague content, policy violations, or similarity to existing templates. Rejections require resubmission with modifications.

**Mitigation strategy:**
1. **Submit templates early.** Do not wait until the WhatsApp integration is code-complete. Submit template applications during the design phase.
2. **Design templates with clear utility purpose:**
   - "Low Balance Alert": `Your ad account {{1}} has {{2}} remaining. At current spend rate, funds will deplete in approximately {{3}}.`
   - "Critical Funding Alert": `URGENT: Ad account {{1}} balance is {{2}}. Account may stop serving ads within {{3}}.`
   - "Daily Summary": `Daily report for {{1}}: {{2}} accounts active, {{3}} need attention.`
3. **Have backup templates ready.** If the first template is rejected, have alternative wording prepared.
4. **Test with sandbox first.** Use the WhatsApp Cloud API test environment before going live.

---

### 3.3 Pricing Per Conversation

**Severity: MEDIUM**
**Confidence: LOW** (pricing changes frequently; verify current rates)

**The problem:**
WhatsApp Cloud API charges per **conversation**, not per message. A conversation is a 24-hour window:

| Conversation Category | Approximate Cost (varies by region) |
|----------------------|-------------------------------------|
| Utility (alerts, updates) | ~$0.005 - $0.03 per conversation |
| Marketing | ~$0.02 - $0.08 per conversation |
| Service (user-initiated) | ~$0.003 - $0.02 per conversation |

**Cost projection for Targetspro:**
- Estimated 5-10 alert recipients
- Estimated 3-5 alerts per day during normal operations
- Monthly cost: ~$5-30/month (utility conversations)
- During high-activity periods: could reach $50-100/month

This is likely negligible compared to the ad spend being monitored, but the pricing model should be understood to avoid surprises.

**Mitigation strategy:**
1. **Batch alerts within the 24-hour window.** If multiple alerts fire within 24 hours for the same recipient, they are part of the same conversation (lower cost).
2. **Use utility category, not marketing.** Ensure templates are classified correctly.
3. **Set up billing alerts** in the Meta Business Suite to monitor WhatsApp API costs.

**VERIFY BEFORE IMPLEMENTATION:** Check Meta's current WhatsApp pricing page for Egypt-specific rates. Pricing varies significantly by country.

---

### 3.4 24-Hour Messaging Window

**Severity: HIGH**
**Confidence: HIGH** (fundamental WhatsApp Business API constraint)

**The problem:**
WhatsApp enforces a strict messaging model:
- **Business-initiated messages** (your alerts): Only possible using approved templates. Can be sent at any time, but each opens a new 24-hour conversation window.
- **User responses:** If a user responds to a template message, a "service" conversation window opens for 24 hours, during which you can send free-form messages.
- **After 24 hours without user response:** You can only send template messages again.

For an alerting use case, this means:
- Every alert is a template message (cost per conversation)
- You cannot send follow-up details as free-form text unless the user responds first
- Rich interactive messages (buttons, lists) are only available in certain template types

**Mitigation strategy:**
1. **Design alerts to be self-contained.** Each template message should include all necessary information -- do not rely on follow-up messages.
2. **Include a "View Dashboard" link** in the template so users can get details without needing additional messages.
3. **Use Telegram as the primary rich-text alert channel.** Telegram has no template restrictions, no conversation windows, and supports markdown, buttons, and unlimited messages for free. Use WhatsApp as a secondary/escalation channel.

**Recommended channel strategy:**

| Alert Priority | Channel | Rationale |
|---------------|---------|-----------|
| Info (daily summaries) | Telegram | Free, rich formatting, no restrictions |
| Warning (low balance) | Telegram + Email | Multi-channel redundancy |
| Critical (imminent depletion) | Telegram + WhatsApp + Email | WhatsApp ensures visibility on personal phone |
| System error (workflow failure) | Telegram (ops channel) | Developers monitor Telegram |

---

### 3.5 WhatsApp Business Verification

**Severity: MEDIUM**
**Confidence: MEDIUM**

**The problem:**
To use the WhatsApp Business API (Cloud API), you need:
1. A Meta Business account (already have this for Facebook API)
2. A verified business (may already be verified for Facebook)
3. A WhatsApp Business phone number (dedicated number, cannot be used for personal WhatsApp)
4. Display name approval

**Key risk:** If Targetspro's Meta Business account is not already verified for WhatsApp, the verification process can take 1-4 weeks and requires submitting business documents.

**Mitigation strategy:**
1. **Check current verification status** in Meta Business Suite immediately.
2. **Initiate verification early** if not already verified -- do not wait until the WhatsApp integration is ready.
3. **Designate a dedicated phone number** for WhatsApp Business. This number cannot simultaneously be used for regular WhatsApp.

---

## 4. Migration Risks

### 4.1 Data Loss During Schema Migration

**Severity: HIGH**
**Confidence: HIGH** (based on direct analysis of current schema)

**What the current system does:**
The current Supabase tables use a flat, denormalized structure. From the workflow analysis, the `Facebook Data Pull -- Main accounts` table has columns like:
- `Account ID`, `Account name`, `Available funds`, `Balance`, `Date`, `Status`, `Daily spending`, `Total spent`

Data is updated **in place** (UPDATE, not INSERT). This means:
- There is **no historical record** of balance/spend changes
- Each workflow run overwrites the previous values
- The Google Sheets integration serves as a partial backup, but sheet structure differs from Supabase

**Migration risks:**
1. **Schema mismatch:** The new normalized schema (with proper time-series tables) will have different column names, types, and relationships. Migrating data requires careful mapping.
2. **Data type inconsistencies:** Current data stores formatted strings (e.g., "EGP 1,502.00" for available_funds, comma-separated numbers). The new schema should use numeric types, but migration must parse these strings correctly.
3. **Loss of current state during migration:** If migration runs while workflows are active, race conditions can cause partial updates.
4. **Google Sheets data divergence:** Sheets may have data that Supabase does not (or vice versa) due to partial failures.

**Mitigation strategy:**
1. **Never modify existing tables during migration.** Create new tables alongside old ones. Run both in parallel until validated.
2. **Build a data validation script** that compares old tables vs. new tables after migration, checking row counts, sum of balances, and account coverage.
3. **Export Supabase and Google Sheets data as backup** before any migration begins.
4. **Migration phases:**
   - Phase A: Create new schema. Keep old schema untouched.
   - Phase B: New workflows write to new schema. Old workflows continue writing to old schema.
   - Phase C: Validate new schema data for 48-72 hours.
   - Phase D: Disable old workflows. Keep old tables as read-only archive.
5. **Parse formatted strings carefully.** The balance values stored as strings like "EGP 1,502.00" or comma-formatted numbers need robust parsing. Write unit tests for the parser.

---

### 4.2 Alert Gaps During Transition

**Severity: HIGH**
**Confidence: HIGH** (based on workflow analysis)

**What the current system does:**
Email alerts are triggered only during 9AM-12PM Cairo time (checked in `Code25` node). The alert checks balances against thresholds stored in Google Sheets (the `if` column). Alerts fire for accounts where `balance <= threshold`.

**Migration risks:**
1. **Window where old alerts are disabled but new alerts are not ready:** If old workflows are turned off before new alerting is tested, there is a gap.
2. **Threshold migration:** Alert thresholds are currently stored in Google Sheets (the `if` column), not in Supabase. These must be migrated to the new system.
3. **Alert recipient changes:** Current recipients are hardcoded (`zeina.moh.imam@gmail.com`, `hossamelsayed66@gmail.com`). The new system will have configurable recipients, but the initial migration must preserve these defaults.

**Mitigation strategy:**
1. **Run old and new alerting in parallel for at least one week.** New system sends alerts to a test channel (Telegram test group); old system continues to send emails.
2. **Migrate thresholds explicitly.** Extract all `if` values from Google Sheets and seed them into the new system's configuration.
3. **Preserve the 9AM-12PM window initially.** Do not change alert timing during migration -- replicate the current behavior first, then expand.
4. **Create a "migration checklist" alert** that runs daily and verifies: (a) all accounts are being pulled, (b) all thresholds are configured, (c) alert channels are operational.

---

### 4.3 n8n Workflow Versioning and Rollback

**Severity: MEDIUM**
**Confidence: HIGH** (based on current workflow structure)

**The problem:**
The current workflow JSON files are version-controlled in git, but:
- n8n's internal workflow versioning is separate from git
- Rolling back a workflow in n8n requires importing the old JSON and reconfiguring credentials
- The "Main accounts" sub-workflow is currently **disabled** in the controller (the `disabled: true` flag on `Call 'Facebook Data Pull -- Main accounts'`), suggesting a previous issue or ongoing change
- There is no staging/testing environment -- changes go directly to production

**Mitigation strategy:**
1. **Tag workflows with version numbers** in n8n (use workflow tags or naming convention).
2. **Before each migration phase, export all workflows** as JSON and commit to git with a descriptive tag.
3. **Build a rollback procedure document** that any team member can execute: import JSON, configure credentials, verify execution.
4. **Investigate why "Main accounts" is disabled** in the controller -- this may indicate an existing issue that needs resolution before migration begins.

---

## 5. Operational Risks

### 5.1 n8n Self-Hosted Instance Reliability

**Severity: HIGH**
**Confidence: HIGH**

**The problem:**
Self-hosted n8n is the backbone of all data collection. If the n8n instance goes down:
- All Facebook data pulls stop
- All TikTok data pulls stop
- All Google Sheets syncing stops
- All email alerts stop
- No visibility into the outage unless someone manually checks

**Current exposure:**
- All 8 workflows reference error workflow `kxuiZpwsyj2HvuWD`, but if n8n itself is down, the error workflow cannot fire.
- The `STATUS WORKFLOWS` table in Supabase logs workflow execution results, but there is no monitoring of "workflow didn't run at all" (absence of data).
- The instance runs on a single server (instance ID: `0b355d2ad0c64618c3e71763d60351bce2aa35360a978dd7122af838abfc1a96`).

**Mitigation strategy:**
1. **Implement external uptime monitoring.** Use a free service (UptimeRobot, Better Stack, or similar) to ping the n8n instance every 5 minutes and alert on downtime.
2. **Add a heartbeat workflow.** A simple n8n workflow that runs every 30 minutes and writes a timestamp to Supabase. A Supabase Edge Function (or cron job) checks if the heartbeat is stale and sends an alert via Telegram.
3. **Configure automatic restart.** If n8n is running via Docker, use `restart: always`. If running via systemd, configure `Restart=always`.
4. **Consider n8n Cloud as alternative.** n8n Cloud provides managed hosting with automatic updates and uptime guarantees. Cost is approximately $20-50/month for a starter plan, which may be worthwhile given the business criticality.
5. **Regular backups.** Back up the n8n database (SQLite or PostgreSQL) daily. Losing the n8n database means losing all workflow configurations, credentials, and execution history.

---

### 5.2 Supabase Tier Limits

**Severity: MEDIUM**
**Confidence: MEDIUM** (tier specifics may have changed)

**The problem:**
Supabase Free tier (as of training data, May 2025) includes:
- 500 MB database storage
- 2 GB bandwidth
- 50,000 monthly active users
- 500 MB file storage
- 2 million Edge Function invocations

The current system writes to 7+ tables every 3-5 hours. With the planned expansion (time-series data, more accounts, real-time subscriptions, Edge Functions for alerting), the Free tier will likely be insufficient.

**Supabase Pro tier** (~$25/month) provides:
- 8 GB database storage
- 250 GB bandwidth
- Unlimited API requests
- 2 million Edge Function invocations (additional available)
- Daily backups

**Risk assessment by usage category:**

| Resource | Current Usage (est.) | Post-Migration (est.) | Free Tier Limit | Risk |
|----------|---------------------|-----------------------|-----------------|------|
| Database storage | ~50-100 MB | 500 MB - 2 GB (with time-series) | 500 MB | **HIGH** |
| API requests | ~5,000/day | ~20,000-50,000/day (with dashboard) | Unlimited (pauses at usage limits) | LOW |
| Real-time connections | 0 | 5-20 concurrent | 200 concurrent | LOW |
| Edge Function invocations | 0 | ~10,000/month (alerting) | 500,000/month | LOW |

**Mitigation strategy:**
1. **Plan for Pro tier from the start.** At $25/month, it is a trivial cost compared to the ad spend being monitored. Do not design around Free tier limitations.
2. **Monitor database growth.** Set up a weekly check on `pg_database_size()` and alert if approaching 6 GB (75% of Pro tier).
3. **Implement data retention policies.** Time-series data older than 12 months should be aggregated (daily summaries) and raw data archived or deleted.
4. **Use connection pooling.** Supabase provides PgBouncer. Configure the dashboard and n8n to use the pooled connection string to avoid exhausting connection limits.

---

### 5.3 Cost Implications of Real-Time Subscriptions

**Severity: LOW**
**Confidence: MEDIUM**

**The problem:**
The planned Next.js dashboard will use Supabase Realtime for live updates. Each connected dashboard tab opens a WebSocket connection. Concerns:
- Connection limits on Supabase tier
- Database load from LISTEN/NOTIFY
- Cost if many users are connected simultaneously

**Reality check:**
Targetspro is an internal agency tool. Expected concurrent users: 2-10. This is far below any Supabase tier limit. Real-time subscriptions are not a cost concern at this scale.

**Mitigation strategy:**
1. **Use Realtime subscriptions selectively.** Only subscribe to tables that change frequently (e.g., `account_balances`) and use REST API for rarely-changing data (e.g., `account_settings`).
2. **Implement subscription cleanup.** Ensure Next.js components unsubscribe on unmount to prevent connection leaks.

---

## 6. Compliance & Data Concerns

### 6.1 Ad Account Data Sensitivity

**Severity: MEDIUM**
**Confidence: HIGH**

**The problem:**
The data being collected includes:
- Ad account names (may reveal client business names)
- Account IDs (can be used to look up accounts)
- Balance and spend figures (sensitive financial data)
- Funding source details (may include payment method information)

This data, if leaked, could reveal:
- Which clients the agency manages
- How much clients are spending
- Financial health of ad accounts

**Mitigation strategy:**
1. **Implement Supabase Row Level Security (RLS).** Ensure that dashboard users can only see accounts assigned to them. Agency managers see all; account managers see their assigned accounts.
2. **Encrypt sensitive fields at rest.** While Supabase encrypts the database volume, consider application-level encryption for funding_source_details.
3. **Audit access logs.** Enable Supabase audit logging to track who accessed what data.
4. **Secure the n8n instance.** The n8n dashboard shows all API tokens and data flows. Restrict access to n8n to authorized administrators only.

---

### 6.2 GDPR/Privacy Considerations

**Severity: LOW** (for current use case)
**Confidence: MEDIUM**

**Assessment:**
The platform collects **ad account data**, not personal user data. GDPR primarily applies to personal data of EU residents. Since:
- Ad account data is business data, not personal data
- The agency operates in Egypt (not directly subject to GDPR)
- No end-user personal data is being collected or stored

GDPR risk is **low** for the current scope. However:
- If the platform later stores user profiles (names, emails of agency staff), GDPR may apply if any staff are EU residents.
- Egypt's Personal Data Protection Law (PDPL) was enacted in 2020 and is in implementation phases. It has similar principles to GDPR.

**Mitigation strategy:**
1. **Minimize personal data collection.** Only collect what is necessary for the platform to function.
2. **Document data processing activities** in a simple internal register.
3. **Monitor Egypt's PDPL implementation** for requirements that may apply to business data processing.

---

### 6.3 API Terms of Service Compliance

**Severity: MEDIUM**
**Confidence: MEDIUM**

**Facebook Marketing API ToS concerns:**
- Data collected via the Marketing API must be used for the benefit of the ad account owner (the client)
- Sharing ad account data with third parties is restricted
- Data must be refreshed regularly (cannot cache indefinitely and serve stale data)
- Data cannot be used to create competitor intelligence products

**TikTok Business API ToS concerns:**
- Similar restrictions on data usage
- Data must be associated with the authorized advertiser
- No reselling or redistribution of data

**Compliance assessment:**
The current use case (monitoring agency-managed accounts for the agency itself) is clearly within ToS for both platforms. The risk arises if:
- The platform is later opened to external clients (client portal)
- Data is shared outside the agency
- Data retention exceeds platform requirements

**Mitigation strategy:**
1. **Implement data retention policies.** Delete raw API response data after 90 days; keep only aggregated summaries for historical analysis.
2. **Ensure client consent.** If building a client portal, ensure clients consent to their data being displayed through the platform.
3. **Do not expose raw API IDs externally.** Use internal account identifiers on client-facing interfaces.

---

## 7. Scalability Concerns

### 7.1 Time-Series Data Growth

**Severity: MEDIUM**
**Confidence: HIGH**

**The problem:**
Currently, the system stores only the **latest snapshot** of each account (UPDATE, not INSERT). The planned system will store historical time-series data. Growth projection:

| Data Point | Current | 6 Months | 1 Year | 2 Years |
|------------|---------|----------|--------|---------|
| Accounts monitored | ~40-60 | ~80-100 | ~100-150 | ~150-200 |
| Data points per account per day | 1 (overwritten) | 8 (every 3 hours) | 8 | 8 |
| New rows per day | 0 | ~800 | ~1,200 | ~1,600 |
| New rows per month | 0 | ~24,000 | ~36,000 | ~48,000 |
| Estimated row count | ~60 | ~144,000 | ~432,000 | ~1,152,000 |
| Estimated storage | ~5 MB | ~100 MB | ~300 MB | ~800 MB |

At 800 MB after 2 years (raw estimates; actual depends on column width and indexes), this is manageable within Supabase Pro tier (8 GB). However, without retention policies, growth is unbounded.

**Mitigation strategy:**
1. **Implement table partitioning.** Partition the time-series table by month using PostgreSQL native partitioning. This dramatically improves query performance for time-range queries and makes old data easy to archive.
2. **Implement data aggregation.** After 90 days, aggregate hourly data into daily summaries. After 1 year, aggregate daily into weekly/monthly.
3. **Create database indexes** on (account_id, timestamp) for time-range queries. Without indexes, queries on 1M+ rows will be slow.
4. **Monitor query performance.** Use Supabase's built-in query analyzer to identify slow queries as data grows.
5. **Consider TimescaleDB extension** if available in Supabase (check current availability). It provides automatic partitioning, compression, and retention policies optimized for time-series data.

**VERIFY BEFORE IMPLEMENTATION:** Check if Supabase supports the TimescaleDB extension on Pro tier. If not, native PostgreSQL partitioning is the fallback.

---

### 7.2 Number of Ad Accounts Monitored

**Severity: MEDIUM**
**Confidence: HIGH**

**The problem:**
Each ad account requires 3 API calls per polling cycle (Facebook: account info + daily insights + monthly insights). With 4 Business Managers and sequential processing:

| Accounts | Calls per Cycle | Cycle Duration (est.) | API Risk |
|----------|----------------|----------------------|----------|
| 40 | 120 | ~15 min | Low |
| 100 | 300 | ~40 min | Medium |
| 200 | 600 | ~80 min | High |
| 500 | 1,500 | ~3+ hours | Critical (exceeds cycle interval) |

At 200+ accounts, the 3-hour polling cycle cannot complete before the next cycle starts. This causes cascading delays, duplicate executions, and potential rate limiting.

**Mitigation strategy:**
1. **Implement batch API calls.** Facebook's batch API can combine up to 50 calls per request, reducing 300 individual calls to 6 batch calls.
2. **Parallelize within rate limits.** Instead of sequential sub-workflows with waits, run multiple account pulls concurrently (up to the rate limit).
3. **Adaptive polling frequency.** High-spend accounts (>$1000/day) poll every 3 hours. Low-spend accounts (<$100/day) poll every 6-12 hours.
4. **Implement execution locking.** Prevent the scheduler from starting a new cycle if the previous one has not completed. Use a Supabase flag or n8n's built-in workflow concurrency settings.

---

### 7.3 Alert Volume During High-Activity Periods

**Severity: MEDIUM**
**Confidence: MEDIUM**

**The problem:**
During campaign launches or budget depletions, many accounts may trigger alerts simultaneously. If 20 accounts cross their threshold at the same time:
- 20 email alerts sent
- 20 Telegram messages sent
- 20 WhatsApp messages sent (20 conversations billed)
- Total: 60 notifications in a short window

This creates **alert fatigue** -- recipients ignore alerts because there are too many.

**Mitigation strategy:**
1. **Alert batching/digest mode.** Instead of 20 individual alerts, send one digest: "5 accounts need funding urgently, 15 accounts approaching threshold."
2. **Alert deduplication.** Do not re-alert for the same account within a configurable cooldown period (e.g., 6 hours).
3. **Escalation tiers:**
   - Tier 1 (Info): Balance < 50% of threshold -- Telegram only, batched daily digest
   - Tier 2 (Warning): Balance < threshold -- Telegram + Email, individual alert
   - Tier 3 (Critical): Balance near zero or account paused -- Telegram + WhatsApp + Email, individual alert with sound/notification override
4. **Alert suppression during maintenance windows.** Allow admins to mute alerts for specific accounts or time periods.
5. **Rate limit outbound messages.** Maximum 5 WhatsApp messages per recipient per hour; queue the rest.

---

## 8. Current System Vulnerabilities Discovered from Workflow Analysis

Beyond the research questions asked, the workflow analysis revealed several additional concerns that the migration must address:

### 8.1 Hardcoded Email Addresses

**Severity: LOW**
Alert recipients are hardcoded in workflow JavaScript (`zeina.moh.imam@gmail.com`, `hossamelsayed66@gmail.com`). Adding or removing recipients requires editing workflow code.

**Fix:** Store recipients in Supabase configuration table. Query at runtime.

### 8.2 Google Sheets as Single Point of Failure

**Severity: MEDIUM**
The TikTok workflow reads account configurations (Advertiser IDs, BC-IDs) from Google Sheets, not Supabase. If the Google Sheets OAuth token expires or the sheet is deleted/modified, TikTok data collection stops.

**Fix:** Migrate account configurations to Supabase. Use Google Sheets only as a secondary export/reporting tool, not as a configuration source.

### 8.3 No Error Alerting for Silent Failures

**Severity: HIGH**
Many nodes have `onError: "continueRegularOutput"`, which means API errors are silently swallowed. The error workflow (`kxuiZpwsyj2HvuWD`) is configured but only fires on unhandled errors. If an account API call fails and the workflow continues, no one is notified.

**Fix:** Implement per-account error tracking. Log every API failure to a Supabase `error_log` table. Send a daily "data quality" report showing which accounts had failures.

### 8.4 "Main accounts" Sub-Workflow Disabled in Controller

**Severity: HIGH** (immediate data collection issue)
The `Call 'Facebook Data Pull -- Main accounts'` node in the Facebook Controller has `disabled: true`. This means the Main accounts data is NOT being pulled by the controller. The sub-workflow has its own Schedule Trigger (every 3 hours) and appears to run independently, but this is a fragile and confusing setup.

**Fix:** Investigate why this was disabled. Either re-enable in the controller or document why it runs independently. The current state is ambiguous and error-prone.

### 8.5 Balance Division Factor Uncertainty

**Severity: MEDIUM**
In `Code in JavaScript5`, Facebook balance and amount_spent values are divided by 100 to convert from "micros" to currency units. The code includes a comment: `// استخدم 100 أو 10000 حسب تجربتك الواقعية` ("use 100 or 10000 based on your real-world experience"). This suggests uncertainty about the correct conversion factor.

Facebook's API typically returns amounts in the **account currency's smallest unit** (e.g., cents for USD, piasters for EGP). For EGP, the factor should be 100 (100 piasters = 1 EGP). However, Facebook has historically been inconsistent about this across endpoints.

**Fix:** Verify the correct conversion factor by comparing API responses to actual account values in Facebook Ads Manager. Document the factor per endpoint.

---

## 9. Prioritized Action Plan

### IMMEDIATE (Before Migration Begins)

| # | Action | Why | Effort |
|---|--------|-----|--------|
| 1 | Rotate TikTok API token | Currently exposed in git history | 30 min |
| 2 | Move TikTok token to n8n credentials | Prevent future exposure | 1 hour |
| 3 | Verify Facebook token type | Determine if expiration is imminent | 15 min |
| 4 | Investigate disabled "Main accounts" controller node | May indicate existing data gap | 30 min |
| 5 | Add .gitignore for workflow JSONs with tokens | Prevent future exposure | 10 min |
| 6 | Export complete backup of Supabase + Google Sheets | Safety net before any changes | 1 hour |

### PHASE 1 (Security & Foundation)

| # | Action | Why | Effort |
|---|--------|-----|--------|
| 7 | Migrate to System User Tokens (Facebook) | Eliminate token expiration risk | 2-3 hours |
| 8 | Implement OAuth2 refresh flow (TikTok) | Automated token management | 4-6 hours |
| 9 | Set up n8n external monitoring | Detect instance outages | 1 hour |
| 10 | Implement heartbeat workflow | Detect silent failures | 2 hours |
| 11 | Standardize Facebook API on v23.0 | Avoid v22.0 deprecation | 2 hours |

### PHASE 2 (Migration & Alerting)

| # | Action | Why | Effort |
|---|--------|-----|--------|
| 12 | Submit WhatsApp message templates for approval | Long lead time | 1 hour (then wait) |
| 13 | Initiate WhatsApp Business verification if needed | Long lead time | 1 hour (then wait) |
| 14 | Implement parallel old/new workflow execution | Zero-downtime migration | 8-12 hours |
| 15 | Build data validation scripts | Verify migration integrity | 4-6 hours |
| 16 | Implement alert batching/deduplication | Prevent alert fatigue | 4-6 hours |

### PHASE 3 (Scale & Optimize)

| # | Action | Why | Effort |
|---|--------|-----|--------|
| 17 | Implement database partitioning | Time-series performance | 4-6 hours |
| 18 | Implement data retention policies | Control storage growth | 3-4 hours |
| 19 | Implement batch API calls (Facebook) | Scale to 100+ accounts | 6-8 hours |
| 20 | Implement adaptive polling frequency | Optimize API usage | 4-6 hours |

---

## Sources & Confidence Notes

| Topic | Source | Confidence |
|-------|--------|------------|
| Facebook token types and lifetimes | Training data (Meta developer docs through May 2025) | MEDIUM - verify current docs |
| Facebook rate limiting model (BUCRL) | Training data (Meta developer docs) | MEDIUM - thresholds change frequently |
| Facebook API version deprecation schedule | Training data + estimation from historical patterns | LOW - verify exact dates |
| TikTok token exposure in workflows | Direct inspection of workflow JSON files | HIGH - confirmed |
| TikTok API stability assessment | Training data (developer community) | MEDIUM |
| WhatsApp Cloud API pricing | Training data (Meta pricing pages) | LOW - pricing changes frequently |
| WhatsApp template approval process | Training data (Meta developer docs) | MEDIUM |
| WhatsApp 24-hour window | Training data (fundamental platform constraint) | HIGH |
| Supabase tier limits | Training data (Supabase pricing page) | MEDIUM - verify current tiers |
| Current workflow architecture | Direct inspection of 8 workflow JSON files | HIGH - confirmed |
| Data growth projections | Estimated from current account count and planned architecture | MEDIUM |
| Egypt PDPL status | Training data | LOW - verify current implementation status |

**Key areas requiring live verification before implementation:**
1. Facebook Graph API v22.0 exact deprecation date
2. Current Supabase pricing tiers and limits
3. WhatsApp Cloud API pricing for Egypt
4. TikTok Business API current authentication documentation
5. n8n Cloud pricing and feature comparison
6. TimescaleDB availability on Supabase
