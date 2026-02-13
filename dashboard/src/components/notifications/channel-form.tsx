'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mail, MessageCircle, Plus, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import {
  channelFormSchema,
  type ChannelType,
  type NotificationChannelFormValues,
  type WhatsAppRecipient,
} from '@/lib/validators/notification-channels'

export type { NotificationChannelFormValues }

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmails(text: string): { valid: string[]; invalid: string[] } {
  const emails = text
    .split(/[,\n]+/)
    .map((e) => e.trim())
    .filter(Boolean)
  const valid: string[] = []
  const invalid: string[] = []
  for (const email of emails) {
    if (EMAIL_RE.test(email)) {
      valid.push(email)
    } else {
      invalid.push(email)
    }
  }
  return { valid, invalid }
}

// ---------------------------------------------------------------------------
// WhatsApp phone validation
// ---------------------------------------------------------------------------

const E164_RE = /^\+\d{10,15}$/

// ---------------------------------------------------------------------------
// Types for org user profiles
// ---------------------------------------------------------------------------

interface OrgUserProfile {
  id: string
  full_name: string
  settings: {
    whatsapp_opt_in?: boolean
    whatsapp_phone?: string
  } | null
}

// ---------------------------------------------------------------------------
// WhatsApp recipient row UI state
// ---------------------------------------------------------------------------

interface WhatsAppRecipientRow {
  key: string // React key
  user_id: string
  phone: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChannelFormProps {
  mode: 'create' | 'edit'
  initialValues?: Partial<NotificationChannelFormValues>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: NotificationChannelFormValues) => Promise<void>
  orgId?: string
}

