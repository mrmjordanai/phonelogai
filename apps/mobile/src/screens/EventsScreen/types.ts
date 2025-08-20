// import { Event, Contact, PrivacyRule } from '@phonelogai/types';
// Temporary workaround for module resolution issues

type Contact = {
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
  phone_number?: string;
};

type PrivacyRule = {
  id: string;
  user_id: string;
  contact_id: string;
  visibility: 'private' | 'team' | 'public';
  anonymize_number: boolean;
  anonymize_content: boolean;
  created_at: string;
  updated_at: string;
};

// Enhanced Event type for UI display with all Event properties explicitly included
export interface UIEvent {
  // Core Event properties (from @phonelogai/types Event interface)
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
  
  // UI-specific properties
  contact?: Contact;
  privacy_rule?: PrivacyRule;
  display_name?: string;
  display_number?: string;
  is_anonymized?: boolean;
}

// Filter types
export interface EventFiltersState {
  search: string;
  type?: 'call' | 'sms' | 'all';
  direction?: 'inbound' | 'outbound' | 'all';
  status?: 'answered' | 'missed' | 'busy' | 'declined' | 'all';
  contactId?: string;
  dateRange: {
    start?: Date;
    end?: Date;
  };
  durationRange?: {
    min?: number; // seconds
    max?: number; // seconds
  };
}

// Sort options
export type EventSortOption = 'timestamp' | 'duration' | 'contact' | 'type';
export type SortDirection = 'asc' | 'desc';

export interface EventSortConfig {
  field: EventSortOption;
  direction: SortDirection;
}

// Pagination
export interface EventsPagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  cursor?: string;
}

// Event list state
export interface EventsState {
  events: UIEvent[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  pagination: EventsPagination;
  filters: EventFiltersState;
  sort: EventSortConfig;
}

// Event actions for detail view
export type EventAction = 
  | 'call_back'
  | 'send_sms' 
  | 'add_contact'
  | 'edit_contact'
  | 'block_contact'
  | 'share'
  | 'delete';

// Quick filter presets
export interface QuickFilter {
  id: string;
  name: string;
  filters: Partial<EventFiltersState>;
  icon?: string;
}

// Event grouping for timeline view
export interface EventGroup {
  date: string;
  displayDate: string;
  events: UIEvent[];
  totalEvents: number;
  callCount: number;
  smsCount: number;
}

// Search suggestions
export interface SearchSuggestion {
  type: 'contact' | 'number' | 'recent';
  value: string;
  display: string;
  metadata?: {
    contactId?: string;
    name?: string;
    company?: string;
  };
}

// Performance metrics tracking
export interface EventsPerformanceMetrics {
  renderTime: number;
  scrollPerformance: {
    averageFrameTime: number;
    droppedFrames: number;
  };
  memoryUsage: number;
  lastUpdated: Date;
}

// Empty state types
export type EmptyStateType = 
  | 'no_events'
  | 'no_search_results'
  | 'no_filter_results'
  | 'loading_error'
  | 'network_error'
  | 'permission_required';