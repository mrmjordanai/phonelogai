'use client';

/**
 * Role Selector Component
 * UI component for selecting and managing user roles
 */

import React, { useState } from 'react';
import type { UserRole } from '@phonelogai/shared/rbac';
import { ROLE_DISPLAY, ROLE_HIERARCHY } from '@phonelogai/shared/rbac';
import { useRBAC } from '../RBACProvider';

interface RoleSelectorProps {
  currentRole: UserRole;
  targetUserId?: string;
  onChange: (role: UserRole) => void;
  onSave?: (role: UserRole) => Promise<void>;
  disabled?: boolean;
  showDescription?: boolean;
  compact?: boolean;
  className?: string;
}

export function RoleSelector({
  currentRole,
  targetUserId,
  onChange,
  onSave,
  disabled = false,
  showDescription = true,
  compact = false,
  className = '',
}: RoleSelectorProps): JSX.Element {
  const { canElevateToRole, canManageUser, role: userRole } = useRBAC();
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get available roles based on user's permissions
  const availableRoles = React.useMemo(() => {
    const roles: UserRole[] = ['viewer', 'member', 'analyst', 'admin', 'owner'];
    
    return roles.filter(role => {
      // Always show current role
      if (role === currentRole) return true;
      
      // Check if user can elevate to this role
      return canElevateToRole(role);
    });
  }, [currentRole, canElevateToRole]);

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    onChange(role);
    setError(null);
  };

  const handleSave = async () => {
    if (!onSave || selectedRole === currentRole) return;

    setSaving(true);
    setError(null);

    try {
      await onSave(selectedRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
      setSelectedRole(currentRole); // Revert on error
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole): string => {
    const colors: Record<UserRole, string> = {
      owner: 'bg-purple-100 text-purple-800 border-purple-200',
      admin: 'bg-red-100 text-red-800 border-red-200',
      analyst: 'bg-blue-100 text-blue-800 border-blue-200',
      member: 'bg-green-100 text-green-800 border-green-200',
      viewer: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return colors[role];
  };

  if (compact) {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <select
          value={selectedRole}
          onChange={(e) => handleRoleChange(e.target.value as UserRole)}
          disabled={disabled || saving || availableRoles.length <= 1}
          className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {availableRoles.map(role => (
            <option key={role} value={role}>
              {ROLE_DISPLAY[role].name}
            </option>
          ))}
        </select>
        
        {onSave && selectedRole !== currentRole && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-2 px-3 py-1 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Role Assignment
        </label>
        
        <div className="space-y-2">
          {availableRoles.map(role => {
            const roleInfo = ROLE_DISPLAY[role];
            const isSelected = selectedRole === role;
            const isDisabled = disabled || (!canElevateToRole(role) && role !== currentRole);
            
            return (
              <div
                key={role}
                className={`relative p-3 border rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : isDisabled
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => !isDisabled && handleRoleChange(role)}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={isSelected}
                    onChange={() => handleRoleChange(role)}
                    disabled={isDisabled}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 disabled:cursor-not-allowed"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-900">
                        {roleInfo.name}
                      </span>
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(role)}`}>
                        Level {ROLE_HIERARCHY[role]}
                      </span>
                      {role === currentRole && (
                        <span className="ml-2 px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded-full border border-green-200">
                          Current
                        </span>
                      )}
                    </div>
                    {showDescription && (
                      <p className="text-sm text-gray-500 mt-1">
                        {roleInfo.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {onSave && selectedRole !== currentRole && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Role will be changed from <strong>{ROLE_DISPLAY[currentRole].name}</strong> to <strong>{ROLE_DISPLAY[selectedRole].name}</strong>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                setSelectedRole(currentRole);
                onChange(currentRole);
                setError(null);
              }}
              disabled={saving}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Update Role'}
            </button>
          </div>
        </div>
      )}

      {/* Permission preview */}
      {selectedRole !== currentRole && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="text-sm font-medium text-blue-900 mb-2">
            {ROLE_DISPLAY[selectedRole].name} Permissions Preview
          </h4>
          <div className="text-sm text-blue-700">
            <RolePermissionPreview role={selectedRole} />
          </div>
        </div>
      )}
    </div>
  );
}

interface RolePermissionPreviewProps {
  role: UserRole;
}

function RolePermissionPreview({ role }: RolePermissionPreviewProps): JSX.Element {
  const permissions = React.useMemo(() => {
    const rolePermissions: Record<UserRole, string[]> = {
      owner: [
        'Full access to all data and settings',
        'Billing and subscription management',
        'Organization management',
        'User role management',
        'All data export capabilities',
      ],
      admin: [
        'User management and role assignment',
        'Privacy rule configuration',
        'Integration management',
        'System configuration access',
        'Team data export capabilities',
      ],
      analyst: [
        'Advanced analytics and reporting',
        'Data exploration and visualization',
        'Export capabilities within policy',
        'NLQ and dashboard creation',
        'Team data visibility',
      ],
      member: [
        'Full personal data access',
        'Team dashboard viewing',
        'File upload and management',
        'Basic search and filtering',
        'Contact management',
      ],
      viewer: [
        'Read-only dashboard access',
        'Limited data visibility',
        'Public data viewing only',
        'Basic incident reporting',
      ],
    };

    return rolePermissions[role] || [];
  }, [role]);

  return (
    <ul className="space-y-1">
      {permissions.map((permission, index) => (
        <li key={index} className="flex items-start">
          <svg className="h-4 w-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {permission}
        </li>
      ))}
    </ul>
  );
}

interface RoleBadgeProps {
  role: UserRole;
  showLevel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function RoleBadge({
  role,
  showLevel = false,
  size = 'md',
  className = '',
}: RoleBadgeProps): JSX.Element {
  const roleInfo = ROLE_DISPLAY[role];
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  const colors: Record<UserRole, string> = {
    owner: 'bg-purple-100 text-purple-800 border-purple-200',
    admin: 'bg-red-100 text-red-800 border-red-200',
    analyst: 'bg-blue-100 text-blue-800 border-blue-200',
    member: 'bg-green-100 text-green-800 border-green-200',
    viewer: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${colors[role]} ${sizeClasses[size]} ${className}`}>
      {roleInfo.name}
      {showLevel && (
        <span className="ml-1 opacity-75">
          L{ROLE_HIERARCHY[role]}
        </span>
      )}
    </span>
  );
}