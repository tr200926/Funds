import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as path from 'node:path';
import * as process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGETSPRO_ORG_ID = '00000000-0000-0000-0000-000000000001';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Please copy .env.local.example to .env.local and fill in real values.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const runTimestamp = new Date();
const runDate = runTimestamp.toISOString().slice(0, 10);

type PlatformId = 'facebook' | 'tiktok';

type LegacyTableConfig = {
  table: string;
  platform: PlatformId;
  businessManager?: string | null;
};

type NormalizedAccountInput = {
  org_id: string;
  platform_id: PlatformId;
  platform_account_id: string;
  account_name: string;
  business_manager?: string | null;
  currency: string;
  status: 'active' | 'paused' | 'disabled' | 'archived';
  current_balance: number | null;
  current_daily_spend: number | null;
  current_mtd_spend: number | null;
  last_synced_at: string;
  metadata: Record<string, unknown>;
  tags: string[];
};

type NormalizedPayload = {
  account: NormalizedAccountInput;
  balanceText?: string | null;
  rawRow: Record<string, unknown>;
};

type TableStats = {
  table: string;
  total: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

const FACEBOOK_TABLES: LegacyTableConfig[] = [
  { table: 'Facebook Data Pull —Main accounts', platform: 'facebook', businessManager: 'Main' },
  { table: 'Facebook Data Pull —Pasant', platform: 'facebook', businessManager: 'Pasant' },
  { table: 'Facebook Data Pull —aligomarketing', platform: 'facebook', businessManager: 'aligomarketing' },
  { table: 'Facebook Data Pull —Xlerate', platform: 'facebook', businessManager: 'Xlerate' }
];

const TIKTOK_TABLES: LegacyTableConfig[] = [
  { table: 'Tiktok accounts', platform: 'tiktok' },
  { table: 'tiktok2', platform: 'tiktok' }
];

const LEGACY_TABLES: LegacyTableConfig[] = [...FACEBOOK_TABLES, ...TIKTOK_TABLES];

function sanitizeNumber(raw: unknown, { microUnits = false }: { microUnits?: boolean } = {}): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw === 'number') {
    const value = microUnits ? raw / 100 : raw;
    return Number(value.toFixed(2));
  }

  const cleaned = String(raw).replace(/[^0-9.-]/g, '');
  if (!cleaned) {
    return null;
  }

  const normalized = Number(cleaned);
  if (Number.isNaN(normalized)) {
    return null;
  }

  const value = microUnits ? normalized / 100 : normalized;
  return Number(value.toFixed(2));
}

function normalizeStatus(raw: unknown): 'active' | 'paused' | 'disabled' | 'archived' {
  if (!raw) return 'active';
  const lower = String(raw).trim().toLowerCase();
  if (['active', 'activated', 'running', 'active account'].includes(lower)) return 'active';
  if (['paused', 'pause', 'stopped'].includes(lower)) return 'paused';
  if (['disabled', 'blocked', 'suspended'].includes(lower)) return 'disabled';
  if (['archived', 'closed'].includes(lower)) return 'archived';
  return 'active';
}

function buildBaseAccount(config: LegacyTableConfig, platformAccountId: string, accountName: string): NormalizedAccountInput {
  return {
    org_id: TARGETSPRO_ORG_ID,
    platform_id: config.platform,
    platform_account_id: platformAccountId,
    account_name: accountName,
    business_manager: config.businessManager ?? null,
    currency: 'EGP',
    status: 'active',
    current_balance: null,
    current_daily_spend: null,
    current_mtd_spend: null,
    last_synced_at: runTimestamp.toISOString(),
    metadata: {
      legacy_table: config.table,
      migrated_at: runTimestamp.toISOString()
    },
    tags: [config.platform, config.businessManager ?? 'unassigned']
  };
}

function transformFacebookRow(row: Record<string, unknown>, config: LegacyTableConfig): NormalizedPayload | null {
  const platformAccountId = String(row['Account ID'] ?? '').trim();
  if (!platformAccountId) {
    return null;
  }

  const accountName = String(row['Account name'] ?? platformAccountId).trim();
  const balance = sanitizeNumber(row['Available funds'], { microUnits: true });
  const dailySpend = sanitizeNumber(row['Daily spending'], { microUnits: true });
  const status = normalizeStatus(row['Status']);

  const account = buildBaseAccount(config, platformAccountId, accountName);
  account.status = status;
  account.currency = 'EGP';
  account.current_balance = balance;
  account.current_daily_spend = dailySpend;
  account.metadata = {
    ...account.metadata,
    client_name: row['Client Name'] ?? null,
    client_number: row['Client number'] ?? null,
    legacy_status: row['Status'] ?? null
  };

  return {
    account,
    balanceText: typeof row['Available funds'] === 'string' ? (row['Available funds'] as string) : null,
    rawRow: row
  };
}

function transformTikTokRow(row: Record<string, unknown>, config: LegacyTableConfig): NormalizedPayload | null {
  const platformAccountId = String(row['Advertiser_id'] ?? row['Account ID'] ?? '').trim();
  if (!platformAccountId) {
    return null;
  }

  const accountName = String(row['Advertiser name'] ?? row['Account name'] ?? platformAccountId).trim();
  const balance = sanitizeNumber(row['Available funds']);
  const dailySpend = sanitizeNumber(row['Daily spending']);
  const status = normalizeStatus(row['Status']);

  const account = buildBaseAccount(config, platformAccountId, accountName);
  account.status = status;
  account.current_balance = balance;
  account.current_daily_spend = dailySpend;
  account.metadata = {
    ...account.metadata,
    bc_id: row['BC-ID'] ?? null,
    legacy_status: row['Status'] ?? null
  };

  return {
    account,
    balanceText: typeof row['Available funds'] === 'string' ? (row['Available funds'] as string) : null,
    rawRow: row
  };
}

