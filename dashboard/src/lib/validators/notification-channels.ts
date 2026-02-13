import { z } from 'zod'

import { SEVERITIES } from './alert-rules'

export const CHANNEL_TYPES = ['email', 'telegram', 'whatsapp'] as const
export type ChannelType = (typeof CHANNEL_TYPES)[number]

const quietHoursSchema = z.object({
  start: z.string(),
  end: z.string(),
  timezone: z.string().default('Africa/Cairo'),
})

export const whatsappRecipientsSchema = z
  .array(
    z.object({
      user_id: z.string().uuid(),
      phone: z
        .string()
        .regex(
          /^\+\d{10,15}$/,
          'Use international E.164 format (e.g., +201234567890)'
        ),
    })
  )
  .min(1, 'At least one recipient required')

const baseChannelSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  min_severity: z.enum(SEVERITIES),
  is_enabled: z.boolean().default(true),
  active_hours: quietHoursSchema.nullable().optional(),
})

const emailChannelSchema = baseChannelSchema.extend({
  channel_type: z.literal('email'),
  config: z.object({
    recipients: z
      .array(z.string().email('Invalid email address'))
      .min(1, 'At least one recipient required'),
  }),
})

const telegramChannelSchema = baseChannelSchema.extend({
  channel_type: z.literal('telegram'),
  config: z.object({
    chat_id: z.string().min(1, 'Chat ID is required'),
  }),
})

const whatsappChannelSchema = baseChannelSchema.extend({
  channel_type: z.literal('whatsapp'),
  config: z.object({
    recipients: whatsappRecipientsSchema,
  }),
})

export const channelFormSchema = z.discriminatedUnion('channel_type', [
  emailChannelSchema,
  telegramChannelSchema,
  whatsappChannelSchema,
])

export type NotificationChannelFormValues = z.infer<typeof channelFormSchema>
export type WhatsAppRecipient = z.infer<typeof whatsappRecipientsSchema>[number]
