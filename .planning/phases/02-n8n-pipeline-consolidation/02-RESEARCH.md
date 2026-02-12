# Phase 2: n8n Pipeline Consolidation - Research

**Researched:** 2026-02-12
**Domain:** n8n workflow automation, Facebook Graph API v23.0, TikTok Business API v1.3, Supabase data ingestion
**Confidence:** MEDIUM-HIGH

## Summary

Phase 2 replaces 8 fragile n8n workflows (2 controllers + 4 Facebook sub-workflows + 2 TikTok sub-workflows) with 4 robust, parameterized pipelines that write to the new normalized schema from Phase 1. The consolidation touches three core domains: (1) n8n workflow architecture using parameterized sub-workflows with the Execute Sub-workflow / Execute Sub-workflow Trigger node pair, (2) Facebook Graph API v23.0 with batch requests to reduce ~90 individual API calls to ~3 batch calls per BM, and (3) TikTok Business API v1.3 which requires 2 separate access tokens (no batch API available).

The key technical challenge is the dual-write validation period: new workflows must write to both old legacy tables AND new normalized tables simultaneously, producing identical data to the old 8 workflows. This requires careful mapping of the old per-BM table columns to the new unified `ad_accounts` / `spend_records` / `balance_snapshots` schema. The n8n Supabase node supports upsert operations natively, and the service role key (already configured as credential `lFpI1xaNAWw9fNa4`) bypasses RLS for pipeline writes. Cairo timezone handling must use Luxon's `DateTime.now().setZone('Africa/Cairo')` -- never manual UTC offset arithmetic.

The Facebook balance conversion factor of 100 (micro-units to EGP) has been confirmed from the existing workflow code analysis. Google Sheets writes are eliminated entirely -- Supabase becomes the single source of truth. Pipeline health is logged to the `pipeline_runs` table with structured error tracking per account.

**Primary recommendation:** Build 4 workflows (Controller, Facebook Ingestion, TikTok Ingestion 1, TikTok Ingestion 2) using n8n's Execute Sub-workflow pattern with typed inputs, Facebook batch API via HTTP Request nodes, and structured error logging to pipeline_runs on every execution.

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| n8n | Existing self-hosted instance | Workflow automation engine | Already deployed, all 8 workflows run here |
| n8n Supabase node | Built-in | Read/write to Supabase tables | Native upsert support, service role key auth |
| n8n HTTP Request node | Built-in | Facebook batch API calls, TikTok API calls | More flexible than Facebook Graph API node for batch requests |
| n8n Execute Sub-workflow node | Built-in | Controller calls ingestion workflows | Supports typed inputs via Execute Sub-workflow Trigger |
| n8n Code node (JavaScript) | Built-in | Data transformation, Luxon timezone | Full Luxon DateTime support for timezone handling |
| Facebook Graph API | v23.0 | Ad account data, insights, balance | Current version, standardizing from mixed v22/v23 |
| TikTok Business API | v1.3 | Advertiser info, balance, spend reports | Current version, verified from existing workflows |
| Supabase PostgreSQL | Existing instance | Target database for all writes | Phase 1 schema provides normalized target tables |
| Luxon | Built into n8n | Timezone-correct date handling | n8n's built-in date/time library, supports `setZone('Africa/Cairo')` |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| n8n Error Trigger node | Catch workflow failures | Global error handler workflow for pipeline failures |
| n8n Try/Catch nodes | Branch-level error handling | Per-account error capture within ingestion loops |
| n8n Facebook Graph API credential | Store Facebook System User token | Authentication for all Facebook API calls |
| n8n Header Auth credential | Store TikTok access tokens | Authentication for TikTok API calls (Access-Token header) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| n8n HTTP Request for FB batch | n8n Facebook Graph API node | FB Graph node does NOT support batch requests; HTTP Request is required |
| Separate TikTok workflows per token | Single TikTok workflow with dynamic credential | n8n credential selection via expressions is fragile; 2 separate workflows with 1 credential each is more reliable |
| n8n Code node for timezone | Manual UTC offset (+2) | Manual offsets are error-prone and the source of the existing UTC+3 bug |

## Architecture Patterns

### Workflow Structure (4 Workflows)

