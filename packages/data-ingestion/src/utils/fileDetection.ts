import mimeTypes from 'mime-types';
import { FileFormat, CarrierType } from '../types';

// File type detection utilities
export class FileDetectionService {
  /**
   * Detect file format from filename and MIME type
   */
  static detectFileFormat(filename: string, mimetype?: string): FileFormat {
    const extension = filename.toLowerCase().split('.').pop();
    
    // Check MIME type first for accuracy
    if (mimetype) {
      switch (mimetype) {
        case 'application/pdf':
          return 'pdf';
        case 'text/csv':
        case 'application/csv':
          return 'csv';
        case 'application/vnd.ms-excel':
          return 'xls';
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          return 'xlsx';
        case 'application/json':
          return 'json';
        case 'text/plain':
          return 'txt';
      }
    }
    
    // Fallback to file extension
    switch (extension) {
      case 'pdf':
        return 'pdf';
      case 'csv':
        return 'csv';
      case 'xls':
        return 'xls';
      case 'xlsx':
        return 'xlsx';
      case 'json':
        return 'json';
      case 'txt':
        return 'txt';
      default:
        throw new Error(`Unsupported file format: ${extension || 'unknown'}`);
    }
  }

  /**
   * Validate file type against supported formats
   */
  static validateFileType(filename: string, mimetype: string): boolean {
    try {
      this.detectFileFormat(filename, mimetype);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get expected MIME type from filename
   */
  static getExpectedMimeType(filename: string): string | null {
    return mimeTypes.lookup(filename) || null;
  }

  /**
   * Detect potential carrier from filename patterns
   */
  static detectCarrierFromFilename(filename: string): CarrierType {
    const lowercaseFilename = filename.toLowerCase();
    
    // AT&T patterns
    if (
      lowercaseFilename.includes('att') ||
      lowercaseFilename.includes('at&t') ||
      lowercaseFilename.includes('cingular') ||
      lowercaseFilename.includes('wireless_bill')
    ) {
      return 'att';
    }
    
    // Verizon patterns
    if (
      lowercaseFilename.includes('verizon') ||
      lowercaseFilename.includes('vzw') ||
      lowercaseFilename.includes('verizonwireless')
    ) {
      return 'verizon';
    }
    
    // T-Mobile patterns
    if (
      lowercaseFilename.includes('tmobile') ||
      lowercaseFilename.includes('t-mobile') ||
      lowercaseFilename.includes('tmo')
    ) {
      return 'tmobile';
    }
    
    // Sprint patterns (now part of T-Mobile)
    if (
      lowercaseFilename.includes('sprint') ||
      lowercaseFilename.includes('nextel')
    ) {
      return 'sprint';
    }
    
    return 'unknown';
  }

  /**
   * Validate file size against limits
   */
  static validateFileSize(fileSize: number, maxSizeMB: number = 100): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return fileSize <= maxSizeBytes;
  }

  /**
   * Get human-readable file size
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate file hash for deduplication
   */
  static generateFileHash(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Check if file appears to be encrypted or password protected
   */
  static async isFileEncrypted(buffer: Buffer, format: FileFormat): Promise<boolean> {
    switch (format) {
      case 'pdf':
        // Check for PDF encryption markers
        const pdfHeader = buffer.toString('ascii', 0, 1024);
        return pdfHeader.includes('/Encrypt') || pdfHeader.includes('/Filter');
      
      case 'xlsx':
      case 'xls':
        // Excel files use ZIP structure, check for encryption
        try {
          const header = buffer.toString('hex', 0, 8);
          // Encrypted Excel files have different magic numbers
          return !header.startsWith('504b0304'); // Not a standard ZIP header
        } catch {
          return true;
        }
      
      default:
        return false;
    }
  }

  /**
   * Estimate processing time based on file size and format
   */
  static estimateProcessingTime(fileSize: number, format: FileFormat): number {
    // Base processing rates (rows per second) by format
    const baseRates = {
      csv: 5000,    // Fast - structured data
      json: 3000,   // Medium - needs parsing
      xlsx: 2000,   // Slower - complex format
      xls: 1500,    // Slowest - legacy format
      pdf: 500,     // Very slow - needs OCR potentially
      txt: 4000,    // Fast - plain text
    };
    
    // Estimate rows based on file size (rough approximation)
    const avgBytesPerRow = {
      csv: 150,
      json: 300,
      xlsx: 200,
      xls: 180,
      pdf: 500,
      txt: 120,
    };
    
    const estimatedRows = Math.floor(fileSize / avgBytesPerRow[format]);
    const processingRate = baseRates[format];
    const estimatedSeconds = Math.ceil(estimatedRows / processingRate);
    
    // Add overhead for setup, validation, database writes (30% buffer)
    return Math.ceil(estimatedSeconds * 1.3);
  }

  /**
   * Get file metadata for tracking
   */
  static getFileMetadata(filename: string, buffer: Buffer, mimetype: string) {
    const format = this.detectFileFormat(filename, mimetype);
    const carrier = this.detectCarrierFromFilename(filename);
    const fileHash = this.generateFileHash(buffer);
    const estimatedProcessingTime = this.estimateProcessingTime(buffer.length, format);
    
    return {
      filename,
      size: buffer.length,
      format,
      carrier,
      mimetype,
      hash: fileHash,
      estimatedProcessingTime,
      humanReadableSize: this.formatFileSize(buffer.length),
      isValid: this.validateFileType(filename, mimetype),
      isSizeValid: this.validateFileSize(buffer.length),
    };
  }
}

// File validation rules
export const FILE_VALIDATION_RULES = {
  maxSizeMB: 100,
  supportedFormats: ['pdf', 'csv', 'xlsx', 'xls', 'json', 'txt'] as FileFormat[],
  supportedMimeTypes: [
    'application/pdf',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain',
  ],
} as const;

// Carrier-specific file patterns
export const CARRIER_PATTERNS = {
  att: {
    filenamePatterns: ['att', 'at&t', 'cingular', 'wireless_bill'],
    commonHeaders: ['Date/Time', 'Phone Number', 'Direction', 'Duration'],
    dateFormats: ['MM/DD/YYYY HH:mm:ss', 'MM-DD-YYYY HH:mm'],
  },
  verizon: {
    filenamePatterns: ['verizon', 'vzw', 'verizonwireless'],
    commonHeaders: ['Date', 'Number Called', 'Type', 'Minutes'],
    dateFormats: ['MM/DD/YY HH:mm', 'MM/DD/YYYY HH:mm:ss'],
  },
  tmobile: {
    filenamePatterns: ['tmobile', 't-mobile', 'tmo'],
    commonHeaders: ['Date & Time', 'Phone Number', 'Call Type', 'Duration'],
    dateFormats: ['DD/MM/YYYY HH:mm:ss', 'MM-DD-YYYY HH:mm'],
  },
  sprint: {
    filenamePatterns: ['sprint', 'nextel'],
    commonHeaders: ['Date/Time', 'Number', 'Activity', 'Minutes'],
    dateFormats: ['MM/DD/YYYY HH:mm:ss A', 'YYYY-MM-DD HH:mm:ss'],
  },
} as const;