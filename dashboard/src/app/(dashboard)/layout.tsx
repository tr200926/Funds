import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/hooks/use-user'

interface DashboardLayoutProps {
  children: ReactNode
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const role = (user.app_metadata?.role as UserRole) ?? 'viewer'
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    'User'
  const email = user.email ?? null

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="flex min-h-screen">
        <Sidebar role={role} />
        <div className="flex flex-1 flex-col">
          <Header user={{ name: fullName, email, role }} />
          <main className="flex-1 bg-background px-4 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
