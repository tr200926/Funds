# Architecture Patterns

**Domain:** Ad Spend Monitoring Platform (Digital Marketing Agency)
**Researched:** 2026-02-11
**Overall Confidence:** MEDIUM (based on code analysis of existing n8n workflows + established patterns for Next.js/Supabase/n8n stack; web search unavailable for latest-version verification)

---

## Table of Contents

1. [Current System Analysis](#1-current-system-analysis)
2. [Recommended Target Architecture](#2-recommended-target-architecture)
3. [System Architecture Diagram](#3-system-architecture-diagram)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Database Schema Design](#5-database-schema-design)
6. [Alerting Engine Architecture](#6-alerting-engine-architecture)
7. [Authentication and Authorization](#7-authentication-and-authorization)
8. [Project Structure](#8-project-structure)
9. [Migration Strategy](#9-migration-strategy)
10. [Anti-Patterns to Avoid](#10-anti-patterns-to-avoid)
11. [Scalability Considerations](#11-scalability-considerations)

---

## 1. Current System Analysis

### What Exists Today (from n8n workflow analysis)

The current system consists of **8 n8n workflows** organized as:

```
CONTROLLERS (2):
  Main_Controller => Facebook  (every 3 hours)
    -> Facebook Data Pull -- Main accounts     (DISABLED)
    -> Facebook Data Pull -- Pasant            (active, 2 min wait between)
    -> Facebook Data Pull -- aligomarketing    (active, 3 min wait between)
    -> Facebook Data Pull -- Xlerate           (active, sequential)

  Main_Controller => Tiktok    (every 5 hours)
    -> Tiktok Data Pull -- Tiktok accounts     (active, 3 min wait between)
    -> Tiktok Data Pull -- tiktok2             (active, sequential)
```

### Current Data Flow (observed from workflow JSON)

```
Schedule Trigger (every 3h / 5h)
  |
  v
Get account list from Supabase table
  |
  v
For each account (batched):
  |
  +--> Facebook Graph API v22.0/v23.0 or TikTok Business API v1.3
  |      - Account info (name, balance, status, funding_source_details)
  |      - Daily spend (insights, yesterday)
  |      - Monthly spend (insights, month-to-date)
  |
  v
Transform data (JavaScript code nodes)
  |
  +--> Update Supabase table (per-account rows)
  +--> Update Google Sheets ("Abdo n8n Tracking Spending Targetspro")
  +--> Time-window check (9 AM - 12 PM Cairo)
         |
         +--> Filter accounts below threshold ("if" column from sheets)
         +--> Build HTML table email
         +--> Send via SMTP (info@targetspro.com)
```

### Current System Problems Identified

| Problem | Evidence from Workflow JSON | Impact |
|---------|---------------------------|--------|
| **Hardcoded API tokens** | TikTok Access-Token `9f2251a...` directly in HTTP Request headers | Security risk -- tokens visible in workflow exports |
| **4 duplicate Facebook workflows** | Nearly identical logic across Main/Pasant/Aligo/Xlerate | Maintenance burden, inconsistency risk |
| **Dual data stores** | Both Supabase AND Google Sheets updated in parallel | Data drift, wasted API calls |
| **Rigid email-only alerting** | Only SMTP send, only 9 AM-12 PM window | Missed critical alerts outside window |
| **Threshold from Sheets** | "if" column read from Google Sheets for balance threshold | No programmatic threshold management |
| **No error recovery** | `onError: "continueRegularOutput"` everywhere | Silently swallows failures |
| **Sequential with waits** | 2-3 minute `Wait` nodes between sub-workflows | Total pipeline takes ~15+ minutes per cycle |
| **STATUS WORKFLOWS table** | Batch evaluator writes success/fail status | Good -- this pattern should be preserved |

### What to Preserve

- The `STATUS WORKFLOWS` health-check pattern (logging workflow execution status)
- The Supabase table structure concept (per-platform tables)
- The batch evaluator pattern (detecting token/credential failures)
- The schedule interval approach (3h Facebook, 5h TikTok is appropriate for API rate limits)

---

## 2. Recommended Target Architecture

### Architecture Philosophy

**Event-driven with scheduled ingestion.** The system has three distinct operational concerns that should be separated:

1. **Data Ingestion** (n8n) -- Pull data from ad platform APIs on schedule
2. **Business Logic** (Supabase Edge Functions + Database triggers) -- Evaluate rules, detect anomalies
3. **Presentation** (Next.js) -- Display dashboards, manage configuration

**Why this separation:**
- n8n is excellent for API orchestration but poor for complex business logic
- Supabase Edge Functions run close to the data, minimizing latency for rule evaluation
- Next.js handles the UI layer with server-side rendering for dashboards
- Database triggers ensure alerting happens regardless of which component writes data

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **n8n Workflows** | Scheduled API pulls, data normalization, error reporting | Supabase (write), Ad Platform APIs (read) |
| **Supabase Database** | Single source of truth, time-series storage, RLS enforcement | All components |
| **Supabase Edge Functions** | Alert rule evaluation, notification dispatch, predictive calculations | Database (read/write), notification APIs (write) |
| **Supabase Realtime** | Push data changes to connected dashboards | Next.js (push) |
| **Supabase Auth** | User authentication, session management, role assignment | Next.js (auth flow), Database (RLS) |
| **Next.js App** | Dashboard UI, alert rule configuration, user management | Supabase (read/write via client SDK), Supabase Auth |
| **Database Triggers** | Invoke Edge Functions on data changes (new spend records, balance changes) | Edge Functions (invoke) |

---

## 3. System Architecture Diagram

```
+------------------------------------------------------------------+
|                        EXTERNAL APIs                              |
|  +------------------+    +-------------------+                    |
|  | Facebook Graph   |    | TikTok Business   |                    |
|  | API v23.0        |    | API v1.3          |                    |
|  +--------+---------+    +--------+----------+                    |
|           |                       |                               |
+-----------+-----------------------+-------------------------------+
            |                       |
            v                       v
+------------------------------------------------------------------+
|                     n8n (Self-Hosted)                             |
|                                                                  |
|  +--------------------+    +---------------------+               |
|  | Facebook Ingestion |    | TikTok Ingestion    |               |
|  | Workflow           |    | Workflow             |               |
|  | (consolidated, 1)  |    | (consolidated, 1)   |               |
|  +--------+-----------+    +--------+------------+               |
|           |                         |                            |
|           |  +---------------------+|                            |
|           |  | Health Monitor       ||                            |
|           |  | Workflow             ||                            |
|           |  +---------------------+|                            |
+-----------+-------------------------+----------------------------+
            |                         |
            v                         v
+------------------------------------------------------------------+
|                    SUPABASE (Cloud)                               |
|                                                                  |
|  +---------------------------+                                   |
|  |     PostgreSQL Database   |                                   |
|  |                           |                                   |
|  |  organizations            |                                   |
|  |  users / profiles         |                                   |
|  |  ad_accounts              |     +---------------------------+ |
|  |  platforms                | --> | Database Triggers          | |
|  |  spend_records (TS)       |     |  on_spend_record_insert   | |
|  |  balance_snapshots (TS)   |     |  on_balance_change        | |
|  |  alert_rules              |     +------------+--------------+ |
|  |  alerts                   |                  |                |
|  |  alert_deliveries         |                  v                |
|  |  notification_channels    |     +---------------------------+ |
|  |  pipeline_runs            |     | Edge Functions            | |
|  +---------------------------+     |                           | |
|                                    |  evaluate-alert-rules     | |
|  +---------------------------+     |  dispatch-notification    | |
|  |     Supabase Auth         |     |  calculate-predictions    | |
|  |  - Email/password login   |     |  health-check             | |
|  |  - Role-based (JWT)       |     +---------------------------+ |
|  +---------------------------+              |                    |
|                                             v                    |
|  +---------------------------+     +---------------------------+ |
|  |     Supabase Realtime     |     | Notification Dispatch     | |
|  |  - spend_records channel  |     |                           | |
|  |  - alerts channel         |     |  SMTP (Email)             | |
|  |  - balance channel        |     |  Telegram Bot API         | |
|  +---------------------------+     |  WhatsApp Business API    | |
|                                    +---------------------------+ |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                    Next.js (Vercel)                               |
|                                                                  |
|  +---------------------------+    +---------------------------+  |
|  | Server Components (RSC)   |    | Client Components         |  |
|  |                           |    |                           |  |
|  |  Dashboard pages          |    |  Real-time spend charts   |  |
|  |  Account listing          |    |  Alert notification bell  |  |
|  |  Alert history            |    |  Live balance indicators  |  |
|  |  Settings pages           |    |  Alert rule editor        |  |
|  +---------------------------+    +---------------------------+  |
|                                                                  |
|  +---------------------------+    +---------------------------+  |
|  | API Routes (if needed)    |    | Middleware                |  |
|  |  /api/webhook/n8n         |    |  Auth session validation  |  |
|  |  /api/reports/export      |    |  Role-based redirects     |  |
|  +---------------------------+    +---------------------------+  |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                         USERS                                     |
|  Agency Managers | Account Managers | (Future: Client Portal)    |
+------------------------------------------------------------------+
```

---

## 4. Data Flow Architecture

### Flow 1: Data Ingestion (n8n to Supabase)

This is the primary data pipeline. n8n pulls from ad platform APIs and writes normalized data to Supabase.

```
SCHEDULE: Facebook every 3h, TikTok every 5h
(aligned with API rate limits and data freshness needs)

n8n Consolidated Facebook Workflow:
+---------------------------------------------------------------+
|                                                               |
|  1. Read ad_accounts WHERE platform = 'facebook'              |
|     AND status = 'active' FROM Supabase                       |
|                                                               |
|  2. For each account (parameterized, not duplicated):         |
|     a. GET /v23.0/{account_id}                                |
|        ?fields=name,balance,account_status,                   |
|                funding_source_details{display_string}          |
|                                                               |
|     b. GET /v23.0/{account_id}/insights                       |
|        ?time_range[since]={yesterday}                         |
|        &time_range[until]={yesterday}                         |
|        &fields=spend,account_name                             |
|        (daily spend)                                          |
|                                                               |
|     c. GET /v23.0/{account_id}/insights                       |
|        ?time_range[since]={month_start}                       |
|        &time_range[until]={today}                             |
|        &fields=spend,account_name                             |
|        (MTD spend)                                            |
|                                                               |
|  3. Normalize to unified schema:                              |
|     {                                                         |
|       ad_account_id: UUID (FK),                               |
|       platform_account_id: "act_123456",                      |
|       date: "2026-02-11",                                     |
|       daily_spend: 1502.00,                                   |
|       mtd_spend: 42350.00,                                    |
|       balance: 15000.00,                                      |
|       currency: "EGP",                                        |
|       raw_response: {...}  -- for debugging                   |
|     }                                                         |
|                                                               |
|  4. UPSERT spend_records (conflict on ad_account_id + date)   |
|  5. INSERT balance_snapshots (append-only time-series)        |
|  6. INSERT pipeline_runs (execution log)                      |
+---------------------------------------------------------------+
```

### Flow 2: Alert Evaluation (Database Trigger to Edge Function)

```
TRIGGER: After INSERT on spend_records or balance_snapshots

+---------------------------------------------------------------+
|  Database Trigger: on_new_data_point                          |
|                                                               |
|  1. Invoke Edge Function: evaluate-alert-rules                |
|     Payload: { table, record_id, ad_account_id }             |
|                                                               |
|  2. Edge Function logic:                                      |
|     a. Load active alert_rules for this ad_account            |
|     b. For each rule, evaluate condition:                     |
|                                                               |
|        THRESHOLD rules:                                       |
|          balance <= rule.threshold_value                       |
|                                                               |
|        RATE_OF_CHANGE rules:                                  |
|          Query last N spend_records                           |
|          Calculate daily_spend delta                          |
|          If delta > rule.rate_threshold -> trigger             |
|                                                               |
|        TIME_TO_DEPLETION rules:                               |
|          avg_daily_spend = AVG(last 7 days spend)             |
|          days_remaining = balance / avg_daily_spend           |
|          If days_remaining <= rule.days_threshold -> trigger   |
|                                                               |
|     c. Deduplication check:                                   |
|        SELECT FROM alerts                                     |
|        WHERE ad_account_id = X                                |
|          AND alert_rule_id = Y                                |
|          AND created_at > NOW() - rule.cooldown_period        |
|          AND status != 'resolved'                             |
|        If exists -> skip (still in cooldown)                  |
|                                                               |
|     d. If triggered and not deduplicated:                     |
|        INSERT INTO alerts (severity, message, ...)            |
|        Invoke Edge Function: dispatch-notification            |
+---------------------------------------------------------------+
```

### Flow 3: Notification Dispatch (Edge Function to Channels)

```
+---------------------------------------------------------------+
|  Edge Function: dispatch-notification                         |
|                                                               |
|  Input: { alert_id }                                          |
|                                                               |
|  1. Load alert + alert_rule + ad_account details              |
|                                                               |
|  2. Determine recipients:                                     |
|     Load notification_channels WHERE:                         |
|       - org_id matches                                        |
|       - severity_filter includes this alert severity          |
|       - channel is enabled                                    |
|                                                               |
|  3. Escalation tier mapping:                                  |
|     WARNING  -> channels with min_severity = 'warning'        |
|     CRITICAL -> channels with min_severity <= 'critical'      |
|     EMERGENCY-> ALL channels (bypass quiet hours)             |
|                                                               |
|  4. For each channel:                                         |
|     a. Format message for channel type                        |
|     b. Dispatch:                                              |
|        - EMAIL:    SMTP via Supabase SMTP or external         |
|        - TELEGRAM: POST to Bot API sendMessage                |
|        - WHATSAPP: POST to WhatsApp Business API              |
|     c. INSERT alert_deliveries (channel, status, response)    |
|                                                               |
|  5. Respect quiet hours (except EMERGENCY):                   |
|     If current_time NOT in channel.active_hours:              |
|       Queue for delivery at next active window                |
|       (use pg_cron or a scheduled Edge Function)              |
+---------------------------------------------------------------+
```

### Flow 4: Dashboard Real-time Updates (Supabase Realtime to Next.js)

```
+---------------------------------------------------------------+
|  Supabase Realtime Subscriptions (Next.js client)             |
|                                                               |
|  Channel 1: spend_records                                     |
|    ON INSERT -> Update dashboard spend charts                 |
|    Filter: org_id = current_user.org_id (via RLS)             |
|                                                               |
|  Channel 2: alerts                                            |
|    ON INSERT -> Show notification toast                       |
|    ON UPDATE (status change) -> Update alert badge count      |
|                                                               |
|  Channel 3: balance_snapshots                                 |
|    ON INSERT -> Update balance indicators                     |
|    Highlight accounts approaching thresholds                  |
+---------------------------------------------------------------+
```

---

## 5. Database Schema Design

### Schema Overview

The schema is designed with these principles:
- **Multi-tenant ready**: Every data table has an `org_id` column, even if there is only one org now
- **Time-series friendly**: Append-only tables for spend and balance tracking with proper indexing
- **Normalized but practical**: Avoid over-normalization; keep frequent reads fast
- **Soft deletes**: Use `archived_at` instead of hard deletes for audit trail

### Entity Relationship Diagram

```
organizations (1)
  |
  +-- users/profiles (N)
  |     |
  |     +-- notification_channels (N)
  |
  +-- ad_accounts (N)
  |     |
  |     +-- spend_records (N, time-series)
  |     +-- balance_snapshots (N, time-series)
  |     +-- alert_rules (N)
  |           |
  |           +-- alerts (N)
  |                 |
  |                 +-- alert_deliveries (N)
  |
  +-- platforms (N)  [facebook, tiktok]
  |
  +-- pipeline_runs (N)
```

### Table Definitions

```sql
-- =============================================================
-- ORGANIZATIONS
-- =============================================================
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,         -- "targetspro"
  timezone    TEXT NOT NULL DEFAULT 'Africa/Cairo',
  settings    JSONB NOT NULL DEFAULT '{}',  -- org-level config
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ                   -- soft delete
);

-- For single-tenant start, seed one row:
-- INSERT INTO organizations (name, slug) VALUES ('Targetspro', 'targetspro');


-- =============================================================
-- USER PROFILES (extends Supabase auth.users)
-- =============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin', 'manager', 'viewer')),
  avatar_url  TEXT,
  settings    JSONB NOT NULL DEFAULT '{}',  -- user preferences
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_org ON profiles(org_id);


-- =============================================================
-- PLATFORMS (reference table)
-- =============================================================
CREATE TABLE platforms (
  id          TEXT PRIMARY KEY,              -- 'facebook', 'tiktok'
  display_name TEXT NOT NULL,                -- 'Facebook Ads', 'TikTok Ads'
  api_version TEXT,                          -- 'v23.0', 'v1.3'
  icon_url    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  config      JSONB NOT NULL DEFAULT '{}'    -- platform-specific settings
);

-- Seed:
-- INSERT INTO platforms VALUES ('facebook', 'Facebook Ads', 'v23.0', NULL, true, '{}');
-- INSERT INTO platforms VALUES ('tiktok', 'TikTok Ads', 'v1.3', NULL, true, '{}');


-- =============================================================
-- AD ACCOUNTS
-- =============================================================
CREATE TABLE ad_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  platform_id         TEXT NOT NULL REFERENCES platforms(id),
  platform_account_id TEXT NOT NULL,          -- "act_123456" (FB) or "7378858..." (TT)
  account_name        TEXT NOT NULL,
  business_manager    TEXT,                   -- "Main", "Pasant", "Xlerate", etc.
  currency            TEXT NOT NULL DEFAULT 'EGP',
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused', 'disabled', 'archived')),
  -- Current snapshot (denormalized for fast dashboard reads)
  current_balance     NUMERIC(14,2),
  current_daily_spend NUMERIC(14,2),
  current_mtd_spend   NUMERIC(14,2),
  last_synced_at      TIMESTAMPTZ,
  -- Metadata
  assigned_to         UUID REFERENCES profiles(id), -- account manager
  tags                TEXT[] DEFAULT '{}',
  metadata            JSONB NOT NULL DEFAULT '{}',   -- platform-specific fields
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at         TIMESTAMPTZ,

  UNIQUE(org_id, platform_id, platform_account_id)
);

CREATE INDEX idx_ad_accounts_org ON ad_accounts(org_id);
CREATE INDEX idx_ad_accounts_platform ON ad_accounts(platform_id);
CREATE INDEX idx_ad_accounts_status ON ad_accounts(status) WHERE status = 'active';
CREATE INDEX idx_ad_accounts_assigned ON ad_accounts(assigned_to) WHERE assigned_to IS NOT NULL;


-- =============================================================
-- SPEND RECORDS (time-series, append-mostly)
-- =============================================================
-- This is the core time-series table. One row per account per day.
-- UPSERT on (ad_account_id, date) to handle re-pulls.

CREATE TABLE spend_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  ad_account_id   UUID NOT NULL REFERENCES ad_accounts(id),
  date            DATE NOT NULL,              -- the spend date
  daily_spend     NUMERIC(14,2) NOT NULL DEFAULT 0,
  mtd_spend       NUMERIC(14,2),              -- month-to-date as of this date
  currency        TEXT NOT NULL DEFAULT 'EGP',
  raw_data        JSONB,                      -- original API response for audit
  pipeline_run_id UUID,                       -- which pipeline run produced this
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(ad_account_id, date)
);

CREATE INDEX idx_spend_records_org_date ON spend_records(org_id, date DESC);
CREATE INDEX idx_spend_records_account_date ON spend_records(ad_account_id, date DESC);
-- For time-range queries (last 7 days, last 30 days):
CREATE INDEX idx_spend_records_date ON spend_records(date DESC);

-- IMPORTANT: Consider Supabase's pg_partman or manual partitioning
-- by month once data exceeds ~1M rows. For now, indexes suffice.


-- =============================================================
-- BALANCE SNAPSHOTS (time-series, append-only)
-- =============================================================
-- Captures balance at every pull. Multiple per day is expected.
-- Used for trend analysis and time-to-depletion calculations.

CREATE TABLE balance_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  ad_account_id   UUID NOT NULL REFERENCES ad_accounts(id),
  balance         NUMERIC(14,2) NOT NULL,
  available_funds TEXT,                       -- raw display string from API
  currency        TEXT NOT NULL DEFAULT 'EGP',
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(), -- when the snapshot was taken
  pipeline_run_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_balance_snapshots_account_time
  ON balance_snapshots(ad_account_id, captured_at DESC);
CREATE INDEX idx_balance_snapshots_org_time
  ON balance_snapshots(org_id, captured_at DESC);


-- =============================================================
-- ALERT RULES
-- =============================================================
CREATE TABLE alert_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  ad_account_id   UUID REFERENCES ad_accounts(id),  -- NULL = applies to all accounts
  name            TEXT NOT NULL,
  description     TEXT,
  rule_type       TEXT NOT NULL
                  CHECK (rule_type IN (
                    'balance_threshold',       -- balance <= X
                    'spend_spike',             -- daily spend increased by X%
                    'time_to_depletion',       -- balance / avg_spend <= X days
                    'spend_anomaly',           -- spend deviates from pattern
                    'account_status_change',   -- account went inactive
                    'zero_spend'               -- account spending 0 (might be paused)
                  )),
  severity        TEXT NOT NULL DEFAULT 'warning'
                  CHECK (severity IN ('info', 'warning', 'critical', 'emergency')),
  -- Rule parameters (varies by rule_type)
  config          JSONB NOT NULL DEFAULT '{}',
  -- Examples:
  -- balance_threshold:    { "threshold_value": 5000, "currency": "EGP" }
  -- spend_spike:          { "percentage_increase": 50, "lookback_days": 3 }
  -- time_to_depletion:    { "days_remaining": 3, "lookback_days": 7 }
  -- zero_spend:           { "consecutive_days": 2 }

  -- Deduplication
  cooldown_minutes  INT NOT NULL DEFAULT 180, -- 3 hours between repeat alerts
  -- Scheduling
  is_active       BOOLEAN NOT NULL DEFAULT true,
  active_hours    JSONB,                      -- NULL = 24/7, or {"start": "09:00", "end": "23:00"}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id)
);

CREATE INDEX idx_alert_rules_org ON alert_rules(org_id);
CREATE INDEX idx_alert_rules_account ON alert_rules(ad_account_id)
  WHERE ad_account_id IS NOT NULL;
CREATE INDEX idx_alert_rules_active ON alert_rules(org_id)
  WHERE is_active = true;


-- =============================================================
-- ALERTS (generated alert instances)
-- =============================================================
CREATE TABLE alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  ad_account_id   UUID NOT NULL REFERENCES ad_accounts(id),
  alert_rule_id   UUID NOT NULL REFERENCES alert_rules(id),
  severity        TEXT NOT NULL
                  CHECK (severity IN ('info', 'warning', 'critical', 'emergency')),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'acknowledged', 'resolved', 'snoozed')),
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  context         JSONB NOT NULL DEFAULT '{}',  -- snapshot of data that triggered alert
  -- Example: { "balance": 3200, "avg_daily_spend": 1500, "days_remaining": 2.1 }
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES profiles(id),
  snoozed_until   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_org_status ON alerts(org_id, status)
  WHERE status = 'active';
CREATE INDEX idx_alerts_account ON alerts(ad_account_id, created_at DESC);
CREATE INDEX idx_alerts_rule_cooldown ON alerts(alert_rule_id, created_at DESC);


-- =============================================================
-- ALERT DELIVERIES (delivery attempts per channel)
-- =============================================================
CREATE TABLE alert_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id        UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL
                  CHECK (channel_type IN ('email', 'telegram', 'whatsapp')),
  recipient       TEXT NOT NULL,               -- email address, telegram chat_id, phone number
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'queued')),
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  response_data   JSONB,                       -- API response from delivery provider
  retry_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_deliveries_alert ON alert_deliveries(alert_id);
CREATE INDEX idx_alert_deliveries_pending ON alert_deliveries(status)
  WHERE status IN ('pending', 'queued');


-- =============================================================
-- NOTIFICATION CHANNELS (user notification preferences)
-- =============================================================
CREATE TABLE notification_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID REFERENCES profiles(id), -- NULL = org-wide channel
  channel_type    TEXT NOT NULL
                  CHECK (channel_type IN ('email', 'telegram', 'whatsapp')),
  config          JSONB NOT NULL DEFAULT '{}',
  -- email:    { "address": "manager@targetspro.com" }
  -- telegram: { "chat_id": "-100123456", "bot_token_ref": "TELEGRAM_BOT_TOKEN" }
  -- whatsapp: { "phone": "+201234567890", "template_id": "..." }

  min_severity    TEXT NOT NULL DEFAULT 'warning'
                  CHECK (min_severity IN ('info', 'warning', 'critical', 'emergency')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  quiet_hours     JSONB,   -- { "start": "00:00", "end": "08:00", "timezone": "Africa/Cairo" }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_channels_org ON notification_channels(org_id);
CREATE INDEX idx_notification_channels_user ON notification_channels(user_id)
  WHERE user_id IS NOT NULL;


-- =============================================================
-- PIPELINE RUNS (data pipeline execution log)
-- =============================================================
-- Replaces the current "STATUS WORKFLOWS" table with better structure.

CREATE TABLE pipeline_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  platform_id     TEXT NOT NULL REFERENCES platforms(id),
  workflow_name   TEXT NOT NULL,               -- 'facebook_ingestion', 'tiktok_ingestion'
  status          TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'success', 'partial_failure', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  accounts_total  INT DEFAULT 0,
  accounts_success INT DEFAULT 0,
  accounts_failed INT DEFAULT 0,
  error_summary   JSONB,                       -- { "errors": [...] }
  metadata        JSONB NOT NULL DEFAULT '{}', -- execution context
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_runs_org_time ON pipeline_runs(org_id, started_at DESC);
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status)
  WHERE status IN ('running', 'failed');


-- =============================================================
-- HELPER VIEWS
-- =============================================================

-- Dashboard view: accounts with latest data + alert status
CREATE OR REPLACE VIEW v_account_dashboard AS
SELECT
  a.id,
  a.org_id,
  a.platform_id,
  a.account_name,
  a.business_manager,
  a.status,
  a.current_balance,
  a.current_daily_spend,
  a.current_mtd_spend,
  a.currency,
  a.last_synced_at,
  a.assigned_to,
  p.full_name AS assigned_to_name,
  (
    SELECT COUNT(*)
    FROM alerts al
    WHERE al.ad_account_id = a.id
      AND al.status = 'active'
  ) AS active_alert_count,
  (
    SELECT MAX(al.severity)
    FROM alerts al
    WHERE al.ad_account_id = a.id
      AND al.status = 'active'
  ) AS highest_alert_severity,
  -- Time to depletion (simple calculation)
  CASE
    WHEN a.current_daily_spend > 0
    THEN ROUND(a.current_balance / a.current_daily_spend, 1)
    ELSE NULL
  END AS estimated_days_remaining
FROM ad_accounts a
LEFT JOIN profiles p ON a.assigned_to = p.id
WHERE a.archived_at IS NULL;

-- Spend trend view: last 30 days per account
CREATE OR REPLACE VIEW v_spend_trend AS
SELECT
  sr.ad_account_id,
  sr.date,
  sr.daily_spend,
  sr.mtd_spend,
  a.account_name,
  a.platform_id,
  a.org_id
FROM spend_records sr
JOIN ad_accounts a ON sr.ad_account_id = a.id
WHERE sr.date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY sr.ad_account_id, sr.date DESC;


-- =============================================================
-- DATABASE FUNCTIONS (for Edge Function invocation)
-- =============================================================

-- Function to calculate time-to-depletion
CREATE OR REPLACE FUNCTION calculate_time_to_depletion(
  p_ad_account_id UUID,
  p_lookback_days INT DEFAULT 7
)
RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
  v_avg_daily NUMERIC;
BEGIN
  -- Get current balance
  SELECT current_balance INTO v_balance
  FROM ad_accounts WHERE id = p_ad_account_id;

  IF v_balance IS NULL OR v_balance <= 0 THEN
    RETURN 0;
  END IF;

  -- Calculate average daily spend over lookback period
  SELECT COALESCE(AVG(daily_spend), 0) INTO v_avg_daily
  FROM spend_records
  WHERE ad_account_id = p_ad_account_id
    AND date >= CURRENT_DATE - p_lookback_days
    AND daily_spend > 0;

  IF v_avg_daily = 0 THEN
    RETURN NULL;  -- cannot predict
  END IF;

  RETURN ROUND(v_balance / v_avg_daily, 1);
END;
$$ LANGUAGE plpgsql STABLE;


-- Function to check if alert is in cooldown
CREATE OR REPLACE FUNCTION is_alert_in_cooldown(
  p_ad_account_id UUID,
  p_alert_rule_id UUID,
  p_cooldown_minutes INT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM alerts
    WHERE ad_account_id = p_ad_account_id
      AND alert_rule_id = p_alert_rule_id
      AND status != 'resolved'
      AND created_at > NOW() - (p_cooldown_minutes || ' minutes')::INTERVAL
  );
END;
$$ LANGUAGE plpgsql STABLE;
```

### Schema Design Decisions

| Decision | Rationale |
|----------|-----------|
| **`org_id` on every table** | Multi-tenant readiness. RLS policies filter on this. Even with one org now, this avoids a future migration. |
| **Denormalized `current_*` on `ad_accounts`** | Dashboard reads are the most frequent query. Avoids joining to spend_records/balance_snapshots on every page load. Updated via trigger when new data arrives. |
| **Separate `balance_snapshots` from `spend_records`** | Balance is captured multiple times per day (every 3h/5h), spend is once per day. Different granularities, different query patterns. |
| **`alert_rules.config` as JSONB** | Different rule types need different parameters. JSONB avoids the EAV anti-pattern while keeping the schema flexible. |
| **`alert_deliveries` separate from `alerts`** | One alert may be delivered to multiple channels. Tracks per-channel delivery status independently. |
| **`pipeline_runs` table** | Preserves the current STATUS WORKFLOWS pattern but with richer structure for monitoring pipeline health. |
| **`UNIQUE(ad_account_id, date)` on `spend_records`** | Allows UPSERT semantics -- re-pulling data for the same day updates rather than duplicates. |
| **`available_funds` as TEXT on `balance_snapshots`** | Facebook returns this as a formatted display string ("EGP 15,000.00"). Store raw for display, use `balance` (NUMERIC) for calculations. |

### Trigger for Denormalized Fields

```sql
-- When a new spend_record or balance_snapshot is inserted,
-- update the denormalized fields on ad_accounts.

CREATE OR REPLACE FUNCTION update_account_current_data()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'spend_records' THEN
    UPDATE ad_accounts SET
      current_daily_spend = NEW.daily_spend,
      current_mtd_spend = NEW.mtd_spend,
      last_synced_at = now(),
      updated_at = now()
    WHERE id = NEW.ad_account_id;

  ELSIF TG_TABLE_NAME = 'balance_snapshots' THEN
    UPDATE ad_accounts SET
      current_balance = NEW.balance,
      last_synced_at = now(),
      updated_at = now()
    WHERE id = NEW.ad_account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_spend_record_update_account
  AFTER INSERT OR UPDATE ON spend_records
  FOR EACH ROW
  EXECUTE FUNCTION update_account_current_data();

CREATE TRIGGER trg_balance_snapshot_update_account
  AFTER INSERT ON balance_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_account_current_data();
```

### Trigger for Alert Evaluation

```sql
-- After new data arrives, invoke the alert evaluation Edge Function.
-- Uses Supabase's pg_net extension for HTTP calls from within PostgreSQL.

CREATE OR REPLACE FUNCTION invoke_alert_evaluation()
RETURNS TRIGGER AS $$
BEGIN
  -- Use pg_net to call the Edge Function asynchronously
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/evaluate-alert-rules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'record_id', NEW.id,
      'ad_account_id', NEW.ad_account_id,
      'org_id', NEW.org_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evaluate_alerts_on_spend
  AFTER INSERT ON spend_records
  FOR EACH ROW
  EXECUTE FUNCTION invoke_alert_evaluation();

CREATE TRIGGER trg_evaluate_alerts_on_balance
  AFTER INSERT ON balance_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION invoke_alert_evaluation();
```

**Note on pg_net:** Supabase provides the `pg_net` extension which allows making HTTP requests from within PostgreSQL triggers. This is the recommended way to invoke Edge Functions from database triggers. Confidence: MEDIUM -- verify that `pg_net` is available and enabled on your Supabase instance before implementation.

---

## 6. Alerting Engine Architecture

### Alert Rule Types

```
+------------------------------------------------------------------+
|                    ALERT RULE ENGINE                              |
|                                                                  |
|  TIER 1: Simple Threshold (evaluate immediately)                 |
|  +----------------------------------------------------------+   |
|  | balance_threshold                                         |   |
|  |   IF balance <= config.threshold_value THEN trigger       |   |
|  |   Example: Balance drops below EGP 5,000                  |   |
|  +----------------------------------------------------------+   |
|  | account_status_change                                     |   |
|  |   IF current_status != previous_status THEN trigger       |   |
|  |   Example: Account went from Active to Disabled           |   |
|  +----------------------------------------------------------+   |
|  | zero_spend                                                |   |
|  |   IF daily_spend = 0 for N consecutive days THEN trigger  |   |
|  |   Example: Account has not spent for 2 days               |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  TIER 2: Rate of Change (requires historical data)               |
|  +----------------------------------------------------------+   |
|  | spend_spike                                               |   |
|  |   avg_recent = AVG(daily_spend, last N days)              |   |
|  |   IF today_spend > avg_recent * (1 + threshold%)          |   |
|  |   THEN trigger                                            |   |
|  |   Example: Today's spend is 50% above 7-day average       |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  TIER 3: Predictive (requires computation)                       |
|  +----------------------------------------------------------+   |
|  | time_to_depletion                                         |   |
|  |   avg_daily = AVG(daily_spend, last N days)               |   |
|  |   days_remaining = balance / avg_daily                    |   |
|  |   IF days_remaining <= config.days_threshold THEN trigger |   |
|  |   Example: Funds will deplete in <= 3 days                |   |
|  +----------------------------------------------------------+   |
|  | spend_anomaly (future)                                    |   |
|  |   Uses standard deviation from historical pattern         |   |
|  |   IF |today - mean| > 2 * stddev THEN trigger            |   |
|  +----------------------------------------------------------+   |
+------------------------------------------------------------------+
```

### Escalation Tiers

```
Severity Levels (ascending):
  INFO      -> Logged, shown in dashboard, no push notification
  WARNING   -> Dashboard + configured channels (respects quiet hours)
  CRITICAL  -> Dashboard + ALL channels (respects quiet hours)
  EMERGENCY -> Dashboard + ALL channels (IGNORES quiet hours)

Escalation Flow:
  1. Alert triggered at configured severity
  2. If not acknowledged within escalation_timeout:
     - WARNING -> escalate to CRITICAL (after 2 hours)
     - CRITICAL -> escalate to EMERGENCY (after 1 hour)
  3. EMERGENCY alerts bypass quiet hours and go to all channels

Implementation:
  - Escalation is handled by a scheduled Edge Function (or pg_cron job)
    that runs every 15 minutes and checks for unacknowledged alerts
    past their escalation timeout.
```

### Cooldown and Deduplication

```
DEDUPLICATION LOGIC:

  For each (ad_account_id, alert_rule_id) pair:

  1. Check: Is there an existing alert with status != 'resolved'
     AND created_at > NOW() - cooldown_period?

  2. If YES -> Skip (alert is still "active" or "acknowledged")

  3. If NO  -> Create new alert

  COOLDOWN PERIODS (defaults, configurable per rule):
  - balance_threshold:    180 minutes (3 hours, matches pull interval)
  - spend_spike:          720 minutes (12 hours)
  - time_to_depletion:    360 minutes (6 hours)
  - zero_spend:           1440 minutes (24 hours)
  - account_status_change: 60 minutes (1 hour)

  RATIONALE: Cooldown should be >= the data pull interval. No point
  alerting about the same low balance every 3 hours if no action
  has been taken.
```

### Edge Function: evaluate-alert-rules (pseudocode)

```typescript
// supabase/functions/evaluate-alert-rules/index.ts

import { createClient } from '@supabase/supabase-js';

interface AlertRuleConfig {
  threshold_value?: number;
  percentage_increase?: number;
  days_remaining?: number;
  lookback_days?: number;
  consecutive_days?: number;
}

Deno.serve(async (req) => {
  const { ad_account_id, org_id, table } = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Load active rules for this account (and org-wide rules)
  const { data: rules } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('org_id', org_id)
    .eq('is_active', true)
    .or(`ad_account_id.eq.${ad_account_id},ad_account_id.is.null`);

  // 2. Load current account data
  const { data: account } = await supabase
    .from('ad_accounts')
    .select('*')
    .eq('id', ad_account_id)
    .single();

  // 3. Evaluate each rule
  for (const rule of rules ?? []) {
    const config = rule.config as AlertRuleConfig;
    let shouldTrigger = false;
    let message = '';
    let context: Record<string, any> = {};

    switch (rule.rule_type) {
      case 'balance_threshold':
        shouldTrigger = (account.current_balance ?? 0) <= (config.threshold_value ?? 0);
        message = `Balance for ${account.account_name} is ${account.currency} ${account.current_balance} (threshold: ${config.threshold_value})`;
        context = { balance: account.current_balance, threshold: config.threshold_value };
        break;

      case 'time_to_depletion':
        const { data: ttd } = await supabase.rpc('calculate_time_to_depletion', {
          p_ad_account_id: ad_account_id,
          p_lookback_days: config.lookback_days ?? 7
        });
        shouldTrigger = ttd !== null && ttd <= (config.days_remaining ?? 3);
        message = `${account.account_name} will deplete in ~${ttd} days`;
        context = { days_remaining: ttd, threshold_days: config.days_remaining };
        break;

      case 'spend_spike':
        // Query recent spend for comparison
        const { data: recentSpend } = await supabase
          .from('spend_records')
          .select('daily_spend')
          .eq('ad_account_id', ad_account_id)
          .gte('date', `now() - interval '${config.lookback_days ?? 7} days'`)
          .order('date', { ascending: false });
        // ... calculate average and compare
        break;

      // ... other rule types
    }

    if (!shouldTrigger) continue;

    // 4. Deduplication check
    const { data: inCooldown } = await supabase.rpc('is_alert_in_cooldown', {
      p_ad_account_id: ad_account_id,
      p_alert_rule_id: rule.id,
      p_cooldown_minutes: rule.cooldown_minutes
    });

    if (inCooldown) continue;

    // 5. Create alert
    const { data: alert } = await supabase
      .from('alerts')
      .insert({
        org_id,
        ad_account_id,
        alert_rule_id: rule.id,
        severity: rule.severity,
        title: `${rule.rule_type}: ${account.account_name}`,
        message,
        context
      })
      .select()
      .single();

    // 6. Dispatch notifications
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({ alert_id: alert.id })
    });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

---

## 7. Authentication and Authorization

### Auth Architecture

```
+------------------------------------------------------------------+
|                    SUPABASE AUTH                                  |
|                                                                  |
|  Provider: Email/Password (primary)                              |
|  Future: Google OAuth, Magic Link                                |
|                                                                  |
|  Flow:                                                           |
|  1. User signs up / is invited by admin                          |
|  2. Supabase Auth creates auth.users record                      |
|  3. Database trigger creates profiles record with org_id + role  |
|  4. JWT includes user.id, which RLS uses to look up org_id/role  |
|  5. Next.js middleware validates session on every request         |
+------------------------------------------------------------------+
```

### Role-Based Access Control

```
ROLES:

  admin    - Full access. Manage users, configure alert rules,
             view all accounts, modify org settings.
             (Agency owner / IT admin)

  manager  - View all accounts, configure alert rules for
             assigned accounts, acknowledge alerts.
             (Agency managers, senior account managers)

  viewer   - Read-only access to assigned accounts.
             View dashboards, see alert history.
             (Junior account managers, future: client portal)

PERMISSION MATRIX:

  Resource             | admin | manager | viewer |
  ---------------------|-------|---------|--------|
  Dashboard (all)      |  RW   |   R     |   -    |
  Dashboard (assigned) |  RW   |   R     |   R    |
  Ad Accounts          |  CRUD |   R     |   R*   |
  Alert Rules          |  CRUD |   CRU*  |   R    |
  Alerts               |  CRUD |   RU    |   R    |
  Users/Profiles       |  CRUD |   R     |   R    |
  Org Settings         |  RW   |   R     |   -    |
  Pipeline Monitoring  |  R    |   R     |   -    |

  * manager can only CRU alert rules for their assigned accounts
  * viewer can only see accounts assigned to them
```

### Row Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's org_id
CREATE OR REPLACE FUNCTION auth.user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function to get user's role
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ORGANIZATIONS: Users can only see their own org
CREATE POLICY "Users see own org" ON organizations
  FOR SELECT USING (id = auth.user_org_id());

-- PROFILES: Users see profiles in their org
CREATE POLICY "Users see org profiles" ON profiles
  FOR SELECT USING (org_id = auth.user_org_id());

CREATE POLICY "Admins manage profiles" ON profiles
  FOR ALL USING (
    org_id = auth.user_org_id()
    AND auth.user_role() = 'admin'
  );

-- AD ACCOUNTS: Org-scoped, viewers only see assigned
CREATE POLICY "Admins and managers see all org accounts" ON ad_accounts
  FOR SELECT USING (
    org_id = auth.user_org_id()
    AND auth.user_role() IN ('admin', 'manager')
  );

CREATE POLICY "Viewers see assigned accounts" ON ad_accounts
  FOR SELECT USING (
    org_id = auth.user_org_id()
    AND auth.user_role() = 'viewer'
    AND assigned_to = auth.uid()
  );

CREATE POLICY "Admins manage accounts" ON ad_accounts
  FOR ALL USING (
    org_id = auth.user_org_id()
    AND auth.user_role() = 'admin'
  );

-- SPEND RECORDS: Same visibility as ad_accounts
CREATE POLICY "Users see org spend records" ON spend_records
  FOR SELECT USING (org_id = auth.user_org_id());

-- BALANCE SNAPSHOTS: Same visibility
CREATE POLICY "Users see org balance snapshots" ON balance_snapshots
  FOR SELECT USING (org_id = auth.user_org_id());

-- ALERT RULES: Admins full, managers can create/edit
CREATE POLICY "Users see org alert rules" ON alert_rules
  FOR SELECT USING (org_id = auth.user_org_id());

CREATE POLICY "Admins manage alert rules" ON alert_rules
  FOR ALL USING (
    org_id = auth.user_org_id()
    AND auth.user_role() = 'admin'
  );

CREATE POLICY "Managers create/update alert rules" ON alert_rules
  FOR INSERT WITH CHECK (
    org_id = auth.user_org_id()
    AND auth.user_role() = 'manager'
  );

CREATE POLICY "Managers update alert rules" ON alert_rules
  FOR UPDATE USING (
    org_id = auth.user_org_id()
    AND auth.user_role() = 'manager'
  );

-- ALERTS: Org-scoped reads, managers can acknowledge
CREATE POLICY "Users see org alerts" ON alerts
  FOR SELECT USING (org_id = auth.user_org_id());

CREATE POLICY "Admins/managers update alerts" ON alerts
  FOR UPDATE USING (
    org_id = auth.user_org_id()
    AND auth.user_role() IN ('admin', 'manager')
  );

-- PIPELINE RUNS: Admins and managers
CREATE POLICY "Admins/managers see pipeline runs" ON pipeline_runs
  FOR SELECT USING (
    org_id = auth.user_org_id()
    AND auth.user_role() IN ('admin', 'manager')
  );

-- SERVICE ROLE: n8n and Edge Functions use the service_role key,
-- which bypasses RLS. This is intentional -- data ingestion
-- and alert evaluation need unrestricted access.
```

### Next.js Middleware for Auth

```
MIDDLEWARE FLOW:

  Request arrives at Next.js
    |
    v
  middleware.ts checks:
    1. Is there a valid Supabase session cookie?
       NO  -> Redirect to /login (except public routes)
       YES -> Continue
    2. Refresh session if needed (Supabase handles this)
    3. Attach user context to request
    |
    v
  Route-level checks in Server Components:
    - Read user role from profile
    - Conditionally render based on role
    - Return 403 for unauthorized API routes

  PUBLIC ROUTES (no auth required):
    /login
    /signup (if self-signup enabled)
    /forgot-password
    /api/webhook/n8n (authenticated via webhook secret)

  PROTECTED ROUTES:
    /dashboard/**    -> all roles
    /settings/**     -> admin only
    /users/**        -> admin only
    /alerts/**       -> all roles (write: admin/manager)
    /accounts/**     -> all roles (filtered by RLS)
```

---

## 8. Project Structure

### Recommended: Monorepo with Turborepo

**Why monorepo:** The project has shared types between Next.js and Supabase Edge Functions (alert rule configs, database types). A monorepo keeps these in sync.

**Why Turborepo over Nx:** Simpler setup, zero-config for Next.js, growing ecosystem. Adequate for this project's scale.

```
targetspro-monitor/
|
+-- .github/
|   +-- workflows/
|       +-- ci.yml                    # Lint, type-check, test
|       +-- deploy-web.yml            # Deploy Next.js to Vercel
|       +-- deploy-functions.yml      # Deploy Edge Functions to Supabase
|
+-- .planning/                        # Project planning (this directory)
|   +-- research/
|   +-- milestones/
|
+-- packages/
|   +-- shared/                       # Shared types and utilities
|   |   +-- src/
|   |   |   +-- types/
|   |   |   |   +-- database.ts       # Generated from Supabase (supabase gen types)
|   |   |   |   +-- alerts.ts         # Alert rule types, severity enums
|   |   |   |   +-- api.ts            # API request/response types
|   |   |   |   +-- index.ts
|   |   |   +-- constants/
|   |   |   |   +-- platforms.ts      # Platform IDs, API versions
|   |   |   |   +-- roles.ts          # Role definitions
|   |   |   |   +-- alert-defaults.ts # Default cooldowns, thresholds
|   |   |   +-- utils/
|   |   |       +-- currency.ts       # Format EGP, parse amounts
|   |   |       +-- dates.ts          # Cairo timezone helpers
|   |   |       +-- validation.ts     # Zod schemas for alert rules
|   |   +-- package.json
|   |   +-- tsconfig.json
|   |
|   +-- supabase/                     # Supabase project files
|       +-- config.toml               # Supabase local dev config
|       +-- migrations/
|       |   +-- 00001_initial_schema.sql
|       |   +-- 00002_rls_policies.sql
|       |   +-- 00003_triggers.sql
|       |   +-- 00004_seed_data.sql
|       +-- functions/
|       |   +-- evaluate-alert-rules/
|       |   |   +-- index.ts
|       |   +-- dispatch-notification/
|       |   |   +-- index.ts
|       |   +-- calculate-predictions/
|       |   |   +-- index.ts
|       |   +-- health-check/
|       |   |   +-- index.ts
|       |   +-- _shared/              # Shared Edge Function utilities
|       |       +-- supabase-client.ts
|       |       +-- notification-formatters.ts
|       |       +-- cors.ts
|       +-- seed.sql
|
+-- apps/
|   +-- web/                          # Next.js application
|       +-- public/
|       |   +-- favicon.ico
|       |   +-- logo.svg
|       +-- src/
|       |   +-- app/                  # App Router
|       |   |   +-- (auth)/           # Auth route group (no layout chrome)
|       |   |   |   +-- login/
|       |   |   |   |   +-- page.tsx
|       |   |   |   +-- signup/
|       |   |   |   |   +-- page.tsx
|       |   |   |   +-- layout.tsx
|       |   |   +-- (dashboard)/      # Dashboard route group (with sidebar)
|       |   |   |   +-- page.tsx              # Main dashboard
|       |   |   |   +-- accounts/
|       |   |   |   |   +-- page.tsx          # Account listing
|       |   |   |   |   +-- [id]/
|       |   |   |   |       +-- page.tsx      # Account detail
|       |   |   |   +-- alerts/
|       |   |   |   |   +-- page.tsx          # Alert listing
|       |   |   |   |   +-- rules/
|       |   |   |   |       +-- page.tsx      # Alert rule config
|       |   |   |   +-- settings/
|       |   |   |   |   +-- page.tsx          # Org settings
|       |   |   |   |   +-- users/
|       |   |   |   |   |   +-- page.tsx      # User management
|       |   |   |   |   +-- notifications/
|       |   |   |   |       +-- page.tsx      # Channel config
|       |   |   |   +-- monitoring/
|       |   |   |   |   +-- page.tsx          # Pipeline health
|       |   |   |   +-- layout.tsx            # Sidebar + topbar layout
|       |   |   +-- api/
|       |   |   |   +-- webhook/
|       |   |   |   |   +-- n8n/
|       |   |   |   |       +-- route.ts      # Webhook for n8n callbacks
|       |   |   |   +-- reports/
|       |   |   |       +-- export/
|       |   |   |           +-- route.ts      # CSV/PDF export
|       |   |   +-- layout.tsx                # Root layout
|       |   |   +-- globals.css
|       |   +-- components/
|       |   |   +-- ui/                       # Shadcn/ui components
|       |   |   +-- dashboard/
|       |   |   |   +-- account-card.tsx
|       |   |   |   +-- spend-chart.tsx
|       |   |   |   +-- balance-indicator.tsx
|       |   |   |   +-- alert-badge.tsx
|       |   |   |   +-- time-to-depletion.tsx
|       |   |   +-- alerts/
|       |   |   |   +-- alert-list.tsx
|       |   |   |   +-- alert-rule-form.tsx
|       |   |   |   +-- severity-badge.tsx
|       |   |   +-- layout/
|       |   |   |   +-- sidebar.tsx
|       |   |   |   +-- topbar.tsx
|       |   |   |   +-- breadcrumbs.tsx
|       |   |   +-- providers/
|       |   |       +-- supabase-provider.tsx
|       |   |       +-- realtime-provider.tsx
|       |   +-- lib/
|       |   |   +-- supabase/
|       |   |   |   +-- client.ts             # Browser client
|       |   |   |   +-- server.ts             # Server component client
|       |   |   |   +-- middleware.ts          # Middleware client
|       |   |   +-- hooks/
|       |   |   |   +-- use-realtime-spend.ts
|       |   |   |   +-- use-realtime-alerts.ts
|       |   |   |   +-- use-account-data.ts
|       |   |   +-- utils/
|       |   |       +-- format.ts
|       |   |       +-- date.ts
|       |   +-- middleware.ts                  # Auth middleware
|       +-- next.config.ts
|       +-- tailwind.config.ts
|       +-- tsconfig.json
|       +-- package.json
|
+-- n8n/                              # n8n workflow definitions (version controlled)
|   +-- workflows/
|   |   +-- facebook-ingestion.json   # Consolidated Facebook workflow
|   |   +-- tiktok-ingestion.json     # Consolidated TikTok workflow
|   |   +-- health-monitor.json       # Monitors pipeline health
|   +-- credentials/
|   |   +-- README.md                 # Instructions for credential setup (NO actual secrets)
|   +-- docs/
|       +-- workflow-design.md        # Documentation of workflow logic
|
+-- turbo.json                        # Turborepo config
+-- package.json                      # Root workspace
+-- pnpm-workspace.yaml              # Workspace definition
+-- .env.example                      # Environment variable template
+-- .gitignore
+-- tsconfig.base.json               # Base TypeScript config
```

### Key Structural Decisions

| Decision | Rationale |
|----------|-----------|
| **`packages/shared`** | Database types generated by `supabase gen types typescript` are used by both Next.js and Edge Functions. Single source of truth. |
| **`packages/supabase`** | Keeps migrations, Edge Functions, and Supabase config together. Deployable as a unit. |
| **Route groups `(auth)` and `(dashboard)`** | App Router convention for grouping routes with different layouts without affecting URL structure. |
| **`n8n/` at root level** | n8n workflows are JSON files that should be version-controlled but are not part of the TypeScript build. |
| **`components/ui` for shadcn** | shadcn/ui components are copied into the project (not imported as a package). Standard convention. |
| **`lib/supabase/` with client/server/middleware** | Supabase requires different client instantiation depending on context (browser, server component, middleware). Three files keeps this clean. |

---

## 9. Migration Strategy

### Overview

The migration must be zero-disruption. The current n8n workflows must continue running while the new system is built alongside them.

### Phase Approach

```
PHASE 1: PARALLEL FOUNDATION (Week 1-2)
+------------------------------------------------------------------+
|  Build new schema alongside existing tables.                     |
|  Old workflows continue writing to old tables.                   |
|  No user-facing changes.                                         |
|                                                                  |
|  Tasks:                                                          |
|  1. Run new schema migrations (CREATE new tables)                |
|  2. Write data sync script:                                      |
|     Old tables -> New normalized schema                          |
|     (one-time backfill of historical data)                       |
|  3. Set up Supabase Auth + profiles                              |
|  4. Create seed data (organizations, platforms)                  |
|                                                                  |
|  Current State:                                                  |
|  Old n8n workflows  -> Old Supabase tables + Google Sheets       |
|  (no changes)          (still primary)                           |
+------------------------------------------------------------------+

PHASE 2: DUAL WRITE (Week 3-4)
+------------------------------------------------------------------+
|  New n8n workflows write to new tables IN ADDITION TO old ones.  |
|  Dashboard development begins against new schema.                |
|                                                                  |
|  Tasks:                                                          |
|  1. Build consolidated Facebook workflow (1 workflow, not 4)     |
|  2. Build consolidated TikTok workflow (1 workflow, not 2)       |
|  3. New workflows write to BOTH old + new tables                 |
|  4. Validate data matches between old and new tables             |
|                                                                  |
|  Current State:                                                  |
|  Old n8n workflows  -> Old tables + Sheets (still active)        |
|  New n8n workflows  -> New tables (validation mode)              |
|  Dashboard          -> New tables (dev only)                     |
+------------------------------------------------------------------+

PHASE 3: SWITCHOVER (Week 5)
+------------------------------------------------------------------+
|  New workflows become primary. Old workflows disabled.           |
|  Dashboard goes live.                                            |
|                                                                  |
|  Tasks:                                                          |
|  1. Validate 1+ week of consistent data in new tables            |
|  2. Disable old workflows (set active: false in n8n)             |
|  3. Keep old tables READ-ONLY (do not delete)                    |
|  4. Stop Google Sheets writes                                    |
|  5. Deploy dashboard                                             |
|  6. Enable alert engine                                          |
|                                                                  |
|  Rollback plan:                                                  |
|  - Re-enable old workflows (they still exist)                    |
|  - Old tables still have data up to cutover point                |
|  - Google Sheets still has historical record                     |
+------------------------------------------------------------------+

PHASE 4: CLEANUP (Week 6+)
+------------------------------------------------------------------+
|  Remove old infrastructure once new system is stable.            |
|                                                                  |
|  Tasks:                                                          |
|  1. After 2+ weeks of stable operation:                          |
|     - Archive old n8n workflow JSON files                        |
|     - Rename old Supabase tables with _legacy suffix             |
|     - Keep Google Sheets as read-only archive                    |
|  2. After 1+ month:                                              |
|     - Drop _legacy tables (or keep for compliance)               |
+------------------------------------------------------------------+
```

### Data Migration Script (Conceptual)

```sql
-- One-time backfill from existing tables to new schema.
-- Run AFTER new schema is created and seed data exists.

-- Step 1: Map existing Supabase table rows to new ad_accounts

-- Facebook accounts (from "Facebook Data Pull -- Main accounts" table)
INSERT INTO ad_accounts (org_id, platform_id, platform_account_id, account_name, business_manager, currency, status)
SELECT
  (SELECT id FROM organizations WHERE slug = 'targetspro'),
  'facebook',
  old."Account ID",
  old."Account name",
  'Main',                            -- business_manager, adjust per table
  'EGP',
  CASE WHEN old."Status" = 'Active' THEN 'active' ELSE 'paused' END
FROM "Facebook Data Pull —Main accounts" old
WHERE old."Account ID" IS NOT NULL
ON CONFLICT (org_id, platform_id, platform_account_id) DO NOTHING;

-- Repeat for Pasant, Aligomarketing, Xlerate tables with appropriate business_manager

-- TikTok accounts (from "Tiktok accounts" table)
INSERT INTO ad_accounts (org_id, platform_id, platform_account_id, account_name, currency, status)
SELECT
  (SELECT id FROM organizations WHERE slug = 'targetspro'),
  'tiktok',
  old."Advertiser_id",
  old."Account name",
  'EGP',
  'active'
FROM "Tiktok accounts" old
WHERE old."Advertiser_id" IS NOT NULL
ON CONFLICT (org_id, platform_id, platform_account_id) DO NOTHING;

-- Step 2: Backfill balance snapshots from current values
-- (Historical snapshots not available from current schema -- only current values exist)
INSERT INTO balance_snapshots (org_id, ad_account_id, balance, available_funds, currency)
SELECT
  a.org_id,
  a.id,
  -- Parse numeric balance from old table
  CASE
    WHEN old."Balance" ~ '^[0-9,]+\.?[0-9]*$'
    THEN REPLACE(old."Balance", ',', '')::NUMERIC
    ELSE 0
  END,
  old."Available funds",
  'EGP'
FROM "Facebook Data Pull —Main accounts" old
JOIN ad_accounts a ON a.platform_account_id = old."Account ID"
WHERE old."Balance" IS NOT NULL;
```

---

## 10. Anti-Patterns to Avoid

### Anti-Pattern 1: Business Logic in n8n

**What:** Putting alert evaluation, threshold checking, and notification routing in n8n workflows.

**Why bad:** n8n workflows are hard to test, hard to version, and brittle for complex logic. The current system already suffers from this -- JavaScript code nodes with 50+ lines of business logic embedded in workflow JSON.

**Instead:** n8n should ONLY do:
- Scheduled API calls
- Data normalization (simple transforms)
- Writing to Supabase

All business logic (alerting, predictions, escalation) belongs in Supabase Edge Functions or database functions.

### Anti-Pattern 2: Polling for Data Changes in Next.js

**What:** Using `setInterval` or frequent API polling to check for new data.

**Why bad:** Wastes resources, introduces latency, creates unnecessary database load.

**Instead:** Use Supabase Realtime subscriptions. The database pushes changes to connected clients.

### Anti-Pattern 3: Storing Credentials in Workflow JSON

**What:** The current system has TikTok Access-Tokens hardcoded in HTTP Request node headers.

**Why bad:** Tokens visible in workflow exports, version control, and n8n UI. Cannot rotate without editing workflows.

**Instead:** Use n8n Credentials (they are already partially using this for Facebook Graph API -- the `facebookGraphApi` credential reference). All tokens must be in n8n Credentials or environment variables.

### Anti-Pattern 4: One Table Per Business Manager

**What:** The current system has separate tables for "Main accounts", "Pasant", "Aligomarketing", "Xlerate".

**Why bad:** Schema duplication, requires separate queries for cross-account views, adding a new business manager means creating a new table.

**Instead:** Single `ad_accounts` table with `business_manager` column. Filter via queries.

### Anti-Pattern 5: Google Sheets as Data Store

**What:** Writing to Google Sheets in parallel with Supabase.

**Why bad:** Dual source of truth, Google Sheets API rate limits, no referential integrity, no RLS.

**Instead:** Supabase is the single source of truth. If Sheets is needed for reporting, generate it periodically (not on every data pull). Or use export from dashboard.

### Anti-Pattern 6: Sequential Waits Between API Calls

**What:** The current workflows use 1-3 minute `Wait` nodes between sub-workflows to avoid rate limits.

**Why bad:** Total pipeline time for one cycle is 15+ minutes. If data is stale, alerts are delayed.

**Instead:** Consolidated single workflow with proper batch timing. Process all accounts in one workflow with adaptive rate limiting (exponential backoff on 429 responses, not fixed waits).

### Anti-Pattern 7: Client-Side Data Fetching for Dashboard

**What:** Fetching all account data client-side on page load.

**Why bad:** Exposes full query to client, slow initial load, no SEO (if needed).

**Instead:** Use Next.js Server Components to fetch data server-side. Pass only what the UI needs to Client Components. Use Realtime for subsequent updates.

---

## 11. Scalability Considerations

| Concern | Current Scale (~20 accounts) | At 100 accounts | At 1,000 accounts |
|---------|------------------------------|------------------|--------------------|
| **Data volume** | ~600 spend records/month | ~3,000/month | ~30,000/month |
| **Balance snapshots** | ~4,800/month (8 pulls/day x 20 x 30) | ~24,000/month | ~240,000/month |
| **n8n execution time** | ~15 min per cycle (current) | 5-10 min (consolidated) | Need parallel workers |
| **Alert evaluation** | Minimal load | ~200 rule evaluations/day | Need batching/queuing |
| **Realtime connections** | 3-5 concurrent users | 10-20 users | Need connection pooling |
| **Database size** | < 100 MB | < 1 GB | 5-10 GB, consider partitioning |

### Scaling Strategies by Component

**Database:**
- At 100 accounts: Indexes suffice. Use the views defined above.
- At 1,000 accounts: Partition `spend_records` and `balance_snapshots` by month. Consider materialized views for dashboard aggregations refreshed via pg_cron.

**n8n:**
- At 100 accounts: Single consolidated workflow with proper batching.
- At 1,000 accounts: Multiple n8n workers or split by platform. Consider moving API pulls to Supabase Edge Functions with queued execution.

**Alerting:**
- At 100 accounts: Synchronous Edge Function evaluation per insert is fine.
- At 1,000 accounts: Batch evaluation -- instead of triggering on every insert, use pg_cron to run evaluation every 5 minutes for all accounts with new data.

**Next.js:**
- At all scales: Vercel auto-scales. Server Components prevent unnecessary client-side data loading. Realtime subscriptions scale well with Supabase's managed infrastructure.

---

## Sources and Confidence Notes

| Claim | Confidence | Source |
|-------|------------|--------|
| Current system architecture (n8n workflows, data flow) | HIGH | Direct analysis of 8 workflow JSON files in project |
| Supabase RLS policies syntax | MEDIUM | Based on established Supabase documentation patterns; recommend verifying with latest Supabase docs |
| Supabase Edge Functions Deno runtime | MEDIUM | Supabase Edge Functions use Deno; verify current API surface |
| `pg_net` extension for HTTP from triggers | MEDIUM | Known Supabase extension; verify it is enabled on the specific instance |
| Next.js App Router patterns (route groups, server components) | MEDIUM | Standard Next.js patterns; verify specific API with latest Next.js docs |
| Turborepo monorepo structure | MEDIUM | Standard Turborepo conventions; verify against latest version |
| Facebook Graph API v23.0 fields | HIGH | Observed in existing workflow JSON (already using v22.0/v23.0) |
| TikTok Business API v1.3 endpoints | HIGH | Observed in existing workflow JSON (already using v1.3) |
| Alert cooldown/deduplication pattern | MEDIUM | Standard alerting system design pattern |

### Items Requiring Phase-Specific Research

1. **Supabase pg_net availability** -- Verify this extension is available and enabled on the production Supabase instance before implementing database trigger-to-Edge-Function calls.
2. **WhatsApp Business API** -- Requires business verification and template approval. Research the onboarding process and timeline.
3. **Telegram Bot API** -- Straightforward, but research group chat vs. direct message patterns for team alerts.
4. **n8n credential management** -- Research n8n's environment variable injection for self-hosted instances to properly externalize API tokens.
5. **Supabase free tier limits** -- If on free tier, check Edge Function invocation limits, Realtime connection limits, and database size limits. These could affect architecture decisions at scale.
