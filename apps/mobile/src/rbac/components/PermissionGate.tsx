/**
 * Mobile Permission Gate Components
 * React Native components for conditional rendering based on permissions
 */

import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { UserRole, RBACResource, RBACAction } from '@phonelogai/shared/rbac';
import { useRBAC, usePermission } from '../RBACProvider';

interface PermissionGateProps {
  resource: RBACResource;
  action: RBACAction;
  resourceId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireExactRole?: UserRole;
  minimumRole?: UserRole;
  loading?: React.ReactNode;
  offlineMessage?: string;
}

/**
 * Gate that shows/hides content based on permissions
 */
export function PermissionGate({
  resource,
  action,
  resourceId,
  children,
  fallback = null,
  requireExactRole,
  minimumRole,
  loading: loadingComponent,
  offlineMessage = "Limited functionality while offline",
}: PermissionGateProps): JSX.Element | null {
  const { role, hasPermission, loading: rbacLoading, offline } = useRBAC();
  const { allowed, loading: permissionLoading, check } = usePermission(resource, action, resourceId);

  // Check role requirements
  const roleMatches = React.useMemo(() => {
    if (!role) return false;
    
    if (requireExactRole) {
      return role === requireExactRole;
    }
    
    if (minimumRole) {
      const roleLevels: Record<UserRole, number> = {
        viewer: 1,
        member: 2,
        analyst: 3,
        admin: 4,
        owner: 5,
      };
      return roleLevels[role] >= roleLevels[minimumRole];
    }
    
    return true;
  }, [role, requireExactRole, minimumRole]);

  // Initial permission check
  useEffect(() => {
    if (resourceId && !rbacLoading) {
      check();
    }
  }, [resourceId, rbacLoading, check]);

  if (rbacLoading || permissionLoading) {
    if (loadingComponent) {
      return loadingComponent as JSX.Element;
    }
    
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }

  if (!roleMatches) {
    return fallback as JSX.Element || null;
  }

  const hasAccess = resourceId ? allowed : hasPermission(resource, action);

  if (hasAccess) {
    if (offline && offlineMessage) {
      return (
        <View>
          <View style={styles.offlineWarning}>
            <Text style={styles.offlineText}>{offlineMessage}</Text>
          </View>
          {children as JSX.Element}
        </View>
      );
    }
    
    return children as JSX.Element;
  }

  return fallback as JSX.Element || null;
}

interface RoleGateProps {
  role?: UserRole;
  minimumRole?: UserRole;
  anyOf?: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
}

/**
 * Gate that shows/hides content based on user role
 */
export function RoleGate({
  role: requiredRole,
  minimumRole,
  anyOf,
  children,
  fallback = null,
  loading: loadingComponent,
}: RoleGateProps): JSX.Element | null {
  const { role, loading } = useRBAC();

  if (loading) {
    if (loadingComponent) {
      return loadingComponent as JSX.Element;
    }
    
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#6366f1" />
      </View>
    );
  }

  if (!role) {
    return fallback as JSX.Element || null;
  }

  // Check exact role match
  if (requiredRole && role === requiredRole) {
    return children as JSX.Element;
  }

  // Check minimum role level
  if (minimumRole) {
    const roleLevels: Record<UserRole, number> = {
      viewer: 1,
      member: 2,
      analyst: 3,
      admin: 4,
      owner: 5,
    };

    if (roleLevels[role] >= roleLevels[minimumRole]) {
      return children as JSX.Element;
    }
  }

  // Check if role is in allowed list
  if (anyOf && anyOf.includes(role)) {
    return children as JSX.Element;
  }

  return fallback as JSX.Element || null;
}

interface OwnerOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Convenience component for owner-only content
 */
export function OwnerOnly({ children, fallback = null }: OwnerOnlyProps): JSX.Element | null {
  return (
    <RoleGate role="owner" fallback={fallback}>
      {children}
    </RoleGate>
  );
}

interface AdminOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Convenience component for admin-only content (admin + owner)
 */
export function AdminOnly({ children, fallback = null }: AdminOnlyProps): JSX.Element | null {
  return (
    <RoleGate minimumRole="admin" fallback={fallback}>
      {children}
    </RoleGate>
  );
}

interface AnalystPlusProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Convenience component for analyst+ content (analyst, admin, owner)
 */
export function AnalystPlus({ children, fallback = null }: AnalystPlusProps): JSX.Element | null {
  return (
    <RoleGate minimumRole="analyst" fallback={fallback}>
      {children}
    </RoleGate>
  );
}

interface MemberPlusProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Convenience component for member+ content (member, analyst, admin, owner)
 */
export function MemberPlus({ children, fallback = null }: MemberPlusProps): JSX.Element | null {
  return (
    <RoleGate minimumRole="member" fallback={fallback}>
      {children}
    </RoleGate>
  );
}

interface OfflineWarningProps {
  message?: string;
  visible?: boolean;
}

/**
 * Warning banner for offline mode
 */
export function OfflineWarning({ 
  message = "Limited functionality while offline", 
  visible = true 
}: OfflineWarningProps): JSX.Element | null {
  if (!visible) return null;

  return (
    <View style={styles.offlineWarning}>
      <Text style={styles.offlineText}>{message}</Text>
    </View>
  );
}

interface PermissionMessageProps {
  resource: RBACResource;
  action: RBACAction;
  message?: string;
  visible?: boolean;
}

/**
 * Message component for permission requirements
 */
export function PermissionMessage({
  resource,
  action,
  message = "You don't have permission to perform this action",
  visible = true,
}: PermissionMessageProps): JSX.Element | null {
  const { hasPermission } = useRBAC();

  if (!visible || hasPermission(resource, action)) {
    return null;
  }

  return (
    <View style={styles.permissionMessage}>
      <Text style={styles.permissionMessageText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineWarning: {
    backgroundColor: '#fef3c7',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    padding: 12,
    marginBottom: 16,
  },
  offlineText: {
    color: '#92400e',
    fontSize: 14,
    fontWeight: '500',
  },
  permissionMessage: {
    backgroundColor: '#fee2e2',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    padding: 12,
    marginVertical: 8,
  },
  permissionMessageText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
});