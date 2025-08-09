/**
 * Multi-Format Parser - Orchestrates parsing of PDF, CSV, and CDR files
 * 
 * This parser coordinates between TypeScript orchestration and Python workers
 * to handle various carrier file formats with AI-powered layout detection.
 * 
 * Performance targets:
 * - 100k rows in <5min
 * - 1M rows in <30min
 * - >95% layout classification accuracy
 * - >99% duplicate detection accuracy
 */
import { createReadStream, promises as fs } from 'fs';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import structlog from 'structlog';
import { BaseParser } from './BaseParser';
import { PdfParser } from './PdfParser';
import { ExcelParser } from './ExcelParser';
import { CsvParser } from './CsvParser';
import { mlClassificationService } from '../ml/MLClassificationService';
import { advancedFieldMapper } from '../ml/AdvancedFieldMapper';
import { jobTracker } from '../workers/JobTracker';
import {
  IngestionJob,
  FileFormat,
  CarrierType,
  ProcessingStep,
  JobStatus,
  LayoutClassification,
  ProcessingConfig,
  ParsingResult,
  ValidationResult,
  FieldMapping
} from '../types';

const pipelineAsync = promisify(pipeline);
const logger = structlog.getLogger('MultiFormatParser');

// Configuration schema
const ParsingConfigSchema = z.object({
  batchSize: z.number().min(1000).max(50000).default(10000),
  maxMemoryMB: z.number().min(512).max(8192).default(2048),
  enableParallelProcessing: z.boolean().default(true),
  workerThreads: z.number().min(1).max(16).default(4),
  timeout: z.number().min(30000).max(600000).default(300000), // 5 minutes default
  retryAttempts: z.number().min(0).max(5).default(3),
  enableDeduplication: z.boolean().default(true),
  confidenceThreshold: z.number().min(0.1).max(1.0).default(0.8),
  enableOCR: z.boolean().default(true),
  preserveOriginalData: z.boolean().default(true)
});

type ParsingConfig = z.infer<typeof ParsingConfigSchema>;

interface ParsedChunk {
  data: any[];
  metadata: {
    chunkIndex: number;
    totalRows: number;
    processingTime: number;
    memoryUsage: number;
  };
}

interface ParsingMetrics {
  totalRows: number;
  processedRows: number;
  skippedRows: number;
  errorRows: number;
  duplicateRows: number;
  processingTime: number;
  peakMemoryUsage: number;
  throughputRowsPerSecond: number;
  accuracy: number;
}

/**
 * Multi-Format Parser - Handles PDF, CSV, CDR files with AI classification
 */
export class MultiFormatParser extends BaseParser {
  private readonly config: ParsingConfig;
  private readonly tempDir: string;
  private readonly redisClient: any; // Redis client for worker communication
  private readonly pdfParser: PdfParser;
  private readonly excelParser: ExcelParser;
  private readonly csvParser: CsvParser;
  
  constructor(config: Partial<ParsingConfig> = {}) {
    super();
    this.config = ParsingConfigSchema.parse(config);
    this.tempDir = path.join(process.cwd(), 'temp');
    this.pdfParser = new PdfParser();
    this.excelParser = new ExcelParser();
    this.csvParser = new CsvParser();
    this.ensureTempDir();
  }
  
