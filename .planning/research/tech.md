# Technology Research: Targetspro Ad Spend Monitoring Platform

**Domain:** Full-stack ad spend monitoring / digital marketing agency ops
**Researched:** 2026-02-11
**Confidence Basis:** Training data (May 2025 cutoff) verified against existing codebase analysis. WebSearch/WebFetch unavailable during research -- all API version details and library specifics should be verified against current official docs before implementation.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Existing System Analysis](#2-existing-system-analysis)
3. [Next.js for Real-Time Dashboards](#3-nextjs-for-real-time-dashboards)
4. [Supabase Patterns](#4-supabase-patterns)
5. [Facebook Graph API](#5-facebook-graph-api)
6. [TikTok Business API](#6-tiktok-business-api)
7. [Alert Channel Integration](#7-alert-channel-integration)
8. [n8n Workflow Consolidation](#8-n8n-workflow-consolidation)
9. [TypeScript Project Structure](#9-typescript-project-structure)
10. [Security Hardening](#10-security-hardening)
11. [Timezone Handling](#11-timezone-handling)
12. [Recommended Stack Summary](#12-recommended-stack-summary)
13. [Critical Pitfalls](#13-critical-pitfalls)
14. [Open Questions](#14-open-questions)

---

## 1. Executive Summary

The Targetspro platform replaces a fragmented system of 8 n8n workflows, a Google Sheets tracking spreadsheet, and email-only alerts with a unified Next.js dashboard backed by Supabase. The existing codebase reveals several critical issues that the new system must address:

**Hardcoded tokens everywhere.** Both TikTok workflows contain plaintext access tokens directly in HTTP request nodes. The Facebook workflows reference a credential ID but the pattern is still fragile. This is the single highest-priority security fix.

**Massive code duplication.** The 4 Facebook sub-workflows and 2 TikTok sub-workflows are near-identical copies. Each contains the same Cairo timezone formatting function, the same flatten/filter logic, and the same Supabase update pattern. A single parameterized workflow can replace all of these.

**Dual-write architecture.** Every workflow writes to both Supabase AND Google Sheets, creating consistency risks. The new system should make Supabase the single source of truth and deprecate the Sheets dependency.

**Alert window is too narrow.** The current system only sends email alerts between 9AM-12PM Cairo time. The new system should support configurable alert windows and multi-channel delivery.

The recommended architecture is: **Next.js App Router** (frontend + API routes) + **Supabase** (database, auth, realtime, edge functions) + **Consolidated n8n** (data pipelines only) + **Multi-channel alerts** (Email + Telegram + WhatsApp via Supabase Edge Functions).

---

## 2. Existing System Analysis

### 2.1 Current Workflow Architecture

**Confidence: HIGH (verified from actual JSON files in repo)**

```
Facebook Controller (every 3 hours)
  -> Facebook Data Pull -- Main accounts (DISABLED)
  -> Facebook Data Pull -- Pasant (2-min wait between each)
  -> Facebook Data Pull -- aligomarketing
  -> Facebook Data Pull -- Xlerate

TikTok Controller (every 5 hours)
  -> Tiktok Data Pull -- Tiktok accounts (3-min wait)
  -> Tiktok Data Pull -- tiktok2
```

### 2.2 Data Flow Per Facebook Sub-Workflow

From the "Facebook Data Pull -- Main accounts" workflow analysis:

1. **Schedule Trigger** (every 3 hours, also triggered by controller)
2. **Cairo timestamp generation** (Code node with `Africa/Cairo` timezone)
3. **Read existing rows from Supabase** (`Facebook Data Pull -- Main accounts` table, limit 500)
4. **Sort by Account ID** ascending
5. **Split into batches** (30 per batch)
6. **Filter non-empty rows** from Google Sheets read
7. **Three parallel API calls per account:**
   - Facebook Graph API v23.0: account info (name, balance, amount_spent, account_status, funding_source_details)
   - Facebook Graph API v22.0: daily spend (yesterday's insights)
   - Facebook Graph API v22.0: monthly spend (MTD insights from start of month)
8. **Data processing:** flatten, format numbers (divide by 100 for balance/amount_spent), format spend with commas
9. **Update Supabase** (3 separate update operations per account: balance/status, daily spend, monthly total)
10. **Update Google Sheets** (appendOrUpdate by Account ID)
11. **Email alert logic:** Check if 9AM-12PM Cairo time -> Read rows from alert threshold sheet -> Filter accounts below threshold -> Generate HTML table -> Send email to hardcoded recipients

### 2.3 Known Supabase Tables (from workflow analysis)

| Table Name | Purpose | Identified Columns |
|---|---|---|
| `Facebook Data Pull -- Main accounts` | FB Main BM accounts | Account ID, Account name, Available funds, Balance, Status, Daily spending, Total spent, Date |
| `Facebook Data Pull -- Pasant` | FB Pasant BM accounts | Same schema |
| `Facebook Data Pull -- aligomarketing` | FB Aligo BM accounts | Same schema |
| `Facebook Data Pull -- Xlerate` | FB Xlerate BM accounts | Same schema |
| `Tiktok accounts` | TikTok primary accounts | row, Account name, Advertiser_id, BC-ID, Total spent, Daily spending, Available funds, Date, Status, Access, Comments |
| `tiktok2` | TikTok secondary accounts | Same schema as Tiktok accounts |
| `STATUS WORKFLOWS` | Workflow execution status | workflow_name, status, data, node |

### 2.4 Critical Issues Found

1. **Hardcoded TikTok tokens:** `9f2251a6be41003cfb076845a55de15c3fcf884b` and `b7853827d6460454b7355c7063f966ee389bf80f` appear in plaintext in HTTP request headers
2. **Hardcoded email recipients:** `zeina.moh.imam@gmail.com` and `hossamelsayed66@gmail.com` in code nodes
3. **Hardcoded Google Sheets document ID:** `17A8_7E3sugv8NWKgrX9a-Y7-9KypF5xvbHkgbulVqLE`
4. **Mixed API versions:** Facebook calls use both v22.0 (insights) and v23.0 (account info) in the same workflow
5. **Hardcoded TikTok advertiser IDs:** Airtable record IDs and advertiser IDs embedded in code
6. **No error recovery beyond retry:** `retryOnFail: true` with `maxTries: 2` but no dead-letter queue or persistent failure tracking
7. **Race condition risk:** Wait nodes (1-3 minutes) between operations introduce timing fragility

---

## 3. Next.js for Real-Time Dashboards

### 3.1 App Router Architecture

**Confidence: MEDIUM (training data, verify current Next.js docs)**

Use Next.js App Router (not Pages Router). The App Router is the stable default since Next.js 13.4+ and provides the component model needed for this dashboard.

**Key architecture decisions:**

```
app/
  layout.tsx              # Root layout with Supabase provider
  page.tsx                # Dashboard home (Server Component)
  (auth)/
    login/page.tsx        # Login page
    callback/route.ts     # Supabase auth callback
  (dashboard)/
    layout.tsx            # Dashboard layout with sidebar
    page.tsx              # Overview dashboard
    facebook/
      page.tsx            # Facebook accounts overview
      [accountId]/page.tsx # Individual account detail
    tiktok/
      page.tsx            # TikTok accounts overview
      [accountId]/page.tsx
    alerts/
      page.tsx            # Alert configuration
      history/page.tsx    # Alert history
    settings/
      page.tsx            # User/org settings
  api/
    webhooks/
      n8n/route.ts        # Webhook for n8n to notify dashboard
    cron/
      alerts/route.ts     # Vercel Cron for alert evaluation
```

### 3.2 Server Components vs Client Components

**Recommendation: Default to Server Components, use Client Components only for interactivity.**

| Component Type | Use For | Example |
|---|---|---|
| Server Component | Initial data fetch, static layout, SEO | Account list page, settings page |
| Client Component | Real-time updates, user interactions, charts | Live spend ticker, alert threshold sliders, chart widgets |

**Pattern for real-time dashboard:**

```typescript
// app/(dashboard)/page.tsx -- Server Component
// Fetches initial data server-side, then hands off to client for realtime

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  // Initial data load (server-side, fast, no loading spinner)
  const { data: accounts } = await supabase
    .from('ad_accounts')
    .select('*')
    .order('account_name');

  // Hand off to client component for realtime subscriptions
  return <DashboardClient initialAccounts={accounts ?? []} />;
}
```

```typescript
// app/(dashboard)/dashboard-client.tsx
'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { AdAccount } from '@/types/database';

export function DashboardClient({ initialAccounts }: { initialAccounts: AdAccount[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const channel = supabase
      .channel('ad-accounts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',          // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'ad_accounts',
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setAccounts(prev =>
              prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a)
            );
          }
          // Handle INSERT, DELETE similarly
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {accounts.map(account => (
        <AccountCard key={account.id} account={account} />
      ))}
    </div>
  );
}
```

### 3.3 Supabase SSR Auth Pattern

**Confidence: MEDIUM (training data pattern, verify @supabase/ssr current API)**

Use `@supabase/ssr` (not the deprecated `@supabase/auth-helpers-nextjs`). This is the current recommended package.

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
```

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// middleware.ts -- Critical for auth session refresh
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the auth token
  const { data: { user } } = await supabase.auth.getUser();

  // Protect dashboard routes
  if (!user && request.nextUrl.pathname.startsWith('/(dashboard)')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

### 3.4 Chart Library Recommendation

**Recommendation: Recharts** for this project.

| Library | Bundle Size | SSR | Customization | Learning Curve |
|---|---|---|---|---|
| Recharts | ~45KB | Good | Medium | Low |
| Chart.js (react-chartjs-2) | ~60KB | Needs wrapper | High | Medium |
| Nivo | ~80KB | Excellent | Very High | Medium |
| Tremor | ~30KB (uses Recharts) | Good | Low (opinionated) | Very Low |

**Why Recharts:** Mature, well-documented, React-native, composable API. For a dashboard with line charts (spend over time), bar charts (account comparisons), and gauges (budget utilization), Recharts covers all needs without the overhead of Nivo.

**Alternative consideration:** Tremor is worth evaluating if you want pre-built dashboard components (cards, metrics, sparklines). It uses Recharts under the hood but provides higher-level abstractions. However, it is more opinionated about styling.

### 3.5 UI Component Library

**Recommendation: shadcn/ui + Tailwind CSS**

| Option | Why / Why Not |
|---|---|
| **shadcn/ui** (recommended) | Copy-paste components, full control, Tailwind-native, excellent with Next.js App Router |
| Ant Design | Heavy bundle, complex theming, not Tailwind-native |
| MUI | Heavy, style system conflicts with Tailwind |
| Chakra UI | Good DX but adds runtime CSS-in-JS overhead |

shadcn/ui provides exactly the right level of abstraction: pre-built components you own and can customize, with no runtime dependency. Combined with Tailwind CSS, this gives full control over the dashboard aesthetic.

---

## 4. Supabase Patterns

### 4.1 Schema Redesign

**Confidence: HIGH (based on analysis of existing tables)**

The current schema uses 7 separate tables with identical schemas (one per business manager / token group). This should be consolidated into a normalized design.

**Recommended schema:**

```sql
-- Organizations (multi-tenant ready)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users with org membership
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ad platforms (facebook, tiktok, etc.)
CREATE TYPE ad_platform AS ENUM ('facebook', 'tiktok');

-- Ad accounts (unified - replaces 7 separate tables)
CREATE TABLE ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  platform ad_platform NOT NULL,
  platform_account_id TEXT NOT NULL,        -- Facebook act_XXXX or TikTok advertiser_id
  account_name TEXT NOT NULL,
  business_manager TEXT,                     -- 'Main', 'Pasant', 'aligomarketing', 'Xlerate', etc.
  status TEXT DEFAULT 'active',
  available_funds NUMERIC(15,2),
  balance NUMERIC(15,2),
  daily_spend NUMERIC(15,2),
  monthly_spend NUMERIC(15,2),
  currency TEXT DEFAULT 'EGP',
  funding_source_display TEXT,               -- Facebook funding_source_details.display_string
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite unique: one account per org per platform
  UNIQUE(org_id, platform, platform_account_id)
);

-- Historical spend snapshots (for charts and trends)
CREATE TABLE spend_snapshots (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  daily_spend NUMERIC(15,2) NOT NULL DEFAULT 0,
  monthly_spend NUMERIC(15,2) NOT NULL DEFAULT 0,
  available_funds NUMERIC(15,2),
  balance NUMERIC(15,2),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One snapshot per account per day
  UNIQUE(account_id, snapshot_date)
);

-- Alert configurations
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  account_id UUID REFERENCES ad_accounts(id),  -- NULL = applies to all accounts
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'low_balance',          -- Balance below threshold
    'high_daily_spend',     -- Daily spend exceeds threshold
    'time_to_depletion',    -- Predicted depletion within N hours
    'account_status_change' -- Account disabled/enabled
  )),
  threshold_value NUMERIC(15,2),
  threshold_unit TEXT,                           -- 'currency', 'hours', 'percentage'
  channels TEXT[] NOT NULL DEFAULT '{email}',    -- {'email', 'telegram', 'whatsapp'}
  is_active BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,  -- Don't re-alert within this window
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alert history / log
CREATE TABLE alert_log (
  id BIGSERIAL PRIMARY KEY,
  rule_id UUID REFERENCES alert_rules(id),
  account_id UUID REFERENCES ad_accounts(id),
  channel TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API credentials (encrypted references, NOT raw tokens)
CREATE TABLE api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  platform ad_platform NOT NULL,
  credential_name TEXT NOT NULL,               -- 'Main BM System User', 'TikTok Access Token 1'
  -- Store actual tokens in Supabase Vault or environment variables
  -- This table only stores metadata
  vault_secret_name TEXT NOT NULL,             -- Reference to Supabase Vault secret
  token_type TEXT,                             -- 'system_user', 'long_lived', 'app_secret'
  expires_at TIMESTAMPTZ,                      -- NULL for non-expiring tokens
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workflow execution status (replaces STATUS WORKFLOWS table)
CREATE TABLE sync_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  platform ad_platform NOT NULL,
  business_manager TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial_failure', 'failed')),
  accounts_total INTEGER,
  accounts_succeeded INTEGER,
  accounts_failed INTEGER,
  error_details JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX idx_ad_accounts_org ON ad_accounts(org_id);
CREATE INDEX idx_ad_accounts_platform ON ad_accounts(org_id, platform);
CREATE INDEX idx_spend_snapshots_account_date ON spend_snapshots(account_id, snapshot_date DESC);
CREATE INDEX idx_alert_log_account ON alert_log(account_id, created_at DESC);
CREATE INDEX idx_sync_log_org ON sync_log(org_id, started_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ad_accounts_updated_at
  BEFORE UPDATE ON ad_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 4.2 Row Level Security (RLS)

**Confidence: MEDIUM (training data pattern, verify current Supabase RLS syntax)**

RLS is essential for multi-tenant readiness. Even for single-tenant now, implementing RLS from day one prevents security holes when adding clients later.

```sql
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Helper function: get user's org_id
CREATE OR REPLACE FUNCTION auth.user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function: get user's role
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Organizations: users can only see their own org
CREATE POLICY "Users can view own org"
  ON organizations FOR SELECT
  USING (id = auth.user_org_id());

-- Ad accounts: users see accounts in their org
CREATE POLICY "Users can view org accounts"
  ON ad_accounts FOR SELECT
  USING (org_id = auth.user_org_id());

-- Only admins/managers can update accounts
CREATE POLICY "Managers can update org accounts"
  ON ad_accounts FOR UPDATE
  USING (org_id = auth.user_org_id() AND auth.user_role() IN ('admin', 'manager'));

-- Spend snapshots: users see their org's snapshots
CREATE POLICY "Users can view org snapshots"
  ON spend_snapshots FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM ad_accounts WHERE org_id = auth.user_org_id()
    )
  );

-- Alert rules: users see their org's rules
CREATE POLICY "Users can view org alert rules"
  ON alert_rules FOR SELECT
  USING (org_id = auth.user_org_id());

CREATE POLICY "Managers can manage alert rules"
  ON alert_rules FOR ALL
  USING (org_id = auth.user_org_id() AND auth.user_role() IN ('admin', 'manager'));

-- IMPORTANT: Service role bypass for n8n and Edge Functions
-- n8n should use the service_role key (bypasses RLS) when writing data
-- Edge Functions use service_role for cross-org operations like alerts
-- The anon key (used by dashboard) is always subject to RLS
```

**RLS Performance Consideration:** The `auth.user_org_id()` function is called on every query. Mark it as `STABLE` (not `VOLATILE`) so PostgreSQL can cache the result within a transaction. For high-frequency queries, consider adding `org_id` as a direct column on every table rather than relying on JOINs through the helper function.

### 4.3 Supabase Realtime for Live Dashboard

**Confidence: MEDIUM (training data, verify current Supabase Realtime API)**

Supabase Realtime supports three modes:

1. **Postgres Changes** -- Listen to INSERT/UPDATE/DELETE on tables (what we need)
2. **Broadcast** -- Publish arbitrary messages to channels (useful for notifications)
3. **Presence** -- Track online users (useful for "who's viewing" in future)

**For the dashboard, use Postgres Changes:**

The `ad_accounts` table gets updated by n8n every 3-5 hours. When n8n writes new balance/spend data, the dashboard should reflect it instantly without page refresh.

**Setup requirements:**
1. Enable Realtime on the `ad_accounts` table in Supabase Dashboard (Database > Replication)
2. Realtime respects RLS -- users only receive changes for rows they can SELECT

```sql
-- Enable realtime for specific tables (run in Supabase SQL editor)
ALTER PUBLICATION supabase_realtime ADD TABLE ad_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE alert_log;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_log;
```

**Important limitation:** Supabase Realtime Postgres Changes has a payload size limit (typically ~8KB per change event). For the `ad_accounts` table with simple numeric fields, this is not a concern. But avoid putting large JSONB blobs in realtime-enabled tables.

### 4.4 Supabase Edge Functions for Alerting

**Confidence: MEDIUM (training data, verify current Supabase Edge Functions docs)**

Edge Functions (Deno runtime) are ideal for the alerting engine because they:
- Can be triggered by database webhooks (on INSERT/UPDATE to `ad_accounts`)
- Have access to Supabase Vault for secrets (API tokens, SMTP credentials)
- Run close to the database (low latency for reads)
- Can make outbound HTTP calls (Telegram, WhatsApp, SMTP)

**Architecture for alert evaluation:**

```
n8n updates ad_accounts row
  -> Postgres trigger fires
  -> Database webhook calls Edge Function
  -> Edge Function evaluates alert rules
  -> Edge Function sends notifications via appropriate channels
  -> Edge Function logs to alert_log table
```

**Edge Function: Alert Evaluator**

```typescript
// supabase/functions/evaluate-alerts/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'UPDATE';
  table: 'ad_accounts';
  record: {
    id: string;
    org_id: string;
    platform: string;
    account_name: string;
    available_funds: number;
    balance: number;
    daily_spend: number;
    monthly_spend: number;
  };
  old_record: {
    available_funds: number;
    balance: number;
  };
}

serve(async (req) => {
  const payload: WebhookPayload = await req.json();
  const { record, old_record } = payload;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Fetch applicable alert rules
  const { data: rules } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('org_id', record.org_id)
    .eq('is_active', true)
    .or(`account_id.eq.${record.id},account_id.is.null`);

  for (const rule of rules ?? []) {
    let shouldAlert = false;
    let message = '';

    switch (rule.rule_type) {
      case 'low_balance':
        shouldAlert = record.available_funds <= rule.threshold_value;
        message = `Low balance alert: ${record.account_name} has ${record.available_funds} remaining`;
        break;

      case 'time_to_depletion': {
        // Predict time to zero based on daily spend rate
        if (record.daily_spend > 0) {
          const hoursRemaining = (record.available_funds / record.daily_spend) * 24;
          shouldAlert = hoursRemaining <= rule.threshold_value;
          message = `Depletion warning: ${record.account_name} will deplete in ~${Math.round(hoursRemaining)} hours`;
        }
        break;
      }

      case 'account_status_change':
        shouldAlert = record.status !== old_record?.status;
        message = `Status change: ${record.account_name} is now ${record.status}`;
        break;
    }

    if (shouldAlert) {
      // Check cooldown
      const { data: recentAlert } = await supabase
        .from('alert_log')
        .select('id')
        .eq('rule_id', rule.id)
        .eq('account_id', record.id)
        .gte('created_at', new Date(Date.now() - rule.cooldown_minutes * 60000).toISOString())
        .limit(1);

      if (recentAlert && recentAlert.length > 0) continue; // In cooldown

      // Send via each configured channel
      for (const channel of rule.channels) {
        await sendAlert(supabase, channel, message, rule, record);
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

**Database webhook setup (via Supabase Dashboard or SQL):**

```sql
-- Option: Use pg_net extension (built into Supabase) for database-level webhooks
-- This fires the Edge Function whenever ad_accounts is updated

CREATE OR REPLACE FUNCTION notify_alert_evaluator()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  payload = jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW),
    'old_record', row_to_json(OLD)
  );

  -- Call Edge Function via pg_net
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/evaluate-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := payload
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_ad_account_update
  AFTER UPDATE ON ad_accounts
  FOR EACH ROW
  EXECUTE FUNCTION notify_alert_evaluator();
```

### 4.5 Supabase Vault for Secrets

**Confidence: LOW (verify current Supabase Vault availability and API)**

Supabase Vault provides encrypted secret storage accessible from Edge Functions and database functions. Use it for:
- Facebook System User tokens
- TikTok access tokens
- SMTP credentials
- Telegram bot token
- WhatsApp API token

```sql
-- Store a secret in Vault
SELECT vault.create_secret('facebook_system_user_token', 'EAA...long_token_here');
SELECT vault.create_secret('tiktok_access_token_1', '9f2251...');
SELECT vault.create_secret('telegram_bot_token', '123456:ABC-DEF...');

-- Retrieve in Edge Function via Supabase client or directly in SQL
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'facebook_system_user_token';
```

---

## 5. Facebook Graph API

### 5.1 Version Strategy

**Confidence: MEDIUM (training data, verify current deprecation schedule)**

The existing workflows use both v22.0 and v23.0. Facebook deprecates API versions roughly 2 years after release.

**Recommendation:** Standardize on **v23.0** (the version already used for account info calls). Using a single version avoids subtle behavior differences between versions in the same pipeline.

**Version lifecycle pattern:**
- Facebook typically releases a new version every few months
- Each version is supported for ~2 years
- Monitor https://developers.facebook.com/docs/graph-api/changelog for deprecation notices
- Build the API version as a configurable constant, not hardcoded in every call

```typescript
// lib/facebook/config.ts
export const FACEBOOK_API_CONFIG = {
  version: 'v23.0',     // Single source of truth
  baseUrl: 'https://graph.facebook.com',
  get apiUrl() { return `${this.baseUrl}/${this.version}`; },
} as const;
```

### 5.2 System User Tokens (Non-Expiring)

**Confidence: MEDIUM (training data, verify current Facebook Business documentation)**

For a server-to-server data pipeline, System User tokens are the correct choice:

| Token Type | Expiry | Use Case |
|---|---|---|
| User Access Token | 1-2 hours | Interactive user sessions |
| Long-Lived User Token | ~60 days | Still expires, bad for automation |
| Page Access Token | Never (if from long-lived user token) | Page operations only |
| **System User Token** | **Never expires** | **Server-to-server API calls** |
| App Access Token | Never expires | App-level operations only (no ad data) |

**Setup process for System Users:**
1. Go to Business Manager > Business Settings > System Users
2. Create a System User (or Admin System User for full access)
3. Assign ad accounts and permissions to the System User
4. Generate a token -- this token does NOT expire
5. Store the token in Supabase Vault (not in code or n8n nodes)

**Permissions needed:**
- `ads_read` -- Read ad account data, campaigns, insights
- `business_management` -- Access Business Manager resources
- `read_insights` -- Read ad insights/reporting data

**Important:** Each Business Manager needs its own System User. For Targetspro with 4 BMs (Main, Pasant, aligomarketing, Xlerate), you need 4 System User tokens.

### 5.3 Rate Limits

**Confidence: MEDIUM (training data, verify current rate limit documentation)**

Facebook uses a tiered rate limiting system for the Marketing API:

**Business Use Case Rate Limiting:**
- Rate limits are per-ad-account, not per-app or per-token
- Each ad account has a "call budget" that replenishes over time
- The API returns rate limit headers: `x-business-use-case-usage`

**Practical limits (approximate):**
- Standard tier: ~200 calls per hour per ad account
- Higher tiers available based on app review and spend volume

**Rate limit response header:**
```json
{
  "x-business-use-case-usage": {
    "act_123456": [{
      "type": "ads_insights",
      "call_count": 28,
      "total_cputime": 15,
      "total_time": 20,
      "estimated_time_to_regain_access": 0
    }]
  }
}
```

**Handling strategy:**

```typescript
// lib/facebook/rate-limiter.ts
interface RateLimitStatus {
  callCount: number;      // Percentage 0-100
  cpuTime: number;        // Percentage 0-100
  totalTime: number;      // Percentage 0-100
  estimatedRecovery: number;
}

export class FacebookRateLimiter {
  private accountUsage: Map<string, RateLimitStatus> = new Map();

  parseHeaders(accountId: string, headers: Headers): void {
    const usage = headers.get('x-business-use-case-usage');
    if (!usage) return;

    const parsed = JSON.parse(usage);
    const accountUsage = parsed[accountId]?.[0];
    if (accountUsage) {
      this.accountUsage.set(accountId, {
        callCount: accountUsage.call_count,
        cpuTime: accountUsage.total_cputime,
        totalTime: accountUsage.total_time,
        estimatedRecovery: accountUsage.estimated_time_to_regain_access,
      });
    }
  }

  shouldThrottle(accountId: string): boolean {
    const usage = this.accountUsage.get(accountId);
    if (!usage) return false;
    // Throttle when any metric exceeds 75%
    return usage.callCount > 75 || usage.cpuTime > 75 || usage.totalTime > 75;
  }

  getBackoffMs(accountId: string): number {
    const usage = this.accountUsage.get(accountId);
    if (!usage) return 0;
    if (usage.estimatedRecovery > 0) return usage.estimatedRecovery * 60 * 1000;
    // Exponential backoff based on usage percentage
    const maxUsage = Math.max(usage.callCount, usage.cpuTime, usage.totalTime);
    return Math.min(maxUsage * 100, 30000); // Cap at 30 seconds
  }
}
```

### 5.4 Batch Requests

**Confidence: MEDIUM (training data, verify current batch API docs)**

Facebook supports batch requests -- multiple API calls in a single HTTP request. This is critical for reducing the number of round trips when pulling data for 30+ accounts.

```typescript
// lib/facebook/batch.ts
interface BatchRequest {
  method: 'GET' | 'POST';
  relative_url: string;
  name?: string;    // For referencing in dependent requests
}

export async function facebookBatch(
  token: string,
  requests: BatchRequest[],
  apiVersion: string = 'v23.0'
): Promise<any[]> {
  // Facebook batch limit: 50 requests per batch
  const BATCH_SIZE = 50;
  const results: any[] = [];

  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const chunk = requests.slice(i, i + BATCH_SIZE);

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          batch: chunk.map(r => ({
            method: r.method,
            relative_url: r.relative_url,
          })),
        }),
      }
    );

    const batchResults = await response.json();
    results.push(...batchResults.map((r: any) => ({
      code: r.code,
      body: JSON.parse(r.body),
    })));
  }

  return results;
}

// Usage: fetch account info for all accounts in one batch
const accountIds = ['act_123', 'act_456', 'act_789'];
const requests = accountIds.map(id => ({
  method: 'GET' as const,
  relative_url: `${id}?fields=name,balance,amount_spent,account_status,funding_source_details{display_string}`,
}));

const results = await facebookBatch(systemUserToken, requests);
```

### 5.5 Optimal Data Pull Pattern

**Recommendation for the consolidated pipeline:**

```
Step 1: Batch account info (1 batch call for up to 50 accounts)
  - Fields: name, balance, amount_spent, account_status, funding_source_details

Step 2: Batch daily insights (1 batch call)
  - Fields: spend per account for yesterday
  - time_range: yesterday to yesterday

Step 3: Batch monthly insights (1 batch call)
  - Fields: spend per account for month-to-date
  - time_range: first of month to today

Total: 3 HTTP requests instead of ~90 (3 calls x 30 accounts)
```

---

## 6. TikTok Business API

### 6.1 API Overview

**Confidence: MEDIUM (training data + verified endpoints from existing workflows)**

The existing workflows use three TikTok Business API v1.3 endpoints:

| Endpoint | Purpose | Method |
|---|---|---|
| `/open_api/v1.3/advertiser/info/` | Get advertiser name, balance | GET |
| `/open_api/v1.3/advertiser/balance/get/` | Get available funds (requires bc_id for some accounts) | GET |
| `/open_api/v1.3/report/integrated/get/` | Get spend reports (daily, monthly) | GET (with JSON body) |

### 6.2 Token Management

**Confidence: HIGH (verified from existing workflow files)**

The existing system uses two distinct access tokens for two groups of TikTok accounts:
- Token 1: `9f2251...` for "Tiktok accounts" workflow
- Token 2: `b78538...` for "tiktok2" workflow

**TikTok token types:**
- Access tokens issued via OAuth are long-lived (typically valid for ~1 year)
- Some app-level tokens may not expire
- Unlike Facebook, TikTok does not have a "System User" concept

**Token refresh strategy:**
1. Store tokens in Supabase Vault
2. Track `expires_at` in `api_credentials` table
3. Build a token refresh Edge Function that runs weekly
4. Alert admins 30 days before token expiry

```typescript
// lib/tiktok/client.ts
export class TikTokClient {
  private baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';

  constructor(private accessToken: string) {}

  private async request<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new TikTokAPIError(data.code, data.message);
    }
    return data;
  }

  async getAdvertiserInfo(advertiserIds: string[]): Promise<any> {
    return this.request('/advertiser/info/', {
      advertiser_ids: JSON.stringify(advertiserIds),
    });
  }

  async getBalance(advertiserId: string, bcId?: string): Promise<any> {
    const params: Record<string, string> = {
      advertiser_ids: advertiserId,
    };
    if (bcId) params.bc_id = bcId;
    return this.request('/advertiser/balance/get/', params);
  }

  async getReport(params: {
    advertiserId: string;
    startDate: string;
    endDate: string;
    metrics?: string[];
  }): Promise<any> {
    return this.request('/report/integrated/get/', {
      advertiser_id: params.advertiserId,
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: JSON.stringify(['stat_time_day', 'campaign_id']),
      metrics: JSON.stringify(params.metrics ?? ['stat_cost']),
      start_date: params.startDate,
      end_date: params.endDate,
      page_size: 1000,
    });
  }
}
```

### 6.3 TikTok Rate Limits

**Confidence: LOW (training data only, verify current TikTok docs)**

TikTok Business API rate limits:
- Default: 10 requests per second per app
- Reporting API: May have lower limits (e.g., 600 requests per minute)
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Strategy:** Given the small number of TikTok accounts (appears to be <20 based on workflows), rate limits are unlikely to be an issue. The existing 20-30 second waits between batches are excessive -- 1-2 seconds per account should be sufficient.

### 6.4 Key Difference from Facebook

TikTok uses **Business Center (BC) ID** for some balance queries. The existing workflow passes `bc_id` as a parameter for the balance endpoint. This means some TikTok accounts are managed through a Business Center, which adds a layer of hierarchy.

Store `bc_id` as a column on the `ad_accounts` table for TikTok accounts that require it.

---

## 7. Alert Channel Integration

### 7.1 Email (SMTP)

**Confidence: HIGH (standard SMTP pattern, existing infrastructure verified)**

The existing system uses `info@targetspro.com` via SMTP. Continue using this.

```typescript
// lib/alerts/email.ts
import { createTransport } from 'nodemailer';

const transporter = createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendAlertEmail(params: {
  to: string[];
  subject: string;
  html: string;
}): Promise<void> {
  await transporter.sendMail({
    from: '"Targetspro Alerts" <info@targetspro.com>',
    to: params.to.join(', '),
    subject: params.subject,
    html: params.html,
  });
}
```

**For Edge Functions (Deno runtime):** You cannot use `nodemailer` directly. Options:
1. Use Supabase's built-in SMTP integration (if available)
2. Use a REST-based email service (Resend, SendGrid, Postmark) via `fetch`
3. Call a Next.js API route that uses `nodemailer`

**Recommendation:** Use **Resend** for transactional emails from Edge Functions. It has a generous free tier (100 emails/day) and a simple REST API compatible with Deno's `fetch`.

```typescript
// In Edge Function (Deno)
async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Targetspro Alerts <alerts@targetspro.com>',
      to: [to],
      subject,
      html,
    }),
  });
  return response.json();
}
```

### 7.2 Telegram Bot API

**Confidence: MEDIUM (training data, straightforward REST API)**

Telegram Bot API is the simplest alert channel to implement. It is a simple REST API with no approval process.

**Setup:**
1. Create a bot via @BotFather on Telegram
2. Get the bot token (format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
3. Get chat IDs for target recipients/groups
4. Store bot token in Supabase Vault

**Implementation:**

```typescript
// lib/alerts/telegram.ts
export async function sendTelegramMessage(params: {
  botToken: string;
  chatId: string;
  message: string;
  parseMode?: 'HTML' | 'MarkdownV2';
}): Promise<boolean> {
  const response = await fetch(
    `https://api.telegram.org/bot${params.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.message,
        parse_mode: params.parseMode ?? 'HTML',
        disable_web_page_preview: true,
      }),
    }
  );

  const result = await response.json();
  return result.ok === true;
}

// Alert message template
function formatAlertMessage(account: {
  name: string;
  platform: string;
  available_funds: number;
  daily_spend: number;
  hours_to_depletion: number;
}): string {
  const urgency = account.hours_to_depletion < 12 ? '🔴' : '🟡';
  return [
    `${urgency} <b>Alert: Low Balance</b>`,
    ``,
    `<b>Account:</b> ${account.name}`,
    `<b>Platform:</b> ${account.platform}`,
    `<b>Balance:</b> ${account.available_funds.toLocaleString()} EGP`,
    `<b>Daily Spend:</b> ${account.daily_spend.toLocaleString()} EGP`,
    `<b>Depletes in:</b> ~${Math.round(account.hours_to_depletion)} hours`,
    ``,
    `<i>Review in dashboard: https://app.targetspro.com</i>`,
  ].join('\n');
}
```

**Getting chat IDs:**
- For personal messages: Have the user message the bot, then call `getUpdates`
- For group alerts: Add the bot to the group, send a message, then call `getUpdates`
- Store chat IDs in a `notification_channels` table

### 7.3 WhatsApp Business API (Cloud API)

**Confidence: MEDIUM (training data, verify current Meta WhatsApp Cloud API docs)**

WhatsApp Business API (Cloud API) is hosted by Meta. It requires:
1. A Meta Business account (you already have this for Facebook ads)
2. A WhatsApp Business account
3. A verified phone number
4. Pre-approved message templates

**Critical constraint: Message Templates**

WhatsApp does NOT allow arbitrary messages to users. You must:
- Create message templates in the WhatsApp Business Manager
- Submit templates for Meta approval (takes 24-48 hours)
- Use template messages for proactive outreach (alerts)
- Only send freeform messages within a 24-hour customer-service window

**Template example for low balance alert:**

```
Template name: low_balance_alert
Category: UTILITY
Language: en

