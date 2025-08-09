/**
 * RBAC Constants and Configuration
 * Centralized constants for Role-Based Access Control
 */

import type { 
  UserRole,  
  PermissionMatrixEntry, 
  RoleTemplate,
  RBACConfig,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RBACResource,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RBACAction
} from './types';

// Role hierarchy with power levels (1-5)
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 1,
  member: 2,
  analyst: 3,
  admin: 4,
  owner: 5,
} as const;

// Role display names and descriptions
export const ROLE_DISPLAY: Record<UserRole, { name: string; description: string }> = {
  owner: {
    name: 'Owner',
    description: 'Full access to all features, billing, and organization settings'
  },
  admin: {
    name: 'Administrator', 
    description: 'User management, privacy rules, integrations, and system configuration'
  },
  analyst: {
    name: 'Analyst',
    description: 'Data exploration, export capabilities, and advanced analytics'
  },
  member: {
    name: 'Member',
    description: 'Full personal data access and team dashboards per privacy policy'
  },
  viewer: {
    name: 'Viewer',
    description: 'Read-only dashboard access with limited data visibility'
  },
} as const;

// Default RBAC configuration
export const DEFAULT_RBAC_CONFIG: RBACConfig = {
  enableCache: true,
  cacheMaxAge: 300, // 5 minutes
  enableAudit: true,
  enableJITAccess: false,
  performanceTargets: {
    permissionCheckLatency: 5, // 5ms
    cacheHitRatio: 0.9, // 90%
    maxCacheSize: 10000, // entries
  },
};

