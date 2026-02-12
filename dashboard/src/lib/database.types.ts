export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          account_name: string;
          archived_at: string | null;
          assigned_to: string | null;
          business_manager: string | null;
          created_at: string;
          currency: string;
          current_balance: string | null;
          current_daily_spend: string | null;
          current_mtd_spend: string | null;
          id: string;
          last_synced_at: string | null;
          metadata: Json;
          org_id: string;
          platform_account_id: string;
          platform_id: 'facebook' | 'tiktok';
          status: 'active' | 'paused' | 'disabled' | 'archived';
          tags: string[] | null;
          updated_at: string;
        };
        Insert: {
          account_name: string;
          archived_at?: string | null;
          assigned_to?: string | null;
          business_manager?: string | null;
          created_at?: string;
          currency?: string;
          current_balance?: string | null;
          current_daily_spend?: string | null;
          current_mtd_spend?: string | null;
          id?: string;
          last_synced_at?: string | null;
          metadata?: Json;
          org_id: string;
          platform_account_id: string;
          platform_id: 'facebook' | 'tiktok';
          status?: 'active' | 'paused' | 'disabled' | 'archived';
          tags?: string[] | null;
          updated_at?: string;
        };
        Update: {
          account_name?: string;
          archived_at?: string | null;
          assigned_to?: string | null;
          business_manager?: string | null;
          created_at?: string;
          currency?: string;
          current_balance?: string | null;
          current_daily_spend?: string | null;
          current_mtd_spend?: string | null;
          id?: string;
          last_synced_at?: string | null;
          metadata?: Json;
          org_id?: string;
          platform_account_id?: string;
          platform_id?: 'facebook' | 'tiktok';
          status?: 'active' | 'paused' | 'disabled' | 'archived';
          tags?: string[] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ad_accounts_assigned_to_fkey';
            columns: ['assigned_to'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ad_accounts_org_id_fkey';
            columns: ['org_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ad_accounts_platform_id_fkey';
            columns: ['platform_id'];
            referencedRelation: 'platforms';
            referencedColumns: ['id'];
          }
        ];
      };
      alert_deliveries: {
        Row: {
          alert_id: string;
          channel_type: 'email' | 'telegram' | 'whatsapp' | 'webhook';
          created_at: string;
          error_message: string | null;
          id: string;
          recipient: string;
          response_data: Json | null;
          sent_at: string | null;
          status: 'pending' | 'sent' | 'failed' | 'queued';
        };
        Insert: {
          alert_id: string;
          channel_type: 'email' | 'telegram' | 'whatsapp' | 'webhook';
          created_at?: string;
          error_message?: string | null;
          id?: string;
          recipient: string;
          response_data?: Json | null;
          sent_at?: string | null;
          status?: 'pending' | 'sent' | 'failed' | 'queued';
        };
        Update: {
          alert_id?: string;
          channel_type?: 'email' | 'telegram' | 'whatsapp' | 'webhook';
          created_at?: string;
          error_message?: string | null;
          id?: string;
          recipient?: string;
          response_data?: Json | null;
          sent_at?: string | null;
          status?: 'pending' | 'sent' | 'failed' | 'queued';
        };
        Relationships: [
          {
            foreignKeyName: 'alert_deliveries_alert_id_fkey';
            columns: ['alert_id'];
            referencedRelation: 'alerts';
            referencedColumns: ['id'];
          }
        ];
      };
      alert_rules: {
        Row: {
          active_hours: Json | null;
          ad_account_id: string | null;
          config: Json;
          cooldown_minutes: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          org_id: string;
          rule_type:
            | 'balance_threshold'
            | 'spend_spike'
            | 'time_to_depletion'
            | 'spend_anomaly'
            | 'account_status_change'
            | 'zero_spend';
          severity: 'info' | 'warning' | 'critical' | 'emergency';
          updated_at: string;
        };
        Insert: {
          active_hours?: Json | null;
          ad_account_id?: string | null;
          config?: Json;
          cooldown_minutes?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          org_id: string;
          rule_type:
            | 'balance_threshold'
            | 'spend_spike'
            | 'time_to_depletion'
            | 'spend_anomaly'
            | 'account_status_change'
            | 'zero_spend';
          severity?: 'info' | 'warning' | 'critical' | 'emergency';
          updated_at?: string;
        };
        Update: {
          active_hours?: Json | null;
          ad_account_id?: string | null;
          config?: Json;
          cooldown_minutes?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          org_id?: string;
          rule_type?:
            | 'balance_threshold'
            | 'spend_spike'
            | 'time_to_depletion'
            | 'spend_anomaly'
            | 'account_status_change'
            | 'zero_spend';
          severity?: 'info' | 'warning' | 'critical' | 'emergency';
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alert_rules_ad_account_id_fkey';
            columns: ['ad_account_id'];
            referencedRelation: 'ad_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alert_rules_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alert_rules_org_id_fkey';
            columns: ['org_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };
      alerts: {
        Row: {
          acknowledged_by: string | null;
          acknowledged_at: string | null;
          ad_account_id: string;
          alert_rule_id: string;
          context_data: Json;
          created_at: string;
          id: string;
          message: string;
          org_id: string;
          resolved_at: string | null;
          severity: 'info' | 'warning' | 'critical' | 'emergency';
          status: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
          title: string;
        };
        Insert: {
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
          ad_account_id: string;
          alert_rule_id: string;
          context_data?: Json;
          created_at?: string;
          id?: string;
          message: string;
          org_id: string;
          resolved_at?: string | null;
          severity?: 'info' | 'warning' | 'critical' | 'emergency';
          status?: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
          title: string;
        };
        Update: {
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
          ad_account_id?: string;
          alert_rule_id?: string;
          context_data?: Json;
          created_at?: string;
          id?: string;
          message?: string;
          org_id?: string;
          resolved_at?: string | null;
          severity?: 'info' | 'warning' | 'critical' | 'emergency';
          status?: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alerts_ad_account_id_fkey';
            columns: ['ad_account_id'];
            referencedRelation: 'ad_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_alert_rule_id_fkey';
            columns: ['alert_rule_id'];
            referencedRelation: 'alert_rules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_org_id_fkey';
            columns: ['org_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };
      balance_snapshots: {
        Row: {
          ad_account_id: string;
          available_funds: string | null;
          balance: string;
          captured_at: string;
          created_at: string;
          currency: string;
          id: string;
          org_id: string;
          pipeline_run_id: string | null;
        };
        Insert: {
          ad_account_id: string;
          available_funds?: string | null;
          balance: string;
          captured_at?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          org_id: string;
          pipeline_run_id?: string | null;
        };
        Update: {
          ad_account_id?: string;
          available_funds?: string | null;
          balance?: string;
          captured_at?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          org_id?: string;
          pipeline_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'balance_snapshots_ad_account_id_fkey';
            columns: ['ad_account_id'];
            referencedRelation: 'ad_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'balance_snapshots_org_id_fkey';
            columns: ['org_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'balance_snapshots_pipeline_run_id_fkey';
            columns: ['pipeline_run_id'];
            referencedRelation: 'pipeline_runs';
            referencedColumns: ['id'];
          }
        ];
      };
      notification_channels: {
        Row: {
          active_hours: Json | null;
          channel_type: string;
          config: Json;
          created_at: string;
          id: string;
          is_enabled: boolean;
          min_severity: 'info' | 'warning' | 'critical' | 'emergency';
          name: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          active_hours?: Json | null;
          channel_type: string;
          config?: Json;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          min_severity?: 'info' | 'warning' | 'critical' | 'emergency';
          name: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          active_hours?: Json | null;
          channel_type?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          min_severity?: 'info' | 'warning' | 'critical' | 'emergency';
          name?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_channels_org_id_fkey';
            columns: ['org_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };
      organizations: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          name: string;
          settings: Json;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          settings?: Json;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          settings?: Json;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pipeline_runs: {
        Row: {
          accounts_failed: number | null;
          accounts_processed: number | null;
          completed_at: string | null;
          created_at: string;
          error_log: Json | null;
          id: string;
          metadata: Json;
          org_id: string;
          pipeline_name: string;
          started_at: string;
          status: 'running' | 'success' | 'failed' | 'partial';
        };
        Insert: {
          accounts_failed?: number | null;
          accounts_processed?: number | null;
          completed_at?: string | null;
          created_at?: string;
          error_log?: Json | null;
          id?: string;
          metadata?: Json;
          org_id: string;
          pipeline_name: string;
          started_at?: string;
          status: 'running' | 'success' | 'failed' | 'partial';
        };
        Update: {
          accounts_failed?: number | null;
          accounts_processed?: number | null;
          completed_at?: string | null;
          created_at?: string;
          error_log?: Json | null;
          id?: string;
          metadata?: Json;
          org_id?: string;
          pipeline_name?: string;
          started_at?: string;
          status?: 'running' | 'success' | 'failed' | 'partial';
        };
        Relationships: [
          {
            foreignKeyName: 'pipeline_runs_org_id_fkey';
            columns: ['org_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };
      platforms: {
        Row: {
          api_version: string | null;
          config: Json;
          created_at: string;
          display_name: string;
          icon_url: string | null;
          id: string;
          is_active: boolean;
          updated_at: string;
        };
        Insert: {
          api_version?: string | null;
          config?: Json;
          created_at?: string;
          display_name: string;
          icon_url?: string | null;
          id: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Update: {
          api_version?: string | null;
          config?: Json;
          created_at?: string;
          display_name?: string;
          icon_url?: string | null;
          id?: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string;
          id: string;
          org_id: string;
          role: 'admin' | 'manager' | 'viewer';
          settings: Json;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name: string;
          id: string;
          org_id: string;
          role?: 'admin' | 'manager' | 'viewer';
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          org_id?: string;
          role?: 'admin' | 'manager' | 'viewer';
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_org_id_fkey';
            columns: ['org_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };
      spend_records: {
        Row: {
          ad_account_id: string;
          created_at: string;
          currency: string;
          date: string;
          daily_spend: string;
          id: string;
          mtd_spend: string | null;
          org_id: string;
          pipeline_run_id: string | null;
          raw_data: Json | null;
          updated_at: string;
        };
        Insert: {
          ad_account_id: string;
          created_at?: string;
          currency?: string;
          date: string;
          daily_spend?: string;
          id?: string;
          mtd_spend?: string | null;
          org_id: string;
          pipeline_run_id?: string | null;
          raw_data?: Json | null;
          updated_at?: string;
        };
        Update: {
          ad_account_id?: string;
          created_at?: string;
          currency?: string;
          date?: string;
          daily_spend?: string;
          id?: string;
          mtd_spend?: string | null;
          org_id?: string;
          pipeline_run_id?: string | null;
          raw_data?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'spend_records_ad_account_id_fkey';
            columns: ['ad_account_id'];
            referencedRelation: 'ad_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'spend_records_org_id_fkey';
            columns: ['org_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'spend_records_pipeline_run_id_fkey';
            columns: ['pipeline_run_id'];
            referencedRelation: 'pipeline_runs';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      handle_new_user: {
        Args: Record<string, never>;
        Returns: Record<string, unknown>;
      };
      update_ad_account_balance: {
        Args: Record<string, never>;
        Returns: Record<string, unknown>;
      };
      update_ad_account_spend: {
        Args: Record<string, never>;
        Returns: Record<string, unknown>;
      };
      update_updated_at_column: {
        Args: Record<string, never>;
        Returns: Record<string, unknown>;
      };
      update_user_role_claim: {
        Args: Record<string, never>;
        Returns: Record<string, unknown>;
      };
    };
    Enums: Record<string, never>;
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          id: string;
          name: string;
          owner: string | null;
          public: boolean;
          created_at: string | null;
          updated_at: string | null;
          file_size_limit: number | null;
          allowed_mime_types: string[] | null;
        };
        Insert: {
          id: string;
          name: string;
          owner?: string | null;
          public?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
          file_size_limit?: number | null;
          allowed_mime_types?: string[] | null;
        };
        Update: {
          id?: string;
          name?: string;
          owner?: string | null;
          public?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
          file_size_limit?: number | null;
          allowed_mime_types?: string[] | null;
        };
        Relationships: [];
      };
      migrations: {
        Row: {
          id: number;
          name: string;
          hash: string;
          executed_at: string | null;
        };
        Insert: {
          id: number;
          name: string;
          hash: string;
          executed_at?: string | null;
        };
        Update: {
          id?: number;
          name?: string;
          hash?: string;
          executed_at?: string | null;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          bucket_id: string;
          id: string;
          name: string;
          owner: string | null;
          created_at: string | null;
          updated_at: string | null;
          last_accessed_at: string | null;
          metadata: Json | null;
          path_tokens: string[] | null;
          version: string | null;
        };
        Insert: {
          bucket_id: string;
          id?: string;
          name: string;
          owner?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          path_tokens?: string[] | null;
          version?: string | null;
        };
        Update: {
          bucket_id?: string;
          id?: string;
          name?: string;
          owner?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          path_tokens?: string[] | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'objects_bucket_id_fkey';
            columns: ['bucket_id'];
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      extension: {
        Args: { name: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Insert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type Update<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
