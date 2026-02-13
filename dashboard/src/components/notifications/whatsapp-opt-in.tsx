'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { Json } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// E.164 phone validation
// ---------------------------------------------------------------------------

const E164_RE = /^\+\d{10,15}$/

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WhatsAppOptInProps {
  userId: string
  initialOptIn: boolean
  initialPhone: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhatsAppOptIn({
  userId,
  initialOptIn,
  initialPhone,
}: WhatsAppOptInProps) {
  const [optIn, setOptIn] = useState(initialOptIn)
  const [phone, setPhone] = useState(initialPhone)
  const [saving, setSaving] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const phoneRef = useRef<HTMLInputElement>(null)

  // Track whether user has made changes
  const hasChanges =
    optIn !== initialOptIn || phone !== initialPhone

  // Auto-focus phone input when opting in with empty phone
  useEffect(() => {
    if (optIn && !phone && phoneRef.current) {
      phoneRef.current.focus()
    }
  }, [optIn, phone])

  function handleOptInChange(checked: boolean) {
    setOptIn(checked)
    setPhoneError('')
    if (!checked) {
      setPhone('')
    }
  }

  function handlePhoneChange(value: string) {
    setPhone(value)
    if (phoneError && E164_RE.test(value)) {
      setPhoneError('')
    }
  }

  async function handleSave() {
    // Validate phone when opting in
    if (optIn) {
      if (!phone.trim()) {
        setPhoneError('Phone number is required when enabling WhatsApp alerts')
        return
      }
      if (!E164_RE.test(phone.trim())) {
        setPhoneError('Use international E.164 format (e.g., +201234567890)')
        return
      }
    }

    setSaving(true)
    try {
      const supabase = createClient()

      // Fetch current settings to merge without clobbering other keys
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('settings')
        .eq('id', userId)
        .single()

      if (fetchError) {
        toast.error(`Failed to load profile: ${fetchError.message}`)
        return
      }

      const existingSettings =
        (profile?.settings as Record<string, unknown>) ?? {}

      // Build merged settings
      const updatedSettings: Record<string, unknown> = {
        ...existingSettings,
        whatsapp_opt_in: optIn,
        whatsapp_phone: optIn ? phone.trim() : null,
        whatsapp_opted_in_at: optIn
          ? existingSettings.whatsapp_opted_in_at ?? new Date().toISOString()
          : null,
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          settings: updatedSettings as unknown as Json,
        })
        .eq('id', userId)

      if (updateError) {
        toast.error(`Failed to save preferences: ${updateError.message}`)
        return
      }

      toast.success(
        optIn
          ? 'WhatsApp alerts enabled. You may now be added to WhatsApp notification channels.'
          : 'WhatsApp alerts disabled.'
      )
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp Alerts</CardTitle>
        <CardDescription>
          Receive alert notifications directly on WhatsApp. Enable this option
          and provide your phone number so channel administrators can include you
          in WhatsApp notification channels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Opt-in toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="whatsapp-opt-in" className="cursor-pointer">
            Enable WhatsApp Alerts
          </Label>
          <Switch
            id="whatsapp-opt-in"
            checked={optIn}
            onCheckedChange={handleOptInChange}
          />
        </div>

        {/* Phone input - shown only when opted in */}
        {optIn && (
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp-phone">Phone Number</Label>
            <Input
              ref={phoneRef}
              id="whatsapp-phone"
              type="tel"
              placeholder="+201234567890"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
            />
            {phoneError ? (
              <p className="text-xs text-destructive">{phoneError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Enter your phone number in international format including the
                country code (e.g., +20 for Egypt, +1 for US).
              </p>
            )}
          </div>
        )}

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges || (optIn && !phone.trim())}
        >
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  )
}
