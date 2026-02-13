# Targetspro Ad Spend Monitoring Platform

A full-stack monitoring platform that provides real-time visibility into ad spend across Facebook and TikTok, with predictive alerting, multi-channel notifications, and a web dashboard.

Built for [Targetspro](https://targetspro.com) — a digital marketing agency managing ad budgets across multiple platforms and business managers.

## The Problem

Managing ad spend across dozens of Facebook and TikTok accounts is manual and error-prone. Depleted balances, paused accounts, and spend spikes can go unnoticed for hours — wasting budget and impacting campaign performance.

## The Solution

An automated platform that:

- **Monitors** all ad accounts across Facebook & TikTok in one unified dashboard
- **Predicts** when accounts will run out of funds (time-to-depletion)
- **Alerts** the right people through Email, Telegram, and WhatsApp before problems happen
- **Tracks** historical spend trends for better budget planning

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js (App Router), TypeScript, shadcn/ui, Tailwind CSS, Recharts |
| **Backend / DB** | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| **Data Pipelines** | n8n (workflow automation) |
| **APIs** | Facebook Graph API v23.0, TikTok Business API v1.3 |
| **Alerts** | Email (SMTP), Telegram Bot API, WhatsApp Cloud API |

## Features

### Dashboard
- Unified view of all ad accounts (Facebook + TikTok)
- Real-time balance, daily spend, and monthly spend per account
- Historical spend trend charts
- Pipeline health monitoring
- Role-based access (Admin, Manager, Viewer)

### Smart Alerting
- Configurable balance threshold alerts
- Time-to-depletion predictions (7-day rolling average)
- Spend spike detection
- Zero-spend detection (paused/stopped accounts)
- Account status change alerts
- Escalation tiers: Info → Warning → Critical → Emergency
- Multi-channel delivery with cooldown/deduplication
- 24/7 alerting (no time-window restrictions)

### Data Pipelines
- Consolidated n8n workflows (4 pipelines: 1 Facebook API + 2 TikTok APIs + controller)
- Scheduled pulls from Facebook Graph API and TikTok Business API
- Error handling with pipeline health logging
- Supabase as single source of truth

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Facebook    │     │                 │     │   Next.js    │
│  Graph API   │────▶│    n8n          │────▶│   Dashboard  │
│  (1 API)     │     │  (Pipelines)    │     │              │
├─────────────┤     │                 │     │  - Overview  │
│  TikTok      │────▶│  Scheduled      │     │  - Details   │
│  Business    │     │  Data Pulls     │     │  - Alerts    │
│  API (x2)    │     └────────┬────────┘     │  - Health    │
└─────────────┘              │              └──────┬───────┘
                             ▼                     │
                    ┌─────────────────┐            │
                    │    Supabase     │◀───────────┘
                    │                 │   Realtime
                    │  - PostgreSQL   │   Subscriptions
                    │  - Auth + RLS   │
                    │  - Edge Funcs   │
                    │  - Realtime     │
                    └────────┬────────┘
                             │
                     DB Triggers on
                     new data INSERT
                             │
                             ▼
                    ┌─────────────────┐
                    │  Alert Engine   │
                    │  (Edge Funcs)   │
                    │                 │
                    │  Rule Eval →    │
                    │  Dedup →        │
                    │  Dispatch       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  Email   │  │ Telegram │  │ WhatsApp │
        │  (SMTP)  │  │  Bot API │  │ Cloud API│
        └──────────┘  └──────────┘  └──────────┘
```

## Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 0** | Emergency Security Fixes — rotate tokens, secure credentials | Complete |
| **Phase 1** | Database Foundation — normalized schema, RLS, Auth, migration | Complete |
| **Phase 2** | Pipeline Consolidation — 8 workflows to 4, fix timezone, API v23.0 | Complete |
| **Phase 3** | Dashboard MVP — real-time Next.js dashboard with auth | Complete |
| **Phase 4** | Alert Engine — Email + Telegram, escalation tiers, 24/7 | Complete |
| **Phase 5** | WhatsApp Integration — WhatsApp Cloud API channel + opt-in | Complete |

See [.planning/ROADMAP.md](.planning/ROADMAP.md) for full details.

## Project Structure

```
├── README.md                   # This file
├── .planning/                  # Planning and tracking
│   ├── ROADMAP.md              # Phased build plan
│   ├── REQUIREMENTS.md         # Requirements and success criteria
│   ├── STATE.md                # Current delivery state
│   ├── config.json             # GSD workflow configuration
│   ├── v1.0-MILESTONE-AUDIT.md # Milestone audit report
│   ├── phases/                 # Phase plans, summaries, and verification
│   └── research/               # Domain research documents
├── supabase/
│   ├── migrations/             # 6 SQL migrations (schema, RLS, triggers, seed, realtime, alerts)
│   └── functions/              # 3 Edge Functions + 5 shared modules
│       ├── evaluate-alerts/    # Rule evaluation on data INSERT
│       ├── dispatch-notifications/  # Email, Telegram, WhatsApp delivery
│       ├── escalate-alerts/    # Severity promotion for stale alerts
│       └── _shared/            # Types, constants, evaluators, formatters, client
├── dashboard/                  # Next.js 15 web dashboard
│   └── src/
│       ├── app/                # App Router pages (overview, accounts, alerts, pipeline, settings)
│       ├── components/         # UI components (accounts, alerts, charts, notifications, layout)
│       ├── hooks/              # useRealtime, useUser
│       └── lib/                # Supabase clients, validators, formatters, types
├── n8n-workflows/              # 5 exportable workflow JSONs
│   ├── controller.json         # Cron scheduler + orchestrator
│   ├── facebook-ingestion.json # Facebook Graph API batch ingestion
│   ├── tiktok-ingestion-1.json # TikTok API (token group 1)
│   ├── tiktok-ingestion-2.json # TikTok API (token group 2)
│   └── error-handler.json      # Stuck pipeline recovery
├── scripts/
│   └── migrate_legacy_data.ts  # Legacy table migration (dry-run capable)
├── lib/
│   ├── database.types.ts       # Generated Supabase TypeScript types
│   └── supabase.ts             # Typed Supabase client
└── database/
    └── schema.sql              # Legacy Supabase triggers (pre-migration)
```

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (PostgreSQL, Auth, Edge Functions)
- n8n instance for data pipelines
- API credentials: Facebook Graph API, TikTok Business API

### Dashboard Setup

```bash
cd dashboard
npm install
cp .env.local.example .env.local  # Add Supabase URL + anon key
npm run dev
```

### Database Setup

```bash
# Apply all migrations to your Supabase project
npx supabase db push

# (Optional) Migrate legacy data
npx tsx scripts/migrate_legacy_data.ts --dry-run
```

### n8n Workflows

Import the 5 JSON files from `n8n-workflows/` into your n8n instance. See [n8n-workflows/README.md](n8n-workflows/README.md) for credential setup and import order.

## License

Private — All rights reserved.

---

Built with [n8n](https://n8n.io), [Next.js](https://nextjs.org), and [Supabase](https://supabase.com)
