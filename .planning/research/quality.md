# Quality Practices Research: Targetspro Ad Spend Monitoring Platform

**Domain:** Full-stack ad spend monitoring (Next.js + Supabase + n8n)
**Researched:** 2026-02-11
**Overall Confidence:** HIGH (testing/CI/CD tooling well-documented), MEDIUM (some monitoring/security specifics based on training data)

---

## Table of Contents

1. [Testing Strategy](#1-testing-strategy)
2. [CI/CD Pipeline](#2-cicd-pipeline)
3. [Code Quality Tooling](#3-code-quality-tooling)
4. [Monitoring and Observability](#4-monitoring-and-observability)
5. [Security Best Practices](#5-security-best-practices)
6. [Performance Considerations](#6-performance-considerations)
7. [Recommendations Summary](#7-recommendations-summary)
8. [Sources and Confidence](#8-sources-and-confidence)

---

## 1. Testing Strategy

### 1.1 Testing Pyramid for This Stack

```
         /  E2E Tests (Playwright)  \        <- Fewest, most expensive
        /   Dashboard flows, alerts   \
       /   Integration Tests (Vitest)   \    <- Moderate count
      /  Supabase queries, Edge Functions \
     /      Unit Tests (Vitest)            \ <- Most numerous, cheapest
    / Components, utilities, calculations   \
```

**Recommendation:** Use Vitest for unit and integration tests, Playwright for E2E. Do NOT use Jest -- Vitest is officially recommended by Next.js (confirmed in official docs v16.1.6), is significantly faster, and has native ESM/TypeScript support that avoids the configuration pain Jest causes with Next.js App Router.

### 1.2 Unit Tests with Vitest

**Confidence: HIGH** (verified against official Next.js documentation v16.1.6)

**Installation:**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths
```

**Configuration (`vitest.config.mts`):**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        '**/*.config.*',
        '**/types/**',
        'tests/**',
      ],
      thresholds: {
        // Start modest, increase as codebase matures
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
    include: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
  },
})
```

**Test setup file (`tests/setup.ts`):**

```typescript
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

**What to unit test in this project:**

| Target | Priority | Examples |
|--------|----------|---------|
| Spend calculation utilities | CRITICAL | Time-to-depletion formulas, daily spend averaging, budget threshold calculations |
| Alert threshold logic | CRITICAL | When alerts fire, escalation tier selection, timezone-aware scheduling |
| Currency/number formatting | HIGH | Egyptian Pound formatting, percentage calculations, large number abbreviation |
| React components (sync) | HIGH | Alert cards, account status badges, spend charts configuration |
| Date/timezone utilities | HIGH | Cairo timezone conversions, "time ago" formatting, reporting windows |
| Supabase query builders | MEDIUM | Filter construction, pagination params, sort logic |

**Important caveat from official docs:** `async` Server Components are NOT fully supported by Vitest. Use E2E tests (Playwright) for async Server Components instead. This is critical for this project since dashboard pages will likely be async Server Components fetching from Supabase.

**Example -- testing spend calculation utility:**

```typescript
// lib/spend-calculations.test.ts
import { describe, it, expect } from 'vitest'
import {
  calculateTimeToDepletion,
  calculateDailySpendRate,
  shouldTriggerAlert,
} from '@/lib/spend-calculations'

describe('calculateTimeToDepletion', () => {
  it('returns hours remaining based on current balance and spend rate', () => {
    const result = calculateTimeToDepletion({
      currentBalance: 1000,
      dailySpendRate: 200,
    })
    expect(result.hoursRemaining).toBe(120) // 5 days * 24 hours
  })

  it('returns 0 when balance is depleted', () => {
    const result = calculateTimeToDepletion({
      currentBalance: 0,
      dailySpendRate: 200,
    })
    expect(result.hoursRemaining).toBe(0)
  })

  it('returns Infinity when spend rate is zero', () => {
    const result = calculateTimeToDepletion({
      currentBalance: 1000,
      dailySpendRate: 0,
    })
    expect(result.hoursRemaining).toBe(Infinity)
  })
})

describe('shouldTriggerAlert', () => {
  it('triggers when time-to-depletion falls below threshold', () => {
    expect(shouldTriggerAlert({
      hoursRemaining: 12,
      thresholdHours: 24,
      alertTier: 'warning',
    })).toBe(true)
  })

  it('does not trigger when above threshold', () => {
    expect(shouldTriggerAlert({
      hoursRemaining: 48,
      thresholdHours: 24,
      alertTier: 'warning',
    })).toBe(false)
  })
})
```

### 1.3 Integration Tests with Vitest + Supabase Local

**Confidence: MEDIUM** (Supabase local dev is well-documented but specific testing patterns are based on community practice and training data)

**Strategy:** Use the Supabase CLI to spin up a local Supabase instance for integration tests. This gives you a real PostgreSQL database, real Auth, and real Edge Functions runtime -- no mocking needed.

**Setup the local Supabase environment:**

```bash
# Install Supabase CLI
npm install -D supabase

# Initialize (one-time)
npx supabase init

# Start local services (PostgreSQL, Auth, Storage, Edge Functions)
npx supabase start

# Output will show local URLs:
# API URL:   http://127.0.0.1:54321
# anon key:  eyJ...
# service_role key: eyJ...
```

**Integration test configuration (extend `vitest.config.mts`):**

```typescript
// vitest.config.mts -- add integration test project
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    // ... unit test config above
  },
  // Separate project for integration tests
  // Run with: vitest --project integration
})

// Better approach: vitest workspace
// vitest.workspace.ts
export default [
  {
    extends: './vitest.config.mts',
    test: {
      name: 'unit',
      include: ['**/*.test.{ts,tsx}'],
      exclude: ['**/*.integration.test.{ts,tsx}'],
    },
  },
  {
    extends: './vitest.config.mts',
    test: {
      name: 'integration',
      include: ['**/*.integration.test.{ts,tsx}'],
      environment: 'node', // Integration tests don't need jsdom
      hookTimeout: 30000,
      testTimeout: 15000,
    },
  },
]
```

**Integration test helper:**

```typescript
// tests/helpers/supabase-test-client.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// These values come from `supabase start` output
const SUPABASE_LOCAL_URL = process.env.SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY || 'your-local-service-key'

export function createTestClient() {
  return createClient<Database>(SUPABASE_LOCAL_URL, SUPABASE_SERVICE_KEY)
}

export async function resetTestData(client: ReturnType<typeof createTestClient>) {
  // Clean up test data between runs -- use service_role to bypass RLS
  await client.from('ad_spend_records').delete().neq('id', '')
  await client.from('alert_history').delete().neq('id', '')
  await client.from('ad_accounts').delete().neq('id', '')
}

export async function seedTestData(client: ReturnType<typeof createTestClient>) {
  // Insert baseline test data
  await client.from('ad_accounts').insert([
    {
      id: 'test-account-1',
      platform: 'facebook',
      account_name: 'Test FB Account',
      balance: 5000,
      daily_spend_rate: 500,
      status: 'active',
    },
    {
      id: 'test-account-2',
      platform: 'tiktok',
      account_name: 'Test TikTok Account',
      balance: 200,
      daily_spend_rate: 150,
      status: 'active',
    },
  ])
}
```

**Example integration test:**

```typescript
// tests/integration/ad-accounts.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestClient, resetTestData, seedTestData } from '../helpers/supabase-test-client'

describe('Ad Accounts Integration', () => {
  const supabase = createTestClient()

  beforeEach(async () => {
    await resetTestData(supabase)
    await seedTestData(supabase)
  })

  afterAll(async () => {
    await resetTestData(supabase)
  })

  it('fetches active accounts with low balance', async () => {
    const { data, error } = await supabase
      .from('ad_accounts')
      .select('*')
      .eq('status', 'active')
      .lt('balance', 300)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].account_name).toBe('Test TikTok Account')
  })

  it('RLS prevents access without auth', async () => {
    // Create an anon client (no auth)
    const anonClient = createClient(
      'http://127.0.0.1:54321',
      'your-local-anon-key'
    )
    const { data, error } = await anonClient
      .from('ad_accounts')
      .select('*')

    // With proper RLS, anon should see nothing
    expect(data).toHaveLength(0)
  })
})
```

### 1.4 Edge Function Testing

**Confidence: MEDIUM** (based on Supabase documentation patterns)

Supabase Edge Functions run on Deno. Test them using Deno's built-in test runner.

**Edge Function test example:**

```typescript
// supabase/functions/tests/calculate-alerts.test.ts
import { assertEquals } from 'https://deno.land/std/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

Deno.test('calculate-alerts function returns correct alert list', async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321',
    Deno.env.get('SUPABASE_ANON_KEY') ?? 'local-anon-key'
  )

  const { data, error } = await supabase.functions.invoke('calculate-alerts', {
    body: { accountId: 'test-account-2' },
  })

  assertEquals(error, null)
  assertEquals(data.alerts.length > 0, true)
  assertEquals(data.alerts[0].severity, 'critical')
})
```

**Running Edge Function tests locally:**

```bash
# Ensure local Supabase is running
npx supabase start

# Serve functions locally
npx supabase functions serve

# Run Deno tests
deno test --allow-net --allow-env supabase/functions/tests/
```

### 1.5 End-to-End Tests with Playwright

**Confidence: HIGH** (verified against official Next.js documentation v16.1.6)

**Installation:**

```bash
npm init playwright
# Select TypeScript, tests/ directory, install browsers
```

**Configuration (`playwright.config.ts`):**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ...(process.env.CI ? [['github' as const]] : []),
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Add Firefox and WebKit for broader coverage when needed
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
```

**Key E2E test flows for this project:**

| Flow | Priority | What to Test |
|------|----------|-------------|
| Login / Auth | CRITICAL | Supabase Auth login, session persistence, redirect to dashboard |
| Dashboard overview | CRITICAL | All accounts render, balances display, status indicators work |
| Account detail view | HIGH | Spend history chart loads, time-to-depletion displays, data refreshes |
| Alert configuration | HIGH | Threshold settings save, channel toggles work, test alert sends |
| Real-time updates | MEDIUM | Supabase Realtime subscription updates dashboard without refresh |
| Multi-account filtering | MEDIUM | Platform filter, status filter, search by account name |

**Example E2E test:**

```typescript
// e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login via Supabase Auth
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'test@targetspro.com')
    await page.fill('[data-testid="password-input"]', 'test-password')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
  })

  test('displays all active ad accounts', async ({ page }) => {
    await expect(page.locator('[data-testid="account-card"]')).toHaveCount(
      // At least some accounts should display
      { minimum: 1 }
    )
  })

  test('shows time-to-depletion for accounts', async ({ page }) => {
    const firstAccount = page.locator('[data-testid="account-card"]').first()
    await expect(firstAccount.locator('[data-testid="ttd-badge"]')).toBeVisible()
  })

  test('filters accounts by platform', async ({ page }) => {
    await page.click('[data-testid="filter-facebook"]')
    const accounts = page.locator('[data-testid="account-card"]')
    for (const account of await accounts.all()) {
      await expect(account.locator('[data-testid="platform-badge"]')).toHaveText('Facebook')
    }
  })

  test('navigates to account detail on click', async ({ page }) => {
    const firstAccount = page.locator('[data-testid="account-card"]').first()
    const accountName = await firstAccount.locator('[data-testid="account-name"]').textContent()
    await firstAccount.click()
    await expect(page.locator('h1')).toContainText(accountName!)
  })
})
```

**Auth helper for E2E (avoid repeating login in every test):**

```typescript
// e2e/fixtures/auth.ts
import { test as base, Page } from '@playwright/test'

async function loginAsManager(page: Page) {
  await page.goto('/login')
  await page.fill('[data-testid="email-input"]', process.env.E2E_TEST_EMAIL!)
  await page.fill('[data-testid="password-input"]', process.env.E2E_TEST_PASSWORD!)
  await page.click('[data-testid="login-button"]')
  await page.waitForURL('/dashboard')
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await loginAsManager(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

### 1.6 Package.json Test Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --project unit",
    "test:integration": "vitest --project integration",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage && playwright test"
  }
}
```

---

## 2. CI/CD Pipeline

### 2.1 Recommended Setup

**Confidence: HIGH** (GitHub Actions is the standard, patterns are well-established)

**Strategy:** Three GitHub Actions workflows:

1. **PR Check** -- runs on every pull request (lint, type-check, test, build)
2. **Deploy Preview** -- runs on PR to create Vercel preview deployment
3. **Deploy Production** -- runs on push to main (deploy to Vercel + run Supabase migrations)

### 2.2 PR Check Workflow

```yaml
# .github/workflows/pr-check.yml
name: PR Check

on:
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type Check
        run: npx tsc --noEmit

  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Run Unit Tests
        run: npm run test:unit -- --run

      - name: Upload Coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - run: npm ci

      - name: Start Supabase Local
        run: supabase start

      - name: Run Migrations
        run: supabase db push

      - name: Run Integration Tests
        run: npm run test:integration -- --run
        env:
          SUPABASE_LOCAL_URL: http://127.0.0.1:54321
          SUPABASE_LOCAL_SERVICE_KEY: ${{ secrets.SUPABASE_LOCAL_SERVICE_KEY }}

      - name: Stop Supabase
        if: always()
        run: supabase stop

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck] # Only run E2E if lint passes
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps chromium

      - name: Build Application
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

      - name: Run E2E Tests
        run: npm run test:e2e
        env:
          E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}

      - name: Upload Playwright Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14

  build-check:
    name: Build Check
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

### 2.3 Supabase Migration CI

```yaml
# .github/workflows/supabase-migrations.yml
name: Supabase Migrations

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  migrate:
    name: Run Migrations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link Supabase Project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Push Migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Verify Migration
        run: supabase db diff --use-migra
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### 2.4 Production Deploy

```yaml
# .github/workflows/deploy.yml
name: Deploy Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Vercel
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Build & Deploy
        run: npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

### 2.5 Preview Deployments

**Recommendation:** Use Vercel's native GitHub integration for preview deployments. It automatically creates a preview URL for every PR. No custom workflow needed -- just connect the repository in Vercel dashboard.

If you want more control, Vercel CLI can be used in a workflow:

```bash
npx vercel --token=${{ secrets.VERCEL_TOKEN }}  # Deploys to preview URL
```

### 2.6 Required GitHub Actions Secrets

| Secret | Purpose | Where to Get |
|--------|---------|-------------|
| `SUPABASE_URL` | Supabase project URL | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | Supabase anon key | Supabase Dashboard > Settings > API |
| `SUPABASE_PROJECT_REF` | Supabase project reference | Supabase Dashboard > Settings > General |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI auth | supabase.com/dashboard/account/tokens |
| `SUPABASE_LOCAL_SERVICE_KEY` | Local service role key | Output of `supabase start` |
| `VERCEL_TOKEN` | Vercel deployment | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Vercel org | `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | Vercel project | `.vercel/project.json` after `vercel link` |
| `E2E_TEST_EMAIL` | E2E test user email | Create a test user in Supabase Auth |
| `E2E_TEST_PASSWORD` | E2E test user password | Set during test user creation |

---

## 3. Code Quality Tooling

### 3.1 ESLint Configuration

**Confidence: HIGH** (Next.js has built-in ESLint support)

**Recommendation:** Use Next.js built-in ESLint config as the base, extend with TypeScript strict rules.

```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-import eslint-config-prettier
```

**ESLint configuration (`.eslintrc.json`):**

```json
{
  "extends": [
    "next/core-web-vitals",
    "next/typescript",
    "plugin:@typescript-eslint/recommended-type-checked",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json"
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "warn",
    "@typescript-eslint/prefer-optional-chain": "warn",
    "@typescript-eslint/strict-boolean-expressions": "warn",
    "import/order": [
      "warn",
      {
        "groups": ["builtin", "external", "internal", "parent", "sibling"],
        "newlines-between": "always",
        "alphabetize": { "order": "asc" }
      }
    ],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ]
}
```

### 3.2 Prettier Configuration

```bash
npm install -D prettier eslint-config-prettier
```

**Prettier configuration (`.prettierrc`):**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

**`.prettierignore`:**

```
.next
node_modules
coverage
playwright-report
test-results
supabase/.temp
*.generated.ts
```

### 3.3 TypeScript Strict Mode

**Recommendation:** Enable strict mode from day one. It is significantly harder to add later.

**`tsconfig.json` key settings:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": false,
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "supabase/functions"]
}
```

**Why `noUncheckedIndexedAccess: true` is important for this project:** When accessing ad account data from API responses or database query results, unchecked index access (e.g., `accounts[0].balance`) can cause runtime errors. This flag forces you to handle the `undefined` case.

### 3.4 Husky + lint-staged (Pre-commit Hooks)

```bash
npm install -D husky lint-staged
npx husky init
```

**`.husky/pre-commit`:**

```bash
npx lint-staged
```

**`lint-staged` configuration in `package.json`:**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ],
    "*.{ts,tsx}": [
      "vitest related --run"
    ]
  }
}
```