// Resource-Action permission matrix
export const PERMISSION_MATRIX: PermissionMatrixEntry[] = [
  // Events permissions
  {
    role: 'owner',
    resource: 'events',
    actions: ['read', 'write', 'delete', 'manage', 'export', 'bulk'],
  },
  {
    role: 'admin',
    resource: 'events', 
    actions: ['read', 'write', 'delete', 'manage', 'export', 'bulk'],
  },
  {
    role: 'analyst',
    resource: 'events',
    actions: ['read', 'export'],
    conditions: [{ field: 'privacy', operator: 'in', value: ['team', 'public'] }],
  },
  {
    role: 'member',
    resource: 'events',
    actions: ['read', 'write'],
    conditions: [
      { field: 'user_id', operator: 'eq', value: '@current_user' },
      { field: 'privacy', operator: 'in', value: ['team', 'public'] }
    ],
  },
  {
    role: 'viewer',
    resource: 'events',
    actions: ['read'],
    conditions: [{ field: 'privacy', operator: 'eq', value: 'public' }],
  },

  // Contacts permissions
  {
    role: 'owner',
    resource: 'contacts',
    actions: ['read', 'write', 'delete', 'manage', 'export', 'bulk'],
  },
  {
    role: 'admin',
    resource: 'contacts',
    actions: ['read', 'write', 'delete', 'manage', 'export', 'bulk'],
  },
  {
    role: 'analyst',
    resource: 'contacts',
    actions: ['read', 'export'],
    conditions: [{ field: 'privacy', operator: 'in', value: ['team', 'public'] }],
  },
  {
    role: 'member',
    resource: 'contacts',
    actions: ['read', 'write'],
    conditions: [
      { field: 'user_id', operator: 'eq', value: '@current_user' },
      { field: 'privacy', operator: 'in', value: ['team', 'public'] }
    ],
  },
  {
    role: 'viewer',
    resource: 'contacts',
    actions: ['read'],
    conditions: [{ field: 'privacy', operator: 'eq', value: 'public' }],
  },

  // Privacy rules permissions
  {
    role: 'owner',
    resource: 'privacy_rules',
    actions: ['read', 'write', 'delete', 'manage', 'bulk'],
  },
  {
    role: 'admin', 
    resource: 'privacy_rules',
    actions: ['read', 'write', 'delete', 'manage', 'bulk'],
  },
  {
    role: 'analyst',
    resource: 'privacy_rules',
    actions: ['read'],
  },
  {
    role: 'member',
    resource: 'privacy_rules',
    actions: ['read', 'write'],
    conditions: [{ field: 'user_id', operator: 'eq', value: '@current_user' }],
  },
  {
    role: 'viewer',
    resource: 'privacy_rules',
    actions: ['read'],
    conditions: [{ field: 'user_id', operator: 'eq', value: '@current_user' }],
  },

  // Organizations permissions
  {
    role: 'owner',
    resource: 'organizations',
    actions: ['read', 'write', 'delete', 'manage'],
  },
  {
    role: 'admin',
    resource: 'organizations', 
    actions: ['read', 'write'],
  },
  {
    role: 'analyst',
    resource: 'organizations',
    actions: ['read'],
  },
  {
    role: 'member',
    resource: 'organizations',
    actions: ['read'],
  },
  {
    role: 'viewer',
    resource: 'organizations',
    actions: ['read'],
  },

  // Users permissions
  {
    role: 'owner',
    resource: 'users',
    actions: ['read', 'write', 'delete', 'manage'],
  },
  {
    role: 'admin',
    resource: 'users',
    actions: ['read', 'write', 'manage'],
  },
  {
    role: 'analyst',
    resource: 'users',
    actions: ['read'],
    conditions: [{ field: 'org_id', operator: 'same_org', value: '@current_user' }],
  },
  {
    role: 'member',
    resource: 'users',
    actions: ['read'],
    conditions: [
      { field: 'user_id', operator: 'eq', value: '@current_user' },
      { field: 'org_id', operator: 'same_org', value: '@current_user' }
    ],
  },
  {
    role: 'viewer',
    resource: 'users',
    actions: ['read'],
    conditions: [{ field: 'user_id', operator: 'eq', value: '@current_user' }],
  },

  // Dashboards permissions
  {
    role: 'owner',
    resource: 'dashboards',
    actions: ['read', 'write', 'manage'],
  },
  {
    role: 'admin',
    resource: 'dashboards',
    actions: ['read', 'write', 'manage'],
  },
  {
    role: 'analyst',
    resource: 'dashboards',
    actions: ['read', 'write'],
  },
  {
    role: 'member',
    resource: 'dashboards',
    actions: ['read'],
  },
  {
    role: 'viewer',
    resource: 'dashboards',
    actions: ['read'],
  },

  // Integrations permissions
  {
    role: 'owner',
    resource: 'integrations',
    actions: ['read', 'write', 'delete', 'manage'],
  },
  {
    role: 'admin',
    resource: 'integrations',
    actions: ['read', 'write', 'delete', 'manage'],
  },
  {
    role: 'analyst',
    resource: 'integrations',
    actions: ['read'],
  },
  {
    role: 'member',
    resource: 'integrations',
    actions: ['read'],
  },
  {
    role: 'viewer',
    resource: 'integrations',
    actions: [],
  },

  // Billing permissions
  {
    role: 'owner',
    resource: 'billing',
    actions: ['read', 'write', 'manage'],
  },
  {
    role: 'admin',
    resource: 'billing',
    actions: ['read'],
  },
  {
    role: 'analyst',
    resource: 'billing',
    actions: ['read'],
  },
  {
    role: 'member',
    resource: 'billing',
    actions: [],
  },
  {
    role: 'viewer',
    resource: 'billing',
    actions: [],
  },

  // Audit permissions
  {
    role: 'owner',
    resource: 'audit',
    actions: ['read', 'export'],
  },
  {
    role: 'admin',
    resource: 'audit',
    actions: ['read', 'export'],
  },
  {
    role: 'analyst',
    resource: 'audit',
    actions: ['read'],
    conditions: [{ field: 'actor_id', operator: 'same_org', value: '@current_user' }],
  },
  {
    role: 'member',
    resource: 'audit',
    actions: ['read'],
    conditions: [{ field: 'actor_id', operator: 'eq', value: '@current_user' }],
  },
  {
    role: 'viewer',
    resource: 'audit',
    actions: [],
  },

  // File uploads permissions
  {
    role: 'owner',
    resource: 'uploads',
    actions: ['read', 'write', 'delete', 'manage'],
  },
  {
    role: 'admin',
    resource: 'uploads',
    actions: ['read', 'write', 'delete', 'manage'],
  },
  {
    role: 'analyst',
    resource: 'uploads',
    actions: ['read', 'write'],
  },
  {
    role: 'member',
    resource: 'uploads',
    actions: ['read', 'write'],
    conditions: [{ field: 'user_id', operator: 'eq', value: '@current_user' }],
  },
  {
    role: 'viewer',
    resource: 'uploads',
    actions: [],
  },

  // NLQ queries permissions
  {
    role: 'owner',
    resource: 'nlq_queries',
    actions: ['read', 'write', 'delete'],
  },
  {
    role: 'admin',
    resource: 'nlq_queries',
    actions: ['read', 'write', 'delete'],
  },
  {
    role: 'analyst',
    resource: 'nlq_queries',
    actions: ['read', 'write'],
  },
  {
    role: 'member',
    resource: 'nlq_queries',
    actions: ['read', 'write'],
    conditions: [{ field: 'user_id', operator: 'eq', value: '@current_user' }],
  },
  {
    role: 'viewer',
    resource: 'nlq_queries',
    actions: [],
  },

  // Sync health permissions
  {
    role: 'owner',
    resource: 'sync_health',
    actions: ['read', 'manage'],
  },
  {
    role: 'admin',
    resource: 'sync_health',
    actions: ['read', 'manage'],
  },
  {
    role: 'analyst',
    resource: 'sync_health',
    actions: ['read'],
  },
  {
    role: 'member',
    resource: 'sync_health',
    actions: ['read'],
    conditions: [{ field: 'user_id', operator: 'eq', value: '@current_user' }],
  },
  {
    role: 'viewer',
    resource: 'sync_health',
    actions: [],
  },

  // Webhooks permissions
  {
    role: 'owner',
    resource: 'webhooks',
    actions: ['read', 'write', 'delete', 'manage'],
  },
  {
    role: 'admin',
    resource: 'webhooks',
    actions: ['read', 'write', 'delete', 'manage'],
  },
  {
    role: 'analyst',
    resource: 'webhooks',
    actions: ['read'],
  },
  {
    role: 'member',
    resource: 'webhooks',
    actions: ['read', 'write'],
    conditions: [{ field: 'user_id', operator: 'eq', value: '@current_user' }],
  },
  {
    role: 'viewer',
    resource: 'webhooks',
    actions: [],
  },

  // Incidents permissions
  {
    role: 'owner',
    resource: 'incidents',
    actions: ['read', 'write', 'manage'],
  },
  {
    role: 'admin',
    resource: 'incidents',
    actions: ['read', 'write', 'manage'],
  },
  {
    role: 'analyst',
    resource: 'incidents',
    actions: ['read', 'write'],
  },
  {
    role: 'member',
    resource: 'incidents',
    actions: ['read', 'write'],
    conditions: [{ field: 'reporter_id', operator: 'eq', value: '@current_user' }],
  },
  {
    role: 'viewer',
    resource: 'incidents',
    actions: ['write'],
  },

  // Tickets permissions
  {
    role: 'owner',
    resource: 'tickets',
    actions: ['read', 'write', 'manage'],
  },
  {
    role: 'admin',
    resource: 'tickets',
    actions: ['read', 'write', 'manage'],
  },
  {
    role: 'analyst',
    resource: 'tickets',
    actions: ['read', 'write'],
  },
  {
    role: 'member',
    resource: 'tickets',
    actions: ['read', 'write'],
    conditions: [{ field: 'user_id', operator: 'eq', value: '@current_user' }],
  },
  {
    role: 'viewer',
    resource: 'tickets',
    actions: ['write'],
  },
];

