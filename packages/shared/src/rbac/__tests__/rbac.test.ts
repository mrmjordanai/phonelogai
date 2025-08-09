/**
 * RBAC System Tests
 * Comprehensive test suite for role-based access control
 */

import { describe, it, expect } from '@jest/globals';
import {
  compareRoles,
  getRolePowerLevel,
  roleHasPermission,
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
} from '../utils';
import { ROLE_HIERARCHY, PERMISSION_MATRIX } from '../constants';
import type { UserRole, RBACResource, RBACAction } from '../types';

describe('RBAC Utils', () => {
  describe('Role Comparisons', () => {
    it('should correctly compare role hierarchy', () => {
      const ownerVsAdmin = compareRoles('owner', 'admin');
      expect(ownerVsAdmin.canElevate).toBe(true);
      expect(ownerVsAdmin.canDelegate).toBe(true);
      expect(ownerVsAdmin.canManage).toBe(true);
      expect(ownerVsAdmin.powerDifference).toBe(1);

      const viewerVsOwner = compareRoles('viewer', 'owner');
      expect(viewerVsOwner.canElevate).toBe(false);
      expect(viewerVsOwner.canDelegate).toBe(false);
      expect(viewerVsOwner.canManage).toBe(false);
      expect(viewerVsOwner.powerDifference).toBe(-4);

      const memberVsMember = compareRoles('member', 'member');
      expect(memberVsMember.canElevate).toBe(true);
      expect(memberVsMember.canDelegate).toBe(false);
      expect(memberVsMember.canManage).toBe(false);
      expect(memberVsMember.powerDifference).toBe(0);
    });

    it('should get correct power levels', () => {
      expect(getRolePowerLevel('viewer')).toBe(1);
      expect(getRolePowerLevel('member')).toBe(2);
      expect(getRolePowerLevel('analyst')).toBe(3);
      expect(getRolePowerLevel('admin')).toBe(4);
      expect(getRolePowerLevel('owner')).toBe(5);
    });

    it('should determine role management capabilities', () => {
      expect(canManageRole('owner', 'admin')).toBe(true);
      expect(canManageRole('admin', 'member')).toBe(true);
      expect(canManageRole('member', 'admin')).toBe(false);
      expect(canManageRole('viewer', 'owner')).toBe(false);
    });

    it('should determine role escalation capabilities', () => {
      expect(canEscalateRole('admin', 'owner')).toBe(true);
      expect(canEscalateRole('member', 'admin')).toBe(true);
      expect(canEscalateRole('viewer', 'owner')).toBe(true);
      expect(canEscalateRole('analyst', 'viewer')).toBe(true); // Can always escalate to lower
    });
  });

  describe('Permission System', () => {
    it('should correctly identify role permissions', () => {
      expect(roleHasPermission('owner', 'events', 'read')).toBe(true);
      expect(roleHasPermission('owner', 'events', 'delete')).toBe(true);
      expect(roleHasPermission('viewer', 'events', 'delete')).toBe(false);
      expect(roleHasPermission('analyst', 'events', 'export')).toBe(true);
      expect(roleHasPermission('member', 'events', 'export')).toBe(false);
    });

    it('should return allowed actions for roles', () => {
      const ownerActions = getAllowedActions('owner', 'events');
      expect(ownerActions).toContain('read');
      expect(ownerActions).toContain('write');
      expect(ownerActions).toContain('delete');
      expect(ownerActions).toContain('manage');
      expect(ownerActions).toContain('export');
      expect(ownerActions).toContain('bulk');

      const viewerActions = getAllowedActions('viewer', 'events');
      expect(viewerActions).toContain('read');
      expect(viewerActions).not.toContain('write');
      expect(viewerActions).not.toContain('delete');
      expect(viewerActions).not.toContain('manage');
    });

    it('should validate billing permissions by role', () => {
      expect(roleHasPermission('owner', 'billing', 'read')).toBe(true);
      expect(roleHasPermission('owner', 'billing', 'manage')).toBe(true);
      expect(roleHasPermission('admin', 'billing', 'read')).toBe(true);
      expect(roleHasPermission('admin', 'billing', 'manage')).toBe(false);
      expect(roleHasPermission('member', 'billing', 'read')).toBe(false);
    });

    it('should validate audit permissions by role', () => {
      expect(roleHasPermission('owner', 'audit', 'read')).toBe(true);
      expect(roleHasPermission('admin', 'audit', 'read')).toBe(true);
      expect(roleHasPermission('analyst', 'audit', 'read')).toBe(true);
      expect(roleHasPermission('member', 'audit', 'read')).toBe(true);
      expect(roleHasPermission('viewer', 'audit', 'read')).toBe(false);
    });
  });

  describe('Role Collections', () => {
    it('should find highest role', () => {
      const roles: UserRole[] = ['member', 'admin', 'viewer'];
      expect(getHighestRole(roles)).toBe('admin');

      const singleRole: UserRole[] = ['owner'];
      expect(getHighestRole(singleRole)).toBe('owner');

      expect(getHighestRole([])).toBeNull();
    });

    it('should find lowest role', () => {
      const roles: UserRole[] = ['member', 'admin', 'viewer'];
      expect(getLowestRole(roles)).toBe('viewer');

      const singleRole: UserRole[] = ['owner'];
      expect(getLowestRole(singleRole)).toBe('owner');

      expect(getLowestRole([])).toBeNull();
    });
  });

  describe('Validation Functions', () => {
    it('should validate roles', () => {
      expect(isValidRole('owner')).toBe(true);
      expect(isValidRole('admin')).toBe(true);
      expect(isValidRole('member')).toBe(true);
      expect(isValidRole('invalid')).toBe(false);
      expect(isValidRole('')).toBe(false);
    });

    it('should validate resources', () => {
      expect(isValidResource('events')).toBe(true);
      expect(isValidResource('contacts')).toBe(true);
      expect(isValidResource('billing')).toBe(true);
      expect(isValidResource('invalid')).toBe(false);
      expect(isValidResource('')).toBe(false);
    });

    it('should validate actions', () => {
      expect(isValidAction('read')).toBe(true);
      expect(isValidAction('write')).toBe(true);
      expect(isValidAction('delete')).toBe(true);
      expect(isValidAction('invalid')).toBe(false);
      expect(isValidAction('')).toBe(false);
    });
  });

  describe('Caching System', () => {
    it('should generate consistent cache keys', () => {
      const key1 = generatePermissionCacheKey('user1', 'events', 'read');
      const key2 = generatePermissionCacheKey('user1', 'events', 'read');
      expect(key1).toBe(key2);

      const keyWithResource = generatePermissionCacheKey('user1', 'events', 'read', 'resource1');
      expect(keyWithResource).toContain('resource1');
    });

    it('should determine cacheability correctly', () => {
      // Non-sensitive read operations should be cacheable
      expect(isPermissionCacheable('events', 'read')).toBe(true);
      expect(isPermissionCacheable('contacts', 'read')).toBe(true);

      // Sensitive operations should not be cacheable
      expect(isPermissionCacheable('events', 'delete')).toBe(false);
      expect(isPermissionCacheable('events', 'manage')).toBe(false);
      expect(isPermissionCacheable('events', 'bulk')).toBe(false);

      // Time-sensitive resources should not be cacheable
      expect(isPermissionCacheable('audit', 'read')).toBe(false);
      expect(isPermissionCacheable('billing', 'read')).toBe(false);
      expect(isPermissionCacheable('incidents', 'read')).toBe(false);
    });

    it('should calculate appropriate cache TTL', () => {
      const defaultTTL = 300;

      // Sensitive resources should have shorter TTL
      expect(calculateCacheTTL('billing', 'read', defaultTTL)).toBeLessThanOrEqual(60);
      expect(calculateCacheTTL('users', 'read', defaultTTL)).toBeLessThanOrEqual(60);

      // Write operations should have shorter TTL
      expect(calculateCacheTTL('events', 'write', defaultTTL)).toBeLessThanOrEqual(120);
      expect(calculateCacheTTL('events', 'delete', defaultTTL)).toBeLessThanOrEqual(120);

      // Read operations on non-sensitive resources should use full TTL
      expect(calculateCacheTTL('events', 'read', defaultTTL)).toBe(defaultTTL);
    });
  });

  describe('Permission Conditions', () => {
    it('should parse permission conditions correctly', () => {
      const conditions = [
        { field: 'user_id', operator: 'eq' as const, value: '@current_user' },
        { field: 'privacy', operator: 'in' as const, value: ['team', 'public'] },
      ];

      const context = { current_user: 'user123' };
      const filters = parsePermissionConditions(conditions, context);

      expect(filters.user_id).toBe('user123');
      expect(filters.privacy).toEqual({ in: ['team', 'public'] });
    });

    it('should handle different condition operators', () => {
      const conditions = [
        { field: 'count', operator: 'gt' as const, value: 10 },
        { field: 'name', operator: 'contains' as const, value: 'test' },
      ];

      const filters = parsePermissionConditions(conditions);

      expect(filters.count).toEqual({ gt: 10 });
      expect(filters.name).toEqual({ contains: 'test' });
    });
  });
});

