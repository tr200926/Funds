import { redirect } from 'next/navigation'

import { WhatsAppOptIn } from '@/components/notifications/whatsapp-opt-in'
import { createClient } from '@/lib/supabase/server'

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Fetch user profile for WhatsApp settings
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, settings')
    .eq('id', user.id)
    .single()

  const settings = (profile?.settings ?? {}) as Record<string, unknown>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Profile Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your personal preferences and notification settings
        </p>
      </div>

      {/* General profile info */}
      <div className="space-y-1 rounded-lg border p-4">
        <p className="text-sm font-medium">
          {profile?.full_name ?? user.email ?? 'User'}
        </p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </div>

      {/* WhatsApp Alerts opt-in section */}
      <WhatsAppOptIn
        userId={user.id}
        initialOptIn={(settings.whatsapp_opt_in as boolean) ?? false}
        initialPhone={(settings.whatsapp_phone as string) ?? ''}
      />
    </div>
  )
}
