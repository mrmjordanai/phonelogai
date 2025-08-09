// Database Types for Call/SMS Intelligence Platform
// Auto-generated from Supabase schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Enum types from database
export type UserRole = 'owner' | 'admin' | 'analyst' | 'member' | 'viewer'
export type EventType = 'call' | 'sms'
export type EventDirection = 'inbound' | 'outbound'
export type VisibilityType = 'private' | 'team' | 'public'
export type SyncStatus = 'healthy' | 'warning' | 'error'
export type UploadStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          user_id: string;
          line_id: string;
          ts: string;
          number: string;
          direction: 'inbound' | 'outbound';
          type: 'call' | 'sms';
          duration: number | null;
          content: string | null;
          contact_id: string | null;
          source: string;
          metadata: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          line_id: string;
          ts: string;
          number: string;
          direction: 'inbound' | 'outbound';
          type: 'call' | 'sms';
          duration?: number | null;
          content?: string | null;
          contact_id?: string | null;
          source?: string;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          line_id?: string;
          ts?: string;
          number?: string;
          direction?: 'inbound' | 'outbound';
          type?: 'call' | 'sms';
          duration?: number | null;
          content?: string | null;
          contact_id?: string | null;
          source?: string;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      contacts: {
        Row: {
          id: string;
          user_id: string;
          number: string;
          name: string | null;
          company: string | null;
          tags: string[];
          first_seen: string;
          last_seen: string;
          total_calls: number;
          total_sms: number;
          metadata: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          number: string;
          name?: string | null;
          company?: string | null;
          tags?: string[];
          first_seen: string;
          last_seen: string;
          total_calls?: number;
          total_sms?: number;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          number?: string;
          name?: string | null;
          company?: string | null;
          tags?: string[];
          first_seen?: string;
          last_seen?: string;
          total_calls?: number;
          total_sms?: number;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      privacy_rules: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string;
          visibility: 'private' | 'team' | 'public';
          anonymize_number: boolean;
          anonymize_content: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          contact_id: string;
          visibility?: 'private' | 'team' | 'public';
          anonymize_number?: boolean;
          anonymize_content?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          contact_id?: string;
          visibility?: 'private' | 'team' | 'public';
          anonymize_number?: boolean;
          anonymize_content?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      sync_health: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          last_sync: string | null;
          queue_depth: number;
          drift_percentage: number;
          status: 'healthy' | 'warning' | 'error';
          error_message: string | null;
          metadata: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          last_sync?: string | null;
          queue_depth?: number;
          drift_percentage?: number;
          status?: 'healthy' | 'warning' | 'error';
          error_message?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: string;
          last_sync?: string | null;
          queue_depth?: number;
          drift_percentage?: number;
          status?: 'healthy' | 'warning' | 'error';
          error_message?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      org_roles: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          role: 'owner' | 'admin' | 'analyst' | 'member' | 'viewer';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id: string;
          role?: 'owner' | 'admin' | 'analyst' | 'member' | 'viewer';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          org_id?: string;
          role?: 'owner' | 'admin' | 'analyst' | 'member' | 'viewer';
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string;
          action: string;
          resource: string;
          resource_id: string | null;
          metadata: Record<string, any>;
          ts: string;
        };
        Insert: {
          id?: string;
          actor_id: string;
          action: string;
          resource: string;
          resource_id?: string | null;
          metadata?: Record<string, any>;
          ts?: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          action?: string;
          resource?: string;
          resource_id?: string | null;
          metadata?: Record<string, any>;
          ts?: string;
        };
      };
      incidents: {
        Row: {
          id: string;
          reporter_id: string;
          kind: string;
          severity: string;
          status: string;
          summary: string;
          description: string | null;
          metadata: Record<string, any>;
          created_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          kind: string;
          severity?: string;
          status?: string;
          summary: string;
          description?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          kind?: string;
          severity?: string;
          status?: string;
          summary?: string;
          description?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
          closed_at?: string | null;
        };
      };
      tickets: {
        Row: {
          id: string;
          user_id: string;
          channel: string;
          status: string;
          subject: string;
          description: string | null;
          priority: string;
          last_activity_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel?: string;
          status?: string;
          subject: string;
          description?: string | null;
          priority?: string;
          last_activity_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          channel?: string;
          status?: string;
          subject?: string;
          description?: string | null;
          priority?: string;
          last_activity_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      billing_subscriptions: {
        Row: {
          id: string;
          org_id: string;
          plan: string;
          seats: number;
          status: string;
          current_period_end: string | null;
          stripe_subscription_id: string | null;
          metadata: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          plan: string;
          seats?: number;
          status?: string;
          current_period_end?: string | null;
          stripe_subscription_id?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          plan?: string;
          seats?: number;
          status?: string;
          current_period_end?: string | null;
          stripe_subscription_id?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      i18n_strings: {
        Row: {
          id: string;
          key: string;
          locale: string;
          text: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          locale: string;
          text: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          locale?: string;
          text?: string;
          updated_at?: string;
        };
      };
      outbox: {
        Row: {
          id: string;
          event_type: string;
          payload: Record<string, any>;
          webhook_url: string;
          status: string;
          attempts: number;
          max_attempts: number;
          next_attempt: string;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          event_type: string;
          payload: Record<string, any>;
          webhook_url: string;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          next_attempt?: string;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          event_type?: string;
          payload?: Record<string, any>;
          webhook_url?: string;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          next_attempt?: string;
          created_at?: string;
          processed_at?: string | null;
        };
      };
      webhook_endpoints: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          secret: string;
          events: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          secret: string;
          events?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          secret?: string;
          events?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      file_uploads: {
        Row: {
          id: string;
          user_id: string;
          filename: string;
          file_type: string;
          file_size: number | null;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          rows_processed: number;
          rows_total: number | null;
          errors: any[];
          metadata: Record<string, any>;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          filename: string;
          file_type: string;
          file_size?: number | null;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          rows_processed?: number;
          rows_total?: number | null;
          errors?: any[];
          metadata?: Record<string, any>;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          filename?: string;
          file_type?: string;
          file_size?: number | null;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          rows_processed?: number;
          rows_total?: number | null;
          errors?: any[];
          metadata?: Record<string, any>;
          created_at?: string;
          completed_at?: string | null;
        };
      };
      nlq_queries: {
        Row: {
          id: string;
          user_id: string;
          query: string;
          sql_generated: string | null;
          results: Record<string, any> | null;
          citations: string[];
          execution_time_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          query: string;
          sql_generated?: string | null;
          results?: Record<string, any> | null;
          citations?: string[];
          execution_time_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          query?: string;
          sql_generated?: string | null;
          results?: Record<string, any> | null;
          citations?: string[];
          execution_time_ms?: number | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_dashboard_metrics: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          total_calls: number;
          total_sms: number;
          unique_contacts: number;
          average_call_duration: number;
        }[];
      };
      detect_data_gaps: {
        Args: {
          p_user_id: string;
          p_threshold_hours?: number;
        };
        Returns: {
          gap_start: string;
          gap_end: string;
          gap_duration_hours: number;
          expected_activity: boolean;
        }[];
      };
      get_filtered_events: {
        Args: {
          p_requesting_user_id: string;
          p_target_user_id?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          id: string;
          user_id: string;
          ts: string;
          number: string;
          direction: 'inbound' | 'outbound';
          type: 'call' | 'sms';
          duration: number | null;
          content: string | null;
          contact_name: string | null;
        }[];
      };
      get_heatmap_data: {
        Args: {
          p_user_id: string;
          p_view_mode?: string;
          p_event_types?: string[];
          p_start_date?: string;
          p_end_date?: string;
        };
        Returns: {
          time_bucket: string;
          day_of_week: number;
          hour_of_day: number;
          call_count: number;
          sms_count: number;
          total_duration: number;
          unique_contacts: number;
          intensity: number;
        }[];
      };
      get_heatmap_summary: {
        Args: {
          p_user_id: string;
          p_start_date?: string;
          p_end_date?: string;
        };
        Returns: Record<string, any>;
      };
    };
    Enums: {
      user_role: 'owner' | 'admin' | 'analyst' | 'member' | 'viewer';
      event_type: 'call' | 'sms';
      event_direction: 'inbound' | 'outbound';
      visibility_type: 'private' | 'team' | 'public';
      sync_status: 'healthy' | 'warning' | 'error';
      upload_status: 'pending' | 'processing' | 'completed' | 'failed';
    };
    CompositeTypes: {
      [_ in never]: never
    }
  };
}

// Convenience type exports
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type Functions<T extends keyof Database['public']['Functions']> = Database['public']['Functions'][T]

// Specific table type exports for convenience
export type Event = Tables<'events'>
export type Contact = Tables<'contacts'>
export type PrivacyRule = Tables<'privacy_rules'>
export type SyncHealth = Tables<'sync_health'>
export type OrgRole = Tables<'org_roles'>
export type AuditLog = Tables<'audit_log'>
export type Incident = Tables<'incidents'>
export type Ticket = Tables<'tickets'>
export type BillingSubscription = Tables<'billing_subscriptions'>
export type I18nString = Tables<'i18n_strings'>
export type Outbox = Tables<'outbox'>
export type WebhookEndpoint = Tables<'webhook_endpoints'>
export type FileUpload = Tables<'file_uploads'>
export type NlqQuery = Tables<'nlq_queries'>

// Insert type exports
export type EventInsert = Inserts<'events'>
export type ContactInsert = Inserts<'contacts'>
export type PrivacyRuleInsert = Inserts<'privacy_rules'>
export type SyncHealthInsert = Inserts<'sync_health'>
export type OrgRoleInsert = Inserts<'org_roles'>
export type AuditLogInsert = Inserts<'audit_log'>

// Update type exports
export type EventUpdate = Updates<'events'>
export type ContactUpdate = Updates<'contacts'>
export type PrivacyRuleUpdate = Updates<'privacy_rules'>
export type SyncHealthUpdate = Updates<'sync_health'>
export type OrgRoleUpdate = Updates<'org_roles'>

// Heatmap-specific types
export type HeatmapDataPoint = {
  time_bucket: string;
  day_of_week: number;
  hour_of_day: number;
  call_count: number;
  sms_count: number;
  total_duration: number;
  unique_contacts: number;
  intensity: number;
}

export type HeatmapViewMode = 'daily' | 'weekly' | 'monthly'

export type HeatmapParams = {
  user_id: string;
  view_mode?: HeatmapViewMode;
  event_types?: EventType[];
  start_date?: string;
  end_date?: string;
}

export type HeatmapSummary = {
  total_events: number;
  avg_daily_activity: number;
  peak_hour: number;
  peak_day: number;
  peak_intensity: number;
  date_range: {
    start: string;
    end: string;
    days: number;
  };
}