describe('Permission Matrix Integrity', () => {
  it('should have valid role hierarchy', () => {
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.analyst);
    expect(ROLE_HIERARCHY.analyst).toBeGreaterThan(ROLE_HIERARCHY.member);
    expect(ROLE_HIERARCHY.member).toBeGreaterThan(ROLE_HIERARCHY.viewer);
  });

  it('should have consistent permission matrix', () => {
    // Every role should have at least one permission
    const roles: UserRole[] = ['owner', 'admin', 'analyst', 'member', 'viewer'];
    
    for (const role of roles) {
      const rolePermissions = PERMISSION_MATRIX.filter(entry => entry.role === role);
      expect(rolePermissions.length).toBeGreaterThan(0);
    }

    // Owner should have the most permissions
    const ownerPermissions = PERMISSION_MATRIX.filter(entry => entry.role === 'owner');
    const viewerPermissions = PERMISSION_MATRIX.filter(entry => entry.role === 'viewer');
    
    expect(ownerPermissions.length).toBeGreaterThanOrEqual(viewerPermissions.length);
  });

  it('should not allow privilege escalation through matrix', () => {
    // Ensure lower roles don't have permissions higher roles don't have
    const criticalResources: RBACResource[] = ['billing', 'organizations', 'users'];
    const criticalActions: RBACAction[] = ['manage', 'delete'];

    for (const resource of criticalResources) {
      for (const action of criticalActions) {
        const ownerHas = roleHasPermission('owner', resource, action);
        const viewerHas = roleHasPermission('viewer', resource, action);
        
        // If owner doesn't have it, viewer definitely shouldn't
        if (!ownerHas) {
          expect(viewerHas).toBe(false);
        }
      }
    }
  });

  it('should maintain resource access hierarchy', () => {
    // Higher roles should have at least as many permissions as lower roles
    const resources: RBACResource[] = ['events', 'contacts', 'dashboards'];
    
    for (const resource of resources) {
      const ownerActions = getAllowedActions('owner', resource);
      const adminActions = getAllowedActions('admin', resource);
      const memberActions = getAllowedActions('member', resource);
      getAllowedActions('viewer', resource); // Verify viewer actions are calculated

      // Owner should have at least as many actions as admin
      for (const action of adminActions) {
        expect(ownerActions).toContain(action);
      }

      // Admin should have at least as many actions as member (for most resources)
      if (resource !== 'billing') { // Billing is owner-only for manage
        for (const action of memberActions) {
          expect([...adminActions, ...ownerActions]).toContain(action);
        }
      }
    }
  });
});

