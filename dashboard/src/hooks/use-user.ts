'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'manager' | 'viewer'

interface UserProfile {
  user: User | null
  role: UserRole
  orgId: string | null
  isLoading: boolean
}

export function useUser(): UserProfile {
  const [profile, setProfile] = useState<UserProfile>({
    user: null,
    role: 'viewer',
    orgId: null,
    isLoading: true,
  })

  useEffect(() => {
    const supabase = createClient()

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const role = (user.app_metadata?.role as UserRole) ?? 'viewer'
        const orgId = (user.app_metadata?.org_id as string) ?? null
        setProfile({ user, role, orgId, isLoading: false })
      } else {
        setProfile({ user: null, role: 'viewer', orgId: null, isLoading: false })
      }
    }

    loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const role = (session.user.app_metadata?.role as UserRole) ?? 'viewer'
        const orgId = (session.user.app_metadata?.org_id as string) ?? null
        setProfile({ user: session.user, role, orgId, isLoading: false })
      } else {
        setProfile({ user: null, role: 'viewer', orgId: null, isLoading: false })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return profile
}
