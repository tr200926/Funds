import { redirect } from 'next/navigation'

import { WhatsAppOptIn } from '@/components/notifications/whatsapp-opt-in'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role, settings')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    console.error('Failed to load profile settings:', profileError)
    throw new Error('Unable to load profile information')
  }

  const settings = (profile.settings as Record<string, unknown> | null) ?? {}
  const initialOptIn = Boolean((settings as Record<string, unknown>).whatsapp_opt_in)
  const initialPhone =
    typeof (settings as Record<string, unknown>).whatsapp_phone === 'string'
      ? ((settings as Record<string, unknown>).whatsapp_phone as string)
      : ''

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Update your account details and control WhatsApp alert preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
            <CardDescription>Synced from Supabase Auth.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Name</p>
              <p className="text-sm font-medium">{profile.full_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Email</p>
              <p className="text-sm font-medium">{user.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Role</p>
              <p className="text-sm font-medium capitalize">{profile.role}</p>
            </div>
          </CardContent>
        </Card>

        <WhatsAppOptIn
          userId={user.id}
          initialOptIn={initialOptIn}
          initialPhone={initialPhone}
        />
      </div>
    </div>
  )
}
