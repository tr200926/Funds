'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Bell, LayoutDashboard } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/hooks/use-user'

export const NAV_ITEMS = [
  { label: 'Overview', href: '/overview', icon: LayoutDashboard },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Pipeline', href: '/pipeline', icon: Activity },
]

interface SidebarProps {
  role: UserRole
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r bg-background px-4 py-6 lg:flex lg:flex-col">
      <div>
        <p className="text-sm font-semibold text-primary">Targetspro</p>
        <p className="text-xs text-muted-foreground">Ad Spend Monitoring</p>
      </div>
      <nav className="mt-8 flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = pathname?.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-6 rounded-lg border bg-muted/50 p-3 text-xs">
        <p className="font-medium">Signed in as</p>
        <Badge variant={role === 'admin' ? 'default' : role === 'manager' ? 'secondary' : 'outline'}>
          {role}
        </Badge>
      </div>
    </aside>
  )
}
