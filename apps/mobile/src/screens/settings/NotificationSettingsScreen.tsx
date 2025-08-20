import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
  TouchableOpacity,
  Modal,
  Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsStack';
import { useSettings } from '../../contexts/SettingsContext';
import { SyncHealthMonitor } from '../../services/SyncHealthMonitor';
import { NotificationService } from '../../services/NotificationService';
import {
  SettingToggle,
  SettingButton,
} from '../../components/settings';
import type { NotificationSettings } from '../../types/settings';

interface NotificationSettingsScreenProps {
  navigation: StackNavigationProp<SettingsStackParamList, 'NotificationSettings'>;
}

interface NotificationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
}

export function NotificationSettingsScreen({ navigation }: NotificationSettingsScreenProps) {
  const { settings, updateSettings, isLoading } = useSettings();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus | null>(null);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  useEffect(() => {
    checkNotificationPermissions();
    initializeNotificationService();
    navigation.setOptions({
      headerShown: true,
      title: 'Notifications',
      headerBackTitle: 'Settings',
    });
  }, [navigation]);

  const initializeNotificationService = async () => {
    try {
      await NotificationService.initialize();
    } catch (error) {
      console.error('Failed to initialize NotificationService:', error);
    }
  };

  const checkNotificationPermissions = async () => {
    try {
      const permissions = await NotificationService.getPermissions();
      setPermissionStatus(permissions);
    } catch (error) {
      console.error('Failed to check notification permissions:', error);
    }
  };

  const requestNotificationPermissions = async () => {
    try {
      const result = await NotificationService.requestPermissions();
      setPermissionStatus(result);

      if (result.granted) {
        // Enable push notifications in settings
        await handleNotificationChange('pushEnabled', true);
        Alert.alert(
          'Notifications Enabled',
          'You can now receive push notifications from the app.'
        );
      } else if (!result.canAskAgain) {
        Alert.alert(
          'Notifications Disabled',
          'To enable notifications, please go to Settings > Notifications and allow notifications for this app.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => NotificationService.openSettings() },
          ]
        );
      }
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      Alert.alert('Error', 'Failed to request notification permissions.');
    }
  };

  const handleNotificationChange = async (key: keyof NotificationSettings, value: boolean | string) => {
    try {
      // If trying to enable push notifications but no permission
      if (key === 'pushEnabled' && value === true && !permissionStatus?.granted) {
        await requestNotificationPermissions();
        return;
      }

      const updates = {
        notifications: {
          ...settings.notifications,
          [key]: value,
        },
      };

      await updateSettings(updates);

      // Connect with monitoring services
      if (key === 'syncAlerts') {
        const syncHealthMonitor = SyncHealthMonitor;
        if (value) {
          // Subscribe to sync health events
          syncHealthMonitor.on('issue_detected', handleSyncIssueNotification);
          syncHealthMonitor.on('status_changed', handleSyncStatusNotification);
        } else {
          // Unsubscribe from events
          syncHealthMonitor.off('issue_detected', handleSyncIssueNotification);
          syncHealthMonitor.off('status_changed', handleSyncStatusNotification);
        }
      }

      if (key === 'conflictAlerts') {
        if (value) {
          // Subscribe to conflict events
          // Note: ConflictResolver doesn't support events yet - implement callback pattern
          console.log('Conflict notifications enabled');
        } else {
          // Unsubscribe from events
          // Note: ConflictResolver doesn't support events yet
          console.log('Conflict notifications disabled');
        }
      }
    } catch (error) {
      console.error('Failed to update notification settings:', error);
      Alert.alert('Error', 'Failed to update notification settings.');
    }
  };

  const handleQuietHoursChange = async (key: 'enabled' | 'startTime' | 'endTime', value: boolean | string) => {
    try {
      const updates = {
        notifications: {
          ...settings.notifications,
          quietHours: {
            ...settings.notifications.quietHours,
            [key]: value,
          },
        },
      };

      await updateSettings(updates);
    } catch (error) {
      console.error('Failed to update quiet hours settings:', error);
      Alert.alert('Error', 'Failed to update quiet hours settings.');
    }
  };

  const handleTimeChange = (type: 'start' | 'end') => (event: unknown, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartTimePicker(false);
      setShowEndTimePicker(false);
    }

    if (selectedTime) {
      const timeString = selectedTime.toTimeString().slice(0, 5); // HH:MM format
      const key = type === 'start' ? 'startTime' : 'endTime';
      handleQuietHoursChange(key, timeString);
    }
  };

  const testNotification = async () => {
    if (!permissionStatus?.granted) {
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications to test this feature.'
      );
      return;
    }

    setTestingNotification(true);
    try {
      const notificationId = await NotificationService.scheduleNotification({
        title: 'Test Notification',
        body: 'This is a test notification from PhoneLog AI',
        data: { type: 'sync_issue', screen: 'Settings' },
        sound: settings.notifications.soundEnabled,
      });

      if (notificationId) {
        Alert.alert('Test Sent', 'A test notification has been sent.');
      } else {
        Alert.alert('Test Failed', 'Failed to send test notification. Check your settings.');
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      Alert.alert('Error', 'Failed to send test notification.');
    } finally {
      setTestingNotification(false);
    }
  };

  // Notification event handlers
  const handleSyncIssueNotification = async (eventData: { issue: { message: string; id: string } }) => {
    if (!settings.notifications.syncAlerts || !permissionStatus?.granted) return;

    const { issue } = eventData;
    await NotificationService.scheduleNotification({
      title: 'Sync Issue Detected',
      body: issue.message,
      data: { type: 'sync_issue', issueId: issue.id, screen: 'Dashboard' },
    });
  };

  const handleSyncStatusNotification = async (eventData: { status: { overallHealth: string; issues: unknown[] } }) => {
    if (!settings.notifications.syncAlerts || !permissionStatus?.granted) return;

    const { status } = eventData;
    if (status.overallHealth === 'error' || status.overallHealth === 'critical') {
      await NotificationService.scheduleNotification({
        title: 'Sync Health Alert',
        body: `Sync health: ${status.overallHealth}. ${status.issues.length} issues detected.`,
        data: { type: 'sync_health', screen: 'Dashboard' },
        priority: 'high',
      });
    }
  };

  const formatTimeDisplay = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour24 = parseInt(hours);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
  };

  const parseTimeString = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading notification settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Permission Status */}
        {permissionStatus && !permissionStatus.granted && (
          <View style={styles.permissionBanner}>
            <View style={styles.permissionContent}>
              <Ionicons name="notifications-off" size={24} color="#F59E0B" />
              <View style={styles.permissionText}>
                <Text style={styles.permissionTitle}>Notifications Disabled</Text>
                <Text style={styles.permissionDescription}>
                  Enable notifications to receive sync alerts and conflict notifications.
                </Text>
              </View>
            </View>
            <SettingButton
              title={permissionStatus.canAskAgain ? "Enable Notifications" : "Open Settings"}
              onPress={permissionStatus.canAskAgain ? requestNotificationPermissions : () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }}
              variant="outline"
              size="small"
              fullWidth={false}
            />
          </View>
        )}

        {/* System Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System Notifications</Text>
          
          <SettingToggle
            label="Push Notifications"
            description="Receive notifications from the app"
            value={settings.notifications.pushEnabled && (permissionStatus?.granted ?? false)}
            onValueChange={(value) => handleNotificationChange('pushEnabled', value)}
            disabled={!permissionStatus?.granted && !permissionStatus?.canAskAgain}
            icon="notifications"
            testID="push-notifications-toggle"
          />

          <SettingToggle
            label="Notification Sounds"
            description="Play sounds for notifications"
            value={settings.notifications.soundEnabled}
            onValueChange={(value) => handleNotificationChange('soundEnabled', value)}
            disabled={!settings.notifications.pushEnabled || !permissionStatus?.granted}
            icon="volume-high"
            testID="notification-sounds-toggle"
          />

          <SettingToggle
            label="Vibration"
            description="Vibrate for notifications"
            value={settings.notifications.vibrationEnabled}
            onValueChange={(value) => handleNotificationChange('vibrationEnabled', value)}
            disabled={!settings.notifications.pushEnabled || !permissionStatus?.granted}
            icon="phone-portrait"
            testID="notification-vibration-toggle"
          />
        </View>

        {/* App Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Notifications</Text>
          
          <SettingToggle
            label="Sync Alerts"
            description="Get notified about sync issues and status changes"
            value={settings.notifications.syncAlerts}
            onValueChange={(value) => handleNotificationChange('syncAlerts', value)}
            disabled={!settings.notifications.pushEnabled || !permissionStatus?.granted}
            icon="sync"
            testID="sync-alerts-toggle"
          />

          <SettingToggle
            label="Conflict Alerts"
            description="Get notified about data conflicts requiring review"
            value={settings.notifications.conflictAlerts}
            onValueChange={(value) => handleNotificationChange('conflictAlerts', value)}
            disabled={!settings.notifications.pushEnabled || !permissionStatus?.granted}
            icon="warning"
            testID="conflict-alerts-toggle"
          />

          <SettingToggle
            label="Email Notifications"
            description="Receive email summaries and alerts"
            value={settings.notifications.emailNotifications}
            onValueChange={(value) => handleNotificationChange('emailNotifications', value)}
            icon="mail"
            testID="email-notifications-toggle"
          />
        </View>

        {/* Quiet Hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quiet Hours</Text>
          
          <SettingToggle
            label="Enable Quiet Hours"
            description="Disable notifications during specified hours"
            value={settings.notifications.quietHours.enabled}
            onValueChange={(value) => handleQuietHoursChange('enabled', value)}
            icon="moon"
            testID="quiet-hours-toggle"
          />

          {settings.notifications.quietHours.enabled && (
            <>
              <TouchableOpacity
                style={styles.timePickerButton}
                onPress={() => setShowStartTimePicker(true)}
              >
                <View style={styles.timePickerContent}>
                  <Ionicons name="time" size={20} color="#6B7280" />
                  <View style={styles.timePickerText}>
                    <Text style={styles.timePickerLabel}>Start Time</Text>
                    <Text style={styles.timePickerValue}>
                      {formatTimeDisplay(settings.notifications.quietHours.startTime)}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.timePickerButton}
                onPress={() => setShowEndTimePicker(true)}
              >
                <View style={styles.timePickerContent}>
                  <Ionicons name="time" size={20} color="#6B7280" />
                  <View style={styles.timePickerText}>
                    <Text style={styles.timePickerLabel}>End Time</Text>
                    <Text style={styles.timePickerValue}>
                      {formatTimeDisplay(settings.notifications.quietHours.endTime)}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Test Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test</Text>
          
          <SettingButton
            title="Send Test Notification"
            onPress={testNotification}
            loading={testingNotification}
            disabled={!permissionStatus?.granted}
            variant="outline"
            icon="send"
          />
        </View>

        {/* Time Pickers */}
        {Platform.OS === 'ios' && showStartTimePicker && (
          <Modal
            transparent
            animationType="fade"
            visible={showStartTimePicker}
            onRequestClose={() => setShowStartTimePicker(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.timePickerModal}>
                <View style={styles.timePickerHeader}>
                  <TouchableOpacity onPress={() => setShowStartTimePicker(false)}>
                    <Text style={styles.timePickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.timePickerTitle}>Start Time</Text>
                  <TouchableOpacity onPress={() => setShowStartTimePicker(false)}>
                    <Text style={styles.timePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={parseTimeString(settings.notifications.quietHours.startTime)}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange('start')}
                />
              </View>
            </View>
          </Modal>
        )}

        {Platform.OS === 'ios' && showEndTimePicker && (
          <Modal
            transparent
            animationType="fade"
            visible={showEndTimePicker}
            onRequestClose={() => setShowEndTimePicker(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.timePickerModal}>
                <View style={styles.timePickerHeader}>
                  <TouchableOpacity onPress={() => setShowEndTimePicker(false)}>
                    <Text style={styles.timePickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.timePickerTitle}>End Time</Text>
                  <TouchableOpacity onPress={() => setShowEndTimePicker(false)}>
                    <Text style={styles.timePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={parseTimeString(settings.notifications.quietHours.endTime)}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange('end')}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Android Time Pickers */}
        {Platform.OS === 'android' && showStartTimePicker && (
          <DateTimePicker
            value={parseTimeString(settings.notifications.quietHours.startTime)}
            mode="time"
            display="default"
            onChange={handleTimeChange('start')}
          />
        )}

        {Platform.OS === 'android' && showEndTimePicker && (
          <DateTimePicker
            value={parseTimeString(settings.notifications.quietHours.endTime)}
            mode="time"
            display="default"
            onChange={handleTimeChange('end')}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  permissionBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  permissionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  permissionText: {
    flex: 1,
    marginLeft: 12,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 14,
    color: '#A16207',
    lineHeight: 18,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  timePickerButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  timePickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timePickerText: {
    marginLeft: 12,
  },
  timePickerLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  timePickerValue: {
    fontSize: 14,
    color: '#6B7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  timePickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  timePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  timePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  timePickerCancel: {
    fontSize: 16,
    color: '#6B7280',
  },
  timePickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
});