import { z } from 'zod'

// ---------------------------------------------------------------------------
// Per-rule-type config schemas
// ---------------------------------------------------------------------------

export const balanceThresholdConfig = z.object({
  threshold_value: z.coerce.number().positive('Threshold must be positive'),
  currency: z.string().default('EGP'),
})

export const spendSpikeConfig = z.object({
  percentage_increase: z.coerce
    .number()
    .min(10, 'Min 10%')
    .max(500, 'Max 500%'),
  lookback_days: z.coerce.number().min(2).max(30).default(7),
})

export const timeToDepletionConfig = z.object({
  days_remaining: z.coerce.number().min(1).max(30).default(3),
  lookback_days: z.coerce.number().min(3).max(30).default(7),
})

export const zeroSpendConfig = z.object({
  consecutive_days: z.coerce.number().min(1).max(14).default(2),
})

export const accountStatusChangeConfig = z.object({})
// No config needed -- triggers on any status change

// ---------------------------------------------------------------------------
// Rule type enum values (kept in sync with database.types.ts)
// ---------------------------------------------------------------------------

export const RULE_TYPES = [
  'balance_threshold',
  'spend_spike',
  'time_to_depletion',
  'zero_spend',
  'account_status_change',
] as const

export type RuleType = (typeof RULE_TYPES)[number]

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  balance_threshold: 'Balance Threshold',
  spend_spike: 'Spend Spike',
  time_to_depletion: 'Time to Depletion',
  zero_spend: 'Zero Spend',
  account_status_change: 'Account Status Change',
}

// ---------------------------------------------------------------------------
// Severity enum values
// ---------------------------------------------------------------------------

export const SEVERITIES = ['info', 'warning', 'critical', 'emergency'] as const
export type Severity = (typeof SEVERITIES)[number]

export const SEVERITY_LABELS: Record<Severity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
  emergency: 'Emergency',
}

// ---------------------------------------------------------------------------
// Helper: get config schema for a given rule_type string
// ---------------------------------------------------------------------------

const CONFIG_SCHEMAS: Record<RuleType, z.ZodTypeAny> = {
  balance_threshold: balanceThresholdConfig,
  spend_spike: spendSpikeConfig,
  time_to_depletion: timeToDepletionConfig,
  zero_spend: zeroSpendConfig,
  account_status_change: accountStatusChangeConfig,
}

export function getConfigSchema(ruleType: string): z.ZodTypeAny {
  return CONFIG_SCHEMAS[ruleType as RuleType] ?? z.object({})
}

// ---------------------------------------------------------------------------
// Base alert rule form schema
// ---------------------------------------------------------------------------

export const alertRuleFormSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  rule_type: z.enum(RULE_TYPES),
  severity: z.enum(SEVERITIES),
  cooldown_minutes: z.coerce.number().min(5).max(1440).default(180),
  ad_account_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()), // validated separately per rule_type
})

export type AlertRuleFormValues = z.infer<typeof alertRuleFormSchema>
