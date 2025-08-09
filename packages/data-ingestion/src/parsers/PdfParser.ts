/**
 * PDF Parser with OCR Fallback
 * Handles PDF text extraction with multiple fallback strategies
 */

import { BaseParser } from './BaseParser';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { promisify } from 'util';
import structlog from 'structlog';
import { z } from 'zod';
import {
  ParsingResult,
  LayoutClassificationNew,
  ValidationResultNew,
  FileFormat,
  CarrierType,
  ProcessingStep
} from '../types';

const logger = structlog.getLogger('PdfParser');

// Validation schemas
const PdfParsingOptionsSchema = z.object({
  useOCR: z.boolean().default(false),
  forceOCR: z.boolean().default(false),
  ocrLanguage: z.string().default('eng'),
  extractImages: z.boolean().default(true),
  timeout: z.number().default(300000), // 5 minutes
  maxPages: z.number().default(100),
  quality: z.enum(['fast', 'balanced', 'high']).default('balanced')
});

type PdfParsingOptions = z.infer<typeof PdfParsingOptionsSchema>;

interface PdfExtractionResult {
  text: string;
  pageCount: number;
  method: 'pdfplumber' | 'pypdf2' | 'ocr';
  confidence: number;
  metadata: {
    hasText: boolean;
    isScanned: boolean;
    quality: string;
    processingTime: number;
  };
}

interface TableExtractionResult {
  tables: Array<{
    page: number;
    data: string[][];
    confidence: number;
  }>;
  totalTables: number;
  bestTable?: {
    page: number;
    data: string[][];
    confidence: number;
  };
}

/**
 * PDF Parser with intelligent text extraction and OCR fallback
 */
export class PdfParser extends BaseParser {
  private readonly pythonScriptPath: string;
  private readonly tempDir: string;
  
  constructor() {
    super();
    this.pythonScriptPath = path.join(__dirname, '../ml/PdfProcessor.py');
    this.tempDir = '/tmp/pdf_processing';
    this.initializeTempDirectory();
  }
  
