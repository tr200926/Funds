import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { AlertRuleList } from '@/components/alerts/alert-rule-list'
import type { UserRole } from '@/hooks/use-user'

export const metadata = {
  title: 'Alert Rules | Targetspro',
  description: 'Configure when and how alerts are triggered',
}

export default async function AlertRulesPage() {
  const supabase = await createClient()

  // Authenticate
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Extract org_id and role from JWT app_metadata
  const orgId = (user.app_metadata?.org_id as string) ?? null
  const role = (user.app_metadata?.role as UserRole) ?? 'viewer'

  if (!orgId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Alert Rules</h1>
        <p className="text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  // Fetch ad accounts for the form's account selector
  const { data: adAccounts } = await supabase
    .from('ad_accounts')
    .select('id, account_name')
    .eq('org_id', orgId)
    .order('account_name')

  // Role-based access: only admin and manager can create/edit/toggle
  const canManage = role === 'admin' || role === 'manager'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alert Rules</h1>
        <p className="text-muted-foreground">
          Configure when and how alerts are triggered for your ad accounts.
        </p>
      </div>

      <AlertRuleList
        orgId={orgId}
        adAccounts={adAccounts ?? []}
        canManage={canManage}
      />
    </div>
  )
}
