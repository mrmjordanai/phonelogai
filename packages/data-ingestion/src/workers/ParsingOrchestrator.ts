/**
 * Parsing Orchestrator - Coordinates the entire file parsing pipeline
 * 
 * This orchestrator integrates all components of the AI-powered file parsing system:
 * - File upload and validation
 * - ML-powered layout classification
 * - Multi-format parsing (PDF, CSV, CDR)
 * - Data validation and normalization
 * - Job tracking and progress monitoring
 * 
 * Performance targets:
 * - 100k rows in <5min
 * - 1M rows in <30min  
 * - >95% layout classification accuracy
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger';
import { isError, getErrorMessage } from '../utils/errorUtils';
import { multiFormatParser } from '../parsers/MultiFormatParser';
import { mlClassificationService } from '../ml/MLClassificationService';
import { jobTracker } from './JobTracker';
import {
  IngestionJobNew,
  JobStatus,
  ProcessingStep,
  ParsingResult,
  FileFormat,
  CarrierType,
  LayoutClassificationNew,
  FileUploadRequest,
  FileUploadResponse
} from '../types';

// logger is already imported above

interface OrchestrationConfig {
  maxConcurrentJobs: number;
  defaultTimeout: number;
  enableMLClassification: boolean;
  enablePerformanceOptimization: boolean;
  enableRealTimeProgress: boolean;
}

interface ProcessingQueue {
  high: IngestionJobNew[];
  normal: IngestionJobNew[];
  low: IngestionJobNew[];
}

interface SystemMetrics {
  activeJobs: number;
  queuedJobs: number;
  completedJobsToday: number;
  failedJobsToday: number;
  averageProcessingTime: number;
  systemLoad: number;
  memoryUsage: number;
  cpuUsage: number;
}

/**
 * Parsing Orchestrator - Main coordination service
 */
