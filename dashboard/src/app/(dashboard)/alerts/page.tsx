import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AlertList } from '@/components/alerts/alert-list'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/hooks/use-user'

export default async function AlertsPage() {
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
  const userId = user.id

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alert History</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and manage triggered alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/alerts/rules">
              <Settings2 className="mr-1 h-4 w-4" />
              Alert Rules
            </Link>
          </Button>
        </div>
      </div>

      <AlertList orgId={orgId} userRole={role} userId={userId} />
    </div>
  )
}
