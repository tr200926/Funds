import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/auth/login-form'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Login | Targetspro Dashboard',
}

export default async function LoginPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/overview')
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use the email and password issued by the Targetspro ops team.
        </p>
      </div>
      <LoginForm />
    </div>
  )
}