Header: Alert: Low Account Balance
Body: Account {{1}} on {{2}} has {{3}} EGP remaining.
      Estimated depletion in {{4}} hours.
      Daily spend rate: {{5}} EGP/day.
Footer: Targetspro Ad Monitor
Buttons: [Quick Reply: "View Dashboard"]
```

**Implementation:**

```typescript
// lib/alerts/whatsapp.ts
export async function sendWhatsAppTemplate(params: {
  phoneNumberId: string;   // Your WhatsApp Business phone number ID
  accessToken: string;     // WhatsApp Cloud API token
  recipientPhone: string;  // Recipient phone with country code (e.g., "+201234567890")
  templateName: string;
  templateParams: string[];
}): Promise<boolean> {
  const response = await fetch(
    `https://graph.facebook.com/v23.0/${params.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: params.recipientPhone,
        type: 'template',
        template: {
          name: params.templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: params.templateParams.map(p => ({
                type: 'text',
                text: p,
              })),
            },
          ],
        },
      }),
    }
  );

  const result = await response.json();
  return !result.error;
}
```

**WhatsApp pricing:**
- Business-initiated conversations (alerts) cost money per conversation (24-hour window)
- Pricing varies by country. Egypt: approximately $0.045-0.065 per conversation
- At 10 alerts/day, this is roughly $15-20/month

**Recommendation:** Implement WhatsApp as a Phase 2 feature. Start with Email + Telegram (free, no approval needed), then add WhatsApp once template approval processes are understood.

### 7.4 Unified Alert Dispatcher

```typescript
// lib/alerts/dispatcher.ts
type AlertChannel = 'email' | 'telegram' | 'whatsapp';

interface AlertPayload {
  ruleId: string;
  accountId: string;
  accountName: string;
  platform: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  data: Record<string, any>;
}

export async function dispatchAlert(
  channels: AlertChannel[],
  payload: AlertPayload,
  supabase: SupabaseClient
): Promise<void> {
  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      try {
        switch (channel) {
          case 'email':
            await sendAlertEmail(/* ... */);
            break;
          case 'telegram':
            await sendTelegramMessage(/* ... */);
            break;
          case 'whatsapp':
            await sendWhatsAppTemplate(/* ... */);
            break;
        }

        // Log success
        await supabase.from('alert_log').insert({
          rule_id: payload.ruleId,
          account_id: payload.accountId,
          channel,
          severity: payload.severity,
          message: payload.message,
          metadata: payload.data,
          delivered_at: new Date().toISOString(),
        });
      } catch (error) {
        // Log failure
        await supabase.from('alert_log').insert({
          rule_id: payload.ruleId,
          account_id: payload.accountId,
          channel,
          severity: payload.severity,
          message: payload.message,
          metadata: { ...payload.data, error: String(error) },
          delivered_at: null, // null = failed delivery
        });
      }
    })
  );
}
```

---

## 8. n8n Workflow Consolidation

### 8.1 Current State: 8 Workflows

**Confidence: HIGH (verified from actual JSON files)**

| Workflow | Type | Schedule | Notes |
|---|---|---|---|
| Main_Controller => Facebook | Controller | Every 3h | Calls 4 sub-workflows sequentially with 2-3 min waits |
| Facebook Data Pull -- Main accounts | Sub-workflow | (called by controller, also has own 3h trigger) | DISABLED in controller |
| Facebook Data Pull -- Pasant | Sub-workflow | (called by controller) | |
| Facebook Data Pull -- aligomarketing | Sub-workflow | (called by controller) | |
| Facebook Data Pull -- Xlerate | Sub-workflow | (called by controller) | |
| Main_Controller => Tiktok | Controller | Every 5h | Calls 2 sub-workflows with 3 min wait |
| Tiktok Data Pull -- Tiktok accounts | Sub-workflow | (called by controller) | Token 1 |
| Tiktok Data Pull -- tiktok2 | Sub-workflow | (called by controller) | Token 2 |

### 8.2 Target State: 3 Workflows

**Recommendation:** Consolidate to 3 workflows:

```
1. Main Controller (single controller for all platforms)
   - Schedule: configurable (default every 3 hours)
   - Calls Facebook Data Pull with parameters
   - Calls TikTok Data Pull with parameters
   - Reports status to sync_log table

2. Facebook Data Pull (single parameterized workflow)
   - Input: { business_manager: string, credential_name: string }
   - Fetches credential from Supabase Vault
   - Pulls account info via batch API
   - Pulls daily/monthly insights via batch API
   - Updates ad_accounts table (single unified table)
   - Updates spend_snapshots table
   - Returns status to controller

3. TikTok Data Pull (single parameterized workflow)
   - Input: { token_group: string, credential_name: string }
   - Fetches credential from Supabase Vault
   - Pulls advertiser info + balance + reports
   - Updates ad_accounts table
   - Updates spend_snapshots table
   - Returns status to controller
```

### 8.3 n8n Credential Management

**Confidence: HIGH (n8n credential features are well-established)**

n8n supports credential storage natively. All hardcoded tokens must be moved to n8n credentials:

1. **Facebook Graph API credential:** Use n8n's built-in "Facebook Graph API" credential type (already partially used -- credential ID `x0GIizNGjoBNjkuZ` exists)
2. **TikTok:** Use n8n's "Header Auth" credential type (since TikTok uses `Access-Token` header)
3. **Supabase:** Already using credential ID `lFpI1xaNAWw9fNa4`

**For the parameterized workflow pattern:**

```
Controller passes credential_name as parameter
  -> Sub-workflow uses n8n's credential selector to pick the right credential
  -> No tokens in workflow JSON files
```

### 8.4 Eliminate Google Sheets Dependency

The current workflows dual-write to both Supabase and Google Sheets. The new architecture should:

1. **Phase 1:** Keep Google Sheets writes but make them non-blocking (continue on error)
2. **Phase 2:** Remove Google Sheets writes entirely once the dashboard replaces Sheets as the viewing interface
3. **Migration:** Run both systems in parallel for 2-4 weeks to validate data consistency

### 8.5 n8n Error Handling Improvements

The existing workflows have `retryOnFail: true` with `maxTries: 2` and `continueRegularOutput` on errors. This means failures are silently swallowed. Improvements:

1. **Structured error logging:** Write all errors to `sync_log` with details
2. **Per-account error tracking:** Don't fail the entire batch if one account fails
3. **Error notification:** Use the alerting system to notify admins of pipeline failures
4. **Dead letter queue:** Store failed account pulls for manual retry

---

## 9. TypeScript Project Structure

### 9.1 Recommended Project Layout

```
targetspro/
  .env.local                    # Local environment variables (gitignored)
  .env.example                  # Template for required env vars
  next.config.ts                # Next.js configuration
  tailwind.config.ts            # Tailwind CSS configuration
  tsconfig.json                 # TypeScript configuration
  package.json
  middleware.ts                 # Auth middleware

  app/                          # Next.js App Router
    layout.tsx                  # Root layout
    page.tsx                    # Landing/redirect
    globals.css                 # Global styles
    (auth)/
      login/page.tsx
      callback/route.ts
    (dashboard)/
      layout.tsx
      page.tsx
      facebook/...
      tiktok/...
      alerts/...
      settings/...
    api/
      webhooks/n8n/route.ts
      cron/alerts/route.ts

  components/                   # Shared UI components
    ui/                         # shadcn/ui components
      button.tsx
      card.tsx
      ...
    dashboard/                  # Dashboard-specific components
      account-card.tsx
      spend-chart.tsx
      alert-badge.tsx
      platform-icon.tsx
    forms/                      # Form components
      alert-rule-form.tsx
      threshold-input.tsx
    layout/                     # Layout components
      sidebar.tsx
      header.tsx
      nav-links.tsx

  lib/                          # Core business logic
    supabase/
      server.ts                 # Server-side Supabase client
      client.ts                 # Browser-side Supabase client
      admin.ts                  # Service role client (for API routes)
    facebook/
      client.ts                 # Facebook API client
      batch.ts                  # Batch request helpers
      rate-limiter.ts           # Rate limit tracking
      types.ts                  # Facebook-specific types
    tiktok/
      client.ts                 # TikTok API client
      types.ts                  # TikTok-specific types
    alerts/
      dispatcher.ts             # Multi-channel alert dispatcher
      email.ts                  # Email sending
      telegram.ts               # Telegram bot
      whatsapp.ts               # WhatsApp Cloud API
      evaluator.ts              # Alert rule evaluation logic
    utils/
      timezone.ts               # Cairo timezone helpers
      currency.ts               # EGP formatting
      dates.ts                  # Date range helpers (MTD, yesterday, etc.)

  types/                        # TypeScript type definitions
    database.ts                 # Generated Supabase types
    api.ts                      # API request/response types
    alerts.ts                   # Alert system types

  hooks/                        # React hooks
    use-realtime-accounts.ts    # Supabase Realtime subscription
    use-alert-rules.ts          # Alert rule CRUD
    use-date-range.ts           # Date picker state

  supabase/                     # Supabase project files
    config.toml                 # Supabase CLI config
    migrations/                 # Database migrations
      001_initial_schema.sql
      002_rls_policies.sql
      003_functions.sql
    functions/                  # Edge Functions
      evaluate-alerts/
        index.ts
      token-refresh/
        index.ts
    seed.sql                    # Seed data for development
```

### 9.2 Type Generation from Supabase

**Confidence: MEDIUM (training data, verify current Supabase CLI)**

Use the Supabase CLI to generate TypeScript types from your database schema:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts
```

This generates types like:

```typescript
// types/database.ts (auto-generated)
export type Database = {
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          id: string;
          org_id: string;
          platform: 'facebook' | 'tiktok';
          platform_account_id: string;
          account_name: string;
          available_funds: number | null;
          balance: number | null;
          daily_spend: number | null;
          monthly_spend: number | null;
          // ... all columns
        };
        Insert: { /* ... */ };
        Update: { /* ... */ };
      };
      // ... other tables
    };
  };
};
```

Then use it with the Supabase client:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabase = createClient<Database>(url, key);

// Now fully typed:
const { data } = await supabase
  .from('ad_accounts')
  .select('account_name, available_funds')
  .eq('platform', 'facebook');
// data is typed as Pick<AdAccount, 'account_name' | 'available_funds'>[]
```

