'use client'

import { useEffect, useState } from 'react'
import {
  Loader2,
  Mail,
  MessageCircle,
  PhoneCall,
  Plus,
  Trash2,
} from 'lucide-react'
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
  type NotificationChannelFormValues,
  type WhatsAppRecipient,
} from '@/lib/validators/notification-channels'

export type { NotificationChannelFormValues } from '@/lib/validators/notification-channels'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WHATSAPP_PHONE_RE = /^\+\d{10,15}$/

interface ChannelFormProps {
  mode: 'create' | 'edit'
  orgId: string
  initialValues?: Partial<NotificationChannelFormValues>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: NotificationChannelFormValues) => Promise<void>
}

interface OrgUser {
  id: string
  full_name: string | null
  whatsapp_opt_in: boolean
  whatsapp_phone: string
}

type ChannelType = NotificationChannelFormValues['channel_type']
type WhatsAppRecipientFormRow = { user_id: string; phone: string }

function validateEmails(text: string): { valid: string[]; invalid: string[] } {
  const emails = text
    .split(/[\n,]+/)
    .map((email) => email.trim())
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

export function ChannelForm({
  mode,
  orgId,
  initialValues,
  open,
  onOpenChange,
  onSubmit,
}: ChannelFormProps) {
  const [name, setName] = useState('')
  const [channelType, setChannelType] = useState<ChannelType>('email')
  const [minSeverity, setMinSeverity] = useState<NotificationChannelFormValues['min_severity']>('warning')
  const [isEnabled, setIsEnabled] = useState(true)

  const [quietEnabled, setQuietEnabled] = useState(false)
  const [quietStart, setQuietStart] = useState('00:00')
  const [quietEnd, setQuietEnd] = useState('08:00')
  const [timezone, setTimezone] = useState('Africa/Cairo')

  const [emailRecipients, setEmailRecipients] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [whatsappRecipients, setWhatsAppRecipients] = useState<WhatsAppRecipientFormRow[]>([
    { user_id: '', phone: '' },
  ])

  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])
  const [orgUsersLoading, setOrgUsersLoading] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Fetch org users for WhatsApp recipient selection
  useEffect(() => {
    if (!orgId) return

    let isMounted = true
    async function loadOrgUsers() {
      setOrgUsersLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, settings')
        .eq('org_id', orgId)
        .order('display_name', { ascending: true })

      if (!isMounted) return

      if (error) {
        console.error('Failed to fetch org users:', error)
        toast.error('Unable to load organization users')
        setOrgUsers([])
      } else {
        const mapped = (data ?? []).map((user) => {
          const settings = (user.settings as Record<string, unknown> | null) ?? {}
          const whatsappOptIn = Boolean((settings as Record<string, unknown>).whatsapp_opt_in)
          const whatsappPhone =
            typeof (settings as Record<string, unknown>).whatsapp_phone === 'string'
              ? ((settings as Record<string, unknown>).whatsapp_phone as string)
              : ''

          return {
            id: user.id,
            full_name: user.full_name ?? null,
            whatsapp_opt_in: whatsappOptIn,
            whatsapp_phone: whatsappPhone,
          }
        })

        setOrgUsers(mapped)
      }

      setOrgUsersLoading(false)
    }

    loadOrgUsers()

    return () => {
      isMounted = false
    }
  }, [orgId])

  // Reset form state whenever dialog opens with different initial values
  useEffect(() => {
    if (!open) return

    setName(initialValues?.name ?? '')

    const nextChannelType = (initialValues?.channel_type as ChannelType) ?? 'email'
    setChannelType(nextChannelType)

    setMinSeverity(
      (initialValues?.min_severity as NotificationChannelFormValues['min_severity']) ??
        'warning'
    )
    setIsEnabled(initialValues?.is_enabled ?? true)

    const hours = initialValues?.active_hours
    setQuietEnabled(Boolean(hours))
    setQuietStart((hours as { start?: string } | null)?.start ?? '00:00')
    setQuietEnd((hours as { end?: string } | null)?.end ?? '08:00')
    setTimezone((hours as { timezone?: string } | null)?.timezone ?? 'Africa/Cairo')

    const config = (initialValues?.config ?? {}) as Record<string, unknown>
    setEmailRecipients(
      Array.isArray(config.recipients) && nextChannelType === 'email'
        ? (config.recipients as string[]).join('\n')
        : ''
    )
    setTelegramChatId(
      typeof config.chat_id === 'string' && nextChannelType === 'telegram'
        ? (config.chat_id as string)
        : ''
    )

    if (Array.isArray(config.recipients) && nextChannelType === 'whatsapp') {
      setWhatsAppRecipients(
        (config.recipients as WhatsAppRecipient[]).map((recipient) => ({
          user_id: recipient.user_id ?? '',
          phone: recipient.phone ?? '',
        }))
      )
    } else {
      setWhatsAppRecipients([{ user_id: '', phone: '' }])
    }

    setErrors({})
  }, [open, initialValues])

  function handleChannelTypeChange(nextType: ChannelType) {
    setChannelType(nextType)
    setErrors({})

    if (nextType === 'email') {
      setTelegramChatId('')
      setWhatsAppRecipients([{ user_id: '', phone: '' }])
    } else if (nextType === 'telegram') {
      setEmailRecipients('')
      setWhatsAppRecipients([{ user_id: '', phone: '' }])
    } else {
      setEmailRecipients('')
      setTelegramChatId('')
    }
  }

  function getUserById(id: string) {
    return orgUsers.find((user) => user.id === id)
  }

  function updateWhatsAppRecipient(
    index: number,
    updater: (current: WhatsAppRecipientFormRow) => WhatsAppRecipientFormRow
  ) {
    setWhatsAppRecipients((prev) => prev.map((row, idx) => (idx === index ? updater(row) : row)))
  }

  function handleWhatsAppUserChange(index: number, userId: string) {
    const selectedUser = getUserById(userId)
    updateWhatsAppRecipient(index, (current) => ({
      user_id: userId,
      phone: current.phone || selectedUser?.whatsapp_phone || '',
    }))
  }

  function handleWhatsAppPhoneChange(index: number, phone: string) {
    updateWhatsAppRecipient(index, (current) => ({
      ...current,
      phone,
    }))
  }

  function addWhatsAppRecipient() {
    setWhatsAppRecipients((prev) => [...prev, { user_id: '', phone: '' }])
  }

  function removeWhatsAppRecipient(index: number) {
    setWhatsAppRecipients((prev) => {
      if (prev.length === 1) {
        return [{ user_id: '', phone: '' }]
      }
      return prev.filter((_, idx) => idx !== index)
    })
  }

  async function handleSubmit() {
    setErrors({})
    const newErrors: Record<string, string> = {}

    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    let values: NotificationChannelFormValues | null = null

    if (channelType === 'email') {
      const { valid, invalid } = validateEmails(emailRecipients)
      if (valid.length === 0) {
        newErrors.recipients = 'At least one valid email is required'
      }
      if (invalid.length > 0) {
        newErrors.recipients = `Invalid emails: ${invalid.join(', ')}`
      }

      values = {
        name: trimmedName,
        channel_type: 'email',
        min_severity: minSeverity,
        is_enabled: isEnabled,
        active_hours: quietEnabled
          ? { start: quietStart, end: quietEnd, timezone }
          : null,
        config: { recipients: valid },
      }
    } else if (channelType === 'telegram') {
      if (!telegramChatId.trim()) {
        newErrors.chat_id = 'Chat ID is required'
      }

      values = {
        name: trimmedName,
        channel_type: 'telegram',
        min_severity: minSeverity,
        is_enabled: isEnabled,
        active_hours: quietEnabled
          ? { start: quietStart, end: quietEnd, timezone }
          : null,
        config: { chat_id: telegramChatId.trim() },
      }
    } else {
      const sanitized = whatsappRecipients.map((recipient) => ({
        user_id: recipient.user_id.trim(),
        phone: recipient.phone.trim(),
      }))

      const hasCompleteRecipient = sanitized.some(
        (recipient) => recipient.user_id && recipient.phone
      )

      if (!hasCompleteRecipient) {
        newErrors.whatsapp = 'Add at least one opted-in WhatsApp recipient'
      }

      sanitized.forEach((recipient, index) => {
        if (!recipient.user_id && !recipient.phone) {
          return
        }
        if (!recipient.user_id) {
          newErrors[`whatsapp_${index}_user`] = 'Select a user'
        }
        if (!WHATSAPP_PHONE_RE.test(recipient.phone)) {
          newErrors[`whatsapp_${index}_phone`] =
            'Use international E.164 format (e.g., +201234567890)'
        }
      })

      values = {
        name: trimmedName,
        channel_type: 'whatsapp',
        min_severity: minSeverity,
        is_enabled: isEnabled,
        active_hours: quietEnabled
          ? { start: quietStart, end: quietEnd, timezone }
          : null,
        config: { recipients: sanitized as WhatsAppRecipient[] },
      }
    }

    if (Object.keys(newErrors).length > 0 || !values) {
      setErrors(newErrors)
      return
    }

    const parsed = channelFormSchema.safeParse(values)
    if (!parsed.success) {
      console.error(parsed.error)
      toast.error('Validation failed. Please check your inputs.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(parsed.data)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save channel:', error)
      toast.error('Failed to save channel')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add Notification Channel' : 'Edit Notification Channel'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              placeholder="e.g., Ops Team Alerts"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Channel Type</Label>
            <Select
              value={channelType}
              onValueChange={(value) => handleChannelTypeChange(value as ChannelType)}
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
                    <PhoneCall className="h-3.5 w-3.5" />
                    WhatsApp
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Minimum Severity</Label>
            <Select
              value={minSeverity}
              onValueChange={(value) =>
                setMinSeverity(value as NotificationChannelFormValues['min_severity'])
              }
            >
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

          <div className="flex items-center justify-between">
            <Label htmlFor="channel-enabled">Enabled</Label>
            <Switch
              id="channel-enabled"
              checked={isEnabled}
              onCheckedChange={(checked) => setIsEnabled(checked)}
            />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="quiet-hours"
                checked={quietEnabled}
                onCheckedChange={(checked) => setQuietEnabled(checked === true)}
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
                      onChange={(event) => setQuietStart(event.target.value)}
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
                      onChange={(event) => setQuietEnd(event.target.value)}
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
                    onChange={(event) => setTimezone(event.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Notifications pause during quiet hours except for emergency alerts.
                </p>
              </div>
            )}
          </div>

          {channelType === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="email-recipients">Recipients</Label>
              <Textarea
                id="email-recipients"
                placeholder="one email per line, or comma-separated"
                rows={3}
                value={emailRecipients}
                onChange={(event) => setEmailRecipients(event.target.value)}
              />
              {errors.recipients && (
                <p className="text-xs text-destructive">{errors.recipients}</p>
              )}
            </div>
          )}

          {channelType === 'telegram' && (
            <div className="space-y-1.5">
              <Label htmlFor="telegram-chat-id">Chat ID</Label>
              <Input
                id="telegram-chat-id"
                placeholder="-100123456789"
                value={telegramChatId}
                onChange={(event) => setTelegramChatId(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Group chat IDs start with -100. Use @BotFather to locate yours.
              </p>
              {errors.chat_id && <p className="text-xs text-destructive">{errors.chat_id}</p>}
            </div>
          )}

          {channelType === 'whatsapp' && (
            <div className="space-y-2">
              <Label>WhatsApp recipients</Label>
              {whatsappRecipients.map((recipient, index) => {
                const selectedUser = recipient.user_id ? getUserById(recipient.user_id) : null
                return (
                  <div key={`recipient-${index}`} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs">User</Label>
                        <Select
                          value={recipient.user_id}
                          onValueChange={(value) => handleWhatsAppUserChange(index, value)}
                          disabled={orgUsersLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={
                              orgUsersLoading ? 'Loading users…' : 'Select user'
                            } />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {orgUsers.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-sm font-medium">
                                    {user.full_name ?? 'Unnamed user'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    ID: {user.id.slice(0, 8)}
                                  </span>
                                </div>
                                {!user.whatsapp_opt_in && (
                                  <Badge
                                    variant="outline"
                                    className="ml-auto text-[10px] uppercase text-amber-500"
                                  >
                                    Not opted in
                                  </Badge>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors[`whatsapp_${index}_user`] && (
                          <p className="text-xs text-destructive">
                            {errors[`whatsapp_${index}_user`]}
                          </p>
                        )}
                        {selectedUser && (
                          <p className="text-xs text-muted-foreground">
                            {selectedUser.whatsapp_opt_in
                              ? 'User opted in to WhatsApp alerts'
                              : 'User has not opted in yet'}
                          </p>
                        )}
                      </div>
                      {whatsappRecipients.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => removeWhatsAppRecipient(index)}
                          aria-label="Remove recipient"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`wa-phone-${index}`} className="text-xs">
                        Phone number
                      </Label>
                      <Input
                        id={`wa-phone-${index}`}
                        type="tel"
                        placeholder="+201234567890"
                        value={recipient.phone}
                        onChange={(event) => handleWhatsAppPhoneChange(index, event.target.value)}
                      />
                      {errors[`whatsapp_${index}_phone`] && (
                        <p className="text-xs text-destructive">
                          {errors[`whatsapp_${index}_phone`]}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={addWhatsAppRecipient}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add recipient
              </Button>
              {errors.whatsapp && (
                <p className="text-xs text-destructive">{errors.whatsapp}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Only add users who have opted into WhatsApp alerts. Saved phone numbers
                pre-fill automatically when available.
              </p>
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
