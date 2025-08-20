/**
 * NotificationService - Expo Notifications Management
 * Handles notification setup, scheduling, and deep linking
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsService } from './SettingsService';

export interface NotificationData {
  type: 'sync_issue' | 'sync_health' | 'conflicts' | 'high_conflict_volume' | 'data_quality';
  screen?: string;
  issueId?: string;
  conflictId?: string;
  [key: string]: unknown;
}

export interface ScheduleNotificationOptions {
  title: string;
  body: string;
  data?: NotificationData;
  sound?: boolean;
  vibrate?: boolean;
  priority?: 'default' | 'high' | 'max';
  category?: string;
}

class NotificationServiceImpl {
  private static instance: NotificationServiceImpl;
  private isInitialized = false;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;
  private readonly LAST_NOTIFICATION_KEY = '@phonelogai:notification:lastId';

  private constructor() {
    // Set default notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: await this.shouldPlaySound(),
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }

  public static getInstance(): NotificationServiceImpl {
    if (!NotificationServiceImpl.instance) {
      NotificationServiceImpl.instance = new NotificationServiceImpl();
    }
    return NotificationServiceImpl.instance;
  }

  /**
   * Initialize the notification service
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Register for push notifications if permissions are granted
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        await this.registerForPushNotifications();
      }

      // Set up notification listeners
      this.setupNotificationListeners();

      // Configure notification categories (iOS)
      if (Platform.OS === 'ios') {
        await this.setupNotificationCategories();
      }

      this.isInitialized = true;
      console.log('NotificationService initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize NotificationService:', error);
      return false;
    }
  }

  /**
   * Request notification permissions
   */
  public async requestPermissions(): Promise<{
    granted: boolean;
    canAskAgain: boolean;
    status: Notifications.PermissionStatus;
  }> {
    try {
      const { status, canAskAgain } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

      const granted = status === 'granted';

      if (granted) {
        await this.registerForPushNotifications();
      }

      return { granted, canAskAgain, status };
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied' as Notifications.PermissionStatus,
      };
    }
  }

  /**
   * Check current notification permissions
   */
  public async getPermissions(): Promise<{
    granted: boolean;
    canAskAgain: boolean;
    status: Notifications.PermissionStatus;
  }> {
    try {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      return {
        granted: status === 'granted',
        canAskAgain,
        status,
      };
    } catch (error) {
      console.error('Failed to get notification permissions:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied' as Notifications.PermissionStatus,
      };
    }
  }

  /**
   * Schedule a local notification
   */
  public async scheduleNotification(options: ScheduleNotificationOptions): Promise<string | null> {
    try {
      const permissions = await this.getPermissions();
      if (!permissions.granted) {
        console.warn('Cannot schedule notification: permissions not granted');
        return null;
      }

      const settings = await SettingsService.getSettings();

      // Check if notifications are enabled
      if (!settings.notifications.pushEnabled) {
        console.log('Notifications disabled in settings');
        return null;
      }

      // Check quiet hours
      if (await this.isQuietHours()) {
        console.log('Skipping notification during quiet hours');
        return null;
      }

      // Store last notification ID for deduplication
      const lastNotificationId = await AsyncStorage.getItem(this.LAST_NOTIFICATION_KEY);
      const notificationKey = `${options.title}-${options.body}`;
      
      if (lastNotificationId === notificationKey) {
        console.log('Skipping duplicate notification');
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: options.title,
          body: options.body,
          data: options.data,
          sound: (options.sound !== false && settings.notifications.soundEnabled) ? 'default' : undefined,
          priority: Platform.OS === 'android' ? this.mapPriority(options.priority) : undefined,
          categoryIdentifier: options.category,
        },
        trigger: null, // Immediate notification
      });

      // Store notification ID for deduplication
      await AsyncStorage.setItem(this.LAST_NOTIFICATION_KEY, notificationKey);

      console.log('Notification scheduled:', notificationId);
      return notificationId;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return null;
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  public async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await AsyncStorage.removeItem(this.LAST_NOTIFICATION_KEY);
      console.log('All notifications cancelled');
    } catch (error) {
      console.error('Failed to cancel notifications:', error);
    }
  }

  /**
   * Handle notification response (when user taps notification)
   */
  public onNotificationResponse(handler: (_notification: Notifications.NotificationResponse) => void): () => void {
    const subscription = Notifications.addNotificationResponseReceivedListener(handler);
    
    return () => {
      subscription.remove();
    };
  }

  /**
   * Handle received notification (when app is in foreground)
   */
  public onNotificationReceived(handler: (_notification: Notifications.Notification) => void): () => void {
    const subscription = Notifications.addNotificationReceivedListener(handler);
    
    return () => {
      subscription.remove();
    };
  }

  /**
   * Open system notification settings
   */
  public async openSettings(): Promise<void> {
    try {
      // Note: openSettingsAsync doesn't exist in expo-notifications
      // Users need to manually go to Settings > Notifications > App Name
      console.warn('Please manually open Settings > Notifications to configure app notifications');
    } catch (error) {
      console.error('Failed to open notification settings:', error);
    }
  }

  /**
   * Cleanup notification service
   */
  public cleanup(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }

    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }

    this.isInitialized = false;
  }

  /**
   * Private helper methods
   */
  private async registerForPushNotifications(): Promise<void> {
    try {
      // Get push token for future push notification support
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'phonelogai-mobile',
      });
      
      console.log('Push notification token:', token.data);
      
      // TODO: Send token to backend for push notification support
    } catch (error) {
      console.warn('Failed to get push notification token:', error);
    }
  }

  private setupNotificationListeners(): void {
    // Listen for notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Listen for user interactions with notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      
      // Handle deep linking based on notification data
      this.handleNotificationResponse(response);
    });
  }

  private async setupNotificationCategories(): Promise<void> {
    if (Platform.OS !== 'ios') return;

    try {
      await Notifications.setNotificationCategoryAsync('sync_issue', [
        {
          identifier: 'view_dashboard',
          buttonTitle: 'View Dashboard',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'dismiss',
          buttonTitle: 'Dismiss',
          options: { opensAppToForeground: false },
        },
      ]);

      await Notifications.setNotificationCategoryAsync('conflict_alert', [
        {
          identifier: 'review_conflicts',
          buttonTitle: 'Review',
          options: { opensAppToForeground: true },
        },
        {
          identifier: 'dismiss',
          buttonTitle: 'Later',
          options: { opensAppToForeground: false },
        },
      ]);

      console.log('iOS notification categories set up');
    } catch (error) {
      console.error('Failed to setup notification categories:', error);
    }
  }

  private handleNotificationResponse(response: Notifications.NotificationResponse): void {
    const { notification, actionIdentifier } = response;
    const data = notification.request.content.data as NotificationData;

    // Handle action-based responses
    if (actionIdentifier === 'view_dashboard') {
      // TODO: Navigate to dashboard
      console.log('Navigate to dashboard');
      return;
    }

    if (actionIdentifier === 'review_conflicts') {
      // TODO: Navigate to conflict review screen
      console.log('Navigate to conflict review');
      return;
    }

    if (actionIdentifier === 'dismiss') {
      return; // Do nothing
    }

    // Handle default tap (no action)
    if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      // TODO: Implement navigation based on notification type
      switch (data?.type) {
        case 'sync_issue':
        case 'sync_health':
          console.log('Navigate to dashboard for sync issue');
          break;
        case 'conflicts':
        case 'high_conflict_volume':
          console.log('Navigate to conflict review');
          break;
        default:
          console.log('Navigate to default screen');
      }
    }
  }

  private async shouldPlaySound(): Promise<boolean> {
    try {
      const settings = await SettingsService.getSettings();
      return settings.notifications.soundEnabled;
    } catch (error) {
      console.error('Failed to get sound setting:', error);
      return true; // Default to playing sound
    }
  }

  private async isQuietHours(): Promise<boolean> {
    try {
      const settings = await SettingsService.getSettings();
      const { quietHours } = settings.notifications;

      if (!quietHours.enabled) {
        return false;
      }

      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
      const { startTime, endTime } = quietHours;

      // Simple time range check (assumes same day)
      if (startTime <= endTime) {
        return currentTime >= startTime && currentTime <= endTime;
      } else {
        // Handle overnight quiet hours (e.g., 22:00 to 08:00)
        return currentTime >= startTime || currentTime <= endTime;
      }
    } catch (error) {
      console.error('Failed to check quiet hours:', error);
      return false;
    }
  }

  private mapPriority(priority?: string): Notifications.AndroidNotificationPriority {
    switch (priority) {
      case 'high':
        return Notifications.AndroidNotificationPriority.HIGH;
      case 'max':
        return Notifications.AndroidNotificationPriority.MAX;
      default:
        return Notifications.AndroidNotificationPriority.DEFAULT;
    }
  }
}

export const NotificationService = NotificationServiceImpl.getInstance();