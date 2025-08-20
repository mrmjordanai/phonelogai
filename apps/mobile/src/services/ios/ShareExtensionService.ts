import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { ImportedFile } from './FileImportService';

export interface ShareExtensionConfig {
  acceptedFileTypes: string[];
  maxFileSize: number;
  allowMultipleFiles: boolean;
}

export interface ShareExtensionResult {
  success: boolean;
  files: ImportedFile[];
  errors: string[];
}

class ShareExtensionServiceClass {
  private static instance: ShareExtensionServiceClass;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ShareExtensionServiceClass {
    if (!ShareExtensionServiceClass.instance) {
      ShareExtensionServiceClass.instance = new ShareExtensionServiceClass();
    }
    return ShareExtensionServiceClass.instance;
  }

  /**
   * Initialize the share extension service
   */
  public async initialize(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      console.log('ShareExtensionService: Not available on this platform');
      return false;
    }

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      this.isInitialized = isAvailable;
      
      if (isAvailable) {
        console.log('ShareExtensionService: Initialized successfully');
      } else {
        console.log('ShareExtensionService: Sharing not available on this device');
      }
      
      return isAvailable;
    } catch (error) {
      console.error('ShareExtensionService: Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Check if share extension is available
   */
  public get isAvailable(): boolean {
    return Platform.OS === 'ios' && this.isInitialized;
  }

  /**
   * Check if sharing is available on the device
   */
  public async checkSharingSupport(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }

    try {
      return await Sharing.isAvailableAsync();
    } catch (error) {
      console.error('ShareExtensionService: Error checking sharing support:', error);
      return false;
    }
  }

  /**
   * Share a file from the app to other apps
   */
  public async shareFile(file: ImportedFile, options?: {
    dialogTitle?: string;
    excludedActivityTypes?: string[];
  }): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Share extension is not available');
    }

    try {
      await Sharing.shareAsync(file.uri, {
        mimeType: file.type,
        dialogTitle: options?.dialogTitle || `Share ${file.name}`,
        UTI: this.getUTIForMimeType(file.type),
      });
      
      return true;
    } catch (error) {
      console.error('ShareExtensionService: Error sharing file:', error);
      throw new Error(`Failed to share file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Share multiple files
   */
  public async shareFiles(files: ImportedFile[], options?: {
    dialogTitle?: string;
    excludedActivityTypes?: string[];
  }): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Share extension is not available');
    }

    if (files.length === 0) {
      throw new Error('No files to share');
    }

    if (files.length === 1) {
      return this.shareFile(files[0], options);
    }

    try {
      // For multiple files, we need to create a temporary directory and copy files
      const tempDir = `${FileSystem.cacheDirectory}shared_files_${Date.now()}/`;
      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

      const fileUris: string[] = [];
      
      for (const file of files) {
        const destUri = `${tempDir}${file.name}`;
        await FileSystem.copyAsync({
          from: file.uri,
          to: destUri,
        });
        fileUris.push(destUri);
      }

      // Share the first file (iOS limitation - can't share multiple files directly)
      await Sharing.shareAsync(fileUris[0], {
        dialogTitle: options?.dialogTitle || `Share ${files.length} files`,
      });

      // Cleanup temporary directory after a delay
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(tempDir);
        } catch (error) {
          console.warn('Failed to cleanup temporary share directory:', error);
        }
      }, 10000); // 10 seconds delay

      return true;
    } catch (error) {
      console.error('ShareExtensionService: Error sharing files:', error);
      throw new Error(`Failed to share files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Share text content (for sharing analysis results, etc.)
   */
  public async shareText(text: string, options?: {
    dialogTitle?: string;
    fileName?: string;
  }): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Share extension is not available');
    }

    try {
      // Create a temporary text file
      const fileName = options?.fileName || `phonelogai_export_${Date.now()}.txt`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(fileUri, text);

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: options?.dialogTitle || 'Share Text',
      });

      // Cleanup temporary file after a delay
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(fileUri);
        } catch (error) {
          console.warn('Failed to cleanup temporary text file:', error);
        }
      }, 5000); // 5 seconds delay

      return true;
    } catch (error) {
      console.error('ShareExtensionService: Error sharing text:', error);
      throw new Error(`Failed to share text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Share CSV data (for exporting analysis results)
   */
  public async shareCSV(csvData: string, fileName?: string): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Share extension is not available');
    }

    try {
      const csvFileName = fileName || `phonelogai_export_${Date.now()}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${csvFileName}`;
      
      await FileSystem.writeAsStringAsync(fileUri, csvData);

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Share Data Export',
        UTI: 'public.comma-separated-values-text',
      });

      // Cleanup temporary file after a delay
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(fileUri);
        } catch (error) {
          console.warn('Failed to cleanup temporary CSV file:', error);
        }
      }, 5000); // 5 seconds delay

      return true;
    } catch (error) {
      console.error('ShareExtensionService: Error sharing CSV:', error);
      throw new Error(`Failed to share CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get supported activities for sharing
   */
  public getSupportedActivities(): string[] {
    if (Platform.OS !== 'ios') {
      return [];
    }

    // iOS activities that are commonly available
    return [
      'com.apple.UIKit.activity.Mail',
      'com.apple.UIKit.activity.Message',
      'com.apple.UIKit.activity.AirDrop',
      'com.apple.CloudDocsUI.AddToiCloudDrive',
      'com.apple.UIKit.activity.SaveToCameraRoll',
      'com.apple.UIKit.activity.CopyToPasteboard',
    ];
  }

  /**
   * Get UTI (Uniform Type Identifier) for iOS sharing
   */
  private getUTIForMimeType(mimeType: string): string {
    const utiMap: Record<string, string> = {
      'text/csv': 'public.comma-separated-values-text',
      'application/pdf': 'com.adobe.pdf',
      'application/vnd.ms-excel': 'com.microsoft.excel.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'org.openxmlformats.spreadsheetml.sheet',
      'application/json': 'public.json',
      'application/zip': 'public.zip-archive',
      'text/plain': 'public.plain-text',
      'image/jpeg': 'public.jpeg',
      'image/png': 'public.png',
    };
    
    return utiMap[mimeType] || 'public.data';
  }

  /**
   * Get share extension guidance for users
   */
  public getShareExtensionGuidance(): {
    title: string;
    description: string;
    capabilities: string[];
    limitations: string[];
    tips: string[];
  } {
    return {
      title: 'iOS Sharing Features',
      description: 'Share files and data directly from PhoneLog AI to other apps and services.',
      capabilities: [
        'Share imported files to email, messages, or cloud storage',
        'Export analysis results as CSV or text files',
        'AirDrop files to nearby devices',
        'Save files to iCloud Drive or other cloud storage',
        'Copy data to clipboard for use in other apps',
      ],
      limitations: [
        'Multiple file sharing is limited by iOS system constraints',
        'Some apps may not support all file types',
        'Large files may take time to process before sharing',
        'Sharing requires the target app to be installed',
      ],
      tips: [
        'Use AirDrop for quick file transfers to nearby devices',
        'Email is the most reliable method for sharing with external users',
        'Save to iCloud Drive for easy access across your devices',
        'Check file size limits when sharing via email or messaging',
        'Some carrier data files may be large - consider splitting exports',
      ],
    };
  }

  /**
   * Create share intent for iOS app extensions (future enhancement)
   */
  public createShareIntent(_config: ShareExtensionConfig): {
    isSupported: boolean;
    message: string;
  } {
    // Note: Full iOS app extension support would require ejecting from Expo
    // or using development builds with custom native modules
    
    return {
      isSupported: false,
      message: 'Full iOS share extension integration requires custom native development. Currently using system sharing instead.',
    };
  }
}

export const ShareExtensionService = ShareExtensionServiceClass.getInstance();