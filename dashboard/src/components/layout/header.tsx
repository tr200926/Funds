'use client'

import { useMemo, useState } from 'react'
import { LogOut, Menu, UserRound } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/hooks/use-user'

import { MobileNav } from './mobile-nav'

interface HeaderProps {
  user: {
    name: string
    email: string | null
    role: UserRole
  }
}

export function Header({ user }: HeaderProps) {
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const initials = useMemo(() => {
    return (
      user.name
        ?.split(' ')
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'TP'
    )
  }, [user.name])

  async function handleSignOut() {
    try {
      setIsSigningOut(true)
      await supabase.auth.signOut()
      window.location.href = '/login'
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <>
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
      <header className="flex h-16 items-center justify-between border-b bg-background px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open navigation</span>
          </Button>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Organization</p>
            <p className="text-base font-semibold">Targetspro</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden flex-col text-left text-sm lg:flex">
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground">{user.email ?? 'Signed in'}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">Role: {user.role}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    </>
  )
}
