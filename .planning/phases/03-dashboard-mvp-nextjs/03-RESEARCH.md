# Phase 3: Dashboard MVP (Next.js) - Research

**Researched:** 2026-02-12
**Domain:** Next.js App Router + Supabase Auth/Realtime + shadcn/ui + Recharts dashboard
**Confidence:** HIGH

## Summary

This phase builds a real-time monitoring dashboard using Next.js App Router with Supabase Auth (SSR), Supabase Realtime for live data updates, shadcn/ui for the component library, and Recharts v3 for spend/balance visualizations. The existing Phase 1 schema provides a solid foundation: all tables have RLS policies scoped by org_id, database triggers already sync role and org_id into JWT app_metadata claims, and denormalized current_balance/current_daily_spend/current_mtd_spend fields on ad_accounts make the overview page straightforward to build.

The key architectural challenge is correctly setting up Supabase Auth SSR with the `@supabase/ssr` package (not the deprecated auth-helpers), which requires three separate client factories (browser, server, middleware) and a middleware layer to refresh tokens on every request. The existing `lib/supabase.ts` creates a plain `createClient` -- this must be replaced with the SSR pattern for the Next.js app. For real-time updates, Supabase Realtime via postgres_changes subscriptions on the `ad_accounts` table will provide <5s latency from data write to UI update without polling.

The project currently has `@supabase/supabase-js ^2.95.3` and TypeScript `^5.9.3` installed. The Next.js app should be created using `create-next-app` inside an `app/` or `dashboard/` subdirectory (monorepo-style), as the root package.json already serves the pipeline scripts. Financial values (current_balance, current_daily_spend, etc.) come through as strings from the TypeScript types to preserve NUMERIC precision -- these must be parsed to numbers at the UI boundary for display and charting.

**Primary recommendation:** Use Next.js 15 (stable, well-documented) with `@supabase/ssr` for auth, shadcn/ui + TanStack Table for data tables, Recharts v3 for charts, and Supabase Realtime channel subscriptions on the `ad_accounts` table for live updates.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^15.x (latest 15.5+) | React framework with App Router, SSR, file-based routing | Stable, production-ready, well-documented Supabase integration |
| react / react-dom | ^19.x | UI library | Ships with Next.js 15; required for App Router |
| typescript | ^5.9+ | Type safety | Already in project; strict mode required by R4.1 |
| @supabase/supabase-js | ^2.95+ | Supabase client | Already installed; provides typed DB queries |
| @supabase/ssr | ^0.8.0 | SSR auth cookie handling | Official replacement for deprecated auth-helpers |
| recharts | ^3.7.0 | Declarative charts (Line, Area, Bar) | R4.10 specifies Recharts; v3 is current stable |
| tailwindcss | ^4.x | Utility-first CSS | R4.9 requires Tailwind; v4 ships with latest shadcn |
| @tanstack/react-table | ^8.x | Headless data table | Powers shadcn/ui DataTable; sorting, filtering, pagination |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tw-animate-css | latest | CSS animations for shadcn/ui | Auto-installed by shadcn init (replaces tailwindcss-animate) |
| lucide-react | latest | Icon library | Used by shadcn/ui components |
| clsx / class-variance-authority | latest | Conditional class utilities | Auto-installed by shadcn init |
| date-fns | ^3.x or ^4.x | Date formatting/manipulation | For chart axis labels, relative time display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Next.js 15 | Next.js 16 (v16.1.6 available) | 16 is newer but less battle-tested with Supabase SSR docs; all Supabase official guides target 14/15 |
| Recharts v3 | Nivo, Tremor, Victory | Project spec explicitly requires Recharts (R4.10) |
| shadcn/ui | Radix UI direct, Mantine | Project spec explicitly requires shadcn/ui (R4.9) |
| TanStack Table | AG Grid, React Table v7 | shadcn DataTable is built on TanStack Table; no reason to diverge |

**Installation:**
```bash
# Create Next.js app (inside project root as a subdirectory)
npx create-next-app@latest dashboard --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# In the dashboard directory:
cd dashboard

# Install Supabase SSR + existing client
npm install @supabase/supabase-js @supabase/ssr

# Install Recharts v3
npm install recharts

# Install date utilities
npm install date-fns

# Initialize shadcn/ui
npx shadcn@latest init

# Add required shadcn components
npx shadcn@latest add table card badge button input select dropdown-menu dialog tabs separator skeleton avatar sheet
```

