/**
 * Excel Parser for XLSX/XLS Files
 * Handles Excel file processing with intelligent sheet detection and data extraction
 */

import { BaseParser } from './BaseParser';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import logger from '../utils/logger';
import { isError, getErrorMessage } from '../utils/errorUtils';
import {
  ParsingResult,
  LayoutClassificationNew,
  ValidationResultNew,
  FileFormat,
  CarrierType,
  ProcessingStep,
  ProcessingConfig,
  FieldMapping,
  ExtractionResult
} from '../types';

// logger is already imported above

// Validation schemas
const ExcelParsingOptionsSchema = z.object({
  sheetName: z.string().optional(),
  headerRow: z.number().min(0).default(0),
  maxRows: z.number().positive().default(100000),
  maxSheets: z.number().positive().default(10),
  skipEmptyRows: z.boolean().default(true),
  trimWhitespace: z.boolean().default(true),
  inferDataTypes: z.boolean().default(true),
  timeout: z.number().default(120000) // 2 minutes
});

type ExcelParsingOptions = z.infer<typeof ExcelParsingOptionsSchema>;

interface ExcelSheetInfo {
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
  hasHeaders: boolean;
  dataQuality: number; // 0-1 score
  sampleData: string[][];
}

interface ExcelExtractionResult {
  sheets: ExcelSheetInfo[];
  bestSheet: ExcelSheetInfo | null;
  data: any[];
  metadata: {
    totalSheets: number;
    totalRows: number;
    processingTime: number;
    fileFormat: 'xlsx' | 'xls';
  };
}

/**
 * Excel Parser with intelligent sheet detection and data extraction
 */
export class ExcelParser extends BaseParser {
  private readonly pythonScriptPath: string;
  private readonly tempDir: string;
  
  constructor(jobId: string, config: ProcessingConfig, fieldMappings: FieldMapping[] = []) {
    super(jobId, config, fieldMappings);
    this.pythonScriptPath = path.join(__dirname, '../ml/ExcelProcessor.py');
    this.tempDir = '/tmp/excel_processing';
    this.initializeTempDirectory();
  }

  /**
   * Implementation of abstract parseFile method from BaseParser
   */
  async parseFile(buffer: Buffer): Promise<ExtractionResult> {
    const parsingResult = await this.parse(buffer);
    
    // Convert ParsingResult to ExtractionResult  
    const events = parsingResult.data ? parsingResult.data.filter((item: any) => item.type === 'call' || item.type === 'sms') : [];
    const contacts = events.length > 0 ? this.extractContactsFromEvents(events) : [];
    
    return {
      events,
      contacts,
      metadata: {
        total_rows: parsingResult.metrics.totalRows,
        parsed_rows: parsingResult.metrics.processedRows,
        error_rows: parsingResult.metrics.errorRows,
        duplicate_rows: parsingResult.metrics.duplicateRows,
        processing_time_ms: parsingResult.metrics.processingTime,
      },
      errors: [],
      warnings: []
    };
  }
  