**Note on `vitest related`:** This runs only the tests related to changed files, keeping pre-commit hooks fast. If this causes issues or is too slow, remove the vitest step from lint-staged and rely on CI instead.

### 3.5 Supabase Type Generation

**Recommendation:** Auto-generate TypeScript types from your Supabase schema. Run this as part of the development workflow and in CI to catch schema drift.

```bash
# Generate types from remote database
npx supabase gen types typescript --project-id your-project-ref > types/supabase.ts

# Or from local database
npx supabase gen types typescript --local > types/supabase.ts
```

**Add to package.json:**

```json
{
  "scripts": {
    "db:types": "supabase gen types typescript --local > types/supabase.ts",
    "db:types:remote": "supabase gen types typescript --project-id $SUPABASE_PROJECT_REF > types/supabase.ts"
  }
}
```

---

## 4. Monitoring and Observability

### 4.1 Error Tracking with Sentry

**Confidence: MEDIUM** (based on training data; Sentry has an official Next.js SDK)

**Recommendation:** Use Sentry for error tracking. It has first-class Next.js support with automatic instrumentation for both client and server errors, route transitions, and performance monitoring.

**Installation:**

```bash
npx @sentry/wizard@latest -i nextjs
```

This wizard creates the required configuration files:
- `sentry.client.config.ts` -- client-side error tracking
- `sentry.server.config.ts` -- server-side error tracking
- `sentry.edge.config.ts` -- edge runtime error tracking
- Updates `next.config.js` with Sentry webpack plugin

