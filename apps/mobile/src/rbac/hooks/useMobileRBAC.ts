/**
 * Mobile RBAC Hooks
 * React Native specific hooks for role-based access control
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { 
  UserRole, 
  RBACResource, 
  RBACAction
} from '@phonelogai/shared/rbac';
import { useRBAC } from '../RBACProvider';

/**
 * Hook for offline-aware permission checking
 */
export function useOfflinePermission(
  resource: RBACResource,
  action: RBACAction,
  resourceId?: string
) {
  const { checkPermission, hasPermission, offline } = useRBAC();
  const [result, setResult] = useState<{
    allowed: boolean;
    cached: boolean;
    timestamp?: number;
  }>({ allowed: false, cached: false });
  const [loading, setLoading] = useState(false);

  const checkOfflinePermission = useCallback(async () => {
    setLoading(true);

    try {
      if (offline) {
        // Use basic role-based check for offline scenarios
        const allowed = hasPermission(resource, action);
        setResult({
          allowed,
          cached: true,
          timestamp: Date.now(),
        });
      } else {
        // Online check with caching
        const allowed = await checkPermission(resource, action, resourceId);
        setResult({
          allowed,
          cached: false,
          timestamp: Date.now(),
        });

        // Cache the result for offline use
        const cacheKey = `permission_${resource}_${action}_${resourceId || 'global'}`;
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
          allowed,
          timestamp: Date.now(),
        }));
      }
    } catch {
      // Fallback to cached result
      try {
        const cacheKey = `permission_${resource}_${action}_${resourceId || 'global'}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const { allowed, timestamp } = JSON.parse(cached);
          setResult({
            allowed,
            cached: true,
            timestamp,
          });
        }
      } catch (cacheError) {
        console.error('Failed to read cached permission:', cacheError);
        setResult({
          allowed: hasPermission(resource, action),
          cached: true,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [resource, action, resourceId, offline, checkPermission, hasPermission]);

  useEffect(() => {
    checkOfflinePermission();
  }, [checkOfflinePermission]);

  return {
    ...result,
    loading,
    refresh: checkOfflinePermission,
  };
}

/**
 * Hook for network-aware RBAC operations
 */
export function useNetworkAwareRBAC() {
  const { user, syncPermissions, clearCache } = useRBAC();
  const [isConnected, setIsConnected] = useState(true);
  const [pendingSync, setPendingSync] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected ?? false;
      setIsConnected(connected);

      // Auto-sync when coming back online
      if (connected && !isConnected && user) {
        setPendingSync(true);
        syncPermissions()
          .finally(() => setPendingSync(false));
      }
    });

    return unsubscribe;
  }, [user, isConnected, syncPermissions]);

  const forceSyncWhenOnline = useCallback(async () => {
    if (isConnected) {
      setPendingSync(true);
      try {
        await syncPermissions();
      } finally {
        setPendingSync(false);
      }
    }
  }, [isConnected, syncPermissions]);

  return {
    isConnected,
    pendingSync,
    syncWhenOnline: forceSyncWhenOnline,
    clearCache,
  };
}

/**
 * Hook for background sync of RBAC data
 */
export function useRBACBackgroundSync() {
  const { syncPermissions } = useRBAC();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const performBackgroundSync = useCallback(async () => {
    try {
      setSyncError(null);
      await syncPermissions();
      setLastSync(new Date());
      
      // Store last sync time
      await AsyncStorage.setItem('@rbac_last_sync', Date.now().toString());
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
    }
  }, [syncPermissions]);

  // Load last sync time on mount
  useEffect(() => {
    const loadLastSync = async () => {
      try {
        const lastSyncTime = await AsyncStorage.getItem('@rbac_last_sync');
        if (lastSyncTime) {
          setLastSync(new Date(parseInt(lastSyncTime, 10)));
        }
      } catch (error) {
        console.error('Failed to load last sync time:', error);
      }
    };

    loadLastSync();
  }, []);

  // Auto-sync every 5 minutes when app is active
  useEffect(() => {
    const interval = setInterval(performBackgroundSync, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [performBackgroundSync]);

  return {
    lastSync,
    syncError,
    performSync: performBackgroundSync,
  };
}

/**
 * Hook for role transition with offline queueing
 */
export function useMobileRoleTransition(targetUserId: string | undefined) {
  const { canManageUser } = useRBAC();
  const [loading, setLoading] = useState(false);
  const [queuedTransitions, setQueuedTransitions] = useState<Array<{
    userId: string;
    newRole: UserRole;
    timestamp: number;
  }>>([]);

  // Load queued transitions on mount
  useEffect(() => {
    const loadQueuedTransitions = async () => {
      try {
        const queued = await AsyncStorage.getItem('@rbac_queued_transitions');
        if (queued) {
          setQueuedTransitions(JSON.parse(queued));
        }
      } catch (error) {
        console.error('Failed to load queued transitions:', error);
      }
    };

    loadQueuedTransitions();
  }, []);

  const transitionRole = useCallback(async (
    newRole: UserRole
  ): Promise<{ success: boolean; error?: string; queued?: boolean }> => {
    if (!targetUserId) {
      return { success: false, error: 'No target user specified' };
    }

    if (!canManageUser(newRole)) {
      return { success: false, error: 'Insufficient permissions to assign this role' };
    }

    setLoading(true);

    try {
      // Check network connectivity
      const netInfo = await NetInfo.fetch();
      
      if (!netInfo.isConnected) {
        // Queue the transition for later
        const transition = {
          userId: targetUserId,
          newRole,
          timestamp: Date.now(),
        };

        const updatedQueue = [...queuedTransitions, transition];
        setQueuedTransitions(updatedQueue);
        
        await AsyncStorage.setItem('@rbac_queued_transitions', JSON.stringify(updatedQueue));
        
        return { 
          success: true, 
          queued: true 
        };
      }

      // Perform online transition
      const response = await fetch('/api/rbac/update-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUserId,
          newRole,
        }),
      });

      if (response.ok) {
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.message || 'Role transition failed' };
      }
    } catch {
      // Queue for retry
      const transition = {
        userId: targetUserId,
        newRole,
        timestamp: Date.now(),
      };

      const updatedQueue = [...queuedTransitions, transition];
      setQueuedTransitions(updatedQueue);
      
      await AsyncStorage.setItem('@rbac_queued_transitions', JSON.stringify(updatedQueue));

      return { 
        success: false, 
        error: 'Queued for retry when online',
        queued: true 
      };
    } finally {
      setLoading(false);
    }
  }, [targetUserId, canManageUser, queuedTransitions]);

  const processQueuedTransitions = useCallback(async () => {
    if (queuedTransitions.length === 0) return;

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) return;

    const successful: string[] = [];
    
    for (const transition of queuedTransitions) {
      try {
        const response = await fetch('/api/rbac/update-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: transition.userId,
            newRole: transition.newRole,
          }),
        });

        if (response.ok) {
          successful.push(transition.userId);
        }
      } catch (error) {
        console.error('Failed to process queued transition:', error);
      }
    }

    if (successful.length > 0) {
      const remaining = queuedTransitions.filter(
        transition => !successful.includes(transition.userId)
      );
      
      setQueuedTransitions(remaining);
      await AsyncStorage.setItem('@rbac_queued_transitions', JSON.stringify(remaining));
    }
  }, [queuedTransitions]);

  // Auto-process queue when network comes back
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        processQueuedTransitions();
      }
    });

    return unsubscribe;
  }, [processQueuedTransitions]);

  return {
    loading,
    queuedTransitions,
    transitionRole,
    processQueue: processQueuedTransitions,
  };
}

/**
 * Hook for RBAC analytics and usage tracking
 */
export function useRBACAnalytics() {
  const { user, role } = useRBAC();
  const [analytics, setAnalytics] = useState({
    permissionChecks: 0,
    deniedActions: 0,
    offlineChecks: 0,
    cacheHits: 0,
  });

  const trackPermissionCheck = useCallback(async (
    resource: RBACResource,
    action: RBACAction,
    result: boolean,
    offline: boolean = false
  ) => {
    setAnalytics(prev => ({
      ...prev,
      permissionChecks: prev.permissionChecks + 1,
      ...(result ? {} : { deniedActions: prev.deniedActions + 1 }),
      ...(offline ? { offlineChecks: prev.offlineChecks + 1 } : {}),
    }));

    // Store analytics locally
    try {
      const analyticsData = {
        userId: user?.id,
        role,
        resource,
        action,
        result,
        offline,
        timestamp: Date.now(),
      };

      const existing = await AsyncStorage.getItem('@rbac_analytics');
      const data = existing ? JSON.parse(existing) : [];
      data.push(analyticsData);

      // Keep only last 1000 entries
      if (data.length > 1000) {
        data.splice(0, data.length - 1000);
      }

      await AsyncStorage.setItem('@rbac_analytics', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to store analytics:', error);
    }
  }, [user, role]);

  const getAnalytics = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem('@rbac_analytics');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get analytics:', error);
      return [];
    }
  }, []);

  const clearAnalytics = useCallback(async () => {
    try {
      await AsyncStorage.removeItem('@rbac_analytics');
      setAnalytics({
        permissionChecks: 0,
        deniedActions: 0,
        offlineChecks: 0,
        cacheHits: 0,
      });
    } catch (error) {
      console.error('Failed to clear analytics:', error);
    }
  }, []);

  return {
    analytics,
    trackPermissionCheck,
    getAnalytics,
    clearAnalytics,
  };
}