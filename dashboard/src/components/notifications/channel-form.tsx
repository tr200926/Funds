'use client'

import { useState } from 'react'
import { Loader2, Mail, MessageCircle } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'

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

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const channelFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  channel_type: z.enum(['email', 'telegram']),
  min_severity: z.enum(['info', 'warning', 'critical', 'emergency']),
  is_enabled: z.boolean().default(true),
  active_hours: z
    .object({
      start: z.string(),
      end: z.string(),
      timezone: z.string().default('Africa/Cairo'),
    })
    .nullable()
    .optional(),
  config: z.record(z.string(), z.unknown()),
})

export type NotificationChannelFormValues = z.infer<typeof channelFormSchema>

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
// Component
// ---------------------------------------------------------------------------

interface ChannelFormProps {
  mode: 'create' | 'edit'
  initialValues?: Partial<NotificationChannelFormValues>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: NotificationChannelFormValues) => Promise<void>
}

export function ChannelForm({
  mode,
  initialValues,
  open,
  onOpenChange,
  onSubmit,
}: ChannelFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [channelType, setChannelType] = useState<'email' | 'telegram'>(
    (initialValues?.channel_type as 'email' | 'telegram') ?? 'email'
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

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
    } else {
      if (!telegramChatId.trim()) {
        newErrors.chat_id = 'Chat ID is required'
      }
      config = { chat_id: telegramChatId.trim() }
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
      <DialogContent className="sm:max-w-lg">
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
              onValueChange={(v) => setChannelType(v as 'email' | 'telegram')}
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

          {/* Dynamic config */}
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