async function upsertAdAccount(client: SupabaseClient, payload: NormalizedPayload) {
  if (isDryRun) {
    console.info('[dry-run] Upsert ad_account', payload.account.platform_account_id, payload.account.metadata);
    return { id: 'dry-run-id' };
  }

  const { data, error } = await client
    .from('ad_accounts')
    .upsert(payload.account, {
      onConflict: 'org_id,platform_id,platform_account_id'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to upsert ad account ${payload.account.platform_account_id}: ${error.message}`);
  }

  return data;
}

async function insertBalanceSnapshot(client: SupabaseClient, adAccountId: string, payload: NormalizedPayload) {
  if (!payload.account.current_balance && payload.account.current_balance !== 0) return;
  if (isDryRun) {
    console.info('[dry-run] Insert balance snapshot', adAccountId, payload.account.current_balance);
    return;
  }

  const snapshot = {
    org_id: payload.account.org_id,
    ad_account_id: adAccountId,
    balance: payload.account.current_balance,
    available_funds: payload.balanceText ?? null,
    currency: payload.account.currency,
    captured_at: runTimestamp.toISOString()
  };

  const { error } = await client.from('balance_snapshots').insert(snapshot);
  if (error) {
    throw new Error(`Failed to insert balance snapshot for ${payload.account.platform_account_id}: ${error.message}`);
  }
}

async function insertSpendRecord(client: SupabaseClient, adAccountId: string, payload: NormalizedPayload) {
  if (!payload.account.current_daily_spend && payload.account.current_daily_spend !== 0) return;
  if (isDryRun) {
    console.info('[dry-run] Insert spend record', adAccountId, payload.account.current_daily_spend);
    return;
  }

  const record = {
    org_id: payload.account.org_id,
    ad_account_id: adAccountId,
    date: runDate,
    daily_spend: payload.account.current_daily_spend,
    mtd_spend: payload.account.current_daily_spend,
    currency: payload.account.currency,
    raw_data: payload.rawRow
  };

  const { error } = await client.from('spend_records').insert(record);
  if (error) {
    throw new Error(`Failed to insert spend record for ${payload.account.platform_account_id}: ${error.message}`);
  }
}

async function migrateTable(config: LegacyTableConfig): Promise<TableStats> {
  const stats: TableStats = {
    table: config.table,
    total: 0,
    succeeded: 0,
    failed: 0,
    errors: []
  };

  console.info(`\nMigrating table: ${config.table}`);

  const { data, error } = await supabase.from(config.table).select('*');
  if (error) {
    stats.errors.push(`Failed to fetch table: ${error.message}`);
    stats.failed += 1;
    return stats;
  }

  const rows = data ?? [];
  for (const row of rows as Record<string, unknown>[]) {
    stats.total += 1;
    try {
      const normalized = config.platform === 'facebook'
        ? transformFacebookRow(row, config)
        : transformTikTokRow(row, config);

      if (!normalized) {
        stats.failed += 1;
        stats.errors.push('Skipped row with missing platform account id.');
        continue;
      }

      const adAccount = await upsertAdAccount(supabase, normalized);
      await insertBalanceSnapshot(supabase, adAccount.id, normalized);
      await insertSpendRecord(supabase, adAccount.id, normalized);

      stats.succeeded += 1;
    } catch (migrationError) {
      stats.failed += 1;
      const message = migrationError instanceof Error ? migrationError.message : String(migrationError);
      stats.errors.push(message);
      console.error(`Error migrating row: ${message}`);
    }
  }

  console.info(`Completed table ${config.table}: ${stats.succeeded}/${stats.total} succeeded.`);
  return stats;
}

async function main() {
  console.info(`Starting legacy migration ${isDryRun ? '(dry-run)' : ''} at ${runTimestamp.toISOString()}`);
  const summaries: TableStats[] = [];

  for (const config of LEGACY_TABLES) {
    const result = await migrateTable(config);
    summaries.push(result);
  }

  const totalAccounts = summaries.reduce((sum, stat) => sum + stat.total, 0);
  const totalSucceeded = summaries.reduce((sum, stat) => sum + stat.succeeded, 0);
  const totalFailed = summaries.reduce((sum, stat) => sum + stat.failed, 0);

  console.info('\nMigration Summary');
  for (const stat of summaries) {
    console.info(`- ${stat.table}: ${stat.succeeded}/${stat.total} migrated${stat.failed ? `, ${stat.failed} failed` : ''}`);
    if (stat.errors.length) {
      stat.errors.slice(0, 5).forEach((err) => console.warn(`  • ${err}`));
      if (stat.errors.length > 5) {
        console.warn(`  • ... ${stat.errors.length - 5} more errors`);
      }
    }
  }

  console.info(`Totals: ${totalSucceeded}/${totalAccounts} succeeded (${totalFailed} failed)`);

  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Unexpected failure during migration', error);
  process.exit(1);
});
