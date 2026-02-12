import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Insert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type Update<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

export type Organization = Tables<'organizations'>;
export type Profile = Tables<'profiles'>;
export type AdAccount = Tables<'ad_accounts'>;
export type SpendRecord = Tables<'spend_records'>;
export type BalanceSnapshot = Tables<'balance_snapshots'>;
export type AlertRule = Tables<'alert_rules'>;
export type Alert = Tables<'alerts'>;
export type AlertDelivery = Tables<'alert_deliveries'>;
export type NotificationChannel = Tables<'notification_channels'>;
export type PipelineRun = Tables<'pipeline_runs'>;
