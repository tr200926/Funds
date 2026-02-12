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
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims

  if (error || !claims) {
    redirect('/login')
  }

  const role = (claims.app_metadata?.role as UserRole) ?? 'viewer'
  const fullName =
    (claims.user_metadata?.full_name as string | undefined) ??
    (claims.email as string | undefined) ??
    'User'
  const email = (claims.email as string | undefined) ?? null

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
