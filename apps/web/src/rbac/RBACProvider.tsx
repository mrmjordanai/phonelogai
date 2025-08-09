'use client';

/**
 * RBAC Provider - React context for role-based access control
 * Provides centralized permission checking and role management
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { 
  UserRole, 
  RBACResource, 
  RBACAction, 
  Permission,
  RBACUser,
  PermissionCheckRequest,
  PermissionCheckResult
} from '@phonelogai/shared/rbac';
import {
  ROLE_HIERARCHY,
  ROLE_DISPLAY,
  getRolePowerLevel,
  roleHasPermission,
  getRolePermissions,
  canManageRole,
} from '@phonelogai/shared/rbac';
import { useAuth } from '../components/AuthProvider';

interface RBACContextValue {
  // User role information
  user: RBACUser | null;
  role: UserRole | null;
  powerLevel: number;
  permissions: Permission[];
  loading: boolean;

  // Permission checking
  checkPermission: (resource: RBACResource, action: RBACAction, resourceId?: string) => Promise<boolean>;
  hasPermission: (resource: RBACResource, action: RBACAction) => boolean;
  canAccess: (resource: RBACResource, action: RBACAction, resourceId?: string) => boolean;

  // Role management
  canManageUser: (targetRole: UserRole) => boolean;
  canElevateToRole: (targetRole: UserRole) => boolean;
  getDisplayRole: () => { name: string; description: string } | null;

  // Utility functions
  isOwner: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isMember: boolean;
  isViewer: boolean;

  // Refresh permissions
  refreshPermissions: () => Promise<void>;
}

const RBACContext = createContext<RBACContextValue | undefined>(undefined);

export function useRBAC(): RBACContextValue {
  const context = useContext(RBACContext);
  if (context === undefined) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return context;
}

interface RBACProviderProps {
  children: React.ReactNode;
}

export function RBACProvider({ children }: RBACProviderProps): JSX.Element {
  const { user: authUser, loading: authLoading } = useAuth();
  const [rbacUser, setRbacUser] = useState<RBACUser | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch user role and permissions
  const fetchUserPermissions = useCallback(async () => {
    if (!authUser) {
      setRbacUser(null);
      setPermissions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch user's organization role
      const response = await fetch('/api/rbac/user-permissions');
      if (!response.ok) {
        throw new Error('Failed to fetch user permissions');
      }

      const data = await response.json();
      
      const user: RBACUser = {
        id: authUser.id,
        email: authUser.email,
        role: data.role,
        orgId: data.orgId,
        powerLevel: ROLE_HIERARCHY[data.role as UserRole],
        permissions: data.permissions,
      };

      setRbacUser(user);
      setPermissions(data.permissions || getRolePermissions(data.role));
    } catch (error) {
      console.error('Failed to fetch user permissions:', error);
      setRbacUser(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    fetchUserPermissions();
  }, [fetchUserPermissions]);

  // Permission checking functions
  const checkPermission = useCallback(async (
    resource: RBACResource,
    action: RBACAction,
    resourceId?: string
  ): Promise<boolean> => {
    if (!rbacUser) return false;

    try {
      const response = await fetch('/api/rbac/check-permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource,
          action,
          resourceId,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.allowed === true;
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }, [rbacUser]);

  const hasPermission = useCallback((
    resource: RBACResource,
    action: RBACAction
  ): boolean => {
    if (!rbacUser) return false;

    // Check basic role permission first
    const hasRolePermission = roleHasPermission(rbacUser.role, resource, action);
    if (!hasRolePermission) return false;

    // Check if user has specific permission in their permission list
    return permissions.some(perm => 
      perm.resource === resource && perm.action === action
    );
  }, [rbacUser, permissions]);

  const canAccess = useCallback((
    resource: RBACResource,
    action: RBACAction,
    resourceId?: string
  ): boolean => {
    // For immediate UI decisions, use cached permission check
    // For server-side validation, use checkPermission
    return hasPermission(resource, action);
  }, [hasPermission]);

  const canManageUser = useCallback((targetRole: UserRole): boolean => {
    if (!rbacUser) return false;
    return canManageRole(rbacUser.role, targetRole);
  }, [rbacUser]);

  const canElevateToRole = useCallback((targetRole: UserRole): boolean => {
    if (!rbacUser) return false;
    
    // Only owners can create other owners
    if (targetRole === 'owner' && rbacUser.role !== 'owner') {
      return false;
    }

    // Can only assign roles at or below your level
    return rbacUser.powerLevel > getRolePowerLevel(targetRole);
  }, [rbacUser]);

  const getDisplayRole = useCallback(() => {
    if (!rbacUser) return null;
    return ROLE_DISPLAY[rbacUser.role];
  }, [rbacUser]);

  // Role convenience properties
  const isOwner = rbacUser?.role === 'owner';
  const isAdmin = rbacUser?.role === 'admin' || isOwner;
  const isAnalyst = rbacUser?.role === 'analyst' || isAdmin;
  const isMember = rbacUser?.role === 'member' || isAnalyst;
  const isViewer = rbacUser?.role === 'viewer' || isMember;

  const refreshPermissions = useCallback(async () => {
    await fetchUserPermissions();
  }, [fetchUserPermissions]);

  const contextValue: RBACContextValue = {
    user: rbacUser,
    role: rbacUser?.role || null,
    powerLevel: rbacUser?.powerLevel || 0,
    permissions,
    loading: loading || authLoading,

    checkPermission,
    hasPermission,
    canAccess,

    canManageUser,
    canElevateToRole,
    getDisplayRole,

    isOwner,
    isAdmin,
    isAnalyst,
    isMember,
    isViewer,

    refreshPermissions,
  };

  return (
    <RBACContext.Provider value={contextValue}>
      {children}
    </RBACContext.Provider>
  );
}

// Hook to check if current user can perform action
export function usePermission(
  resource: RBACResource,
  action: RBACAction,
  resourceId?: string
): { 
  allowed: boolean; 
  loading: boolean; 
  check: () => Promise<boolean> 
} {
  const { checkPermission, hasPermission, loading } = useRBAC();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkPermission(resource, action, resourceId);
      setAllowed(result);
      return result;
    } finally {
      setChecking(false);
    }
  }, [checkPermission, resource, action, resourceId]);

  useEffect(() => {
    // Initial check using cached permissions
    setAllowed(hasPermission(resource, action));
  }, [hasPermission, resource, action]);

  return {
    allowed,
    loading: loading || checking,
    check,
  };
}

// Hook for role-based conditionals
export function useRole(): {
  role: UserRole | null;
  isOwner: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isMember: boolean;
  isViewer: boolean;
  canManage: (targetRole: UserRole) => boolean;
} {
  const { 
    role, 
    isOwner, 
    isAdmin, 
    isAnalyst, 
    isMember, 
    isViewer,
    canManageUser 
  } = useRBAC();

  return {
    role,
    isOwner,
    isAdmin,
    isAnalyst,
    isMember,
    isViewer,
    canManage: canManageUser,
  };
}