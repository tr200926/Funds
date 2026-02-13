'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/lib/database.types'
import { useUser } from '@/hooks/use-user'
import type { AlertRuleFormValues } from '@/lib/validators/alert-rules'
import { RULE_TYPE_LABELS, type RuleType } from '@/lib/validators/alert-rules'
import { SeverityBadge } from './severity-badge'
import { AlertRuleForm } from './alert-rule-form'
import type { Severity } from '@/lib/validators/alert-rules'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertRule {
  id: string
  name: string
  description: string | null
  rule_type: RuleType
  severity: Severity
  cooldown_minutes: number
  is_active: boolean
  config: Record<string, unknown>
  ad_account_id: string | null
  org_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

interface AdAccountOption {
  id: string
  account_name: string
}

interface AlertRuleListProps {
  orgId: string
  adAccounts: AdAccountOption[]
  canManage: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCooldown(minutes: number): string {
  if (minutes >= 60) {
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
  }
  return `${minutes}m`
}

function getAccountName(
  accountId: string | null,
  accounts: AdAccountOption[]
): string {
  if (!accountId) return 'All Accounts'
  const found = accounts.find((a) => a.id === accountId)
  return found ? found.account_name : 'Unknown'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertRuleList({
  orgId,
  adAccounts,
  canManage,
}: AlertRuleListProps) {
  const router = useRouter()
  const { user } = useUser()
  const [rules, setRules] = useState<AlertRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)

  // Toast-like feedback (simple state-based)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const showFeedback = useCallback(
    (type: 'success' | 'error', message: string) => {
      setFeedback({ type, message })
      setTimeout(() => setFeedback(null), 3000)
    },
    []
  )

  // Fetch rules
  const fetchRules = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      showFeedback('error', `Failed to load rules: ${error.message}`)
      return
    }

    setRules((data ?? []) as AlertRule[])
    setIsLoading(false)
  }, [orgId, showFeedback])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  // Toggle active status
  async function handleToggle(ruleId: string, newActive: boolean) {
    const supabase = createClient()
    const { error } = await supabase
      .from('alert_rules')
      .update({ is_active: newActive })
      .eq('id', ruleId)

    if (error) {
      showFeedback('error', `Failed to update rule: ${error.message}`)
      return
    }

    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, is_active: newActive } : r))
    )
    showFeedback('success', newActive ? 'Rule activated' : 'Rule deactivated')
  }

  // Open create form
  function handleCreate() {
    setEditingRule(null)
    setFormMode('create')
    setFormOpen(true)
  }

  // Open edit form
  function handleEdit(rule: AlertRule) {
    setEditingRule(rule)
    setFormMode('edit')
    setFormOpen(true)
  }

  // Form submit handler
  async function handleFormSubmit(
    values: AlertRuleFormValues & { config: Record<string, unknown> }
  ) {
    const supabase = createClient()

    if (formMode === 'create') {
      const { error } = await supabase.from('alert_rules').insert({
        org_id: orgId,
        created_by: user?.id ?? null,
        name: values.name,
        description: values.description || null,
        rule_type: values.rule_type,
        severity: values.severity,
        cooldown_minutes: values.cooldown_minutes,
        ad_account_id: values.ad_account_id ?? null,
        is_active: values.is_active,
        config: values.config as unknown as Json,
      })

      if (error) {
        showFeedback('error', `Failed to create rule: ${error.message}`)
        return
      }

      showFeedback('success', 'Alert rule created')
    } else if (editingRule) {
      const { error } = await supabase
        .from('alert_rules')
        .update({
          name: values.name,
          description: values.description || null,
          rule_type: values.rule_type,
          severity: values.severity,
          cooldown_minutes: values.cooldown_minutes,
          ad_account_id: values.ad_account_id ?? null,
          is_active: values.is_active,
          config: values.config as unknown as Json,
        })
        .eq('id', editingRule.id)

      if (error) {
        showFeedback('error', `Failed to update rule: ${error.message}`)
        return
      }

      showFeedback('success', 'Alert rule updated')
    }

    setFormOpen(false)
    setEditingRule(null)

    // Refresh data
    startTransition(() => {
      router.refresh()
    })
    await fetchRules()
  }

  function handleCancel() {
    setFormOpen(false)
    setEditingRule(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading alert rules...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            feedback.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Header with create button */}
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={handleCreate} size="sm">
            <Plus className="mr-1 size-4" />
            Create Rule
          </Button>
        </div>
      )}

      {/* Rules table */}
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Rule Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Cooldown</TableHead>
              {canManage && <TableHead>Active</TableHead>}
              {canManage && <TableHead className="w-12">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 7 : 5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No alert rules configured.{' '}
                  {canManage && 'Create one to get started.'}
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    {RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type}
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={rule.severity} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getAccountName(rule.ad_account_id, adAccounts)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCooldown(rule.cooldown_minutes)}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) =>
                          handleToggle(rule.id, checked)
                        }
                        aria-label={`Toggle ${rule.name}`}
                      />
                    </TableCell>
                  )}
                  {canManage && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        aria-label={`Edit ${rule.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Form dialog */}
      {canManage && (
        <AlertRuleForm
          open={formOpen}
          mode={formMode}
          initialValues={
            editingRule
              ? {
                  name: editingRule.name,
                  description: editingRule.description ?? '',
                  rule_type: editingRule.rule_type,
                  severity: editingRule.severity,
                  cooldown_minutes: editingRule.cooldown_minutes,
                  ad_account_id: editingRule.ad_account_id,
                  is_active: editingRule.is_active,
                  config: editingRule.config,
                }
              : undefined
          }
          adAccounts={adAccounts}
          onSubmit={handleFormSubmit}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
