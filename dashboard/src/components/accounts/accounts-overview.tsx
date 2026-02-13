'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useRealtime } from '@/hooks/use-realtime'
import type { Tables } from '@/lib/database.types'

import { AccountsTable } from './accounts-table'
import { columns } from './columns'
import type { AdAccountWithPlatform } from './types'

type AdAccountRow = Tables<'ad_accounts'>

interface AccountsOverviewProps {
  initialData: AdAccountWithPlatform[]
}

export function AccountsOverview({ initialData }: AccountsOverviewProps) {
  const [accounts, setAccounts] = useState<AdAccountWithPlatform[]>(initialData)
  const platformMetadataRef = useRef(
    new Map<string, AdAccountWithPlatform['platforms'] | null>()
  )

  useEffect(() => {
    const map = platformMetadataRef.current
    initialData.forEach((account) => {
      if (account.platforms) {
        map.set(account.platform_id, account.platforms)
      }
    })
  }, [initialData])

  const withPlatformMeta = useCallback(
    (
      account: AdAccountRow,
      fallback?: AdAccountWithPlatform['platforms']
    ): AdAccountWithPlatform => {
      const cached = platformMetadataRef.current.get(account.platform_id)
      const resolved = fallback ?? cached ?? null

      if (resolved) {
        platformMetadataRef.current.set(account.platform_id, resolved)
      }

      return { ...account, platforms: resolved }
    },
    []
  )

  const handleInsert = useCallback(
    (inserted: AdAccountRow) => {
      setAccounts((prev) => {
        const exists = prev.some((account) => account.id === inserted.id)
        const enriched = withPlatformMeta(inserted)
        if (exists) {
          return prev.map((account) =>
            account.id === inserted.id ? enriched : account
          )
        }
        return [...prev, enriched]
      })
    },
    [withPlatformMeta]
  )

  const handleUpdate = useCallback(
    ({ new: updated }: { new: AdAccountRow }) => {
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === updated.id
            ? withPlatformMeta(updated, account.platforms)
            : account
        )
      )
    },
    [withPlatformMeta]
  )

  const handleDelete = useCallback((deleted: AdAccountRow) => {
    setAccounts((prev) => prev.filter((account) => account.id !== deleted.id))
  }, [])

  useRealtime<AdAccountRow>({
    table: 'ad_accounts',
    event: '*',
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
  })

  return <AccountsTable data={accounts} columns={columns} />
}
