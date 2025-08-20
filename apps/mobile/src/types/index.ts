// Mobile-specific types - temporary workaround for build issues
export type UserRole = 'owner' | 'admin' | 'analyst' | 'member' | 'viewer';

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
  privacy_level: 'private' | 'team' | 'public';
  can_access: boolean;
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

export interface QualityScore {
  completeness: number;
  source_reliability: number;
  freshness: number;
  overall: number;
}

export type DataSource = 'carrier' | 'device' | 'manual';
export type ConflictType = 'exact' | 'fuzzy' | 'time_variance';
export type ResolutionStrategy = 'automatic' | 'manual' | 'merge';

// Re-export settings types
export * from './settings';