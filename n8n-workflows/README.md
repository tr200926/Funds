# n8n Workflow Consolidation Guide

This directory contains the consolidated ingestion workflows that replace the eight legacy Facebook/TikTok automations. A single controller workflow now orchestrates three parameterized sub-workflows:

```
Controller (schedule trigger)
 ├─ Execute Sub-workflow → Facebook Ingestion (org_id, pipeline_name)
 ├─ Execute Sub-workflow → TikTok Ingestion 1 (token group A)
 └─ Execute Sub-workflow → TikTok Ingestion 2 (token group B)

API sources → n8n (batch HTTP + Supabase nodes) → Supabase tables
                                             ↘ legacy tables (dual-write)
```

The Facebook workflow introduces batch Graph API calls (reducing ~90 requests to ~9), standardized Luxon Cairo timezone handling, and a proper `pipeline_runs` lifecycle with dual writes for validation.

## Import Instructions

1. Open your n8n instance and navigate to **Settings → Import Workflows**.
2. Import each JSON file in this folder individually. **Order matters:**
   - `facebook-ingestion.json`
   - `tiktok-ingestion-1.json` (placeholder for upcoming plan)
   - `tiktok-ingestion-2.json` (placeholder for upcoming plan)
   - Controller workflow (add after the ingestion workflows so IDs exist)
3. Alternatively, use the REST API:
   ```bash
   curl -X POST https://<n8n-host>/api/v1/workflows \
     -H "Authorization: Bearer <API_KEY>" \
     -H "Content-Type: application/json" \
     -d @facebook-ingestion.json
   ```
4. After import, open the Controller workflow and update each **Execute Sub-workflow** node to point to the newly imported workflow IDs. n8n stores IDs, not names, so this step is required after every import.

## Credential Requirements

| Credential | n8n Type | Where to Retrieve | Used By |
| ---------- | -------- | ----------------- | ------- |
| Facebook Graph API | Facebook Graph API | Facebook Business Manager → System Users → Generate Long-Lived Token (must have access to all 4 Business Managers) | `facebook-ingestion.json` HTTP nodes |
| Supabase Service Role | HTTP Header Auth (apikey) or Supabase credential | Supabase Dashboard → Project Settings → API → `service_role` key | All Supabase nodes (Facebook + TikTok + Controller) |
| TikTok Token Group 1 | Header Auth (Access-Token) | TikTok Business API developer console (group 1 advertiser token) | `tiktok-ingestion-1.json` |
| TikTok Token Group 2 | Header Auth (Access-Token) | TikTok Business API developer console (group 2 advertiser token) | `tiktok-ingestion-2.json` |

## Configuration After Import

1. For each workflow, open **Workflow Settings** and set:
   - Timezone → `Africa/Cairo`
   - Error Workflow → Controller error handler
   - Retry on fail → Disabled (controller schedules retries)
2. Assign the Supabase credential to all Supabase nodes (Insert, Upsert, Select) and set the default credential for the workflow to avoid manual selection later.
3. In the Controller workflow, update each Execute Sub-workflow node inputs to include `org_id` and `pipeline_name` (e.g., `facebook_ingestion`, `tiktok_ingestion_1`).
4. Confirm that every HTTP Request node uses the proper credential (Facebook Graph API or TikTok token). Tokens should never appear inside the JSON export.

## Legacy Table Mapping

During the dual-write validation window (R3.6), Facebook ingestion writes to both the normalized tables and the old per–Business Manager tables. The mapping is:

- `business_manager = bm_main` → `legacy_facebook_main_accounts`
- `business_manager = bm_franchise` → `legacy_facebook_franchise_accounts`
- `business_manager = bm_agency_a` → `legacy_facebook_agency_a`
- `business_manager = bm_agency_b` → `legacy_facebook_agency_b`

Disable the dual-write nodes only after seven consecutive days of zero discrepancies between normalized tables and legacy tables.

## Validation Checklist

- [ ] Import Facebook + TikTok workflows and the controller
- [ ] Configure all four credentials listed above
- [ ] Update controller Execute Sub-workflow nodes with the imported workflow IDs
- [ ] Run the controller manually once with test org_id
- [ ] Compare `spend_records`/`balance_snapshots` vs legacy tables for the same date range
- [ ] Confirm `pipeline_runs` rows transition from `running` → `success/partial/failed`
- [ ] Review n8n execution logs to ensure zero Google Sheets writes
- [ ] Disable all eight legacy workflows only after validation passes

## Rollback Plan

1. Re-enable the eight legacy workflows in n8n (two controllers + four Facebook + two TikTok) if discrepancies are detected.
2. Disable scheduling on the new controller to prevent dual writes while investigating.
3. Because the new workflows only append data into Supabase, no cleanup is required—simply switch traffic back to the legacy workflows while fixes are applied.
4. Keep the dual-write nodes active until legacy parity is confirmed again, then resume the consolidation rollout.
