'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Eye, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { formatCairoDate } from '@/lib/format'

import { SeverityBadge } from './severity-badge'
import type { AlertWithJoins } from './alert-list'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertDelivery {
  id: string
  channel_type: string
  recipient: string
  status: string
  sent_at: string | null
  error_message: string | null
  created_at: string
}

interface AlertDetailDialogProps {
  alert: AlertWithJoins | null
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: 'admin' | 'manager' | 'viewer'
  userId: string
  onAction: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  acknowledged: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  dismissed: 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertDetailDialog({
  alert,
  open,
  onOpenChange,
  userRole,
  userId,
  onAction,
}: AlertDetailDialogProps) {
  const [deliveries, setDeliveries] = useState<AlertDelivery[]>([])
  const [loadingDeliveries, setLoadingDeliveries] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const canAct = userRole === 'admin' || userRole === 'manager'

  // Fetch deliveries when dialog opens
  useEffect(() => {
    if (!alert || !open) {
      setDeliveries([])
      return
    }

    async function loadDeliveries() {
      setLoadingDeliveries(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('alert_deliveries')
        .select('*')
        .eq('alert_id', alert!.id)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setDeliveries(data as AlertDelivery[])
      }
      setLoadingDeliveries(false)
    }

    loadDeliveries()
  }, [alert, open])

  const handleAction = useCallback(
    async (action: 'acknowledge' | 'dismiss' | 'resolve') => {
      if (!alert) return
      setActionLoading(action)

      const supabase = createClient()
      const updates: Record<string, unknown> = { status: action === 'acknowledge' ? 'acknowledged' : action === 'dismiss' ? 'dismissed' : 'resolved' }

      if (action === 'acknowledge') {
        updates.acknowledged_at = new Date().toISOString()
        updates.acknowledged_by = userId
      }

      if (action === 'resolve') {
        updates.resolved_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('alerts')
        .update(updates)
        .eq('id', alert.id)

      setActionLoading(null)

      if (error) {
        toast.error(`Failed to ${action} alert: ${error.message}`)
        return
      }

      toast.success(
        `Alert ${action === 'acknowledge' ? 'acknowledged' : action === 'dismiss' ? 'dismissed' : 'resolved'} successfully`
      )
      onAction()
    },
    [alert, userId, onAction]
  )

  if (!alert) return null

  const contextEntries = Object.entries(
    (alert.context_data ?? {}) as Record<string, unknown>
  ).filter(([, v]) => v !== null && v !== undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <span>{alert.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message */}
          <section>
            <h4 className="mb-1 text-sm font-medium text-muted-foreground">Message</h4>
            <p className="text-sm">{alert.message}</p>
          </section>

          <Separator />

          {/* Account info */}
          <section className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">Account</h4>
              <p className="text-sm font-medium">
                {alert.ad_accounts?.account_name ?? 'Unknown'}
              </p>
              <p className="text-xs text-muted-foreground">
                {alert.ad_accounts?.platform_id} &middot; {alert.ad_accounts?.currency}
              </p>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">Rule</h4>
              <p className="text-sm font-medium">
                {alert.alert_rules?.name ?? 'Unknown'}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {alert.alert_rules?.rule_type?.replaceAll('_', ' ') ?? ''}
              </p>
            </div>
          </section>

          {/* Context data */}
          {contextEntries.length > 0 && (
            <>
              <Separator />
              <section>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">Context</h4>
                <div className="grid grid-cols-2 gap-2">
                  {contextEntries.map(([key, value]) => (
                    <div key={key} className="rounded-md bg-muted/50 px-3 py-2">
                      <span className="text-xs font-medium text-muted-foreground capitalize">
                        {key.replaceAll('_', ' ')}
                      </span>
                      <p className="text-sm font-medium">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Delivery history */}
          <Separator />
          <section>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Delivery History
            </h4>
            {loadingDeliveries ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading deliveries...
              </div>
            ) : deliveries.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">No deliveries recorded.</p>
            ) : (
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{d.channel_type}</span>
                      <span className="text-muted-foreground">{d.recipient}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] ?? ''}`}
                      >
                        {d.status}
                      </span>
                      {d.sent_at && (
                        <span className="text-xs text-muted-foreground">
                          {formatCairoDate(d.sent_at)}
                        </span>
                      )}
                    </div>
                    {d.error_message && (
                      <p className="mt-1 w-full text-xs text-destructive">
                        {d.error_message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Timeline */}
          <Separator />
          <section>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">Timeline</h4>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatCairoDate(alert.created_at)}</span>
              </div>
              {alert.acknowledged_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Acknowledged</span>
                  <span>{formatCairoDate(alert.acknowledged_at)}</span>
                </div>
              )}
              {alert.resolved_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Resolved</span>
                  <span>{formatCairoDate(alert.resolved_at)}</span>
                </div>
              )}
            </div>
          </section>

          {/* Action buttons */}
          {canAct && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                {alert.status === 'pending' && (
                  <Button
                    size="sm"
                    onClick={() => handleAction('acknowledge')}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'acknowledge' ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Eye className="mr-1 h-3 w-3" />
                    )}
                    Acknowledge
                  </Button>
                )}
                {(alert.status === 'pending' || alert.status === 'acknowledged') && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAction('resolve')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === 'resolve' ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction('dismiss')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === 'dismiss' ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <XCircle className="mr-1 h-3 w-3" />
                      )}
                      Dismiss
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
