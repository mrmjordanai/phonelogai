import { Event, Contact } from '@phonelogai/types';
import crypto from 'crypto';
import { 
  IngestionJobNew, 
  ProcessingStep, 
  ParsingResult,
  FieldMapping,
  ProcessingMetrics,
  IngestionError
} from '../types/index.js';

import { MultiFormatParser } from '../parsers/MultiFormatParser.js';
import { JobTracker } from './JobTracker.js';
import { ETLPipeline } from '../validation/ETLPipeline.js';

/**
 * ETL Orchestrator coordinates the complete data processing workflow
 * from file parsing through validation, normalization, and deduplication
 */
export class ETLOrchestrator {
  private multiFormatParser: MultiFormatParser;
  private jobTracker: JobTracker;
  private etlPipeline: ETLPipeline;

  constructor() {
    this.multiFormatParser = new MultiFormatParser();
    this.jobTracker = new JobTracker();
    this.etlPipeline = new ETLPipeline({
      batchSize: 1000,
      maxErrors: 100,
      deduplicationEnabled: true,
      gapDetectionEnabled: true,
      similarityThreshold: 0.85,
      conflictResolution: 'merge'
    });
  }

  /**
   * Process a complete ingestion job from file to final data
   */
  async processIngestionJob(
    jobConfig: {
      jobId: string;
      userId: string;
      filePath: string;
      filename: string;
      mimeType: string;
      fileSize: number;
      carrierType?: string;
      processingConfig?: {
        skipValidation?: boolean;
        deduplicationEnabled?: boolean;
        gapDetectionEnabled?: boolean;
        maxErrors?: number;
        timezone?: string;
      };
    }
  ): Promise<{
    success: boolean;
    result?: {
      events: Partial<Event>[];
      contacts: Partial<Contact>[];
      metrics: ProcessingMetrics & {
        validation: any;
        normalization: any;
        deduplication: any;
        gapAnalysis?: any;
      };
    };
    errors: IngestionError[];
    warnings: string[];
  }> {
    const { jobId, userId, filePath, filename, mimeType, fileSize, carrierType } = jobConfig;
    
    try {
      // Initialize job tracking
      await this.jobTracker.startJob(jobId);

      // Step 1: Parse file and extract raw data
      await this.updateProgress(jobId, 5, 'parsing', 'Parsing file');
      
      const parseResult = await this.multiFormatParser.parseFile(
        filePath,
        {
          userId,
          jobId,
          filename,
          expectedCarrier: carrierType as any,
          chunkSize: 1000
        }
      );

      if (!parseResult.success) {
        const errors = parseResult.validationResult.validationSummary.errors;
        const errorMessage = errors.length > 0 ? errors.join(', ') : 'Unknown parsing error';
        throw new Error(`File parsing failed: ${errorMessage}`);
      }

      await this.updateProgress(jobId, 20, 'parsing', 'File parsed successfully');

      // Step 2: Run ETL Pipeline
      await this.updateProgress(jobId, 25, 'validation', 'Starting data processing pipeline');

      // Update ETL pipeline config if provided
      if (jobConfig.processingConfig) {
        this.etlPipeline.updateConfig({
          skipValidation: jobConfig.processingConfig.skipValidation,
          deduplicationEnabled: jobConfig.processingConfig.deduplicationEnabled,
          gapDetectionEnabled: jobConfig.processingConfig.gapDetectionEnabled,
          maxErrors: jobConfig.processingConfig.maxErrors,
          timezone: jobConfig.processingConfig.timezone
        });
      }

      // Convert field mappings from Record to FieldMapping[]
      const fieldMappings: FieldMapping[] = Object.entries(parseResult.classification.fieldMappings).map(([source, target]) => ({
        source_field: source,
        target_field: target as keyof Event | keyof Contact,
        data_type: 'string', // Default type, would be inferred in real implementation
        confidence: 0.8,
        is_required: false
      }));

      const etlResult = await this.etlPipeline.processEvents(
        parseResult.data,
        fieldMappings,
        {
          userId,
          jobId,
          carrierType,
          progressCallback: (progress: number, step: string) => {
            // Map ETL progress to overall job progress (25-95%)
            const overallProgress = 25 + (progress * 0.7);
            this.updateProgress(jobId, overallProgress, 'validation', step);
          }
        }
      );

      // Step 3: Final completion
      await this.updateProgress(jobId, 98, 'storage', 'Finalizing results');

      // Calculate final metrics
      const finalMetrics: ProcessingMetrics & {
        validation: any;
        normalization: any;
        deduplication: any;
        gapAnalysis?: any;
      } = {
        ...etlResult.metrics,
        file_size_mb: fileSize / (1024 * 1024)
      };

      // Mark job as completed
      await this.updateProgress(jobId, 100, 'completed', 'Processing completed successfully');

      return {
        success: true,
        result: {
          events: etlResult.processedEvents,
          contacts: etlResult.extractedContacts,
          metrics: finalMetrics
        },
        errors: etlResult.errors,
        warnings: etlResult.warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      await this.jobTracker.updateJob(jobId, {
        status: 'failed',
        error: {
          code: 'PROCESSING_ERROR',
          message: errorMessage,
          details: error
        }
      });

      return {
        success: false,
        errors: [{
          id: crypto.randomUUID(),
          job_id: jobId,
          error_type: 'system_error',
          error_message: errorMessage,
          severity: 'critical',
          created_at: new Date().toISOString()
        }],
        warnings: []
      };
    }
  }

  /**
   * Process events only (for already parsed data)
   */
  async processEventsOnly(
    events: Record<string, any>[],
    fieldMappings: FieldMapping[],
    options: {
      userId: string;
      jobId: string;
      carrierType?: string;
      processingConfig?: {
        skipValidation?: boolean;
        deduplicationEnabled?: boolean;
        gapDetectionEnabled?: boolean;
        maxErrors?: number;
        timezone?: string;
      };
    }
  ): Promise<{
    success: boolean;
    result?: {
      events: Partial<Event>[];
      contacts: Partial<Contact>[];
      metrics: ProcessingMetrics & {
        validation: any;
        normalization: any;
        deduplication: any;
        gapAnalysis?: any;
      };
    };
    errors: IngestionError[];
    warnings: string[];
  }> {
    try {
      // Update ETL pipeline config if provided
      if (options.processingConfig) {
        this.etlPipeline.updateConfig({
          skipValidation: options.processingConfig.skipValidation,
          deduplicationEnabled: options.processingConfig.deduplicationEnabled,
          gapDetectionEnabled: options.processingConfig.gapDetectionEnabled,
          maxErrors: options.processingConfig.maxErrors,
          timezone: options.processingConfig.timezone
        });
      }

      const etlResult = await this.etlPipeline.processEvents(
        events,
        fieldMappings,
        {
          userId: options.userId,
          jobId: options.jobId,
          carrierType: options.carrierType,
          progressCallback: (progress: number, step: string) => {
            this.updateProgress(options.jobId, progress, 'validation', step);
          }
        }
      );

      return {
        success: true,
        result: {
          events: etlResult.processedEvents,
          contacts: etlResult.extractedContacts,
          metrics: etlResult.metrics
        },
        errors: etlResult.errors,
        warnings: etlResult.warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        success: false,
        errors: [{
          id: crypto.randomUUID(),
          job_id: options.jobId,
          error_type: 'system_error',
          error_message: errorMessage,
          severity: 'critical',
          created_at: new Date().toISOString()
        }],
        warnings: []
      };
    }
  }

  /**
   * Validate data without full processing
   */
  async validateOnly(
    events: Record<string, any>[],
    fieldMappings: FieldMapping[],
    options: {
      carrierType?: string;
      validationRules?: any[];
    } = {}
  ): Promise<{
    isValid: boolean;
    validationSummary: {
      totalRecords: number;
      validRecords: number;
      invalidRecords: number;
      errorRate: number;
      warningCount: number;
    };
    errors: Array<{ field: string; message: string; value: any }>;
    warnings: string[];
  }> {
    try {
      // Create temporary ETL pipeline for validation only
      const validationPipeline = new ETLPipeline({
        skipValidation: false,
        deduplicationEnabled: false,
        gapDetectionEnabled: false
      });

      const result = await validationPipeline.processEvents(
        events,
        fieldMappings,
        {
          userId: 'validation-only',
          jobId: 'validation-' + Date.now()
        }
      );

      const validationErrors = result.errors
        .filter(err => err.error_type === 'validation_error')
        .map(err => ({
          field: 'unknown',
          message: err.error_message,
          value: err.raw_data
        }));

      return {
        isValid: result.errors.length === 0,
        validationSummary: result.metrics.validation,
        errors: validationErrors,
        warnings: result.warnings
      };

    } catch (error) {
      return {
        isValid: false,
        validationSummary: {
          totalRecords: events.length,
          validRecords: 0,
          invalidRecords: events.length,
          errorRate: 100,
          warningCount: 0
        },
        errors: [{
          field: 'system',
          message: error instanceof Error ? error.message : 'Validation failed',
          value: null
        }],
        warnings: []
      };
    }
  }

  /**
   * Get processing statistics for monitoring
   */
  async getProcessingStats(
    timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    averageProcessingTime: number;
    averageThroughput: number; // rows per second
    totalEventsProcessed: number;
    totalContactsExtracted: number;
    averageQualityScore: number;
    commonErrors: Array<{
      type: string;
      count: number;
      message: string;
    }>;
  }> {
    // This would typically query a database for job statistics
    // For now, return a placeholder structure
    return {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      averageProcessingTime: 0,
      averageThroughput: 0,
      totalEventsProcessed: 0,
      totalContactsExtracted: 0,
      averageQualityScore: 0,
      commonErrors: []
    };
  }

  /**
   * Update job progress
   */
  private async updateProgress(
    jobId: string, 
    progress: number, 
    step: ProcessingStep, 
    message?: string
  ): Promise<void> {
    try {
      await this.jobTracker.updateJob(jobId, {
        progress: Math.min(100, Math.max(0, progress)),
        currentStep: step,
        updatedAt: new Date()
      });

      // Emit progress event for real-time updates
      this.jobTracker.emit('progress', {
        jobId,
        progress,
        step,
        message,
        timestamp: new Date()
      });
    } catch (error) {
      console.warn(`Failed to update progress for job ${jobId}:`, error);
    }
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      await this.jobTracker.updateJob(jobId, {
        status: 'cancelled',
        updatedAt: new Date(),
        error: {
          code: 'USER_CANCELLED',
          message: 'Job was cancelled by user'
        }
      });

      return true;
    } catch (error) {
      console.error(`Failed to cancel job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(
    jobId: string,
    retryFromStep: ProcessingStep = 'queued'
  ): Promise<boolean> {
    try {
      await this.jobTracker.updateJob(jobId, {
        status: 'pending',
        currentStep: retryFromStep,
        progress: 0,
        updatedAt: new Date(),
        error: undefined
      });

      return true;
    } catch (error) {
      console.error(`Failed to retry job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Get job status and metrics
   */
  async getJobStatus(jobId: string): Promise<IngestionJobNew | null> {
    return this.jobTracker.getJob(jobId);
  }

  /**
   * Clean up completed jobs older than specified days
   */
  async cleanupOldJobs(retentionDays: number = 30): Promise<number> {
    // This would typically clean up database records
    // Return number of jobs cleaned up
    return 0;
  }

  /**
   * Update ETL configuration
   */
  updateETLConfig(config: Parameters<ETLPipeline['updateConfig']>[0]): void {
    this.etlPipeline.updateConfig(config);
  }

  /**
   * Get current ETL configuration
   */
  getETLConfig(): ReturnType<ETLPipeline['getConfig']> {
    return this.etlPipeline.getConfig();
  }
}

export default ETLOrchestrator;