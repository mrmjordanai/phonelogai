import { v4 as uuidv4 } from 'uuid';
import { FileDetectionService, FILE_VALIDATION_RULES } from '../utils/fileDetection';
import { 
  FileUploadRequest, 
  FileUploadResponse, 
  IngestionJob, 
  ProcessingConfig,
  IngestionError,
  ErrorType 
} from '../types';
import { supabase } from '@phonelogai/database';

export class FileUploadHandler {
  private supabaseClient = supabase;

  /**
   * Handle file upload and create ingestion job
   */
  async handleFileUpload(request: FileUploadRequest): Promise<FileUploadResponse> {
    try {
      // Validate file
      const validationResult = await this.validateFile(request);
      if (!validationResult.isValid) {
        return {
          job_id: '',
          status: 'failed',
          message: `File validation failed: ${validationResult.errors.join(', ')}`
        };
      }

      // Get file metadata
      const metadata = FileDetectionService.getFileMetadata(
        request.filename,
        request.file,
        request.mimetype
      );

      // Create ingestion job
      const job = await this.createIngestionJob(request, metadata);

      // Store file (in production, this would be cloud storage)
      await this.storeFile(job.id, request.file);

      // Queue for processing (in production, this would use Celery/Redis)
      await this.queueForProcessing(job);

      return {
        job_id: job.id,
        status: job.status,
        estimated_processing_time: metadata.estimatedProcessingTime,
        message: 'File uploaded successfully and queued for processing'
      };

    } catch (error) {
      console.error('File upload failed:', error);
      return {
        job_id: '',
        status: 'failed',
        message: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate uploaded file
   */
  private async validateFile(request: FileUploadRequest): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file size
    if (!FileDetectionService.validateFileSize(request.size, FILE_VALIDATION_RULES.maxSizeMB)) {
      errors.push(
        `File size ${FileDetectionService.formatFileSize(request.size)} exceeds limit of ${FILE_VALIDATION_RULES.maxSizeMB}MB`
      );
    }

    // Check file type
    if (!FileDetectionService.validateFileType(request.filename, request.mimetype)) {
      errors.push(`Unsupported file type: ${request.mimetype}`);
    }

    // Check for empty file
    if (request.size === 0) {
      errors.push('File is empty');
    }

    // Check for potential encryption
    try {
      const format = FileDetectionService.detectFileFormat(request.filename, request.mimetype);
      const isEncrypted = await FileDetectionService.isFileEncrypted(request.file, format);
      if (isEncrypted) {
        errors.push('File appears to be encrypted or password protected');
      }
    } catch (error) {
      warnings.push(`Could not check file encryption status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check filename for special characters that might cause issues
    if (!/^[a-zA-Z0-9._-]+$/.test(request.filename)) {
      warnings.push('Filename contains special characters that may cause processing issues');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create ingestion job record in database
   */
  private async createIngestionJob(
    request: FileUploadRequest, 
    metadata: ReturnType<typeof FileDetectionService.getFileMetadata>
  ): Promise<IngestionJob> {
    const jobId = uuidv4();
    const defaultConfig: ProcessingConfig = {
      chunk_size: 1000,
      max_errors: 100,
      skip_validation: false,
      deduplication_enabled: true,
      anonymization_enabled: true,
      batch_size: 500,
      timeout_minutes: 30,
      ...request.processing_config
    };

    const jobData = {
      id: jobId,
      user_id: request.user_id,
      filename: request.filename,
      file_size: request.size,
      format: metadata.format,
      carrier: metadata.carrier,
      status: 'pending' as const,
      progress: 0,
      processed_rows: 0,
      metadata: {
        original_mimetype: request.mimetype,
        file_hash: metadata.hash,
        estimated_processing_time: metadata.estimatedProcessingTime,
        processing_config: defaultConfig,
        upload_timestamp: new Date().toISOString()
      }
    };

    const { data, error } = await this.supabaseClient
      .from('ingestion_jobs')
      .insert(jobData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create ingestion job: ${error.message}`);
    }

    return {
      ...data,
      errors: []
    };
  }

  /**
   * Store uploaded file (placeholder - in production would use cloud storage)
   */
  private async storeFile(jobId: string, fileBuffer: Buffer): Promise<string> {
    // In production, this would upload to S3, GCS, or similar
    // For now, we'll store the file path in the metadata
    const storagePath = `/tmp/uploads/${jobId}`;
    
    // This is a placeholder - actual implementation would:
    // 1. Upload to cloud storage
    // 2. Generate secure URLs
    // 3. Set up retention policies
    // 4. Enable encryption at rest
    
    return storagePath;
  }

  /**
   * Queue job for background processing with Python ML workers
   */
  private async queueForProcessing(job: IngestionJob): Promise<void> {
    try {
      // Create queue job record for tracking
      const queueJobData = {
        type: 'parse_file' as const,
        payload: {
          job_id: job.id,
          user_id: job.user_id,
          filename: job.filename,
          format: job.format,
          carrier: job.carrier,
          file_size: job.file_size,
          processing_config: job.metadata?.processing_config
        },
        priority: this.calculateJobPriority(job), 
        max_attempts: 3
      };

      const { error } = await this.supabaseClient
        .from('queue_jobs')
        .insert(queueJobData);

      if (error) {
        throw new Error(`Failed to queue job for processing: ${error.message}`);
      }

      // Send to Python ML workers via Celery/Redis
      await this.triggerPythonWorker(job);

    } catch (error) {
      console.error('Failed to queue job:', error);
      
      // Update job status to failed
      await this.supabaseClient
        .from('ingestion_jobs')
        .update({ 
          status: 'failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
        
      throw error;
    }
  }

  /**
   * Calculate job priority based on file size, user tier, etc.
   */
  private calculateJobPriority(job: IngestionJob): number {
    let priority = 0;
    
    // Higher priority for smaller files (faster processing)
    if (job.file_size < 1024 * 1024) { // < 1MB
      priority += 2;
    } else if (job.file_size < 10 * 1024 * 1024) { // < 10MB
      priority += 1;
    }
    
    // Higher priority for known carriers (better classification accuracy)
    if (job.carrier && job.carrier !== 'unknown') {
      priority += 1;
    }
    
    return priority;
  }

  /**
   * Trigger Python ML worker via Celery/Redis
   */
  private async triggerPythonWorker(job: IngestionJob): Promise<void> {
    // In production environment, this would:
    // 1. Connect to Redis
    // 2. Send task to Celery queue
    // 3. Include file data or storage path
    // 4. Set up task monitoring
    
    try {
      // For now, we'll use a placeholder implementation
      // In production, replace with actual Redis/Celery integration
      
      const taskPayload = {
        job_id: job.id,
        user_id: job.user_id,
        filename: job.filename,
        file_size: job.file_size,
        format: job.format,
        carrier: job.carrier,
        processing_config: job.metadata?.processing_config,
        file_storage_path: `/tmp/uploads/${job.id}` // Would be S3/GCS path in production
      };

      // This would be replaced with actual Celery task dispatch:
      // const task = await celeryClient.send_task(
      //   'phonelogai_workers.tasks.process_file_upload',
      //   [],
      //   taskPayload,
      //   {
      //     queue: 'file_processing',
      //     retry: true,
      //     retry_policy: {
      //       max_retries: 3,
      //       interval_start: 1,
      //       interval_step: 2,
      //       interval_max: 30
      //     }
      //   }
      // );

      console.log('Queued for Python ML worker processing:', taskPayload);
      
    } catch (error) {
      console.error('Failed to trigger Python worker:', error);
      throw new Error('Failed to start ML processing pipeline');
    }
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string, userId: string): Promise<IngestionJob | null> {
    const { data, error } = await this.supabaseClient
      .from('ingestion_jobs')
      .select(`
        *,
        layout_classifications(*),
        processing_metrics(*),
        ingestion_errors(*)
      `)
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      ...data,
      errors: data.ingestion_errors || []
    };
  }

  /**
   * List user's ingestion jobs
   */
  async listUserJobs(
    userId: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      sort_by?: string;
      sort_order?: 'asc' | 'desc';
    } = {}
  ): Promise<{ jobs: IngestionJob[]; total: number }> {
    let query = this.supabaseClient
      .from('ingestion_jobs')
      .select('*, ingestion_errors(*)', { count: 'exact' })
      .eq('user_id', userId);

    // Apply filters
    if (options.status) {
      query = query.eq('status', options.status);
    }

    // Apply sorting
    const sortBy = options.sort_by || 'created_at';
    const sortOrder = options.sort_order || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, (options.offset + (options.limit || 10)) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list jobs: ${error.message}`);
    }

    const jobs = (data || []).map(job => ({
      ...job,
      errors: job.ingestion_errors || []
    }));

    return {
      jobs,
      total: count || 0
    };
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabaseClient
      .from('ingestion_jobs')
      .update({ 
        status: 'failed',
        completed_at: new Date().toISOString(),
        metadata: {
          cancellation_reason: 'User requested cancellation',
          cancelled_at: new Date().toISOString()
        }
      })
      .eq('id', jobId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .select();

    if (error) {
      throw new Error(`Failed to cancel job: ${error.message}`);
    }

    return !!data && data.length > 0;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string, userId: string): Promise<boolean> {
    // Reset job status and clear previous errors
    const { data, error } = await this.supabaseClient
      .from('ingestion_jobs')
      .update({
        status: 'pending',
        progress: 0,
        processed_rows: 0,
        started_at: null,
        completed_at: null
      })
      .eq('id', jobId)
      .eq('user_id', userId)
      .in('status', ['failed', 'partial'])
      .select();

    if (error) {
      throw new Error(`Failed to retry job: ${error.message}`);
    }

    if (data && data.length > 0) {
      // Clear previous errors
      await this.supabaseClient
        .from('ingestion_errors')
        .delete()
        .eq('job_id', jobId);

      // Re-queue for processing
      await this.queueForProcessing(data[0] as IngestionJob);
      return true;
    }

    return false;
  }

  /**
   * Delete a job and its associated data
   */
  async deleteJob(jobId: string, userId: string): Promise<boolean> {
    // Only allow deletion of completed or failed jobs
    const { data, error } = await this.supabaseClient
      .from('ingestion_jobs')
      .delete()
      .eq('id', jobId)
      .eq('user_id', userId)
      .in('status', ['completed', 'failed', 'partial'])
      .select();

    if (error) {
      throw new Error(`Failed to delete job: ${error.message}`);
    }

    // In production, also delete associated files from storage
    if (data && data.length > 0) {
      // TODO: Delete file from cloud storage
      return true;
    }

    return false;
  }

  /**
   * Get processing statistics for analytics
   */
  async getProcessingStats(userId: string, days: number = 30): Promise<{
    totalFiles: number;
    successRate: number;
    avgProcessingTime: number;
    totalRowsProcessed: number;
    errorRate: number;
    formatBreakdown: Record<string, number>;
    carrierBreakdown: Record<string, number>;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await this.supabaseClient
      .from('ingestion_jobs')
      .select(`
        status,
        format,
        carrier,
        processed_rows,
        created_at,
        completed_at,
        processing_metrics(processing_time_ms)
      `)
      .eq('user_id', userId)
      .gte('created_at', cutoffDate.toISOString());

    if (error || !data) {
      throw new Error(`Failed to get processing stats: ${error?.message}`);
    }

    const totalFiles = data.length;
    const completedJobs = data.filter(job => job.status === 'completed');
    const successRate = totalFiles > 0 ? completedJobs.length / totalFiles : 0;
    
    const totalRowsProcessed = data.reduce((sum, job) => sum + (job.processed_rows || 0), 0);
    const errorRate = data.filter(job => job.status === 'failed').length / totalFiles;
    
    const processingTimes = data
      .map(job => job.processing_metrics?.[0]?.processing_time_ms)
      .filter(time => time != null);
    const avgProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      : 0;

    const formatBreakdown = data.reduce((acc, job) => {
      acc[job.format] = (acc[job.format] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const carrierBreakdown = data.reduce((acc, job) => {
      const carrier = job.carrier || 'unknown';
      acc[carrier] = (acc[carrier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalFiles,
      successRate,
      avgProcessingTime,
      totalRowsProcessed,
      errorRate,
      formatBreakdown,
      carrierBreakdown
    };
  }
}