import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { PlatformDetector } from '../../utils/PlatformDetector';
import { Platform } from 'react-native';

// Environment variables helper for React Native/Expo
const getEnvVar = (key: string, fallback: string = ''): string => {
  // Try Expo Constants first (for EXPO_PUBLIC_ vars)
  const expoValue = Constants.expoConfig?.extra?.[key] || Constants.manifest2?.extra?.expoClient?.extra?.[key];
  if (expoValue) {
    return expoValue;
  }
  
  // Fallback to global process.env if available
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }
  
  return fallback;
};

export interface FileImportOptions {
  allowedTypes?: string[];
  allowMultipleSelection?: boolean;
  maxFileSize?: number; // in bytes
  copyToCacheDirectory?: boolean;
  presentationStyle?: 'fullScreen' | 'pageSheet' | 'formSheet' | 'overFullScreen';
  cloudStorageEnabled?: boolean;
  allowCloudStorage?: boolean;
}

export interface ImportedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uri: string;
  lastModified?: number;
  isCloudFile?: boolean;
  cloudProvider?: 'icloud' | 'googledrive' | 'dropbox' | 'onedrive';
  metadata?: {
    creationDate?: Date;
    modificationDate?: Date;
    fileExtension?: string;
    encoding?: string;
    isDirectory?: boolean;
  };
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  format?: 'csv' | 'pdf' | 'excel' | 'json' | 'zip' | 'unknown';
  estimatedRows?: number;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  bytesUploaded: number;
  totalBytes: number;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  estimatedTimeRemaining?: number;
}

class FileImportServiceClass {
  private static instance: FileImportServiceClass;
  private uploadListeners: Map<string, (_progress: UploadProgress) => void> = new Map();
  private activeUploads: Map<string, AbortController> = new Map();

  private constructor() {}

  public static getInstance(): FileImportServiceClass {
    if (!FileImportServiceClass.instance) {
      FileImportServiceClass.instance = new FileImportServiceClass();
    }
    return FileImportServiceClass.instance;
  }

  /**
   * Check if file import is available on the current platform
   */
  public get isAvailable(): boolean {
    return PlatformDetector.config.capabilities.supportsFileImport;
  }

  /**
   * Open file picker to select carrier data files with iOS optimizations
   */
  public async pickFiles(options: FileImportOptions = {}): Promise<ImportedFile[]> {
    if (!this.isAvailable) {
      throw new Error('File import is not available on this platform');
    }

    try {
      const defaultTypes = [
        'text/csv',
        'text/comma-separated-values',
        'application/pdf',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/json',
        'text/json',
        'application/zip',
        'application/x-zip-compressed',
        'text/plain',
        'application/octet-stream', // For carrier-specific formats
      ];

      const pickerOptions: DocumentPicker.DocumentPickerOptions = {
        type: options.allowedTypes || defaultTypes,
        multiple: options.allowMultipleSelection || false,
        copyToCacheDirectory: options.copyToCacheDirectory !== false, // Default to true
      };

      // iOS-specific optimizations
      if (Platform.OS === 'ios') {
        // Enable iCloud and other cloud storage providers
        if (options.allowCloudStorage !== false) {
          // This enables access to iCloud Drive and other cloud providers
          pickerOptions.copyToCacheDirectory = true;
        }
        
        // Add iOS-specific presentation style
        if (options.presentationStyle) {
          (pickerOptions as typeof pickerOptions & { presentationStyle?: string }).presentationStyle = options.presentationStyle;
        }
      }

      const result = await DocumentPicker.getDocumentAsync(pickerOptions);

      if (result.canceled) {
        return [];
      }

      const files: ImportedFile[] = [];
      const assets = Array.isArray(result.assets) ? result.assets : [result.assets];

      for (const asset of assets) {
        // Check file size if limit is specified
        if (options.maxFileSize && asset.size && asset.size > options.maxFileSize) {
          throw new Error(`File "${asset.name}" is too large. Maximum size is ${this.formatFileSize(options.maxFileSize)}`);
        }

        // Enhanced file metadata extraction
        const metadata = await this.extractFileMetadata(asset.uri, asset.name);
        const cloudInfo = this.detectCloudProvider(asset.uri);

        const importedFile: ImportedFile = {
          id: this.generateFileId(),
          name: asset.name,
          size: asset.size || 0,
          type: asset.mimeType || this.detectMimeType(asset.name),
          uri: asset.uri,
          lastModified: asset.lastModified,
          isCloudFile: cloudInfo.isCloud,
          cloudProvider: cloudInfo.provider,
          metadata,
        };

        files.push(importedFile);
      }

      return files;
    } catch (error) {
      const errorObj = error as Error;
      console.error('FileImportService: Error picking files:', errorObj);
      
      // iOS-specific error handling
      if (Platform.OS === 'ios') {
        if (errorObj.message?.includes('cancelled') || errorObj.message?.includes('canceled')) {
          return []; // User cancelled, not an error
        }
        if (errorObj.message?.includes('permission')) {
          throw new Error('Please grant file access permission in iOS Settings > Privacy & Security > Files and Folders');
        }
        if (errorObj.message?.includes('icloud')) {
          throw new Error('iCloud file access failed. Please ensure iCloud Drive is enabled and the file is downloaded.');
        }
      }
      
      throw new Error(`Failed to select files: ${errorObj.message || 'Unknown error'}`);
    }
  }

