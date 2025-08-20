/**
 * SettingsService - Mobile Settings Management with AsyncStorage
 * Singleton service for managing user preferences and settings
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoService } from './CryptoService';
import type {
  UserSettings,
  SettingsValidationResult,
  SettingsValidationError,
  SettingsExportData,
  SettingsImportResult,
  SettingsCategory,
} from '../types/settings';
import {
  DEFAULT_SETTINGS,
  SETTINGS_CONSTRAINTS,
  RESTART_REQUIRED_SETTINGS,
  SYNC_AFFECTING_SETTINGS,
} from '../types/settings';

export interface SettingsEventData {
  category: SettingsCategory;
  setting: string;
  oldValue: unknown;
  newValue: unknown;
  requiresRestart: boolean;
  affectsSync: boolean;
}

export type SettingsEventListener = (_event: SettingsEventData) => void;

class SettingsServiceImpl {
  private static instance: SettingsServiceImpl;
  private readonly STORAGE_KEY = '@phonelogai:settings:v1';
  private readonly ENCRYPTED_STORAGE_KEY = '@phonelogai:settings:encrypted:v1';
  private readonly cryptoService: typeof CryptoService;
  
  private settings: UserSettings = DEFAULT_SETTINGS;
  private isLoaded = false;
  private listeners: Set<SettingsEventListener> = new Set();
  private pendingChanges: Map<string, unknown> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.cryptoService = CryptoService;
  }

  public static getInstance(): SettingsServiceImpl {
    if (!SettingsServiceImpl.instance) {
      SettingsServiceImpl.instance = new SettingsServiceImpl();
    }
    return SettingsServiceImpl.instance;
  }

  /**
   * Initialize the settings service and load settings from storage
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadSettings();
      console.log('SettingsService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SettingsService:', error);
      // Continue with default settings if loading fails
      this.settings = { ...DEFAULT_SETTINGS };
      this.isLoaded = true;
    }
  }

  /**
   * Load settings from AsyncStorage
   */
  public async loadSettings(): Promise<UserSettings> {
    try {
      // Try to load from encrypted storage first
      const encryptedData = await AsyncStorage.getItem(this.ENCRYPTED_STORAGE_KEY);
      if (encryptedData) {
        try {
          const decryptedData = await this.cryptoService.decrypt(JSON.parse(encryptedData));
          const loadedSettings = JSON.parse(decryptedData);
          this.settings = this.mergeWithDefaults(loadedSettings);
          this.isLoaded = true;
          return this.settings;
        } catch (decryptError) {
          console.warn('Failed to decrypt settings, falling back to unencrypted:', decryptError);
        }
      }

      // Fall back to unencrypted storage
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const loadedSettings = JSON.parse(data);
        this.settings = this.mergeWithDefaults(loadedSettings);
      } else {
        this.settings = { ...DEFAULT_SETTINGS };
      }

      this.isLoaded = true;
      return this.settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
      this.isLoaded = true;
      throw new Error(`Settings loading failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current settings (load if not already loaded)
   */
  public async getSettings(): Promise<UserSettings> {
    if (!this.isLoaded) {
      await this.loadSettings();
    }
    return { ...this.settings };
  }

  /**
   * Get a specific setting value
   */
  public async getSetting<T = unknown>(path: string): Promise<T | undefined> {
    const settings = await this.getSettings();
    return this.getValueByPath(settings, path) as T;
  }

  /**
   * Update settings with partial updates
   */
  public async updateSettings(updates: Partial<UserSettings>): Promise<void> {
    await this.ensureLoaded();

    const oldSettings = { ...this.settings };
    const newSettings = this.deepMerge(this.settings, updates);

    // Validate the updated settings
    const validation = this.validateSettings(newSettings);
    if (!validation.isValid) {
      const errorMessages = validation.errors.map(e => e.message).join(', ');
      throw new Error(`Settings validation failed: ${errorMessages}`);
    }

    this.settings = newSettings;

    // Track changes for event emission
    const changes = this.getChanges(oldSettings, newSettings);
    
    // Save to storage (debounced)
    await this.debouncedSave();

    // Emit change events
    this.emitChangeEvents(changes);
  }

  /**
   * Update a specific setting by path
   */
  public async updateSetting(path: string, value: unknown): Promise<void> {
    await this.ensureLoaded();

    const oldValue = this.getValueByPath(this.settings, path);
    if (oldValue === value) {
      return; // No change needed
    }

    const updates = this.createUpdateObject(path, value);
    await this.updateSettings(updates);
  }

  /**
   * Reset all settings to defaults
   */
  public async resetToDefaults(): Promise<void> {
    const oldSettings = { ...this.settings };
    this.settings = { ...DEFAULT_SETTINGS };
    
    await this.saveSettings();
    
    // Emit change events for all changed values
    const changes = this.getChanges(oldSettings, this.settings);
    this.emitChangeEvents(changes);
  }

  /**
   * Reset a specific category to defaults
   */
  public async resetCategoryToDefaults(category: SettingsCategory): Promise<void> {
    await this.ensureLoaded();
    
    const updates = {
      [category]: DEFAULT_SETTINGS[category],
    };
    
    await this.updateSettings(updates);
  }

  /**
   * Export settings as encrypted JSON string
   */
  public async exportSettings(): Promise<string> {
    await this.ensureLoaded();

    const exportData: SettingsExportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      userId: '', // Will be filled by caller if needed
      settings: this.settings,
      checksum: await this.generateChecksum(this.settings),
    };

    const jsonData = JSON.stringify(exportData, null, 2);
    
    // Encrypt the export data
    const encrypted = await this.cryptoService.encrypt(jsonData, { purpose: 'settings' });
    return JSON.stringify(encrypted);
  }

  /**
   * Import settings from encrypted JSON string
   */
  public async importSettings(encryptedData: string): Promise<SettingsImportResult> {
    const result: SettingsImportResult = {
      success: false,
      imported: [],
      errors: [],
      warnings: [],
    };

    try {
      // Decrypt the data
      const encrypted = JSON.parse(encryptedData);
      const jsonData = await this.cryptoService.decrypt(encrypted);
      const importData: SettingsExportData = JSON.parse(jsonData);

      // Validate checksum
      const calculatedChecksum = await this.generateChecksum(importData.settings);
      if (calculatedChecksum !== importData.checksum) {
        result.errors.push({
          field: 'checksum',
          message: 'Data integrity check failed',
          severity: 'error',
        });
        return result;
      }

      // Validate imported settings
      const validation = this.validateSettings(importData.settings);
      if (!validation.isValid) {
        result.errors.push(...validation.errors);
        return result;
      }

      // Apply the imported settings
      await this.updateSettings(importData.settings);
      
      result.success = true;
      result.imported = Object.keys(importData.settings);

    } catch (error) {
      result.errors.push({
        field: 'import',
        message: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      });
    }

    return result;
  }

  /**
   * Validate settings against constraints
   */
  public validateSettings(settings: UserSettings): SettingsValidationResult {
    const errors: SettingsValidationError[] = [];

    // Validate profile settings
    const profile = settings.profile;
    if (profile.displayName.length < SETTINGS_CONSTRAINTS.PROFILE.displayName.minLength ||
        profile.displayName.length > SETTINGS_CONSTRAINTS.PROFILE.displayName.maxLength) {
      errors.push({
        field: 'profile.displayName',
        message: `Display name must be between ${SETTINGS_CONSTRAINTS.PROFILE.displayName.minLength} and ${SETTINGS_CONSTRAINTS.PROFILE.displayName.maxLength} characters`,
        severity: 'error',
      });
    }

    if (profile.email && !SETTINGS_CONSTRAINTS.PROFILE.email.pattern.test(profile.email)) {
      errors.push({
        field: 'profile.email',
        message: 'Invalid email format',
        severity: 'error',
      });
    }

    // Validate privacy settings
    const privacy = settings.privacy;
    if (privacy.dataRetentionDays < SETTINGS_CONSTRAINTS.PRIVACY.dataRetentionDays.min ||
        privacy.dataRetentionDays > SETTINGS_CONSTRAINTS.PRIVACY.dataRetentionDays.max) {
      errors.push({
        field: 'privacy.dataRetentionDays',
        message: `Data retention must be between ${SETTINGS_CONSTRAINTS.PRIVACY.dataRetentionDays.min} and ${SETTINGS_CONSTRAINTS.PRIVACY.dataRetentionDays.max} days`,
        severity: 'error',
      });
    }

    // Validate data storage settings
    const dataStorage = settings.dataStorage;
    if (dataStorage.maxOfflineAge < SETTINGS_CONSTRAINTS.DATA_STORAGE.maxOfflineAge.min ||
        dataStorage.maxOfflineAge > SETTINGS_CONSTRAINTS.DATA_STORAGE.maxOfflineAge.max) {
      errors.push({
        field: 'dataStorage.maxOfflineAge',
        message: `Max offline age must be between ${SETTINGS_CONSTRAINTS.DATA_STORAGE.maxOfflineAge.min} and ${SETTINGS_CONSTRAINTS.DATA_STORAGE.maxOfflineAge.max} days`,
        severity: 'error',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Add event listener for settings changes
   */
  public addEventListener(listener: SettingsEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove event listener
   */
  public removeEventListener(listener: SettingsEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Check if a setting change requires app restart
   */
  public requiresRestart(settingPath: string): boolean {
    return RESTART_REQUIRED_SETTINGS.some(path => settingPath.startsWith(path));
  }

  /**
   * Check if a setting change affects sync behavior
   */
  public affectsSync(settingPath: string): boolean {
    return SYNC_AFFECTING_SETTINGS.some(path => settingPath.startsWith(path));
  }

  /**
   * Clear all cached settings and force reload
   */
  public async clearCache(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    this.isLoaded = false;
    this.pendingChanges.clear();
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }

  /**
   * Private helper methods
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.loadSettings();
    }
  }

  private mergeWithDefaults(loadedSettings: Partial<UserSettings>): UserSettings {
    return this.deepMerge(DEFAULT_SETTINGS, loadedSettings);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getValueByPath(obj: any, path: string): unknown {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createUpdateObject(path: string, value: unknown): any {
    const keys = path.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = {};
    let current = result;

    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    return result;
  }

  private async debouncedSave(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      await this.saveSettings();
      this.saveTimeout = null;
    }, 500); // 500ms debounce
  }

  private async saveSettings(): Promise<void> {
    try {
      // Save to encrypted storage
      const encrypted = await this.cryptoService.encrypt(JSON.stringify(this.settings), {
        purpose: 'settings',
      });
      await AsyncStorage.setItem(this.ENCRYPTED_STORAGE_KEY, JSON.stringify(encrypted));

      // Also save to unencrypted storage as backup
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  private getChanges(oldSettings: UserSettings, newSettings: UserSettings): Map<string, SettingsEventData> {
    const changes = new Map<string, SettingsEventData>();
    
    this.compareObjects(oldSettings, newSettings, '', changes);
    
    return changes;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private compareObjects(oldObj: any, newObj: any, path: string, changes: Map<string, SettingsEventData>): void {
    for (const key in newObj) {
      const currentPath = path ? `${path}.${key}` : key;
      const oldValue = oldObj[key];
      const newValue = newObj[key];

      if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
        this.compareObjects(oldValue || {}, newValue, currentPath, changes);
      } else if (oldValue !== newValue) {
        const category = path.split('.')[0] as SettingsCategory;
        changes.set(currentPath, {
          category,
          setting: currentPath,
          oldValue,
          newValue,
          requiresRestart: this.requiresRestart(currentPath),
          affectsSync: this.affectsSync(currentPath),
        });
      }
    }
  }

  private emitChangeEvents(changes: Map<string, SettingsEventData>): void {
    changes.forEach((eventData) => {
      this.listeners.forEach(listener => {
        try {
          listener(eventData);
        } catch (error) {
          console.error('Settings event listener error:', error);
        }
      });
    });
  }

  private async generateChecksum(settings: UserSettings): Promise<string> {
    const data = JSON.stringify(settings);
    return await this.cryptoService.generateHash(data, 'SHA256');
  }
}

export const SettingsService = SettingsServiceImpl.getInstance();