  private async initializeTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', { error: error.message });
    }
  }
  
  /**
   * Parse PDF file and extract structured data
   */
  async parse(
    fileContent: Buffer | string,
    options: Partial<PdfParsingOptions> = {}
  ): Promise<ParsingResult> {
    const startTime = Date.now();
    const validatedOptions = PdfParsingOptionsSchema.parse(options);
    
    try {
      logger.info('Starting PDF parsing', {
        fileSize: typeof fileContent === 'string' ? fileContent.length : fileContent.length,
        options: validatedOptions
      });
      
      // Step 1: Extract text from PDF
      const extractionResult = await this.extractTextFromPdf(fileContent, validatedOptions);
      
      // Step 2: Get ML classification
      const classification = await this.classifyContent(extractionResult.text, 'document.pdf');
      
      // Step 3: Extract tables if detected
      const tableResult = await this.extractTables(fileContent, validatedOptions);
      
      // Step 4: Parse structured data based on classification
      const structuredData = await this.parseStructuredData(
        extractionResult,
        tableResult,
        classification
      );
      
      // Step 5: Validate results
      const validation = await this.validateExtractedData(structuredData, classification);
      
      const processingTime = Date.now() - startTime;
      
      const result: ParsingResult = {
        success: validation.success,
        data: validation.data,
        metrics: {
          totalRows: validation.validationSummary.totalRows,
          processedRows: validation.validationSummary.validRows,
          skippedRows: validation.validationSummary.totalRows - validation.validationSummary.validRows,
          errorRows: validation.validationSummary.invalidRows,
          duplicateRows: 0, // TODO: Implement duplicate detection
          processingTime,
          peakMemoryUsage: 0, // TODO: Track memory usage
          throughputRowsPerSecond: validation.validationSummary.totalRows / (processingTime / 1000),
          accuracy: classification.confidence.overall
        },
        classification: {
          ...classification,
          processingMetrics: {
            processingTime: extractionResult.metadata.processingTime,
            memoryUsage: 0,
            accuracy: extractionResult.confidence
          }
        },
        validationResult: validation
      };
      
      logger.info('PDF parsing completed', {
        success: result.success,
        totalRows: result.metrics.totalRows,
        method: extractionResult.method,
        processingTime
      });
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('PDF parsing failed', {
        error: error.message,
        processingTime,
        stack: error.stack
      });
      
      // Return error result
      const classification: LayoutClassificationNew = {
        jobId: `pdf-${Date.now()}`,
        format: FileFormat.PDF,
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
          success: false,
          data: [],
          validationSummary: {
            totalRows: 0,
            validRows: 0,
            invalidRows: 0,
            errors: [error.message]
          }
        }
      };
    }
  }
  
  /**
   * Extract text from PDF using multiple strategies
   */
  private async extractTextFromPdf(
    fileContent: Buffer | string,
    options: PdfParsingOptions
  ): Promise<PdfExtractionResult> {
    const startTime = Date.now();
    
    try {
      // Save content to temporary file
      const tempFilePath = path.join(this.tempDir, `temp_${Date.now()}.pdf`);
      const buffer = typeof fileContent === 'string' ? Buffer.from(fileContent) : fileContent;
      await fs.writeFile(tempFilePath, buffer);
      
      // Try different extraction methods in order of preference
      let result: PdfExtractionResult;
      
      if (options.forceOCR) {
        result = await this.extractWithOCR(tempFilePath, options);
      } else {
        // Try text-based extraction first
        try {
          result = await this.extractWithPdfLibrary(tempFilePath, options);
          
          // If text extraction yields poor results, fall back to OCR
          if (result.confidence < 0.5 || result.text.length < 100) {
            logger.info('Text extraction yielded poor results, trying OCR fallback');
            const ocrResult = await this.extractWithOCR(tempFilePath, options);
            if (ocrResult.confidence > result.confidence) {
              result = ocrResult;
            }
          }
        } catch (error) {
          logger.warn('Text extraction failed, falling back to OCR', { error: error.message });
          result = await this.extractWithOCR(tempFilePath, options);
        }
      }
      
      // Clean up temporary file
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp file', { error: cleanupError.message });
      }
      
      result.metadata.processingTime = Date.now() - startTime;
      return result;
      
    } catch (error) {
      logger.error('PDF text extraction failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Extract text using Python PDF libraries (pdfplumber, PyPDF2)
   */
  private async extractWithPdfLibrary(
    filePath: string,
    options: PdfParsingOptions
  ): Promise<PdfExtractionResult> {
    return new Promise((resolve, reject) => {
      const requestData = {
        action: 'extract_text',
        filePath,
        options: {
          maxPages: options.maxPages,
          quality: options.quality
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
          reject(new Error(`PDF extraction failed: ${stderr}`));
          return;
        }
        
        try {
          const response = JSON.parse(stdout.trim());
          
          if (!response.success) {
            reject(new Error(response.error || 'PDF extraction failed'));
            return;
          }
          
          resolve({
            text: response.text || '',
            pageCount: response.pageCount || 0,
            method: response.method || 'pdfplumber',
            confidence: response.confidence || 0.5,
            metadata: {
              hasText: response.hasText || false,
              isScanned: response.isScanned || false,
              quality: response.quality || 'unknown',
              processingTime: 0 // Will be set by caller
            }
          });
          
        } catch (parseError) {
          reject(new Error(`Failed to parse PDF extraction response: ${parseError.message}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        reject(new Error(`PDF extraction process error: ${error.message}`));
      });
    });
  }
  
  /**
   * Extract text using OCR (Tesseract)
   */
  private async extractWithOCR(
    filePath: string,
    options: PdfParsingOptions
  ): Promise<PdfExtractionResult> {
    return new Promise((resolve, reject) => {
      const requestData = {
        action: 'extract_ocr',
        filePath,
        options: {
          language: options.ocrLanguage,
          maxPages: options.maxPages,
          quality: options.quality
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
          reject(new Error(`OCR extraction failed: ${stderr}`));
          return;
        }
        
        try {
          const response = JSON.parse(stdout.trim());
          
          if (!response.success) {
            reject(new Error(response.error || 'OCR extraction failed'));
            return;
          }
          
          resolve({
            text: response.text || '',
            pageCount: response.pageCount || 0,
            method: 'ocr',
            confidence: response.confidence || 0.7,
            metadata: {
              hasText: false,
              isScanned: true,
              quality: response.quality || options.quality,
              processingTime: 0 // Will be set by caller
            }
          });
          
        } catch (parseError) {
          reject(new Error(`Failed to parse OCR response: ${parseError.message}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        reject(new Error(`OCR process error: ${error.message}`));
      });
    });
  }
  
  /**
   * Extract tables from PDF
   */
  private async extractTables(
    fileContent: Buffer | string,
    options: PdfParsingOptions
  ): Promise<TableExtractionResult> {
    try {
      const tempFilePath = path.join(this.tempDir, `temp_table_${Date.now()}.pdf`);
      const buffer = typeof fileContent === 'string' ? Buffer.from(fileContent) : fileContent;
      await fs.writeFile(tempFilePath, buffer);
      
      const result = await new Promise<TableExtractionResult>((resolve, reject) => {
        const requestData = {
          action: 'extract_tables',
          filePath: tempFilePath,
          options: {
            maxPages: options.maxPages
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
            logger.warn('Table extraction failed', { stderr });
            resolve({ tables: [], totalTables: 0 });
            return;
          }
          
          try {
            const response = JSON.parse(stdout.trim());
            resolve(response.tables || { tables: [], totalTables: 0 });
          } catch (parseError) {
            logger.warn('Failed to parse table extraction response', { error: parseError.message });
            resolve({ tables: [], totalTables: 0 });
          }
        });
        
        pythonProcess.on('error', (error) => {
          logger.warn('Table extraction process error', { error: error.message });
          resolve({ tables: [], totalTables: 0 });
        });
      });
      
      // Clean up
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      return result;
      
    } catch (error) {
      logger.warn('Table extraction failed', { error: error.message });
      return { tables: [], totalTables: 0 };
    }
  }
  
  /**
   * Parse structured data based on classification results
   */
  private async parseStructuredData(
    extraction: PdfExtractionResult,
    tables: TableExtractionResult,
    classification: LayoutClassificationNew
  ): Promise<any[]> {
    try {
      // If we have tables, use the best table
      if (tables.bestTable && tables.bestTable.confidence > 0.7) {
        return this.parseTableData(tables.bestTable.data, classification);
      }
      
      // Otherwise, parse text content
      return this.parseTextContent(extraction.text, classification);
      
    } catch (error) {
      logger.error('Structured data parsing failed', { error: error.message });
      return [];
    }
  }
  
  /**
   * Parse table data into structured records
   */
  private parseTableData(tableData: string[][], classification: LayoutClassificationNew): any[] {
    if (!tableData || tableData.length === 0) {
      return [];
    }
    
    try {
      // Assume first row is headers
      const headers = tableData[0].map(h => h.trim().toLowerCase());
      const dataRows = tableData.slice(1);
      
      const records = dataRows.map((row, index) => {
        const record: any = { _row: index + 1 };
        
        headers.forEach((header, colIndex) => {
          const value = row[colIndex]?.trim() || '';
          
          // Apply field mappings if available
          const mappedField = classification.fieldMappings[header] || header;
          record[mappedField] = this.parseValue(value, mappedField);
        });
        
        return record;
      });
      
      return records.filter(record => this.hasValidData(record));
      
    } catch (error) {
      logger.error('Table data parsing failed', { error: error.message });
      return [];
    }
  }
  
  /**
   * Parse text content into structured records
   */
  private parseTextContent(text: string, classification: LayoutClassificationNew): any[] {
    try {
      // Split into lines and look for patterns
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      // Try to identify header and data rows
      const records: any[] = [];
      let headerLine: string[] = [];
      let isInDataSection = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Look for table-like structure
        if (this.looksLikeHeader(line)) {
          headerLine = this.parseHeaderLine(line);
          isInDataSection = true;
          continue;
        }
        
        if (isInDataSection && this.looksLikeDataRow(line, headerLine.length)) {
          const rowData = this.parseDataLine(line, headerLine.length);
          if (rowData.length === headerLine.length) {
            const record: any = { _row: records.length + 1 };
            
            headerLine.forEach((header, index) => {
              const mappedField = classification.fieldMappings[header.toLowerCase()] || header;
              record[mappedField] = this.parseValue(rowData[index], mappedField);
            });
            
            if (this.hasValidData(record)) {
              records.push(record);
            }
          }
        }
      }
      
      return records;
      
    } catch (error) {
      logger.error('Text content parsing failed', { error: error.message });
      return [];
    }
  }
  
  // Helper methods for text parsing
  
  private looksLikeHeader(line: string): boolean {
    const headerKeywords = ['phone', 'number', 'date', 'time', 'duration', 'type', 'name', 'contact'];
    const words = line.toLowerCase().split(/[\s,|]+/);
    const keywordMatches = words.filter(word => headerKeywords.some(keyword => word.includes(keyword)));
    return keywordMatches.length >= 2;
  }
  
  private parseHeaderLine(line: string): string[] {
    // Try different delimiters
    const delimiters = ['\t', '|', ',', ' '];
    
    for (const delimiter of delimiters) {
      const parts = line.split(delimiter).map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length >= 3) {
        return parts;
      }
    }
    
    return line.split(/\s+/).filter(p => p.length > 0);
  }
  
  private looksLikeDataRow(line: string, expectedColumns: number): boolean {
    // Should contain numeric data, dates, or phone numbers
    const hasNumbers = /\d/.test(line);
    const hasDelimiters = /[,|\t]/.test(line);
    const partCount = line.split(/[\s,|\t]+/).length;
    
    return hasNumbers && (hasDelimiters || partCount >= Math.max(2, expectedColumns - 1));
  }
  
  private parseDataLine(line: string, expectedColumns: number): string[] {
    const delimiters = ['\t', '|', ','];
    
    for (const delimiter of delimiters) {
      const parts = line.split(delimiter).map(p => p.trim());
      if (parts.length >= expectedColumns - 1) {
        return parts;
      }
    }
    
    // Fallback to space-separated
    return line.split(/\s+/).filter(p => p.length > 0);
  }
  
  private parseValue(value: string, fieldName: string): any {
    if (!value || value.trim() === '') {
      return null;
    }
    
    const trimmed = value.trim();
    
    // Phone number parsing
    if (fieldName.includes('phone') || fieldName.includes('number')) {
      return this.normalizePhoneNumber(trimmed);
    }
    
    // Date/time parsing
    if (fieldName.includes('date') || fieldName.includes('time')) {
      return this.parseDateTime(trimmed);
    }
    
    // Duration parsing
    if (fieldName.includes('duration')) {
      return this.parseDuration(trimmed);
    }
    
    // Number parsing
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    
    return trimmed;
  }
  
  private hasValidData(record: any): boolean {
    const dataFields = Object.keys(record).filter(key => !key.startsWith('_'));
    const nonEmptyFields = dataFields.filter(key => record[key] != null && record[key] !== '');
    return nonEmptyFields.length >= 2; // At least 2 fields with data
  }
  
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Format as standard US number if 10 or 11 digits
    if (digits.length === 10) {
      return `(${digits.substr(0, 3)}) ${digits.substr(3, 3)}-${digits.substr(6, 4)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.substr(1, 3)}) ${digits.substr(4, 3)}-${digits.substr(7, 4)}`;
    }
    
    return phone; // Return original if not standard format
  }
  
  private parseDateTime(dateTimeStr: string): string | null {
    try {
      // Try parsing various date/time formats
      const date = new Date(dateTimeStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (error) {
      // Ignore parsing errors
    }
    
    return dateTimeStr; // Return original if parsing fails
  }
  
  private parseDuration(durationStr: string): number | string {
    // Try to parse duration in seconds
    const timePattern = /(\d+):(\d+)(?::(\d+))?/;
    const match = durationStr.match(timePattern);
    
    if (match) {
      const hours = parseInt(match[1], 10) || 0;
      const minutes = parseInt(match[2], 10) || 0;
      const seconds = parseInt(match[3], 10) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    
    return durationStr; // Return original if not parseable
  }
  
  /**
   * Test if this parser can handle the given file
   */
  canParse(filename: string, mimeType?: string, content?: Buffer): boolean {
    const isPdfExtension = filename.toLowerCase().endsWith('.pdf');
    const isPdfMimeType = mimeType === 'application/pdf';
    
    // Check magic bytes if content is provided
    let isPdfContent = false;
    if (content && content.length > 4) {
      const header = content.slice(0, 4).toString();
      isPdfContent = header === '%PDF';
    }
    
    return isPdfExtension || isPdfMimeType || isPdfContent;
  }
}