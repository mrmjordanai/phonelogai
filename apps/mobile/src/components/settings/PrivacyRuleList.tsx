import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VisibilityType } from '@phonelogai/database';

// Define PrivacyRule type locally since the security modules are under development
export type PrivacyRule = {
  id: string;
  ruleName: string;
  rulePriority: number;
  scope: 'contact' | 'number_pattern' | 'organization' | 'global';
  userId: string;
  organizationId?: string;
  contactId?: string;
  numberPattern?: string;
  tagFilters?: string[];
  visibility: VisibilityType;
  anonymizeNumber: boolean;
  anonymizeContent: boolean;
  anonymizationLevel: 'none' | 'partial' | 'full' | 'redacted';
  allowExport: boolean;
  allowAnalytics: boolean;
  allowMlTraining: boolean;
  dataRetentionDays?: number;
  parentRuleId?: string;
  inheritFromParent: boolean;
  overrideChildren: boolean;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  isActive: boolean;
  autoApplied: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  metadata: Record<string, unknown>;
};

export interface PrivacyRuleListProps {
  rules: PrivacyRule[];
  onRuleEdit: (_rule: PrivacyRule) => void;
  onRuleDelete: (_ruleId: string) => void;
  onRuleToggle: (_ruleId: string, _isActive: boolean) => void;
  loading?: boolean;
}

interface RuleItemProps {
  rule: PrivacyRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

function PrivacyRuleItem({ rule, onEdit, onDelete, onToggle }: RuleItemProps) {
  const getVisibilityIcon = (visibility: VisibilityType) => {
    switch (visibility) {
      case 'private':
        return 'lock-closed';
      case 'team':
        return 'people';
      case 'public':
        return 'globe';
      default:
        return 'eye-off';
    }
  };

  const getVisibilityColor = (visibility: VisibilityType) => {
    switch (visibility) {
      case 'private':
        return '#EF4444';
      case 'team':
        return '#F59E0B';
      case 'public':
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  const getScopeText = (rule: PrivacyRule) => {
    switch (rule.scope) {
      case 'contact':
        return `Contact: ${rule.contactId?.slice(-6)}`;
      case 'number_pattern':
        return `Pattern: ${rule.numberPattern}`;
      case 'organization':
        return 'Organization wide';
      case 'global':
        return 'Global rule';
      default:
        return rule.scope;
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <View style={[
      styles.ruleContainer,
      !rule.isActive && styles.inactiveRule
    ]}>
      <View style={styles.ruleHeader}>
        <View style={styles.ruleTitle}>
          <Ionicons
            name={getVisibilityIcon(rule.visibility)}
            size={18}
            color={getVisibilityColor(rule.visibility)}
            style={styles.visibilityIcon}
          />
          <Text style={[
            styles.ruleName,
            !rule.isActive && styles.inactiveText
          ]}>
            {rule.ruleName}
          </Text>
        </View>
        
        <View style={styles.ruleActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onToggle}
          >
            <Ionicons
              name={rule.isActive ? 'pause' : 'play'}
              size={16}
              color={rule.isActive ? '#F59E0B' : '#10B981'}
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onEdit}
          >
            <Ionicons name="pencil" size={16} color="#3B82F6" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onDelete}
          >
            <Ionicons name="trash" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.ruleDetails}>
        <View style={styles.ruleMetadata}>
          <Text style={styles.scopeText}>{getScopeText(rule)}</Text>
          <Text style={styles.priorityText}>Priority: {rule.rulePriority}</Text>
        </View>

        <View style={styles.privacySettings}>
          {rule.anonymizeNumber && (
            <View style={styles.privacyTag}>
              <Ionicons name="eye-off" size={12} color="#FFFFFF" />
              <Text style={styles.privacyTagText}>Number Hidden</Text>
            </View>
          )}
          
          {rule.anonymizeContent && (
            <View style={styles.privacyTag}>
              <Ionicons name="document-text" size={12} color="#FFFFFF" />
              <Text style={styles.privacyTagText}>Content Hidden</Text>
            </View>
          )}
          
          {!rule.allowExport && (
            <View style={[styles.privacyTag, styles.restrictionTag]}>
              <Ionicons name="download" size={12} color="#FFFFFF" />
              <Text style={styles.privacyTagText}>No Export</Text>
            </View>
          )}
          
          {!rule.allowAnalytics && (
            <View style={[styles.privacyTag, styles.restrictionTag]}>
              <Ionicons name="analytics" size={12} color="#FFFFFF" />
              <Text style={styles.privacyTagText}>No Analytics</Text>
            </View>
          )}
        </View>

        <View style={styles.ruleDates}>
          <Text style={styles.dateText}>
            Created: {formatDate(rule.createdAt)}
          </Text>
          {rule.effectiveUntil && (
            <Text style={styles.dateText}>
              Expires: {formatDate(rule.effectiveUntil)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function PrivacyRuleList({
  rules,
  onRuleEdit,
  onRuleDelete,
  onRuleToggle,
  loading = false,
}: PrivacyRuleListProps) {
  const handleDelete = (rule: PrivacyRule) => {
    Alert.alert(
      'Delete Privacy Rule',
      `Are you sure you want to delete the rule "${rule.ruleName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onRuleDelete(rule.id),
        },
      ]
    );
  };

  const handleToggle = (rule: PrivacyRule) => {
    const action = rule.isActive ? 'disable' : 'enable';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Privacy Rule`,
      `Are you sure you want to ${action} the rule "${rule.ruleName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          onPress: () => onRuleToggle(rule.id, !rule.isActive),
        },
      ]
    );
  };

  const renderRule = ({ item }: { item: PrivacyRule }) => (
    <PrivacyRuleItem
      rule={item}
      onEdit={() => onRuleEdit(item)}
      onDelete={() => handleDelete(item)}
      onToggle={() => handleToggle(item)}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="shield-checkmark" size={48} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No Privacy Rules</Text>
      <Text style={styles.emptyDescription}>
        You haven't created any privacy rules yet. All contacts will use your default privacy settings.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading privacy rules...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rules}
        keyExtractor={(item) => item.id}
        renderItem={renderRule}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={rules.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  ruleContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inactiveRule: {
    opacity: 0.7,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  ruleTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  visibilityIcon: {
    marginRight: 8,
  },
  ruleName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  inactiveText: {
    color: '#9CA3AF',
  },
  ruleActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  ruleDetails: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  ruleMetadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scopeText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  priorityText: {
    fontSize: 12,
    color: '#9CA3AF',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  privacySettings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  privacyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  restrictionTag: {
    backgroundColor: '#EF4444',
  },
  privacyTagText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
    marginLeft: 4,
  },
  ruleDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});