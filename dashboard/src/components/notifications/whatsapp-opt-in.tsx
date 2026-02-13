'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { createClient } from '@/lib/supabase/client'

const PHONE_RE = /^\+\d{10,15}$/

interface WhatsAppOptInProps {
  userId: string
  initialOptIn: boolean
  initialPhone: string
}

export function WhatsAppOptIn({
  userId,
  initialOptIn,
  initialPhone,
}: WhatsAppOptInProps) {
  const [optIn, setOptIn] = useState(initialOptIn)
  const [phone, setPhone] = useState(initialPhone)
  const [saving, setSaving] = useState(false)
  const [lastSavedOptIn, setLastSavedOptIn] = useState(initialOptIn)
  const [lastSavedPhone, setLastSavedPhone] = useState(initialPhone)
  const phoneInputRef = useRef<HTMLInputElement | null>(null)

  const trimmedPhone = phone.trim()
  const normalizedPhone = optIn ? trimmedPhone : ''
  const normalizedLastPhone = lastSavedOptIn ? lastSavedPhone : ''
  const phoneIsValid = !optIn || PHONE_RE.test(trimmedPhone)
  const hasChanges = optIn !== lastSavedOptIn || normalizedPhone !== normalizedLastPhone

  useEffect(() => {
    if (optIn && !phone) {
      phoneInputRef.current?.focus()
    }
  }, [optIn, phone])

  function handleToggle(next: boolean) {
    setOptIn(next)
    if (!next) {
      setPhone('')
    } else if (!phone && lastSavedPhone) {
      setPhone(lastSavedPhone)
    }
  }

  async function handleSave() {
    if (!hasChanges || !phoneIsValid) {
      return
    }

    setSaving(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Failed to load profile settings:', error)
      toast.error('Unable to load your profile settings')
      setSaving(false)
      return
    }

    const currentSettings = (data?.settings as Record<string, unknown> | null) ?? {}
    const nextSettings = {
      ...currentSettings,
      whatsapp_opt_in: optIn,
      whatsapp_phone: normalizedPhone,
      whatsapp_opted_in_at: optIn ? new Date().toISOString() : null,
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ settings: nextSettings })
      .eq('id', userId)

    if (updateError) {
      console.error('Failed to update WhatsApp preferences:', updateError)
      toast.error('Failed to save WhatsApp preferences')
      setSaving(false)
      return
    }

    toast.success('WhatsApp preferences saved')
    setLastSavedOptIn(optIn)
    setLastSavedPhone(normalizedPhone)
    setSaving(false)
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>WhatsApp Alerts</CardTitle>
        <CardDescription>
          Keep operators informed by allowing urgent alerts to reach you on WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Enable WhatsApp alerts</p>
            <p className="text-xs text-muted-foreground">
              When enabled, dispatch can include you in WhatsApp notification channels.
            </p>
          </div>
          <Switch checked={optIn} onCheckedChange={handleToggle} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="whatsapp-phone">Phone number</Label>
          <Input
            id="whatsapp-phone"
            ref={phoneInputRef}
            type="tel"
            placeholder="+201234567890"
            disabled={!optIn}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Use international E.164 format with country code. We never share this number outside
            of alert delivery.
          </p>
          {!phoneIsValid && optIn && (
            <p className="text-xs text-destructive">
              Enter a valid phone number like +201234567890.
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Last saved: {lastSavedOptIn ? 'Opted in' : 'Opted out'}
        </p>
        <Button onClick={handleSave} disabled={!hasChanges || !phoneIsValid || saving}>
          {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Save preferences
        </Button>
      </CardFooter>
    </Card>
  )
}
