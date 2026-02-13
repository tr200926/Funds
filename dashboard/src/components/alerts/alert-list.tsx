'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUpDown, Bell } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useRealtime } from '@/hooks/use-realtime'
import { createClient } from '@/lib/supabase/client'
import { formatCairoDate } from '@/lib/format'

import { SeverityBadge } from './severity-badge'
import { AlertDetailDialog } from './alert-detail-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertWithJoins {
  id: string
  org_id: string
  ad_account_id: string
  alert_rule_id: string
  severity: 'info' | 'warning' | 'critical' | 'emergency'
  status: 'pending' | 'acknowledged' | 'resolved' | 'dismissed'
  title: string
  message: string
  context_data: Record<string, unknown>
  created_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  resolved_at: string | null
  ad_accounts: {
    account_name: string
    platform_id: string
    currency: string
  } | null
  alert_rules: {
    name: string
    rule_type: string
  } | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  acknowledged: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  dismissed: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
}

const SEVERITY_ORDER: Record<string, number> = {
  info: 0,
  warning: 1,
  critical: 2,
  emergency: 3,
}

const TIME_RANGES = [
  { label: 'Last 24h', value: '1' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'All time', value: 'all' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AlertListProps {
  orgId: string
  userRole: 'admin' | 'manager' | 'viewer'
  userId: string
}

export function AlertList({ orgId, userRole, userId }: AlertListProps) {
  const [alerts, setAlerts] = useState<AlertWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])
  const [selectedAlert, setSelectedAlert] = useState<AlertWithJoins | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<string>('7')

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    const supabase = createClient()
    let query = supabase
      .from('alerts')
      .select('*, ad_accounts(account_name, platform_id, currency), alert_rules(name, rule_type)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (timeRange !== 'all') {
      const daysAgo = new Date()
      daysAgo.setDate(daysAgo.getDate() - Number(timeRange))
      query = query.gte('created_at', daysAgo.toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch alerts:', error)
      return
    }

    setAlerts((data ?? []) as AlertWithJoins[])
    setLoading(false)
  }, [orgId, timeRange])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  // Real-time: prepend new alerts
  useRealtime<AlertWithJoins>({
    table: 'alerts',
    event: 'INSERT',
    filter: `org_id=eq.${orgId}`,
    onInsert: useCallback(
      (newAlert: AlertWithJoins) => {
        // The realtime event won't have joins, so we refetch to get full data
        fetchAlerts()
      },
      [fetchAlerts]
    ),
  })

  // Client-side filtering
  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      return true
    })
  }, [alerts, severityFilter, statusFilter])

  // Columns
  const columns: ColumnDef<AlertWithJoins>[] = useMemo(
    () => [
      {
        accessorKey: 'severity',
        header: 'Severity',
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
        sortingFn: (a, b) => {
          return (
            (SEVERITY_ORDER[a.original.severity] ?? 0) -
            (SEVERITY_ORDER[b.original.severity] ?? 0)
          )
        },
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <button
            className="text-left font-medium text-primary hover:underline"
            onClick={() => {
              setSelectedAlert(row.original)
              setDialogOpen(true)
            }}
          >
            {row.original.title}
          </button>
        ),
      },
      {
        id: 'account',
        header: 'Account',
        accessorFn: (row) => row.ad_accounts?.account_name ?? 'Unknown',
        cell: ({ getValue }) => (
          <span className="text-sm">{getValue() as string}</span>
        ),
      },
      {
        id: 'rule',
        header: 'Rule',
        accessorFn: (row) => row.alert_rules?.name ?? 'Unknown',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.original.status] ?? ''}`}
          >
            {row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
          </span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Time
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatCairoDate(row.original.created_at)}
          </span>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const handleAction = useCallback(() => {
    fetchAlerts()
    setDialogOpen(false)
  }, [fetchAlerts])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="emergency">Emergency</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(severityFilter !== 'all' || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSeverityFilter('all')
              setStatusFilter('all')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <Bell className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">No alerts yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Alerts will appear here when rules are triggered.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Dialog */}
      <AlertDetailDialog
        alert={selectedAlert}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userRole={userRole}
        userId={userId}
        onAction={handleAction}
      />
    </div>
  )
}
