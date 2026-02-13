'use client'

import { useEffect } from 'react'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  type AlertRuleFormValues,
  RULE_TYPES,
  RULE_TYPE_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  alertRuleFormSchema,
  getConfigSchema,
} from '@/lib/validators/alert-rules'
import type { RuleType } from '@/lib/validators/alert-rules'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AlertRuleFormProps {
  open: boolean
  mode: 'create' | 'edit'
  initialValues?: Partial<AlertRuleFormValues>
  adAccounts: { id: string; account_name: string }[]
  onSubmit: (
    values: AlertRuleFormValues & { config: Record<string, unknown> }
  ) => Promise<void>
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Shared types for config field sub-components
// ---------------------------------------------------------------------------

interface ConfigFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  errors: Record<string, { message?: string }>
}

// ---------------------------------------------------------------------------
// Dynamic config field renderers per rule type
// ---------------------------------------------------------------------------

function BalanceThresholdFields({ register, errors }: ConfigFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="config.threshold_value">Balance Threshold (EGP)</Label>
        <Input
          id="config.threshold_value"
          type="number"
          step="0.01"
          placeholder="e.g. 500"
          {...register('config.threshold_value')}
        />
        {errors['config.threshold_value'] && (
          <p className="mt-1 text-xs text-destructive">
            {errors['config.threshold_value'].message}
          </p>
        )}
      </div>
    </div>
  )
}

