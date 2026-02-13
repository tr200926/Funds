import { z } from 'zod'

// ---------------------------------------------------------------------------
// Channel type enum
// ---------------------------------------------------------------------------

export const channelTypeEnum = z.enum(['email', 'telegram', 'whatsapp'])
export type ChannelType = z.infer<typeof channelTypeEnum>

// ---------------------------------------------------------------------------
// WhatsApp recipient schema
// ---------------------------------------------------------------------------

export const whatsappRecipientSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  phone: z
    .string()
    .regex(
      /^\+\d{10,15}$/,
      'Use international E.164 format (e.g., +201234567890)'
    ),
})

export const whatsappRecipientsSchema = z
  .array(whatsappRecipientSchema)
  .min(1, 'At least one recipient required')

export type WhatsAppRecipient = z.infer<typeof whatsappRecipientSchema>

// ---------------------------------------------------------------------------
// Channel form schema
// ---------------------------------------------------------------------------

export const channelFormSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    channel_type: channelTypeEnum,
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
  .superRefine((data, ctx) => {
    if (data.channel_type === 'email') {
      const recipients = data.config?.recipients
      if (!Array.isArray(recipients) || recipients.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least one email recipient is required',
          path: ['config', 'recipients'],
        })
      }
    }

    if (data.channel_type === 'telegram') {
      const chatId = data.config?.chat_id
      if (typeof chatId !== 'string' || chatId.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Chat ID is required',
          path: ['config', 'chat_id'],
        })
      }
    }

    if (data.channel_type === 'whatsapp') {
      const recipients = data.config?.recipients
      if (!Array.isArray(recipients) || recipients.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least one WhatsApp recipient is required',
          path: ['config', 'recipients'],
        })
        return
      }
      const result = whatsappRecipientsSchema.safeParse(recipients)
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ['config', 'recipients', ...issue.path],
          })
        }
      }
    }
  })

export type NotificationChannelFormValues = z.infer<typeof channelFormSchema>