// Role templates with pre-configured permission sets
export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    role: 'owner',
    name: 'Organization Owner',
    description: 'Complete control over organization, billing, and all data',
    isDefault: false,
    permissions: PERMISSION_MATRIX
      .filter(entry => entry.role === 'owner')
      .map(entry => ({
        resource: entry.resource,
        action: entry.actions[0], // Take first action for simplicity
        conditions: entry.conditions,
      })),
  },
  {
    role: 'admin',
    name: 'Administrator',
    description: 'User management, system configuration, and data oversight',
    isDefault: false,
    permissions: PERMISSION_MATRIX
      .filter(entry => entry.role === 'admin')
      .map(entry => ({
        resource: entry.resource,
        action: entry.actions[0],
        conditions: entry.conditions,
      })),
  },
  {
    role: 'analyst',
    name: 'Data Analyst',
    description: 'Advanced analytics, reporting, and data exploration',
    isDefault: false,
    permissions: PERMISSION_MATRIX
      .filter(entry => entry.role === 'analyst')
      .map(entry => ({
        resource: entry.resource,
        action: entry.actions[0],
        conditions: entry.conditions,
      })),
  },
  {
    role: 'member',
    name: 'Team Member',
    description: 'Standard access to personal data and team features',
    isDefault: true,
    permissions: PERMISSION_MATRIX
      .filter(entry => entry.role === 'member')
      .map(entry => ({
        resource: entry.resource,
        action: entry.actions[0],
        conditions: entry.conditions,
      })),
  },
  {
    role: 'viewer',
    name: 'Read-Only Viewer',
    description: 'Limited read access to public dashboards and data',
    isDefault: false,
    permissions: PERMISSION_MATRIX
      .filter(entry => entry.role === 'viewer')
      .map(entry => ({
        resource: entry.resource,
        action: entry.actions[0],
        conditions: entry.conditions,
      })),
  },
];