**Key Sentry configuration points for this project:**

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance monitoring -- sample 10% in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Replay for debugging user-reported issues
  replaysSessionSampleRate: 0.01, // 1% of sessions
  replaysOnErrorSampleRate: 1.0,  // 100% of error sessions

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Filter out noisy errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Network request failed',
  ],
})
```

**Custom error boundaries for dashboard:**

```typescript
// components/error-boundary.tsx
'use client'
import * as Sentry from '@sentry/nextjs'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  Sentry.captureException(error, {
    tags: { component: 'dashboard' },
  })

  return (
    <div>
      <h2>Something went wrong loading the dashboard</h2>
      <p>Our team has been notified. Please try again.</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### 4.2 n8n Workflow Monitoring

**Confidence: MEDIUM** (based on n8n's execution model and training data)

**Strategy:** n8n workflows are the data backbone of this platform. If they fail, the dashboard shows stale data. Monitoring them is critical.

**Approach 1: n8n built-in error workflow**

n8n supports an "Error Workflow" that triggers when any workflow fails. Configure it to:
1. Send a Telegram message to the ops channel
2. Log the failure to Supabase (a `workflow_executions` table)
3. Send an email to the admin

**Approach 2: Heartbeat monitoring from the platform side**

```sql
-- Create a table to track pipeline health
CREATE TABLE pipeline_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_name TEXT NOT NULL,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INT DEFAULT 0,
  status TEXT DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'failed', 'unknown'))
);

-- Create a function to check staleness
CREATE OR REPLACE FUNCTION check_pipeline_staleness()
RETURNS TABLE (pipeline_name TEXT, hours_since_update NUMERIC, is_stale BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.pipeline_name,
    EXTRACT(EPOCH FROM (NOW() - ph.last_success_at)) / 3600 AS hours_since_update,
    (NOW() - ph.last_success_at) > INTERVAL '2 hours' AS is_stale
  FROM pipeline_health ph;
END;
$$ LANGUAGE plpgsql;
```

**Dashboard widget:** Display a "Data Freshness" indicator showing when each pipeline last ran successfully. If data is more than 2 hours old, show a warning banner.

### 4.3 Supabase Database Monitoring

**Key metrics to track:**

| Metric | Why | How to Monitor |
|--------|-----|---------------|
| Database size | Supabase has storage limits on free/pro plans | Supabase Dashboard, or query `pg_database_size()` |
| Active connections | Connection pooling limits | Supabase Dashboard metrics |
| Slow queries | Dashboard performance issues | `pg_stat_statements` extension |
| RLS policy performance | RLS can cause slow queries if poorly written | `EXPLAIN ANALYZE` on key queries |
| Edge Function invocations | Usage quota tracking | Supabase Dashboard > Edge Functions |
| Realtime connections | Connection limits | Supabase Dashboard > Realtime |

**Recommendation:** Enable the `pg_stat_statements` extension in Supabase to track query performance:

```sql
-- Enable in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Query slowest statements
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### 4.4 Uptime Monitoring

**Confidence: HIGH** (well-established tools)

**Recommendation:** Use a combination of:

1. **Vercel Analytics** (built-in) -- Web Vitals, function execution times, error rates
2. **External uptime monitor** -- BetterUptime, UptimeRobot, or Checkly for external endpoint monitoring

**What to monitor externally:**

| Endpoint | Check Type | Interval | Alert Channel |
|----------|-----------|----------|---------------|
| `/` (homepage) | HTTP 200 | 1 min | Telegram |
| `/api/health` | HTTP 200 + JSON body check | 1 min | Telegram + Email |
| `/dashboard` (authenticated) | HTTP 200 | 5 min | Telegram |
| Supabase REST API | HTTP 200 | 1 min | Telegram + Email |

**Health check endpoint:**

```typescript
// app/api/health/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}

  // Check Supabase connectivity
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await supabase.from('ad_accounts').select('id').limit(1)
    checks.database = error ? 'error' : 'ok'
  } catch {
    checks.database = 'error'
  }

  // Check data freshness
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase
      .from('pipeline_health')
      .select('last_success_at')
      .order('last_success_at', { ascending: false })
      .limit(1)
      .single()

    const hoursSinceUpdate = data
      ? (Date.now() - new Date(data.last_success_at).getTime()) / (1000 * 60 * 60)
      : Infinity

    checks.data_freshness = hoursSinceUpdate < 2 ? 'ok' : 'error'
  } catch {
    checks.data_freshness = 'error'
  }

  const allOk = Object.values(checks).every((v) => v === 'ok')

  return NextResponse.json(
    { status: allOk ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  )
}
```

### 4.5 Logging Strategy

**Recommendation:** Structured JSON logging for server-side code, with a simple logger wrapper.

```typescript
// lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  }

  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
}
```

**Usage in server components / API routes:**

```typescript
import { logger } from '@/lib/logger'

