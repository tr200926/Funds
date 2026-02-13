'use client'

import Link from 'next/link'
import { ArrowUpDown } from 'lucide-react'
import type { ColumnDef, SortingFn } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  calcTimeToDepletion,
  formatCurrency,
  formatRelativeTime,
} from '@/lib/format'
import { cn } from '@/lib/utils'

import type { AdAccountWithPlatform } from './types'

const numericStringSortingFn: SortingFn<AdAccountWithPlatform> = (
  rowA,
  rowB,
  columnId
) => {
  const parse = (value: unknown) => {
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }

    if (value === null || value === undefined) {
      return 0
    }

    if (typeof value === 'number') {
      return value
    }

    return 0
  }

  const a = parse(rowA.getValue(columnId))
  const b = parse(rowB.getValue(columnId))

  if (a === b) return 0
  return a > b ? 1 : -1
}

const PLATFORM_LABELS: Record<string, { short: string; long: string }> = {
  facebook: { short: 'FB', long: 'Facebook' },
  tiktok: { short: 'TT', long: 'TikTok' },
}

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200',
  paused: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100',
  disabled: 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100',
  archived: 'bg-muted text-muted-foreground',
}

function getPlatformLabel(account: AdAccountWithPlatform) {
  const fallback = PLATFORM_LABELS[account.platform_id] ?? {
    short: account.platform_id.toUpperCase(),
    long: account.platform_id,
  }

  return {
    short: account.platforms?.display_name?.slice(0, 2).toUpperCase() ?? fallback.short,
    long: account.platforms?.display_name ?? fallback.long,
  }
}

export const columns: ColumnDef<AdAccountWithPlatform>[] = [
  {
    accessorKey: 'platform_id',
    header: 'Platform',
    enableSorting: false,
    enableColumnFilter: true,
    cell: ({ row }) => {
      const platform = getPlatformLabel(row.original)

      return (
        <Badge variant="outline" className="border-transparent bg-muted/80">
          {platform.short}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'account_name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="pl-0"
        onClick={() =>
          column.toggleSorting(column.getIsSorted() === 'asc')
        }
      >
        Account
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="flex min-w-48 flex-col">
        <Link
          href={`/accounts/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.account_name}
        </Link>
        {row.original.platforms?.display_name && (
          <span className="text-xs text-muted-foreground">
            {row.original.platforms.display_name}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'business_manager',
    header: 'Business Manager',
    enableColumnFilter: true,
    cell: ({ row }) => row.original.business_manager ?? '—',
  },
  {
    accessorKey: 'current_balance',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="pl-0"
        onClick={() =>
          column.toggleSorting(column.getIsSorted() === 'asc')
        }
      >
        Balance
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    sortingFn: numericStringSortingFn,
    cell: ({ row }) =>
      formatCurrency(row.original.current_balance, row.original.currency),
  },
  {
    accessorKey: 'current_daily_spend',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="pl-0"
        onClick={() =>
          column.toggleSorting(column.getIsSorted() === 'asc')
        }
      >
        Daily Spend
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    sortingFn: numericStringSortingFn,
    cell: ({ row }) =>
      formatCurrency(row.original.current_daily_spend, row.original.currency),
  },
  {
    accessorKey: 'current_mtd_spend',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="pl-0"
        onClick={() =>
          column.toggleSorting(column.getIsSorted() === 'asc')
        }
      >
        MTD Spend
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    sortingFn: numericStringSortingFn,
    cell: ({ row }) =>
      formatCurrency(row.original.current_mtd_spend, row.original.currency),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableColumnFilter: true,
    cell: ({ row }) => {
      const status = row.original.status
      return (
        <Badge
          variant="outline"
          className={cn('capitalize', statusStyles[status] ?? '')}
        >
          {status}
        </Badge>
      )
    },
  },
  {
    id: 'days_left',
    header: 'Days Left',
    sortingFn: numericStringSortingFn,
    cell: ({ row }) => {
      const days = calcTimeToDepletion(
        row.original.current_balance,
        row.original.current_daily_spend
      )

      if (days === null) {
        return <span className="text-muted-foreground">—</span>
      }

      const rounded = Math.floor(days)
      const badgeVariant =
        rounded <= 3
          ? 'destructive'
          : rounded <= 7
            ? 'secondary'
            : 'outline'

      const extraClasses =
        rounded <= 3
          ? ''
          : rounded <= 7
            ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-50'
            : ''

      return (
        <Badge
          variant={badgeVariant}
          className={cn('font-medium', extraClasses)}
        >
          {rounded}d
        </Badge>
      )
    },
  },
  {
    accessorKey: 'last_synced_at',
    header: 'Last Sync',
    cell: ({ row }) => {
      if (!row.original.last_synced_at) {
        return <span className="text-muted-foreground">Never</span>
      }

      return (
        <span className="text-muted-foreground">
          {formatRelativeTime(row.original.last_synced_at)}
        </span>
      )
    },
  },
]

export type { AdAccountWithPlatform }
