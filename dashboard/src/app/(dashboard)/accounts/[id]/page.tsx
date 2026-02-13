import { redirect, notFound } from 'next/navigation'

import type { AdAccountWithPlatform } from '@/components/accounts/types'
import { BalanceChart } from '@/components/charts/balance-chart'
import { SpendChart } from '@/components/charts/spend-chart'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  calcTimeToDepletion,
  formatCairoDate,
  formatCurrency,
} from '@/lib/format'
import type { Tables } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

type SpendRecord = Tables<'spend_records'>
type BalanceSnapshot = Tables<'balance_snapshots'>
type AlertRow = Tables<'alerts'>

interface AccountDetailPageProps {
  params: Promise<{ id: string }>
}

const STATUS_VARIANTS: Record<AdAccountWithPlatform['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  paused: 'secondary',
  disabled: 'destructive',
  archived: 'outline',
}

const SEVERITY_VARIANTS: Record<AlertRow['severity'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  info: 'outline',
  warning: 'secondary',
  critical: 'destructive',
  emergency: 'destructive',
}

function formatFundingValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—'
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (typeof value === 'number') {
    return value.toString()
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

function getFundingSource(metadata: AdAccountWithPlatform['metadata']) {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null
  }

  const record = metadata as Record<string, unknown>
  const funding = record['funding_source']

  if (!funding || typeof funding !== 'object' || Array.isArray(funding)) {
    return null
  }

  return funding as Record<string, unknown>
}

export default async function AccountDetailPage({ params }: AccountDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const [accountResult, spendResult, balanceResult, alertsResult] = await Promise.all([
    supabase
      .from('ad_accounts')
      .select('*, platforms(display_name, icon_url)')
      .eq('id', id)
      .single(),
    supabase
      .from('spend_records')
      .select('*')
      .eq('ad_account_id', id)
      .order('date', { ascending: false })
      .limit(30),
    supabase
      .from('balance_snapshots')
      .select('*')
      .eq('ad_account_id', id)
      .order('captured_at', { ascending: false })
      .limit(50),
    supabase
      .from('alerts')
      .select('*')
      .eq('ad_account_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (accountResult.error) {
    if ('code' in accountResult.error && accountResult.error.code === 'PGRST116') {
      notFound()
    }
    throw accountResult.error
  }

  const account = accountResult.data as AdAccountWithPlatform | null

  if (!account) {
    notFound()
  }

  if (spendResult.error) {
    throw spendResult.error
  }
  if (balanceResult.error) {
    throw balanceResult.error
  }
  if (alertsResult.error) {
    throw alertsResult.error
  }

  const spendRecords = (spendResult.data ?? []) as SpendRecord[]
  const balanceSnapshots = (balanceResult.data ?? []) as BalanceSnapshot[]
  const alerts = (alertsResult.data ?? []) as AlertRow[]
  const fundingSource = getFundingSource(account.metadata)
  const timeToDepletionDays = calcTimeToDepletion(
    account.current_balance,
    account.current_daily_spend
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{account.account_name}</h1>
        <p className="text-sm text-muted-foreground">
          Deep dive into spend trends, balances, and alerts for this ad account.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-2xl font-semibold">{account.account_name}</CardTitle>
            <Badge variant="outline">
              {account.platforms?.display_name ?? account.platform_id.toUpperCase()}
            </Badge>
            <Badge variant={STATUS_VARIANTS[account.status]}>
              {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
            </Badge>
          </div>
          <CardDescription>
            {account.business_manager ? (
              <span>Business Manager: {account.business_manager}</span>
            ) : (
              <span>No business manager on file</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-muted-foreground">Current Balance</dt>
              <dd className="text-xl font-semibold">
                {formatCurrency(account.current_balance, account.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Daily Spend</dt>
              <dd className="text-xl font-semibold">
                {formatCurrency(account.current_daily_spend, account.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">MTD Spend</dt>
              <dd className="text-xl font-semibold">
                {formatCurrency(account.current_mtd_spend, account.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Currency</dt>
              <dd className="text-xl font-semibold">{account.currency}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Time to Depletion</dt>
              <dd className="text-lg font-semibold">
                {timeToDepletionDays
                  ? `${timeToDepletionDays.toFixed(1)} days`
                  : 'Not enough spend data'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Last Synced</dt>
              <dd className="text-lg font-semibold">
                {account.last_synced_at
                  ? formatCairoDate(account.last_synced_at, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Never'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Platform Account ID</dt>
              <dd className="text-lg font-semibold">{account.platform_account_id}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Status Updated</dt>
              <dd className="text-lg font-semibold">
                {formatCairoDate(account.updated_at, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Spend Trend</CardTitle>
            <CardDescription>Last 30 days of spend</CardDescription>
          </CardHeader>
          <CardContent>
            <SpendChart data={spendRecords} currency={account.currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Balance History</CardTitle>
            <CardDescription>Last 50 captured balances</CardDescription>
          </CardHeader>
          <CardContent>
            <BalanceChart data={balanceSnapshots} currency={account.currency} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alert History</CardTitle>
          <CardDescription>Most recent alerts scoped to this ad account</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts for this account.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Badge variant={SEVERITY_VARIANTS[alert.severity]} className="capitalize">
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{alert.title}</TableCell>
                    <TableCell className="max-w-lg text-sm">
                      {alert.message.length > 100
                        ? `${alert.message.slice(0, 100)}…`
                        : alert.message}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCairoDate(alert.created_at, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funding Source</CardTitle>
          <CardDescription>Details extracted from the account metadata</CardDescription>
        </CardHeader>
        <CardContent>
          {fundingSource ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              {Object.entries(fundingSource).map(([key, value]) => (
                <div key={key} className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">
                    {key.replace(/_/g, ' ')}
                  </dt>
                  <dd className="text-base font-medium">{formatFundingValue(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No funding source data.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