export function ChannelForm({
  mode,
  initialValues,
  open,
  onOpenChange,
  onSubmit,
  orgId,
}: ChannelFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [channelType, setChannelType] = useState<ChannelType>(
    (initialValues?.channel_type as ChannelType) ?? 'email'
  )
  const [minSeverity, setMinSeverity] = useState<string>(
    initialValues?.min_severity ?? 'warning'
  )
  const [isEnabled, setIsEnabled] = useState(initialValues?.is_enabled ?? true)

  // Quiet hours
  const existingHours = initialValues?.active_hours
  const [quietEnabled, setQuietEnabled] = useState(!!existingHours)
  const [quietStart, setQuietStart] = useState(
    (existingHours as { start: string } | null)?.start ?? '00:00'
  )
  const [quietEnd, setQuietEnd] = useState(
    (existingHours as { end: string } | null)?.end ?? '08:00'
  )
  const [timezone, setTimezone] = useState(
    (existingHours as { timezone: string } | null)?.timezone ?? 'Africa/Cairo'
  )

  // Channel-specific config
  const existingConfig = (initialValues?.config ?? {}) as Record<string, unknown>
  const [emailRecipients, setEmailRecipients] = useState(
    Array.isArray(existingConfig.recipients)
      ? (existingConfig.recipients as string[]).join('\n')
      : ''
  )
  const [telegramChatId, setTelegramChatId] = useState(
    (existingConfig.chat_id as string) ?? ''
  )

  // WhatsApp recipients
  const [whatsappRows, setWhatsappRows] = useState<WhatsAppRecipientRow[]>(() => {
    if (
      initialValues?.channel_type === 'whatsapp' &&
      Array.isArray(existingConfig.recipients)
    ) {
      return (existingConfig.recipients as WhatsAppRecipient[]).map((r, i) => ({
        key: `init-${i}`,
        user_id: r.user_id,
        phone: r.phone,
      }))
    }
    return []
  })
  const rowKeyCounter = useRef(0)

  // Org users for WhatsApp recipient selection
  const [orgUsers, setOrgUsers] = useState<OrgUserProfile[]>([])
  const [orgUsersLoading, setOrgUsersLoading] = useState(false)
  const orgUsersFetched = useRef(false)

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form state when dialog opens/closes or initialValues change
  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '')
      setChannelType((initialValues?.channel_type as ChannelType) ?? 'email')
      setMinSeverity(initialValues?.min_severity ?? 'warning')
      setIsEnabled(initialValues?.is_enabled ?? true)
      const hours = initialValues?.active_hours
      setQuietEnabled(!!hours)
      setQuietStart((hours as { start: string } | null)?.start ?? '00:00')
      setQuietEnd((hours as { end: string } | null)?.end ?? '08:00')
      setTimezone((hours as { timezone: string } | null)?.timezone ?? 'Africa/Cairo')
      const cfg = (initialValues?.config ?? {}) as Record<string, unknown>
      setEmailRecipients(
        Array.isArray(cfg.recipients)
          ? (cfg.recipients as string[]).join('\n')
          : ''
      )
      setTelegramChatId((cfg.chat_id as string) ?? '')
      if (
        initialValues?.channel_type === 'whatsapp' &&
        Array.isArray(cfg.recipients)
      ) {
        setWhatsappRows(
          (cfg.recipients as WhatsAppRecipient[]).map((r, i) => ({
            key: `init-${i}`,
            user_id: r.user_id,
            phone: r.phone,
          }))
        )
      } else {
        setWhatsappRows([])
      }
      setErrors({})
    }
  }, [open, initialValues])

  // Fetch org users when WhatsApp is selected
  const fetchOrgUsers = useCallback(async () => {
    if (!orgId || orgUsersFetched.current) return
    setOrgUsersLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, settings')
        .eq('org_id', orgId)
        .order('full_name', { ascending: true })

      if (error) {
        console.error('Failed to fetch org users:', error)
        return
      }

      setOrgUsers(
        (data ?? []).map((u) => ({
          id: u.id,
          full_name: u.full_name,
          settings: u.settings as OrgUserProfile['settings'],
        }))
      )
      orgUsersFetched.current = true
    } finally {
      setOrgUsersLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (channelType === 'whatsapp' && open) {
      fetchOrgUsers()
    }
  }, [channelType, open, fetchOrgUsers])

  // Reset config when switching channel types
  function handleChannelTypeChange(newType: ChannelType) {
    setChannelType(newType)
    // Clear previous config state to prevent leaking between types
    setEmailRecipients('')
    setTelegramChatId('')
    setWhatsappRows([])
    setErrors({})
  }

  // WhatsApp row helpers
  function addWhatsappRow() {
    rowKeyCounter.current += 1
    setWhatsappRows((prev) => [
      ...prev,
      { key: `row-${rowKeyCounter.current}`, user_id: '', phone: '' },
    ])
  }

  function removeWhatsappRow(key: string) {
    setWhatsappRows((prev) => prev.filter((r) => r.key !== key))
  }

  function updateWhatsappRow(
    key: string,
    field: 'user_id' | 'phone',
    value: string
  ) {
    setWhatsappRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r
        const updated = { ...r, [field]: value }
        // When selecting a user, prefill phone if the user has one saved
        if (field === 'user_id') {
          const user = orgUsers.find((u) => u.id === value)
          if (user?.settings?.whatsapp_phone) {
            updated.phone = user.settings.whatsapp_phone
          }
        }
        return updated
      })
    )
  }

  async function handleSubmit() {
    setErrors({})
    const newErrors: Record<string, string> = {}

    if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    let config: Record<string, unknown> = {}
    if (channelType === 'email') {
      const { valid, invalid } = validateEmails(emailRecipients)
      if (valid.length === 0) {
        newErrors.recipients = 'At least one valid email is required'
      }
      if (invalid.length > 0) {
        newErrors.recipients = `Invalid emails: ${invalid.join(', ')}`
      }
      config = { recipients: valid }
    } else if (channelType === 'telegram') {
      if (!telegramChatId.trim()) {
        newErrors.chat_id = 'Chat ID is required'
      }
      config = { chat_id: telegramChatId.trim() }
    } else if (channelType === 'whatsapp') {
      // Validate each WhatsApp recipient row
      const validRecipients: WhatsAppRecipient[] = []
      let hasRowErrors = false

      if (whatsappRows.length === 0) {
        newErrors.whatsapp_recipients = 'At least one recipient required'
      } else {
        for (let i = 0; i < whatsappRows.length; i++) {
          const row = whatsappRows[i]
          if (!row.user_id) {
            newErrors[`whatsapp_user_${i}`] = 'Select a user'
            hasRowErrors = true
          }
          if (!row.phone || !E164_RE.test(row.phone)) {
            newErrors[`whatsapp_phone_${i}`] =
              'Enter a valid E.164 phone (e.g., +201234567890)'
            hasRowErrors = true
          }
          if (!hasRowErrors) {
            validRecipients.push({
              user_id: row.user_id,
              phone: row.phone,
            })
          }
        }
      }

      config = { recipients: validRecipients }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const values: NotificationChannelFormValues = {
      name: name.trim(),
      channel_type: channelType,
      min_severity: minSeverity as 'info' | 'warning' | 'critical' | 'emergency',
      is_enabled: isEnabled,
      active_hours: quietEnabled
        ? { start: quietStart, end: quietEnd, timezone }
        : null,
      config,
    }

    const parsed = channelFormSchema.safeParse(values)
    if (!parsed.success) {
      toast.error('Validation failed. Please check your inputs.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(parsed.data)
      onOpenChange(false)
    } catch {
      toast.error('Failed to save channel')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add Notification Channel' : 'Edit Notification Channel'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              placeholder="e.g., Ops Team Email"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Channel type */}
          <div className="space-y-1.5">
            <Label>Channel Type</Label>
            <Select
              value={channelType}
              onValueChange={(v) => handleChannelTypeChange(v as ChannelType)}
              disabled={mode === 'edit'}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">
                  <span className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </span>
                </SelectItem>
                <SelectItem value="telegram">
                  <span className="flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Telegram
                  </span>
                </SelectItem>
                <SelectItem value="whatsapp">
                  <span className="flex items-center gap-2">
                    <Smartphone className="h-3.5 w-3.5" />
                    WhatsApp
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Min severity */}
          <div className="space-y-1.5">
            <Label>Minimum Severity</Label>
            <Select value={minSeverity} onValueChange={setMinSeverity}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <Label htmlFor="channel-enabled">Enabled</Label>
            <Switch
              id="channel-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>

          {/* Quiet hours */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="quiet-hours"
                checked={quietEnabled}
                onCheckedChange={(c) => setQuietEnabled(c === true)}
              />
              <Label htmlFor="quiet-hours" className="cursor-pointer">
                Enable quiet hours
              </Label>
            </div>
            {quietEnabled && (
              <div className="space-y-2 pl-6">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="quiet-start" className="text-xs">
                      Start
                    </Label>
                    <Input
                      id="quiet-start"
                      type="time"
                      value={quietStart}
                      onChange={(e) => setQuietStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="quiet-end" className="text-xs">
                      End
                    </Label>
                    <Input
                      id="quiet-end"
                      type="time"
                      value={quietEnd}
                      onChange={(e) => setQuietEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="timezone" className="text-xs">
                    Timezone
                  </Label>
                  <Input
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Notifications will be suppressed during quiet hours except for
                  emergency alerts.
                </p>
              </div>
            )}
          </div>

          {/* Dynamic config: Email */}
          {channelType === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="email-recipients">Recipients</Label>
              <Textarea
                id="email-recipients"
                placeholder="one email per line, or comma-separated"
                rows={3}
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
              />
              {errors.recipients && (
                <p className="text-xs text-destructive">{errors.recipients}</p>
              )}
            </div>
          )}

          {/* Dynamic config: Telegram */}
          {channelType === 'telegram' && (
            <div className="space-y-1.5">
              <Label htmlFor="telegram-chat-id">Chat ID</Label>
              <Input
                id="telegram-chat-id"
                placeholder="-100123456789"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Group chat IDs start with -100. Use @BotFather to get your chat
                ID.
              </p>
              {errors.chat_id && (
                <p className="text-xs text-destructive">{errors.chat_id}</p>
              )}
            </div>
          )}

          {/* Dynamic config: WhatsApp */}
          {channelType === 'whatsapp' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>WhatsApp Recipients</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addWhatsappRow}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Recipient
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Only users who have opted in to WhatsApp alerts from their profile
                settings will receive messages. Users marked &quot;Not opted in&quot; should
                enable WhatsApp from Settings &gt; Profile first.
              </p>

              {errors.whatsapp_recipients && (
                <p className="text-xs text-destructive">
                  {errors.whatsapp_recipients}
                </p>
              )}

              {orgUsersLoading && (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading organization users...
                </div>
              )}

              {whatsappRows.length === 0 && !orgUsersLoading && (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No recipients added yet. Click &quot;Add Recipient&quot; to select users.
                </div>
              )}

              <div className="space-y-3">
                {whatsappRows.map((row, index) => {
                  const selectedUser = orgUsers.find((u) => u.id === row.user_id)
                  const isOptedIn = selectedUser?.settings?.whatsapp_opt_in === true

                  return (
                    <div
                      key={row.key}
                      className="space-y-2 rounded-md border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Recipient {index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeWhatsappRow(row.key)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* User select */}
                      <div className="space-y-1">
                        <Label className="text-xs">User</Label>
                        <Select
                          value={row.user_id}
                          onValueChange={(v) =>
                            updateWhatsappRow(row.key, 'user_id', v)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a user..." />
                          </SelectTrigger>
                          <SelectContent>
                            {orgUsers.map((user) => {
                              const opted =
                                user.settings?.whatsapp_opt_in === true
                              return (
                                <SelectItem key={user.id} value={user.id}>
                                  <span className="flex items-center gap-2">
                                    <span>
                                      {user.full_name || user.id}
                                    </span>
                                    {!opted && (
                                      <Badge
                                        variant="outline"
                                        className="ml-1 text-[10px]"
                                      >
                                        Not opted in
                                      </Badge>
                                    )}
                                  </span>
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                        {selectedUser && !isOptedIn && (
                          <p className="text-xs text-amber-600">
                            This user has not opted in to WhatsApp alerts yet.
                          </p>
                        )}
                        {errors[`whatsapp_user_${index}`] && (
                          <p className="text-xs text-destructive">
                            {errors[`whatsapp_user_${index}`]}
                          </p>
                        )}
                      </div>

                      {/* Phone input */}
                      <div className="space-y-1">
                        <Label className="text-xs">Phone Number</Label>
                        <Input
                          type="tel"
                          placeholder="+201234567890"
                          value={row.phone}
                          onChange={(e) =>
                            updateWhatsappRow(row.key, 'phone', e.target.value)
                          }
                        />
                        {errors[`whatsapp_phone_${index}`] && (
                          <p className="text-xs text-destructive">
                            {errors[`whatsapp_phone_${index}`]}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {mode === 'create' ? 'Add Channel' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
