/**
 * Settings Types for Mobile App
 * Complete TypeScript interfaces for all setting categories
 */

export interface UserSettings {
  profile: ProfileSettings;
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  dataStorage: DataStorageSettings;
  ui: UISettings;
}

export interface ProfileSettings {
  displayName: string;
  email: string;
  avatar?: string;
  language: string;
  timezone: string;
}

export interface PrivacySettings {
  defaultContactVisibility: 'private' | 'team' | 'public';
  enableAnonymization: boolean;
  dataRetentionDays: number;
  allowAnalytics: boolean;
  allowCrashReporting: boolean;
  shareUsageStatistics: boolean;
}

export interface NotificationSettings {
  pushEnabled: boolean;
  syncAlerts: boolean;
  conflictAlerts: boolean;
  emailNotifications: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:MM format
    endTime: string; // HH:MM format
  };
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface DataStorageSettings {
  offlineMode: boolean;
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  cacheSize: 'small' | 'medium' | 'large';
  syncOnWifiOnly: boolean;
  maxOfflineAge: number; // days
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface UISettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  dateFormat: 'US' | 'EU' | 'ISO';
  timeFormat: '12h' | '24h';
  defaultScreen: 'dashboard' | 'events' | 'contacts' | 'chat';
  showTutorials: boolean;
  reduceAnimations: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

export interface SettingsValidationResult {
  isValid: boolean;
  errors: SettingsValidationError[];
}

export interface SettingsValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface SettingsExportData {
  version: string;
  exportedAt: string;
  userId: string;
  settings: UserSettings;
  checksum: string;
}

export interface SettingsImportResult {
  success: boolean;
  imported: string[]; // list of successfully imported settings categories
  errors: SettingsValidationError[];
  warnings: SettingsValidationError[];
}

// Default settings configuration
export const DEFAULT_SETTINGS: UserSettings = {
  profile: {
    displayName: '',
    email: '',
    avatar: undefined,
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  privacy: {
    defaultContactVisibility: 'private',
    enableAnonymization: true,
    dataRetentionDays: 365,
    allowAnalytics: false,
    allowCrashReporting: true,
    shareUsageStatistics: false,
  },
  notifications: {
    pushEnabled: true,
    syncAlerts: true,
    conflictAlerts: true,
    emailNotifications: false,
    quietHours: {
      enabled: false,
      startTime: '22:00',
      endTime: '08:00',
    },
    soundEnabled: true,
    vibrationEnabled: true,
  },
  dataStorage: {
    offlineMode: true,
    autoBackup: true,
    backupFrequency: 'weekly',
    cacheSize: 'medium',
    syncOnWifiOnly: false,
    maxOfflineAge: 7,
    compressionEnabled: true,
    encryptionEnabled: true,
  },
  ui: {
    theme: 'system',
    language: 'en',
    dateFormat: 'US',
    timeFormat: '12h',
    defaultScreen: 'dashboard',
    showTutorials: true,
    reduceAnimations: false,
    fontSize: 'medium',
  },
};

// Settings categories for navigation and organization
export const SETTINGS_CATEGORIES = {
  PROFILE: 'profile',
  PRIVACY: 'privacy',
  NOTIFICATIONS: 'notifications',
  DATA_STORAGE: 'dataStorage',
  UI: 'ui',
} as const;

export type SettingsCategory = typeof SETTINGS_CATEGORIES[keyof typeof SETTINGS_CATEGORIES];

// Validation constraints
export const SETTINGS_CONSTRAINTS = {
  PROFILE: {
    displayName: { minLength: 1, maxLength: 100 },
    email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  },
  PRIVACY: {
    dataRetentionDays: { min: 30, max: 3650 }, // 30 days to 10 years
  },
  DATA_STORAGE: {
    maxOfflineAge: { min: 1, max: 30 }, // 1-30 days
  },
  UI: {
    fontSize: ['small', 'medium', 'large'],
  },
} as const;

// Settings that require restart to take effect
export const RESTART_REQUIRED_SETTINGS: string[] = [
  'ui.language',
  'ui.theme',
  'dataStorage.encryptionEnabled',
  'dataStorage.compressionEnabled',
];

// Settings that affect data sync
export const SYNC_AFFECTING_SETTINGS: string[] = [
  'dataStorage.syncOnWifiOnly',
  'dataStorage.autoBackup',
  'dataStorage.backupFrequency',
  'notifications.syncAlerts',
];

// Settings that are device-specific (not synced)
export const DEVICE_SPECIFIC_SETTINGS: string[] = [
  'ui.theme',
  'ui.reduceAnimations',
  'ui.fontSize',
  'notifications.soundEnabled',
  'notifications.vibrationEnabled',
  'dataStorage.cacheSize',
];