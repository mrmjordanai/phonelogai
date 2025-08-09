import { EventEmitter } from 'events';
import { supabase } from '@phonelogai/database';
import { 
  IngestionJob, 
  IngestionJobNew,
  JobProgress, 
  ProcessingStep, 
  JobStatus,
  IngestionError,
  ProcessingMetrics 
} from '../types';

export class JobTracker extends EventEmitter {
  private supabaseClient = supabase;
  private activeJobs = new Map<string, JobProgress>();
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startProgressMonitoring();
  }

  /**
   * Start monitoring active jobs for progress updates
   */
  private startProgressMonitoring(): void {
    this.updateInterval = setInterval(async () => {
      await this.syncActiveJobs();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Stop progress monitoring
   */
  public stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Start tracking a job
   */
  async startJob(jobId: string, totalRows?: number): Promise<void> {
    const progress: JobProgress = {
      job_id: jobId,
      status: 'processing',
      progress: 0,
      current_step: ProcessingStep.FORMAT_DETECTION,
      processed_rows: 0,
      total_rows: totalRows,
      estimated_completion: this.calculateEstimatedCompletion(0, totalRows),
      errors_count: 0,
      warnings_count: 0
    };

    this.activeJobs.set(jobId, progress);

    // Update database
    await this.updateJobStatus(jobId, {
      status: 'processing',
      started_at: new Date().toISOString(),
      total_rows: totalRows
    });

    this.emit('jobStarted', progress);
  }

  /**
   * Update job progress
   */
  async updateProgress(
    jobId: string, 
    updates: Partial<JobProgress>
  ): Promise<void> {
    const currentProgress = this.activeJobs.get(jobId);
    if (!currentProgress) {
      throw new Error(`Job ${jobId} not found in active jobs`);
    }

    const updatedProgress: JobProgress = {
      ...currentProgress,
      ...updates,
      estimated_completion: updates.progress 
        ? this.calculateEstimatedCompletion(updates.progress, currentProgress.total_rows)
        : currentProgress.estimated_completion
    };

    this.activeJobs.set(jobId, updatedProgress);

    // Update database
    const dbUpdates: any = {};
    if (updates.progress !== undefined) dbUpdates.progress = updates.progress;
    if (updates.processed_rows !== undefined) dbUpdates.processed_rows = updates.processed_rows;
    if (updates.status) dbUpdates.status = updates.status;

    if (Object.keys(dbUpdates).length > 0) {
      await this.updateJobStatus(jobId, dbUpdates);
    }

    this.emit('progressUpdated', updatedProgress);
  }

  /**
   * Complete a job
   */
  async completeJob(
    jobId: string, 
    status: 'completed' | 'failed' | 'partial',
    metrics?: Partial<ProcessingMetrics>
  ): Promise<void> {
    const progress = this.activeJobs.get(jobId);
    if (progress) {
      progress.status = status;
      progress.progress = status === 'completed' ? 100 : progress.progress;
      progress.current_step = 'completed';
      this.emit('jobCompleted', progress);
    }

    // Update database
    await this.updateJobStatus(jobId, {
      status,
      progress: status === 'completed' ? 100 : undefined,
      completed_at: new Date().toISOString()
    });

    // Save metrics if provided
    if (metrics) {
      await this.saveProcessingMetrics(jobId, metrics);
    }

    // Remove from active jobs
    this.activeJobs.delete(jobId);
  }

  /**
   * Add error to job
   */
  async addError(
    jobId: string,
    error: Omit<IngestionError, 'id' | 'job_id' | 'created_at'>
  ): Promise<void> {
    const progress = this.activeJobs.get(jobId);
    if (progress) {
      if (error.severity === 'warning') {
        progress.warnings_count++;
      } else {
        progress.errors_count++;
      }
      this.emit('errorAdded', { jobId, error, progress });
    }

    // Save error to database
    const { error: dbError } = await this.supabaseClient
      .from('ingestion_errors')
      .insert({
        job_id: jobId,
        ...error
      });

    if (dbError) {
      console.error(`Failed to save error for job ${jobId}:`, dbError);
    }
  }

  /**
   * Get current progress for a job
   */
  getJobProgress(jobId: string): JobProgress | null {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Get progress for all active jobs
   */
  getAllActiveJobs(): JobProgress[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Update processing step
   */
  async updateStep(jobId: string, step: ProcessingStep): Promise<void> {
    const progress = this.activeJobs.get(jobId);
    if (progress) {
      progress.current_step = step;
      
      // Update progress based on step
      const stepProgress = this.getProgressForStep(step);
      if (stepProgress > progress.progress) {
        progress.progress = stepProgress;
      }
      
      this.emit('stepUpdated', progress);
    }
  }

  /**
   * Get estimated progress percentage for a processing step
   */
  private getProgressForStep(step: ProcessingStep): number {
    const stepProgressMap: Partial<Record<ProcessingStep, number>> = {
      [ProcessingStep.FILE_UPLOAD]: 5,
      [ProcessingStep.FORMAT_DETECTION]: 10,
      [ProcessingStep.LAYOUT_CLASSIFICATION]: 20,
      [ProcessingStep.DATA_EXTRACTION]: 40,
      [ProcessingStep.VALIDATION]: 60,
      [ProcessingStep.DEDUPLICATION]: 70,
      [ProcessingStep.DATABASE_INSERTION]: 85,
      [ProcessingStep.CONTACT_CREATION]: 90,
      [ProcessingStep.PRIVACY_APPLICATION]: 95,
      [ProcessingStep.COMPLETED]: 100
    };
    
    return stepProgressMap[step] || 0;
  }

  /**
   * Calculate estimated completion time
   */
  private calculateEstimatedCompletion(
    currentProgress: number, 
    totalRows?: number
  ): string | undefined {
    if (!totalRows || currentProgress <= 0) {
      return undefined;
    }

    // Estimate based on typical processing rates
    const avgRowsPerSecond = 1000; // Configurable based on system performance
    const remainingRows = totalRows * ((100 - currentProgress) / 100);
    const estimatedSeconds = Math.ceil(remainingRows / avgRowsPerSecond);
    
    const completionTime = new Date();
    completionTime.setSeconds(completionTime.getSeconds() + estimatedSeconds);
    
    return completionTime.toISOString();
  }

  /**
   * Update job status in database
   */
  private async updateJobStatus(
    jobId: string, 
    updates: Partial<{
      status: JobStatus;
      progress: number;
      processed_rows: number;
      total_rows: number;
      started_at: string;
      completed_at: string;
    }>
  ): Promise<void> {
    const { error } = await this.supabaseClient
      .from('ingestion_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) {
      console.error(`Failed to update job status for ${jobId}:`, error);
    }
  }

  /**
   * Save processing metrics
   */
  private async saveProcessingMetrics(
    jobId: string,
    metrics: Partial<ProcessingMetrics>
  ): Promise<void> {
    const { error } = await this.supabaseClient
      .from('processing_metrics')
      .upsert({
        job_id: jobId,
        ...metrics
      });

    if (error) {
      console.error(`Failed to save metrics for job ${jobId}:`, error);
    }
  }

  /**
   * Sync active jobs with database (for monitoring)
   */
  private async syncActiveJobs(): Promise<void> {
    if (this.activeJobs.size === 0) return;

    const jobIds = Array.from(this.activeJobs.keys());
    
    try {
      const { data, error } = await this.supabaseClient
        .from('ingestion_jobs')
        .select(`
          id,
          status,
          progress,
          processed_rows,
          total_rows,
          ingestion_errors(count)
        `)
        .in('id', jobIds);

      if (error || !data) {
        console.error('Failed to sync active jobs:', error);
        return;
      }

      // Update local state with database state
      for (const job of data) {
        const localProgress = this.activeJobs.get(job.id);
        if (localProgress) {
          localProgress.status = job.status as JobStatus;
          localProgress.progress = job.progress || 0;
          localProgress.processed_rows = job.processed_rows || 0;
          localProgress.total_rows = job.total_rows || localProgress.total_rows;
          localProgress.errors_count = job.ingestion_errors?.length || 0;

          // If job is completed in database but still active locally, clean up
          if (['completed', 'failed', 'partial'].includes(job.status)) {
            this.activeJobs.delete(job.id);
            this.emit('jobCompleted', localProgress);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing active jobs:', error);
    }
  }

  /**
   * Get detailed job status including all related data
   */
  async getDetailedJobStatus(jobId: string): Promise<{
    job: IngestionJob | null;
    progress: JobProgress | null;
    errors: IngestionError[];
    metrics: ProcessingMetrics | null;
  }> {
    const { data, error } = await this.supabaseClient
      .from('ingestion_jobs')
      .select(`
        *,
        layout_classifications(*),
        processing_metrics(*),
        ingestion_errors(*)
      `)
      .eq('id', jobId)
      .single();

    if (error || !data) {
      return {
        job: null,
        progress: null,
        errors: [],
        metrics: null
      };
    }

    const job: IngestionJob = {
      ...data,
      errors: data.ingestion_errors || []
    };

    const progress = this.activeJobs.get(jobId) || {
      job_id: jobId,
      status: data.status,
      progress: data.progress || 0,
      current_step: data.status === 'completed' ? 'completed' : 'processing',
      processed_rows: data.processed_rows || 0,
      total_rows: data.total_rows,
      errors_count: data.ingestion_errors?.length || 0,
      warnings_count: data.ingestion_errors?.filter((e: any) => e.severity === 'warning').length || 0
    } as JobProgress;

    return {
      job,
      progress,
      errors: data.ingestion_errors || [],
      metrics: data.processing_metrics?.[0] || null
    };
  }

  /**
   * Cancel an active job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const progress = this.activeJobs.get(jobId);
    if (progress && progress.status === 'processing') {
      progress.status = 'failed';
      progress.current_step = 'completed';
      
      await this.updateJobStatus(jobId, {
        status: 'failed',
        completed_at: new Date().toISOString()
      });

      // Add cancellation error
      await this.addError(jobId, {
        error_type: 'system_error',
        error_message: 'Job cancelled by user',
        severity: 'error'
      });

      this.activeJobs.delete(jobId);
      this.emit('jobCancelled', progress);
      
      return true;
    }
    
    return false;
  }

  /**
   * Get system-wide processing statistics
   */
  async getSystemStats(): Promise<{
    activeJobs: number;
    queuedJobs: number;
    completedToday: number;
    failedToday: number;
    avgProcessingTime: number;
    systemLoad: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeJobsResult, statsResult] = await Promise.all([
      this.supabaseClient
        .from('ingestion_jobs')
        .select('status')
        .in('status', ['pending', 'processing']),
      
      this.supabaseClient
        .from('ingestion_jobs')
        .select(`
          status,
          processing_metrics(processing_time_ms)
        `)
        .gte('created_at', today.toISOString())
    ]);

    const activeJobs = activeJobsResult.data?.filter((j: any) => j.status === 'processing').length || 0;
    const queuedJobs = activeJobsResult.data?.filter((j: any) => j.status === 'pending').length || 0;
    
    const todayJobs = statsResult.data || [];
    const completedToday = todayJobs.filter((j: any) => j.status === 'completed').length;
    const failedToday = todayJobs.filter((j: any) => j.status === 'failed').length;
    
    const processingTimes = todayJobs
      .map((j: any) => j.processing_metrics?.[0]?.processing_time_ms)
      .filter((time: any) => time != null) as number[];
    
    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      : 0;

    // Simple system load calculation based on active vs capacity
    const maxConcurrentJobs = 10; // Configurable
    const systemLoad = Math.min(100, (activeJobs / maxConcurrentJobs) * 100);

    return {
      activeJobs,
      queuedJobs,
      completedToday,
      failedToday,
      avgProcessingTime,
      systemLoad
    };
  }

  /**
   * Update job with new data
   */
  async updateJob(jobId: string, updates: Partial<IngestionJobNew>): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (job) {
      // Update local state
      Object.assign(job, updates);
      
      // Update database
      await this.updateJobStatus(jobId, {
        status: updates.status as JobStatus,
        progress: updates.progress,
        // Map other fields as needed
      });
    }
  }

  /**
   * Get job data
   */
  async getJob(jobId: string): Promise<IngestionJobNew | null> {
    // First check local cache
    const localJob = this.activeJobs.get(jobId);
    if (localJob) {
      // Convert JobProgress to IngestionJobNew format
      return {
        id: localJob.job_id,
        userId: '', // Would need to be stored separately
        filename: '', // Would need to be stored separately
        fileSize: 0, // Would need to be stored separately
        status: localJob.status,
        currentStep: localJob.current_step,
        progress: localJob.progress,
        createdAt: new Date(), // Would need to be stored separately
        updatedAt: new Date()
      };
    }

    // Fallback to database query
    const { data, error } = await this.supabaseClient
      .from('ingestion_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      return null;
    }

    // Convert database record to IngestionJobNew format
    return {
      id: data.id,
      userId: data.user_id,
      filename: data.filename,
      fileSize: data.file_size,
      mimeType: data.original_mimetype,
      filePath: data.file_storage_path,
      status: data.status,
      currentStep: data.current_step || ProcessingStep.QUEUED,
      progress: data.progress || 0,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      error: data.metadata?.error
    };
  }
}

// Singleton instance for global job tracking
export const jobTracker = new JobTracker();