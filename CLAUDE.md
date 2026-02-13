# CLAUDE.md

Project-level instructions for Claude Code.

## Project Overview

Targetspro Ad Spend Monitoring Platform -- monitors Facebook and TikTok ad accounts with real-time dashboards, smart alerting (Email/Telegram/WhatsApp), and automated data pipelines.

**Status:** Milestone 1 (MVP Platform) complete. All 6 phases delivered.

## Architecture

- **Database:** Supabase PostgreSQL with 11 normalized tables, RLS policies, pg_net triggers
- **Dashboard:** Next.js 15 (App Router) in `dashboard/` with Supabase SSR auth, shadcn/ui, Tailwind CSS v4, Recharts
- **Alert Engine:** 3 Supabase Edge Functions (Deno) -- evaluate-alerts, dispatch-notifications, escalate-alerts
- **Pipelines:** 5 n8n workflow JSONs in `n8n-workflows/` (controller + 3 ingestion + error handler)
- **Shared code:** Edge Function modules in `supabase/functions/_shared/`

## Key Conventions

### Code Style
- TypeScript strict mode throughout
- NUMERIC database columns are strings in TypeScript -- always use `Number()` before arithmetic
- Use `npx supabase` (not global install) for all Supabase CLI operations
- Dashboard is isolated in `dashboard/` -- don't mix with root dependencies

### Supabase Patterns
- SSR auth uses `getUser()` middleware refresh pattern (not deprecated helpers)
- RLS policies use `public.user_org_id()` and `public.user_role()` helper functions
- Edge Functions import from `../_shared/*.ts` with explicit `.ts` extensions
- External Deno imports use `https://esm.sh/` prefix
- JSONB fields cast via `as unknown as Json` for Supabase insert/update compatibility

### Dashboard Patterns
- All Recharts usage goes through shared `ChartWrapper` component (explicit heights)
- Realtime subscriptions use the `useRealtime` hook from `src/hooks/use-realtime.ts`
- Toast notifications use sonner (not shadcn toast)
- Channel forms use controlled React state (not react-hook-form)
- Alert rule forms use untyped `useForm()` with Zod v4 resolver
- Config validation is per-rule-type on submit (not discriminated union)

### Alert Engine
- Triggers fire on INSERT only (not UPDATE) on spend_records to avoid double evaluation
- Status change has a separate trigger with `WHEN (OLD.status IS DISTINCT FROM NEW.status)` guard
- evaluate-alerts fires dispatch-notifications via fetch (fire-and-forget, not awaited)
- escalate-alerts awaits dispatch (batch context, not hot path)
- Emergency alerts bypass quiet hours
- WhatsApp dispatch requires per-user opt-in check against `profiles.settings.whatsapp_opt_in`

### Timezone
- All timestamps stored in UTC (`TIMESTAMPTZ`)
- Display in Africa/Cairo timezone using `Intl.DateTimeFormat` or Luxon `.setZone('Africa/Cairo')`

## Key File Paths

- SQL migrations: `supabase/migrations/`
- Edge Functions: `supabase/functions/{evaluate-alerts,dispatch-notifications,escalate-alerts}/index.ts`
- Shared modules: `supabase/functions/_shared/{types,constants,supabase-client,alert-evaluators,notification-formatters}.ts`
- Dashboard app: `dashboard/src/app/(dashboard)/`
- Dashboard components: `dashboard/src/components/{accounts,alerts,charts,notifications,layout}/`
- Validators: `dashboard/src/lib/validators/{alert-rules,notification-channels}.ts`
- Supabase clients: `dashboard/src/lib/supabase/{client,server,middleware}.ts`
- Generated types: `lib/database.types.ts` (master), `dashboard/src/lib/database.types.ts` (copy)
- n8n workflows: `n8n-workflows/*.json`
- Planning docs: `.planning/`

## Commands

```bash
# Dashboard
cd dashboard && npm run dev          # Start dev server
cd dashboard && npx tsc --noEmit     # Type check

# Supabase
npx supabase db push                 # Apply migrations
npx supabase functions deploy <name> # Deploy Edge Function
npx supabase secrets set KEY=value   # Set Edge Function secrets

# Legacy migration
npx tsx scripts/migrate_legacy_data.ts --dry-run
```

## Decisions Log

28 architectural decisions documented in `.planning/STATE.md`. Key ones:
1. `npx supabase` (global install blocked)
2. NUMERIC as strings (financial precision)
3. Dashboard isolated in `dashboard/`
4. Sonner for toasts, controlled state for channel forms
5. Per-rule-type config validation (not discriminated union)
