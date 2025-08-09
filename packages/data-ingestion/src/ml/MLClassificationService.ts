/**
 * ML Classification Service - TypeScript interface to Python ML workers
 * 
 * This service provides the TypeScript orchestration layer for the Python ML
 * classification system, handling file analysis, layout detection, and carrier
 * identification with high accuracy targets (>95%).
 */
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { LayoutClassification, LayoutClassificationNew, CarrierType, FileFormat, MLConfidenceScore } from '../types';
import logger from '../utils/logger';
import { isError, getErrorMessage } from '../utils/errorUtils';

// Validation schemas
const ClassificationRequestSchema = z.object({
  jobId: z.string().uuid(),
  filename: z.string().min(1),
  fileContent: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1)
});

const ClassificationResultSchema = z.object({
  format: z.enum(['pdf', 'csv', 'txt', 'json', 'unknown']),
  carrier: z.enum(['att', 'verizon', 'tmobile', 'sprint', 'unknown']),
  confidence: z.object({
    format: z.number().min(0).max(1),
    carrier: z.number().min(0).max(1),
    overall: z.number().min(0).max(1)
  }),
  fieldMappings: z.record(z.string(), z.string()).optional(),
  templateId: z.string().optional(),
  processingTime: z.number().positive(),
  metadata: z.record(z.any()).optional()
});

type ClassificationRequest = z.infer<typeof ClassificationRequestSchema>;
type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

interface MLWorkerResponse {
  success: boolean;
  result?: ClassificationResult;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metrics: {
    processingTime: number;
    memoryUsage: number;
    cpuUsage?: number;
  };
}

/**
 * ML Classification Service
 * Interfaces with Python ML workers for document layout classification
 */
export class MLClassificationService {
  private readonly redisClient: any;
  private readonly supabase: any;
  private readonly workerQueue: string = 'ml_classification';
  private readonly timeout: number = 30000; // 30 seconds
  
