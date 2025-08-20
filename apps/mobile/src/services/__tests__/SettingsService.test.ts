/**
 * SettingsService Tests
 * Verify the Settings infrastructure functionality
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsService } from '../SettingsService';
import { DEFAULT_SETTINGS } from '../../types/settings';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock CryptoService
jest.mock('../CryptoService', () => ({
  CryptoService: {
    encrypt: jest.fn().mockResolvedValue({ data: 'encrypted', iv: 'iv', salt: 'salt', keyId: 'key' }),
    decrypt: jest.fn().mockResolvedValue('decrypted-data'),
    generateHash: jest.fn().mockResolvedValue('hash123'),
  },
}));

describe('SettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the singleton instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SettingsService as any).instance = undefined;
  });

  describe('initialization', () => {
    it('should initialize with default settings when no stored settings exist', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await SettingsService.initialize();
      const settings = await SettingsService.getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should load settings from storage when they exist', async () => {
      const storedSettings = {
        profile: { ...DEFAULT_SETTINGS.profile, displayName: 'Test User' },
        privacy: DEFAULT_SETTINGS.privacy,
        notifications: DEFAULT_SETTINGS.notifications,
        dataStorage: DEFAULT_SETTINGS.dataStorage,
        ui: DEFAULT_SETTINGS.ui,
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(storedSettings));

      await SettingsService.initialize();
      const settings = await SettingsService.getSettings();

      expect(settings.profile.displayName).toBe('Test User');
    });
  });

  describe('settings updates', () => {
    beforeEach(async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      await SettingsService.initialize();
    });

    it('should update settings and save to storage', async () => {
      const updates = {
        profile: { ...DEFAULT_SETTINGS.profile, displayName: 'Updated User' },
      };

      await SettingsService.updateSettings(updates);
      const settings = await SettingsService.getSettings();

      expect(settings.profile.displayName).toBe('Updated User');
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should update a specific setting by path', async () => {
      await SettingsService.updateSetting('profile.displayName', 'Path Updated User');
      const settings = await SettingsService.getSettings();

      expect(settings.profile.displayName).toBe('Path Updated User');
    });

    it('should validate settings before updating', async () => {
      const invalidUpdates = {
        privacy: { ...DEFAULT_SETTINGS.privacy, dataRetentionDays: -10 }, // Invalid value
      };

      await expect(SettingsService.updateSettings(invalidUpdates))
        .rejects.toThrow('Settings validation failed');
    });
  });

  describe('validation', () => {
    it('should validate display name length', () => {
      const invalidSettings = {
        ...DEFAULT_SETTINGS,
        profile: { ...DEFAULT_SETTINGS.profile, displayName: '' }, // Too short
      };

      const result = SettingsService.validateSettings(invalidSettings);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'profile.displayName',
          severity: 'error',
        })
      );
    });

    it('should validate email format', () => {
      const invalidSettings = {
        ...DEFAULT_SETTINGS,
        profile: { ...DEFAULT_SETTINGS.profile, email: 'invalid-email' },
      };

      const result = SettingsService.validateSettings(invalidSettings);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'profile.email',
          severity: 'error',
        })
      );
    });

    it('should validate data retention days range', () => {
      const invalidSettings = {
        ...DEFAULT_SETTINGS,
        privacy: { ...DEFAULT_SETTINGS.privacy, dataRetentionDays: 5000 }, // Too high
      };

      const result = SettingsService.validateSettings(invalidSettings);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'privacy.dataRetentionDays',
          severity: 'error',
        })
      );
    });
  });

  describe('reset functionality', () => {
    beforeEach(async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      await SettingsService.initialize();
    });

    it('should reset all settings to defaults', async () => {
      // First update some settings
      await SettingsService.updateSetting('profile.displayName', 'Test User');
      await SettingsService.updateSetting('ui.theme', 'dark');

      // Then reset
      await SettingsService.resetToDefaults();
      const settings = await SettingsService.getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should reset a specific category to defaults', async () => {
      // Update profile settings
      await SettingsService.updateSetting('profile.displayName', 'Test User');
      await SettingsService.updateSetting('ui.theme', 'dark');

      // Reset only profile category
      await SettingsService.resetCategoryToDefaults('profile');
      const settings = await SettingsService.getSettings();

      expect(settings.profile).toEqual(DEFAULT_SETTINGS.profile);
      expect(settings.ui.theme).toBe('dark'); // Should remain unchanged
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      await SettingsService.initialize();
    });

    it('should emit events when settings change', async () => {
      const listener = jest.fn();
      SettingsService.addEventListener(listener);

      await SettingsService.updateSetting('profile.displayName', 'Event Test User');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'profile',
          setting: 'profile.displayName',
          newValue: 'Event Test User',
          requiresRestart: false,
          affectsSync: false,
        })
      );
    });

    it('should identify settings that require restart', () => {
      expect(SettingsService.requiresRestart('ui.language')).toBe(true);
      expect(SettingsService.requiresRestart('profile.displayName')).toBe(false);
    });

    it('should identify settings that affect sync', () => {
      expect(SettingsService.affectsSync('dataStorage.syncOnWifiOnly')).toBe(true);
      expect(SettingsService.affectsSync('profile.displayName')).toBe(false);
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      await SettingsService.initialize();
    });

    it('should get specific setting by path', async () => {
      await SettingsService.updateSetting('profile.displayName', 'Path Test User');
      
      const displayName = await SettingsService.getSetting<string>('profile.displayName');
      expect(displayName).toBe('Path Test User');
    });

    it('should return undefined for non-existent path', async () => {
      const nonExistent = await SettingsService.getSetting('non.existent.path');
      expect(nonExistent).toBeUndefined();
    });
  });
});