describe('Security Validation', () => {
  it('should prevent unauthorized access to sensitive resources', () => {
    const sensitiveResources: RBACResource[] = ['billing', 'audit', 'organizations'];
    
    for (const resource of sensitiveResources) {
      // Viewer should not have write access to sensitive resources
      expect(roleHasPermission('viewer', resource, 'write')).toBe(false);
      expect(roleHasPermission('viewer', resource, 'manage')).toBe(false);
      expect(roleHasPermission('viewer', resource, 'delete')).toBe(false);

      // Member should have limited access to sensitive resources
      if (resource === 'billing') {
        expect(roleHasPermission('member', resource, 'read')).toBe(false);
      }
    }
  });

  it('should enforce data export restrictions', () => {
    // Only analyst and above should be able to export
    expect(roleHasPermission('owner', 'events', 'export')).toBe(true);
    expect(roleHasPermission('admin', 'events', 'export')).toBe(true);
    expect(roleHasPermission('analyst', 'events', 'export')).toBe(true);
    expect(roleHasPermission('member', 'events', 'export')).toBe(false);
    expect(roleHasPermission('viewer', 'events', 'export')).toBe(false);
  });

  it('should enforce bulk operation restrictions', () => {
    // Only admin and above should be able to perform bulk operations
    expect(roleHasPermission('owner', 'events', 'bulk')).toBe(true);
    expect(roleHasPermission('admin', 'events', 'bulk')).toBe(true);
    expect(roleHasPermission('analyst', 'events', 'bulk')).toBe(false);
    expect(roleHasPermission('member', 'events', 'bulk')).toBe(false);
    expect(roleHasPermission('viewer', 'events', 'bulk')).toBe(false);
  });

  it('should maintain organization boundary security', () => {
    // Test that role comparisons work correctly for privilege boundaries
    expect(canManageRole('admin', 'owner')).toBe(false); // Admin cannot manage owner
    expect(canManageRole('member', 'admin')).toBe(false); // Member cannot manage admin
    expect(canManageRole('owner', 'admin')).toBe(true);  // Owner can manage admin
  });
});

describe('Edge Cases and Error Handling', () => {
  it('should handle invalid inputs gracefully', () => {
    expect(isValidRole(null as any)).toBe(false);
    expect(isValidRole(undefined as any)).toBe(false);
    expect(isValidResource(123 as any)).toBe(false);
    expect(isValidAction({} as any)).toBe(false);
  });

  it('should handle empty arrays in utility functions', () => {
    expect(getHighestRole([])).toBeNull();
    expect(getLowestRole([])).toBeNull();
  });

  it('should handle edge cases in permission parsing', () => {
    const emptyConditions = parsePermissionConditions([]);
    expect(Object.keys(emptyConditions)).toHaveLength(0);

    const conditionsWithoutContext = parsePermissionConditions([
      { field: 'user_id', operator: 'eq', value: '@current_user' }
    ], {});
    expect(conditionsWithoutContext.user_id).toBe('@current_user'); // Should preserve original value
  });
});