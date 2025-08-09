'use client';

/**
 * Permission Button Component
 * Button that shows/hides based on user permissions
 */

import React, { useState } from 'react';
import type { UserRole, RBACResource, RBACAction } from '@phonelogai/shared/rbac';
import { useRBAC, usePermission } from '../RBACProvider';

interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  resource: RBACResource;
  action: RBACAction;
  resourceId?: string;
  requireExactRole?: UserRole;
  minimumRole?: UserRole;
  fallback?: React.ReactNode;
  loadingText?: string;
  checkOnMount?: boolean;
}

export function PermissionButton({
  resource,
  action,
  resourceId,
  requireExactRole,
  minimumRole,
  fallback = null,
  loadingText = 'Loading...',
  checkOnMount = true,
  children,
  onClick,
  disabled,
  className = '',
  ...props
}: PermissionButtonProps): JSX.Element | null {
  const { role, hasPermission, loading: rbacLoading } = useRBAC();
  const { allowed, loading: permissionLoading, check } = usePermission(resource, action, resourceId);
  const [isClicking, setIsClicking] = useState(false);

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

  // Perform additional check on mount if needed
  React.useEffect(() => {
    if (checkOnMount && resourceId && !rbacLoading) {
      check();
    }
  }, [checkOnMount, resourceId, rbacLoading, check]);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || !onClick) return;

    // Perform real-time permission check for sensitive operations
    if (resourceId && ['delete', 'manage', 'bulk'].includes(action)) {
      setIsClicking(true);
      
      try {
        const hasPermission = await check();
        if (!hasPermission) {
          event.preventDefault();
          return;
        }
      } finally {
        setIsClicking(false);
      }
    }

    onClick(event);
  };

  const isLoading = rbacLoading || permissionLoading || isClicking;
  const hasAccess = roleMatches && (resourceId ? allowed : hasPermission(resource, action));

  if (isLoading) {
    return (
      <button
        disabled
        className={`inline-flex items-center px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-300 rounded-md cursor-not-allowed ${className}`}
        {...props}
      >
        <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        {loadingText}
      </button>
    );
  }

  if (!hasAccess) {
    if (fallback) {
      return fallback as JSX.Element;
    }
    return null;
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

// Pre-configured permission buttons
interface PermissionActionButtonProps extends Omit<PermissionButtonProps, 'resource' | 'action'> {
  resourceId?: string;
}

export function ReadButton({ children = 'View', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="events" // Default resource, can be overridden
      action="read"
      className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      {...props}
    >
      {children}
    </PermissionButton>
  );
}

export function EditButton({ children = 'Edit', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="events"
      action="write"
      className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      {...props}
    >
      {children}
    </PermissionButton>
  );
}

export function DeleteButton({ children = 'Delete', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="events"
      action="delete"
      checkOnMount={true}
      className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      {...props}
    >
      {children}
    </PermissionButton>
  );
}

export function ExportButton({ children = 'Export', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="events"
      action="export"
      minimumRole="analyst"
      className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      {...props}
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {children}
    </PermissionButton>
  );
}

export function ManageButton({ children = 'Manage', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="organizations"
      action="manage"
      minimumRole="admin"
      className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
      {...props}
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {children}
    </PermissionButton>
  );
}

interface ConfirmPermissionButtonProps extends PermissionButtonProps {
  confirmTitle?: string;
  confirmMessage?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  onConfirm?: () => void | Promise<void>;
}

export function ConfirmPermissionButton({
  confirmTitle = 'Confirm Action',
  confirmMessage = 'Are you sure you want to perform this action?',
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  onConfirm,
  onClick,
  children,
  ...props
}: ConfirmPermissionButtonProps): JSX.Element | null {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    
    try {
      if (onConfirm) {
        await onConfirm();
      }
      if (onClick) {
        onClick({} as React.MouseEvent<HTMLButtonElement>);
      }
    } finally {
      setIsConfirming(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <PermissionButton
        onClick={handleClick}
        {...props}
      >
        {children}
      </PermissionButton>

      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {confirmTitle}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {confirmMessage}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isConfirming}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {cancelButtonText}
              </button>
              <button
                onClick={handleConfirm}
                disabled={isConfirming}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isConfirming ? 'Processing...' : confirmButtonText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}