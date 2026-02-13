# Phase 03: User Setup Required

**Generated:** 2026-02-12
**Phase:** 03-dashboard-mvp-nextjs
**Status:** Incomplete

Complete these items for the dashboard to load data from Supabase. Claude automated the application scaffolding; you must supply the Supabase project credentials below.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | `dashboard/.env.local` |
| [ ] | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → Project API keys → anon/public | `dashboard/.env.local` |

## Verification

After entering both values in `dashboard/.env.local`, verify with:

```bash
cd dashboard
npm run dev -- --hostname 127.0.0.1 --port 3000
# Visit http://127.0.0.1:3000/login and confirm the login form loads without Supabase errors
```

Expected results:
- Dev server starts without missing env var errors
- Visiting `/login` shows the login page instead of a Supabase configuration warning

---

**Once all items complete:** Mark status as "Complete" at top of file.
