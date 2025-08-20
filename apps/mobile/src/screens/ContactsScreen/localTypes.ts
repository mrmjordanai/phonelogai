// Local type definitions for ContactsScreen to bypass package dependency issues
// This is a temporary solution until the monorepo dependency chain is resolved

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
  privacy_level: 'private' | 'team' | 'public';
  can_access: boolean;
}

export interface ContactIntelligence {
  contact: {
    id: string;
    number: string;
    name?: string;
    company?: string;
    tags: string[];
    first_seen: string;
    last_seen: string;
    total_calls: number;
    total_sms: number;
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
    contact_frequency: number;
    inbound_ratio: number;
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
  recent_events: unknown[]; // Events interface would be complex, using unknown for type safety
  privacy_level: 'private' | 'team' | 'public';
  can_edit: boolean;
}

export interface ContactSearchFilters {
  search_term: string;
  tag_filter: string[];
  sort_by: 'relevance' | 'name' | 'last_contact' | 'interaction_frequency';
  limit: number;
  offset: number;
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