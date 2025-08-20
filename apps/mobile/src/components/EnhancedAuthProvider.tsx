/**
 * Enhanced Mobile AuthProvider with RBAC Integration
 * Combines authentication and role-based access control for React Native
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@phonelogai/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { 
  UserRole, 
  RBACUser, 
  Permission,
  RBACResource,
  RBACAction 
} from '@phonelogai/shared/rbac';
import {
  ROLE_HIERARCHY,
  ROLE_DISPLAY,
  getRolePermissions,
  roleHasPermission,
  canManageRole,
} from '@phonelogai/shared/rbac';

// Helper function to get access token from current session
const getAccessToken = async (): Promise<string | null> => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    console.error('Failed to get session:', error);
    return null;
  }
  return session.access_token;
};

const STORAGE_KEYS = {
  SESSION: 'supabase.session',
  RBAC_USER: 'rbac.user',
  RBAC_PERMISSIONS: 'rbac.permissions',
  RBAC_LAST_SYNC: 'rbac.last_sync',
} as const;

interface EnhancedAuthContextType {
  // Core authentication
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  
  // RBAC integration
  rbacUser: RBACUser | null;
  role: UserRole | null;
  powerLevel: number;
  permissions: Permission[];
  rbacLoading: boolean;
  offline: boolean;
  
  // Permission methods
  hasPermission: (_resource: RBACResource, _action: RBACAction) => boolean;
  checkPermission: (_resource: RBACResource, _action: RBACAction, _resourceId?: string) => Promise<boolean>;
  canManageUser: (_targetRole: UserRole) => boolean;
  
  // Role utilities
  isOwner: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isMember: boolean;
  isViewer: boolean;
  getDisplayRole: () => { name: string; description: string } | null;
  
  // Organization context
  orgId: string | null;
  
  // Mobile-specific methods
  syncRBACData: () => Promise<void>;
  clearRBACCache: () => Promise<void>;
  getLastSyncTime: () => Promise<Date | null>;
  
  // Offline handling
  queueOfflineAction: (_action: Record<string, unknown>) => Promise<void>;
  processOfflineQueue: () => Promise<void>;
}

const EnhancedAuthContext = createContext<EnhancedAuthContextType | undefined>(undefined);

export function useEnhancedAuth() {
  const context = useContext(EnhancedAuthContext);
  if (context === undefined) {
    throw new Error('useEnhancedAuth must be used within an EnhancedAuthProvider');
  }
  return context;
}

interface EnhancedAuthProviderProps {
  children: React.ReactNode;
}

export function EnhancedAuthProvider({ children }: EnhancedAuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // RBAC state
  const [rbacUser, setRbacUser] = useState<RBACUser | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rbacLoading, setRbacLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  
  // Load cached RBAC data from AsyncStorage
  const loadCachedRBACData = useCallback(async (authUser: User) => {
    try {
      const [rbacUserData, permissionsData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.RBAC_USER),
        AsyncStorage.getItem(STORAGE_KEYS.RBAC_PERMISSIONS),
      ]);

      if (rbacUserData) {
        const cachedRBACUser = JSON.parse(rbacUserData);
        const rbacUserObj: RBACUser = {
          id: authUser.id,
          email: authUser.email,
          role: cachedRBACUser.role,
          orgId: cachedRBACUser.orgId,
          powerLevel: ROLE_HIERARCHY[cachedRBACUser.role as UserRole],
        };
        setRbacUser(rbacUserObj);
      }

      if (permissionsData) {
        const cachedPermissions = JSON.parse(permissionsData);
        setPermissions(cachedPermissions);
      }
    } catch (error) {
      console.error('Failed to load cached RBAC data:', error);
    }
  }, []);

  // Cache RBAC data to AsyncStorage
  const cacheRBACData = useCallback(async (rbacUser: RBACUser | null, permissions: Permission[]) => {
    try {
      const operations = [
        AsyncStorage.setItem(STORAGE_KEYS.RBAC_LAST_SYNC, Date.now().toString()),
      ];

      if (rbacUser) {
        operations.push(
          AsyncStorage.setItem(STORAGE_KEYS.RBAC_USER, JSON.stringify({
            role: rbacUser.role,
            orgId: rbacUser.orgId,
          }))
        );
      } else {
        operations.push(AsyncStorage.removeItem(STORAGE_KEYS.RBAC_USER));
      }

      operations.push(
        AsyncStorage.setItem(STORAGE_KEYS.RBAC_PERMISSIONS, JSON.stringify(permissions))
      );

      await Promise.all(operations);
    } catch (error) {
      console.error('Failed to cache RBAC data:', error);
    }
  }, []);

  // Fetch RBAC data from server
  const fetchRBACData = useCallback(async (authUser: User, useCache = false) => {
    if (useCache) {
      await loadCachedRBACData(authUser);
      return;
    }

    setRbacLoading(true);
    
    try {
      setOffline(false);
      
      const response = await fetch('/api/rbac/user-profile', {
        headers: {
          'Authorization': `Bearer ${await getAccessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch RBAC data');
      }

      const data = await response.json();
      
      const rbacUserData: RBACUser = {
        id: authUser.id,
        email: authUser.email,
        role: data.role,
        orgId: data.orgId,
        powerLevel: ROLE_HIERARCHY[data.role as UserRole],
        permissions: data.permissions,
      };

      const userPermissions = data.permissions || getRolePermissions(data.role);

      setRbacUser(rbacUserData);
      setPermissions(userPermissions);
      
      // Cache the data
      await cacheRBACData(rbacUserData, userPermissions);
    } catch (error) {
      console.error('Failed to fetch RBAC data:', error);
      setOffline(true);
      
      // Use cached data if available
      await loadCachedRBACData(authUser);
    } finally {
      setRbacLoading(false);
    }
  }, [loadCachedRBACData, cacheRBACData]);

  // Handle authentication state changes
  const handleAuthChange = useCallback(async (event: string, session: Session | null) => {
    console.log('Auth event:', event, session?.user?.email);
    
    setSession(session);
    setUser(session?.user ?? null);

    // Handle session storage
    if (session) {
      await AsyncStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
      
      // Load cached RBAC data first for faster startup
      if (session.user) {
        await loadCachedRBACData(session.user);
        // Then fetch fresh data if online
        const netInfo = await NetInfo.fetch();
        if (netInfo.isConnected) {
          await fetchRBACData(session.user);
        } else {
          setOffline(true);
        }
      }
    } else {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.SESSION),
        clearRBACCache(),
      ]);
      setRbacUser(null);
      setPermissions([]);
      setOffline(false);
    }
    
    setLoading(false);
  }, [loadCachedRBACData, fetchRBACData]);

  // Initialize auth and set up network monitoring
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Check for cached session first (not currently used but structure for future enhancement)
        await AsyncStorage.getItem(STORAGE_KEYS.SESSION);
        
        // Get current session from Supabase
        const { data: { session } } = await supabase.auth.getSession();
        
        if (mounted) {
          await handleAuthChange('INITIAL_SESSION', session);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

    // Monitor network connectivity
    const netInfoUnsubscribe = NetInfo.addEventListener(state => {
      const isConnected = state.isConnected ?? false;
      setOffline(!isConnected);
      
      // Auto-sync when coming back online
      if (isConnected && user) {
        fetchRBACData(user);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      netInfoUnsubscribe();
    };
  }, [handleAuthChange, user, fetchRBACData]);

  // Permission checking methods
  const hasPermission = useCallback((resource: RBACResource, action: RBACAction): boolean => {
    if (!rbacUser) return false;

    // Check basic role permission first
    const hasRolePermission = roleHasPermission(rbacUser.role, resource, action);
    if (!hasRolePermission) return false;

    // Check if user has specific permission in their permission list
    return permissions.some(perm => 
      perm.resource === resource && perm.action === action
    );
  }, [rbacUser, permissions]);

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
        const existingChecks = await AsyncStorage.getItem('@offline_permission_checks');
        const checks = existingChecks ? JSON.parse(existingChecks) : [];
        checks.push(offlineCheck);
        await AsyncStorage.setItem('@offline_permission_checks', JSON.stringify(checks));
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
          'Authorization': `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          resource,
          action,
          resourceId,
        }),
      });

      if (!response.ok) {
        return hasPermission(resource, action);
      }

      const result = await response.json();
      return result.allowed === true;
    } catch (error) {
      console.error('Permission check failed:', error);
      return hasPermission(resource, action);
    }
  }, [rbacUser, offline, hasPermission, user]);

  const canManageUserRole = useCallback((targetRole: UserRole): boolean => {
    if (!rbacUser) return false;
    return canManageRole(rbacUser.role, targetRole);
  }, [rbacUser]);

  // Role utility functions
  const isOwner = rbacUser?.role === 'owner';
  const isAdmin = rbacUser?.role === 'admin' || isOwner;
  const isAnalyst = rbacUser?.role === 'analyst' || isAdmin;
  const isMember = rbacUser?.role === 'member' || isAnalyst;
  const isViewer = rbacUser?.role === 'viewer' || isMember;

  const getDisplayRole = useCallback(() => {
    if (!rbacUser) return null;
    return ROLE_DISPLAY[rbacUser.role];
  }, [rbacUser]);

  // Sign out with cleanup
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.SESSION),
        clearRBACCache(),
      ]);
      setRbacUser(null);
      setPermissions([]);
      setOffline(false);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }, []);

  // Mobile-specific methods
  const syncRBACData = useCallback(async () => {
    if (user && !offline) {
      await fetchRBACData(user);
    }
  }, [user, offline, fetchRBACData]);

  const clearRBACCache = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.RBAC_USER),
        AsyncStorage.removeItem(STORAGE_KEYS.RBAC_PERMISSIONS),
        AsyncStorage.removeItem(STORAGE_KEYS.RBAC_LAST_SYNC),
        AsyncStorage.removeItem('@offline_permission_checks'),
        AsyncStorage.removeItem('@offline_action_queue'),
      ]);
    } catch (error) {
      console.error('Failed to clear RBAC cache:', error);
    }
  }, []);

  const getLastSyncTime = useCallback(async (): Promise<Date | null> => {
    try {
      const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.RBAC_LAST_SYNC);
      return lastSync ? new Date(parseInt(lastSync, 10)) : null;
    } catch (error) {
      console.error('Failed to get last sync time:', error);
      return null;
    }
  }, []);

  const queueOfflineAction = useCallback(async (action: Record<string, unknown>) => {
    try {
      const existingQueue = await AsyncStorage.getItem('@offline_action_queue');
      const queue = existingQueue ? JSON.parse(existingQueue) : [];
      queue.push({
        ...action,
        timestamp: Date.now(),
        userId: user?.id,
      });
      await AsyncStorage.setItem('@offline_action_queue', JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to queue offline action:', error);
    }
  }, [user]);

  const processOfflineQueue = useCallback(async () => {
    if (offline) return;

    try {
      const queueData = await AsyncStorage.getItem('@offline_action_queue');
      if (!queueData) return;

      const queue = JSON.parse(queueData);
      const processedActions: string[] = [];

      for (const action of queue) {
        try {
          // Process each queued action based on its type
          const response = await fetch(`/api/rbac/${action.endpoint}`, {
            method: action.method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await getAccessToken()}`,
            },
            body: JSON.stringify(action.data),
          });

          if (response.ok) {
            processedActions.push(action.id);
          }
        } catch (error) {
          console.error('Failed to process offline action:', error);
        }
      }

      // Remove processed actions from queue
      if (processedActions.length > 0) {
        const remainingQueue = queue.filter((action: { id: string }) => 
          !processedActions.includes(action.id)
        );
        
        await AsyncStorage.setItem('@offline_action_queue', JSON.stringify(remainingQueue));
      }
    } catch (error) {
      console.error('Failed to process offline queue:', error);
    }
  }, [offline, user]);

  const value: EnhancedAuthContextType = {
    // Core authentication
    user,
    session,
    loading: loading || rbacLoading,
    signOut,

    // RBAC integration
    rbacUser,
    role: rbacUser?.role || null,
    powerLevel: rbacUser?.powerLevel || 0,
    permissions,
    rbacLoading,
    offline,

    // Permission methods
    hasPermission,
    checkPermission,
    canManageUser: canManageUserRole,

    // Role utilities
    isOwner,
    isAdmin,
    isAnalyst,
    isMember,
    isViewer,
    getDisplayRole,

    // Organization context
    orgId: rbacUser?.orgId || null,

    // Mobile-specific methods
    syncRBACData,
    clearRBACCache,
    getLastSyncTime,

    // Offline handling
    queueOfflineAction,
    processOfflineQueue,
  };

  return (
    <EnhancedAuthContext.Provider value={value}>
      {children}
    </EnhancedAuthContext.Provider>
  );
}

// Backward compatibility hooks
export function useAuth() {
  const enhanced = useEnhancedAuth();
  
  return {
    user: enhanced.user,
    session: enhanced.session,
    loading: enhanced.loading,
    signOut: enhanced.signOut,
  };
}

export function useRBAC() {
  const enhanced = useEnhancedAuth();
  
  return {
    user: enhanced.rbacUser,
    role: enhanced.role,
    powerLevel: enhanced.powerLevel,
    permissions: enhanced.permissions,
    loading: enhanced.rbacLoading,
    offline: enhanced.offline,
    
    hasPermission: enhanced.hasPermission,
    checkPermission: enhanced.checkPermission,
    canManageUser: enhanced.canManageUser,
    
    isOwner: enhanced.isOwner,
    isAdmin: enhanced.isAdmin,
    isAnalyst: enhanced.isAnalyst,
    isMember: enhanced.isMember,
    isViewer: enhanced.isViewer,
    getDisplayRole: enhanced.getDisplayRole,
    
    syncPermissions: enhanced.syncRBACData,
    clearCache: enhanced.clearRBACCache,
    getOfflineChecks: async () => {
      try {
        const checks = await AsyncStorage.getItem('@offline_permission_checks');
        return checks ? JSON.parse(checks) : [];
      } catch {
        return [];
      }
    },
  };
}