// Cache settings
export const RBAC_CACHE_CONFIG = {
  PREFIX: 'rbac:perm:',
  DEFAULT_TTL: 300, // 5 minutes
  MAX_ENTRIES: 10000,
  CLEANUP_INTERVAL: 60, // 1 minute
} as const;

// Audit event types
export const RBAC_AUDIT_EVENTS = {
  PERMISSION_CHECK: 'permission_check',
  ROLE_CHANGE: 'role_change', 
  POLICY_UPDATE: 'policy_update',
  ACCESS_DENIED: 'access_denied',
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  JIT_ACCESS_REQUEST: 'jit_access_request',
  JIT_ACCESS_GRANTED: 'jit_access_granted',
  JIT_ACCESS_DENIED: 'jit_access_denied',
} as const;

// Error messages
export const RBAC_ERRORS = {
  ACCESS_DENIED: 'Access denied: Insufficient permissions',
  INVALID_ROLE: 'Invalid role specified',
  INVALID_RESOURCE: 'Invalid resource specified', 
  INVALID_ACTION: 'Invalid action specified',
  USER_NOT_FOUND: 'User not found or not in organization',
  ORG_NOT_FOUND: 'Organization not found',
  PRIVILEGE_ESCALATION: 'Cannot assign role higher than your own',
  CACHE_ERROR: 'Permission cache error',
  DATABASE_ERROR: 'Database permission check failed',
} as const;

// Performance thresholds
export const RBAC_PERFORMANCE = {
  MAX_PERMISSION_CHECK_MS: 5,
  MIN_CACHE_HIT_RATIO: 0.9,
  MAX_DATABASE_QUERIES_PER_CHECK: 3,
  CACHE_WARMUP_SIZE: 1000,
} as const;