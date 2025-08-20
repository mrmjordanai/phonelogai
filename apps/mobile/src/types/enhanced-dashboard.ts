/**
 * Enhanced Dashboard Types
 * Additional types for real-time monitoring and performance tracking
 */

// Temporary ConflictMetrics type until @phonelogai/types is properly set up
export interface ConflictMetrics {
  total_conflicts: number;
  auto_resolution_rate: number;
  pending_resolution: number;
  data_quality_improvement: number;
  resolved_automatic?: number;
  resolved_manual?: number;
}
import { SyncHealthStatus } from '../services/SyncHealthMonitor';
import { QueueStats } from '../services/OfflineQueue';

// Basic dashboard data types - aligned with EnhancedMetrics from DashboardService
export interface BasicMetrics {
  total_events: number;
  total_calls: number;
  total_sms: number;
  unique_contacts: number;
  avg_call_duration_minutes: number;
  last_30_days_events: number;
  busiest_hour?: number;
  top_contact?: {
    contact_id: string;
    name: string;
    number: string;
    interaction_count: number;
  };
  generated_at: number;
  // Optional compatibility fields
  date_range_start?: string;
  date_range_end?: string;
  last_updated?: string;
}

export interface TimeSeriesData {
  granularity: 'daily' | 'weekly' | 'hourly';
  date_from: string;
  date_to: string;
  total_periods: number;
  summary: {
    total_events: number;
    total_calls: number;
    total_sms: number;
    avg_events_per_period: number;
    peak_period: string;
  };
  data: Array<{
    time_bucket: string;
    timestamp: string;
    total_events: number;
    calls: number;
    sms: number;
    inbound: number;
    outbound: number;
    unique_contacts: number;
    avg_duration: number;
  }>;
  generated_at: string;
}

export interface ActivityHeatmapData {
  days_analyzed: number;
  max_activity: number;
  data: Array<{
    day_of_week: number;
    hour: number;
    count: number;
    intensity: number;
  }>;
  day_labels: string[];
  generated_at: string;
}

export interface CallPatternsData {
  analysis_period_days: number;
  summary: {
    total_calls: number;
    total_sms: number;
    inbound_count: number;
    outbound_count: number;
    avg_call_duration: number;
    duration_stddev: number;
    max_call_duration: number;
    min_call_duration: number;
  };
  peak_hours: Array<{
    hour: number;
    event_count: number;
    call_count: number;
    avg_duration: number;
  }>;
  duration_distribution: Array<{
    bucket: string;
    count: number;
    percentage: number;
  }>;
  generated_at: string;
}

export interface PerformanceMetrics {
  memoryUsage: number; // MB
  renderTime: number; // milliseconds
  networkLatency: number; // milliseconds
  syncLatency: number; // milliseconds
  batteryOptimized: boolean;
  lastUpdated: Date;
}

export interface NetworkStatus {
  isConnected: boolean;
  connectionType: 'wifi' | 'cellular' | 'unknown';
  isMetered: boolean;
  quality: 'excellent' | 'good' | 'poor' | 'offline';
  latency?: number; // milliseconds
}

export interface EnhancedDashboardState {
  // Existing analytics data
  basicMetrics: BasicMetrics | null;
  timeSeriesData: TimeSeriesData | null;
  activityHeatmap: ActivityHeatmapData | null;
  callPatterns: CallPatternsData | null;
  
  // New real-time data
  syncHealthStatus: SyncHealthStatus | null;
  conflictMetrics: ConflictMetrics | null;
  queueStats: QueueStats | null;
  performanceMetrics: PerformanceMetrics | null;
  networkStatus: NetworkStatus;
  
  // Loading states
  loading: {
    basicMetrics: boolean;
    timeSeriesData: boolean;
    activityHeatmap: boolean;
    callPatterns: boolean;
    syncHealth: boolean;
    conflictMetrics: boolean;
    performance: boolean;
  };
  
  // Error states
  error: {
    basicMetrics: string | null;
    timeSeriesData: string | null;
    activityHeatmap: string | null;
    callPatterns: string | null;
    syncHealth: string | null;
    conflictMetrics: string | null;
    performance: string | null;
  };
  
  refreshing: boolean;
  lastUpdated: Date | null;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  backgroundColor: string;
  onPress: () => void;
  badge?: number;
  loading?: boolean;
  disabled?: boolean;
}

export interface SyncHealthIssueAction {
  id: string;
  label: string;
  onPress: () => void;
  type: 'primary' | 'secondary' | 'danger';
}

export interface DataQualityInsight {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  description: string;
  value?: number;
  target?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export interface PerformanceAlert {
  id: string;
  type: 'memory' | 'network' | 'battery' | 'sync';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  recommendation?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export interface DashboardRealTimeEvent {
  type: 'sync_status_changed' | 'conflict_metrics_updated' | 'performance_alert' | 'network_changed';
  data: SyncHealthStatus | ConflictMetrics | PerformanceMetrics | NetworkStatus;
  timestamp: Date;
}