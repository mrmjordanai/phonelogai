'use client';

/**
 * RBAC Authentication Hooks
 * Advanced hooks for role-based access control
 */

import { useState, useEffect, useCallback } from 'react';
import type { 
  UserRole, 
  RBACResource, 
  RBACAction,
  PermissionCheckRequest,
  RBACUser 
} from '@phonelogai/shared/rbac';
import { useRBAC } from '../RBACProvider';

/**
 * Hook for bulk permission checking
 */
export function useBulkPermissions(
  permissions: Array<{
    resource: RBACResource;
    action: RBACAction;
    resourceId?: string;
  }>
) {
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const checkPermissions = useCallback(async () => {
    if (permissions.length === 0) return;

    setLoading(true);
    
    try {
      const response = await fetch('/api/rbac/check-bulk-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.results);
      }
    } catch (error) {
      console.error('Bulk permission check failed:', error);
    } finally {
      setLoading(false);
    }
  }, [permissions]);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const hasPermission = useCallback((resource: RBACResource, action: RBACAction, resourceId?: string) => {
    const key = resourceId ? `${resource}:${action}:${resourceId}` : `${resource}:${action}`;
    return results[key] ?? false;
  }, [results]);

  return {
    hasPermission,
    loading,
    refresh: checkPermissions,
  };
}

/**
 * Hook for resource ownership checking
 */
export function useResourceOwnership(resource: RBACResource, resourceId: string | undefined) {
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkOwnership = useCallback(async () => {
    if (!resourceId) {
      setIsOwner(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rbac/check-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource,
          resourceId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsOwner(data.isOwner);
      } else {
        throw new Error('Failed to check ownership');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ownership check failed');
      setIsOwner(false);
    } finally {
      setLoading(false);
    }
  }, [resource, resourceId]);

  useEffect(() => {
    checkOwnership();
  }, [checkOwnership]);

  return {
    isOwner,
    loading,
    error,
    refresh: checkOwnership,
  };
}

/**
 * Hook for role transitions and validations
 */
export function useRoleTransition(targetUserId: string | undefined, currentRole: UserRole) {
  const { user, canManageUser } = useRBAC();
  const [allowedRoles, setAllowedRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const fetchAllowedRoles = useCallback(async () => {
    if (!targetUserId || !user) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/rbac/allowed-roles/${targetUserId}`);
      if (response.ok) {
        const data = await response.json();
        setAllowedRoles(data.allowedRoles);
      }
    } catch (error) {
      console.error('Failed to fetch allowed roles:', error);
      setAllowedRoles([]);
    } finally {
      setLoading(false);
    }
  }, [targetUserId, user]);

  const transitionRole = useCallback(async (newRole: UserRole): Promise<{ success: boolean; error?: string }> => {
    if (!targetUserId) {
      return { success: false, error: 'No target user specified' };
    }

    if (!canManageUser(newRole)) {
      return { success: false, error: 'Insufficient permissions to assign this role' };
    }

    setTransitioning(true);

    try {
      const response = await fetch('/api/rbac/update-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUserId,
          newRole,
        }),
      });

      if (response.ok) {
        await fetchAllowedRoles(); // Refresh allowed roles
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.message || 'Role transition failed' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Role transition failed' 
      };
    } finally {
      setTransitioning(false);
    }
  }, [targetUserId, canManageUser, fetchAllowedRoles]);

  useEffect(() => {
    fetchAllowedRoles();
  }, [fetchAllowedRoles]);

  return {
    allowedRoles,
    loading,
    transitioning,
    transitionRole,
    canManage: (role: UserRole) => canManageUser(role),
  };
}

/**
 * Hook for permission caching and performance optimization
 */
export function usePermissionCache() {
  const [cacheStats, setCacheStats] = useState({
    hitRatio: 0,
    size: 0,
    maxSize: 0,
  });

  const fetchCacheStats = useCallback(async () => {
    try {
      const response = await fetch('/api/rbac/cache-stats');
      if (response.ok) {
        const data = await response.json();
        setCacheStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch cache stats:', error);
    }
  }, []);

  const invalidateCache = useCallback(async (userId?: string) => {
    try {
      const response = await fetch('/api/rbac/invalidate-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        await fetchCacheStats(); // Refresh stats
      }
    } catch (error) {
      console.error('Failed to invalidate cache:', error);
    }
  }, [fetchCacheStats]);

  const warmupCache = useCallback(async () => {
    try {
      await fetch('/api/rbac/warmup-cache', { method: 'POST' });
      await fetchCacheStats();
    } catch (error) {
      console.error('Failed to warm up cache:', error);
    }
  }, [fetchCacheStats]);

  useEffect(() => {
    fetchCacheStats();
  }, [fetchCacheStats]);

  return {
    cacheStats,
    invalidateCache,
    warmupCache,
    refreshStats: fetchCacheStats,
  };
}

/**
 * Hook for audit logging integration
 */
export function useRBACAudit() {
  const logPermissionDenial = useCallback(async (
    resource: RBACResource,
    action: RBACAction,
    resourceId?: string,
    reason?: string
  ) => {
    try {
      await fetch('/api/rbac/audit/permission-denial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource,
          action,
          resourceId,
          reason,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to log permission denial:', error);
    }
  }, []);

  const logRoleChange = useCallback(async (
    targetUserId: string,
    oldRole: UserRole,
    newRole: UserRole,
    reason?: string
  ) => {
    try {
      await fetch('/api/rbac/audit/role-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          oldRole,
          newRole,
          reason,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to log role change:', error);
    }
  }, []);

  const logPrivilegeEscalation = useCallback(async (
    attemptedAction: string,
    targetResource?: string,
    details?: Record<string, any>
  ) => {
    try {
      await fetch('/api/rbac/audit/privilege-escalation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptedAction,
          targetResource,
          details,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to log privilege escalation attempt:', error);
    }
  }, []);

  return {
    logPermissionDenial,
    logRoleChange,
    logPrivilegeEscalation,
  };
}

/**
 * Hook for organization users and role management
 */
export function useOrgUsers() {
  const [users, setUsers] = useState<RBACUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrgUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rbac/org-users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      } else {
        throw new Error('Failed to fetch organization users');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const inviteUser = useCallback(async (
    email: string,
    role: UserRole = 'member'
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/rbac/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });

      if (response.ok) {
        await fetchOrgUsers(); // Refresh users list
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to invite user' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to invite user' 
      };
    }
  }, [fetchOrgUsers]);

  const removeUser = useCallback(async (
    userId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`/api/rbac/remove-user/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchOrgUsers(); // Refresh users list
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to remove user' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to remove user' 
      };
    }
  }, [fetchOrgUsers]);

  useEffect(() => {
    fetchOrgUsers();
  }, [fetchOrgUsers]);

  return {
    users,
    loading,
    error,
    inviteUser,
    removeUser,
    refresh: fetchOrgUsers,
  };
}