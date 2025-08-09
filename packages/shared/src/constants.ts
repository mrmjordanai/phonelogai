export const APP_NAME = 'PhoneLog AI';
export const APP_VERSION = '1.0.0';

// API Constants
export const API_BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const API_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Database Constants
export const TABLES = {
  EVENTS: 'events',
  CONTACTS: 'contacts',
  PRIVACY_RULES: 'privacy_rules',
  SYNC_HEALTH: 'sync_health',
  ORG_ROLES: 'org_roles',
  AUDIT_LOG: 'audit_log',
  INCIDENTS: 'incidents',
  TICKETS: 'tickets',
  BILLING_SUBSCRIPTIONS: 'billing_subscriptions',
  I18N_STRINGS: 'i18n_strings',
  OUTBOX: 'outbox',
  WEBHOOK_ENDPOINTS: 'webhook_endpoints',
} as const;

// Role hierarchy for permissions
export const ROLE_HIERARCHY = {
  owner: 5,
  admin: 4,
  analyst: 3,
  member: 2,
  viewer: 1,
} as const;

// File upload limits
export const FILE_LIMITS = {
  MAX_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_ROWS: 1000000, // 1M rows
  ALLOWED_TYPES: ['pdf', 'csv', 'xlsx'] as const,
} as const;

// Performance targets
export const PERFORMANCE_TARGETS = {
  INGESTION_100K: 5 * 60 * 1000, // 5 minutes in ms
  INGESTION_1M: 30 * 60 * 1000, // 30 minutes in ms
  DASHBOARD_LOAD: 1.5 * 1000, // 1.5 seconds in ms
  NLQ_P50: 2 * 1000, // 2 seconds in ms
  NLQ_P95: 5 * 1000, // 5 seconds in ms
} as const;

// Supported locales
export const SUPPORTED_LOCALES = ['en-US', 'en-GB'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

// Re-export UserRole type from types package for convenience
export type { UserRole } from '@phonelogai/types';