### 9.3 Environment Variables

```bash
# .env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Email (choose one)
SMTP_HOST=smtp.targetspro.com
SMTP_PORT=587
SMTP_USER=info@targetspro.com
SMTP_PASS=
# OR
RESEND_API_KEY=re_...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_IDS=comma,separated,ids

# WhatsApp (Phase 2)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=

# App
NEXT_PUBLIC_APP_URL=https://app.targetspro.com
DEFAULT_TIMEZONE=Africa/Cairo
```

---

## 10. Security Hardening

### 10.1 Immediate Actions (Pre-Migration)

**Priority 1: Remove hardcoded tokens from n8n workflow files**

The TikTok workflows contain plaintext access tokens. These JSON files are now in a git repository. Actions:

1. Rotate both TikTok tokens immediately (the tokens in the repo should be considered compromised)
2. Move tokens to n8n credential storage
3. Add `*.json` to `.gitignore` if these workflow files should not be tracked (or use n8n's export without credentials option)

**Priority 2: Remove hardcoded email addresses from code nodes**

Move recipient lists to a configurable table or environment variable.

### 10.2 Authentication Architecture

Use Supabase Auth with email/password for initial deployment:

```typescript
// Supabase Auth configuration
// Enable in Supabase Dashboard: Authentication > Providers > Email

// Sign up (admin creates accounts -- no self-registration)
const { data, error } = await supabase.auth.admin.createUser({
  email: 'manager@targetspro.com',
  password: 'secure-password',
  email_confirm: true,
  user_metadata: { full_name: 'Manager Name', role: 'manager' },
});
```

**Role-based access:**
- `admin`: Full access, manage users, manage API credentials
- `manager`: View all accounts, configure alerts, manage thresholds
- `viewer`: View dashboards only (future: client portal)

### 10.3 API Route Protection

```typescript
// app/api/webhooks/n8n/route.ts
// Protected with a shared secret (not Supabase auth)
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.N8N_WEBHOOK_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Process webhook...
}
```

---

## 11. Timezone Handling

### 11.1 The Cairo Timezone Challenge

**Confidence: HIGH (analyzed timezone code in all 8 workflows)**

Every existing workflow contains a `formatTimestampCairo` function that manually formats dates in `Africa/Cairo` timezone. The current approach has subtle bugs:

```javascript
// Current (buggy) approach in some nodes:
const hour = now.getUTCHours() + 3; // WRONG: Cairo is UTC+2, not UTC+3
                                     // Also wrong: ignores DST entirely
```

Egypt abolished DST in 2014 and is permanently UTC+2. However, code that hardcodes `+3` (as seen in the alert time check node) is incorrect.

### 11.2 Correct Timezone Strategy

**Always use `Intl.DateTimeFormat` with `timeZone: 'Africa/Cairo'`** -- never manually add/subtract hours.

```typescript
// lib/utils/timezone.ts

/**
 * Get current date/time components in Cairo timezone.
 * NEVER manually add UTC offsets.
 */
export function getCairoNow(): {
  date: string;          // YYYY-MM-DD
  time: string;          // h:mm AM/PM
  hour: number;          // 0-23
  fullDateTime: string;  // YYYY-MM-DD h:mm AM/PM
} {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';

  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour'));
  const ampm = get('dayPeriod');
  const hour24 = ampm === 'PM' && hour !== 12 ? hour + 12 : (ampm === 'AM' && hour === 12 ? 0 : hour);
  const time = `${hour}:${get('minute')} ${ampm}`;

  return {
    date,
    time,
    hour: hour24,
    fullDateTime: `${date}  ${time}`,
  };
}

/**
 * Check if current Cairo time is within a given hour range.
 * Used for alert windows.
 */
export function isWithinCairoHours(startHour: number, endHour: number): boolean {
  const { hour } = getCairoNow();
  return hour >= startHour && hour < endHour;
}

/**
 * Get date ranges for reporting, all in Cairo timezone.
 */
export function getCairoDateRanges(): {
  today: string;
  yesterday: string;
  startOfMonth: string;
} {
  const now = new Date();

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-CA', {  // en-CA gives YYYY-MM-DD format
      timeZone: 'Africa/Cairo',
    }).format(date);
  };

  const today = formatDate(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  // Start of month in Cairo time
  const cairoYear = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', year: 'numeric' }).format(now));
  const cairoMonth = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', month: 'numeric' }).format(now));
  const startOfMonth = `${cairoYear}-${String(cairoMonth).padStart(2, '0')}-01`;

  return { today, yesterday: yesterdayStr, startOfMonth };
}
```

### 11.3 Database Timezone Convention

**All timestamps in PostgreSQL should be stored as `TIMESTAMPTZ` (timestamp with time zone).** PostgreSQL stores these internally as UTC. Display conversion to Cairo happens in the application layer.

```sql
-- CORRECT: Use TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

-- WRONG: Don't use TIMESTAMP without timezone
-- created_at TIMESTAMP NOT NULL DEFAULT now()  -- ambiguous!
```

---

## 12. Recommended Stack Summary

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| **Framework** | Next.js (App Router) | 14.x+ | SSR + Client Components, excellent Supabase integration |
| **Language** | TypeScript | 5.x | Type safety, generated DB types |
| **Styling** | Tailwind CSS | 3.x | Utility-first, pairs with shadcn/ui |
| **Components** | shadcn/ui | Latest | Copy-paste, customizable, no runtime dep |
| **Charts** | Recharts | 2.x | React-native, composable, good for dashboards |
| **Database** | Supabase (PostgreSQL) | Existing instance | Already in use, add RLS + proper schema |
| **Auth** | Supabase Auth | Built-in | Email/password, RLS integration |
| **Realtime** | Supabase Realtime | Built-in | Postgres Changes for live dashboard |
| **Edge Functions** | Supabase Edge Functions | Deno | Alert evaluation, token management |
| **Data Pipeline** | n8n | Existing instance | Consolidate from 8 to 3 workflows |
| **Email** | Resend (or direct SMTP) | - | REST API for Edge Functions, SMTP fallback |
| **Telegram** | Telegram Bot API | - | Simple REST, no approval needed |
| **WhatsApp** | WhatsApp Cloud API | v23.0 | Phase 2, requires template approval |
| **Hosting** | Vercel | - | Next.js native, edge functions, cron |
| **Secret Storage** | Supabase Vault | Built-in | Encrypted token storage |

### Installation

```bash
# Create Next.js project
npx create-next-app@latest targetspro --typescript --tailwind --eslint --app --src-dir=false

# Core dependencies
npm install @supabase/supabase-js @supabase/ssr recharts date-fns

# Dev dependencies
npm install -D supabase @types/node

# shadcn/ui setup
npx shadcn@latest init
npx shadcn@latest add button card input table badge dialog
npx shadcn@latest add alert dropdown-menu separator tabs
```

---

## 13. Critical Pitfalls

### Pitfall 1: Supabase Realtime Without RLS

**What goes wrong:** Enabling Realtime on a table without RLS means ALL connected clients receive ALL changes, regardless of org membership.
**Prevention:** Always enable RLS before enabling Realtime on any table. Realtime respects RLS policies.
**Detection:** Test by connecting as different users and verifying they only see their own org's data.

### Pitfall 2: Facebook Token Expiry During Migration

**What goes wrong:** Migrating from n8n-stored credentials to Supabase Vault may cause a gap where tokens are not accessible.
**Prevention:** Run both systems in parallel. New system reads from Vault; old system keeps running until new system is validated.
**Detection:** Monitor `sync_log` for failed pulls.

### Pitfall 3: n8n and Next.js Writing to Same Tables Simultaneously

**What goes wrong:** Race conditions where n8n updates a row while a user is editing alert thresholds, or n8n reads stale data.
**Prevention:** n8n writes to data tables (`ad_accounts`, `spend_snapshots`, `sync_log`). Users write to config tables (`alert_rules`, `user_profiles`). Clear ownership boundaries.
**Detection:** Use `updated_at` timestamps and optimistic locking for any shared tables.

### Pitfall 4: Supabase Realtime Connection Limits

**What goes wrong:** Free/Pro Supabase plans have limits on concurrent Realtime connections (200-500). If the app scales, connections may be exhausted.
**Prevention:** Use a single Realtime channel per client, not per-table subscriptions. Multiplex changes through one channel.
**Detection:** Monitor Supabase dashboard for connection counts.

### Pitfall 5: WhatsApp Template Rejection

**What goes wrong:** Meta rejects message templates, blocking the WhatsApp alert channel.
**Prevention:** Follow Meta's template guidelines strictly. Avoid promotional language. Use UTILITY category. Have fallback channels (Telegram + Email) always active.
**Detection:** Check template status in WhatsApp Business Manager.

### Pitfall 6: Facebook balance/amount_spent Micro-Units

**What goes wrong:** Facebook returns financial values in micro-units (divide by 100 for most currencies). The existing workflows already handle this, but incorrect division factors cause wildly wrong balance displays.
**Prevention:** The existing code divides by 100 for EGP. Verify this factor by comparing API response with the Facebook Ads Manager UI for the same account.
**Detection:** Dashboard balance should match what users see in Facebook Ads Manager.

### Pitfall 7: Dual-Write Period Data Inconsistency

**What goes wrong:** During migration, both old (separate tables + Sheets) and new (unified table) systems write data, but the new schema normalizes differently.
**Prevention:** Build a data migration script that maps old table data to new schema. Run validation queries comparing old vs new.
**Detection:** Automated comparison script that runs daily during migration period.

### Pitfall 8: Cairo Timezone Hardcoding as UTC+3

**What goes wrong:** Egypt is UTC+2 (no DST since 2014). Hardcoding `+3` (as seen in the existing code) makes all timestamps 1 hour ahead.
**Prevention:** Always use `Intl.DateTimeFormat` with `timeZone: 'Africa/Cairo'`. Never manually add offsets.
**Detection:** Compare displayed time with actual Cairo time.

---

## 14. Open Questions

These items need resolution during implementation but could not be fully researched here:

1. **Supabase Vault availability:** Verify that Supabase Vault is available on the current plan and how to access secrets from Edge Functions. If Vault is not available, use Supabase Edge Function environment variables (`Deno.env.get()`).

2. **Supabase Edge Function scheduling:** Can Edge Functions be triggered on a cron schedule natively, or do we need Vercel Cron or n8n for periodic alert evaluation? (The database trigger approach handles event-driven alerts but not periodic checks like "check all accounts every hour".)

3. **Existing Supabase table migration:** The 7 existing tables have live data. Need to determine: migrate data to new unified schema in-place, or create new tables and backfill? The existing table names contain spaces and special characters (e.g., "Facebook Data Pull -- Main accounts") which complicates queries.

4. **Facebook System User setup per BM:** Verify that each of the 4 Business Managers (Main, Pasant, aligomarketing, Xlerate) has or can create a System User. Some BMs may be restricted.

5. **TikTok token refresh mechanism:** Verify the exact expiry behavior of TikTok access tokens and whether auto-refresh is available through the API.

6. **n8n version and capabilities:** Check the current n8n version to confirm support for parameterized sub-workflows (workflow inputs) and credential selection via expressions.

7. **Vercel pricing for this workload:** Next.js on Vercel with Supabase Realtime connections and API routes for webhook handling -- estimate the tier needed.

8. **WhatsApp Business API eligibility:** Confirm that the existing Meta Business account meets WhatsApp Business API requirements and that template approval is feasible for Egypt-based businesses.

---

## Confidence Summary

| Area | Confidence | Reason |
|---|---|---|
| Existing system analysis | HIGH | Direct analysis of all 8 workflow JSON files |
| Schema design | HIGH | Standard PostgreSQL patterns, grounded in actual data |
| Next.js App Router patterns | MEDIUM | Training data patterns, verify against current docs |
| Supabase RLS | MEDIUM | Well-known pattern, verify current syntax |
| Supabase Realtime | MEDIUM | Verify current API and connection limits |
| Supabase Edge Functions | MEDIUM | Verify Deno runtime API and database webhook setup |
| Supabase Vault | LOW | Verify availability and access patterns |
| Facebook Graph API v23 | MEDIUM | Verify current rate limits and batch API |
| TikTok Business API v1.3 | MEDIUM | Endpoints verified from workflows, limits need verification |
| Telegram Bot API | HIGH | Simple, stable REST API |
| WhatsApp Cloud API | MEDIUM | Verify template requirements and pricing for Egypt |
| n8n consolidation | HIGH | Based on thorough analysis of existing workflows |
| Timezone handling | HIGH | Bug identified and fix documented |

---

*Research completed 2026-02-11. WebSearch and WebFetch were unavailable during this session. All API version details, rate limits, and library APIs should be verified against current official documentation before implementation begins.*
