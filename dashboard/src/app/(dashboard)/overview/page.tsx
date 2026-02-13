import { redirect } from 'next/navigation'

import { AccountsOverview } from '@/components/accounts/accounts-overview'
import type { AdAccountWithPlatform } from '@/components/accounts/types'
import { createClient } from '@/lib/supabase/server'

export default async function OverviewPage() {
  const supabase = await createClient()
  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const { data, error } = await supabase
    .from('ad_accounts')
    .select('*, platforms(display_name, icon_url)')
    .neq('status', 'archived')
    .order('account_name')

  if (error) {
    throw error
  }

  const accounts = (data ?? []) as AdAccountWithPlatform[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Track balances, spend, and statuses across every connected ad account in
          real time.
        </p>
      </div>
      <AccountsOverview initialData={accounts} />
    </div>
  )
}
