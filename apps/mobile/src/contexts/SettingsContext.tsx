/**
 * Settings Context Provider for Mobile App
 * Global state management for user settings with React Context
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { SettingsService, SettingsEventData, SettingsEventListener } from '../services/SettingsService';
import type {
  UserSettings,
  SettingsValidationResult,
  SettingsImportResult,
  SettingsCategory,
} from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

export interface SettingsContextType {
  // Settings state
  settings: UserSettings;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  
  // Settings operations
  updateSettings: (_updates: Partial<UserSettings>) => Promise<void>;
  updateSetting: (_path: string, _value: unknown) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  resetCategoryToDefaults: (_category: SettingsCategory) => Promise<void>;
  
  // Import/Export
  exportSettings: () => Promise<string>;
  importSettings: (_data: string) => Promise<SettingsImportResult>;
  
  // Utilities
  getSetting: <T = unknown>(_path: string) => T | undefined;
  validateSettings: (_settings: UserSettings) => SettingsValidationResult;
  requiresRestart: (_settingPath: string) => boolean;
  affectsSync: (_settingPath: string) => boolean;
  
  // Event handling
  onSettingsChange: (_listener: SettingsEventListener) => () => void;
  
  // Cache management
  refreshSettings: () => Promise<void>;
  clearCache: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

interface SettingsProviderProps {
  children: React.ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const listenersRef = useRef<Set<SettingsEventListener>>(new Set());
  const settingsService = SettingsService;

  // Initialize settings service and load settings
  const initializeSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await settingsService.initialize();
      const loadedSettings = await settingsService.getSettings();
      
      setSettings(loadedSettings);
      setIsInitialized(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize settings';
      console.error('Settings initialization failed:', err);
      setError(errorMessage);
      
      // Fall back to default settings
      setSettings(DEFAULT_SETTINGS);
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  }, [settingsService]);

  // Set up settings change listener
  const setupSettingsListener = useCallback(() => {
    const handleSettingsChange: SettingsEventListener = async (eventData: SettingsEventData) => {
      try {
        // Refresh settings from service to get the latest state
        const updatedSettings = await settingsService.getSettings();
        setSettings(updatedSettings);
        
        // Notify any additional listeners
        listenersRef.current.forEach(listener => {
          try {
            listener(eventData);
          } catch (error) {
            console.error('Settings change listener error:', error);
          }
        });
      } catch (error) {
        console.error('Failed to refresh settings after change:', error);
      }
    };

    settingsService.addEventListener(handleSettingsChange);
    
    return () => {
      settingsService.removeEventListener(handleSettingsChange);
    };
  }, [settingsService]);

  // Initialize on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await initializeSettings();
      
      if (mounted) {
        setupSettingsListener();
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [initializeSettings, setupSettingsListener]);

  // Settings operations
  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    try {
      setError(null);
      await settingsService.updateSettings(updates);
      // Settings will be updated via the change listener
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update settings';
      console.error('Settings update failed:', err);
      setError(errorMessage);
      throw err;
    }
  }, [settingsService]);

  const updateSetting = useCallback(async (path: string, value: unknown) => {
    try {
      setError(null);
      await settingsService.updateSetting(path, value);
      // Settings will be updated via the change listener
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update setting';
      console.error('Setting update failed:', err);
      setError(errorMessage);
      throw err;
    }
  }, [settingsService]);

  const resetToDefaults = useCallback(async () => {
    try {
      setError(null);
      await settingsService.resetToDefaults();
      // Settings will be updated via the change listener
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset settings';
      console.error('Settings reset failed:', err);
      setError(errorMessage);
      throw err;
    }
  }, [settingsService]);

  const resetCategoryToDefaults = useCallback(async (category: SettingsCategory) => {
    try {
      setError(null);
      await settingsService.resetCategoryToDefaults(category);
      // Settings will be updated via the change listener
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset category';
      console.error('Category reset failed:', err);
      setError(errorMessage);
      throw err;
    }
  }, [settingsService]);

  // Import/Export operations
  const exportSettings = useCallback(async (): Promise<string> => {
    try {
      setError(null);
      return await settingsService.exportSettings();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export settings';
      console.error('Settings export failed:', err);
      setError(errorMessage);
      throw err;
    }
  }, [settingsService]);

  const importSettings = useCallback(async (data: string): Promise<SettingsImportResult> => {
    try {
      setError(null);
      const result = await settingsService.importSettings(data);
      
      if (!result.success) {
        const errorMessage = result.errors.map(e => e.message).join(', ');
        setError(`Import failed: ${errorMessage}`);
      }
      
      // Settings will be updated via the change listener if import succeeded
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import settings';
      console.error('Settings import failed:', err);
      setError(errorMessage);
      throw err;
    }
  }, [settingsService]);

  // Utility functions
  const getSetting = useCallback(<T = unknown>(path: string): T | undefined => {
    const keys = path.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = settings;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return current as T;
  }, [settings]);

  const validateSettings = useCallback((settingsToValidate: UserSettings): SettingsValidationResult => {
    return settingsService.validateSettings(settingsToValidate);
  }, [settingsService]);

  const requiresRestart = useCallback((settingPath: string): boolean => {
    return settingsService.requiresRestart(settingPath);
  }, [settingsService]);

  const affectsSync = useCallback((settingPath: string): boolean => {
    return settingsService.affectsSync(settingPath);
  }, [settingsService]);

  // Event handling
  const onSettingsChange = useCallback((listener: SettingsEventListener): (() => void) => {
    listenersRef.current.add(listener);
    
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Cache management
  const refreshSettings = useCallback(async () => {
    try {
      setError(null);
      const refreshedSettings = await settingsService.getSettings();
      setSettings(refreshedSettings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh settings';
      console.error('Settings refresh failed:', err);
      setError(errorMessage);
      throw err;
    }
  }, [settingsService]);

  const clearCache = useCallback(async () => {
    try {
      setError(null);
      await settingsService.clearCache();
      setSettings(DEFAULT_SETTINGS);
      setIsInitialized(false);
      await initializeSettings();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear cache';
      console.error('Cache clear failed:', err);
      setError(errorMessage);
      throw err;
    }
  }, [settingsService, initializeSettings]);

  const contextValue: SettingsContextType = {
    // Settings state
    settings,
    isLoading,
    isInitialized,
    error,
    
    // Settings operations
    updateSettings,
    updateSetting,
    resetToDefaults,
    resetCategoryToDefaults,
    
    // Import/Export
    exportSettings,
    importSettings,
    
    // Utilities
    getSetting,
    validateSettings,
    requiresRestart,
    affectsSync,
    
    // Event handling
    onSettingsChange,
    
    // Cache management
    refreshSettings,
    clearCache,
  };

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}

// Helper hooks for specific settings categories
export function useProfileSettings() {
  const { settings, updateSetting } = useSettings();
  
  return {
    settings: settings.profile,
    updateDisplayName: (displayName: string) => updateSetting('profile.displayName', displayName),
    updateEmail: (email: string) => updateSetting('profile.email', email),
    updateAvatar: (avatar: string) => updateSetting('profile.avatar', avatar),
    updateLanguage: (language: string) => updateSetting('profile.language', language),
    updateTimezone: (timezone: string) => updateSetting('profile.timezone', timezone),
  };
}

export function usePrivacySettings() {
  const { settings, updateSetting } = useSettings();
  
  return {
    settings: settings.privacy,
    updateDefaultVisibility: (visibility: 'private' | 'team' | 'public') => 
      updateSetting('privacy.defaultContactVisibility', visibility),
    updateAnonymization: (enabled: boolean) => updateSetting('privacy.enableAnonymization', enabled),
    updateDataRetention: (days: number) => updateSetting('privacy.dataRetentionDays', days),
    updateAnalytics: (enabled: boolean) => updateSetting('privacy.allowAnalytics', enabled),
    updateCrashReporting: (enabled: boolean) => updateSetting('privacy.allowCrashReporting', enabled),
    updateUsageStatistics: (enabled: boolean) => updateSetting('privacy.shareUsageStatistics', enabled),
  };
}

export function useNotificationSettings() {
  const { settings, updateSetting } = useSettings();
  
  return {
    settings: settings.notifications,
    updatePushEnabled: (enabled: boolean) => updateSetting('notifications.pushEnabled', enabled),
    updateSyncAlerts: (enabled: boolean) => updateSetting('notifications.syncAlerts', enabled),
    updateConflictAlerts: (enabled: boolean) => updateSetting('notifications.conflictAlerts', enabled),
    updateEmailNotifications: (enabled: boolean) => updateSetting('notifications.emailNotifications', enabled),
    updateQuietHours: (quietHours: { enabled: boolean; startTime: string; endTime: string }) => 
      updateSetting('notifications.quietHours', quietHours),
    updateSoundEnabled: (enabled: boolean) => updateSetting('notifications.soundEnabled', enabled),
    updateVibrationEnabled: (enabled: boolean) => updateSetting('notifications.vibrationEnabled', enabled),
  };
}

export function useDataStorageSettings() {
  const { settings, updateSetting } = useSettings();
  
  return {
    settings: settings.dataStorage,
    updateOfflineMode: (enabled: boolean) => updateSetting('dataStorage.offlineMode', enabled),
    updateAutoBackup: (enabled: boolean) => updateSetting('dataStorage.autoBackup', enabled),
    updateBackupFrequency: (frequency: 'daily' | 'weekly' | 'monthly') => 
      updateSetting('dataStorage.backupFrequency', frequency),
    updateCacheSize: (size: 'small' | 'medium' | 'large') => updateSetting('dataStorage.cacheSize', size),
    updateSyncOnWifiOnly: (enabled: boolean) => updateSetting('dataStorage.syncOnWifiOnly', enabled),
    updateMaxOfflineAge: (days: number) => updateSetting('dataStorage.maxOfflineAge', days),
    updateCompressionEnabled: (enabled: boolean) => updateSetting('dataStorage.compressionEnabled', enabled),
    updateEncryptionEnabled: (enabled: boolean) => updateSetting('dataStorage.encryptionEnabled', enabled),
  };
}

export function useUISettings() {
  const { settings, updateSetting } = useSettings();
  
  return {
    settings: settings.ui,
    updateTheme: (theme: 'light' | 'dark' | 'system') => updateSetting('ui.theme', theme),
    updateLanguage: (language: string) => updateSetting('ui.language', language),
    updateDateFormat: (format: 'US' | 'EU' | 'ISO') => updateSetting('ui.dateFormat', format),
    updateTimeFormat: (format: '12h' | '24h') => updateSetting('ui.timeFormat', format),
    updateDefaultScreen: (screen: 'dashboard' | 'events' | 'contacts' | 'chat') => 
      updateSetting('ui.defaultScreen', screen),
    updateShowTutorials: (enabled: boolean) => updateSetting('ui.showTutorials', enabled),
    updateReduceAnimations: (enabled: boolean) => updateSetting('ui.reduceAnimations', enabled),
    updateFontSize: (size: 'small' | 'medium' | 'large') => updateSetting('ui.fontSize', size),
  };
}