logger.info('Fetching ad accounts', { platform: 'facebook', count: 12 })
logger.error('Failed to refresh token', { accountId: 'abc-123', error: err.message })
```

**Vercel captures `console.log` output in its function logs.** For a project of this scale, this is sufficient. You do not need a separate logging service (Datadog, LogRocket, etc.) unless the platform grows significantly.

---

## 5. Security Best Practices

### 5.1 Environment Variable Management

**Confidence: HIGH**

**Principle:** Never commit secrets. Use `.env.local` for development, environment variables in Vercel/GitHub for production.

**File structure:**

```
.env.example          # Committed -- template with empty values
.env.local            # NOT committed -- local development secrets
.env.test             # NOT committed -- test environment secrets
```

**`.env.example` (committed to repo):**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=

# External APIs (DO NOT use in frontend)
FACEBOOK_APP_SECRET=
TIKTOK_APP_SECRET=

# Alert Channels
TELEGRAM_BOT_TOKEN=
WHATSAPP_API_TOKEN=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
```

**`.gitignore` additions:**

```
.env.local
.env.test
.env.production
.env*.local
```

**Critical rule:** Any environment variable prefixed with `NEXT_PUBLIC_` is exposed to the browser. NEVER put secrets (service role keys, API secrets, tokens) in `NEXT_PUBLIC_` variables.