  /**
   * Validate selected file before upload
   */
  public async validateFile(file: ImportedFile): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
    };

    try {
      // Check if file exists and is readable
      const fileInfo = await FileSystem.getInfoAsync(file.uri);
      if (!fileInfo.exists) {
        result.errors.push('File does not exist or is not accessible');
        return result;
      }

      // Detect file format
      result.format = this.detectFileFormat(file.name, file.type);

      // Basic file size validation
      if (file.size === 0) {
        result.errors.push('File is empty');
        return result;
      }

      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        result.errors.push(`File is too large (${this.formatFileSize(file.size)}). Maximum size is 100MB`);
        return result;
      }

      // Format-specific validation
      switch (result.format) {
        case 'csv':
          await this.validateCsvFile(file, result);
          break;
        case 'pdf':
          await this.validatePdfFile(file, result);
          break;
        case 'excel':
          await this.validateExcelFile(file, result);
          break;
        case 'json':
          await this.validateJsonFile(file, result);
          break;
        case 'zip':
          await this.validateZipFile(file, result);
          break;
        default:
          result.warnings.push('Unknown file format - processing may be limited');
      }

      // File is valid if no errors
      result.isValid = result.errors.length === 0;

      return result;
    } catch (error) {
      const errorObj = error as Error;
      console.error('FileImportService: Error validating file:', errorObj);
      result.errors.push(`Validation failed: ${errorObj.message || 'Unknown validation error'}`);
      return result;
    }
  }

  /**
   * Upload file to server with progress tracking
   */
  public async uploadFile(
    file: ImportedFile,
    onProgress?: (_progress: UploadProgress) => void
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('File import is not available on this platform');
    }

    const fileId = file.id;
    const abortController = new AbortController();
    this.activeUploads.set(fileId, abortController);

    if (onProgress) {
      this.uploadListeners.set(fileId, onProgress);
    }

    try {
      // Initial progress
      this.notifyProgress({
        fileId,
        fileName: file.name,
        bytesUploaded: 0,
        totalBytes: file.size,
        progress: 0,
        status: 'pending',
      });

      // Read file content for validation
      await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      this.notifyProgress({
        fileId,
        fileName: file.name,
        bytesUploaded: 0,
        totalBytes: file.size,
        progress: 5,
        status: 'uploading',
      });

      // React Native file upload - use native FormData
      const uploadUrl = `${getEnvVar('EXPO_PUBLIC_API_URL')}/api/import/upload`;
      
      // Create native FormData for React Native
      const formData = new (global as typeof global & { FormData: typeof FormData }).FormData();
      
      // Append file in React Native format
      // @ts-ignore - React Native FormData accepts {uri, type, name} format
      formData.append('file', {
        uri: file.uri,
        type: file.type,
        name: file.name,
      });

      formData.append('metadata', JSON.stringify({
        originalName: file.name,
        size: file.size,
        type: file.type,
        importSource: 'mobile_ios',
        timestamp: new Date().toISOString(),
      }));

      // React Native fetch with FormData (no explicit Content-Type needed)
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      this.notifyProgress({
        fileId,
        fileName: file.name,
        bytesUploaded: file.size,
        totalBytes: file.size,
        progress: 90,
        status: 'processing',
      });

      const result = await response.json();

      this.notifyProgress({
        fileId,
        fileName: file.name,
        bytesUploaded: file.size,
        totalBytes: file.size,
        progress: 100,
        status: 'completed',
      });

      return result.uploadId || result.id;

    } catch (error) {
      const errorObj = error as Error;
      if (errorObj.name === 'AbortError') {
        this.notifyProgress({
          fileId,
          fileName: file.name,
          bytesUploaded: 0,
          totalBytes: file.size,
          progress: 0,
          status: 'cancelled',
        });
        throw new Error('Upload cancelled by user');
      } else {
        this.notifyProgress({
          fileId,
          fileName: file.name,
          bytesUploaded: 0,
          totalBytes: file.size,
          progress: 0,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    } finally {
      this.activeUploads.delete(fileId);
      this.uploadListeners.delete(fileId);
    }
  }

  /**
   * Cancel an active upload
   */
  public cancelUpload(fileId: string): boolean {
    const controller = this.activeUploads.get(fileId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Get list of active uploads
   */
  public getActiveUploads(): string[] {
    return Array.from(this.activeUploads.keys());
  }

  private notifyProgress(progress: UploadProgress): void {
    const listener = this.uploadListeners.get(progress.fileId);
    if (listener) {
      listener(progress);
    }
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private detectFileFormat(fileName: string, mimeType: string): FileValidationResult['format'] {
    const extension = fileName.toLowerCase().split('.').pop() || '';
    
    // Enhanced format detection with iOS-specific considerations
    if (extension === 'csv' || mimeType.includes('csv') || mimeType.includes('comma-separated')) {
      return 'csv';
    }
    
    if (extension === 'pdf' || mimeType.includes('pdf')) {
      return 'pdf';
    }
    
    if (['xls', 'xlsx'].includes(extension) || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return 'excel';
    }
    
    if (extension === 'json' || mimeType.includes('json')) {
      return 'json';
    }
    
    if (['zip', '7z', 'tar', 'gz'].includes(extension) || mimeType.includes('zip') || mimeType.includes('archive')) {
      return 'zip';
    }
    
    // Common text formats that might contain call/SMS data
    if (['txt', 'log', 'dat'].includes(extension) || mimeType.includes('text')) {
      return 'csv'; // Treat as CSV for parsing
    }
    
    return 'unknown';
  }

  /**
   * Detect MIME type from file extension (iOS fallback)
   */
  private detectMimeType(fileName: string): string {
    const extension = fileName.toLowerCase().split('.').pop() || '';
    
    const mimeMap: Record<string, string> = {
      'csv': 'text/csv',
      'pdf': 'application/pdf',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'json': 'application/json',
      'zip': 'application/zip',
      'txt': 'text/plain',
      'log': 'text/plain',
      'dat': 'application/octet-stream',
    };
    
    if (!extension) {
      return 'application/octet-stream';
    }
    
    return mimeMap[extension] || 'application/octet-stream';
  }

  /**
   * Extract enhanced file metadata for iOS
   */
  private async extractFileMetadata(uri: string, fileName: string): Promise<ImportedFile['metadata']> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      // Type guard for FileInfo with modificationTime
      const hasModificationTime = 'modificationTime' in fileInfo && 
        typeof fileInfo.modificationTime === 'number';
      
      return {
        creationDate: hasModificationTime ? new Date(fileInfo.modificationTime * 1000) : undefined,
        modificationDate: hasModificationTime ? new Date(fileInfo.modificationTime * 1000) : undefined,
        fileExtension: fileName.split('.').pop()?.toLowerCase(),
        isDirectory: fileInfo.isDirectory || false,
      };
    } catch (error) {
      const errorObj = error as Error;
      console.warn('Failed to extract file metadata:', errorObj.message);
      return {
        fileExtension: fileName.split('.').pop()?.toLowerCase(),
      };
    }
  }

  /**
   * Detect if file is from cloud storage provider
   */
  private detectCloudProvider(uri: string): { isCloud: boolean; provider?: ImportedFile['cloudProvider'] } {
    if (uri.includes('icloud') || uri.includes('CloudDocs')) {
      return { isCloud: true, provider: 'icloud' };
    }
    
    if (uri.includes('googledrive') || uri.includes('google')) {
      return { isCloud: true, provider: 'googledrive' };
    }
    
    if (uri.includes('dropbox')) {
      return { isCloud: true, provider: 'dropbox' };
    }
    
    if (uri.includes('onedrive') || uri.includes('microsoft')) {
      return { isCloud: true, provider: 'onedrive' };
    }
    
    // Check for cloud-like URIs
    if (uri.startsWith('content://') || uri.includes('cloud') || uri.includes('drive')) {
      return { isCloud: true };
    }
    
    return { isCloud: false };
  }

  private async validateCsvFile(file: ImportedFile, result: FileValidationResult): Promise<void> {
    try {
      // Read first few lines to validate CSV structure
      const content = await FileSystem.readAsStringAsync(file.uri, { 
        length: 1024 // Read first 1KB
      });
      
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        result.errors.push('CSV file appears to be empty');
        return;
      }

      // Basic CSV validation - check for consistent column count
      const firstLineColumns = lines[0].split(',').length;
      if (firstLineColumns < 2) {
        result.warnings.push('CSV file has very few columns - may not contain call/SMS data');
      }

      // Estimate total rows
      const avgLineLength = content.length / lines.length;
      result.estimatedRows = Math.floor(file.size / avgLineLength);

      if (result.estimatedRows > 1000000) { // 1M rows
        result.warnings.push(`Large file detected (~${result.estimatedRows.toLocaleString()} rows) - processing may take some time`);
      }

    } catch (error) {
      result.errors.push(`CSV validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validatePdfFile(file: ImportedFile, result: FileValidationResult): Promise<void> {
    // PDF validation is limited on mobile - just check basic properties
    if (file.size < 1024) { // Less than 1KB is suspicious for a PDF
      result.warnings.push('PDF file is very small - may not contain data');
    }
    
    result.warnings.push('PDF processing requires server-side text extraction');
  }

  private async validateExcelFile(file: ImportedFile, result: FileValidationResult): Promise<void> {
    // Excel validation is limited on mobile
    if (file.size < 1024) {
      result.warnings.push('Excel file is very small - may not contain data');
    }
    
    result.warnings.push('Excel files will be processed server-side');
  }

  private async validateJsonFile(file: ImportedFile, result: FileValidationResult): Promise<void> {
    try {
      // Read and parse JSON to validate structure
      const content = await FileSystem.readAsStringAsync(file.uri);
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        result.estimatedRows = data.length;
      } else if (typeof data === 'object' && data.length) {
        result.estimatedRows = data.length;
      }
      
    } catch (error) {
      result.errors.push(`Invalid JSON file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateZipFile(file: ImportedFile, result: FileValidationResult): Promise<void> {
    result.warnings.push('ZIP files will be extracted and processed server-side');
    
    if (file.size > 50 * 1024 * 1024) { // 50MB
      result.warnings.push('Large ZIP file - processing may take significant time');
    }
  }

  /**
   * Share file using iOS native sharing
   */
  public async shareFile(file: ImportedFile): Promise<void> {
    if (!this.isAvailable || Platform.OS !== 'ios') {
      throw new Error('File sharing is not available on this platform');
    }

    try {
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        throw new Error('Sharing is not available on this device');
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: file.type,
        dialogTitle: `Share ${file.name}`,
        UTI: this.getUTIForMimeType(file.type),
      });
    } catch (error) {
      console.error('FileImportService: Error sharing file:', error);
      throw new Error(`Failed to share file: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    };
    
    return utiMap[mimeType] || 'public.data';
  }

  /**
   * Open file from URL (for cloud storage integration)
   */
  public async openFileFromURL(url: string, fileName?: string): Promise<ImportedFile> {
    if (!this.isAvailable) {
      throw new Error('File import is not available on this platform');
    }

    try {
      // Download file to cache directory
      const fileUri = `${FileSystem.cacheDirectory}${fileName || 'imported_file'}`;
      
      const downloadResult = await FileSystem.downloadAsync(url, fileUri);
      
      if (!downloadResult.uri) {
        throw new Error('Failed to download file from URL');
      }

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
      
      if (!fileInfo.exists) {
        throw new Error('Downloaded file does not exist');
      }

      const safeFileName = fileName || 'imported_file';
      const metadata = await this.extractFileMetadata(downloadResult.uri, safeFileName);
      
      // Type guard for modificationTime
      const hasModificationTime = 'modificationTime' in fileInfo && 
        typeof fileInfo.modificationTime === 'number';
      
      return {
        id: this.generateFileId(),
        name: safeFileName,
        size: fileInfo.size || 0,
        type: this.detectMimeType(safeFileName),
        uri: downloadResult.uri,
        lastModified: hasModificationTime ? fileInfo.modificationTime * 1000 : undefined,
        isCloudFile: true,
        metadata,
      };
    } catch (error) {
      const errorObj = error as Error;
      console.error('FileImportService: Error opening file from URL:', errorObj);
      throw new Error(`Failed to open file from URL: ${errorObj.message || 'Unknown error'}`);
    }
  }

  /**
   * Check if device supports cloud storage access
   */
  public async checkCloudStorageSupport(): Promise<{
    iCloudAvailable: boolean;
    documentPickerAvailable: boolean;
    shareExtensionAvailable: boolean;
  }> {
    try {
      const documentPickerAvailable = Platform.OS === 'ios';
      const shareExtensionAvailable = await Sharing.isAvailableAsync();
      
      // Check for iCloud availability (basic check)
      const iCloudAvailable = Platform.OS === 'ios' && documentPickerAvailable;
      
      return {
        iCloudAvailable,
        documentPickerAvailable,
        shareExtensionAvailable,
      };
    } catch (error) {
      console.warn('Error checking cloud storage support:', error);
      return {
        iCloudAvailable: false,
        documentPickerAvailable: false,
        shareExtensionAvailable: false,
      };
    }
  }

  /**
   * Get iOS-specific guidance for file import
   */
  public getIOSGuidance(): {
    title: string;
    description: string;
    steps: string[];
    tips: string[];
  } {
    return {
      title: 'Import Your Carrier Data Files',
      description: 'iOS privacy settings prevent automatic call/SMS log access. Import carrier data files manually for analysis.',
      steps: [
        'Contact your carrier to request call detail records (CDR)',
        'Download files from carrier portal or email',
        'Use the file picker below to select CSV, PDF, or Excel files',
        'Files can be imported from iCloud Drive, Google Drive, Dropbox, or local storage',
        'Large files will be processed in the background',
      ],
      tips: [
        'CSV files typically process fastest and most accurately',
        'PDF files require text extraction and may take longer',
        'Ensure files contain call/SMS timestamps, numbers, and duration',
        'Multiple files can be selected and imported together',
        'Files are encrypted and processed securely on your device',
      ],
    };
  }

  /**
   * Get supported file types for iOS
   */
  public getSupportedFileTypes(): {
    type: string;
    extensions: string[];
    description: string;
    recommended: boolean;
  }[] {
    return [
      {
        type: 'CSV Files',
        extensions: ['.csv', '.txt'],
        description: 'Comma-separated values files from carrier portals',
        recommended: true,
      },
      {
        type: 'PDF Files',
        extensions: ['.pdf'],
        description: 'PDF call detail records and statements',
        recommended: false,
      },
      {
        type: 'Excel Files',
        extensions: ['.xls', '.xlsx'],
        description: 'Excel spreadsheets with call/SMS data',
        recommended: true,
      },
      {
        type: 'JSON Files',
        extensions: ['.json'],
        description: 'JSON format data exports',
        recommended: true,
      },
      {
        type: 'Archive Files',
        extensions: ['.zip', '.7z'],
        description: 'Compressed archives containing multiple files',
        recommended: false,
      },
    ];
  }
}

export const FileImportService = FileImportServiceClass.getInstance();