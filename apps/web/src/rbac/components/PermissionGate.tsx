'use client';

/**
 * Permission Gate Components
 * Conditionally render content based on user permissions
 */

import React, { useState, useEffect } from 'react';
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
  loading: loadingComponent = null,
}: PermissionGateProps): JSX.Element | null {
  const { role, hasPermission, loading: rbacLoading } = useRBAC();
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
    return loadingComponent as JSX.Element || null;
  }

  if (!roleMatches) {
    return fallback as JSX.Element || null;
  }

  if (resourceId ? allowed : hasPermission(resource, action)) {
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
  loading: loadingComponent = null,
}: RoleGateProps): JSX.Element | null {
  const { role, loading } = useRBAC();

  if (loading) {
    return loadingComponent as JSX.Element || null;
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

interface ConditionalPermissionProps {
  show: boolean;
  resource: RBACResource;
  action: RBACAction;
  resourceId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Gate that combines custom condition with permission check
 */
export function ConditionalPermission({
  show,
  resource,
  action,
  resourceId,
  children,
  fallback = null,
}: ConditionalPermissionProps): JSX.Element | null {
  if (!show) {
    return fallback as JSX.Element || null;
  }

  return (
    <PermissionGate
      resource={resource}
      action={action}
      resourceId={resourceId}
      fallback={fallback}
    >
      {children}
    </PermissionGate>
  );
}

interface PermissionAnyProps {
  permissions: Array<{
    resource: RBACResource;
    action: RBACAction;
    resourceId?: string;
  }>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Gate that shows content if user has ANY of the specified permissions
 */
export function PermissionAny({
  permissions,
  children,
  fallback = null,
}: PermissionAnyProps): JSX.Element | null {
  const { hasPermission } = useRBAC();

  const hasAnyPermission = permissions.some(({ resource, action }) =>
    hasPermission(resource, action)
  );

  if (hasAnyPermission) {
    return children as JSX.Element;
  }

  return fallback as JSX.Element || null;
}

interface PermissionAllProps {
  permissions: Array<{
    resource: RBACResource;
    action: RBACAction;
    resourceId?: string;
  }>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Gate that shows content if user has ALL of the specified permissions
 */
export function PermissionAll({
  permissions,
  children,
  fallback = null,
}: PermissionAllProps): JSX.Element | null {
  const { hasPermission } = useRBAC();

  const hasAllPermissions = permissions.every(({ resource, action }) =>
    hasPermission(resource, action)
  );

  if (hasAllPermissions) {
    return children as JSX.Element;
  }

  return fallback as JSX.Element || null;
}

interface PermissionTooltipProps {
  resource: RBACResource;
  action: RBACAction;
  children: React.ReactNode;
  message?: string;
}

/**
 * Wrapper that shows tooltip for insufficient permissions
 */
export function PermissionTooltip({
  resource,
  action,
  children,
  message = 'Insufficient permissions',
}: PermissionTooltipProps): JSX.Element {
  const { hasPermission } = useRBAC();
  const allowed = hasPermission(resource, action);

  if (allowed) {
    return children as JSX.Element;
  }

  return (
    <div className="relative group">
      <div className="opacity-50 cursor-not-allowed">
        {children}
      </div>
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
        {message}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );
}