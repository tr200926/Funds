/**
 * evaluate-alerts Edge Function
 *
 * Triggered by pg_net HTTP POST from database triggers on:
 * - spend_records AFTER INSERT
 * - balance_snapshots AFTER INSERT
 * - ad_accounts AFTER UPDATE (status change only)
 *
 * Flow: receive trigger payload -> load active rules -> evaluate each ->
 * check cooldown -> create alert row -> fire dispatch-notifications
 */

import { createAdminClient } from "../_shared/supabase-client.ts";
import { evaluateRule } from "../_shared/alert-evaluators.ts";
import type { TriggerPayload } from "../_shared/types.ts";

Deno.serve(async (req) => {
  try {
    const payload: TriggerPayload = await req.json();
    const { ad_account_id, org_id } = payload;

    if (!ad_account_id || !org_id) {
      return new Response(
        JSON.stringify({ error: "Missing ad_account_id or org_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createAdminClient();

    // Load the ad account
    const { data: account, error: accountError } = await supabase
      .from("ad_accounts")
      .select("*")
      .eq("id", ad_account_id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ evaluated: 0, error: "Account not found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load active alert rules for this org
    // Include both account-specific rules and org-wide rules (ad_account_id IS NULL)
    const { data: rules, error: rulesError } = await supabase
      .from("alert_rules")
      .select("*")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .or(`ad_account_id.eq.${ad_account_id},ad_account_id.is.null`);

    if (rulesError || !rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ evaluated: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let alertsCreated = 0;

    for (const rule of rules) {
      try {
        // Evaluate the rule against the account
        const result = await evaluateRule(supabase, rule, account, payload);

        if (!result.triggered) continue;

        // Check cooldown to prevent duplicate alerts
        const { data: inCooldown } = await supabase.rpc(
          "is_alert_in_cooldown",
          {
            p_ad_account_id: ad_account_id,
            p_alert_rule_id: rule.id,
            p_cooldown_minutes: rule.cooldown_minutes ?? 180,
          }
        );

        if (inCooldown) continue;

        // Create alert row
        const { data: alert, error: alertError } = await supabase
          .from("alerts")
          .insert({
            org_id,
            ad_account_id,
            alert_rule_id: rule.id,
            severity: rule.severity,
            title: result.title,
            message: result.message,
            context_data: result.context,
            status: "pending",
          })
          .select("id")
          .single();

        if (alertError || !alert) continue;

        alertsCreated++;

        // Fire-and-forget: dispatch notifications (do NOT await)
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (supabaseUrl && serviceRoleKey) {
          fetch(`${supabaseUrl}/functions/v1/dispatch-notifications`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ alert_id: alert.id }),
          }).catch(() => {
            // Fire-and-forget: log but don't block
          });
        }
      } catch (ruleError) {
        // Per-rule error handling: don't let one rule failure stop others
        console.error(
          `Error evaluating rule ${rule.id}:`,
          ruleError instanceof Error ? ruleError.message : ruleError
        );
      }
    }

    return new Response(
      JSON.stringify({ evaluated: rules.length, alerts_created: alertsCreated }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("evaluate-alerts error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