```
Workflow 1: Controller
  Schedule Trigger (every 3 hours)
  |
  +-> Execute Sub-workflow: Facebook Ingestion
  |     Input: { org_id, pipeline_name: 'facebook_ingestion' }
  |
  +-> Execute Sub-workflow: TikTok Ingestion 1
  |     Input: { org_id, pipeline_name: 'tiktok_ingestion_1' }
  |
  +-> Execute Sub-workflow: TikTok Ingestion 2
        Input: { org_id, pipeline_name: 'tiktok_ingestion_2' }

Workflow 2: Facebook Ingestion (1 API connection, all 4 BMs)
  Execute Sub-workflow Trigger (typed inputs)
  |
  +-> Create pipeline_run (status: 'running')
  +-> Read active Facebook ad_accounts from Supabase
  +-> Group accounts into batches of 50
  +-> For each batch:
  |     +-> Facebook Batch API: account info (name, balance, status, funding_source)
  |     +-> Facebook Batch API: daily insights (yesterday spend)
  |     +-> Facebook Batch API: MTD insights (month start to today)
  |     +-> Transform: normalize data, divide balance by 100
  |     +-> Upsert spend_records (new table)
  |     +-> Insert balance_snapshots (new table)
  |     +-> Update legacy tables (dual-write)
  +-> Update pipeline_run (status: 'success'/'partial'/'failed')
  +-> Return results to Controller

Workflow 3: TikTok Ingestion 1 (Token Group 1)
  Execute Sub-workflow Trigger (typed inputs)
  |
  +-> Create pipeline_run (status: 'running')
  +-> Read active TikTok ad_accounts for token group 1
  +-> For each account:
  |     +-> GET /advertiser/info/ (name, status)
  |     +-> GET /advertiser/balance/get/ (available funds)
  |     +-> GET /report/integrated/get/ (daily + MTD spend)
  |     +-> Transform: normalize data (no micro-unit conversion)
  |     +-> Upsert spend_records (new table)
  |     +-> Insert balance_snapshots (new table)
  |     +-> Update legacy tables (dual-write)
  +-> Update pipeline_run (status: 'success'/'partial'/'failed')

Workflow 4: TikTok Ingestion 2 (Token Group 2)
  [Same structure as Workflow 3, different credential]
```

### Pattern 1: Execute Sub-workflow with Typed Inputs

**What:** The controller passes structured data to each ingestion sub-workflow using n8n's Execute Sub-workflow node. The sub-workflow defines its expected inputs via the Execute Sub-workflow Trigger node.

**When to use:** Always -- every sub-workflow call from the controller.

**How it works:**
1. In the sub-workflow, add an "Execute Sub-workflow Trigger" node as the first node
2. Set Input data mode to "Define using fields below"
3. Define fields: `org_id` (string), `pipeline_name` (string)
4. In the controller, use "Execute Sub-workflow" node pointed at the sub-workflow by ID
5. Fill in the required input fields

