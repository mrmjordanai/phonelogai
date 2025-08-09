/**
 * RBAC Utility Functions
 * Helper functions for role comparisons, permission calculations, and validation
 */

import type { UserRole, RBACResource, RBACAction, Permission, RoleComparison } from './types';
import { ROLE_HIERARCHY, PERMISSION_MATRIX } from './constants';

/**
 * Compare two roles in the hierarchy
 */
export function compareRoles(role1: UserRole, role2: UserRole): RoleComparison {
  const power1 = ROLE_HIERARCHY[role1];
  const power2 = ROLE_HIERARCHY[role2];
  const powerDifference = power1 - power2;

  return {
    canElevate: power1 >= power2,
    canDelegate: power1 > power2,
    canManage: power1 > power2,
    powerDifference,
  };
}

/**
 * Get the power level for a role
 */
export function getRolePowerLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role];
}

/**
 * Check if a role can perform an action on a resource
 */
export function roleHasPermission(
  role: UserRole, 
  resource: RBACResource, 
  action: RBACAction
): boolean {
  const matrixEntry = PERMISSION_MATRIX.find(
    entry => entry.role === role && entry.resource === resource
  );

  return matrixEntry?.actions.includes(action) ?? false;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return PERMISSION_MATRIX
    .filter(entry => entry.role === role)
    .flatMap(entry => 
      entry.actions.map(action => ({
        resource: entry.resource,
        action,
        conditions: entry.conditions,
      }))
    );
}

/**
 * Get allowed actions for a role on a resource
 */
export function getAllowedActions(role: UserRole, resource: RBACResource): RBACAction[] {
  const matrixEntry = PERMISSION_MATRIX.find(
    entry => entry.role === role && entry.resource === resource
  );

  return matrixEntry?.actions ?? [];
}

/**
 * Check if a role can escalate to another role
 */
export function canEscalateRole(currentRole: UserRole, targetRole: UserRole): boolean {
  const comparison = compareRoles(currentRole, targetRole);
  return comparison.canElevate;
}

/**
 * Check if a role can manage another role
 */
export function canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
  const comparison = compareRoles(managerRole, targetRole);
  return comparison.canManage;
}

/**
 * Get the highest role from a list of roles
 */
export function getHighestRole(roles: UserRole[]): UserRole | null {
  if (roles.length === 0) return null;
  
  return roles.reduce((highest, current) => 
    getRolePowerLevel(current) > getRolePowerLevel(highest) ? current : highest
  );
}

/**
 * Get the lowest role from a list of roles
 */
export function getLowestRole(roles: UserRole[]): UserRole | null {
  if (roles.length === 0) return null;
  
  return roles.reduce((lowest, current) => 
    getRolePowerLevel(current) < getRolePowerLevel(lowest) ? current : lowest
  );
}

/**
 * Validate if a role is valid
 */
export function isValidRole(role: string): role is UserRole {
  return role in ROLE_HIERARCHY;
}

/**
 * Validate if a resource is valid
 */
export function isValidResource(resource: string): resource is RBACResource {
  const validResources: RBACResource[] = [
    'events', 'contacts', 'privacy_rules', 'organizations', 'users',
    'dashboards', 'integrations', 'billing', 'audit', 'uploads',
    'nlq_queries', 'sync_health', 'webhooks', 'incidents', 'tickets'
  ];
  return validResources.includes(resource as RBACResource);
}

/**
 * Validate if an action is valid
 */
export function isValidAction(action: string): action is RBACAction {
  const validActions: RBACAction[] = ['read', 'write', 'delete', 'manage', 'export', 'bulk'];
  return validActions.includes(action as RBACAction);
}

/**
 * Generate a permission cache key
 */
export function generatePermissionCacheKey(
  userId: string,
  resource: RBACResource,
  action: RBACAction,
  resourceId?: string
): string {
  const parts = [userId, resource, action];
  if (resourceId) parts.push(resourceId);
  return `rbac:perm:${parts.join(':')}`;
}

