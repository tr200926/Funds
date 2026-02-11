# Targetspro Ad Spend Monitoring Platform

## Vision
A full-stack monitoring platform that provides real-time visibility into ad spend across Facebook and TikTok, with predictive alerting, multi-channel notifications, and a web dashboard — replacing the current fragmented n8n workflow system with a robust, secure, and scalable solution.

## Problem Statement
Targetspro (a digital marketing agency) currently uses 8 n8n workflow JSON files to pull ad account data from Facebook Graph API and TikTok Business API, store it in Supabase + Google Sheets, and send email alerts. The current system suffers from:
- **Security risks**: Hardcoded API tokens in workflow files
- **Duplication**: 4 nearly-identical Facebook sub-workflows
- **Limited alerting**: Email-only, restricted to 9AM-12PM Cairo time window
- **No dashboard**: No real-time visibility into account health
- **No predictive insights**: Only reactive alerts, no time-to-depletion predictions
- **Fragile architecture**: No proper error handling, monitoring, or recovery

## Solution
Build a full monitoring platform with:
1. **Next.js web dashboard** — Real-time visibility into all ad accounts, balances, spend, and funding status
2. **Improved n8n workflows** — Consolidated, secure, parameterized data pipelines
3. **Smart alerting engine** — Predictive time-to-depletion, multi-channel (Email + Telegram + WhatsApp), escalation tiers
4. **Supabase backend** — Leveraging existing tables with proper schema design, RLS, and auth
5. **Security hardening** — Environment-based credentials, proper token management, auth system

## Tech Stack
- **Frontend**: Next.js (React) with TypeScript
- **Backend/DB**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Data Pipelines**: n8n workflows (improved/consolidated)
- **Alerts**: Email (SMTP), Telegram Bot API, WhatsApp Business API
- **APIs**: Facebook Graph API v23.0, TikTok Business API v1.3
- **Hosting**: TBD (Vercel for Next.js, self-hosted n8n)

## Architecture Decisions
- **Single-tenant first, multi-tenant ready**: Build for Targetspro now, but use org-scoped data models and abstraction layers so multi-tenancy can be added later
- **Supabase as single source of truth**: Migrate away from Google Sheets dependency; Supabase handles auth, data, realtime subscriptions, and edge functions
- **n8n stays as data pipeline**: n8n handles scheduled data pulls; business logic and alerting move to Supabase Edge Functions + Next.js
- **Timezone**: Africa/Cairo (UTC+3) as default, configurable per user

## Existing Infrastructure
- **Supabase instance**: Already has 7+ tables with historical ad data
- **n8n instance**: Running 8 workflows (2 controllers + 6 sub-workflows)
- **Google Sheets**: "Abdo n8n Tracking Spending Targetspro" spreadsheet
- **Email**: info@targetspro.com SMTP configured
- **Facebook**: 1 API connection (single token) — serves all 4 business managers (Main, Pasant, Aligomarketing, Xlerate)
- **TikTok**: 2 API connections (2 separate access tokens) — each covering a different set of advertiser accounts

## Users
- **Agency managers** (primary): Monitor all client ad accounts, receive alerts, manage budgets
- **Account managers**: View their assigned accounts, customize alert thresholds
- **Future**: Client portal access (read-only dashboards for clients)

## Constraints
- Must not disrupt existing data collection during migration
- Must maintain backward compatibility with existing Supabase tables
- Alert downtime during migration must be minimized
- Cairo timezone (Africa/Cairo) is the primary operating timezone
