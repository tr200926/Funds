/**
 * Shared Supabase admin client factory for Edge Functions.
 *
 * Creates a Supabase client using the auto-populated environment variables
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. These are available in all
 * Supabase Edge Functions without manual configuration.
 *
 * The client uses the service_role key, bypassing RLS for server-side
 * alert engine operations.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Creates a Supabase admin client for use in Edge Functions.
 * Uses service_role key to bypass RLS (required for alert engine operations).
 *
 * Auto-refresh and session persistence are disabled since Edge Functions
 * are stateless -- each invocation creates a fresh client.
 */
export function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
