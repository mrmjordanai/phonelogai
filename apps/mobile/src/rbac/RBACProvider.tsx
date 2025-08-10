/**
 * Mobile RBAC Provider
 * React Native context for role-based access control with offline support
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { 
  UserRole, 
  RBACResource, 
  RBACAction, 
  Permission,
  RBACUser,
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

const RBAC_STORAGE_KEYS = {
  USER_ROLE: '@rbac_user_role',
  PERMISSIONS: '@rbac_permissions',
  LAST_SYNC: '@rbac_last_sync',
  OFFLINE_CHECKS: '@rbac_offline_checks',
} as const;

interface RBACContextValue {
  // User role information
  user: RBACUser | null;
  role: UserRole | null;
  powerLevel: number;
  permissions: Permission[];
  loading: boolean;
  offline: boolean;

  // Permission checking
  checkPermission: (_resource: RBACResource, _action: RBACAction, _resourceId?: string) => Promise<boolean>;
  hasPermission: (_resource: RBACResource, _action: RBACAction) => boolean;
  canAccess: (_resource: RBACResource, _action: RBACAction, _resourceId?: string) => boolean;

  // Role management
  canManageUser: (_targetRole: UserRole) => boolean;
  canElevateToRole: (_targetRole: UserRole) => boolean;
  getDisplayRole: () => { name: string; description: string } | null;

  // Utility functions
  isOwner: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isMember: boolean;
  isViewer: boolean;

  // Mobile-specific functions
  syncPermissions: () => Promise<void>;
  clearCache: () => Promise<void>;
  getOfflineChecks: () => Promise<Array<{ resource: string; action: string; result: boolean; timestamp: number }>>;
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
  const [offline, setOffline] = useState(false);

  // Load cached RBAC data from AsyncStorage
  const loadCachedData = useCallback(async () => {
    try {
      const [roleData, permissionsData] = await Promise.all([
        AsyncStorage.getItem(RBAC_STORAGE_KEYS.USER_ROLE),
        AsyncStorage.getItem(RBAC_STORAGE_KEYS.PERMISSIONS),
      ]);

      if (roleData && authUser) {
        const cachedRole = JSON.parse(roleData);
        const user: RBACUser = {
          id: authUser.id,
          email: authUser.email,
          role: cachedRole.role,
          orgId: cachedRole.orgId,
          powerLevel: ROLE_HIERARCHY[cachedRole.role as UserRole],
        };
        setRbacUser(user);
      }

      if (permissionsData) {
        const cachedPermissions = JSON.parse(permissionsData);
        setPermissions(cachedPermissions);
      }
    } catch (error) {
      console.error('Failed to load cached RBAC data:', error);
    }
  }, [authUser]);

  // Cache RBAC data to AsyncStorage
  const cacheData = useCallback(async (user: RBACUser | null, permissions: Permission[]) => {
    try {
      await Promise.all([
        user ? AsyncStorage.setItem(RBAC_STORAGE_KEYS.USER_ROLE, JSON.stringify({
          role: user.role,
          orgId: user.orgId,
        })) : AsyncStorage.removeItem(RBAC_STORAGE_KEYS.USER_ROLE),
        AsyncStorage.setItem(RBAC_STORAGE_KEYS.PERMISSIONS, JSON.stringify(permissions)),
        AsyncStorage.setItem(RBAC_STORAGE_KEYS.LAST_SYNC, Date.now().toString()),
      ]);
    } catch (error) {
      console.error('Failed to cache RBAC data:', error);
    }
  }, []);

  // Fetch user permissions from server
  const fetchUserPermissions = useCallback(async () => {
    if (!authUser) {
      setRbacUser(null);
      setPermissions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setOffline(false);

      // Try to fetch from server
      const response = await fetch('/api/rbac/user-permissions', {
        headers: {
          'Authorization': `Bearer ${await authUser.getIdToken()}`,
        },
      });

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

      const userPermissions = data.permissions || getRolePermissions(data.role);

      setRbacUser(user);
      setPermissions(userPermissions);

      // Cache the data
      await cacheData(user, userPermissions);
    } catch (error) {
      console.error('Failed to fetch user permissions:', error);
      setOffline(true);
      
      // Use cached data if available
      await loadCachedData();
    } finally {
      setLoading(false);
    }
  }, [authUser, cacheData, loadCachedData]);

  // Initialize RBAC data
  useEffect(() => {
    const initRBAC = async () => {
      if (!authLoading) {
        // Load cached data first for faster startup
        await loadCachedData();
        // Then fetch fresh data
        await fetchUserPermissions();
      }
    };

    initRBAC();
  }, [authLoading, loadCachedData, fetchUserPermissions]);

  // Permission checking functions
  const checkPermission = useCallback(async (
    resource: RBACResource,
    action: RBACAction,
    resourceId?: string
  ): Promise<boolean> => {
    if (!rbacUser) return false;

    // For offline scenarios, use cached permissions
    if (offline) {
      const hasBasicPermission = roleHasPermission(rbacUser.role, resource, action);
      
      // Store offline check for later sync
      const offlineCheck = {
        resource,
        action,
        resourceId,
        result: hasBasicPermission,
        timestamp: Date.now(),
      };

      try {
        const existingChecks = await AsyncStorage.getItem(RBAC_STORAGE_KEYS.OFFLINE_CHECKS);
        const checks = existingChecks ? JSON.parse(existingChecks) : [];
        checks.push(offlineCheck);
        await AsyncStorage.setItem(RBAC_STORAGE_KEYS.OFFLINE_CHECKS, JSON.stringify(checks));
      } catch (error) {
        console.error('Failed to store offline permission check:', error);
      }

      return hasBasicPermission;
    }

    // Online permission check
    try {
      const response = await fetch('/api/rbac/check-permission', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await authUser?.getIdToken()}`,
        },
        body: JSON.stringify({
          resource,
          action,
          resourceId,
        }),
      });

      if (!response.ok) {
        // Fallback to cached check
        return roleHasPermission(rbacUser.role, resource, action);
      }

      const result = await response.json();
      return result.allowed === true;
    } catch (error) {
      console.error('Permission check failed:', error);
      // Fallback to basic role check
      return roleHasPermission(rbacUser.role, resource, action);
    }
  }, [rbacUser, offline, authUser]);

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
    _resourceId?: string
  ): boolean => {
    // For immediate UI decisions, use cached permission check
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

  // Mobile-specific functions
  const syncPermissions = useCallback(async () => {
    await fetchUserPermissions();
  }, [fetchUserPermissions]);

  const clearCache = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(RBAC_STORAGE_KEYS.USER_ROLE),
        AsyncStorage.removeItem(RBAC_STORAGE_KEYS.PERMISSIONS),
        AsyncStorage.removeItem(RBAC_STORAGE_KEYS.LAST_SYNC),
        AsyncStorage.removeItem(RBAC_STORAGE_KEYS.OFFLINE_CHECKS),
      ]);
      
      setRbacUser(null);
      setPermissions([]);
    } catch (error) {
      console.error('Failed to clear RBAC cache:', error);
    }
  }, []);

  const getOfflineChecks = useCallback(async () => {
    try {
      const offlineChecks = await AsyncStorage.getItem(RBAC_STORAGE_KEYS.OFFLINE_CHECKS);
      return offlineChecks ? JSON.parse(offlineChecks) : [];
    } catch (error) {
      console.error('Failed to get offline checks:', error);
      return [];
    }
  }, []);

  // Role convenience properties
  const isOwner = rbacUser?.role === 'owner';
  const isAdmin = rbacUser?.role === 'admin' || isOwner;
  const isAnalyst = rbacUser?.role === 'analyst' || isAdmin;
  const isMember = rbacUser?.role === 'member' || isAnalyst;
  const isViewer = rbacUser?.role === 'viewer' || isMember;

  const contextValue: RBACContextValue = {
    user: rbacUser,
    role: rbacUser?.role || null,
    powerLevel: rbacUser?.powerLevel || 0,
    permissions,
    loading: loading || authLoading,
    offline,

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

    syncPermissions,
    clearCache,
    getOfflineChecks,
  };

  return (
    <RBACContext.Provider value={contextValue}>
      {children}
    </RBACContext.Provider>
  );
}

// Mobile-specific hooks
export function usePermission(
  resource: RBACResource,
  action: RBACAction,
  resourceId?: string
): { 
  allowed: boolean; 
  loading: boolean; 
  check: () => Promise<boolean>;
  offline: boolean;
} {
  const { checkPermission, hasPermission, loading, offline } = useRBAC();
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
    offline,
  };
}

// Role-based hook for mobile
export function useRole(): {
  role: UserRole | null;
  isOwner: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isMember: boolean;
  isViewer: boolean;
  canManage: (_targetRole: UserRole) => boolean;
  offline: boolean;
} {
  const { 
    role, 
    isOwner, 
    isAdmin, 
    isAnalyst, 
    isMember, 
    isViewer,
    canManageUser,
    offline
  } = useRBAC();

  return {
    role,
    isOwner,
    isAdmin,
    isAnalyst,
    isMember,
    isViewer,
    canManage: canManageUser,
    offline,
  };
}