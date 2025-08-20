/**
 * Mobile Permission Button Component
 * React Native button that shows/hides based on user permissions
 */

import React, { useState } from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import type { UserRole, RBACResource, RBACAction } from '@phonelogai/shared/rbac';
import { useRBAC, usePermission } from '../RBACProvider';

interface PermissionButtonProps {
  resource: RBACResource;
  action: RBACAction;
  resourceId?: string;
  requireExactRole?: UserRole;
  minimumRole?: UserRole;
  title: string;
  onPress?: () => void | Promise<void>;
  fallback?: React.ReactNode;
  loadingTitle?: string;
  checkOnMount?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  children?: React.ReactNode;
}

export function PermissionButton({
  resource,
  action,
  resourceId,
  requireExactRole,
  minimumRole,
  title,
  onPress,
  fallback = null,
  loadingTitle = 'Loading...',
  checkOnMount = true,
  style,
  textStyle,
  disabled,
  variant = 'primary',
  children,
}: PermissionButtonProps): JSX.Element | null {
  const { role, hasPermission, loading: rbacLoading, offline } = useRBAC();
  const { allowed, loading: permissionLoading, check } = usePermission(resource, action, resourceId);
  const [isPressed, setIsPressed] = useState(false);

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

  const handlePress = async () => {
    if (disabled || !onPress) return;

    // Perform real-time permission check for sensitive operations
    if (resourceId && ['delete', 'manage', 'bulk'].includes(action)) {
      setIsPressed(true);
      
      try {
        const hasPermission = await check();
        if (!hasPermission) {
          Alert.alert(
            'Access Denied',
            'You do not have permission to perform this action.',
            [{ text: 'OK' }]
          );
          return;
        }
      } catch {
        Alert.alert(
          'Error',
          'Failed to verify permissions. Please try again.',
          [{ text: 'OK' }]
        );
        return;
      } finally {
        setIsPressed(false);
      }
    }

    try {
      await onPress();
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'An error occurred',
        [{ text: 'OK' }]
      );
    }
  };

  const isLoading = rbacLoading || permissionLoading || isPressed;
  const hasAccess = roleMatches && (resourceId ? allowed : hasPermission(resource, action));

  const getButtonStyle = () => {
    const baseStyle = styles.button;
    
    if (isLoading || disabled) {
      return [baseStyle, styles.buttonDisabled, style];
    }
    
    switch (variant) {
      case 'secondary':
        return [baseStyle, styles.buttonSecondary, style];
      case 'danger':
        return [baseStyle, styles.buttonDanger, style];
      case 'success':
        return [baseStyle, styles.buttonSuccess, style];
      default:
        return [baseStyle, styles.buttonPrimary, style];
    }
  };

  const getTextStyle = () => {
    const baseStyle = styles.buttonText;
    
    if (isLoading || disabled) {
      return [baseStyle, styles.buttonTextDisabled, textStyle];
    }
    
    switch (variant) {
      case 'secondary':
        return [baseStyle, styles.buttonTextSecondary, textStyle];
      default:
        return [baseStyle, styles.buttonTextPrimary, textStyle];
    }
  };

  if (isLoading) {
    return (
      <TouchableOpacity style={getButtonStyle()} disabled>
        <ActivityIndicator size="small" color="#9ca3af" style={{ marginRight: 8 }} />
        <Text style={getTextStyle()}>{loadingTitle}</Text>
        {offline && (
          <View style={styles.offlineIndicator}>
            <Text style={styles.offlineText}>○</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (!hasAccess) {
    if (fallback) {
      return fallback as JSX.Element;
    }
    return null;
  }

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={handlePress}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
    >
      {children || <Text style={getTextStyle()}>{title}</Text>}
      {offline && (
        <View style={styles.offlineIndicator}>
          <Text style={styles.offlineText}>○</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Pre-configured permission buttons
interface PermissionActionButtonProps extends Omit<PermissionButtonProps, 'resource' | 'action' | 'title'> {
  title?: string;
  resourceId?: string;
}

export function ReadButton({ title = 'View', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="events"
      action="read"
      variant="secondary"
      title={title}
      {...props}
    />
  );
}

export function EditButton({ title = 'Edit', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="events"
      action="write"
      variant="primary"
      title={title}
      {...props}
    />
  );
}

export function DeleteButton({ title = 'Delete', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="events"
      action="delete"
      variant="danger"
      checkOnMount={true}
      title={title}
      {...props}
    />
  );
}

export function ExportButton({ title = 'Export', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="events"
      action="export"
      minimumRole="analyst"
      variant="secondary"
      title={title}
      {...props}
    />
  );
}

export function ManageButton({ title = 'Manage', ...props }: PermissionActionButtonProps) {
  return (
    <PermissionButton
      resource="organizations"
      action="manage"
      minimumRole="admin"
      variant="primary"
      title={title}
      {...props}
    />
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
  onPress,
  title,
  ...props
}: ConfirmPermissionButtonProps): JSX.Element | null {
  const [isConfirming, setIsConfirming] = useState(false);

  const handlePress = () => {
    Alert.alert(
      confirmTitle,
      confirmMessage,
      [
        {
          text: cancelButtonText,
          style: 'cancel',
        },
        {
          text: confirmButtonText,
          style: 'destructive',
          onPress: async () => {
            setIsConfirming(true);
            try {
              if (onConfirm) {
                await onConfirm();
              }
              if (onPress) {
                await onPress();
              }
            } finally {
              setIsConfirming(false);
            }
          },
        },
      ]
    );
  };

  return (
    <PermissionButton
      onPress={handlePress}
      disabled={isConfirming}
      loadingTitle={isConfirming ? 'Processing...' : undefined}
      title={title}
      {...props}
    />
  );
}

interface PermissionIconButtonProps extends PermissionButtonProps {
  icon: string;
  iconSize?: number;
  showTitle?: boolean;
}

export function PermissionIconButton({
  icon,
  iconSize = 20,
  showTitle = false,
  title,
  style,
  textStyle,
  ...props
}: PermissionIconButtonProps): JSX.Element | null {
  return (
    <PermissionButton
      title={showTitle ? title : ''}
      style={[styles.iconButton, style] as ViewStyle}
      textStyle={[styles.iconButtonText, textStyle] as TextStyle}
      {...props}
    >
      <View style={styles.iconButtonContent}>
        <Text style={[styles.icon, { fontSize: iconSize }]}>{icon}</Text>
        {showTitle && <Text style={textStyle}>{title}</Text>}
      </View>
    </PermissionButton>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minHeight: 44,
  },
  buttonPrimary: {
    backgroundColor: '#3b82f6',
  },
  buttonSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
  },
  buttonSuccess: {
    backgroundColor: '#10b981',
  },
  buttonDisabled: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonTextPrimary: {
    color: '#ffffff',
  },
  buttonTextSecondary: {
    color: '#374151',
  },
  buttonTextDisabled: {
    color: '#9ca3af',
  },
  offlineIndicator: {
    marginLeft: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  iconButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 44,
  },
  iconButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButtonText: {
    marginLeft: 8,
  },
  icon: {
    fontWeight: 'normal',
  },
});