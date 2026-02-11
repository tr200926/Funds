# Project Research Summary

**Project:** Targetspro Ad Spend Monitoring Platform
**Domain:** Full-stack ad spend monitoring / digital marketing agency operations
**Researched:** 2026-02-11
**Confidence:** MEDIUM (HIGH on existing system analysis and established patterns; MEDIUM on API-specific details requiring live verification)

---

## Executive Summary

Targetspro is replacing a fragmented system of 8 n8n workflows, Google Sheets tracking, and email-only alerts with a unified Next.js dashboard backed by Supabase. The existing system works but has critical security vulnerabilities (hardcoded API tokens in git history), massive code duplication (4 near-identical Facebook workflows), a dual-write architecture that creates data consistency risks, and an alert window limited to 9AM-12PM Cairo time via email only. Research across all four domains -- technology, architecture, quality practices, and risk assessment -- converges on a clear path forward: consolidate the data pipeline, normalize the database, build a real-time dashboard, and implement multi-channel alerting with configurable rules.

The recommended stack is **Next.js App Router + Supabase (database, auth, realtime, edge functions) + consolidated n8n (data pipelines only) + multi-channel alerts (Email, Telegram, WhatsApp)**. This stack leverages the existing Supabase instance and n8n deployment while replacing the Google Sheets dependency and fragmented workflow architecture. The architecture cleanly separates concerns: n8n handles scheduled API pulls, Supabase Edge Functions handle business logic (alert evaluation, notifications), and Next.js handles presentation. Database triggers bridge the data layer to the alerting engine, ensuring alerts fire regardless of which component writes data.

The single highest-priority action is **rotating the exposed TikTok tokens immediately** -- they are in plaintext in workflow files that are now in git history. Beyond that, the migration must be zero-disruption: old workflows continue running while new ones are built and validated in parallel. The phased approach (foundation, dual-write, switchover, cleanup) is non-negotiable given that this platform monitors live ad spend where a missed alert could mean wasted budget. WhatsApp integration should be deferred to Phase 2 due to template approval lead times, with Telegram serving as the primary real-time alert channel from day one.

---

## Key Findings

### Recommended Stack

The stack builds on existing infrastructure (Supabase, n8n) while adding a proper frontend and alerting layer. All four research documents agree on this stack without conflict.

**Core technologies:**
- **Next.js 14+ (App Router):** Dashboard framework -- SSR for initial loads, Client Components for real-time updates via Supabase Realtime subscriptions
- **Supabase (PostgreSQL + Auth + Realtime + Edge Functions):** Single source of truth, replacing the current dual-write to Supabase + Google Sheets. Already in use; needs schema redesign and RLS enablement
- **n8n (consolidated):** Data pipeline engine -- reduce from 8 workflows to 3 (one controller, one Facebook ingestion, one TikTok ingestion). n8n does API orchestration only; no business logic
- **TypeScript (strict mode):** End-to-end type safety with auto-generated Supabase types
- **shadcn/ui + Tailwind CSS:** Dashboard UI components -- copy-paste architecture, no runtime dependency
- **Recharts:** Dashboard charting -- spend trends, budget utilization, account comparisons
- **Vitest + Playwright:** Testing -- unit/integration tests with Vitest, E2E with Playwright (officially recommended by Next.js)
- **Sentry:** Error tracking with first-class Next.js support
- **Vercel:** Hosting -- native Next.js deployment with edge functions and cron

**Critical version requirements:**
- Facebook Graph API: Standardize on **v23.0** (v22.0 currently mixed in; approaching deprecation)
- TikTok Business API: **v1.3** (current, verified from existing workflows)
- Use `@supabase/ssr` (not the deprecated `@supabase/auth-helpers-nextjs`)

### Expected Features

**Must have (table stakes):**
- Unified dashboard showing all ad accounts (Facebook + TikTok) with current balance, daily spend, monthly spend, and status
- Configurable balance threshold alerts with multi-channel delivery (Email + Telegram minimum)
- Time-to-depletion prediction based on rolling average spend
- Role-based access (admin, manager, viewer) with Supabase Auth + RLS
- Historical spend tracking with trend charts (currently data is overwritten, not preserved)
- Pipeline health monitoring (detect when n8n workflows fail or data goes stale)
- Consolidated data pipeline replacing 8 workflows with 3

