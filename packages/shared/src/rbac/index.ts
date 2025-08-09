/**
 * RBAC Module Exports
 * Centralized exports for Role-Based Access Control
 */

// Types
export type {
  RBACResource,
  RBACAction,
  Permission,
  PermissionCondition,
  RBACUser,
  RBACOrganization,
  PermissionCheckRequest,
  PermissionCheckResult,
  PermissionCacheEntry,
  APIKeyRole,
  JITAccessRequest,
  RBACAuditEvent,
  RoleTemplate,
  RoleDelegation,
  RBACConfig,
  PermissionMatrixEntry,
  RoleComparison,
} from './types';

// Constants
export {
  ROLE_HIERARCHY,
  ROLE_DISPLAY,
  DEFAULT_RBAC_CONFIG,
  PERMISSION_MATRIX,
  ROLE_TEMPLATES,
  RBAC_CACHE_CONFIG,
  RBAC_AUDIT_EVENTS,
  RBAC_ERRORS,
  RBAC_PERFORMANCE,
} from './constants';

// Utilities
export {
  compareRoles,
  getRolePowerLevel,
  roleHasPermission,
  getRolePermissions,
  getAllowedActions,
  canEscalateRole,
  canManageRole,
  getHighestRole,
  getLowestRole,
  isValidRole,
  isValidResource,
  isValidAction,
  generatePermissionCacheKey,
  parsePermissionConditions,
  isPermissionCacheable,
  calculateCacheTTL,
  sanitizePermissionMetadata,
  createPermission,
  arePermissionsEqual,
} from './utils';

// Re-export UserRole from types for convenience
export type { UserRole } from '@phonelogai/types';