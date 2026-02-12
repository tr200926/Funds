'use client'

import { useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface UseRealtimeOptions<T> {
  table: string
  schema?: string
  event?: PostgresChangeEvent
  filter?: string
  onInsert?: (payload: T) => void
  onUpdate?: (payload: { old: T; new: T }) => void
  onDelete?: (payload: T) => void
  onChange?: (payload: unknown) => void
}

export function useRealtime<T>({
  table,
  schema = 'public',
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onChange,
}: UseRealtimeOptions<T>) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const config: Record<string, string> = {
      event,
      schema,
      table,
    }

    if (filter) {
      config.filter = filter
    }

    const channel = supabase
      .channel(`${schema}-${table}-${event}`)
      .on('postgres_changes', config as any, (payload) => {
        onChange?.(payload)

        if (payload.eventType === 'INSERT') {
          onInsert?.(payload.new as T)
        }

        if (payload.eventType === 'UPDATE') {
          onUpdate?.({ old: payload.old as T, new: payload.new as T })
        }

        if (payload.eventType === 'DELETE') {
          onDelete?.(payload.old as T)
        }
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, schema, event, filter, onInsert, onUpdate, onDelete, onChange])

  return channelRef
}