**Should have (differentiators):**
- Real-time dashboard updates via Supabase Realtime (no page refresh needed)
- Alert escalation tiers (info -> warning -> critical -> emergency) with configurable cooldowns
- Spend spike detection (today's spend vs. rolling average)
- Zero-spend detection (account stopped spending, might be paused)
- Account status change alerts (active -> disabled)
- Alert acknowledgment and resolution tracking
- Quiet hours configuration per notification channel

**Defer (v2+):**
- WhatsApp alert channel (requires template approval, business verification, per-conversation cost)
- Client portal (viewer role for external clients)
- Spend anomaly detection using standard deviation analysis
- Adaptive polling frequency (high-spend accounts polled more often)
- Database partitioning for time-series data (not needed until ~1M rows)
- Report export (CSV/PDF) from dashboard

### Architecture Approach

The architecture follows an event-driven model with scheduled ingestion. Three distinct operational concerns are cleanly separated: **data ingestion** (n8n pulls from ad APIs on schedule), **business logic** (Supabase Edge Functions evaluate alert rules triggered by database triggers), and **presentation** (Next.js serves dashboards with server-side rendering and client-side real-time subscriptions). This separation is critical -- the current system mixes business logic into n8n code nodes, making it untestable and fragile.

**Major components:**
1. **n8n Consolidated Workflows** -- Scheduled API pulls from Facebook Graph API and TikTok Business API, data normalization, writes to Supabase. Parameterized workflows replace per-BM duplicates.
2. **Supabase Database (normalized schema)** -- Replaces 7 separate identical tables with a unified `ad_accounts` table plus time-series tables (`spend_records`, `balance_snapshots`). Multi-tenant ready with `org_id` on every table.
3. **Supabase Edge Functions** -- Alert rule evaluation (triggered by database triggers on new data), notification dispatch (Email, Telegram, WhatsApp), token refresh automation, health checks.
4. **Database Triggers** -- Bridge between data writes and alert evaluation. When n8n inserts a new spend record or balance snapshot, a trigger invokes the alert evaluation Edge Function via `pg_net`.
5. **Next.js Dashboard** -- Server Components for initial data fetch (fast, no spinner), Client Components for real-time updates via Supabase Realtime. Auth middleware protects all dashboard routes.
6. **Supabase Auth + RLS** -- Email/password authentication, three roles (admin/manager/viewer), Row Level Security policies ensuring org-scoped data access. Service role key used only by n8n and Edge Functions.

**Key design decisions from architecture research:**
- Denormalized `current_*` fields on `ad_accounts` for fast dashboard reads, updated via triggers when new time-series data arrives
- Separate `balance_snapshots` (multiple per day) from `spend_records` (one per day) due to different granularities
- Alert rules use JSONB `config` column for flexible per-type parameters (avoids EAV anti-pattern)
- Alert deliveries tracked per-channel (one alert, multiple delivery attempts)
- Pipeline runs table preserves the existing STATUS WORKFLOWS health-check pattern with richer structure

### Critical Pitfalls

All four research files identify risks. The following are the top pitfalls where multiple documents converge:

1. **Hardcoded tokens in git history (CRITICAL)** -- TikTok access tokens `9f2251a...` and `b78538...` are in plaintext in workflow JSON files committed to git. Even if removed from current files, they persist in git history. **Immediate action required: rotate tokens, move to n8n credentials, consider git history cleanup.** This is the single highest-priority finding across all research.

2. **Alert gaps during migration (HIGH)** -- Current alerts fire only 9AM-12PM Cairo via email. If old workflows are disabled before new alerting is validated, missed alerts could mean depleted ad accounts running on zero budget. **Prevention: run old and new alerting in parallel for at least one week; replicate 9AM-12PM window first before expanding.**

3. **Cairo timezone hardcoded as UTC+3 (HIGH)** -- Multiple workflow nodes use `getUTCHours() + 3`, but Egypt has been UTC+2 since abolishing DST in 2014. All timestamps are off by 1 hour. **Prevention: use `Intl.DateTimeFormat` with `timeZone: 'Africa/Cairo'` exclusively; never manually add offsets.** The tech research provides the correct implementation.

4. **Supabase Realtime without RLS (HIGH)** -- Enabling Realtime on tables without RLS policies means all connected clients receive all changes regardless of org membership. **Prevention: always enable RLS before enabling Realtime. Test by connecting as different users.**

5. **Facebook API v22.0 deprecation (HIGH)** -- The current system mixes v22.0 and v23.0 calls. v22.0 is approaching end-of-life. **Prevention: standardize on v23.0 immediately; abstract API version into a single configurable constant.**

6. **Dual-write data inconsistency during migration (MEDIUM)** -- Both old (separate tables + Sheets) and new (unified table) systems will write data during the transition. The new schema normalizes differently. **Prevention: build a validation script comparing old vs. new data daily during migration; never modify old tables.**

7. **Facebook balance micro-unit conversion uncertainty (MEDIUM)** -- Code comments in Arabic suggest uncertainty about whether to divide by 100 or 10000. The correct factor for EGP is 100. **Prevention: verify by comparing API response to Facebook Ads Manager UI for the same account before migration.**

---

## Implications for Roadmap

Based on combined research, the project naturally divides into 6 phases ordered by dependency chain, security urgency, and risk mitigation.

### Phase 0: Emergency Security Fixes
**Rationale:** The hardcoded token exposure is a confirmed critical vulnerability that exists right now, independent of the new platform build. This must happen before any other work.
**Delivers:** Rotated tokens, secured credential storage, git hygiene
**Addresses:** Hardcoded TikTok tokens (Pitfall #1), hardcoded email addresses, Facebook token type verification
**Avoids:** Token compromise, unauthorized API access
**Effort estimate:** 1-2 days

### Phase 1: Database Foundation and Schema Migration
**Rationale:** Everything else depends on the normalized database schema. The dashboard cannot be built without proper tables. Alert rules need the schema. n8n consolidation targets the new tables. This is the foundation.
**Delivers:** New normalized Supabase schema (organizations, ad_accounts, spend_records, balance_snapshots, alert_rules, alerts, alert_deliveries, notification_channels, pipeline_runs), RLS policies, database triggers, Supabase Auth setup, data migration script from old tables, seed data
**Addresses:** Schema consolidation (7 tables -> 1 unified), multi-tenant readiness, historical data preservation, RLS enforcement
**Avoids:** Data loss during migration (Pitfall #6), Realtime without RLS (Pitfall #4)
**Uses:** Supabase CLI for migrations, TypeScript type generation
**Effort estimate:** 1-2 weeks

### Phase 2: n8n Pipeline Consolidation
**Rationale:** Depends on Phase 1 (new tables to write to). Must be done before the dashboard (dashboard reads from new tables populated by new workflows). The dual-write period validates data integrity.
**Delivers:** 3 consolidated n8n workflows (controller + Facebook ingestion + TikTok ingestion), parameterized sub-workflows, batch API calls, proper error logging to pipeline_runs table, elimination of Google Sheets as data source
**Addresses:** Workflow duplication (8 -> 3), Facebook API version standardization (v23.0), batch API calls (90 calls -> 3), Cairo timezone fix, Google Sheets dependency removal
**Avoids:** Alert gaps during transition (Pitfall #2), timezone errors (Pitfall #3), API version deprecation (Pitfall #5)
**Uses:** n8n credential management, Facebook batch API, TikTok Business API v1.3
**Dual-write period:** New workflows write to both old and new tables for 1-2 weeks of validation
**Effort estimate:** 2-3 weeks

### Phase 3: Dashboard MVP
**Rationale:** Depends on Phase 1 (schema) and Phase 2 (data flowing into new tables). The dashboard is the primary user-facing deliverable.
**Delivers:** Next.js App Router dashboard with: account overview (all platforms unified), account detail pages with spend charts, platform and status filtering, Supabase Realtime live updates, Supabase Auth login with role-based access, pipeline health monitoring page
**Addresses:** Must-have features (unified dashboard, trend charts, account overview), real-time updates, role-based access
**Avoids:** Client-side data fetching anti-pattern (use Server Components), polling anti-pattern (use Realtime)
**Uses:** Next.js 14+, shadcn/ui, Recharts, Supabase SSR auth pattern, Supabase Realtime
**Implements:** Presentation layer of the architecture
**Effort estimate:** 3-4 weeks

### Phase 4: Alert Engine (Email + Telegram)
**Rationale:** Depends on Phase 1 (alert_rules and alerts tables), Phase 2 (data triggers for alert evaluation), and partially on Phase 3 (dashboard UI for alert configuration). Email + Telegram are free, require no approval processes, and cover the immediate need.
**Delivers:** Supabase Edge Functions for alert evaluation and notification dispatch, configurable alert rules (balance threshold, time-to-depletion, spend spike, zero-spend, status change), email alerts via Resend/SMTP, Telegram bot alerts, alert history and acknowledgment UI in dashboard, cooldown/deduplication logic, escalation tiers
**Addresses:** Multi-channel alerting (replacing email-only 9AM-12PM window), alert configuration UI, alert history
**Avoids:** Alert fatigue (Pitfall #7 -- batching/deduplication), missed alerts during quiet hours (escalation bypasses quiet hours for emergencies)
**Uses:** Supabase Edge Functions (Deno), pg_net for trigger-to-function calls, Telegram Bot API, Resend API
**Implements:** Alert engine architecture (evaluation -> deduplication -> dispatch -> logging)
**Effort estimate:** 2-3 weeks

### Phase 5: WhatsApp Integration and Polish
**Rationale:** WhatsApp requires template approval (24-48 hours minimum) and potentially business verification (1-4 weeks). By Phase 5, templates submitted in Phase 4 should be approved. This phase also covers deferred features.
**Delivers:** WhatsApp Cloud API alert channel, alert digest mode (batch multiple alerts into one message), daily summary notifications, report export from dashboard, adaptive polling frequency for n8n
**Addresses:** WhatsApp alert delivery, alert batching to prevent fatigue, export functionality
**Avoids:** WhatsApp template rejection blocking the entire project (Telegram is already live), 24-hour messaging window constraints (self-contained template messages with dashboard links)
**Uses:** WhatsApp Cloud API v23.0, Meta Business verification
**Effort estimate:** 2-3 weeks

### Phase 6: Scale and Optimize (Future)
**Rationale:** Only needed as account count grows beyond ~100. The architecture supports this growth but the optimizations are premature at current scale (~40-60 accounts).
**Delivers:** Database partitioning for time-series tables, data retention policies (aggregate old data), materialized views for dashboard aggregations, connection pooling optimization, client portal (viewer role for external clients)
**Addresses:** Time-series data growth (Pitfall #7.1), query performance at scale, storage optimization
**Effort estimate:** Ongoing

### Phase Ordering Rationale

- **Security (Phase 0) comes first** because the token exposure is a live vulnerability. No other work should begin until this is resolved.
- **Database (Phase 1) before anything else** because every other component depends on the schema. You cannot build the dashboard without tables, cannot consolidate workflows without a target, cannot evaluate alerts without rules tables.
- **n8n consolidation (Phase 2) before dashboard (Phase 3)** because the dashboard needs data flowing into the new schema to be useful. During this phase, the old system continues to operate as a safety net.
- **Dashboard (Phase 3) before alerts (Phase 4)** because the alert configuration UI lives in the dashboard. However, the database-level alert infrastructure (triggers, Edge Functions) can be built in parallel.
- **Email + Telegram (Phase 4) before WhatsApp (Phase 5)** because WhatsApp requires external approvals with unpredictable timelines. Telegram is free and instant. Submit WhatsApp templates during Phase 4 so they are approved by Phase 5.
- **Scale optimizations (Phase 6) are deferred** because the current account count (~40-60) is well within unoptimized query performance. Premature optimization would add complexity without benefit.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 1 (Database):** Verify Supabase Vault availability on current plan; verify pg_net extension is enabled; check current Supabase CLI migration workflow
- **Phase 2 (n8n):** Verify n8n version supports parameterized sub-workflows (workflow inputs); research credential selection via expressions; investigate why "Main accounts" sub-workflow is disabled in controller
- **Phase 4 (Alerts):** Verify Supabase Edge Function scheduling options (can they run on cron natively, or need Vercel Cron?); research pg_net HTTP call patterns from triggers
- **Phase 5 (WhatsApp):** Research WhatsApp Business verification timeline for Egypt; verify current Cloud API pricing; research template approval best practices

**Phases with standard/well-documented patterns (skip deep research):**
- **Phase 0 (Security):** Token rotation is straightforward; n8n credential management is well-documented
- **Phase 3 (Dashboard):** Next.js App Router + Supabase SSR is a well-documented pattern; shadcn/ui has extensive component library; Recharts has mature API
- **Phase 4 (Telegram):** Telegram Bot API is a simple, stable REST API with no approval process

---

## Cross-Cutting Themes

Several themes emerged across multiple research documents that should inform every phase:

1. **Cairo timezone correctness:** The bug (UTC+3 instead of UTC+2) appears in tech, architecture, and concerns research. Every phase that touches timestamps must use `Intl.DateTimeFormat` with `timeZone: 'Africa/Cairo'`. This is not a one-time fix; it is a pattern that must be enforced project-wide.

2. **Service role vs. anon key separation:** n8n and Edge Functions use the service role key (bypasses RLS). The dashboard uses the anon key (subject to RLS). This boundary must be maintained in every phase. Mixing them up would either break data ingestion (if n8n uses anon key) or bypass security (if dashboard uses service role key).

3. **Parallel operation during migration:** All research documents emphasize zero-disruption migration. No phase should disable existing functionality until the replacement is validated. This adds implementation effort but is non-negotiable for a system monitoring live ad spend.

4. **Multi-tenant readiness from day one:** Although Targetspro is currently single-tenant, the schema includes `org_id` on every table and RLS policies are scoped by organization. This avoids a painful future migration if the platform is opened to multiple agencies or clients.

---

## Conflicts and Tensions

1. **Monorepo vs. simplicity:** The architecture research recommends a Turborepo monorepo with separate packages (shared, supabase, web). The tech research suggests a simpler flat Next.js project structure. **Recommendation: Start with the flat structure (tech research). The monorepo adds complexity that is not justified at current team size. Migrate to monorepo if Edge Functions begin sharing significant code with the Next.js app.**

2. **Schema differences between tech and architecture research:** Both propose similar schemas but with slightly different table names and structures (e.g., `spend_snapshots` vs. `spend_records` + `balance_snapshots`). **Recommendation: Use the architecture research schema (more detailed, with separate time-series tables for spend and balance due to different granularities). It is the more thoroughly thought-through design.**

3. **Alert evaluation trigger approach:** Tech research suggests a single trigger on `ad_accounts` UPDATE. Architecture research suggests triggers on `spend_records` INSERT and `balance_snapshots` INSERT. **Recommendation: Use the architecture approach (triggers on time-series tables). This is more precise -- it fires when new data arrives, not on every account metadata update.**

4. **Edge Function scheduling for periodic checks:** The alert engine needs both event-driven evaluation (triggered by new data) and periodic evaluation (check all accounts every hour for time-based rules like escalation). Research identifies this gap but does not resolve it conclusively. **Recommendation: Use Vercel Cron for periodic evaluation (call a Next.js API route that invokes the Edge Function). This avoids dependency on Supabase-native cron which may not be available.**

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **MEDIUM-HIGH** | Next.js + Supabase + n8n is a well-established pattern. Specific API versions and library APIs need live verification. |
| Features | **HIGH** | Features derived directly from analysis of existing 8 workflow JSON files and current system gaps. Clear understanding of what exists and what is missing. |
| Architecture | **MEDIUM** | Core patterns are well-documented. Supabase-specific features (pg_net, Vault, Edge Function triggers) need verification on the actual instance. |
| Pitfalls | **HIGH** | Critical pitfalls (hardcoded tokens, timezone bug, API version mixing) confirmed directly from workflow file inspection. Risk severity assessments are well-grounded. |

**Overall confidence: MEDIUM-HIGH**

The research is grounded in direct analysis of the existing system (8 workflow JSON files) combined with established patterns for the recommended stack. The main uncertainty is around Supabase-specific features (Vault, pg_net, Edge Function capabilities) that need verification against the actual instance and current documentation.

### Gaps to Address

These items could not be resolved during research and need attention during planning or early implementation:

- **Supabase Vault availability:** Verify that Vault is enabled on the current Supabase plan. If not, use environment variables for Edge Functions and n8n credentials for pipeline tokens. This affects Phases 1 and 4.
- **Supabase Edge Function scheduling:** Can Edge Functions be triggered on a cron natively? If not, Vercel Cron or n8n must handle periodic alert checks (escalation, daily digests). This affects Phase 4.
- **pg_net extension status:** Required for database trigger -> Edge Function invocation. If not available, alerts must be evaluated via webhook from n8n or Vercel Cron instead of database triggers. This affects the entire alert engine architecture.
- **n8n version and parameterized workflow support:** The consolidation plan depends on n8n supporting workflow inputs/parameters. Verify the current n8n version. This affects Phase 2.
- **Facebook System User token setup per BM:** Each of the 4 Business Managers needs a System User. Some BMs may not have this capability. This affects Phase 2.
- **TikTok token refresh mechanism:** The exact OAuth2 refresh flow for TikTok Business API needs verification. Token lifetime and auto-refresh availability are unclear. This affects Phase 2.
- **Why "Main accounts" sub-workflow is disabled:** This may indicate an existing data collection gap that needs immediate investigation. This affects Phase 0/1.
- **Facebook balance micro-unit conversion factor:** The code comments express uncertainty about dividing by 100 vs. 10000. Must verify against live data before migration. This affects Phase 2.
- **Vercel pricing tier needed:** Estimate required for Next.js with Supabase Realtime connections and API routes. This affects project budgeting.
- **WhatsApp Business API eligibility for Egypt:** Verify that Meta Business account meets WhatsApp API requirements and template approval is feasible for Egypt-based businesses. This affects Phase 5.

---

## Sources

### Primary (HIGH confidence)
- Direct analysis of 8 n8n workflow JSON files in project repository (Facebook Data Pull -- Main/Pasant/Aligomarketing/Xlerate, TikTok Data Pull -- accounts/tiktok2, both controllers)
- Next.js official documentation v16.1.6 (testing strategy, Vitest/Playwright recommendations)
- Existing Supabase table analysis (7 tables with identified schemas and column names)

### Secondary (MEDIUM confidence)
- Supabase documentation patterns (RLS, Realtime, Edge Functions, Auth SSR) -- based on training data, verify against current docs
- Facebook Graph API v22.0/v23.0 patterns -- endpoints verified from workflow files, rate limits and deprecation schedule based on training data
- TikTok Business API v1.3 patterns -- endpoints verified from workflow files, token management based on training data
- n8n credential management and workflow architecture -- based on established n8n patterns

### Tertiary (LOW confidence)
- Supabase Vault API and availability -- needs live verification
- WhatsApp Cloud API pricing for Egypt region -- pricing changes frequently
- Facebook Graph API v22.0 exact deprecation date -- estimated from historical patterns
- TimescaleDB availability on Supabase -- needs verification
- Egypt's Personal Data Protection Law (PDPL) implementation status -- needs verification

---
*Research completed: 2026-02-11*
*Research files: tech.md, architecture.md, quality.md, concerns.md*
*Ready for roadmap: yes*
