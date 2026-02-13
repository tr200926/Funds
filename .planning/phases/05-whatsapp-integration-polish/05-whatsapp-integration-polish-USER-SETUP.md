# Phase 05: User Setup Required

**Generated:** 2026-02-13
**Phase:** 05-whatsapp-integration-polish
**Status:** Incomplete

Complete these items for the WhatsApp integration to function. Claude automated everything possible; these items require human access to Meta Business dashboards and the Supabase project.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `WHATSAPP_ACCESS_TOKEN` | Meta Business Manager → Business Settings → Users → System Users → Generate Token (scopes: `whatsapp_business_messaging`, `whatsapp_business_management`) | `npx supabase secrets set WHATSAPP_ACCESS_TOKEN=...` |
| [ ] | `WHATSAPP_PHONE_NUMBER_ID` | Meta Business Suite → WhatsApp Manager → Phone Numbers → select dedicated business number → copy **Phone Number ID** | `npx supabase secrets set WHATSAPP_PHONE_NUMBER_ID=...` |

## Dashboard Configuration

- [ ] **Register dedicated WhatsApp Business number**
  - Location: Meta Business Suite → WhatsApp Manager → Getting Started
  - Notes: Number must not be tied to WhatsApp/WhatsApp Business App. Release existing registrations before linking to the Cloud API.

- [ ] **Submit WhatsApp template approvals**
  - Location: Meta Business Suite → WhatsApp Manager → Message Templates
  - Submit the following Utility templates with clear sample content:
    - `balance_warning`
    - `critical_alert`
    - `daily_summary`
  - Notes: Approval can take up to 48h. Ensure copy references “Targetspro Alert/Targetspro Daily Summary”.

- [ ] **Generate permanent System User access token**
  - Location: Meta Business Manager → Users → System Users → Select service user → Generate New Token
  - Permissions: `whatsapp_business_messaging`, `whatsapp_business_management`
  - Notes: Copy immediately; store securely. Temporary tokens expire in 24h.

- [ ] **Set Supabase Edge Function secrets**
  - Command:
    ```bash
    npx supabase secrets set \
      WHATSAPP_ACCESS_TOKEN="<token>" \
      WHATSAPP_PHONE_NUMBER_ID="<phone-number-id>"
    ```
  - Notes: Requires `supabase login` first. Secrets are shared by all Edge Functions in the project.

## Verification

After completing setup, verify with:

```bash
# Confirm Supabase secrets were stored
npx supabase secrets list | grep WHATSAPP

# Confirm WhatsApp credentials work
curl -X GET "https://graph.facebook.com/v23.0/$WHATSAPP_PHONE_NUMBER_ID/message_templates" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
```

Expected results:
- `supabase secrets list` shows both `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in the project secrets table.
- Graph API call returns 200 with approved template metadata (no OAuth errors).

---

**Once all items complete:** Update the status above to "Complete" and check off each item.