### 5.2 API Token Rotation and Secure Storage

**This project handles Facebook and TikTok API tokens -- a critical security concern given the PROJECT.md mentions hardcoded tokens as a current problem.**

**Recommended approach:**

1. **Store tokens in Supabase with encryption:**

```sql
-- Encrypted credentials table
CREATE TABLE api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'tiktok')),
  credential_type TEXT NOT NULL CHECK (credential_type IN ('access_token', 'refresh_token', 'app_secret')),
  encrypted_value TEXT NOT NULL,  -- Encrypted at application level
  expires_at TIMESTAMPTZ,
  last_rotated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  org_id UUID REFERENCES organizations(id)
);

-- RLS: Only service role can access
ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;

-- No policy for anon/authenticated -- only service_role bypasses RLS
```

2. **Token refresh automation:** Build an Edge Function or n8n workflow that checks token expiration and refreshes before expiry.

3. **Audit logging:**

```sql
CREATE TABLE credential_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES api_credentials(id),
  accessed_by TEXT NOT NULL,  -- 'n8n-pipeline', 'edge-function', etc.
  action TEXT NOT NULL CHECK (action IN ('read', 'refresh', 'rotate')),
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET
);
```

### 5.3 Input Validation and Sanitization

**Recommendation:** Use Zod for runtime input validation on all API routes and Edge Functions.

```bash
npm install zod
```

**Example -- alert threshold configuration endpoint:**

