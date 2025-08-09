/**
 * Mobile Role Selector Component
 * React Native component for selecting and managing user roles
 */

import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
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
  style?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function RoleSelector({
  currentRole,
  targetUserId: _targetUserId,
  onChange,
  onSave,
  disabled = false,
  showDescription = true,
  compact = false,
  style,
}: RoleSelectorProps): JSX.Element {
  const { canElevateToRole } = useRBAC();
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

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
    if (compact) {
      setShowModal(false);
    }
  };

  const handleSave = async () => {
    if (!onSave || selectedRole === currentRole) return;

    setSaving(true);
    setError(null);

    try {
      await onSave(selectedRole);
      Alert.alert('Success', 'Role updated successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update role';
      setError(errorMessage);
      setSelectedRole(currentRole); // Revert on error
      Alert.alert('Error', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    const colors: Record<UserRole, { bg: string; text: string; border: string }> = {
      owner: { bg: '#f3e8ff', text: '#7c3aed', border: '#c4b5fd' },
      admin: { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' },
      analyst: { bg: '#eff6ff', text: '#2563eb', border: '#93c5fd' },
      member: { bg: '#f0fdf4', text: '#16a34a', border: '#86efac' },
      viewer: { bg: '#f9fafb', text: '#374151', border: '#d1d5db' },
    };
    return colors[role];
  };

  const RoleItem = ({ role, onPress }: { role: UserRole; onPress: () => void }) => {
    const roleInfo = ROLE_DISPLAY[role];
    const isSelected = selectedRole === role;
    const isDisabled = disabled || (!canElevateToRole(role) && role !== currentRole);
    const colors = getRoleBadgeColor(role);

    return (
      <TouchableOpacity
        style={[
          styles.roleItem,
          isSelected && styles.roleItemSelected,
          isDisabled && styles.roleItemDisabled,
        ]}
        onPress={onPress}
        disabled={isDisabled}
      >
        <View style={styles.roleItemHeader}>
          <Text style={[styles.roleName, isDisabled && styles.disabledText]}>
            {roleInfo.name}
          </Text>
          <View style={styles.roleBadges}>
            <View style={[styles.levelBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[styles.levelBadgeText, { color: colors.text }]}>
                L{ROLE_HIERARCHY[role]}
              </Text>
            </View>
            {role === currentRole && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Current</Text>
              </View>
            )}
          </View>
        </View>
        {showDescription && (
          <Text style={[styles.roleDescription, isDisabled && styles.disabledText]}>
            {roleInfo.description}
          </Text>
        )}
        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (compact) {
    return (
      <View style={[styles.compactContainer, style]}>
        <TouchableOpacity
          style={styles.compactSelector}
          onPress={() => setShowModal(true)}
          disabled={disabled || saving || availableRoles.length <= 1}
        >
          <Text style={styles.compactSelectedRole}>
            {ROLE_DISPLAY[selectedRole].name}
          </Text>
          <Text style={styles.compactArrow}>▼</Text>
        </TouchableOpacity>

        {onSave && selectedRole !== currentRole && (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        )}

        <Modal
          visible={showModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Role</Text>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={styles.modalCloseText}>×</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={availableRoles}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <RoleItem role={item} onPress={() => handleRoleChange(item)} />
                )}
                style={styles.roleList}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, style]}>
      <Text style={styles.title}>Role Assignment</Text>
      
      {availableRoles.map((role) => (
        <RoleItem
          key={role}
          role={role}
          onPress={() => handleRoleChange(role)}
        />
      ))}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {onSave && selectedRole !== currentRole && (
        <View style={styles.actionContainer}>
          <Text style={styles.changeDescription}>
            Role will be changed from{' '}
            <Text style={styles.boldText}>{ROLE_DISPLAY[currentRole].name}</Text>
            {' '}to{' '}
            <Text style={styles.boldText}>{ROLE_DISPLAY[selectedRole].name}</Text>
          </Text>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setSelectedRole(currentRole);
                onChange(currentRole);
                setError(null);
              }}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.updateButton, saving && styles.updateButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.updateButtonText}>Update Role</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Permission preview */}
      {selectedRole !== currentRole && (
        <View style={styles.previewContainer}>
          <Text style={styles.previewTitle}>
            {ROLE_DISPLAY[selectedRole].name} Permissions Preview
          </Text>
          <RolePermissionPreview role={selectedRole} />
        </View>
      )}
    </ScrollView>
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
    <View style={styles.permissionsList}>
      {permissions.map((permission, index) => (
        <View key={index} style={styles.permissionItem}>
          <Text style={styles.permissionBullet}>•</Text>
          <Text style={styles.permissionText}>{permission}</Text>
        </View>
      ))}
    </View>
  );
}

interface RoleBadgeProps {
  role: UserRole;
  showLevel?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function RoleBadge({
  role,
  showLevel = false,
  size = 'medium',
  style,
}: RoleBadgeProps): JSX.Element {
  const roleInfo = ROLE_DISPLAY[role];
  const colors = {
    owner: { bg: '#f3e8ff', text: '#7c3aed', border: '#c4b5fd' },
    admin: { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' },
    analyst: { bg: '#eff6ff', text: '#2563eb', border: '#93c5fd' },
    member: { bg: '#f0fdf4', text: '#16a34a', border: '#86efac' },
    viewer: { bg: '#f9fafb', text: '#374151', border: '#d1d5db' },
  };

  const sizeStyles = {
    small: { paddingHorizontal: 6, paddingVertical: 2, fontSize: 12 },
    medium: { paddingHorizontal: 8, paddingVertical: 4, fontSize: 14 },
    large: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 16 },
  };

  const roleColors = colors[role];
  const sizeStyle = sizeStyles[size];

  return (
    <View
      style={[
        styles.roleBadge,
        {
          backgroundColor: roleColors.bg,
          borderColor: roleColors.border,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          paddingVertical: sizeStyle.paddingVertical,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.roleBadgeText,
          { color: roleColors.text, fontSize: sizeStyle.fontSize },
        ]}
      >
        {roleInfo.name}
        {showLevel && ` L${ROLE_HIERARCHY[role]}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  roleItem: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  roleItemSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  roleItemDisabled: {
    backgroundColor: '#f9fafb',
    opacity: 0.6,
  },
  roleItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roleName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  roleBadges: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 8,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  currentBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
    marginLeft: 8,
  },
  currentBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '500',
  },
  roleDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  disabledText: {
    color: '#9ca3af',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  checkmarkText: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorContainer: {
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    marginVertical: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  actionContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  changeDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  boldText: {
    fontWeight: '600',
    color: '#111827',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
  updateButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  updateButtonDisabled: {
    opacity: 0.6,
  },
  updateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  previewContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 12,
  },
  permissionsList: {
    marginTop: 8,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  permissionBullet: {
    color: '#3b82f6',
    fontSize: 16,
    marginRight: 8,
    lineHeight: 20,
  },
  permissionText: {
    flex: 1,
    color: '#1e40af',
    fontSize: 14,
    lineHeight: 20,
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    minWidth: 120,
  },
  compactSelectedRole: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  compactArrow: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8,
  },
  saveButton: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 24,
    color: '#6b7280',
  },
  roleList: {
    padding: 16,
  },
  roleBadge: {
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    fontWeight: '500',
  },
});