# Phase 0 Evidence

## Date
2026-02-11

## Completed Repository Hardening
1. Redacted exposed TikTok tokens in:
- `Tiktok Data Pull —Tiktok accounts.json`
- `Tiktok Data Pull —tiktok2.json`

2. Redacted hardcoded Google Sheet ID in workflow exports:
- `Facebook Data Pull —Main accounts.json`
- `Facebook Data Pull —Pasant.json`
- `Facebook Data Pull —aligomarketing.json`
- `Facebook Data Pull —Xlerate.json`
- `Tiktok Data Pull —Tiktok accounts.json`
- `Tiktok Data Pull —tiktok2.json`

3. Redacted hardcoded email recipients in workflow exports:
- `Facebook Data Pull —Main accounts.json`
- `Facebook Data Pull —Pasant.json`
- `Facebook Data Pull —aligomarketing.json`
- `Facebook Data Pull —Xlerate.json`

## Verification Commands
1. Secret scan (old values):
- `rg -n "9f2251a6be41003cfb076845a55de15c3fcf884b|b7853827d6460454b7355c7063f966ee389bf80f|17A8_7E3sugv8NWKgrX9a-Y7-9KypF5xvbHkgbulVqLE|zeina.moh.imam@gmail.com|hossamelsayed66@gmail.com|pasent@i-ndie.com|fyasser528@gmail.com|mahira652002@gmail.com|sarahlouay3@gmail.com|Marteen.emil@gmail.com" -g "*.json"`
- Result: no matches after redaction.

2. Placeholder presence check:
- `rg -n "__REDACTED_ROTATE_IN_N8N_CREDENTIALS__|__REDACTED_GOOGLE_SHEET_ID__|__REDACTED_EMAIL_SET_IN_CONFIG__" -g "*.json"`
- Result: placeholders present in expected workflow files.

## Manual External Actions Still Required
1. Rotate live TikTok tokens in n8n credentials and invalidate currently leaked values.
2. Verify Facebook token type (system user preferred) and rotate if needed.
3. Clean git history if this repository has been shared externally.
4. Configure runtime token health-check alerts in n8n/Supabase.
5. Confirm behavior for disabled Main Facebook controller node.

## Risk Note
Repository-level redaction is complete, but production risk remains until live credentials are rotated.