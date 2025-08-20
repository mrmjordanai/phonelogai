import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { QuickAction } from '../../types/enhanced-dashboard';

interface EnhancedQuickActionsProps {
  onManualSync?: () => void;
  syncInProgress?: boolean;
  queueDepth?: number;
  pendingConflicts?: number;
  onConflictResolve?: () => void;
}

export const EnhancedQuickActions = memo<EnhancedQuickActionsProps>(({
  onManualSync,
  syncInProgress = false,
  queueDepth = 0,
  pendingConflicts = 0,
  onConflictResolve
}) => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();

  const handleChatNavigation = useCallback(() => {
    navigation.navigate('Chat');
  }, [navigation]);

  const handleDataCollectionNavigation = useCallback(() => {
    // Navigate to data collection or settings based on platform
    Alert.alert(
      'Data Collection',
      'Choose how to add your data:',
      [
        {
          text: 'Import Files',
          onPress: () => {
            // Navigate to file import screen or trigger file picker
            console.log('Navigate to file import');
          }
        },
        {
          text: 'Settings',
          onPress: () => navigation.navigate('Settings', { 
            screen: 'DataCollection' 
          })
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  }, [navigation]);

  const handlePrivacySettingsNavigation = useCallback(() => {
    navigation.navigate('Settings', { 
      screen: 'Privacy' 
    });
  }, [navigation]);

  const handleConflictResolution = useCallback(() => {
    if (pendingConflicts > 0 && onConflictResolve) {
      Alert.alert(
        'Resolve Conflicts',
        `You have ${pendingConflicts} conflicts that need attention. Would you like to review and resolve them now?`,
        [
          {
            text: 'Review',
            onPress: onConflictResolve
          },
          { text: 'Later', style: 'cancel' }
        ]
      );
    } else {
      Alert.alert(
        'No Conflicts',
        'All conflicts have been resolved. Your data is clean!',
        [{ text: 'OK' }]
      );
    }
  }, [pendingConflicts, onConflictResolve]);

  const handleEventsNavigation = useCallback(() => {
    navigation.navigate('Events');
  }, [navigation]);

  const handleContactsNavigation = useCallback(() => {
    navigation.navigate('Contacts');
  }, [navigation]);

  const quickActions: QuickAction[] = [
    {
      id: 'chat',
      title: 'Chat with Data',
      description: 'Ask questions about your patterns',
      icon: 'chatbubbles',
      color: '#10B981',
      backgroundColor: '#F0FDF4',
      onPress: handleChatNavigation,
    },
    {
      id: 'sync',
      title: syncInProgress ? 'Syncing...' : 'Manual Sync',
      description: queueDepth > 0 ? `${queueDepth} items pending` : 'Force data refresh',
      icon: syncInProgress ? 'hourglass' : 'refresh',
      color: '#3B82F6',
      backgroundColor: '#EFF6FF',
      onPress: onManualSync || (() => {}),
      loading: syncInProgress,
      disabled: syncInProgress,
      badge: queueDepth > 0 ? queueDepth : undefined,
    },
    {
      id: 'conflicts',
      title: 'Resolve Conflicts',
      description: pendingConflicts > 0 ? `${pendingConflicts} need attention` : 'All resolved',
      icon: pendingConflicts > 0 ? 'construct' : 'checkmark-circle',
      color: pendingConflicts > 0 ? '#F59E0B' : '#10B981',
      backgroundColor: pendingConflicts > 0 ? '#FFFBEB' : '#F0FDF4',
      onPress: handleConflictResolution,
      badge: pendingConflicts > 0 ? pendingConflicts : undefined,
    },
    {
      id: 'upload',
      title: 'Upload Data',
      description: 'Import carrier files or CSV',
      icon: 'cloud-upload',
      color: '#8B5CF6',
      backgroundColor: '#FAF5FF',
      onPress: handleDataCollectionNavigation,
    },
    {
      id: 'privacy',
      title: 'Privacy Settings',
      description: 'Manage contact visibility',
      icon: 'shield-checkmark',
      color: '#EF4444',
      backgroundColor: '#FEF2F2',
      onPress: handlePrivacySettingsNavigation,
    },
    {
      id: 'events',
      title: 'View Events',
      description: 'Browse your call & SMS history',
      icon: 'time',
      color: '#3B82F6',
      backgroundColor: '#EFF6FF',
      onPress: handleEventsNavigation,
    },
    {
      id: 'contacts',
      title: 'View Contacts',
      description: 'Explore contact insights',
      icon: 'people',
      color: '#8B5CF6',
      backgroundColor: '#FAF5FF',
      onPress: handleContactsNavigation,
    },
  ];

  // Filter out disabled actions or show all based on state
  const visibleActions = quickActions.slice(0, 6); // Show top 6 most important

  const renderActionCard = (action: QuickAction) => (
    <TouchableOpacity
      key={action.id}
      style={[
        styles.actionCard,
        action.disabled && styles.actionCardDisabled
      ]}
      onPress={action.onPress}
      disabled={action.disabled}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIcon, { backgroundColor: action.backgroundColor }]}>
        <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={24} color={action.color} />
        {action.badge && action.badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {action.badge > 99 ? '99+' : action.badge.toString()}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.actionContent}>
        <Text style={[styles.actionTitle, action.disabled && styles.actionTitleDisabled]}>
          {action.title}
        </Text>
        <Text style={[styles.actionDescription, action.disabled && styles.actionDescriptionDisabled]}>
          {action.description}
        </Text>
      </View>
      <View style={styles.actionArrow}>
        {action.loading ? (
          <Ionicons name="hourglass" size={16} color="#9CA3AF" />
        ) : (
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Actions</Text>
        <Text style={styles.subtitle}>Manage your data and settings</Text>
      </View>

      <View style={styles.actionsGrid}>
        {visibleActions.map(renderActionCard)}
      </View>

      {/* Priority actions section */}
      {(pendingConflicts > 0 || queueDepth > 10) && (
        <View style={styles.prioritySection}>
          <View style={styles.priorityHeader}>
            <Ionicons name="warning" size={16} color="#F59E0B" />
            <Text style={styles.priorityTitle}>Needs Attention</Text>
          </View>
          
          {pendingConflicts > 0 && (
            <TouchableOpacity 
              style={styles.priorityItem} 
              onPress={handleConflictResolution}
            >
              <Ionicons name="construct" size={16} color="#F59E0B" />
              <Text style={styles.priorityText}>
                {pendingConflicts} conflicts need manual review
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
            </TouchableOpacity>
          )}
          
          {queueDepth > 10 && (
            <TouchableOpacity 
              style={styles.priorityItem} 
              onPress={onManualSync}
              disabled={syncInProgress}
            >
              <Ionicons name="cloud-upload" size={16} color="#F59E0B" />
              <Text style={styles.priorityText}>
                {queueDepth} items waiting to sync
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

EnhancedQuickActions.displayName = 'EnhancedQuickActions';

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  actionsGrid: {
    marginBottom: 16,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionCardDisabled: {
    opacity: 0.6,
    backgroundColor: '#F9FAFB',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  actionTitleDisabled: {
    color: '#9CA3AF',
  },
  actionDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  actionDescriptionDisabled: {
    color: '#D1D5DB',
  },
  actionArrow: {
    marginLeft: 8,
  },
  prioritySection: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  priorityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 8,
  },
  priorityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    marginBottom: 8,
  },
  priorityText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    marginLeft: 8,
    marginRight: 8,
  },
});