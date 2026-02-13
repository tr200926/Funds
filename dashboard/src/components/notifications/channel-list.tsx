'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mail, MessageCircle, Pencil, PhoneCall, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import type { Json } from '@/lib/database.types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { SeverityBadge } from '@/components/alerts/severity-badge'
import { createClient } from '@/lib/supabase/client'

import type { WhatsAppRecipient } from '@/lib/validators/notification-channels'

import { ChannelForm, type NotificationChannelFormValues } from './channel-form'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationChannel {
  id: string
  org_id: string
  name: string
  channel_type: NotificationChannelFormValues['channel_type']
  config: Record<string, unknown>
  min_severity: 'info' | 'warning' | 'critical' | 'emergency'
  is_enabled: boolean
  active_hours: { start: string; end: string; timezone: string } | null
  created_at: string
  updated_at: string
}

function mapChannelToFormValues(
  channel: NotificationChannel
): NotificationChannelFormValues {
  if (channel.channel_type === 'email') {
    const recipients = Array.isArray(channel.config?.recipients)
      ? (channel.config.recipients as string[])
      : []

    return {
      name: channel.name,
      channel_type: 'email',
      min_severity: channel.min_severity,
      is_enabled: channel.is_enabled,
      active_hours: channel.active_hours,
      config: { recipients },
    }
  }

  if (channel.channel_type === 'telegram') {
    const chatId =
      typeof channel.config?.chat_id === 'string'
        ? (channel.config.chat_id as string)
        : ''

    return {
      name: channel.name,
      channel_type: 'telegram',
      min_severity: channel.min_severity,
      is_enabled: channel.is_enabled,
      active_hours: channel.active_hours,
      config: { chat_id: chatId },
    }
  }

  const recipients = Array.isArray(channel.config?.recipients)
    ? (channel.config.recipients as WhatsAppRecipient[])
    : []

  return {
    name: channel.name,
    channel_type: 'whatsapp',
    min_severity: channel.min_severity,
    is_enabled: channel.is_enabled,
    active_hours: channel.active_hours,
    config: { recipients },
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChannelListProps {
  orgId: string
  userRole: 'admin' | 'manager' | 'viewer'
}

export function ChannelList({ orgId, userRole }: ChannelListProps) {
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [loading, setLoading] = useState(true)

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<NotificationChannel | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const canEdit = userRole === 'admin' || userRole === 'manager'

  const editingInitialValues = editingChannel
    ? mapChannelToFormValues(editingChannel)
    : undefined

  const fetchChannels = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch notification channels:', error)
      return
    }

    setChannels((data ?? []) as NotificationChannel[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  // Toggle enabled/disabled
  const handleToggle = useCallback(
    async (channel: NotificationChannel, enabled: boolean) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('notification_channels')
        .update({ is_enabled: enabled })
        .eq('id', channel.id)

      if (error) {
        toast.error(`Failed to update channel: ${error.message}`)
        return
      }

      setChannels((prev) =>
        prev.map((c) => (c.id === channel.id ? { ...c, is_enabled: enabled } : c))
      )
      toast.success(`Channel ${enabled ? 'enabled' : 'disabled'}`)
    },
    []
  )

  // Create channel
  const handleCreate = useCallback(
    async (values: NotificationChannelFormValues) => {
      const supabase = createClient()
      const { error } = await supabase.from('notification_channels').insert({
        org_id: orgId,
        name: values.name,
        channel_type: values.channel_type,
        min_severity: values.min_severity,
        is_enabled: values.is_enabled,
        active_hours: values.active_hours as Json | null,
        config: values.config as Json,
      })

      if (error) {
        toast.error(`Failed to create channel: ${error.message}`)
        throw error
      }

      toast.success('Channel created')
      fetchChannels()
    },
    [orgId, fetchChannels]
  )

  // Edit channel
  const handleEdit = useCallback(
    async (values: NotificationChannelFormValues) => {
      if (!editingChannel) return

      const supabase = createClient()
      const { error } = await supabase
        .from('notification_channels')
        .update({
          name: values.name,
          min_severity: values.min_severity,
          is_enabled: values.is_enabled,
          active_hours: values.active_hours as Json | null,
          config: values.config as Json,
        })
        .eq('id', editingChannel.id)

      if (error) {
        toast.error(`Failed to update channel: ${error.message}`)
        throw error
      }

      toast.success('Channel updated')
      setEditingChannel(null)
      fetchChannels()
    },
    [editingChannel, fetchChannels]
  )

  // Delete channel
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return

    const supabase = createClient()
    const { error } = await supabase
      .from('notification_channels')
      .delete()
      .eq('id', deleteTarget.id)

    if (error) {
      toast.error(`Failed to delete channel: ${error.message}`)
      return
    }

    toast.success('Channel deleted')
    setDeleteTarget(null)
    setDeleteDialogOpen(false)
    fetchChannels()
  }, [deleteTarget, fetchChannels])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      {canEdit && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setFormMode('create')
              setEditingChannel(null)
              setFormOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Channel
          </Button>
        </div>
      )}

      {/* Channel cards */}
      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <Mail className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No notification channels configured
          </p>
          <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground/70">
            Add an Email, Telegram, or WhatsApp channel to start receiving alerts.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => {
            const iconMap = {
              email: Mail,
              telegram: MessageCircle,
              whatsapp: PhoneCall,
            } as const
            const ChannelIcon = iconMap[channel.channel_type] ?? Mail
            const emailRecipients = Array.isArray(channel.config?.recipients)
              ? (channel.config.recipients as string[])
              : []
            const chatId = (channel.config?.chat_id as string) ?? ''
            const whatsappRecipients =
              channel.channel_type === 'whatsapp' && Array.isArray(channel.config?.recipients)
                ? (channel.config.recipients as WhatsAppRecipient[])
                : []

            return (
              <Card key={channel.id} className="relative p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <ChannelIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{channel.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {channel.channel_type}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <Switch
                      size="sm"
                      checked={channel.is_enabled}
                      onCheckedChange={(checked) =>
                        handleToggle(channel, checked)
                      }
                    />
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Min severity:</span>
                    <SeverityBadge severity={channel.min_severity} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <Badge variant={channel.is_enabled ? 'default' : 'outline'}>
                      {channel.is_enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>

                  {/* Config summary */}
                   <div className="text-xs text-muted-foreground space-y-0.5">
                     {channel.channel_type === 'email' && emailRecipients.length > 0 && (
                       <span>
                         {emailRecipients.length} recipient{emailRecipients.length !== 1 ? 's' : ''}
                       </span>
                     )}
                     {channel.channel_type === 'telegram' && chatId && (
                       <span>Chat ID: {chatId}</span>
                     )}
                     {channel.channel_type === 'whatsapp' && whatsappRecipients.length > 0 && (
                       <span>
                         WhatsApp recipients: {whatsappRecipients.length}
                       </span>
                     )}
                   </div>

                  {/* Quiet hours */}
                  {channel.active_hours && (
                    <div className="text-xs text-muted-foreground">
                      Quiet: {channel.active_hours.start}-{channel.active_hours.end}{' '}
                      {channel.active_hours.timezone}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {canEdit && (
                  <div className="mt-3 flex gap-2 border-t pt-3">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setFormMode('edit')
                        setEditingChannel(channel)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setDeleteTarget(channel)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <ChannelForm
        mode={formMode}
        orgId={orgId}
        open={formOpen}
        onOpenChange={setFormOpen}
        initialValues={editingInitialValues}
        onSubmit={formMode === 'create' ? handleCreate : handleEdit}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Channel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
