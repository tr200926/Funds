# Requirements — Targetspro Ad Spend Monitoring Platform

## Milestone 1: MVP Platform

### R1: Security & Credential Management
- **R1.1**: All API tokens (Facebook, TikTok) stored in n8n credential store, never in workflow JSON files
- **R1.2**: Hardcoded TikTok access tokens rotated and removed from git history
- **R1.3**: Supabase service role key used only by n8n and Edge Functions, never exposed to client
- **R1.4**: Environment variables used for all secrets in Next.js and Edge Functions
- **R1.5**: Facebook token type verified (System User preferred for non-expiring tokens)
- **Success Criteria**: Zero hardcoded secrets in any committed file; all API calls succeed with credential-store tokens

### R2: Database Foundation
- **R2.1**: Normalized schema with tables: organizations, users, ad_accounts, spend_records, balance_snapshots, alert_rules, alerts, alert_deliveries, notification_channels, pipeline_runs
- **R2.2**: All tables include `org_id` column for multi-tenant readiness
- **R2.3**: Row Level Security (RLS) enabled on all tables before Realtime is enabled
- **R2.4**: Supabase Auth configured with three roles: admin, manager, viewer
- **R2.5**: Database triggers on spend_records and balance_snapshots INSERT to invoke alert evaluation
- **R2.6**: Denormalized `current_balance`, `current_daily_spend` fields on ad_accounts updated via triggers
- **R2.7**: Data migration script that copies existing data from 7 old tables into new schema without data loss
- **R2.8**: All timestamps stored in UTC, displayed in Africa/Cairo timezone using `Intl.DateTimeFormat`
- **Success Criteria**: All old data migrated to new schema; RLS policies pass security tests; triggers fire correctly on INSERT

### R3: n8n Pipeline Consolidation
- **R3.1**: Reduce 8 workflows to 4: one controller, one Facebook ingestion (1 API connection serving all 4 BMs), two TikTok ingestion workflows (2 separate API connections)
- **R3.2**: Standardize all Facebook API calls on Graph API v23.0
- **R3.3**: Proper error handling with logging to pipeline_runs table
- **R3.4**: Eliminate Google Sheets as data destination (Supabase is single source of truth)
- **R3.5**: Cairo timezone handled correctly using Intl API (not manual UTC+3 offset)
- **R3.6**: Dual-write period: new workflows write to both old and new tables for validation
- **R3.7**: Facebook balance conversion verified (cents to currency, factor of 100 for EGP)
- **R3.8**: Batch API requests where possible (Facebook batch API)
- **Success Criteria**: 4 workflows produce identical data to 8 old workflows; pipeline_runs table shows healthy status; zero Google Sheets writes

### R4: Dashboard
- **R4.1**: Next.js App Router with TypeScript strict mode
- **R4.2**: Unified account overview page showing all Facebook + TikTok accounts with: account name, platform, current balance, daily spend, monthly spend, status, time-to-depletion
- **R4.3**: Account detail page with: spend trend chart (daily), balance history chart, funding source info, alert history
- **R4.4**: Filter by platform (Facebook/TikTok), status (active/disabled/paused), business manager
- **R4.5**: Real-time updates via Supabase Realtime (no page refresh needed)
- **R4.6**: Supabase Auth login page with role-based access control
- **R4.7**: Pipeline health monitoring page showing workflow run history, last run time, error counts
- **R4.8**: Responsive design (desktop-first, mobile-friendly)
- **R4.9**: shadcn/ui components + Tailwind CSS for styling
- **R4.10**: Recharts for spend/balance visualizations
- **Success Criteria**: Dashboard loads in <3s; real-time updates appear within 5s of data change; all accounts visible with correct data; login/auth works with role restrictions

### R5: Alert Engine
- **R5.1**: Configurable alert rules per account: balance threshold, time-to-depletion threshold, spend spike detection (vs rolling average), zero-spend detection, account status change
- **R5.2**: Multi-channel delivery: Email (SMTP/Resend) + Telegram Bot
- **R5.3**: Escalation tiers: info → warning → critical → emergency
- **R5.4**: Cooldown/deduplication: same alert not re-sent within configurable window
- **R5.5**: Alert configuration UI in dashboard (admin/manager can set rules)
- **R5.6**: Alert history page with acknowledgment capability
- **R5.7**: Time-to-depletion calculated using rolling 7-day average spend
- **R5.8**: Emergency alerts bypass quiet hours
- **R5.9**: Alerts fire 24/7 (remove current 9AM-12PM restriction)
- **Success Criteria**: Alerts fire within 60s of triggering condition; all channels deliver successfully; no duplicate alerts within cooldown window; escalation tiers work correctly

### R6: WhatsApp Integration (Deferred to v1.1)
- **R6.1**: WhatsApp Cloud API integration as additional alert channel
- **R6.2**: Message templates approved by Meta for: balance warning, critical alert, daily summary
- **R6.3**: Opt-in per user (not all users need WhatsApp alerts)
- **Success Criteria**: WhatsApp messages delivered successfully; templates approved; user can enable/disable per channel

## Non-Functional Requirements

### NFR1: Performance
- Dashboard initial load: <3 seconds
- Real-time update latency: <5 seconds from data write to UI update
- API data pull cycle: complete within 15 minutes for all accounts

### NFR2: Reliability
- Data pipeline uptime: >99% (missed pulls detected and retried)
- Alert delivery: at least one channel must succeed per alert
- Zero data loss during migration

### NFR3: Security
- All API tokens in secure credential stores
- RLS on all database tables
- No sensitive data in client-side code or logs
- HTTPS everywhere

### NFR4: Maintainability
- TypeScript strict mode
- ESLint + Prettier enforced
- Supabase migrations version-controlled
- n8n workflows exported and versioned in git (without secrets)