  constructor(options?: {
    redisUrl?: string;
    supabaseUrl?: string;
    supabaseKey?: string;
    timeout?: number;
  }) {
    // Initialize Redis connection for worker communication
    this.redisClient = this.initializeRedis(options?.redisUrl);
    
    // Initialize Supabase for result storage
    this.supabase = createClient(
      options?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      options?.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    if (options?.timeout) {
      this.timeout = options.timeout;
    }
  }
  
  private initializeRedis(redisUrl?: string): any {
    // Redis initialization (implementation depends on Redis library choice)
    // This is a placeholder - actual implementation would use ioredis or similar
    return {
      publish: async (channel: string, message: string) => {
        // Redis publish implementation
        console.log(`Publishing to ${channel}:`, message);
      },
      subscribe: async (channel: string, callback: (message: string) => void) => {
        // Redis subscribe implementation
        console.log(`Subscribing to ${channel}`);
      }
    };
  }
  
  /**
   * Classify file layout and detect carrier type
   */
  async classifyFileLayout(request: ClassificationRequest): Promise<LayoutClassificationNew> {
    try {
      // Validate request
      const validatedRequest = ClassificationRequestSchema.parse(request);
      
      logger.info('Starting ML classification', {
        jobId: validatedRequest.jobId,
        filename: validatedRequest.filename,
        fileSize: validatedRequest.fileSize
      });
      
      // Store job in database for tracking
      await this.storeClassificationJob(validatedRequest);
      
      // Use Python ML Wrapper for classification
      const { pythonMLWrapper } = await import('./PythonMLWrapper');
      const classification = await pythonMLWrapper.classifyLayout({
        jobId: validatedRequest.jobId,
        filename: validatedRequest.filename,
        fileContent: validatedRequest.fileContent,
        fileSize: validatedRequest.fileSize,
        mimeType: validatedRequest.mimeType
      });
      
      // Store results in database
      await this.storeClassificationResults(classification);
      
      logger.info('ML classification completed', {
        jobId: validatedRequest.jobId,
        format: classification.format,
        carrier: classification.carrier,
        confidence: classification.confidence.overall,
        fallbackRequired: classification.fallbackRequired
      });
      
      return classification;
      
    } catch (error) {
      logger.error('ML classification failed', {
        jobId: request.jobId,
        error: getErrorMessage(error),
        stack: isError(error) ? error.stack : undefined
      });
      
      // Store error for tracking
      await this.storeClassificationError(request.jobId, isError(error) ? error : new Error(getErrorMessage(error)));
      
      throw error;
    }
  }
  
  /**
   * Get available templates for manual mapping fallback
   */
  async getAvailableTemplates(
    carrier?: CarrierType,
    format?: FileFormat
  ): Promise<Array<{ id: string; name: string; description: string; accuracy: number }>> {
    try {
      let query = this.supabase
        .from('parser_templates')
        .select('id, name, description, accuracy')
        .order('accuracy', { ascending: false });
      
      if (carrier && carrier !== 'unknown') {
        query = query.eq('carrier', carrier);
      }
      
      if (format && format !== 'unknown') {
        query = query.eq('format', format);
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw new Error(`Failed to fetch templates: ${error.message}`);
      }
      
      return data || [];
      
    } catch (error) {
      logger.error('Failed to get templates', { error: getErrorMessage(error) });
      throw error;
    }
  }
  
  /**
   * Train models with user corrections for continuous learning
   */
  async submitUserCorrection(
    jobId: string,
    correctFormat: FileFormat,
    correctCarrier: CarrierType,
    correctFieldMappings: Record<string, string>
  ): Promise<void> {
    try {
      // Store correction for model retraining
      const { error } = await this.supabase
        .from('ml_corrections')
        .insert({
          job_id: jobId,
          correct_format: correctFormat,
          correct_carrier: correctCarrier,
          correct_field_mappings: correctFieldMappings,
          created_at: new Date().toISOString()
        });
      
      if (error) {
        throw new Error(`Failed to store correction: ${error.message}`);
      }
      
      // Trigger model retraining if we have enough corrections
      await this.checkAndTriggerRetraining();
      
      logger.info('User correction submitted', {
        jobId,
        correctFormat,
        correctCarrier
      });
      
    } catch (error) {
      logger.error('Failed to submit correction', {
        jobId,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }
  
  /**
   * Get classification accuracy metrics
   */
  async getAccuracyMetrics(): Promise<{
    overall: number;
    byFormat: Record<string, number>;
    byCarrier: Record<string, number>;
    recentTrend: Array<{ date: string; accuracy: number }>;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('layout_classifications')
        .select('format, carrier, confidence, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .order('created_at', { ascending: false });
      
      if (error) {
        throw new Error(`Failed to fetch metrics: ${error.message}`);
      }
      
      if (!data || data.length === 0) {
        return {
          overall: 0,
          byFormat: {},
          byCarrier: {},
          recentTrend: []
        };
      }
      
      // Calculate metrics
      const overall = data.reduce((sum: number, item: any) => sum + (item.confidence?.overall || 0), 0) / data.length;
      
      const byFormat: Record<string, number> = {};
      const byCarrier: Record<string, number> = {};
      
      for (const format of ['pdf', 'csv', 'txt', 'json']) {
        const formatData = data.filter((item: any) => item.format === format);
        if (formatData.length > 0) {
          byFormat[format] = formatData.reduce((sum: number, item: any) => sum + (item.confidence?.overall || 0), 0) / formatData.length;
        }
      }
      
      for (const carrier of ['att', 'verizon', 'tmobile', 'sprint']) {
        const carrierData = data.filter((item: any) => item.carrier === carrier);
        if (carrierData.length > 0) {
          byCarrier[carrier] = carrierData.reduce((sum: number, item: any) => sum + (item.confidence?.overall || 0), 0) / carrierData.length;
        }
      }
      
      // Calculate weekly trend
      const recentTrend: Array<{ date: string; accuracy: number }> = [];
      const now = new Date();
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        
        const weekData = data.filter((item: any) => {
          const itemDate = new Date(item.created_at);
          return itemDate >= weekStart && itemDate < weekEnd;
        });
        
        if (weekData.length > 0) {
          const weekAccuracy = weekData.reduce((sum: number, item: any) => sum + (item.confidence?.overall || 0), 0) / weekData.length;
          recentTrend.unshift({
            date: weekStart.toISOString().split('T')[0],
            accuracy: weekAccuracy
          });
        }
      }
      
      return {
        overall,
        byFormat,
        byCarrier,
        recentTrend
      };
      
    } catch (error) {
      logger.error('Failed to get accuracy metrics', { error: getErrorMessage(error) });
      throw error;
    }
  }
  
  // Private helper methods
  
  private async sendToMLWorker(request: ClassificationRequest): Promise<MLWorkerResponse> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ML worker timeout'));
      }, this.timeout);
      
      try {
        // Send request to Python worker via Redis
        const workerRequest = {
          jobId: request.jobId,
          filename: request.filename,
          fileContent: request.fileContent,
          fileSize: request.fileSize,
          timestamp: Date.now()
        };
        
        // Subscribe to response channel
        const responseChannel = `ml_response_${request.jobId}`;
        await this.redisClient.subscribe(responseChannel, (message: string) => {
          clearTimeout(timeout);
          try {
            const response = JSON.parse(message) as MLWorkerResponse;
            resolve(response);
          } catch (error) {
            reject(new Error(`Invalid worker response: ${getErrorMessage(error)}`));
          }
        });
        
        // Publish request
        await this.redisClient.publish(this.workerQueue, JSON.stringify(workerRequest));
        
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  private async storeClassificationJob(request: ClassificationRequest): Promise<void> {
    const { error } = await this.supabase
      .from('parser_jobs')
      .insert({
        id: request.jobId,
        filename: request.filename,
        file_size: request.fileSize,
        mime_type: request.mimeType,
        status: 'classifying',
        created_at: new Date().toISOString()
      });
    
    if (error) {
      throw new Error(`Failed to store job: ${error.message}`);
    }
  }
  
  private async storeClassificationResults(classification: LayoutClassificationNew): Promise<void> {
    const { error } = await this.supabase
      .from('layout_classifications')
      .insert({
        job_id: classification.jobId,
        format: classification.format,
        carrier: classification.carrier,
        confidence: classification.confidence,
        field_mappings: classification.fieldMappings,
        template_id: classification.templateId,
        processing_metrics: classification.processingMetrics,
        fallback_required: classification.fallbackRequired,
        created_at: classification.detectedAt.toISOString()
      });
    
    if (error) {
      throw new Error(`Failed to store results: ${error.message}`);
    }
  }
  
  private async storeClassificationError(jobId: string, error: Error): Promise<void> {
    await this.supabase
      .from('parser_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
  
  private mapFileFormat(format: string): FileFormat {
    switch (format) {
      case 'pdf': return 'pdf';
      case 'csv': return 'csv';
      case 'txt': return 'txt';
      case 'json': return 'json';
      default: return 'unknown';
    }
  }
  
  private mapCarrierType(carrier: string): CarrierType {
    switch (carrier) {
      case 'att': return 'att';
      case 'verizon': return 'verizon';
      case 'tmobile': return 'tmobile';
      case 'sprint': return 'sprint';
      default: return 'unknown';
    }
  }
  
  private async checkAndTriggerRetraining(): Promise<void> {
    // Check if we have enough corrections to trigger retraining
    const { count } = await this.supabase
      .from('ml_corrections')
      .select('*', { count: 'exact' })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days
    
    if (count && count >= 100) {
      // Trigger retraining via worker queue
      await this.redisClient.publish('ml_retrain', JSON.stringify({
        timestamp: Date.now(),
        corrections_count: count
      }));
      
      logger.info('Triggered ML model retraining', { corrections_count: count });
    }
  }
}

// Export singleton instance
export const mlClassificationService = new MLClassificationService();