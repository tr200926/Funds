import { redirect } from 'next/navigation'

import { ChannelList } from '@/components/notifications/channel-list'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/hooks/use-user'

export default async function NotificationsSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const role = (user.app_metadata?.role as UserRole) ?? 'viewer'
  const orgId = (user.app_metadata?.org_id as string) ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Notification Channels
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure where alert notifications are delivered
        </p>
      </div>

      <ChannelList orgId={orgId} userRole={role} />
    </div>
  )
}
