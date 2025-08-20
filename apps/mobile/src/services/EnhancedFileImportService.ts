import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { CallLogCollector } from './android/CallLogCollector';
import { SmsLogCollector } from './android/SmsLogCollector';

export interface FileImportOptions {
  allowedTypes?: string[];
  allowMultipleSelection?: boolean;
  maxFileSize?: number; // in bytes
  userId: string;
  lineId: string;
}

export interface ImportedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uri: string;
  lastModified?: number;
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  format?: 'csv' | 'pdf' | 'excel' | 'json' | 'xml' | 'zip' | 'unknown';
  estimatedRows?: number;
  detectedDataType?: 'calls' | 'sms' | 'contacts' | 'mixed' | 'unknown';
}

export interface ProcessingProgress {
  fileId: string;
  fileName: string;
  phase: 'validating' | 'parsing' | 'processing' | 'normalizing' | 'storing' | 'completed' | 'failed';
  progress: number; // 0-100
  itemsProcessed: number;
  itemsTotal: number;
  message: string;
  error?: string;
}

export interface FileProcessingResult {
  success: boolean;
  fileId: string;
  fileName: string;
  eventsCreated: number;
  contactsCreated: number;
  duplicatesSkipped: number;
  errors: string[];
  warnings: string[];
  processingTime: number;
}

class EnhancedFileImportServiceClass {
  private static instance: EnhancedFileImportServiceClass;
  private progressListeners: Map<string, (_progress: ProcessingProgress) => void> = new Map();
  private activeProcessing: Map<string, boolean> = new Map();

  private constructor() {}

  public static getInstance(): EnhancedFileImportServiceClass {
    if (!EnhancedFileImportServiceClass.instance) {
      EnhancedFileImportServiceClass.instance = new EnhancedFileImportServiceClass();
    }
    return EnhancedFileImportServiceClass.instance;
  }