function SpendSpikeFields({ register, errors }: ConfigFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="config.percentage_increase">Spike Percentage (%)</Label>
        <Input
          id="config.percentage_increase"
          type="number"
          placeholder="e.g. 50"
          {...register('config.percentage_increase')}
        />
        {errors['config.percentage_increase'] && (
          <p className="mt-1 text-xs text-destructive">
            {errors['config.percentage_increase'].message}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="config.lookback_days">Lookback Days</Label>
        <Input
          id="config.lookback_days"
          type="number"
          placeholder="7"
          {...register('config.lookback_days')}
        />
        {errors['config.lookback_days'] && (
          <p className="mt-1 text-xs text-destructive">
            {errors['config.lookback_days'].message}
          </p>
        )}
      </div>
    </div>
  )
}

function TimeToDepletionFields({ register, errors }: ConfigFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="config.days_remaining">
          Days Until Depletion Threshold
        </Label>
        <Input
          id="config.days_remaining"
          type="number"
          placeholder="3"
          {...register('config.days_remaining')}
        />
        {errors['config.days_remaining'] && (
          <p className="mt-1 text-xs text-destructive">
            {errors['config.days_remaining'].message}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="config.lookback_days_depletion">Lookback Days</Label>
        <Input
          id="config.lookback_days_depletion"
          type="number"
          placeholder="7"
          {...register('config.lookback_days')}
        />
        {errors['config.lookback_days'] && (
          <p className="mt-1 text-xs text-destructive">
            {errors['config.lookback_days'].message}
          </p>
        )}
      </div>
    </div>
  )
}

function ZeroSpendFields({ register, errors }: ConfigFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="config.consecutive_days">
          Consecutive Zero-Spend Days
        </Label>
        <Input
          id="config.consecutive_days"
          type="number"
          placeholder="2"
          {...register('config.consecutive_days')}
        />
        {errors['config.consecutive_days'] && (
          <p className="mt-1 text-xs text-destructive">
            {errors['config.consecutive_days'].message}
          </p>
        )}
      </div>
    </div>
  )
}

function AccountStatusChangeFields() {
  return (
    <p className="text-sm text-muted-foreground">
      Triggers on any account status change. No additional configuration needed.
    </p>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertRuleForm({
  open,
  mode,
  initialValues,
  adAccounts,
  onSubmit,
  onCancel,
}: AlertRuleFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(alertRuleFormSchema),
    defaultValues: {
      name: '',
      description: '',
      rule_type: 'balance_threshold' as RuleType,
      severity: 'warning' as AlertRuleFormValues['severity'],
      cooldown_minutes: 180,
      ad_account_id: null as string | null | undefined,
      is_active: true,
      config: {} as Record<string, unknown>,
      ...initialValues,
    },
  })

  const ruleType = watch('rule_type') as RuleType
  const isActive = watch('is_active')

  // Reset form when opening dialog or switching between create/edit
  useEffect(() => {
    if (open) {
      reset({
        name: '',
        description: '',
        rule_type: 'balance_threshold' as RuleType,
        severity: 'warning' as AlertRuleFormValues['severity'],
        cooldown_minutes: 180,
        ad_account_id: null,
        is_active: true,
        config: {},
        ...initialValues,
      })
    }
  }, [open, initialValues, reset])

  // Flatten errors for config sub-fields so field renderers can read them
  const flatErrors: Record<string, { message?: string }> = {}
  const configErrors = errors.config as
    | Record<string, { message?: string }>
    | undefined
  if (configErrors) {
    for (const [key, val] of Object.entries(configErrors)) {
      if (val && typeof val === 'object' && 'message' in val) {
        flatErrors[`config.${key}`] = val as { message?: string }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onFormSubmit(values: any) {
    const typed = values as AlertRuleFormValues
    // Validate config separately with per-type schema
    const configSchema = getConfigSchema(typed.rule_type)
    const configResult = configSchema.safeParse(typed.config)
    if (!configResult.success) {
      // Surface config validation errors manually
      for (const issue of configResult.error.issues) {
        const path = issue.path.join('.')
        flatErrors[`config.${path}`] = { message: issue.message }
      }
      return
    }

    await onSubmit({
      ...typed,
      config: configResult.data as Record<string, unknown>,
    })
  }

  function renderConfigFields() {
    switch (ruleType) {
      case 'balance_threshold':
        return (
          <BalanceThresholdFields register={register} errors={flatErrors} />
        )
      case 'spend_spike':
        return <SpendSpikeFields register={register} errors={flatErrors} />
      case 'time_to_depletion':
        return (
          <TimeToDepletionFields register={register} errors={flatErrors} />
        )
      case 'zero_spend':
        return <ZeroSpendFields register={register} errors={flatErrors} />
      case 'account_status_change':
        return <AccountStatusChangeFields />
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Alert Rule' : 'Edit Alert Rule'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Configure a new alert rule to monitor your ad accounts.'
              : 'Update the alert rule configuration.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Low Balance Warning"
              {...register('name')}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe what this rule monitors..."
              rows={2}
              {...register('description')}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Rule Type */}
          <div>
            <Label>Rule Type</Label>
            <Select
              value={ruleType}
              onValueChange={(v) => {
                setValue('rule_type', v as RuleType)
                // Reset config when changing type
                setValue('config', {})
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select rule type" />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {RULE_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.rule_type && (
              <p className="mt-1 text-xs text-destructive">
                {errors.rule_type.message}
              </p>
            )}
          </div>

          {/* Severity */}
          <div>
            <Label>Severity</Label>
            <Select
              value={watch('severity') as string}
              onValueChange={(v) =>
                setValue('severity', v as AlertRuleFormValues['severity'])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((sev) => (
                  <SelectItem key={sev} value={sev}>
                    {SEVERITY_LABELS[sev]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cooldown */}
          <div>
            <Label htmlFor="cooldown_minutes">Cooldown (minutes)</Label>
            <Input
              id="cooldown_minutes"
              type="number"
              placeholder="180"
              {...register('cooldown_minutes')}
            />
            {errors.cooldown_minutes && (
              <p className="mt-1 text-xs text-destructive">
                {errors.cooldown_minutes.message}
              </p>
            )}
          </div>

          {/* Target Account */}
          <div>
            <Label>Target Account</Label>
            <Select
              value={(watch('ad_account_id') as string) ?? '__all__'}
              onValueChange={(v) =>
                setValue('ad_account_id', v === '__all__' ? null : v)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Accounts</SelectItem>
                {adAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="is_active"
              checked={isActive as boolean}
              onCheckedChange={(checked) => setValue('is_active', checked)}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>

          {/* Dynamic Config Section */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium">
              Configuration for {RULE_TYPE_LABELS[ruleType]}
            </p>
            {renderConfigFields()}
          </div>

          {/* Footer */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : mode === 'create'
                  ? 'Create Rule'
                  : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
