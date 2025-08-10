// Database package exports for Call/SMS Intelligence Platform
// Main entry point for database operations

// Export clients
export { supabase, supabaseAdmin, clientConfig, checkConnection, auth, db, createClient } from './client'

// Export types
export * from './types'

// Export utilities  
export { dbUtils } from './utils'
export {
  eventUtils,
  contactUtils,
  privacyUtils,
  syncUtils,
  auditUtils,
  dashboardUtils,
  orgUtils,
  uploadUtils
} from './utils'

// Export heatmap utilities
export * from './heatmap'

// Export RBAC system
export * from './rbac'

// Export security system
export * from './security'

// Re-export common types for convenience
export type {
  Event,
  Contact,
  PrivacyRule,
  SyncHealth,
  OrgRole,
  AuditLog,
  EventInsert,
  ContactInsert,
  PrivacyRuleInsert,
  UserRole,
  EventType,
  EventDirection,
  VisibilityType,
  SyncStatus,
  Database,
  HeatmapDataPoint,
  HeatmapViewMode,
  HeatmapParams,
  HeatmapSummary
} from './types'