  /**
   * Pick and import files with full processing pipeline
   */
  public async importFiles(options: FileImportOptions): Promise<FileProcessingResult[]> {
    const results: FileProcessingResult[] = [];

    try {
      // Pick files
      const files = await this.pickFiles(options);
      
      if (files.length === 0) {
        return results;
      }

      // Process each file
      for (const file of files) {
        try {
          const result = await this.processFile(file, options);
          results.push(result);
        } catch (error) {
          console.error('Error processing file:', file.name, error);
          results.push({
            success: false,
            fileId: file.id,
            fileName: file.name,
            eventsCreated: 0,
            contactsCreated: 0,
            duplicatesSkipped: 0,
            errors: [error instanceof Error ? error.message : 'Unknown processing error'],
            warnings: [],
            processingTime: 0,
          });
        }
      }

      return results;
    } catch (error) {
      console.error('File import failed:', error);
      throw new Error(`File import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Open file picker to select data files
   */
  public async pickFiles(options?: Partial<FileImportOptions>): Promise<ImportedFile[]> {
    try {
      const defaultTypes = [
        'text/csv',
        'application/pdf',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/json',
        'text/xml',
        'application/xml',
        'application/zip',
        '*/*' // Allow all files for flexibility
      ];

      const result = await DocumentPicker.getDocumentAsync({
        type: options?.allowedTypes || defaultTypes,
        multiple: options?.allowMultipleSelection !== false, // Default to multiple
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return [];
      }

      const files: ImportedFile[] = [];
      const assets = result.assets || [];

      for (const asset of assets) {
        // Check file size if limit is specified
        const maxSize = options?.maxFileSize || 100 * 1024 * 1024; // 100MB default
        if (asset.size && asset.size > maxSize) {
          throw new Error(`File "${asset.name}" is too large. Maximum size is ${this.formatFileSize(maxSize)}`);
        }

        const importedFile: ImportedFile = {
          id: this.generateFileId(),
          name: asset.name,
          size: asset.size || 0,
          type: asset.mimeType || 'application/octet-stream',
          uri: asset.uri,
          lastModified: asset.lastModified,
        };

        files.push(importedFile);
      }

      return files;
    } catch (error) {
      console.error('Error picking files:', error);
      throw new Error(`Failed to select files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate and process a single file
   */
  public async processFile(file: ImportedFile, options: FileImportOptions): Promise<FileProcessingResult> {
    const startTime = Date.now();
    const fileId = file.id;

    if (this.activeProcessing.get(fileId)) {
      throw new Error('File is already being processed');
    }

    this.activeProcessing.set(fileId, true);

    const result: FileProcessingResult = {
      success: false,
      fileId,
      fileName: file.name,
      eventsCreated: 0,
      contactsCreated: 0,
      duplicatesSkipped: 0,
      errors: [],
      warnings: [],
      processingTime: 0,
    };

    try {
      // Step 1: Validate file
      this.notifyProgress({
        fileId,
        fileName: file.name,
        phase: 'validating',
        progress: 10,
        itemsProcessed: 0,
        itemsTotal: 0,
        message: 'Validating file...',
      });

      const validation = await this.validateFile(file);
      if (!validation.isValid) {
        result.errors.push(...validation.errors);
        throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
      }

      result.warnings.push(...validation.warnings);

      // Step 2: Parse file content
      this.notifyProgress({
        fileId,
        fileName: file.name,
        phase: 'parsing',
        progress: 30,
        itemsProcessed: 0,
        itemsTotal: validation.estimatedRows || 0,
        message: `Parsing ${validation.format} file...`,
      });

      const parsedData = await this.parseFile(file, validation);

      // Step 3: Process data based on type
      this.notifyProgress({
        fileId,
        fileName: file.name,
        phase: 'processing',
        progress: 60,
        itemsProcessed: 0,
        itemsTotal: parsedData.length,
        message: 'Processing data entries...',
      });

      const processedResult = await this.processData(parsedData, validation, options);
      
      result.eventsCreated = processedResult.eventsCreated;
      result.contactsCreated = processedResult.contactsCreated;
      result.duplicatesSkipped = processedResult.duplicatesSkipped;
      result.errors.push(...processedResult.errors);
      result.warnings.push(...processedResult.warnings);

      // Step 4: Complete
      this.notifyProgress({
        fileId,
        fileName: file.name,
        phase: 'completed',
        progress: 100,
        itemsProcessed: result.eventsCreated + result.contactsCreated,
        itemsTotal: result.eventsCreated + result.contactsCreated,
        message: `Import completed: ${result.eventsCreated} events, ${result.contactsCreated} contacts`,
      });

      result.success = true;
      result.processingTime = Date.now() - startTime;

      return result;
    } catch (error) {
      console.error('File processing error:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown processing error');
      result.processingTime = Date.now() - startTime;

      this.notifyProgress({
        fileId,
        fileName: file.name,
        phase: 'failed',
        progress: 100,
        itemsProcessed: 0,
        itemsTotal: 0,
        message: `Processing failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      });

      return result;
    } finally {
      this.activeProcessing.delete(fileId);
    }
  }

  /**
   * Validate file format and content
   */
  public async validateFile(file: ImportedFile): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
    };

    try {
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(file.uri);
      if (!fileInfo.exists) {
        result.errors.push('File does not exist or is not accessible');
        return result;
      }

      // Detect format
      result.format = this.detectFileFormat(file.name, file.type);

      // Basic validations
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
        case 'xml':
          await this.validateXmlFile(file, result);
          break;
        case 'json':
          await this.validateJsonFile(file, result);
          break;
        case 'pdf':
          result.warnings.push('PDF files require server-side processing for text extraction');
          break;
        case 'excel':
          result.warnings.push('Excel files will be processed with limited functionality');
          break;
        default:
          result.warnings.push('Unknown file format - will attempt automatic detection');
      }

      // Success if no errors
      result.isValid = result.errors.length === 0;
      return result;
    } catch (error) {
      console.error('File validation error:', error);
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Parse file content based on format
   */
  private async parseFile(file: ImportedFile, validation: FileValidationResult): Promise<Record<string, unknown>[]> {
    const content = await FileSystem.readAsStringAsync(file.uri);

    switch (validation.format) {
      case 'csv':
        return this.parseCsvContent(content);
      case 'xml':
        return this.parseXmlContent(content);
      case 'json':
        return this.parseJsonContent(content);
      default:
        // Try to auto-detect and parse
        try {
          // Try JSON first
          return JSON.parse(content);
        } catch {
          // Try CSV
          return this.parseCsvContent(content);
        }
    }
  }

  /**
   * Process parsed data into events and contacts
   */
  private async processData(
    data: Record<string, unknown>[],
    validation: FileValidationResult,
    _options: FileImportOptions
  ): Promise<{
    eventsCreated: number;
    contactsCreated: number;
    duplicatesSkipped: number;
    errors: string[];
    warnings: string[];
  }> {
    const result = {
      eventsCreated: 0,
      contactsCreated: 0,
      duplicatesSkipped: 0,
      errors: [] as string[],
      warnings: [] as string[],
    };

    try {
      // Determine data type if not already detected
      const dataType = validation.detectedDataType || this.detectDataType(data);

      switch (dataType) {
        case 'calls': {
          const callEntries = CallLogCollector.processImportedCallLog(data);
          result.eventsCreated = callEntries.length;
          break;
        }

        case 'sms': {
          const smsEntries = SmsLogCollector.processImportedSmsLog(data);
          result.eventsCreated = smsEntries.length;
          break;
        }

        case 'contacts':
          result.contactsCreated = data.length; // Simplified
          break;

        case 'mixed':
        default: {
          // Try to process as mixed data
          const calls = this.extractCallData(data);
          const sms = this.extractSmsData(data);
          const contacts = this.extractContactData(data);

          result.eventsCreated = calls.length + sms.length;
          result.contactsCreated = contacts.length;
          break;
        }
      }

      return result;
    } catch (error) {
      console.error('Data processing error:', error);
      result.errors.push(`Data processing failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Subscribe to processing progress
   */
  public onProgress(fileId: string, callback: (_progress: ProcessingProgress) => void): () => void {
    this.progressListeners.set(fileId, callback);
    
    return () => {
      this.progressListeners.delete(fileId);
    };
  }

  /**
   * Get import guidance for users
   */
  public getImportGuidance(): {
    supportedFormats: string[];
    platformInstructions: {
      android: string[];
      ios: string[];
    };
    fileExportSteps: {
      calls: string[];
      sms: string[];
      contacts: string[];
    };
  } {
    return {
      supportedFormats: [
        'CSV files from call/SMS exports',
        'XML files from SMS backup apps',
        'JSON files with structured data',
        'PDF call detail records (limited)',
        'Excel spreadsheets with call/SMS data',
      ],
      platformInstructions: {
        android: [
          '1. Install "SMS Backup & Restore" for SMS data',
          '2. Use Phone app settings to export call logs',
          '3. Download carrier data from provider website',
          '4. Export contacts from Contacts app',
          '5. Select and import files in PhoneLog AI',
        ],
        ios: [
          '1. Download call detail records from carrier',
          '2. Use third-party SMS export tools',
          '3. Export contacts from Contacts app',
          '4. Request data exports from carrier customer service',
          '5. Import downloaded files in PhoneLog AI',
        ],
      },
      fileExportSteps: {
        calls: [
          'Open your Phone/Dialer app',
          'Go to Call History or Recent Calls',
          'Look for Export, Share, or Menu options',
          'Choose CSV format if available',
          'Save to Files app or Google Drive',
        ],
        sms: [
          'Install "SMS Backup & Restore" app',
          'Grant necessary permissions',
          'Tap "Create Backup"',
          'Choose XML or CSV format',
          'Save backup file locally',
        ],
        contacts: [
          'Open Contacts app',
          'Go to Settings or Menu',
          'Choose "Export" or "Share"',
          'Select vCard (VCF) or CSV format',
          'Save to Files app',
        ],
      },
    };
  }

  // Private helper methods
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
    
    if (extension === 'csv' || mimeType.includes('csv')) return 'csv';
    if (extension === 'xml' || mimeType.includes('xml')) return 'xml';
    if (extension === 'json' || mimeType.includes('json')) return 'json';
    if (extension === 'pdf' || mimeType.includes('pdf')) return 'pdf';
    if (['xls', 'xlsx'].includes(extension) || mimeType.includes('excel')) return 'excel';
    if (extension === 'zip' || mimeType.includes('zip')) return 'zip';
    
    return 'unknown';
  }

  private detectDataType(data: Record<string, unknown>[]): 'calls' | 'sms' | 'contacts' | 'mixed' | 'unknown' {
    if (data.length === 0) return 'unknown';

    const sample = data[0];
    const keys = Object.keys(sample).map(k => k.toLowerCase());

    // Check for call data
    const hasCallFields = keys.some(k => 
      k.includes('call') || k.includes('duration') || k.includes('type') || k.includes('direction')
    );

    // Check for SMS data
    const hasSmsFields = keys.some(k => 
      k.includes('sms') || k.includes('message') || k.includes('body') || k.includes('text')
    );

    // Check for contact data
    const hasContactFields = keys.some(k => 
      k.includes('name') || k.includes('contact') || k.includes('email')
    );

    if (hasCallFields && hasSmsFields) return 'mixed';
    if (hasCallFields) return 'calls';
    if (hasSmsFields) return 'sms';
    if (hasContactFields) return 'contacts';

    return 'unknown';
  }

  private parseCsvContent(content: string): Record<string, unknown>[] {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length === headers.length) {
        const row: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        rows.push(row);
      }
    }

    return rows;
  }

  private parseXmlContent(content: string): Record<string, unknown>[] {
    // Simplified XML parsing for SMS backup format
    const matches = content.match(/<sms[^>]*>/g) || [];
    return matches.map(match => {
      const attrs: Record<string, unknown> = {};
      const attrPattern = /(\w+)="([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrPattern.exec(match)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }
      return attrs;
    });
  }

  private parseJsonContent(content: string): Record<string, unknown>[] {
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [data];
  }

  private extractCallData(data: Record<string, unknown>[]): Record<string, unknown>[] {
    return data.filter(item => {
      const keys = Object.keys(item).map(k => k.toLowerCase());
      return keys.some(k => k.includes('call') || k.includes('duration'));
    });
  }

  private extractSmsData(data: Record<string, unknown>[]): Record<string, unknown>[] {
    return data.filter(item => {
      const keys = Object.keys(item).map(k => k.toLowerCase());
      return keys.some(k => k.includes('sms') || k.includes('message') || k.includes('body'));
    });
  }

  private extractContactData(data: Record<string, unknown>[]): Record<string, unknown>[] {
    return data.filter(item => {
      const keys = Object.keys(item).map(k => k.toLowerCase());
      return keys.some(k => k.includes('contact') || k.includes('name')) && 
             !keys.some(k => k.includes('call') || k.includes('sms'));
    });
  }

  private async validateCsvFile(file: ImportedFile, result: FileValidationResult): Promise<void> {
    try {
      const content = await FileSystem.readAsStringAsync(file.uri, { length: 2048 });
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        result.errors.push('CSV file appears to be empty');
        return;
      }

      const firstLineColumns = lines[0].split(',').length;
      if (firstLineColumns < 2) {
        result.warnings.push('CSV file has very few columns');
      }

      const avgLineLength = content.length / lines.length;
      result.estimatedRows = Math.floor(file.size / avgLineLength);

      if (result.estimatedRows > 100000) {
        result.warnings.push(`Large file (~${result.estimatedRows.toLocaleString()} rows) - processing may take time`);
      }
    } catch (error) {
      result.errors.push(`CSV validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateXmlFile(file: ImportedFile, result: FileValidationResult): Promise<void> {
    try {
      const content = await FileSystem.readAsStringAsync(file.uri, { length: 1024 });
      if (!content.includes('<sms') && !content.includes('<call')) {
        result.warnings.push('XML file may not contain SMS or call data');
      }
    } catch (error) {
      result.errors.push(`XML validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateJsonFile(file: ImportedFile, result: FileValidationResult): Promise<void> {
    try {
      const content = await FileSystem.readAsStringAsync(file.uri);
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        result.estimatedRows = data.length;
      }
    } catch (error) {
      result.errors.push(`Invalid JSON file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private notifyProgress(progress: ProcessingProgress): void {
    const listener = this.progressListeners.get(progress.fileId);
    if (listener) {
      try {
        listener(progress);
      } catch (error) {
        console.error('Progress listener error:', error);
      }
    }
  }
}

// Additional types for useFileImport hook
export interface ImportProgress {
  fileName: string;
  totalFiles: number;
  currentFile: number;
  totalRows: number;
  processedRows: number;
  phase: string;
  estimatedTimeRemaining?: number;
}

export interface ImportResult {
  success: boolean;
  fileName: string;
  fileType: string;
  processedData?: Record<string, unknown>[];
  summary?: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicatesFound: number;
    dataTypes: string[];
    processingTimeMs: number;
  };
  errors?: string[];
  warnings?: string[];
}

export const EnhancedFileImportService = EnhancedFileImportServiceClass.getInstance();