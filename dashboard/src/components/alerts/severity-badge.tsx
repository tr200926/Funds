import { cn } from '@/lib/utils'
import type { Severity } from '@/lib/validators/alert-rules'

const SEVERITY_STYLES: Record<Severity, string> = {
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  emergency: 'bg-red-200 text-red-900 font-bold dark:bg-red-900/60 dark:text-red-200',
}

interface SeverityBadgeProps {
  severity: Severity
  className?: string
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        SEVERITY_STYLES[severity],
        className
      )}
    >
      {severity.toUpperCase()}
    </span>
  )
}
