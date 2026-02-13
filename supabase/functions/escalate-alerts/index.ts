/**
 * escalate-alerts Edge Function
 *
 * Called by pg_cron every 15 minutes. Finds unacknowledged pending alerts
 * that have exceeded their severity-specific escalation timeout, promotes
 * them to the next severity level, and re-dispatches notifications.
 *
 * Escalation chain: info -> warning -> critical -> emergency (terminal)
 * Only status='pending' alerts are escalated. Acknowledged/resolved/dismissed
 * alerts are never touched.
 */

import { createAdminClient } from "../_shared/supabase-client.ts";
import {
  ESCALATION_TIMEOUTS,
  SEVERITY_NEXT,
} from "../_shared/constants.ts";
import type { Severity } from "../_shared/types.ts";

Deno.serve(async () => {
  try {
    const supabase = createAdminClient();
    let totalEscalated = 0;

    // Process each severity level that can escalate (not emergency)
    const escalatableLevels: Severity[] = ["info", "warning", "critical"];

    for (const severity of escalatableLevels) {
      const nextSeverity = SEVERITY_NEXT[severity];
      if (!nextSeverity) continue;

      const timeoutMinutes = ESCALATION_TIMEOUTS[severity];
      if (timeoutMinutes <= 0) continue;

      // Calculate cutoff: alerts created before this time should escalate
      const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

      // Find pending alerts at this severity past the timeout
      const { data: staleAlerts, error } = await supabase
        .from("alerts")
        .select("id, context_data")
        .eq("status", "pending")
        .eq("severity", severity)
        .lt("created_at", cutoff);

      if (error || !staleAlerts || staleAlerts.length === 0) continue;

      for (const alert of staleAlerts) {
        try {
          // Promote severity and record escalation in context_data
          const updatedContext = {
            ...(alert.context_data ?? {}),
            escalated_from: severity,
            escalated_at: new Date().toISOString(),
          };

          const { error: updateError } = await supabase
            .from("alerts")
            .update({
              severity: nextSeverity,
              context_data: updatedContext,
            })
            .eq("id", alert.id)
            .eq("status", "pending") // Double-check still pending (race condition guard)
            .eq("severity", severity); // Double-check not already escalated

          if (updateError) {
            console.error(`Failed to escalate alert ${alert.id}:`, updateError.message);
            continue;
          }

          totalEscalated++;

          // Re-dispatch notifications at the new severity level
          const supabaseUrl = Deno.env.get("SUPABASE_URL");
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

          if (supabaseUrl && serviceRoleKey) {
            // Await here (batch job, not a hot path)
            await fetch(
              `${supabaseUrl}/functions/v1/dispatch-notifications`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({ alert_id: alert.id }),
              }
            ).catch((err) => {
              console.error(
                `Failed to dispatch after escalation for alert ${alert.id}:`,
                err.message
              );
            });
          }
        } catch (alertError) {
          console.error(
            `Error escalating alert ${alert.id}:`,
            alertError instanceof Error ? alertError.message : alertError
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ escalated: totalEscalated }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("escalate-alerts error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