```typescript
// app/api/alerts/config/route.ts
import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'

const AlertConfigSchema = z.object({
  accountId: z.string().uuid(),
  thresholds: z.object({
    warningHours: z.number().min(1).max(720),
    criticalHours: z.number().min(1).max(168),
    depletedNotify: z.boolean(),
  }),
  channels: z.object({
    email: z.boolean(),
    telegram: z.boolean(),
    whatsapp: z.boolean(),
  }),
})

export async function POST(request: NextRequest) {
  const body = await request.json()

  const result = AlertConfigSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const config = result.data
  // ... proceed with validated data
}
```

**Apply validation everywhere:**

| Layer | What to Validate | Tool |
|-------|-----------------|------|
| API Routes | Request body, query params, path params | Zod |
| Server Actions | Form data, action inputs | Zod |
| Edge Functions | Request body, headers | Zod (or Deno equivalent) |
| Database | Column constraints, check constraints | PostgreSQL constraints |
| Client-side | Form inputs (UX only, not security) | React Hook Form + Zod resolver |

### 5.4 CORS and CSP Headers

**Next.js middleware approach for security headers:**

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  )

  // CSP -- adjust based on actual requirements
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-eval in dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} wss://*.supabase.co https://*.sentry.io`,
    "font-src 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)

  return response
}

