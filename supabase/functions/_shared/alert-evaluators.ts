/**
 * Alert rule evaluation functions for the 5 core rule types.
 *
 * Each evaluator takes the Supabase client, an alert rule, an ad account,
 * and optionally the trigger payload, then returns an EvalResult indicating
 * whether the rule was triggered and what message to display.
 *
 * IMPORTANT: NUMERIC columns (current_balance, daily_spend, etc.) are strings
 * in TypeScript (per project decision #2). Always use Number() before comparison.
 */

import type { EvalResult, TriggerPayload } from "./types.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
// deno-lint-ignore no-explicit-any
type AlertRule = any;
// deno-lint-ignore no-explicit-any
type AdAccount = any;

/**
 * Evaluates a single alert rule against the given ad account.
 *
 * @param supabase - Supabase admin client
 * @param rule - Alert rule row from alert_rules table
 * @param account - Ad account row from ad_accounts table
 * @param payload - Optional trigger payload (needed for status_change events)
 * @returns EvalResult with triggered flag, title, message, and context
 */
export async function evaluateRule(
  supabase: SupabaseClient,
  rule: AlertRule,
  account: AdAccount,
  payload?: TriggerPayload
): Promise<EvalResult> {
  const config = (rule.config ?? {}) as Record<string, unknown>;
  const notTriggered: EvalResult = {
    triggered: false,
    title: "",
    message: "",
    context: {},
  };

  switch (rule.rule_type) {
    // =========================================================================
    // balance_threshold: fires when current_balance drops to or below threshold
    // =========================================================================
    case "balance_threshold": {
      const balance = Number(account.current_balance) || 0;
      const threshold = Number(config.threshold_value) || 0;

      if (balance > threshold) return notTriggered;

      return {
        triggered: true,
        title: `Low Balance: ${account.account_name}`,
        message: `Balance is ${account.currency} ${balance.toLocaleString()} (threshold: ${threshold.toLocaleString()})`,
        context: {
          balance,
          threshold,
          currency: account.currency,
        },
      };
    }

    // =========================================================================
    // time_to_depletion: fires when estimated days remaining <= threshold
    // =========================================================================
    case "time_to_depletion": {
      const lookbackDays = Number(config.lookback_days) || 7;
      const daysThreshold = Number(config.days_remaining) || 3;

      // Try the database RPC first (more accurate, uses indexes)
      let daysRemaining: number | null = null;

      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          "calculate_time_to_depletion",
          {
            p_ad_account_id: account.id,
            p_lookback_days: lookbackDays,
          }
        );

        if (!rpcError && rpcResult !== null) {
          daysRemaining = Number(rpcResult);
        }
      } catch {
        // RPC not available -- fall back to manual calculation
      }

      // Manual fallback: balance / average daily spend over lookback period
      if (daysRemaining === null) {
        const balance = Number(account.current_balance) || 0;
        if (balance <= 0) {
          daysRemaining = 0;
        } else {
          const since = new Date(
            Date.now() - lookbackDays * 86_400_000
          )
            .toISOString()
            .split("T")[0];

          const { data: spendRows } = await supabase
            .from("spend_records")
            .select("daily_spend")
            .eq("ad_account_id", account.id)
            .gte("date", since)
            .order("date", { ascending: false });

          if (spendRows && spendRows.length > 0) {
            const totalSpend = spendRows.reduce(
              (sum: number, r: { daily_spend: string }) =>
                sum + (Number(r.daily_spend) || 0),
              0
            );
            const avgDailySpend = totalSpend / spendRows.length;
            daysRemaining =
              avgDailySpend > 0
                ? Math.round(balance / avgDailySpend)
                : 9999;
          } else {
            // No spend data -- cannot estimate depletion
            return notTriggered;
          }
        }
      }

      if (daysRemaining > daysThreshold) return notTriggered;

      return {
        triggered: true,
        title: `Funds Depleting: ${account.account_name}`,
        message: `Estimated ${daysRemaining} days remaining (threshold: ${daysThreshold} days)`,
        context: {
          days_remaining: daysRemaining,
          threshold_days: daysThreshold,
          currency: account.currency,
          balance: Number(account.current_balance) || 0,
        },
      };
    }

    // =========================================================================
    // spend_spike: fires when today's spend exceeds average by percentage
    // =========================================================================
    case "spend_spike": {
      const lookbackDays = Number(config.lookback_days) || 7;
      const pctIncrease = Number(config.percentage_increase) || 50;

      const since = new Date(
        Date.now() - lookbackDays * 86_400_000
      )
        .toISOString()
        .split("T")[0];

      const { data: recentSpend } = await supabase
        .from("spend_records")
        .select("daily_spend, date")
        .eq("ad_account_id", account.id)
        .gte("date", since)
        .order("date", { ascending: false });

      if (!recentSpend || recentSpend.length < 2) return notTriggered;

      const todaySpend = Number(recentSpend[0].daily_spend) || 0;
      const priorSpend = recentSpend.slice(1);
      const avgSpend =
        priorSpend.reduce(
          (sum: number, r: { daily_spend: string }) =>
            sum + (Number(r.daily_spend) || 0),
          0
        ) / priorSpend.length;

      if (avgSpend <= 0) return notTriggered;

      const pctChange = ((todaySpend - avgSpend) / avgSpend) * 100;

      if (pctChange < pctIncrease) return notTriggered;

      return {
        triggered: true,
        title: `Spend Spike: ${account.account_name}`,
        message: `Daily spend ${account.currency} ${todaySpend.toLocaleString()} is ${pctChange.toFixed(0)}% above ${lookbackDays}-day average (${account.currency} ${avgSpend.toLocaleString()})`,
        context: {
          today_spend: todaySpend,
          avg_spend: avgSpend,
          pct_change: pctChange,
          currency: account.currency,
        },
      };
    }

    // =========================================================================
    // zero_spend: fires when all recent days have zero daily spend
    // =========================================================================
    case "zero_spend": {
      const consecutiveDays = Number(config.consecutive_days) || 2;

      const { data: recentSpend } = await supabase
        .from("spend_records")
        .select("daily_spend, date")
        .eq("ad_account_id", account.id)
        .order("date", { ascending: false })
        .limit(consecutiveDays);

      if (!recentSpend || recentSpend.length < consecutiveDays) {
        return notTriggered;
      }

      const zeroCount = recentSpend.filter(
        (r: { daily_spend: string }) => Number(r.daily_spend) === 0
      ).length;

      if (zeroCount < consecutiveDays) return notTriggered;

      return {
        triggered: true,
        title: `Zero Spend: ${account.account_name}`,
        message: `Account has had zero spend for ${zeroCount} consecutive days`,
        context: {
          consecutive_zero_days: zeroCount,
          threshold_days: consecutiveDays,
        },
      };
    }

    // =========================================================================
    // account_status_change: fires when account status transitions
    // =========================================================================
    case "account_status_change": {
      // This rule type is triggered by the ad_accounts status change trigger,
      // which passes event='status_change' with old_status and new_status in
      // the payload. For non-status-change triggers, return not triggered.
      if (!payload || payload.event !== "status_change") {
        return notTriggered;
      }

      return {
        triggered: true,
        title: `Status Changed: ${account.account_name}`,
        message: `Account status changed from "${payload.old_status}" to "${payload.new_status}"`,
        context: {
          old_status: payload.old_status,
          new_status: payload.new_status,
          account_name: account.account_name,
          platform_id: account.platform_id,
        },
      };
    }

    // =========================================================================
    // Default: unknown rule type
    // =========================================================================
    default:
      return notTriggered;
  }
}