  /**
   * Main parsing entry point - orchestrates the entire parsing workflow
   */
  async parseFile(job: IngestionJob): Promise<ParsingResult> {
    const startTime = Date.now();
    const metrics: ParsingMetrics = {
      totalRows: 0,
      processedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      duplicateRows: 0,
      processingTime: 0,
      peakMemoryUsage: 0,
      throughputRowsPerSecond: 0,
      accuracy: 0
    };
    
    try {
      logger.info('Starting multi-format parsing', {
        jobId: job.id,
        filename: job.filename,
        fileSize: job.fileSize
      });
      
      // Update job status
      await jobTracker.updateJob(job.id, {
        status: 'processing',
        currentStep: ProcessingStep.LAYOUT_DETECTION,
        progress: 0.1
      });
      
      // Step 1: File preparation and validation
      const fileInfo = await this.prepareFile(job);
      
      // Step 2: AI-powered layout classification
      const classification = await this.classifyLayout(job, fileInfo);
      
      await jobTracker.updateJob(job.id, {
        currentStep: ProcessingStep.PARSING,
        progress: 0.2
      });
      
      // Step 3: Format-specific parsing
      const parseResults = await this.parseByFormat(job, classification, metrics);
      
      await jobTracker.updateJob(job.id, {
        currentStep: ProcessingStep.VALIDATION,
        progress: 0.7
      });
      
      // Step 4: Data validation and normalization
      const validationResult = await this.validateAndNormalize(parseResults, job);
      
      await jobTracker.updateJob(job.id, {
        currentStep: ProcessingStep.DEDUPLICATION,
        progress: 0.8
      });
      
      // Step 5: Deduplication
      const deduplicationResult = await this.performDeduplication(validationResult, job);
      
      await jobTracker.updateJob(job.id, {
        currentStep: ProcessingStep.STORAGE,
        progress: 0.9
      });
      
      // Step 6: Store results
      await this.storeResults(deduplicationResult, job);
      
      // Final metrics calculation
      metrics.processingTime = Date.now() - startTime;
      metrics.throughputRowsPerSecond = metrics.processedRows / (metrics.processingTime / 1000);
      metrics.accuracy = classification.confidence.overall;
      
      await jobTracker.updateJob(job.id, {
        status: 'completed',
        currentStep: ProcessingStep.COMPLETED,
        progress: 1.0,
        metrics: {
          processingTime: metrics.processingTime,
          rowsProcessed: metrics.processedRows,
          accuracy: metrics.accuracy,
          throughput: metrics.throughputRowsPerSecond
        }
      });
      
      logger.info('Multi-format parsing completed', {
        jobId: job.id,
        ...metrics
      });
      
      return {
        success: true,
        data: deduplicationResult.data,
        metrics,
        classification,
        validationResult: deduplicationResult.validationSummary
      };
      
    } catch (error) {
      logger.error('Multi-format parsing failed', {
        jobId: job.id,
        error: error.message,
        stack: error.stack
      });
      
      await jobTracker.updateJob(job.id, {
        status: 'failed',
        error: {
          code: 'PARSING_FAILED',
          message: error.message,
          details: { metrics }
        }
      });
      
      throw error;
    } finally {
      // Cleanup temp files
      await this.cleanup(job.id);
    }
  }
  