export const config = {
  matcher: [
    // Apply to all routes except static files and API
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

**Important note on CSP:** The `connect-src` directive MUST include the Supabase URL and Supabase Realtime WebSocket URL, otherwise the dashboard will fail to load data. Adjust the CSP as you add more external services (Sentry, analytics, etc.).

### 5.5 Supabase RLS Policies

**Confidence: HIGH** (RLS is a core Supabase feature, well-documented)

**This is the most critical security layer for this project.** RLS ensures that even if there is a frontend bug or API vulnerability, users can only access data they are authorized to see.

**RLS testing strategy:**

```typescript
// tests/integration/rls-policies.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const LOCAL_URL = 'http://127.0.0.1:54321'

describe('RLS Policies', () => {
  // Test with anon key (unauthenticated)
  const anonClient = createClient(LOCAL_URL, 'local-anon-key')

  // Test with service role (admin bypass)
  const adminClient = createClient(LOCAL_URL, 'local-service-role-key')

  describe('ad_accounts table', () => {
    it('anon users cannot read any accounts', async () => {
      const { data } = await anonClient.from('ad_accounts').select('*')
      expect(data).toHaveLength(0)
    })

    it('anon users cannot insert accounts', async () => {
      const { error } = await anonClient.from('ad_accounts').insert({
        platform: 'facebook',
        account_name: 'Hacked Account',
      })
      expect(error).not.toBeNull()
    })

    it('authenticated user can only see their org accounts', async () => {
      // Sign in as test user
      const { data: authData } = await anonClient.auth.signInWithPassword({
        email: 'test@targetspro.com',
        password: 'test-password',
      })

      const authedClient = createClient(LOCAL_URL, 'local-anon-key', {
        global: { headers: { Authorization: `Bearer ${authData.session!.access_token}` } },
      })

      const { data } = await authedClient.from('ad_accounts').select('*')
      // All returned accounts should belong to the user's org
      for (const account of data ?? []) {
        expect(account.org_id).toBe('test-org-id')
      }
    })
  })

  describe('api_credentials table', () => {
    it('no authenticated user can read credentials directly', async () => {
      const { data: authData } = await anonClient.auth.signInWithPassword({
        email: 'test@targetspro.com',
        password: 'test-password',
      })

      const authedClient = createClient(LOCAL_URL, 'local-anon-key', {
        global: { headers: { Authorization: `Bearer ${authData.session!.access_token}` } },
      })

      const { data } = await authedClient.from('api_credentials').select('*')
      expect(data).toHaveLength(0) // No RLS policy allows read
    })
  })
})
```

**RLS policy patterns for this project:**

```sql
-- Users can only see accounts belonging to their organization
CREATE POLICY "Users see own org accounts" ON ad_accounts
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM user_profiles WHERE user_id = auth.uid()
    )
  );

-- Users can only update accounts in their org (managers only)
CREATE POLICY "Managers update org accounts" ON ad_accounts
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'manager'
    )
  );

-- Alert history visible to org members
CREATE POLICY "Users see own org alerts" ON alert_history
  FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM ad_accounts
      WHERE org_id IN (
        SELECT org_id FROM user_profiles WHERE user_id = auth.uid()
      )
    )
  );

-- Credentials: NO user-facing policy (only service_role access)
-- This is intentional -- credentials should never be queried from the client
```

### 5.6 Security Checklist

| Item | Priority | Status |
|------|----------|--------|
| RLS enabled on ALL tables | CRITICAL | Must do before launch |
| No `NEXT_PUBLIC_` prefix on secrets | CRITICAL | Verify in .env.example |
| Service role key never in client code | CRITICAL | Code review checkpoint |
| Zod validation on all API inputs | HIGH | Implement per endpoint |
| Security headers in middleware | HIGH | One-time setup |
| Token refresh automation | HIGH | Build in pipeline phase |
| `api_credentials` table inaccessible to clients | CRITICAL | RLS with no user policies |
| HTTPS enforced (HSTS header) | HIGH | Middleware setup |
| Rate limiting on auth endpoints | MEDIUM | Supabase has built-in |
| CSP configured for Supabase + Sentry domains | MEDIUM | Middleware setup |

---

## 6. Performance Considerations

### 6.1 Dashboard Loading with Many Ad Accounts

**Problem:** Targetspro manages multiple ad accounts across 4+ business managers. As they scale, the dashboard could have 50-100+ accounts loading simultaneously.

**Strategies:**

1. **Server-side pagination:** Never load all accounts at once.

```typescript
// app/dashboard/page.tsx (Server Component)
export default async function Dashboard({
  searchParams,
}: {
  searchParams: { page?: string; platform?: string; status?: string }
}) {
  const page = Number(searchParams.page) || 1
  const pageSize = 20

  const supabase = createServerClient()
  let query = supabase
    .from('ad_accounts')
    .select('*', { count: 'exact' })
    .range((page - 1) * pageSize, page * pageSize - 1)
    .order('balance', { ascending: true }) // Show lowest balance first

  if (searchParams.platform) {
    query = query.eq('platform', searchParams.platform)
  }

  if (searchParams.status) {
    query = query.eq('status', searchParams.status)
  }

  const { data: accounts, count } = await query

  return <AccountGrid accounts={accounts} total={count} page={page} pageSize={pageSize} />
}
```

2. **SWR for client-side data refresh:**

```bash
npm install swr
```

```typescript
// hooks/use-accounts.ts
import useSWR from 'swr'
import { createBrowserClient } from '@/lib/supabase-browser'

export function useAccounts(filters: AccountFilters) {
  const supabase = createBrowserClient()

  return useSWR(
    ['accounts', filters],
    async () => {
      let query = supabase
        .from('ad_accounts')
        .select('*', { count: 'exact' })
        .range(filters.offset, filters.offset + filters.limit - 1)

      if (filters.platform) query = query.eq('platform', filters.platform)
      if (filters.status) query = query.eq('status', filters.status)

      const { data, count, error } = await query
      if (error) throw error
      return { accounts: data, total: count }
    },
    {
      refreshInterval: 60000, // Refresh every 60 seconds
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )
}
```

3. **Supabase Realtime for critical updates (balance changes, alerts):**

```typescript
// Subscribe to balance changes for the current org
useEffect(() => {
  const channel = supabase
    .channel('account-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'ad_accounts',
        filter: `org_id=eq.${orgId}`,
      },
      (payload) => {
        // Optimistically update the account in the SWR cache
        mutate(['accounts', filters])
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [orgId])
```

### 6.2 Efficient Time-Series Queries

**Problem:** Spend data accumulates over time. Querying months of spend history for charts needs to be efficient.

**Strategies:**

1. **Pre-aggregated daily summaries:**

```sql
-- Instead of querying raw spend records, maintain daily aggregates
CREATE TABLE daily_spend_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES ad_accounts(id),
  date DATE NOT NULL,
  total_spend NUMERIC(12,2) NOT NULL,
  impressions BIGINT,
  clicks BIGINT,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, date)
);

-- Index for time-range queries
CREATE INDEX idx_daily_spend_account_date
  ON daily_spend_summary(account_id, date DESC);

-- Index for platform-wide queries
CREATE INDEX idx_daily_spend_platform_date
  ON daily_spend_summary(platform, date DESC);
```

2. **Materialized views for dashboard overview:**

```sql
-- Materialized view for the dashboard overview cards
CREATE MATERIALIZED VIEW account_health_summary AS
SELECT
  a.id AS account_id,
  a.account_name,
  a.platform,
  a.balance AS current_balance,
  a.status,
  COALESCE(ds.avg_daily_spend, 0) AS avg_daily_spend_7d,
  CASE
    WHEN COALESCE(ds.avg_daily_spend, 0) > 0
    THEN (a.balance / ds.avg_daily_spend) * 24
    ELSE NULL
  END AS hours_to_depletion,
  ds.last_spend_date
FROM ad_accounts a
LEFT JOIN LATERAL (
  SELECT
    AVG(total_spend) AS avg_daily_spend,
    MAX(date) AS last_spend_date
  FROM daily_spend_summary
  WHERE account_id = a.id
    AND date >= CURRENT_DATE - INTERVAL '7 days'
) ds ON true;

-- Refresh periodically (after each data pull)
-- In Edge Function or n8n workflow:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY account_health_summary;

-- Index the materialized view
CREATE UNIQUE INDEX idx_account_health_id ON account_health_summary(account_id);
```

3. **Query performance baseline:** Test that the dashboard overview query executes under 200ms for 100 accounts with 90 days of data.

### 6.3 Caching Strategies

| Strategy | Where | What | TTL |
|----------|-------|------|-----|
| ISR (Incremental Static Regeneration) | Dashboard overview page | Account health summary | 60 seconds |
| SWR (stale-while-revalidate) | Client-side account list | Active account data | 60 seconds |
| Supabase Realtime | Critical updates | Balance changes, new alerts | Real-time (0 TTL) |
| PostgreSQL query cache | Database | Materialized views | Refresh after each data pull |
| Next.js `fetch` cache | Server Components | Supabase queries | `revalidate: 60` |

**ISR configuration for dashboard:**

```typescript
// app/dashboard/page.tsx
export const revalidate = 60 // Revalidate every 60 seconds

export default async function Dashboard() {
  const supabase = createServerClient()
  const { data } = await supabase.from('account_health_summary').select('*')
  return <DashboardView accounts={data} />
}
```

**Important:** Do NOT use ISR for pages that need to reflect real-time data (like the moment an alert fires). Use a hybrid approach: ISR for the initial load, then Supabase Realtime for live updates on the client.

---

## 7. Recommendations Summary

### Testing (Start Here)

| Priority | Action |
|----------|--------|
| 1 | Set up Vitest with the configuration above. Write first tests for spend calculation utilities. |
| 2 | Set up Playwright with auth fixture. Write first E2E test for login + dashboard load. |
| 3 | Set up Supabase local dev. Write first integration test for RLS policies. |
| 4 | Add Edge Function tests using Deno test runner. |

### CI/CD (Set Up Early)

| Priority | Action |
|----------|--------|
| 1 | Create PR check workflow (lint + typecheck + unit tests + build). This catches 80% of issues. |
| 2 | Enable Vercel GitHub integration for preview deployments. |
| 3 | Add integration test and E2E jobs to PR check. |
| 4 | Create Supabase migration workflow for production pushes. |

### Code Quality (Day One)

| Priority | Action |
|----------|--------|
| 1 | Enable TypeScript strict mode. Non-negotiable -- do this before writing code. |
| 2 | Configure ESLint + Prettier. |
| 3 | Set up Husky + lint-staged. |
| 4 | Set up Supabase type generation script. |

### Monitoring (Before Launch)

| Priority | Action |
|----------|--------|
| 1 | Install Sentry (15-minute setup with wizard). |
| 2 | Create `/api/health` endpoint. |
| 3 | Set up n8n error workflow to report to Telegram + Supabase. |
| 4 | Set up external uptime monitoring. |

### Security (Continuous)

| Priority | Action |
|----------|--------|
| 1 | Enable RLS on ALL tables. Test RLS policies in integration tests. |
| 2 | Move all hardcoded tokens (from current n8n workflows) to encrypted Supabase storage. |
| 3 | Add security headers middleware. |
| 4 | Add Zod validation to every API endpoint. |
| 5 | Set up credential access audit logging. |

---

## 8. Sources and Confidence

### HIGH Confidence (Verified with Official Documentation)

| Finding | Source |
|---------|--------|
| Vitest is recommended for Next.js unit testing | Next.js official docs v16.1.6 (fetched 2026-02-11) |
| Vitest configuration for Next.js (jsdom, plugins) | Next.js official docs v16.1.6 (fetched 2026-02-11) |
| async Server Components not supported by Vitest | Next.js official docs v16.1.6 (fetched 2026-02-11) |
| Playwright is recommended for Next.js E2E testing | Next.js official docs v16.1.6 (fetched 2026-02-11) |
| Playwright `webServer` config for Next.js | Next.js official docs v16.1.6 (fetched 2026-02-11) |
| Vitest installation: `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths` | Next.js official docs v16.1.6 |

### MEDIUM Confidence (Based on Training Data + Established Patterns)

| Finding | Basis |
|---------|-------|
| Sentry Next.js SDK setup wizard (`@sentry/wizard`) | Training data; Sentry is the industry standard. Verify exact wizard command before running. |
| Supabase CLI `supabase start` for local dev | Training data; core Supabase feature. Verify CLI commands with `supabase --help`. |
| Supabase type generation with `supabase gen types typescript` | Training data; core CLI feature. Verify exact flags with `supabase gen types --help`. |
| GitHub Actions `supabase/setup-cli@v1` action | Training data; verify the action exists on GitHub Marketplace before using. |
| `pg_stat_statements` available in Supabase | Training data; common PostgreSQL extension. Verify in Supabase dashboard extensions. |
| n8n error workflow feature | Training data; core n8n feature. |
| Zod for input validation | Training data; industry standard for TypeScript validation. |

### LOW Confidence (Needs Verification)

| Finding | Risk |
|---------|------|
| Exact Sentry config options (replaysSessionSampleRate, etc.) | API may have changed. Verify with `@sentry/nextjs` package docs after install. |
| `exactOptionalPropertyTypes` TypeScript flag compatibility with Next.js | May cause issues with Next.js types. Test before enabling. |
| Supabase Edge Functions Deno test runner patterns | Supabase may have updated their recommended testing approach. Check official docs. |
| CSP `unsafe-eval` requirement for Next.js dev mode | This was true historically. Verify if still needed with current Next.js version. |
| `vitest related` command in lint-staged | Verify this subcommand exists in current Vitest version. |

### Gaps Requiring Phase-Specific Research

1. **WhatsApp Business API integration** -- Rate limits, message templates, approval process. Research needed before building the WhatsApp alert channel.
2. **Facebook Graph API token refresh flow** -- Long-lived token exchange specifics, expiration handling. Research needed before building token management.
3. **TikTok Business API authentication** -- OAuth flow specifics, token refresh mechanism. Research needed before building TikTok integration.
4. **n8n-to-Supabase migration path** -- How to gradually move business logic from n8n to Edge Functions without disrupting existing data collection.
5. **Supabase connection pooling configuration** -- Needed when concurrent dashboard users exceed default connection limits. Research when scaling becomes relevant.
