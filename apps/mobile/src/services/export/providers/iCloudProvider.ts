/**
 * iCloud Provider
 * Handles iCloud integration for cloud exports (iOS only)
 */

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import {
  CloudProvider,
  AuthResult,
  FileData,
  UploadOptions,
  UploadResult,
  FileList,
  QuotaInfo
} from '../../../types/export/CloudTypes';

export class iCloudProvider implements CloudProvider {
  type = 'icloud' as const;
  name = 'iCloud Drive';
  id = 'icloud';
  icon = 'cloud';
  supportedFormats = ['csv', 'json', 'excel', 'pdf', 'zip'] as const;
  maxFileSize = 50 * 1024 * 1024; // 50MB per file through sharing

  async authenticate(): Promise<AuthResult> {
    try {
      // iCloud doesn't require explicit authentication
      // It uses the system's iCloud account
      if (Platform.OS !== 'ios') {
        return {
          success: false,
          error: 'iCloud is only available on iOS'
        };
      }

      // Check if sharing is available (indicates iCloud access)
      const isAvailable = await Sharing.isAvailableAsync();
      
      return {
        success: isAvailable,
        error: isAvailable ? undefined : 'iCloud sharing not available'
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'iCloud authentication error'
      };
    }
  }

  async upload(file: FileData, _path: string, _options?: UploadOptions): Promise<UploadResult> {
    if (Platform.OS !== 'ios') {
      throw new Error('iCloud is only available on iOS');
    }

    try {
      // Create temporary file
      const tempPath = `${FileSystem.documentDirectory}${file.name}`;
      
      if (typeof file.content === 'string') {
        await FileSystem.writeAsStringAsync(tempPath, file.content);
      } else {
        // Handle binary content
        const base64Content = this.bufferToBase64(file.content as unknown as Uint8Array);
        await FileSystem.writeAsStringAsync(tempPath, base64Content, {
          encoding: FileSystem.EncodingType.Base64
        });
      }

      // Share to iCloud Drive
      await Sharing.shareAsync(tempPath, {
        mimeType: file.mimeType,
        dialogTitle: `Save ${file.name} to iCloud Drive`,
        UTI: this.getMimeToUTI(file.mimeType)
      });

      // Clean up temporary file
      await FileSystem.deleteAsync(tempPath, { idempotent: true });

      return {
        id: `icloud_${Date.now()}`,
        name: file.name,
        url: 'icloud://saved',
        size: file.size,
        path: _path,
        created_at: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`iCloud upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async list(_path: string): Promise<FileList> {
    // iCloud Drive doesn't provide programmatic file listing
    // This would require CloudKit integration which is complex
    throw new Error('File listing not supported for iCloud Drive. Files are managed through the Files app.');
  }

  async download(_path: string): Promise<FileData> {
    // iCloud Drive doesn't provide programmatic file access
    throw new Error('File download not supported for iCloud Drive. Files are accessed through the Files app.');
  }

  async delete(_path: string): Promise<boolean> {
    // iCloud Drive doesn't provide programmatic file deletion
    throw new Error('File deletion not supported for iCloud Drive. Files are managed through the Files app.');
  }

  async getQuota(): Promise<QuotaInfo> {
    // iCloud quota information is not available through public APIs
    return {
      used: 0,
      total: 0,
      available: 0,
      percentage: 0
    };
  }

  isAuthenticated: (() => Promise<boolean>) = async (): Promise<boolean> => {
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      return await Sharing.isAvailableAsync();
    } catch {
      return false;
    }
  };

  /**
   * Save file directly to iCloud Drive using document picker
   */
  async saveToiCloudDrive(file: FileData): Promise<UploadResult> {
    return this.upload(file, '/', { folder: 'PhoneLogAI Exports' });
  }

  private bufferToBase64(buffer: Uint8Array): string {
    // Convert Buffer to base64 string
    let binary = '';
    const bytes = new Uint8Array(buffer);
    
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    return btoa(binary);
  }

  private getMimeToUTI(mimeType: string): string {
    const mimeToUTI: Record<string, string> = {
      'application/pdf': 'com.adobe.pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'org.openxmlformats.spreadsheetml.sheet',
      'text/csv': 'public.comma-separated-values-text',
      'application/json': 'public.json',
      'application/zip': 'public.zip-archive',
      'text/plain': 'public.plain-text'
    };

    return mimeToUTI[mimeType] || 'public.data';
  }
}