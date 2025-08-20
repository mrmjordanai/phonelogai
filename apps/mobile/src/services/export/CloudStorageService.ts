/**
 * Cloud Storage Service
 * Manages multiple cloud storage providers and provides unified interface
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  CloudProviderType,
  CloudStorageConfig,
  CloudExportOptions,
  SyncResult,
  CloudStorageEvent,
  CloudStorageEventCallback,
  ExportHistoryItem,
  ExportFormat
} from '../../types/export';
import {
  CloudProvider,
  UploadResult
} from '../../types/export/CloudTypes';
import { GoogleDriveProvider } from './providers/GoogleDriveProvider';
import { DropboxProvider } from './providers/DropboxProvider';
import { iCloudProvider } from './providers/iCloudProvider';

export class CloudStorageService {
  private static instance: CloudStorageService;
  private providers: Map<CloudProviderType, CloudProvider> = new Map();
  private eventCallbacks: CloudStorageEventCallback[] = [];
  private configs: Map<CloudProviderType, CloudStorageConfig> = new Map();

  private constructor() {
    this.initializeProviders();
  }

  static getInstance(): CloudStorageService {
    if (!CloudStorageService.instance) {
      CloudStorageService.instance = new CloudStorageService();
    }
    return CloudStorageService.instance;
  }

  /**
   * Initialize cloud storage providers
   */
  private initializeProviders(): void {
    // Initialize providers with configuration
    // In a real app, these credentials would come from environment variables or secure storage
    
    // Google Drive
    const googleDriveProvider = new GoogleDriveProvider(
      'your-google-client-id' // TODO: Configure with actual client ID from Expo Constants
    );
    this.providers.set('google-drive', googleDriveProvider as any);

    // Dropbox
    const dropboxProvider = new DropboxProvider(
      'your-dropbox-app-key' // TODO: Configure with actual app key from Expo Constants
    );
    this.providers.set('dropbox', dropboxProvider as any);

    // iCloud (iOS only)
    if (Platform.OS === 'ios') {
      const icloudProvider = new iCloudProvider();
      this.providers.set('icloud', icloudProvider as any);
    }

    // Load saved configurations
    this.loadConfigurations();
  }

  /**
   * Get available cloud providers
   */
  getAvailableProviders(): Array<{
    type: CloudProviderType;
    name: string;
    enabled: boolean;
    authenticated: boolean;
  }> {
    const providers: Array<{
      type: CloudProviderType;
      name: string;
      enabled: boolean;
      authenticated: boolean;
    }> = [];

    for (const [type, provider] of this.providers) {
      const config = this.configs.get(type);
      providers.push({
        type,
        name: provider.name,
        enabled: config?.enabled || false,
        authenticated: false // Will be updated async
      });
    }

    // Update authentication status asynchronously
    this.updateAuthenticationStatus(providers);

    return providers;
  }

  /**
   * Configure cloud provider
   */
  async configureProvider(
    type: CloudProviderType,
    config: CloudStorageConfig
  ): Promise<void> {
    this.configs.set(type, config);
    await this.saveConfigurations();
    
    this.emitEvent({
      type: 'upload_start',
      provider: type,
      data: { config },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Authenticate with cloud provider
   */
  async authenticate(type: CloudProviderType): Promise<boolean> {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Provider ${type} not found`);
    }

    try {
      this.emitEvent({
        type: 'auth_required',
        provider: type,
        timestamp: new Date().toISOString()
      });

      const result = await (provider as any).authenticate();
      
      if (result.success) {
        const config = this.configs.get(type) || { provider: type, enabled: true };
        config.enabled = true;
        await this.configureProvider(type, config);
      }

      return result.success;

    } catch (error) {
      console.error(`Authentication failed for ${type}:`, error);
      return false;
    }
  }

  /**
   * Upload file to cloud storage
   */
  async uploadToCloud(
    filePath: string,
    filename: string,
    options: CloudExportOptions
  ): Promise<UploadResult> {
    const providerType = options.provider || options.cloudProvider;
    if (!providerType) {
      throw new Error('No cloud provider specified');
    }
    
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(`Provider ${providerType} not found`);
    }

    const config = this.configs.get(providerType);
    if (!config?.enabled) {
      throw new Error(`Provider ${providerType} is not enabled`);
    }

    try {
      this.emitEvent({
        type: 'upload_start',
        provider: providerType,
        data: { filename },
        timestamp: new Date().toISOString()
      });

      // Read file content
      const fileContent = await this.readFileContent(filePath);
      const mimeType = this.getMimeType(filename);

      const fileData = {
        name: filename,
        content: fileContent,
        mimeType,
        size: fileContent.length * 2 // UTF-8 estimation
      };

      const uploadOptions = {
        folder: options.folder || 'PhoneLogAI Exports',
        overwrite: true,
        public: options.public,
        metadata: {
          uploaded_by: 'PhoneLogAI',
          uploaded_at: new Date().toISOString()
        },
        onProgress: (progress: { loaded: number; total: number; percentage: number }) => {
          this.emitEvent({
            type: 'upload_progress',
            provider: providerType,
            data: progress,
            timestamp: new Date().toISOString()
          });
        }
      };

      const result = await (provider as any).upload(fileData, options.folder || '/', uploadOptions);

      this.emitEvent({
        type: 'upload_complete',
        provider: providerType,
        data: result,
        timestamp: new Date().toISOString()
      });

      // Save to upload history
      await this.saveUploadHistory(result, { ...options, provider: providerType });

      // Send notification if requested
      if (options.notify) {
        await this.sendUploadNotification(result, providerType);
      }

      return result;

    } catch (error) {
      this.emitEvent({
        type: 'upload_error',
        provider: providerType,
        data: { error: error instanceof Error ? error.message : 'Upload failed' },
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Sync pending uploads
   */
  async syncPendingUploads(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      uploaded: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    try {
      const pendingUploads = await this.getPendingUploads();

      for (const upload of pendingUploads) {
        try {
          await this.uploadToCloud(
            upload.filePath,
            upload.filename,
            upload.options
          );
          
          result.uploaded++;
          await this.removePendingUpload(upload.id);

        } catch (error) {
          result.failed++;
          result.errors.push({
            filename: upload.filename,
            error: error instanceof Error ? error.message : 'Upload failed',
            retryable: true
          });
        }
      }

    } catch (error) {
      result.success = false;
      console.error('Sync failed:', error);
    }

    return result;
  }

  /**
   * Get upload history
   */
  async getUploadHistory(): Promise<ExportHistoryItem[]> {
    try {
      const historyKey = 'cloud_upload_history';
      const stored = await AsyncStorage.getItem(historyKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get upload history:', error);
      return [];
    }
  }

  /**
   * Delete cloud file
   */
  async deleteCloudFile(
    provider: CloudProviderType,
    fileId: string
  ): Promise<boolean> {
    const cloudProvider = this.providers.get(provider);
    if (!cloudProvider) {
      return false;
    }

    try {
      return await (cloudProvider as any).delete(fileId);
    } catch (error) {
      console.error(`Failed to delete file from ${provider}:`, error);
      return false;
    }
  }

  /**
   * Get provider quota information
   */
  async getProviderQuota(provider: CloudProviderType) {
    const cloudProvider = this.providers.get(provider);
    if (!cloudProvider) {
      return null;
    }

    try {
      return await (cloudProvider as any).getQuota();
    } catch (error) {
      console.error(`Failed to get quota for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Add event callback
   */
  addEventListener(callback: CloudStorageEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Remove event callback
   */
  removeEventListener(callback: CloudStorageEventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  /**
   * Queue upload for offline sync
   */
  async queueUpload(
    filePath: string,
    filename: string,
    options: CloudExportOptions
  ): Promise<void> {
    const queueItem = {
      id: `upload_${Date.now()}`,
      filePath,
      filename,
      options,
      timestamp: new Date().toISOString(),
      retryCount: 0
    };

    try {
      const queueKey = 'cloud_upload_queue';
      const existing = await AsyncStorage.getItem(queueKey);
      const queue = existing ? JSON.parse(existing) : [];
      
      queue.push(queueItem);
      await AsyncStorage.setItem(queueKey, JSON.stringify(queue));

    } catch (error) {
      console.error('Failed to queue upload:', error);
    }
  }

  /**
   * Get pending uploads from queue
   */
  private async getPendingUploads(): Promise<Array<{
    id: string;
    filePath: string;
    filename: string;
    options: CloudExportOptions;
    timestamp: string;
    retryCount: number;
  }>> {
    try {
      const queueKey = 'cloud_upload_queue';
      const stored = await AsyncStorage.getItem(queueKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get pending uploads:', error);
      return [];
    }
  }

  /**
   * Remove upload from queue
   */
  private async removePendingUpload(uploadId: string): Promise<void> {
    try {
      const queueKey = 'cloud_upload_queue';
      const existing = await AsyncStorage.getItem(queueKey);
      if (existing) {
        const queue = JSON.parse(existing);
        const filtered = queue.filter((item: unknown) => 
          typeof item === 'object' && item !== null && 'id' in item && 
          (item as { id: string }).id !== uploadId
        );
        await AsyncStorage.setItem(queueKey, JSON.stringify(filtered));
      }
    } catch (error) {
      console.error('Failed to remove pending upload:', error);
    }
  }

  /**
   * Save upload to history
   */
  private async saveUploadHistory(
    result: UploadResult,
    options: CloudExportOptions & { provider: CloudProviderType }
  ): Promise<void> {
    try {
      const historyKey = 'cloud_upload_history';
      const existing = await AsyncStorage.getItem(historyKey);
      const history = existing ? JSON.parse(existing) : [];

      const historyItem: ExportHistoryItem = {
        id: result.id,
        filename: result.name,
        format: this.getFormatFromFilename(result.name) as ExportFormat,
        size: result.size || 0,
        created_at: result.created_at,
        status: 'completed',
        url: result.url,
        cloudProvider: options.provider,
        cloudPath: result.path
      };

      history.unshift(historyItem);

      // Keep only last 100 uploads
      const trimmedHistory = history.slice(0, 100);

      await AsyncStorage.setItem(historyKey, JSON.stringify(trimmedHistory));

    } catch (error) {
      console.error('Failed to save upload history:', error);
    }
  }

  /**
   * Load provider configurations
   */
  private async loadConfigurations(): Promise<void> {
    try {
      const configKey = 'cloud_storage_configs';
      const stored = await AsyncStorage.getItem(configKey);
      if (stored) {
        const configs = JSON.parse(stored);
        for (const [type, config] of Object.entries(configs)) {
          this.configs.set(type as CloudProviderType, config as CloudStorageConfig);
        }
      }
    } catch (error) {
      console.error('Failed to load cloud storage configs:', error);
    }
  }

  /**
   * Save provider configurations
   */
  private async saveConfigurations(): Promise<void> {
    try {
      const configKey = 'cloud_storage_configs';
      const configs = Object.fromEntries(this.configs);
      await AsyncStorage.setItem(configKey, JSON.stringify(configs));
    } catch (error) {
      console.error('Failed to save cloud storage configs:', error);
    }
  }

  /**
   * Update authentication status for providers
   */
  private async updateAuthenticationStatus(
    providers: Array<{ type: CloudProviderType; authenticated: boolean }>
  ): Promise<void> {
    for (const providerInfo of providers) {
      const provider = this.providers.get(providerInfo.type);
      if (provider) {
        try {
          const isAuth = provider.isAuthenticated;
          providerInfo.authenticated = typeof isAuth === 'function' ? await isAuth() : isAuth;
        } catch {
          providerInfo.authenticated = false;
        }
      }
    }
  }

  /**
   * Emit cloud storage event
   */
  private emitEvent(event: CloudStorageEvent): void {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in cloud storage event callback:', error);
      }
    });
  }

  /**
   * Read file content from path
   */
  private async readFileContent(filePath: string): Promise<string> {
    const fs = require('expo-file-system');
    return await fs.readAsStringAsync(filePath);
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'csv': 'text/csv',
      'json': 'application/json',
      'zip': 'application/zip',
      'txt': 'text/plain'
    };

    return mimeTypes[extension || ''] || 'application/octet-stream';
  }

  /**
   * Get format from filename for history
   */
  private getFormatFromFilename(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension || 'unknown';
  }

  /**
   * Send upload notification
   */
  private async sendUploadNotification(
    result: UploadResult,
    provider: CloudProviderType
  ): Promise<void> {
    // This would integrate with the NotificationService
    console.log(`File ${result.name} uploaded to ${provider}`);
  }
}

// Export singleton instance
export const cloudStorageService = CloudStorageService.getInstance();