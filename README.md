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
| **Phase 0** | Emergency Security Fixes — rotate tokens, secure credentials | Planned |
| **Phase 1** | Database Foundation — normalized schema, RLS, Auth, migration | Planned |
| **Phase 2** | Pipeline Consolidation — 8 workflows → 3, fix timezone, API v23.0 | Planned |
| **Phase 3** | Dashboard MVP — real-time Next.js dashboard with auth | Planned |
| **Phase 4** | Alert Engine — Email + Telegram, escalation tiers, 24/7 | Planned |
| **Phase 5** | WhatsApp + Polish — WhatsApp channel, digests, exports | Planned |

See [ROADMAP.md](ROADMAP.md) for full details.

## Project Structure

```
├── PROJECT.md              # Project vision and architecture decisions
├── ROADMAP.md              # Phased build plan
├── .planning/
│   ├── config.json         # GSD workflow configuration
│   ├── REQUIREMENTS.md     # Detailed requirements and success criteria
│   └── research/           # Domain research documents
│       ├── tech.md         # Tech stack research
│       ├── architecture.md # System architecture research
│       ├── quality.md      # Quality practices research
│       ├── concerns.md     # Risks and concerns analysis
│       └── SUMMARY.md      # Research synthesis
```

## License

Private — All rights reserved.

---

Built with [n8n](https://n8n.io), [Next.js](https://nextjs.org), and [Supabase](https://supabase.com)