**Source:** [n8n Sub-workflows docs](https://docs.n8n.io/flow-logic/subworkflows/), [Execute Sub-workflow node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/)

### Pattern 2: Facebook Batch API via HTTP Request

**What:** Combine up to 50 Facebook API calls into a single HTTP POST request. Instead of making 3 individual calls per account (account info + daily insights + MTD insights), batch all account-info calls together, all daily-insights calls together, etc.

**When to use:** All Facebook API calls. For ~30 accounts across 4 BMs, this reduces ~90 individual calls to ~3 batch calls per type (9 total calls instead of 90+).

**Request format:**
```
POST https://graph.facebook.com/v23.0/
Content-Type: application/x-www-form-urlencoded

access_token={token}&batch=[
  {"method":"GET","relative_url":"act_123?fields=name,balance,amount_spent,account_status,funding_source_details{display_string}"},
  {"method":"GET","relative_url":"act_456?fields=name,balance,amount_spent,account_status,funding_source_details{display_string}"},
  ...up to 50 requests
]
```

**Response format:**
```json
[
  {"code": 200, "headers": [...], "body": "{\"name\":\"Account 1\",\"balance\":150000,...}"},
  {"code": 200, "headers": [...], "body": "{\"name\":\"Account 2\",\"balance\":85000,...}"},
  ...
]
```

**Key details:**
- Maximum 50 requests per batch (hard limit, server-enforced)
- Each individual request in the batch counts toward rate limiting
- Access token can be set at root level (applies to all requests in batch)
- Individual requests can fail while others succeed -- check `code` field per item
- Response body is a JSON string that must be parsed

**Source:** [Facebook Batch API](https://www.sammyk.me/optimizing-request-queries-to-the-facebook-graph-api), [Batch limit: 50](https://github.com/facebook/facebook-java-business-sdk/issues/40)

### Pattern 3: Luxon Timezone Handling in n8n Code Nodes

**What:** Use Luxon's `DateTime.now().setZone('Africa/Cairo')` for all date/time calculations. Never use manual UTC offset arithmetic.

**When to use:** Every Code node that deals with dates -- calculating yesterday, start of month, current time checks, timestamps.

**Example (n8n Code node):**
```javascript
// Get Cairo "today" and "yesterday" for API date ranges
const cairoDt = DateTime.now().setZone('Africa/Cairo');
const today = cairoDt.toFormat('yyyy-MM-dd');
const yesterday = cairoDt.minus({ days: 1 }).toFormat('yyyy-MM-dd');
const startOfMonth = cairoDt.startOf('month').toFormat('yyyy-MM-dd');

// Cairo-aware timestamp for pipeline logging
const cairoTimestamp = cairoDt.toISO();

return [{ json: { today, yesterday, startOfMonth, cairoTimestamp } }];
```

**Source:** [n8n Luxon docs](https://docs.n8n.io/code/cookbook/luxon/), [n8n timezone configuration](https://docs.n8n.io/hosting/configuration/environment-variables/timezone-localization/)

### Pattern 4: Pipeline Run Lifecycle Logging

**What:** Every ingestion workflow creates a `pipeline_runs` row at start (status: 'running'), updates it throughout execution (incrementing accounts_processed/accounts_failed), and finalizes it at end (status: 'success'/'partial'/'failed').

**When to use:** Every ingestion sub-workflow execution.

**Flow:**
```
Start: INSERT pipeline_runs { status: 'running', started_at: now() }
       -> Get the pipeline_run_id
Each account success: increment accounts_processed
Each account failure: increment accounts_failed, append to error_log JSONB
End: UPDATE pipeline_runs {
  status: accounts_failed > 0 ? (accounts_processed > 0 ? 'partial' : 'failed') : 'success',
  completed_at: now()
}
```

### Pattern 5: Dual-Write to Old and New Tables

**What:** During the validation period, each ingestion workflow writes to both the new normalized tables AND the old per-BM legacy tables.

**When to use:** During the entire Phase 2 validation period, until data consistency is confirmed.

**Implementation:**
```
For each Facebook account:
  1. Write to NEW tables:
     - UPSERT spend_records (ad_account_id, date) with pipeline_run_id
     - INSERT balance_snapshots with pipeline_run_id
     - ad_accounts.current_* fields update automatically via triggers

  2. Write to OLD table (e.g., "Facebook Data Pull -- Main accounts"):
     - UPDATE row matching "Account ID" with same balance/spend values
     - This keeps the legacy system in sync during transition

  3. Do NOT write to Google Sheets (R3.4)
```

### Anti-Patterns to Avoid

- **Business logic in n8n Code nodes:** Keep Code nodes to simple data transformation (flatten, format, divide by 100). Alert evaluation, threshold checking, and notification routing belong in Supabase Edge Functions (Phase 4), not in n8n.
- **Fixed waits between API calls:** The old system uses 1-3 minute Wait nodes between sub-workflows. The new consolidated approach processes all accounts in batch within a single workflow. If rate-limited, use exponential backoff based on response headers, not fixed waits.
- **Hardcoded credentials:** All API tokens must be in n8n credential store. No tokens in Code node JavaScript, HTTP Request headers, or workflow JSON.
- **`continueRegularOutput` on errors:** The old system silently swallows errors. The new system must use Continue on Error output to capture and log failures per account while continuing the batch.
- **Google Sheets writes:** Do NOT write to Google Sheets from new workflows. This eliminates the dual data store problem (R3.4).
- **Manual UTC+3 offset:** Egypt is UTC+2. Always use Luxon `setZone('Africa/Cairo')`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone date arithmetic | Custom `getUTCHours() + 2` code | Luxon `DateTime.now().setZone('Africa/Cairo')` | Handles DST changes, locale-aware, no off-by-one errors |
| Facebook batch requests | Sequential HTTP calls per account | Facebook Batch API (POST with batch parameter) | Reduces 90+ calls to <10, better rate limit behavior |
| Supabase upsert logic | Custom check-then-insert/update | n8n Supabase node Upsert action | Native conflict resolution, atomic operation |
| Error aggregation | Custom JSON building in Code nodes | n8n Error Trigger + structured pipeline_runs logging | Centralized error capture, queryable from dashboard |
| Credential management | Tokens in Code nodes or HTTP headers | n8n Credential store (Facebook Graph API / Header Auth types) | Encrypted storage, no exposure in workflow JSON exports |
| Sub-workflow parameter passing | Hardcoded values or environment variables | n8n Execute Sub-workflow with typed inputs | Type-safe, visible in UI, validated at execution time |

**Key insight:** n8n provides built-in solutions for credentials, sub-workflow parameters, Supabase upsert, and error handling. The old 8 workflows reinvented several of these, creating fragility. The new 4 workflows should use n8n's native features wherever possible.

## Common Pitfalls

### Pitfall 1: Facebook Balance Micro-Unit Conversion
**What goes wrong:** Facebook returns `balance` and `amount_spent` in micro-units (hundredths of the account currency). For EGP, divide by 100. The old code had uncertainty about whether to use 100 or 10000.
**Why it happens:** Facebook documentation is ambiguous, and different currencies use different factors. The existing code contains an Arabic comment expressing this uncertainty.
**How to avoid:** The correct factor for EGP is 100 (100 piasters = 1 EGP). Verify by comparing one account's API response with the value shown in Facebook Ads Manager UI before deploying.
**Warning signs:** Dashboard shows balances that are 100x too large or 100x too small compared to Ads Manager.

### Pitfall 2: Cairo Timezone Bug (UTC+3 Instead of UTC+2)
**What goes wrong:** The old workflows use `getUTCHours() + 3` in multiple places. Egypt abolished DST in 2014 and is permanently UTC+2. All timestamps and date calculations are off by 1 hour.
**Why it happens:** Copy-paste from old code that assumed UTC+3.
**How to avoid:** Use Luxon `DateTime.now().setZone('Africa/Cairo')` exclusively. Search for any `+3` or `+2` manual offsets and replace with Luxon.
**Warning signs:** Spend dates misaligned (e.g., data for "tomorrow" appearing in today's records near midnight).

### Pitfall 3: Dual-Write Race Conditions
**What goes wrong:** If the new workflow and old workflow both try to update the same legacy table row simultaneously, one write may overwrite the other.
**Why it happens:** During transition, both old and new systems may be active for the same accounts.
**How to avoid:** Disable old workflows BEFORE enabling new ones for the same accounts. Or schedule them at different times (e.g., old workflows at :00, new at :30). The new workflows own the write path; old workflows should be disabled once new ones are validated.
**Warning signs:** Inconsistent data between old table and new table for the same account.

### Pitfall 4: TikTok API Requires Separate Tokens
**What goes wrong:** Trying to use one token for all TikTok accounts when some accounts are authorized under a different token.
**Why it happens:** The old system uses 2 different access tokens for 2 groups of TikTok accounts.
**How to avoid:** Maintain 2 separate TikTok ingestion workflows, each with its own credential. Do not attempt to merge them into one workflow with dynamic credential switching (n8n credential selection via expressions is fragile).
**Warning signs:** API returns "unauthorized" or "advertiser not found" for some TikTok accounts.

### Pitfall 5: Facebook Batch Response Parsing
**What goes wrong:** The `body` field in each batch response item is a JSON **string**, not a parsed object. If you don't parse it, you get string comparisons instead of numeric comparisons.
**Why it happens:** Facebook returns batch response bodies as serialized JSON strings within the response array.
**How to avoid:** In the n8n Code node processing batch responses, always `JSON.parse(item.body)` for each response item before accessing fields.
**Warning signs:** Balance values appear as strings, numeric comparisons fail, data appears as `[object Object]`.

### Pitfall 6: Missing Pipeline Run Finalization
**What goes wrong:** If a workflow errors out mid-execution, the pipeline_run row stays in 'running' status forever.
**Why it happens:** No error handler to catch unhandled exceptions and finalize the pipeline_run.
**How to avoid:** Use n8n's Error Trigger workflow pattern. Create a global error handler that catches any workflow failure and updates the pipeline_run to 'failed' status. Also set the workflow-level error workflow in workflow settings.
**Warning signs:** Dashboard shows pipelines stuck in 'running' status for hours/days.

### Pitfall 7: Spend Records Date Key Mismatch
**What goes wrong:** The `spend_records` table has a UNIQUE constraint on `(ad_account_id, date)`. If the date is calculated in different timezones (server UTC vs Cairo), the same day's data could generate different date keys, causing duplicate key errors or missed upserts.
**Why it happens:** n8n server may be in a different timezone than Cairo. If dates are not explicitly calculated in Cairo timezone, the date boundary shifts.
**How to avoid:** Always compute the spend date using Luxon `DateTime.now().setZone('Africa/Cairo').toFormat('yyyy-MM-dd')` BEFORE any database writes. Pass this date as a parameter to all downstream nodes.
**Warning signs:** Duplicate key errors, or spend records showing up for "tomorrow" when it should be "today".

### Pitfall 8: Google Sheets Dependency Not Fully Removed
**What goes wrong:** Old workflows wrote to Google Sheets. If the new workflows accidentally include Google Sheets nodes (copy-paste from old workflow), the eliminated dependency comes back.
**Why it happens:** Building new workflows by modifying copies of old ones.
**How to avoid:** Build new workflows from scratch. Do NOT copy old workflows and modify them. Verify zero Google Sheets nodes in all 4 new workflows before deployment.
**Warning signs:** Google Sheets API calls appearing in n8n execution logs.

## Code Examples

### Example 1: Facebook Batch Request in n8n HTTP Request Node

```javascript
// n8n Code node: Build batch request body for account info
// Input: array of Facebook account platform_account_ids
const accounts = $input.all().map(item => item.json);

const batchRequests = accounts.map(account => ({
  method: 'GET',
  relative_url: `${account.platform_account_id}?fields=name,balance,amount_spent,account_status,funding_source_details{display_string}`
}));

// Split into chunks of 50 (Facebook batch limit)
const chunks = [];
for (let i = 0; i < batchRequests.length; i += 50) {
  chunks.push(batchRequests.slice(i, i + 50));
}

return chunks.map(chunk => ({
  json: {
    batch: JSON.stringify(chunk)
  }
}));
```

Then in the HTTP Request node:
- Method: POST
- URL: `https://graph.facebook.com/v23.0/`
- Body Content Type: Form URL Encoded
- Body Parameters: `batch` = `{{ $json.batch }}`, `access_token` = (from credential)

### Example 2: Parse Facebook Batch Response and Normalize

```javascript
// n8n Code node: Parse batch response and normalize Facebook data
const batchResponse = $input.first().json; // Array of {code, headers, body}
const cairoNow = DateTime.now().setZone('Africa/Cairo');
const today = cairoNow.toFormat('yyyy-MM-dd');
const pipelineRunId = $('Create Pipeline Run').first().json.id;

const results = [];
const errors = [];

for (const item of batchResponse) {
  if (item.code !== 200) {
    errors.push({ code: item.code, body: item.body });
    continue;
  }

  const data = JSON.parse(item.body);
  const platformAccountId = data.id; // e.g., "act_123456"

  // Facebook balance is in micro-units: divide by 100 for EGP
  const balance = data.balance ? Number(data.balance) / 100 : null;
  const amountSpent = data.amount_spent ? Number(data.amount_spent) / 100 : null;

  results.push({
    platform_account_id: platformAccountId,
    account_name: data.name,
    balance: balance,
    amount_spent: amountSpent,
    status: data.account_status === 1 ? 'active' : 'disabled',
    funding_source_display: data.funding_source_details?.data?.[0]?.display_string || null,
    captured_at: cairoNow.toISO(),
    date: today,
    pipeline_run_id: pipelineRunId
  });
}

return results.map(r => ({ json: r }));
```

### Example 3: Cairo Date Ranges for API Calls

```javascript
// n8n Code node: Generate Cairo-aware date ranges for Facebook insights
const cairo = DateTime.now().setZone('Africa/Cairo');

const today = cairo.toFormat('yyyy-MM-dd');
const yesterday = cairo.minus({ days: 1 }).toFormat('yyyy-MM-dd');
const startOfMonth = cairo.startOf('month').toFormat('yyyy-MM-dd');

return [{
  json: {
    today,
    yesterday,
    startOfMonth,
    cairoTimestamp: cairo.toISO(),
    // For Facebook insights time_range parameter
    dailyTimeRange: JSON.stringify({
      since: yesterday,
      until: yesterday
    }),
    mtdTimeRange: JSON.stringify({
      since: startOfMonth,
      until: today
    })
  }
}];
```

### Example 4: Pipeline Run Lifecycle

```javascript
// n8n Code node: Create pipeline run entry (at workflow start)
// This feeds into a Supabase INSERT node for pipeline_runs table
const input = $('Execute Sub-workflow Trigger').first().json;

return [{
  json: {
    org_id: input.org_id || '00000000-0000-0000-0000-000000000001',
    pipeline_name: input.pipeline_name,
    status: 'running',
    started_at: DateTime.now().toISO(),
    accounts_processed: 0,
    accounts_failed: 0,
    error_log: null,
    metadata: {
      triggered_by: 'controller',
      n8n_execution_id: $execution.id
    }
  }
}];
```

```javascript
// n8n Code node: Finalize pipeline run (at workflow end)
const pipelineRunId = $('Create Pipeline Run').first().json.id;
const processed = $('Process Results').all();

let accountsProcessed = 0;
let accountsFailed = 0;
const errorLog = {};

for (const item of processed) {
  if (item.json.success) {
    accountsProcessed++;
  } else {
    accountsFailed++;
    errorLog[item.json.platform_account_id] = item.json.error;
  }
}

const status = accountsFailed === 0 ? 'success'
  : accountsProcessed > 0 ? 'partial'
  : 'failed';

return [{
  json: {
    id: pipelineRunId,
    status,
    completed_at: DateTime.now().toISO(),
    accounts_processed: accountsProcessed,
    accounts_failed: accountsFailed,
    error_log: Object.keys(errorLog).length > 0 ? errorLog : null
  }
}];
```

### Example 5: Supabase Upsert for spend_records

In the n8n Supabase node:
- **Operation:** Upsert
- **Table:** `spend_records`
- **Columns to send:** `org_id`, `ad_account_id`, `date`, `daily_spend`, `mtd_spend`, `currency`, `raw_data`, `pipeline_run_id`
- **Conflict columns (On Conflict):** `ad_account_id,date`

This ensures that re-running the pipeline for the same day updates existing records rather than creating duplicates.

### Example 6: TikTok API Calls (Individual, No Batch)

```javascript
// n8n Code node: Build TikTok API request parameters
const account = $input.first().json;
const cairo = DateTime.now().setZone('Africa/Cairo');
const today = cairo.toFormat('yyyy-MM-dd');
const yesterday = cairo.minus({ days: 1 }).toFormat('yyyy-MM-dd');
const startOfMonth = cairo.startOf('month').toFormat('yyyy-MM-dd');

return [{
  json: {
    // For /advertiser/info/
    infoUrl: `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/`,
    infoParams: {
      advertiser_ids: JSON.stringify([account.platform_account_id])
    },

    // For /advertiser/balance/get/
    balanceUrl: `https://business-api.tiktok.com/open_api/v1.3/advertiser/balance/get/`,
    balanceParams: {
      advertiser_ids: account.platform_account_id,
      ...(account.metadata?.bc_id ? { bc_id: account.metadata.bc_id } : {})
    },

    // For /report/integrated/get/ (daily spend)
    reportUrl: `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/`,
    dailyReportParams: {
      advertiser_id: account.platform_account_id,
      report_type: 'BASIC',
      data_level: 'AUCTION_ADVERTISER',
      dimensions: JSON.stringify(['stat_time_day']),
      metrics: JSON.stringify(['spend']),
      start_date: yesterday,
      end_date: yesterday,
      page_size: 10
    },
    mtdReportParams: {
      advertiser_id: account.platform_account_id,
      report_type: 'BASIC',
      data_level: 'AUCTION_ADVERTISER',
      dimensions: JSON.stringify(['stat_time_day']),
      metrics: JSON.stringify(['spend']),
      start_date: startOfMonth,
      end_date: today,
      page_size: 100
    }
  }
}];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 4 separate Facebook workflows per BM | 1 parameterized workflow for all BMs | This phase | 4x less maintenance, single point of update |
| Sequential individual API calls | Facebook Batch API (50 per request) | This phase | ~90 calls reduced to ~9, better rate limit usage |
| Google Sheets + Supabase dual write | Supabase only (single source of truth) | This phase | Eliminates data drift, removes Sheets API dependency |
| `getUTCHours() + 3` manual offset | Luxon `setZone('Africa/Cairo')` | This phase | Fixes 1-hour timezone bug, future-proof |
| Hardcoded tokens in HTTP headers | n8n Credential store | Phase 0 (pre-req) | Tokens not exposed in workflow JSON |
| `continueRegularOutput` error swallowing | Try/Catch + Error Trigger + pipeline_runs logging | This phase | All failures tracked, visible in dashboard |
| Facebook API v22.0 for insights | v23.0 for everything | This phase | Avoids v22 deprecation, consistent version |

**Deprecated/outdated:**
- **Google Sheets writes from n8n:** Eliminated entirely in this phase
- **Per-BM sub-workflows:** Replaced by parameterized single workflow
- **STATUS WORKFLOWS table:** Replaced by `pipeline_runs` table with richer schema
- **Facebook Graph API v22.0:** Standardized to v23.0

## Existing Schema Mapping (Old -> New)

This mapping is critical for dual-write and validation:

### Facebook Legacy Tables -> New Tables

| Old Column (e.g., "Facebook Data Pull -- Main accounts") | New Table.Column | Transform |
|----------------------------------------------------------|------------------|-----------|
| `Account ID` (e.g., "act_123456") | `ad_accounts.platform_account_id` | Direct copy |
| `Account name` | `ad_accounts.account_name` | Direct copy |
| `Available funds` (raw display string) | `balance_snapshots.available_funds` | Direct copy (text) |
| `Balance` (micro-units number) | `balance_snapshots.balance` | Divide by 100 |
| `Status` | `ad_accounts.status` | Normalize to lowercase (active/paused/disabled) |
| `Daily spending` (micro-units) | `spend_records.daily_spend` | Divide by 100 |
| `Total spent` (MTD, micro-units) | `spend_records.mtd_spend` | Divide by 100 |
| `Date` | `spend_records.date` | Cairo timezone date |
| (table name suffix: Main/Pasant/etc.) | `ad_accounts.business_manager` | Extract from table name |

### TikTok Legacy Tables -> New Tables

| Old Column (e.g., "Tiktok accounts") | New Table.Column | Transform |
|---------------------------------------|------------------|-----------|
| `Advertiser_id` | `ad_accounts.platform_account_id` | Direct copy |
| `Advertiser name` / `Account name` | `ad_accounts.account_name` | Direct copy |
| `Available funds` | `balance_snapshots.balance` | Parse numeric (NO micro-unit conversion) |
| `Daily spending` | `spend_records.daily_spend` | Parse numeric (NO micro-unit conversion) |
| `BC-ID` | `ad_accounts.metadata.bc_id` | Store in JSONB metadata |
| `Status` | `ad_accounts.status` | Normalize to lowercase |

### Key Differences Between Platforms

| Aspect | Facebook | TikTok |
|--------|----------|--------|
| Balance units | Micro-units (divide by 100) | Currency units (no conversion) |
| Batch API | Yes, 50 per batch | No batch API |
| API connections | 1 (System User token for all 4 BMs) | 2 (separate access tokens per group) |
| Account ID format | `act_XXXXXXXXXX` | Numeric advertiser ID |
| Business grouping | `business_manager` column | N/A (grouped by token) |
| Balance endpoint | `/v23.0/{act_id}?fields=balance` | `/v1.3/advertiser/balance/get/` |
| Spend endpoint | `/v23.0/{act_id}/insights` | `/v1.3/report/integrated/get/` |

## Open Questions

1. **n8n Version and Sub-workflow Input Support**
   - What we know: n8n Execute Sub-workflow Trigger supports typed inputs ("Define using fields below" mode). This is a core n8n feature.
   - What's unclear: The exact n8n version running on the self-hosted instance. Typed inputs for sub-workflows require a relatively recent version.
   - Recommendation: Check `n8n --version` on the server. If older than v1.0, consider upgrading before building new workflows.

2. **Facebook Credential Setup for All 4 BMs**
   - What we know: The old system uses a single Facebook Graph API credential (`x0GIizNGjoBNjkuZ`) shared across all 4 BMs. This suggests a single System User token with access to all 4 BMs.
   - What's unclear: Whether this single token has permission for all 4 Business Managers, or if separate tokens are needed per BM.
   - Recommendation: Verify in Facebook Business Manager. If one token covers all BMs, one credential is sufficient. If not, create 4 credentials and the Facebook workflow needs to dynamically select per BM.

3. **Disabled "Main accounts" Sub-Workflow**
   - What we know: The `Call 'Facebook Data Pull -- Main accounts'` node in the old Facebook Controller is disabled. The Main accounts workflow has its own Schedule Trigger.
   - What's unclear: Why it was disabled (intentional? bug? credential issue?).
   - Recommendation: Investigate before building new workflows. This may indicate the Main BM token is broken or the accounts are inactive.

4. **TikTok Token Lifetime and Refresh**
   - What we know: TikTok uses long-lived access tokens. Two distinct tokens are in use.
   - What's unclear: Exact expiration dates and whether auto-refresh is available.
   - Recommendation: Check token metadata in TikTok Business API developer portal. Set up expiration monitoring in the pipeline health system.

5. **Dual-Write Decommissioning Criteria**
   - What we know: Dual-write is temporary, for validation only.
   - What's unclear: Specific criteria for when to stop writing to old tables.
   - Recommendation: Run dual-write for minimum 1 week. Validate by comparing row counts and sampled values between old and new tables daily. Once 7 consecutive days show zero discrepancies, disable old table writes.

## Sources

### Primary (HIGH confidence)
- Direct analysis of 8 existing n8n workflow JSON files in project repository
- Phase 1 schema: `supabase/migrations/20260212000001_create_core_schema.sql` - verified table structures
- Phase 1 triggers: `supabase/migrations/20260212000003_create_triggers.sql` - verified denormalization triggers
- Phase 1 seed data: `supabase/migrations/20260212000004_seed_initial_data.sql` - confirmed org/platform IDs
- [n8n Sub-workflows documentation](https://docs.n8n.io/flow-logic/subworkflows/)
- [n8n Execute Sub-workflow node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/)
- [n8n Execute Sub-workflow Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger/)
- [n8n Supabase node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/)
- [n8n Error handling](https://docs.n8n.io/flow-logic/error-handling/)
- [n8n Luxon date/time](https://docs.n8n.io/code/cookbook/luxon/)

### Secondary (MEDIUM confidence)
- [n8n Error handling best practices](https://n8n-tutorial.com/tutorials/n8n/error-handling-and-debugging/n8n-error-handling-best-practices/) - verified patterns match n8n docs
- [Facebook batch request format](https://www.sammyk.me/optimizing-request-queries-to-the-facebook-graph-api) - cross-verified with multiple sources
- [Facebook batch limit: 50](https://github.com/facebook/facebook-java-business-sdk/issues/40) - confirmed by Facebook team response
- [n8n Supabase upsert patterns](https://dps.media/en/optimize-data-sync-with-supabase-upsert-node-for-n8n-comprehensive-solution/)
- [Supabase n8n integration](https://supabase.com/partners/integrations/n8n) - official partner page

### Tertiary (LOW confidence)
- TikTok Business API v1.3 exact rate limits - need live verification
- n8n version running on self-hosted instance - needs checking
- Facebook credential scope across 4 BMs - needs verification in Business Manager

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components are existing and verified from current project
- Architecture (workflow structure): HIGH - based on n8n official documentation for sub-workflows, verified code patterns
- Architecture (Facebook batch API): MEDIUM - format verified from multiple sources, but v23.0-specific batch behavior not independently verified against official FB docs
- Architecture (dual-write pattern): HIGH - straightforward Supabase upsert + legacy table update
- Pitfalls: HIGH - most pitfalls derived from direct analysis of existing workflow bugs (timezone, balance conversion, error swallowing)
- Code examples: MEDIUM - patterns verified against n8n docs but not tested against live instance

**Research date:** 2026-02-12
**Valid until:** 2026-03-14 (30 days - n8n and APIs are stable; Facebook API version should be re-checked quarterly)