/**
 * Parse permission conditions for database queries
 */
export function parsePermissionConditions(
  conditions: Permission['conditions'] = [],
  context: Record<string, any> = {}
): Record<string, any> {
  const filters: Record<string, any> = {};

  for (const condition of conditions) {
    let value = condition.value;
    
    // Replace context variables
    if (typeof value === 'string' && value.startsWith('@')) {
      const contextKey = value.substring(1);
      value = context[contextKey] || value;
    }

    switch (condition.operator) {
      case 'eq':
        filters[condition.field] = value;
        break;
      case 'in':
        filters[condition.field] = { in: Array.isArray(value) ? value : [value] };
        break;
      case 'gt':
        filters[condition.field] = { gt: value };
        break;
      case 'lt':
        filters[condition.field] = { lt: value };
        break;
      case 'contains':
        filters[condition.field] = { contains: value };
        break;
      case 'owned_by':
        filters.user_id = context.current_user || value;
        break;
      case 'same_org':
        // Handle in application logic, not database filter
        break;
    }
  }

  return filters;
}

/**
 * Check if a permission is cacheable
 */
export function isPermissionCacheable(
  resource: RBACResource,
  action: RBACAction,
  conditions: Permission['conditions'] = []
): boolean {
  // Don't cache permissions with user-specific conditions
  const hasUserSpecificConditions = conditions.some(condition => 
    condition.field === 'user_id' || 
    condition.operator === 'owned_by' ||
    condition.value?.toString().includes('@current_user')
  );

  // Don't cache sensitive operations
  const sensitiveActions: RBACAction[] = ['delete', 'manage', 'bulk'];
  const isSensitiveAction = sensitiveActions.includes(action);

  // Don't cache time-sensitive resources
  const timeSensitiveResources: RBACResource[] = ['audit', 'billing', 'incidents'];
  const isTimeSensitive = timeSensitiveResources.includes(resource);

  return !hasUserSpecificConditions && !isSensitiveAction && !isTimeSensitive;
}

/**
 * Calculate TTL for cached permissions
 */
export function calculateCacheTTL(
  resource: RBACResource,
  action: RBACAction,
  defaultTTL: number = 300
): number {
  // Shorter TTL for sensitive resources
  const sensitiveResources: RBACResource[] = ['billing', 'users', 'organizations'];
  if (sensitiveResources.includes(resource)) {
    return Math.min(defaultTTL, 60); // Max 1 minute
  }

  // Shorter TTL for write operations
  const writeActions: RBACAction[] = ['write', 'delete', 'manage', 'bulk'];
  if (writeActions.includes(action)) {
    return Math.min(defaultTTL, 120); // Max 2 minutes
  }

  return defaultTTL;
}

/**
 * Sanitize permission metadata for logging
 */
export function sanitizePermissionMetadata(metadata: Record<string, any>): Record<string, any> {
  const sensitiveFields = ['password', 'secret', 'token', 'key', 'private'];
  const sanitized = { ...metadata };

  Object.keys(sanitized).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Create a permission object
 */
export function createPermission(
  resource: RBACResource,
  action: RBACAction,
  conditions?: Permission['conditions']
): Permission {
  return {
    resource,
    action,
    ...(conditions && { conditions }),
  };
}

/**
 * Check if two permissions are equivalent
 */
export function arePermissionsEqual(perm1: Permission, perm2: Permission): boolean {
  if (perm1.resource !== perm2.resource || perm1.action !== perm2.action) {
    return false;
  }

  const conditions1 = perm1.conditions || [];
  const conditions2 = perm2.conditions || [];

  if (conditions1.length !== conditions2.length) {
    return false;
  }

  return conditions1.every(cond1 =>
    conditions2.some(cond2 =>
      cond1.field === cond2.field &&
      cond1.operator === cond2.operator &&
      JSON.stringify(cond1.value) === JSON.stringify(cond2.value)
    )
  );
}