export class ParsingOrchestrator extends EventEmitter {
  private readonly config: OrchestrationConfig;
  private readonly supabase: any;
  private readonly processingQueue: ProcessingQueue;
  private readonly activeJobs: Map<string, IngestionJobNew>;
  private processingInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<OrchestrationConfig> = {}) {
    super();
    
    this.config = {
      maxConcurrentJobs: 10,
      defaultTimeout: 300000, // 5 minutes
      enableMLClassification: true,
      enablePerformanceOptimization: true,
      enableRealTimeProgress: true,
      ...config
    };
    
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    this.processingQueue = {
      high: [],
      normal: [],
      low: []
    };
    
    this.activeJobs = new Map();
    
    this.startProcessingLoop();
    this.startMetricsCollection();
    
    logger.info('ParsingOrchestrator initialized', {
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      mlEnabled: this.config.enableMLClassification
    });
  }
  
  /**
   * Submit file for parsing - Main entry point
   */
  async submitFileForParsing(request: FileUploadRequest): Promise<FileUploadResponse> {
    try {
      logger.info('File submission received', {
        filename: request.filename,
        size: request.size,
        mimetype: request.mimetype
      });
      
      // Create ingestion job
      const job = await this.createIngestionJob(request);
      
      // Add to appropriate queue based on file size and type
      const priority = this.determinePriority(request);
      this.addToQueue(job, priority);
      
      // Emit job submitted event
      this.emit('jobSubmitted', job);
      
      // Estimate processing time based on file size and system load
      const estimatedTime = await this.estimateProcessingTime(request);
      
      logger.info('File queued for processing', {
        jobId: job.id,
        priority,
        estimatedTime
      });
      
      return {
        job_id: job.id,
        status: 'pending',
        estimated_processing_time: estimatedTime,
        message: `File "${request.filename}" queued for processing`
      };
      
    } catch (error) {
      logger.error('File submission failed', {
        filename: request.filename,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }
  
  /**
   * Get job status with detailed progress information
   */
  async getJobStatus(jobId: string): Promise<{
    job: IngestionJobNew | null;
    progress: number;
    currentStep: ProcessingStep;
    classification?: LayoutClassificationNew;
    metrics?: any;
    errors?: any[];
  } | null> {
    try {
      // Check active jobs first
      let job = this.activeJobs.get(jobId);
      
      if (!job) {
        // Load from database
        const { data, error } = await this.supabase
          .from('parser_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        
        if (error || !data) {
          return null;
        }
        
        job = this.mapDatabaseToJob(data);
      }
      
      // Get classification results if available
      const { data: classificationData } = await this.supabase
        .from('layout_classifications')
        .select('*')
        .eq('job_id', jobId)
        .single();
      
      const classification = classificationData ? this.mapDatabaseToClassification(classificationData) : undefined;
      
      // Get processing metrics if available
      const { data: metricsData } = await this.supabase
        .from('processing_metrics')
        .select('*')
        .eq('job_id', jobId)
        .single();
      
      // Get error details if any
      const { data: errorsData } = await this.supabase
        .from('ingestion_errors')
        .select('*')
        .eq('job_id', jobId);
      
      return {
        job,
        progress: job.progress,
        currentStep: job.currentStep,
        classification,
        metrics: metricsData,
        errors: errorsData || []
      };
      
    } catch (error) {
      logger.error('Failed to get job status', {
        jobId,
        error: getErrorMessage(error)
      });
      return null;
    }
  }
  
  /**
   * Cancel an active or queued job
   */
  async cancelJob(jobId: string, reason?: string): Promise<boolean> {
    try {
      // Remove from queue if present
      const removed = this.removeFromQueue(jobId);
      
      // Cancel active job if present
      if (this.activeJobs.has(jobId)) {
        const job = this.activeJobs.get(jobId)!;
        job.status = 'cancelled';
        job.error = {
          code: 'JOB_CANCELLED',
          message: reason || 'Job was cancelled by user'
        };
        
        this.activeJobs.delete(jobId);
        
        // Update database
        await this.updateJobInDatabase(job);
        
        this.emit('jobCancelled', job);
        
        logger.info('Active job cancelled', { jobId, reason });
        return true;
      }
      
      if (removed) {
        // Update database for queued job
        await this.supabase
          .from('parser_jobs')
          .update({
            status: 'cancelled',
            error_message: reason || 'Job was cancelled by user',
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId);
        
        logger.info('Queued job cancelled', { jobId, reason });
        return true;
      }
      
      return false;
      
    } catch (error) {
      logger.error('Failed to cancel job', {
        jobId,
        error: getErrorMessage(error)
      });
      return false;
    }
  }
  
  /**
   * Get system-wide processing metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const activeJobs = this.activeJobs.size;
      const queuedJobs = this.getTotalQueuedJobs();
      
      // Get today's statistics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: todayJobs } = await this.supabase
        .from('parser_jobs')
        .select('status, processing_time')
        .gte('created_at', today.toISOString());
      
      const completedJobsToday = (todayJobs || []).filter((j: any) => j.status === 'completed').length;
      const failedJobsToday = (todayJobs || []).filter((j: any) => j.status === 'failed').length;
      
      const processingTimes = (todayJobs || [])
        .filter((j: any) => j.processing_time)
        .map((j: any) => j.processing_time);
      
      const averageProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((sum: number, time: number) => sum + time, 0) / processingTimes.length
        : 0;
      
      const systemLoad = Math.min(activeJobs / this.config.maxConcurrentJobs, 1.0);
      
      // Get system resources (simplified - in production would use actual monitoring)
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
      const cpuUsage = process.cpuUsage().user / 1000000; // Simplified CPU usage
      
      return {
        activeJobs,
        queuedJobs,
        completedJobsToday,
        failedJobsToday,
        averageProcessingTime,
        systemLoad,
        memoryUsage,
        cpuUsage
      };
      
    } catch (error) {
      logger.error('Failed to get system metrics', { error: getErrorMessage(error) });
      throw error;
    }
  }
  
  /**
   * Retry a failed job
   */
  async retryJob(jobId: string, fromStep?: ProcessingStep): Promise<boolean> {
    try {
      const job = await this.getJobFromDatabase(jobId);
      if (!job) {
        return false;
      }
      
      if (job.status !== 'failed') {
        throw new Error(`Cannot retry job in ${job.status} state`);
      }
      
      // Reset job state
      job.status = 'pending';
      job.currentStep = fromStep || ProcessingStep.QUEUED;
      job.progress = 0;
      job.error = undefined;
      job.updatedAt = new Date();
      
      // Add back to queue
      const priority = this.determinePriority({
        filename: job.filename,
        size: job.fileSize
      } as FileUploadRequest);
      
      this.addToQueue(job, priority);
      
      await this.updateJobInDatabase(job);
      
      logger.info('Job requeued for retry', {
        jobId,
        fromStep,
        priority
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to retry job', {
        jobId,
        error: getErrorMessage(error)
      });
      return false;
    }
  }
  
  // Private methods
  
  private async createIngestionJob(request: FileUploadRequest): Promise<IngestionJobNew> {
    const jobId = uuidv4();
    
    const job: IngestionJobNew = {
      id: jobId,
      userId: request.user_id,
      filename: request.filename,
      fileSize: request.size,
      mimeType: request.mimetype,
      fileContent: request.file.toString('base64'), // Store as base64
      status: 'pending',
      currentStep: ProcessingStep.QUEUED,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Store in database
    await this.storeJobInDatabase(job);
    
    return job;
  }
  
  private determinePriority(request: FileUploadRequest): 'high' | 'normal' | 'low' {
    // Small files get high priority
    if (request.size < 1024 * 1024) { // < 1MB
      return 'high';
    }
    
    // Large files get low priority
    if (request.size > 50 * 1024 * 1024) { // > 50MB
      return 'low';
    }
    
    return 'normal';
  }
  
  private addToQueue(job: IngestionJobNew, priority: 'high' | 'normal' | 'low'): void {
    this.processingQueue[priority].push(job);
    
    logger.debug('Job added to queue', {
      jobId: job.id,
      priority,
      queueLength: this.processingQueue[priority].length
    });
  }
  
  private removeFromQueue(jobId: string): boolean {
    for (const priority of ['high', 'normal', 'low'] as const) {
      const queue = this.processingQueue[priority];
      const index = queue.findIndex(job => job.id === jobId);
      
      if (index !== -1) {
        queue.splice(index, 1);
        return true;
      }
    }
    
    return false;
  }
  
  private getTotalQueuedJobs(): number {
    return this.processingQueue.high.length + 
           this.processingQueue.normal.length + 
           this.processingQueue.low.length;
  }
  
  private async estimateProcessingTime(request: FileUploadRequest): Promise<number> {
    // Estimate based on file size and system load
    const baseTimePerMB = 5000; // 5 seconds per MB
    const fileSizeMB = request.size / (1024 * 1024);
    const baseTime = fileSizeMB * baseTimePerMB;
    
    // Adjust for system load
    const systemLoad = this.activeJobs.size / this.config.maxConcurrentJobs;
    const loadMultiplier = 1 + systemLoad;
    
    return Math.round(baseTime * loadMultiplier);
  }
  
  private startProcessingLoop(): void {
    this.processingInterval = setInterval(async () => {
      await this.processQueue();
    }, 1000); // Check every second
  }
  
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      await this.collectMetrics();
    }, 30000); // Collect every 30 seconds
  }
  
  private async processQueue(): Promise<void> {
    try {
      // Don't process if at capacity
      if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
        return;
      }
      
      // Get next job from queue (priority order)
      const job = this.getNextJob();
      if (!job) {
        return;
      }
      
      // Start processing
      this.activeJobs.set(job.id, job);
      this.processJobAsync(job);
      
    } catch (error) {
      logger.error('Queue processing error', { error: getErrorMessage(error) });
    }
  }
  
  private getNextJob(): IngestionJobNew | null {
    // Check high priority first
    if (this.processingQueue.high.length > 0) {
      return this.processingQueue.high.shift()!;
    }
    
    // Then normal priority
    if (this.processingQueue.normal.length > 0) {
      return this.processingQueue.normal.shift()!;
    }
    
    // Finally low priority
    if (this.processingQueue.low.length > 0) {
      return this.processingQueue.low.shift()!;
    }
    
    return null;
  }
  
  private async processJobAsync(job: IngestionJobNew): Promise<void> {
    try {
      logger.info('Starting job processing', {
        jobId: job.id,
        filename: job.filename
      });
      
      // Use MultiFormatParser to process the file
      const result = await multiFormatParser.parseFile(job);
      
      // Mark as completed
      job.status = 'completed';
      job.progress = 1.0;
      job.currentStep = ProcessingStep.COMPLETED;
      job.updatedAt = new Date();
      
      await this.updateJobInDatabase(job);
      
      this.emit('jobCompleted', { job, result });
      
      logger.info('Job processing completed', {
        jobId: job.id,
        rowsProcessed: result.metrics.processedRows,
        processingTime: result.metrics.processingTime
      });
      
    } catch (error) {
      logger.error('Job processing failed', {
        jobId: job.id,
        error: getErrorMessage(error)
      });
      
      // Mark as failed
      job.status = 'failed';
      job.error = {
        code: 'PROCESSING_FAILED',
        message: getErrorMessage(error)
      };
      job.updatedAt = new Date();
      
      await this.updateJobInDatabase(job);
      
      this.emit('jobFailed', job);
      
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(job.id);
    }
  }
  
  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.getSystemMetrics();
      this.emit('metricsCollected', metrics);
      
      // Store metrics in database for historical tracking
      await this.supabase
        .from('system_metrics')
        .insert({
          timestamp: new Date().toISOString(),
          active_jobs: metrics.activeJobs,
          queued_jobs: metrics.queuedJobs,
          system_load: metrics.systemLoad,
          memory_usage_mb: metrics.memoryUsage,
          cpu_usage_percent: metrics.cpuUsage
        });
      
    } catch (error) {
      logger.error('Metrics collection failed', { error: getErrorMessage(error) });
    }
  }
  
  private async storeJobInDatabase(job: IngestionJobNew): Promise<void> {
    const { error } = await this.supabase
      .from('parser_jobs')
      .insert({
        id: job.id,
        user_id: job.userId,
        filename: job.filename,
        file_size: job.fileSize,
        mime_type: job.mimeType,
        status: job.status,
        current_step: job.currentStep,
        progress: job.progress,
        created_at: job.createdAt.toISOString(),
        updated_at: job.updatedAt.toISOString()
      });
    
    if (error) {
      throw new Error(`Failed to store job: ${getErrorMessage(error)}`);
    }
  }
  
  private async updateJobInDatabase(job: IngestionJobNew): Promise<void> {
    const updateData: any = {
      status: job.status,
      current_step: job.currentStep,
      progress: job.progress,
      updated_at: job.updatedAt.toISOString()
    };
    
    if (job.error) {
      updateData.error_message = job.error.message;
      updateData.error_code = job.error.code;
      updateData.error_details = job.error.details;
    }
    
    const { error } = await this.supabase
      .from('parser_jobs')
      .update(updateData)
      .eq('id', job.id);
    
    if (error) {
      throw new Error(`Failed to update job: ${getErrorMessage(error)}`);
    }
  }
  
  private async getJobFromDatabase(jobId: string): Promise<IngestionJobNew | null> {
    const { data, error } = await this.supabase
      .from('parser_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return this.mapDatabaseToJob(data);
  }
  
  private mapDatabaseToJob(dbRow: any): IngestionJobNew {
    return {
      id: dbRow.id,
      userId: dbRow.user_id,
      filename: dbRow.filename,
      fileSize: dbRow.file_size,
      mimeType: dbRow.mime_type,
      status: dbRow.status,
      currentStep: dbRow.current_step,
      progress: dbRow.progress || 0,
      createdAt: new Date(dbRow.created_at),
      updatedAt: new Date(dbRow.updated_at),
      error: dbRow.error_message ? {
        code: dbRow.error_code || 'UNKNOWN_ERROR',
        message: dbRow.error_message,
        details: dbRow.error_details
      } : undefined
    };
  }
  
  private mapDatabaseToClassification(dbRow: any): LayoutClassificationNew {
    return {
      jobId: dbRow.job_id,
      format: dbRow.format,
      carrier: dbRow.carrier,
      confidence: dbRow.confidence,
      fieldMappings: dbRow.field_mappings || {},
      templateId: dbRow.template_id,
      detectedAt: new Date(dbRow.created_at),
      processingMetrics: dbRow.processing_metrics,
      fallbackRequired: dbRow.fallback_required
    };
  }
  
  /**
   * Graceful shutdown
   */
  destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    this.activeJobs.clear();
    this.processingQueue.high.length = 0;
    this.processingQueue.normal.length = 0;
    this.processingQueue.low.length = 0;
    
    this.removeAllListeners();
    
    logger.info('ParsingOrchestrator destroyed');
  }
}

// Export singleton instance
export const parsingOrchestrator = new ParsingOrchestrator();