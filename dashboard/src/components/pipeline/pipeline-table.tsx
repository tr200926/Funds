'use client'

import { useCallback, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useRealtime } from '@/hooks/use-realtime'
import type { Tables } from '@/lib/database.types'
import { formatCairoDate, formatRelativeTime } from '@/lib/format'

type PipelineRun = Tables<'pipeline_runs'>

interface PipelineTableProps {
  initialData: PipelineRun[]
}

const STATUS_STYLES: Record<PipelineRun['status'], string> = {
  running: 'border-sky-200 bg-sky-50 text-sky-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  partial: 'border-amber-200 bg-amber-50 text-amber-700',
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!startedAt || !completedAt) {
    return '--'
  }

  const start = new Date(startedAt).getTime()
  const end = new Date(completedAt).getTime()

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return '--'
  }

  const totalSeconds = Math.round((end - start) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

function stringifyErrorLog(log: PipelineRun['error_log']): string {
  if (log === null || log === undefined) {
    return ''
  }
  if (typeof log === 'string') {
    return log
  }
  try {
    return JSON.stringify(log, null, 2)
  } catch {
    return String(log)
  }
}

function withinLast24Hours(date: string): boolean {
  const timestamp = new Date(date).getTime()
  if (Number.isNaN(timestamp)) {
    return false
  }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  return timestamp >= cutoff
}

export function PipelineTable({ initialData }: PipelineTableProps) {
  const [runs, setRuns] = useState<PipelineRun[]>(initialData)

  const handleInsert = useCallback((inserted: PipelineRun) => {
    setRuns((prev) => {
      const existingIndex = prev.findIndex((run) => run.id === inserted.id)
      if (existingIndex !== -1) {
        const next = [...prev]
        next[existingIndex] = inserted
        return next
      }
      return [inserted, ...prev].slice(0, 50)
    })
  }, [])

  const handleUpdate = useCallback(({ new: updated }: { new: PipelineRun }) => {
    setRuns((prev) => prev.map((run) => (run.id === updated.id ? { ...run, ...updated } : run)))
  }, [])

  useRealtime<PipelineRun>({
    table: 'pipeline_runs',
    onInsert: handleInsert,
    onUpdate: handleUpdate,
  })

  const stats = useMemo(() => {
    const lastDayRuns = runs.filter((run) => withinLast24Hours(run.started_at))
    const total24h = lastDayRuns.length
    const success24h = lastDayRuns.filter((run) => run.status === 'success').length
    const failedAccounts24h = lastDayRuns.reduce(
      (sum, run) => sum + (run.accounts_failed ?? 0),
      0
    )
    const successRate = total24h > 0 ? `${Math.round((success24h / total24h) * 100)}%` : '--'
    const lastSuccess = runs.find((run) => run.status === 'success')
    const lastSuccessLabel = lastSuccess?.completed_at
      ? formatRelativeTime(lastSuccess.completed_at)
      : 'No success yet'

    return [
      {
        title: 'Runs (24h)',
        value: total24h.toString(),
        description: 'Executions started in the last day',
      },
      {
        title: 'Success Rate',
        value: successRate,
        description: total24h > 0 ? `${success24h} successful` : 'No data yet',
      },
      {
        title: 'Last Success',
        value: lastSuccessLabel,
        description: lastSuccess?.pipeline_name ?? 'Waiting for first success',
      },
      {
        title: 'Accounts Failed (24h)',
        value: failedAccounts24h.toString(),
        description: 'Impacted accounts over last day',
      },
    ]
  }, [runs])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-3">
              <CardDescription>{stat.title}</CardDescription>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Pipeline Runs</CardTitle>
          <CardDescription>Streaming updates directly from Supabase Realtime</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pipeline Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Processed</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No pipeline runs recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => (
                  <TableRow key={run.id}>
                  <TableCell className="font-medium">{run.pipeline_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLES[run.status]}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatCairoDate(run.started_at, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {run.completed_at
                      ? formatCairoDate(run.completed_at, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '--'}
                  </TableCell>
                  <TableCell>{formatDuration(run.started_at, run.completed_at)}</TableCell>
                  <TableCell>{run.accounts_processed ?? '--'}</TableCell>
                  <TableCell className={run.accounts_failed ? 'text-destructive font-semibold' : ''}>
                    {run.accounts_failed ?? '--'}
                  </TableCell>
                  <TableCell>
                    {run.error_log ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Error details</DialogTitle>
                            <DialogDescription>
                              {run.pipeline_name} – started {formatCairoDate(run.started_at)}
                            </DialogDescription>
                          </DialogHeader>
                          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs">
                            {stringifyErrorLog(run.error_log)}
                          </pre>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <span className="text-sm text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
