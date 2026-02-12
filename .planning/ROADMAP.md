# Roadmap -- Targetspro Ad Spend Monitoring Platform

## Milestone 1: MVP Platform

### Phase 0: Emergency Security Fixes
**Goal**: Eliminate critical security vulnerabilities -- rotate exposed tokens, secure credential storage
**Requirements**: R1.1, R1.2, R1.3, R1.5
**Status**: Complete

### Phase 1: Database Foundation & Schema Migration
**Goal**: Create the normalized database schema that everything else depends on
**Requirements**: R2.1, R2.2, R2.3, R2.4, R2.7, R2.8
**Depends on**: Phase 0
**Plans:** 1 plan
**Status**: Complete

Plans:
- [x] 01-01-PLAN.md -- Database Foundation & Schema Migration (core schema, RLS, triggers, seed data, migration script, TypeScript types)

### Phase 2: n8n Pipeline Consolidation
**Goal**: Replace 8 fragile workflows with 4 robust, parameterized pipelines writing to the new schema
**Requirements**: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8
**Depends on**: Phase 1
**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md -- Facebook Ingestion workflow (batch API, balance conversion, pipeline logging, dual-write)
- [ ] 02-02-PLAN.md -- TikTok Ingestion workflows (2 workflows, separate credentials, per-account processing)
- [ ] 02-03-PLAN.md -- Controller workflow + Error Handler + system verification checkpoint

### Phase 3: Dashboard MVP
**Goal**: Build the real-time web dashboard for monitoring all ad accounts
**Requirements**: R4.1-R4.10
**Depends on**: Phase 1, Phase 2

### Phase 4: Alert Engine (Email + Telegram)
**Goal**: Implement smart, multi-channel alerting with configurable rules and escalation
**Requirements**: R5.1-R5.9
**Depends on**: Phase 1, Phase 2, Phase 3

### Phase 5: WhatsApp Integration & Polish
**Goal**: Add WhatsApp as alert channel and polish the platform
**Requirements**: R6.1-R6.3
**Depends on**: Phase 4