  /**
   * Prepare file for processing (extract, validate, create temp files)
   */
  private async prepareFile(job: IngestionJob): Promise<{
    filePath: string;
    mimeType: string;
    encoding: string;
    preview: string;
  }> {
    try {
      // Create temporary file path
      const tempFilePath = path.join(this.tempDir, `${job.id}_${job.filename}`);
      
      // Copy file to temp directory for processing
      if (job.filePath) {
        await fs.copyFile(job.filePath, tempFilePath);
      } else if (job.fileContent) {
        await fs.writeFile(tempFilePath, job.fileContent);
      } else {
        throw new Error('No file content provided');
      }
      
      // Detect file properties
      const stats = await fs.stat(tempFilePath);
      const preview = await this.createFilePreview(tempFilePath);
      
      // Detect encoding for text files
      const encoding = await this.detectEncoding(tempFilePath);
      
      logger.info('File prepared for processing', {
        jobId: job.id,
        tempFilePath,
        fileSize: stats.size,
        encoding
      });
      
      return {
        filePath: tempFilePath,
        mimeType: job.mimeType || 'application/octet-stream',
        encoding,
        preview
      };
      
    } catch (error) {
      logger.error('File preparation failed', {
        jobId: job.id,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * AI-powered layout classification
   */
  private async classifyLayout(job: IngestionJob, fileInfo: any): Promise<LayoutClassification> {
    try {
      // Read file content for classification
      const fileContent = await fs.readFile(fileInfo.filePath, 'utf-8');
      
      const classification = await mlClassificationService.classifyFileLayout({
        jobId: job.id,
        filename: job.filename,
        fileContent: fileContent.substring(0, 50000), // First 50KB for analysis
        fileSize: job.fileSize,
        mimeType: fileInfo.mimeType
      });
      
      logger.info('Layout classification completed', {
        jobId: job.id,
        format: classification.format,
        carrier: classification.carrier,
        confidence: classification.confidence.overall
      });
      
      return classification;
      
    } catch (error) {
      logger.error('Layout classification failed', {
        jobId: job.id,
        error: error.message
      });
      
      // Fallback to rule-based detection
      return this.fallbackClassification(job, fileInfo);
    }
  }
  
  /**
   * Format-specific parsing using Python workers
   */
  private async parseByFormat(
    job: IngestionJob, 
    classification: LayoutClassification,
    metrics: ParsingMetrics
  ): Promise<ParsedChunk[]> {
    const format = classification.format;
    const chunks: ParsedChunk[] = [];
    
    try {
      switch (format) {
        case 'pdf':
          return await this.parsePDF(job, classification, metrics);
          
        case 'csv':
          return await this.parseCSV(job, classification, metrics);
          
        case 'xlsx':
        case 'xls':
          return await this.parseExcel(job, classification, metrics);
          
        case 'txt':
          return await this.parseCDR(job, classification, metrics);
          
        case 'json':
          return await this.parseJSON(job, classification, metrics);
          
        default:
          throw new Error(`Unsupported file format: ${format}`);
      }
      
    } catch (error) {
      logger.error('Format-specific parsing failed', {
        jobId: job.id,
        format,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * PDF parsing with OCR fallback
   */
  private async parsePDF(
    job: IngestionJob,
    classification: LayoutClassification,
    metrics: ParsingMetrics
  ): Promise<ParsedChunk[]> {
    const chunks: ParsedChunk[] = [];
    
    try {
      // Read file content
      const filePath = path.join(this.tempDir, `${job.id}_${job.filename}`);
      const fileContent = await fs.readFile(filePath);
      
      // Use the new PDF parser
      const result = await this.pdfParser.parse(fileContent, {
        useOCR: classification.confidence.overall < 0.7, // Use OCR if low confidence
        forceOCR: false,
        maxPages: 100,
        timeout: this.config.timeout
      });
      
      if (!result.success) {
        throw new Error('PDF parsing failed');
      }
      
      const data = result.data || [];
      metrics.totalRows = data.length;
      metrics.processedRows = result.metrics.processedRows;
      metrics.errorRows = result.metrics.errorRows;
      
      // Process results in chunks
      for (let i = 0; i < data.length; i += this.config.batchSize) {
        const chunkData = data.slice(i, i + this.config.batchSize);
        chunks.push({
          data: chunkData,
          metadata: {
            chunkIndex: Math.floor(i / this.config.batchSize),
            totalRows: chunkData.length,
            processingTime: result.metrics.processingTime,
            memoryUsage: result.metrics.peakMemoryUsage
          }
        });
      }
      
      return chunks;
      
    } catch (error) {
      logger.error('PDF parsing failed', {
        jobId: job.id,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * CSV parsing with dynamic delimiter detection
   */
  private async parseCSV(
    job: IngestionJob,
    classification: LayoutClassification,
    metrics: ParsingMetrics
  ): Promise<ParsedChunk[]> {
    const chunks: ParsedChunk[] = [];
    
    try {
      // Read file content
      const filePath = path.join(this.tempDir, `${job.id}_${job.filename}`);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      
      // Use the CSV parser
      const result = await this.csvParser.parse(fileContent, {
        batchSize: this.config.batchSize,
        enableValidation: true,
        skipEmptyRows: true
      });
      
      if (!result.success) {
        throw new Error('CSV parsing failed');
      }
      
      const data = result.data || [];
      metrics.totalRows = data.length;
      metrics.processedRows = result.metrics.processedRows;
      metrics.errorRows = result.metrics.errorRows;
      
      // Process results in chunks
      for (let i = 0; i < data.length; i += this.config.batchSize) {
        const chunkData = data.slice(i, i + this.config.batchSize);
        chunks.push({
          data: chunkData,
          metadata: {
            chunkIndex: Math.floor(i / this.config.batchSize),
            totalRows: chunkData.length,
            processingTime: result.metrics.processingTime,
            memoryUsage: result.metrics.peakMemoryUsage
          }
        });
      }
      
      return chunks;
      
    } catch (error) {
      logger.error('CSV parsing failed', {
        jobId: job.id,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Excel parsing for XLSX/XLS files
   */
  private async parseExcel(
    job: IngestionJob,
    classification: LayoutClassification,
    metrics: ParsingMetrics
  ): Promise<ParsedChunk[]> {
    const chunks: ParsedChunk[] = [];
    
    try {
      // Read file content
      const filePath = path.join(this.tempDir, `${job.id}_${job.filename}`);
      const fileContent = await fs.readFile(filePath);
      
      // Use the Excel parser
      const result = await this.excelParser.parse(fileContent, {
        maxRows: this.config.batchSize * 100, // Allow up to 100 batches worth
        skipEmptyRows: true,
        trimWhitespace: true,
        inferDataTypes: true,
        timeout: this.config.timeout
      });
      
      if (!result.success) {
        throw new Error('Excel parsing failed');
      }
      
      const data = result.data || [];
      metrics.totalRows = data.length;
      metrics.processedRows = result.metrics.processedRows;
      metrics.errorRows = result.metrics.errorRows;
      
      // Process results in chunks
      for (let i = 0; i < data.length; i += this.config.batchSize) {
        const chunkData = data.slice(i, i + this.config.batchSize);
        chunks.push({
          data: chunkData,
          metadata: {
            chunkIndex: Math.floor(i / this.config.batchSize),
            totalRows: chunkData.length,
            processingTime: result.metrics.processingTime,
            memoryUsage: result.metrics.peakMemoryUsage
          }
        });
      }
      
      return chunks;
      
    } catch (error) {
      logger.error('Excel parsing failed', {
        jobId: job.id,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * CDR text file parsing
   */
  private async parseCDR(
    job: IngestionJob,
    classification: LayoutClassification,
    metrics: ParsingMetrics
  ): Promise<ParsedChunk[]> {
    const chunks: ParsedChunk[] = [];
    
    try {
      const workerRequest = {
        jobId: job.id,
        filePath: path.join(this.tempDir, `${job.id}_${job.filename}`),
        carrier: classification.carrier,
        templateId: classification.templateId,
        fieldMappings: classification.fieldMappings,
        batchSize: this.config.batchSize
      };
      
      const result = await this.sendToWorker('cdr_parser', workerRequest);
      
      if (!result.success) {
        throw new Error(`CDR parsing failed: ${result.error}`);
      }
      
      const data = result.data || [];
      metrics.totalRows = data.length;
      
      for (let i = 0; i < data.length; i += this.config.batchSize) {
        const chunkData = data.slice(i, i + this.config.batchSize);
        chunks.push({
          data: chunkData,
          metadata: {
            chunkIndex: Math.floor(i / this.config.batchSize),
            totalRows: chunkData.length,
            processingTime: result.processingTime || 0,
            memoryUsage: result.memoryUsage || 0
          }
        });
      }
      
      return chunks;
      
    } catch (error) {
      logger.error('CDR parsing failed', {
        jobId: job.id,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * JSON file parsing
   */
  private async parseJSON(
    job: IngestionJob,
    classification: LayoutClassification,
    metrics: ParsingMetrics
  ): Promise<ParsedChunk[]> {
    const chunks: ParsedChunk[] = [];
    
    try {
      const fileContent = await fs.readFile(
        path.join(this.tempDir, `${job.id}_${job.filename}`),
        'utf-8'
      );
      
      const jsonData = JSON.parse(fileContent);
      const data = Array.isArray(jsonData) ? jsonData : [jsonData];
      
      metrics.totalRows = data.length;
      
      for (let i = 0; i < data.length; i += this.config.batchSize) {
        const chunkData = data.slice(i, i + this.config.batchSize);
        chunks.push({
          data: chunkData,
          metadata: {
            chunkIndex: Math.floor(i / this.config.batchSize),
            totalRows: chunkData.length,
            processingTime: 0,
            memoryUsage: 0
          }
        });
      }
      
      return chunks;
      
    } catch (error) {
      logger.error('JSON parsing failed', {
        jobId: job.id,
        error: error.message
      });
      throw error;
    }
  }
  
  // Helper methods
  
  private async sendToWorker(workerType: string, request: any): Promise<any> {
    // Implementation would use Redis to communicate with Python workers
    // This is a placeholder for the actual Redis-based worker communication
    return new Promise((resolve) => {
      // Simulate worker processing
      setTimeout(() => {
        resolve({
          success: true,
          data: [],
          processingTime: 1000,
          memoryUsage: 100
        });
      }, 1000);
    });
  }
  
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
  
  private async createFilePreview(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.substring(0, 1000); // First 1KB as preview
    } catch (error) {
      return '';
    }
  }
  
  private async detectEncoding(filePath: string): Promise<string> {
    // Simple encoding detection - could use a library like chardet
    return 'utf-8';
  }
  
  private async fallbackClassification(job: IngestionJob, fileInfo: any): Promise<LayoutClassification> {
    // Rule-based fallback classification
    const extension = path.extname(job.filename).toLowerCase();
    let format: FileFormat = 'unknown';
    
    switch (extension) {
      case '.pdf':
        format = 'pdf';
        break;
      case '.csv':
        format = 'csv';
        break;
      case '.txt':
        format = 'txt';
        break;
      case '.json':
        format = 'json';
        break;
    }
    
    return {
      jobId: job.id,
      format,
      carrier: 'unknown',
      confidence: {
        format: 0.6,
        carrier: 0.1,
        overall: 0.3
      },
      fieldMappings: {},
      detectedAt: new Date(),
      fallbackRequired: true,
      processingMetrics: {
        processingTime: 0,
        memoryUsage: 0,
        accuracy: 0.3
      }
    };
  }
  
  private async validateAndNormalize(chunks: ParsedChunk[], job: IngestionJob): Promise<ValidationResult> {
    // Implementation would validate and normalize the parsed data
    // This is a placeholder for the actual validation logic
    return {
      success: true,
      data: chunks.flatMap(chunk => chunk.data),
      validationSummary: {
        totalRows: chunks.reduce((sum, chunk) => sum + chunk.data.length, 0),
        validRows: chunks.reduce((sum, chunk) => sum + chunk.data.length, 0),
        invalidRows: 0,
        errors: []
      }
    };
  }
  
  private async performDeduplication(validationResult: ValidationResult, job: IngestionJob): Promise<ValidationResult> {
    // Implementation would perform deduplication
    // This is a placeholder for the actual deduplication logic
    return validationResult;
  }
  
  private async storeResults(result: ValidationResult, job: IngestionJob): Promise<void> {
    // Implementation would store the parsed data
    logger.info('Results stored', {
      jobId: job.id,
      rowCount: result.data.length
    });
  }
  
  private async cleanup(jobId: string): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      const jobFiles = files.filter(file => file.startsWith(jobId));
      
      for (const file of jobFiles) {
        await fs.unlink(path.join(this.tempDir, file));
      }
      
      logger.info('Cleanup completed', { jobId, filesRemoved: jobFiles.length });
    } catch (error) {
      logger.warn('Cleanup failed', { jobId, error: error.message });
    }
  }
}

// Export singleton instance
export const multiFormatParser = new MultiFormatParser();