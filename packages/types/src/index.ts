// Core database types
export interface Event {
  id: string;
  user_id: string;
  line_id: string;
  ts: string;
  number: string;
  direction: 'inbound' | 'outbound';
  type: 'call' | 'sms';
  duration?: number;
  content?: string;
  contact_id?: string;
  status?: 'answered' | 'missed' | 'busy' | 'declined';
  source?: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  number: string;
  name?: string;
  company?: string;
  email?: string;
  tags: string[];
  first_seen: string;
  last_seen: string;
  total_calls: number;
  total_sms: number;
  created_at: string;
  updated_at: string;
  // Add phone_number alias for compatibility with data-ingestion
  phone_number?: string;
}

export interface PrivacyRule {
  id: string;
  user_id: string;
  contact_id: string;
  visibility: 'private' | 'team' | 'public';
  anonymize_number: boolean;
  anonymize_content: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncHealth {
  id: string;
  user_id: string;
  source: 'carrier' | 'device' | 'manual';
  last_sync: string;
  queue_depth: number;
  drift_percentage: number;
  status: 'healthy' | 'warning' | 'error';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

// RBAC types
export type UserRole = 'owner' | 'admin' | 'analyst' | 'member' | 'viewer';

export interface OrgRole {
  id: string;
  user_id: string;
  org_id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

// Audit logging
export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  resource: string;
  metadata: Record<string, string | number | boolean | null>;
  ts: string;
}

// Dashboard types
export interface DashboardMetrics {
  totalCalls: number;
  totalSms: number;
  uniqueContacts: number;
  averageCallDuration: number;
  topContacts: Contact[];
  recentActivity: Event[];
}

// NLQ types
export interface NLQQuery {
  id: string;
  user_id: string;
  query: string;
  sql_generated: string;
  results: Record<string, unknown>[];
  citations: string[];
  created_at: string;
}

// File upload types (legacy - use @phonelogai/data-ingestion for new implementations)
export interface FileUpload {
  id: string;
  user_id: string;
  filename: string;
  file_type: 'pdf' | 'csv' | 'xlsx';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rows_processed: number;
  errors: string[];
  created_at: string;
  completed_at?: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Heat-Map Visualization Types
export type HeatMapViewMode = 'daily' | 'weekly' | 'monthly';
export type HeatMapEventType = 'call' | 'sms';

export interface HeatMapDataPoint {
  time_bucket: string;
  day_of_week: number; // 0-6 (Sunday-Saturday)
  hour_of_day: number; // 0-23
  call_count: number;
  sms_count: number;
  total_duration: number; // seconds
  unique_contacts: number;
  intensity: number; // 0.0-1.0 normalized intensity
}

export interface HeatMapSummary {
  total_events: number;
  avg_daily_activity: number;
  peak_hour: number; // 0-23
  peak_day: number; // 0-6 (Sunday-Saturday)
  peak_intensity: number; // 0.0-1.0
  date_range: {
    start: string;
    end: string;
    days: number;
  };
}

export interface HeatMapData {
  dataPoints: HeatMapDataPoint[];
  summary: HeatMapSummary;
  filters: {
    viewMode: HeatMapViewMode;
    eventTypes: HeatMapEventType[];
    dateRange: {
      start: Date;
      end: Date;
    };
  };
}

export interface HeatMapFilters {
  viewMode: HeatMapViewMode;
  eventTypes: HeatMapEventType[];
  startDate: Date;
  endDate: Date;
}

export interface HeatMapTooltipData {
  date: string;
  dayName: string;
  hour: number;
  metrics: {
    totalEvents: number;
    callCount: number;
    smsCount: number;
    totalDuration: number;
    uniqueContacts: number;
    intensity: number;
  };
}

export interface HeatMapExportData {
  format: 'csv' | 'json' | 'png' | 'svg';
  filters: HeatMapFilters;
  data: HeatMapDataPoint[];
  generatedAt: string;
}

// Conflict Resolution Types
export type ConflictType = 'exact' | 'fuzzy' | 'time_variance';
export type ResolutionStrategy = 'automatic' | 'manual' | 'merge';
export type DataSource = 'carrier' | 'device' | 'manual';

export interface QualityScore {
  completeness: number; // 0-1 based on required fields
  source_reliability: number; // carrier(0.9) > device(0.7) > manual(0.5)
  freshness: number; // 0-1 based on sync timestamp age
  overall: number; // weighted average of above scores
}

export interface ConflictEvent {
  id: string;
  user_id: string;
  original: Event;
  duplicate: Event;
  conflict_type: ConflictType;
  similarity: number; // 0-1 similarity score
  original_quality: QualityScore;
  duplicate_quality: QualityScore;
  resolution_strategy: ResolutionStrategy;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_metadata?: Record<string, unknown>;
}

export interface ResolvedConflict {
  conflict_id: string;
  resolution_strategy: ResolutionStrategy;
  merged_event: Event;
  preserved_data: Record<string, unknown>; // Original data backup
  resolution_timestamp: string;
  auto_resolved: boolean;
}

export interface ConflictResolution {
  id: string;
  user_id: string;
  original_event_id: string;
  duplicate_event_id: string;
  resolution_strategy: ResolutionStrategy;
  conflict_type: ConflictType;
  similarity_score: number;
  quality_scores: {
    original: QualityScore;
    duplicate: QualityScore;
  };
  resolution_metadata: Record<string, unknown>;
  resolved_by: string;
  created_at: string;
  resolved_at: string;
}

export interface ConflictBatch {
  id: string;
  conflicts: ConflictEvent[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  batch_type: 'duplicate_group' | 'similarity_cluster' | 'manual_review';
  created_at: string;
  requires_user_input: boolean;
}

export interface ConflictMetrics {
  total_conflicts: number;
  auto_resolved: number;
  manual_resolved: number;
  pending_resolution: number;
  auto_resolution_rate: number; // percentage
  avg_resolution_time: number; // seconds
  data_quality_improvement: number; // percentage
}

// Contact Intelligence Types
export type PrivacyLevel = 'private' | 'team' | 'public';

export interface ContactIntelligence {
  contact: {
    id: string;
    number: string;
    name?: string;
    company?: string;
    tags: string[];
    first_seen: string;
    last_seen: string;
  };
  metrics: {
    total_interactions: number;
    total_calls: number;
    total_sms: number;
    avg_call_duration: number;
    most_active_hour: number;
    most_active_day: number;
    last_contact?: string;
    first_contact?: string;
    contact_frequency: number; // interactions per day
    inbound_ratio: number; // 0-1, ratio of inbound communications
  };
  communication_patterns: {
    hourly_patterns: Array<{ hour: number; count: number }>;
    daily_patterns: Array<{ 
      day: number; 
      count: number; 
    }>;
    monthly_trends: Array<{ 
      month: string; 
      total: number; 
      calls: number;
      sms: number;
    }>;
  };
  recent_events: Event[];
  privacy_level: PrivacyLevel;
  can_edit: boolean;
}

export interface ContactSearchResult {
  contact_id: string;
  number: string;
  name?: string;
  company?: string;
  tags: string[];
  total_interactions: number;
  last_contact?: string;
  contact_score: number;
  match_score: number;
  privacy_level: PrivacyLevel;
  can_access: boolean;
}

export interface ContactPatterns {
  daily_activity: Array<{
    date: string;
    calls: number;
    sms: number;
    total_duration: number;
  }>;
  hourly_distribution: Record<string, number>; // hour -> count
  dow_distribution: Record<string, number>; // day name -> count
  communication_breakdown: {
    total_calls: number;
    total_sms: number;
    inbound_calls: number;
    outbound_calls: number;
    inbound_sms: number;
    outbound_sms: number;
    avg_call_duration: number;
    total_call_time: number;
  };
  analysis_period_days: number;
  generated_at: string;
}

export interface ContactSearchFilters {
  search_term: string;
  tag_filter: string[];
  sort_by: 'relevance' | 'alphabetical' | 'recent' | 'most_active';
  limit: number;
  offset: number;
}

export interface ContactMetrics {
  contact_id: string;
  user_id: string;
  number: string;
  name?: string;
  company?: string;
  tags: string[];
  total_interactions: number;
  total_calls: number;
  total_sms: number;
  avg_call_duration?: number;
  last_interaction?: string;
  first_interaction?: string;
  contact_score: number;
  inbound_ratio: number;
  privacy_level: PrivacyLevel;
}