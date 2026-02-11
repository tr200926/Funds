# Roadmap — Targetspro Ad Spend Monitoring Platform

## Milestone 1: MVP Platform

### Phase 0: Emergency Security Fixes
**Goal**: Eliminate critical security vulnerabilities — rotate exposed tokens, secure credential storage
**Requirements**: R1.1, R1.2, R1.3, R1.5
**Delivers**:
- Rotate both hardcoded TikTok access tokens
- Move all API tokens to n8n credential store
- Verify Facebook token types (System User vs User tokens)
- Remove secrets from workflow JSON files
- Clean git history of exposed tokens
**Success Criteria**: Zero hardcoded secrets in any file; all existing workflows still function with credential-store tokens
**Research needed**: No (straightforward token rotation)

### Phase 1: Database Foundation & Schema Migration
**Goal**: Create the normalized database schema that everything else depends on
**Requirements**: R2.1, R2.2, R2.3, R2.4, R2.7, R2.8
**Delivers**:
- Normalized Supabase schema (10 tables: organizations, users, ad_accounts, spend_records, balance_snapshots, alert_rules, alerts, alert_deliveries, notification_channels, pipeline_runs)
- `org_id` on all tables for multi-tenant readiness
- Row Level Security policies for all tables
- Supabase Auth with admin/manager/viewer roles
- Data migration script from 7 old tables to new schema
- TypeScript type generation from schema
**Success Criteria**: All old data migrated without loss; RLS policies enforced; Auth login works with role assignment
**Depends on**: Phase 0
**Research needed**: Yes — Supabase Vault availability, pg_net extension status, current Supabase CLI migration workflow

### Phase 2: n8n Pipeline Consolidation
**Goal**: Replace 8 fragile workflows with 3 robust, parameterized pipelines writing to the new schema
**Requirements**: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8
**Delivers**:
- 3 consolidated workflows: Controller, Facebook Ingestion (parameterized), TikTok Ingestion (parameterized)
- All Facebook calls on Graph API v23.0
- Error logging to pipeline_runs table
- Google Sheets dependency eliminated
- Correct Cairo timezone handling
- Dual-write validation period (old + new tables)
- Batch API requests for Facebook
**Success Criteria**: New 3 workflows produce identical data to old 8 workflows; zero Google Sheets writes; pipeline health logged correctly
**Depends on**: Phase 1
**Research needed**: Yes — n8n parameterized workflow support, credential selection via expressions, Main accounts disabled investigation

### Phase 3: Dashboard MVP
**Goal**: Build the real-time web dashboard for monitoring all ad accounts
**Requirements**: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6, R4.7, R4.8, R4.9, R4.10
**Delivers**:
- Next.js App Router project with TypeScript
- Unified account overview (all platforms)
- Account detail pages with spend/balance charts
- Platform, status, and BM filters
- Supabase Realtime live updates
- Auth login with role-based access
- Pipeline health monitoring page
- shadcn/ui + Tailwind + Recharts
**Success Criteria**: Dashboard loads <3s; real-time updates within 5s; all accounts visible; auth/roles enforced
**Depends on**: Phase 1, Phase 2 (data flowing)
**Research needed**: No (well-documented Next.js + Supabase patterns)

### Phase 4: Alert Engine (Email + Telegram)
**Goal**: Implement smart, multi-channel alerting with configurable rules and escalation
**Requirements**: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7, R5.8, R5.9, R2.5, R2.6
**Delivers**:
- Database triggers on spend_records/balance_snapshots INSERT
- Supabase Edge Functions for alert rule evaluation
- Alert rules: balance threshold, time-to-depletion, spend spike, zero-spend, status change
- Email delivery (SMTP/Resend)
- Telegram bot delivery
- Escalation tiers (info → warning → critical → emergency)
- Cooldown/deduplication logic
- Alert config UI in dashboard
- Alert history with acknowledgment
- 24/7 alerting (no time window restriction)
**Success Criteria**: Alerts fire within 60s; both channels deliver; no duplicates within cooldown; escalation works
**Depends on**: Phase 1, Phase 2, Phase 3 (for UI)
**Research needed**: Yes — Edge Function scheduling, pg_net trigger patterns

### Phase 5: WhatsApp Integration & Polish
**Goal**: Add WhatsApp as alert channel and polish the platform
**Requirements**: R6.1, R6.2, R6.3
**Delivers**:
- WhatsApp Cloud API integration
- Approved message templates (balance warning, critical alert, daily summary)
- Per-user channel opt-in settings
- Alert digest mode (batch alerts into single message)
- Daily summary notifications
- Report export from dashboard
**Success Criteria**: WhatsApp messages delivered; templates approved; users can toggle channels
**Depends on**: Phase 4
**Research needed**: Yes — WhatsApp Business verification for Egypt, template approval process, Cloud API pricing

---

## Phase Dependency Chain

```
Phase 0 (Security)
    └─→ Phase 1 (Database)
            └─→ Phase 2 (n8n Pipelines)
                    └─→ Phase 3 (Dashboard)
                    └─→ Phase 4 (Alerts) ← also needs Phase 3 for UI
                            └─→ Phase 5 (WhatsApp + Polish)
```

## Notes
- **Parallel operation**: Old workflows remain running until new ones are validated (dual-write in Phase 2)
- **WhatsApp templates**: Submit during Phase 4 development so they're approved by Phase 5
- **Multi-tenant**: All schema work in Phase 1 includes org_id scoping — no future migration needed
- **Cairo timezone**: Enforced project-wide using `Intl.DateTimeFormat` with `timeZone: 'Africa/Cairo'` (never manual UTC offset)