  private async initializeTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', { error: getErrorMessage(error) });
    }
  }
  
  /**
   * Parse Excel file and extract structured data
   */
  async parse(
    fileContent: Buffer | string,
    options: Partial<ExcelParsingOptions> = {}
  ): Promise<ParsingResult> {
    const startTime = Date.now();
    const validatedOptions = ExcelParsingOptionsSchema.parse(options);
    
    try {
      logger.info('Starting Excel parsing', {
        fileSize: typeof fileContent === 'string' ? fileContent.length : fileContent.length,
        options: validatedOptions
      });
      
      // Step 1: Extract data from Excel file
      const extractionResult = await this.extractExcelData(fileContent, validatedOptions);
      
      // Step 2: Get ML classification
      const classification = await this.classifyContent(
        this.convertDataToText(extractionResult.data),
        'document.xlsx'
      );
      
      // Step 3: Apply intelligent field mapping
      const mappedData = await this.applyFieldMapping(extractionResult.data, classification);
      
      // Step 4: Validate results
      const validation = await this.validateExtractedData(mappedData, classification);
      
      const processingTime = Date.now() - startTime;
      
      const result: ParsingResult = {
        success: validation.success,
        data: validation.data,
        metrics: {
          totalRows: extractionResult.metadata.totalRows,
          processedRows: validation.validationSummary.validRows,
          skippedRows: extractionResult.metadata.totalRows - validation.validationSummary.totalRows,
          errorRows: validation.validationSummary.invalidRows,
          duplicateRows: 0, // TODO: Implement duplicate detection
          processingTime,
          peakMemoryUsage: 0, // TODO: Track memory usage
          throughputRowsPerSecond: extractionResult.metadata.totalRows / (processingTime / 1000),
          accuracy: classification.confidence.overall
        },
        classification: {
          ...classification,
          processingMetrics: {
            processingTime: extractionResult.metadata.processingTime,
            memoryUsage: 0,
            accuracy: extractionResult.bestSheet?.dataQuality || 0
          }
        },
        validationResult: validation
      };
      
      logger.info('Excel parsing completed', {
        success: result.success,
        totalRows: result.metrics.totalRows,
        sheetsProcessed: extractionResult.metadata.totalSheets,
        processingTime
      });
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Excel parsing failed', {
        error: getErrorMessage(error),
        processingTime,
        stack: isError(error) ? error.stack : undefined
      });
      
      // Return error result
      const classification: LayoutClassificationNew = {
        jobId: `excel-${Date.now()}`,
        format: FileFormat.XLSX,
        carrier: CarrierType.UNKNOWN,
        confidence: { format: 1.0, carrier: 0.0, overall: 0.0 },
        fieldMappings: {},
        detectedAt: new Date(),
        fallbackRequired: true
      };
      
      return {
        success: false,
        data: [],
        metrics: {
          totalRows: 0,
          processedRows: 0,
          skippedRows: 0,
          errorRows: 0,
          duplicateRows: 0,
          processingTime,
          peakMemoryUsage: 0,
          throughputRowsPerSecond: 0,
          accuracy: 0
        },
        classification,
        validationResult: {
          validationSummary: {
            totalRows: 0,
            validRows: 0,
            invalidRows: 0,
            errors: [getErrorMessage(error)]
          }
        }
      };
    }
  }
  
  /**
   * Extract data from Excel file using Python processor
   */
  private async extractExcelData(
    fileContent: Buffer | string,
    options: ExcelParsingOptions
  ): Promise<ExcelExtractionResult> {
    const startTime = Date.now();
    
    try {
      // Save content to temporary file
      const tempFilePath = path.join(this.tempDir, `temp_${Date.now()}.xlsx`);
      const buffer = typeof fileContent === 'string' ? Buffer.from(fileContent, 'base64') : fileContent;
      await fs.writeFile(tempFilePath, buffer);
      
      // Determine file format
      const fileFormat = this.detectExcelFormat(buffer);
      
      // Call Python processor
      const result = await this.callPythonProcessor(tempFilePath, fileFormat, options);
      
      // Clean up temporary file
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp file', { error: getErrorMessage(cleanupError) });
      }
      
      result.metadata.processingTime = Date.now() - startTime;
      return result;
      
    } catch (error) {
      logger.error('Excel data extraction failed', { error: getErrorMessage(error) });
      throw error;
    }
  }
  
  /**
   * Call Python Excel processor
   */
  private async callPythonProcessor(
    filePath: string,
    fileFormat: 'xlsx' | 'xls',
    options: ExcelParsingOptions
  ): Promise<ExcelExtractionResult> {
    return new Promise((resolve, reject) => {
      const requestData = {
        action: 'extract_excel_data',
        filePath,
        fileFormat,
        options: {
          sheetName: options.sheetName,
          headerRow: options.headerRow,
          maxRows: options.maxRows,
          maxSheets: options.maxSheets,
          skipEmptyRows: options.skipEmptyRows,
          trimWhitespace: options.trimWhitespace,
          inferDataTypes: options.inferDataTypes
        }
      };
      
      let stdout = '';
      let stderr = '';
      
      const pythonProcess = spawn('python3', [this.pythonScriptPath, JSON.stringify(requestData)], {
        timeout: options.timeout
      });
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Excel processing failed: ${stderr}`));
          return;
        }
        
        try {
          const response = JSON.parse(stdout.trim());
          
          if (!response.success) {
            reject(new Error(response.error || 'Excel processing failed'));
            return;
          }
          
          resolve({
            sheets: response.sheets || [],
            bestSheet: response.bestSheet || null,
            data: response.data || [],
            metadata: {
              totalSheets: response.totalSheets || 0,
              totalRows: response.totalRows || 0,
              processingTime: 0, // Will be set by caller
              fileFormat: response.fileFormat || 'xlsx'
            }
          });
          
        } catch (parseError) {
          reject(new Error(`Failed to parse Excel processor response: ${getErrorMessage(parseError)}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        reject(new Error(`Excel processor error: ${getErrorMessage(error)}`));
      });
    });
  }
  
  /**
   * Detect Excel file format from content
   */
  private detectExcelFormat(buffer: Buffer): 'xlsx' | 'xls' {
    // Check magic bytes
    if (buffer.length < 8) {
      return 'xlsx'; // Default to newer format
    }
    
    // XLSX files are ZIP archives (PK signature)
    if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
      return 'xlsx';
    }
    
    // XLS files have different signatures
    // Microsoft Office Document (D0CF11E0A1B11AE1)
    if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
      return 'xls';
    }
    
    return 'xlsx'; // Default
  }
  
  /**
   * Apply field mapping to extracted data
   */
  private async applyFieldMapping(
    data: any[],
    classification: LayoutClassificationNew
  ): Promise<any[]> {
    if (!data || data.length === 0) {
      return [];
    }
    
    try {
      // Get field mappings from classification
      const fieldMappings = classification.fieldMappings || {};
      
      // Apply mappings to each record
      const mappedData = data.map((record, index) => {
        const mappedRecord: any = { _row: index + 1 };
        
        Object.keys(record).forEach(sourceField => {
          const mappedField = fieldMappings[sourceField.toLowerCase()] || sourceField;
          let value = record[sourceField];
          
          // Apply data type conversions
          value = this.convertDataType(value, mappedField);
          
          mappedRecord[mappedField] = value;
        });
        
        return mappedRecord;
      });
      
      return mappedData;
      
    } catch (error) {
      logger.error('Field mapping failed', { error: getErrorMessage(error) });
      return data; // Return original data if mapping fails
    }
  }
  
  /**
   * Convert data type based on field name
   */
  private convertDataType(value: any, fieldName: string): any {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    
    const fieldLower = fieldName.toLowerCase();
    
    // Phone number normalization
    if (fieldLower.includes('phone') || fieldLower.includes('number')) {
      return this.normalizePhoneNumber(String(value));
    }
    
    // Date/time conversion
    if (fieldLower.includes('date') || fieldLower.includes('time')) {
      return this.parseDateTime(value);
    }
    
    // Duration conversion
    if (fieldLower.includes('duration')) {
      return this.parseDuration(value);
    }
    
    // Numeric conversion
    if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) {
      return parseFloat(value);
    }
    
    return value;
  }

  /**
   * Classify content using ML service
   */
  private async classifyContent(text: string, filename: string): Promise<LayoutClassificationNew> {
    // This would integrate with the ML classification service
    // For now, return a basic classification
    return {
      jobId: this.jobId,
      format: FileFormat.XLSX,
      carrier: CarrierType.UNKNOWN,
      confidence: {
        format: 0.8,
        carrier: 0.2,
        overall: 0.5
      },
      fieldMappings: {},
      detectedAt: new Date(),
      processingMetrics: {
        processingTime: 100,
        memoryUsage: 50,
        accuracy: 0.5
      },
      fallbackRequired: true
    };
  }

  /**
   * Validate extracted data
   */
  private async validateExtractedData(data: any[], classification: LayoutClassificationNew): Promise<ValidationResultNew> {
    // Basic validation - in a real implementation, this would be more sophisticated
    const totalRows = data.length;
    const validRows = data.filter(row => row && Object.keys(row).length > 0).length;
    const invalidRows = totalRows - validRows;
    
    return {
      success: invalidRows === 0,
      data: data,
      validationSummary: {
        totalRows,
        validRows,
        invalidRows,
        errors: invalidRows > 0 ? [`${invalidRows} rows failed validation`] : []
      }
    };
  }
  
  /**
   * Convert data array to text for classification
   */
  private convertDataToText(data: any[]): string {
    if (!data || data.length === 0) {
      return '';
    }
    
    try {
      // Get headers from first record
      const headers = Object.keys(data[0]).filter(key => !key.startsWith('_'));
      const headerLine = headers.join(',');
      
      // Convert first few records to CSV-like text
      const sampleRows = data.slice(0, 10).map(record => {
        return headers.map(header => String(record[header] || '')).join(',');
      });
      
      return [headerLine, ...sampleRows].join('\n');
      
    } catch (error) {
      logger.error('Data to text conversion failed', { error: getErrorMessage(error) });
      return JSON.stringify(data.slice(0, 5)); // Fallback
    }
  }
  
  /**
   * Parse various date/time formats
   */
  private parseDateTime(value: any): string | null {
    if (!value) return null;
    
    try {
      // Handle Excel date serial numbers
      if (typeof value === 'number' && value > 25569) { // Excel epoch starts 1900-01-01
        const excelDate = new Date((value - 25569) * 86400 * 1000);
        return excelDate.toISOString();
      }
      
      // Handle string dates
      const date = new Date(String(value));
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
    } catch (error) {
      // Ignore parsing errors
    }
    
    return String(value); // Return original if parsing fails
  }
  
  /**
   * Parse duration values
   */
  private parseDuration(value: any): number | string {
    if (!value) return 0;
    
    const str = String(value);
    
    // Handle time format (HH:MM:SS or MM:SS)
    const timeMatch = str.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10) || 0;
      const minutes = parseInt(timeMatch[2], 10) || 0;
      const seconds = parseInt(timeMatch[3], 10) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    
    // Handle numeric values (assume seconds)
    if (typeof value === 'number') {
      return value;
    }
    
    // Handle Excel time serial values
    if (typeof value === 'number' && value < 1) {
      return Math.round(value * 86400); // Convert fraction of day to seconds
    }
    
    return str; // Return original if not parseable
  }
  
  /**
   * Normalize phone numbers
   */
  protected normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Format standard US numbers
    if (digits.length === 10) {
      return `(${digits.substr(0, 3)}) ${digits.substr(3, 3)}-${digits.substr(6, 4)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.substr(1, 3)}) ${digits.substr(4, 3)}-${digits.substr(7, 4)}`;
    }
    
    return phone; // Return original if not standard format
  }
  
  /**
   * Test if this parser can handle the given file
   */
  canParse(filename: string, mimeType?: string, content?: Buffer): boolean {
    const isExcelExtension = /\.(xlsx|xls)$/i.test(filename);
    const isExcelMimeType = mimeType && [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/excel'
    ].includes(mimeType);
    
    // Check magic bytes if content is provided
    let isExcelContent = false;
    if (content && content.length > 8) {
      // XLSX signature (ZIP archive)
      if (content[0] === 0x50 && content[1] === 0x4B) {
        isExcelContent = true;
      }
      // XLS signature (OLE document)
      else if (content[0] === 0xD0 && content[1] === 0xCF && content[2] === 0x11 && content[3] === 0xE0) {
        isExcelContent = true;
      }
    }
    
    return isExcelExtension || isExcelMimeType || isExcelContent;
  }
  
  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['.xlsx', '.xls'];
  }
  
  /**
   * Get supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    return [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/excel'
    ];
  }
}