## Architecture Patterns

### Recommended Project Structure
```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with auth provider
│   │   ├── page.tsx                # Redirect to /dashboard or /login
│   │   ├── loading.tsx             # Root loading skeleton
│   │   ├── error.tsx               # Root error boundary
│   │   ├── not-found.tsx           # Custom 404
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx        # Login page (R4.6)
│   │   │   └── layout.tsx          # Auth layout (no sidebar)
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          # Dashboard layout with sidebar/nav
│   │   │   ├── loading.tsx         # Dashboard loading skeleton
│   │   │   ├── overview/
│   │   │   │   ├── page.tsx        # Unified account overview (R4.2)
│   │   │   │   └── loading.tsx     # Overview skeleton
│   │   │   ├── accounts/
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx    # Account detail page (R4.3)
│   │   │   │       └── loading.tsx
│   │   │   └── pipeline/
│   │   │       └── page.tsx        # Pipeline health page (R4.7)
│   │   └── auth/
│   │       └── callback/
│   │           └── route.ts        # Supabase auth callback handler
│   ├── components/
│   │   ├── ui/                     # shadcn/ui auto-generated components
│   │   ├── accounts/
│   │   │   ├── accounts-table.tsx  # DataTable for overview (R4.2)
│   │   │   ├── columns.tsx         # TanStack column definitions
│   │   │   ├── account-filters.tsx # Platform/status/BM filters (R4.4)
│   │   │   └── account-card.tsx    # Mobile card view
│   │   ├── charts/
│   │   │   ├── spend-chart.tsx     # Daily spend trend (R4.3)
│   │   │   ├── balance-chart.tsx   # Balance history (R4.3)
│   │   │   └── chart-wrapper.tsx   # ResponsiveContainer wrapper
│   │   ├── pipeline/
│   │   │   └── pipeline-table.tsx  # Pipeline runs table (R4.7)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx         # Navigation sidebar
│   │   │   ├── header.tsx          # Top bar with user menu
│   │   │   └── mobile-nav.tsx      # Mobile responsive nav (R4.8)
│   │   └── auth/
│   │       ├── login-form.tsx      # Login form component
│   │       └── auth-guard.tsx      # Client-side auth protection
│   ├── hooks/
│   │   ├── use-realtime.ts         # Supabase Realtime subscription hook
│   │   ├── use-accounts.ts         # Account data fetching + realtime
│   │   └── use-user.ts             # Current user + role hook
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser client (createBrowserClient)
│   │   │   ├── server.ts           # Server client (createServerClient)
│   │   │   └── middleware.ts        # Middleware client factory
│   │   ├── database.types.ts       # Symlink or copy from root lib/
│   │   ├── utils.ts                # cn() helper + shared utilities
│   │   └── format.ts               # Number/currency/date formatters
│   └── middleware.ts               # Next.js middleware for auth
├── public/                         # Static assets
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

### Pattern 1: Supabase SSR Auth - Three Client Factories

**What:** Create separate Supabase client factories for browser, server, and middleware contexts.
**When to use:** Every Supabase interaction in Next.js App Router.

**Browser Client (`lib/supabase/client.ts`):**
```typescript
// Source: https://supabase.com/docs/guides/auth/server-side/creating-a-client
'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Server Client (`lib/supabase/server.ts`):**
```typescript
// Source: https://supabase.com/docs/guides/auth/server-side/creating-a-client
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}
```

**Middleware (`middleware.ts`):**
```typescript
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/database.types'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session - IMPORTANT: use getClaims() not getSession()
  const { data: { claims }, error } = await supabase.auth.getClaims()

  // Redirect unauthenticated users to login
  if (
    !claims &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Pattern 2: Supabase Realtime Subscription Hook

**What:** Custom React hook for subscribing to postgres_changes on tables with automatic cleanup.
**When to use:** Any client component that needs live data updates (R4.5).

```typescript
// Source: https://supabase.com/docs/guides/realtime/postgres-changes
'use client'

import { useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface UseRealtimeOptions<T> {
  table: string
  schema?: string
  event?: PostgresChangeEvent
  filter?: string
  onInsert?: (payload: T) => void
  onUpdate?: (payload: { old: T; new: T }) => void
  onDelete?: (payload: T) => void
  onChange?: (payload: any) => void
}

export function useRealtime<T>({
  table,
  schema = 'public',
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onChange,
}: UseRealtimeOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const channelConfig: Record<string, string> = {
      event,
      schema,
      table,
    }
    if (filter) {
      channelConfig.filter = filter
    }

    const channel = supabase
      .channel(`${table}-changes`)
      .on('postgres_changes', channelConfig as any, (payload) => {
        onChange?.(payload)
        if (payload.eventType === 'INSERT') onInsert?.(payload.new as T)
        if (payload.eventType === 'UPDATE')
          onUpdate?.({ old: payload.old as T, new: payload.new as T })
        if (payload.eventType === 'DELETE') onDelete?.(payload.old as T)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, schema, event, filter])

  return channelRef
}
```

### Pattern 3: Server Component Data Fetching with Auth

**What:** Fetch data in Server Components with authenticated Supabase client.
**When to use:** Initial page loads for overview, detail, pipeline pages.

```typescript
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
// app/(dashboard)/overview/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountsTable } from '@/components/accounts/accounts-table'

export default async function OverviewPage() {
  const supabase = await createClient()

  // Validate auth - getClaims() verifies JWT signature
  const { data: { claims }, error } = await supabase.auth.getClaims()
  if (error || !claims) {
    redirect('/login')
  }

  // RLS automatically scopes to user's org
  const { data: accounts, error: fetchError } = await supabase
    .from('ad_accounts')
    .select(`
      *,
      platforms (display_name, icon_url)
    `)
    .neq('status', 'archived')
    .order('account_name')

  if (fetchError) throw fetchError

  return <AccountsTable initialData={accounts ?? []} />
}
```

### Pattern 4: Role-Based UI Protection

**What:** Use JWT claims from middleware + profiles table to control UI visibility by role.
**When to use:** Hiding admin-only features from viewers (R4.6).

```typescript
// hooks/use-user.ts
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type UserRole = 'admin' | 'manager' | 'viewer'

interface UserProfile {
  user: User | null
  role: UserRole
  orgId: string | null
  isLoading: boolean
}

export function useUser(): UserProfile {
  const [profile, setProfile] = useState<UserProfile>({
    user: null,
    role: 'viewer',
    orgId: null,
    isLoading: true,
  })

  useEffect(() => {
    const supabase = createClient()

    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Role and org_id are synced into app_metadata by
        // the update_user_role_claim() trigger in Phase 1
        const role = (user.app_metadata?.role as UserRole) ?? 'viewer'
        const orgId = user.app_metadata?.org_id as string | null
        setProfile({ user, role, orgId, isLoading: false })
      } else {
        setProfile({ user: null, role: 'viewer', orgId: null, isLoading: false })
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          const role = (session.user.app_metadata?.role as UserRole) ?? 'viewer'
          const orgId = session.user.app_metadata?.org_id as string | null
          setProfile({ user: session.user, role, orgId, isLoading: false })
        } else {
          setProfile({ user: null, role: 'viewer', orgId: null, isLoading: false })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return profile
}
```

### Pattern 5: Financial Value Formatting

**What:** Convert NUMERIC string values to displayed currency with Cairo timezone dates.
**When to use:** Every display of balance, spend, or date values.

```typescript
// lib/format.ts

/** Parse NUMERIC string from Supabase to number. Returns 0 for null/undefined. */
export function parseNumeric(value: string | null | undefined): number {
  if (value == null || value === '') return 0
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Format currency value for display */
export function formatCurrency(
  value: string | null | undefined,
  currency: string = 'EGP'
): string {
  const num = parseNumeric(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/** Format date in Cairo timezone */
export function formatCairoDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    ...options,
  }).format(d)
}

/** Format relative time (e.g., "5 minutes ago") */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

/** Calculate time-to-depletion in days */
export function calcTimeToDepletion(
  balance: string | null | undefined,
  dailySpend: string | null | undefined
): number | null {
  const bal = parseNumeric(balance)
  const spend = parseNumeric(dailySpend)
  if (spend <= 0 || bal <= 0) return null
  return Math.round(bal / spend)
}
```

### Anti-Patterns to Avoid

- **Using `getSession()` in server code for auth checks:** Always use `getClaims()` which validates JWT signatures. `getSession()` does NOT revalidate tokens and is insecure on the server.
- **Creating a single shared Supabase client instance:** Each request needs its own client due to cookie isolation. Use factory functions, never a module-level singleton for server contexts.
- **Storing numeric values as JavaScript numbers throughout the chain:** Parse NUMERIC strings to numbers only at the UI display boundary. Intermediate data passing should preserve the string type.
- **Subscribing to Realtime without cleanup:** Always return `supabase.removeChannel(channel)` in useEffect cleanup to prevent memory leaks and duplicate subscriptions.
- **Using `"use client"` on pages when not needed:** Keep page.tsx as Server Components that fetch data, pass to Client Components for interactivity. This enables SSR and faster initial loads.
- **Polling for data updates instead of using Realtime:** Supabase Realtime provides push-based updates. Polling wastes bandwidth and adds latency.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data tables with sort/filter/paginate | Custom table with manual state | shadcn DataTable + TanStack Table | Handles keyboard nav, ARIA, edge cases |
| Auth session management | Custom JWT parsing + cookie handling | @supabase/ssr middleware pattern | Token refresh, cookie synchronization across server/client contexts is complex |
| Charts with tooltips + responsive sizing | Custom SVG/Canvas chart code | Recharts ResponsiveContainer + LineChart/AreaChart | SVG rendering, axis calculation, tooltip positioning |
| Loading skeletons | Custom loading divs | shadcn Skeleton component + Next.js loading.tsx | Consistent with design system, zero effort |
| Date/timezone formatting | Custom timezone math | Intl.DateTimeFormat with timeZone: 'Africa/Cairo' | Browser-native, handles DST correctly |
| Form validation on login | Custom validators | shadcn/ui form components (built on react-hook-form + zod) | Handles field state, error display, accessibility |
| Dropdown filters | Custom select with search | shadcn Select / DropdownMenu / Combobox | Accessible, keyboard navigable, styled consistently |

**Key insight:** The dashboard's value is in data presentation and real-time updates, not in custom UI primitives. Every hour spent building a custom table or chart is an hour not spent on the actual monitoring features.

## Common Pitfalls

### Pitfall 1: Supabase Auth Cookie Not Refreshing
**What goes wrong:** Users get logged out randomly, or server components return empty data because the auth token expired.
**Why it happens:** The middleware is not correctly calling `getClaims()` (or `getUser()`) on every request, which is what triggers token refresh.
**How to avoid:** Ensure middleware.ts calls `supabase.auth.getClaims()` on every matched request. Use the matcher config to exclude static assets only.
**Warning signs:** Intermittent 401 errors, data showing up on page refresh but not on navigation.

### Pitfall 2: Realtime Not Receiving Events
**What goes wrong:** Real-time subscriptions are set up but no events arrive when data changes.
**Why it happens:** The table has not been added to the `supabase_realtime` publication in PostgreSQL.
**How to avoid:** Run `ALTER PUBLICATION supabase_realtime ADD TABLE ad_accounts, alerts, pipeline_runs;` in a migration. Also ensure RLS SELECT policies exist for the authenticated role (they already do in Phase 1).
**Warning signs:** Subscription succeeds (no error) but callback never fires.

### Pitfall 3: NUMERIC Precision Loss in Charts
**What goes wrong:** Chart values are slightly off or show `NaN` for spend/balance data.
**Why it happens:** TypeScript types define NUMERIC columns as `string` (correct per prior decision). If you forget to parse them before passing to Recharts, the chart renders nothing or wrong values.
**How to avoid:** Create a `parseNumeric()` utility and use it consistently in the data transformation layer between Supabase query results and chart data. Never pass raw database rows directly to Recharts.
**Warning signs:** Charts with flat lines at 0, NaN in tooltips, or TypeScript errors about string vs number.

### Pitfall 4: Hydration Mismatch with Timezone Formatting
**What goes wrong:** React hydration errors where server HTML doesn't match client render.
**Why it happens:** Server and client may be in different timezones. If you format dates without specifying a timezone, the server (UTC) and client (user's local) produce different strings.
**How to avoid:** ALWAYS use `Intl.DateTimeFormat` with explicit `timeZone: 'Africa/Cairo'` parameter. This produces identical output on server and client.
**Warning signs:** React hydration warnings in console, dates flickering on page load.

### Pitfall 5: Recharts Not Responsive / Fixed Size
**What goes wrong:** Charts render with 0 height or overflow their container.
**Why it happens:** Recharts charts need explicit dimensions. Without `ResponsiveContainer`, they default to 0x0 or a fixed pixel size.
**How to avoid:** Always wrap charts in `<ResponsiveContainer width="100%" height={300}>`. The parent container must have a defined height (not `height: auto`).
**Warning signs:** Charts not visible, container collapsing, charts not resizing on window resize.

### Pitfall 6: Server Component Fetching Blocks Page Load
**What goes wrong:** Dashboard takes >3s to load because multiple queries run sequentially in the server component.
**Why it happens:** Awaiting each Supabase query one after another in the page component.
**How to avoid:** Use `Promise.all()` to parallelize independent queries. Use Suspense boundaries with loading.tsx to stream content progressively. Use React's `Suspense` for granular loading states per section.
**Warning signs:** High TTFB on dashboard pages, waterfall in network tab.

### Pitfall 7: Creating Too Many Realtime Channels
**What goes wrong:** Performance degrades, WebSocket connection becomes unreliable.
**Why it happens:** Each component creates its own channel subscription for the same table.
**How to avoid:** Create one shared channel per table in a parent component or context, then distribute events to child components. Or use a single `useRealtime` hook at the page level.
**Warning signs:** Multiple WebSocket frames for the same event, increasing memory usage.

## Code Examples

Verified patterns from official sources:

### Recharts Spend Trend Chart (R4.3)
```typescript
// Source: https://recharts.github.io/en-US/api
'use client'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { parseNumeric, formatCurrency, formatCairoDate } from '@/lib/format'
import type { SpendRecord } from '@/lib/database.types'

interface SpendChartProps {
  data: SpendRecord[]
  currency?: string
}

interface ChartDataPoint {
  date: string
  displayDate: string
  dailySpend: number
}

export function SpendChart({ data, currency = 'EGP' }: SpendChartProps) {
  const chartData: ChartDataPoint[] = data.map((record) => ({
    date: record.date,
    displayDate: formatCairoDate(record.date, {
      month: 'short',
      day: 'numeric',
    }),
    dailySpend: parseNumeric(record.daily_spend),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="displayDate" />
        <YAxis
          tickFormatter={(value: number) =>
            formatCurrency(String(value), currency)
          }
        />
        <Tooltip
          formatter={(value: number) => [
            formatCurrency(String(value), currency),
            'Daily Spend',
          ]}
        />
        <Area
          type="monotone"
          dataKey="dailySpend"
          stroke="#2563eb"
          fill="#3b82f6"
          fillOpacity={0.1}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

### Account Overview with Realtime Updates (R4.2 + R4.5)
```typescript
// components/accounts/accounts-overview.tsx
'use client'

import { useState, useCallback } from 'react'
import { useRealtime } from '@/hooks/use-realtime'
import { AccountsTable } from './accounts-table'
import type { AdAccount } from '@/lib/database.types'

interface AccountsOverviewProps {
  initialData: AdAccount[]
}

export function AccountsOverview({ initialData }: AccountsOverviewProps) {
  const [accounts, setAccounts] = useState<AdAccount[]>(initialData)

  // Subscribe to real-time changes on ad_accounts
  useRealtime<AdAccount>({
    table: 'ad_accounts',
    event: 'UPDATE',
    onUpdate: useCallback(({ new: updated }) => {
      setAccounts((prev) =>
        prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
      )
    }, []),
    onInsert: useCallback((inserted) => {
      setAccounts((prev) => [...prev, inserted])
    }, []),
  })

  return <AccountsTable data={accounts} />
}
```

### TanStack Table Column Definitions for Ad Accounts (R4.2)
```typescript
// components/accounts/columns.tsx
'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowUpDown } from 'lucide-react'
import { formatCurrency, calcTimeToDepletion, formatRelativeTime } from '@/lib/format'
import type { AdAccount } from '@/lib/database.types'

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  disabled: 'bg-red-100 text-red-800',
}

const platformIcons: Record<string, string> = {
  facebook: 'F',
  tiktok: 'T',
}

export const columns: ColumnDef<AdAccount>[] = [
  {
    accessorKey: 'platform_id',
    header: 'Platform',
    cell: ({ row }) => (
      <Badge variant="outline">
        {platformIcons[row.getValue('platform_id') as string] ?? '?'}
      </Badge>
    ),
    filterFn: 'equals',
  },
  {
    accessorKey: 'account_name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Account Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: 'business_manager',
    header: 'Business Manager',
    filterFn: 'equals',
  },
  {
    accessorKey: 'current_balance',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Balance
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => formatCurrency(row.getValue('current_balance'), row.original.currency),
    sortingFn: (a, b) => {
      const aVal = parseFloat(a.getValue('current_balance') ?? '0')
      const bVal = parseFloat(b.getValue('current_balance') ?? '0')
      return aVal - bVal
    },
  },
  {
    accessorKey: 'current_daily_spend',
    header: 'Daily Spend',
    cell: ({ row }) => formatCurrency(row.getValue('current_daily_spend'), row.original.currency),
  },
  {
    accessorKey: 'current_mtd_spend',
    header: 'MTD Spend',
    cell: ({ row }) => formatCurrency(row.getValue('current_mtd_spend'), row.original.currency),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      return (
        <Badge className={statusColors[status]}>
          {status}
        </Badge>
      )
    },
    filterFn: 'equals',
  },
  {
    id: 'time_to_depletion',
    header: 'Days Left',
    cell: ({ row }) => {
      const days = calcTimeToDepletion(
        row.original.current_balance,
        row.original.current_daily_spend
      )
      if (days === null) return <span className="text-muted-foreground">--</span>
      if (days <= 3) return <Badge variant="destructive">{days}d</Badge>
      if (days <= 7) return <Badge variant="secondary">{days}d</Badge>
      return <span>{days}d</span>
    },
  },
  {
    accessorKey: 'last_synced_at',
    header: 'Last Sync',
    cell: ({ row }) => {
      const val = row.getValue('last_synced_at') as string | null
      return val ? formatRelativeTime(val) : 'Never'
    },
  },
]
```

### Enabling Realtime Publication (Migration)
```sql
-- Migration: enable realtime on dashboard-critical tables
-- Required for R4.5: Real-time updates via Supabase Realtime

ALTER PUBLICATION supabase_realtime ADD TABLE ad_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;
```

### Auth Callback Route Handler
```typescript
// app/auth/callback/route.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/overview'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 | Single package for all SSR frameworks; auth-helpers is deprecated |
| `supabase.auth.getSession()` for server-side auth | `supabase.auth.getClaims()` | Late 2025 | getClaims() does local JWT verification via asymmetric keys; getSession() does NOT verify |
| `supabase.from('table').on(...)` for Realtime | `supabase.channel().on('postgres_changes', ...)` | 2024 | Channel-based API is more flexible, supports multiple event types per channel |
| Recharts v2.x | Recharts v3.7.0 | 2024-2025 | New hooks API (useIsTooltipActive), Cell deprecated, improved TypeScript types |
| `tailwindcss-animate` | `tw-animate-css` | 2025 | New shadcn/ui projects use tw-animate-css by default |
| Tailwind v3 | Tailwind v4 | Late 2025 | Simplified config, CSS-first approach, faster builds; shadcn/ui supports both |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (transition) | 2025-2026 | Supabase is transitioning key naming; both currently work |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Deprecated, replaced by `@supabase/ssr`
- `supabase.auth.getSession()` for server-side auth checks: Insecure; use `getClaims()` instead
- Recharts `Cell` component: Deprecated in v3.7.0, will be removed in next major
- `tailwindcss-animate`: Replaced by `tw-animate-css` in new shadcn/ui projects

## Open Questions

1. **Next.js app location: subdirectory vs root**
   - What we know: The root package.json manages pipeline scripts (tsx, supabase CLI). The Next.js app is a separate concern with its own dependencies (react, next, etc.)
   - What's unclear: Whether to create the Next.js app as a subdirectory (`dashboard/`) making it a monorepo-like structure, or restructure the root to be the Next.js app itself
   - Recommendation: Create as `dashboard/` subdirectory. This keeps pipeline scripts isolated, avoids dependency conflicts, and is cleaner. The root `lib/database.types.ts` can be symlinked or copied into `dashboard/src/lib/`.

2. **Supabase Publishable Key vs Anon Key naming**
   - What we know: Supabase is transitioning from `SUPABASE_ANON_KEY` to `SUPABASE_PUBLISHABLE_KEY`. Both currently work.
   - What's unclear: Whether the new naming is fully rolled out yet
   - Recommendation: Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` for now (matches existing env vars in the project), document the transition for later.

3. **Custom Access Token Hook for role in JWT**
   - What we know: Phase 1 already created `update_user_role_claim()` trigger that syncs role + org_id into `auth.users.raw_app_meta_data`. This means JWT tokens should already contain role and org_id in `app_metadata`.
   - What's unclear: Whether `raw_app_meta_data` automatically flows into JWT claims, or if a Custom Access Token Hook is also needed. The Supabase docs indicate `app_metadata` IS included in JWTs by default.
   - Recommendation: Verify during implementation by inspecting a JWT token. If role is not in the JWT, add a Custom Access Token Hook. Most likely NOT needed since `app_metadata` flows automatically.

4. **Recharts v3 TypeScript strictness**
   - What we know: Recharts v3 has improved TypeScript types vs v2, but some typing issues remain with D3 underpinnings
   - What's unclear: Whether strict TypeScript mode will cause issues with Recharts component props
   - Recommendation: Plan for potential `// @ts-expect-error` or type assertions on specific Recharts props. Test early.

## Sources

### Primary (HIGH confidence)
- [Supabase SSR Auth Setup](https://supabase.com/docs/guides/auth/server-side/nextjs) - Complete middleware + client setup for Next.js
- [Supabase SSR Client Creation](https://supabase.com/docs/guides/auth/server-side/creating-a-client) - Browser, server, middleware client factories
- [Supabase getClaims() API](https://supabase.com/docs/reference/javascript/auth-getclaims) - JWT verification method
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) - Channel subscriptions, filters, RLS integration
- [Supabase Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) - Role-based access control patterns
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/radix/data-table) - TanStack Table integration patterns
- [shadcn/ui Installation](https://ui.shadcn.com/docs/installation/next) - Next.js setup steps
- [Next.js App Router Docs](https://nextjs.org/docs/app) - Official routing, loading, error handling
- [Recharts GitHub Releases](https://github.com/recharts/recharts/releases) - v3.7.0 is latest stable
- [@supabase/ssr npm](https://www.npmjs.com/package/@supabase/ssr) - v0.8.0 latest

### Secondary (MEDIUM confidence)
- [Next.js 15/16 Release Blog](https://nextjs.org/blog/next-15) - Version 15 feature details, React 19 support
- [Supabase + Next.js Starter Template](https://vercel.com/templates/next.js/supabase) - Reference architecture from Vercel
- [Next.js Loading States Guide](https://eastondev.com/blog/en/posts/dev/20260105-nextjs-loading-states/) - loading.tsx patterns and Suspense

### Tertiary (LOW confidence)
- Multiple Medium articles on Supabase SSR setup (cross-verified with official docs)
- Community GitHub discussions on realtime enablement via CLI/SQL

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries specified in project requirements; versions verified via npm/GitHub
- Architecture: HIGH - Patterns come from official Supabase docs and Next.js docs
- Auth patterns: HIGH - Based on official Supabase SSR guide + existing Phase 1 triggers in the codebase
- Realtime: HIGH - Official Supabase Realtime docs + postgres_changes API is well-documented
- Recharts: MEDIUM - v3 is current but TypeScript strictness interaction is not fully verified
- Pitfalls: HIGH - Common issues verified across multiple official sources and community reports

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - stable ecosystem, no major breaking changes expected)
