/**
 * Python ML Wrapper - Interfaces TypeScript with Python ML Service
 * Handles subprocess communication, error handling, and result parsing
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { z } from 'zod';
import { LayoutClassification, LayoutClassificationNew, FileFormat, CarrierType, MLConfidenceScore } from '../types';
import logger from '../utils/logger';
import { isError, getErrorMessage } from '../utils/errorUtils';

// Validation schemas
const PythonMLRequestSchema = z.object({
  jobId: z.string().uuid(),
  filename: z.string().min(1),
  fileContent: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1)
});

const PythonMLResponseSchema = z.object({
  success: z.boolean(),
  result: z.object({
    format: z.string(),
    carrier: z.string(),
    confidence: z.object({
      format: z.number().min(0).max(1),
      carrier: z.number().min(0).max(1),
      overall: z.number().min(0).max(1)
    }),
    fieldMappings: z.record(z.string(), z.string()),
    templateId: z.string().optional().nullable(),
    processingTime: z.number().positive(),
    metadata: z.record(z.any())
  }).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional()
  }).optional(),
  metrics: z.object({
    processingTime: z.number(),
    memoryUsage: z.number(),
    cpuUsage: z.number().optional()
  })
});

type PythonMLRequest = z.infer<typeof PythonMLRequestSchema>;
type PythonMLResponse = z.infer<typeof PythonMLResponseSchema>;

export interface MLServiceOptions {
  pythonPath?: string;
  timeout?: number;
  maxMemoryMB?: number;
  cacheEnabled?: boolean;
  cacheDirectory?: string;
}

/**
 * Python ML Wrapper Service
 * Manages communication with Python ML classification service
 */
export class PythonMLWrapper {
  private readonly pythonPath: string;
  private readonly scriptPath: string;
  private readonly timeout: number;
  private readonly maxMemoryMB: number;
  private readonly cacheEnabled: boolean;
  private readonly cacheDirectory: string;
  private readonly resultCache: Map<string, { result: LayoutClassification; timestamp: number }>;
  
  constructor(options: MLServiceOptions = {}) {
    this.pythonPath = options.pythonPath || 'python3';
    this.scriptPath = path.join(__dirname, 'PythonMLService.py');
    this.timeout = options.timeout || 60000; // 60 seconds
    this.maxMemoryMB = options.maxMemoryMB || 2048; // 2GB
    this.cacheEnabled = options.cacheEnabled ?? true;
    this.cacheDirectory = options.cacheDirectory || '/tmp/ml_cache';
    this.resultCache = new Map();
    
    // Verify Python script exists
    this.verifyPythonService();
  }
  
  /**
   * Classify document layout using Python ML service
   */
  async classifyLayout(request: PythonMLRequest): Promise<LayoutClassificationNew> {
    const startTime = Date.now();
    
    try {
      // Validate request
      const validatedRequest = PythonMLRequestSchema.parse(request);
      
      logger.info('Starting Python ML classification', {
        jobId: validatedRequest.jobId,
        filename: validatedRequest.filename,
        fileSize: validatedRequest.fileSize
      });
      
      // Check cache first
      const cacheKey = this.generateCacheKey(validatedRequest);
      if (this.cacheEnabled) {
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
          logger.info('Returning cached ML result', { jobId: validatedRequest.jobId });
          return cachedResult;
        }
      }
      
      // Execute Python service
      const pythonResponse = await this.executePythonService(validatedRequest);
      
      // Validate response
      const validatedResponse = PythonMLResponseSchema.parse(pythonResponse);
      
      if (!validatedResponse.success || !validatedResponse.result) {
        throw new Error(`Python ML service failed: ${validatedResponse.error?.message}`);
      }
      
      // Convert to TypeScript format
      const layoutClassification = this.convertToLayoutClassification(
        validatedRequest,
        validatedResponse
      );
      
      // Cache result
      if (this.cacheEnabled) {
        this.cacheResult(cacheKey, layoutClassification);
      }
      
      const processingTime = Date.now() - startTime;
      logger.info('Python ML classification completed', {
        jobId: validatedRequest.jobId,
        format: layoutClassification.format,
        carrier: layoutClassification.carrier,
        confidence: layoutClassification.confidence.overall,
        processingTime
      });
      
      return layoutClassification;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Python ML classification failed', {
        jobId: request.jobId,
        error: getErrorMessage(error),
        processingTime,
        stack: isError(error) ? error.stack : undefined
      });
      
      // Return fallback result with error information
      return {
        jobId: request.jobId,
        format: FileFormat.UNKNOWN,
        carrier: CarrierType.UNKNOWN,
        confidence: {
          format: 0.0,
          carrier: 0.0,
          overall: 0.0
        },
        fieldMappings: {},
        templateId: undefined,
        detectedAt: new Date(),
        processingMetrics: {
          processingTime: Date.now() - startTime,
          memoryUsage: 0,
          accuracy: 0.0
        },
        fallbackRequired: true,
        error: {
          code: 'PYTHON_ML_ERROR',
          message: getErrorMessage(error),
          details: isError(error) ? error.stack : undefined
        }
      };
    }
  }
  
  /**
   * Test Python service availability and health
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string; version?: string }> {
    try {
      const testRequest: PythonMLRequest = {
        jobId: 'test-' + Date.now(),
        filename: 'test.csv',
        fileContent: 'phone,name,date\n555-1234,John,2023-01-01',
        fileSize: 50,
        mimeType: 'text/csv'
      };
      
      const result = await this.executePythonService(testRequest);
      
      return {
        healthy: result.success !== false,
        version: result.result?.metadata?.version || 'unknown'
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: getErrorMessage(error)
      };
    }
  }
  
  /**
   * Clear result cache
   */
  clearCache(): void {
    this.resultCache.clear();
    logger.info('ML result cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.resultCache.size
      // TODO: Track hit rate if needed
    };
  }
  
  // Private methods
  
  private verifyPythonService(): void {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.scriptPath)) {
        throw new Error(`Python ML service not found: ${this.scriptPath}`);
      }
      logger.info('Python ML service verified', { scriptPath: this.scriptPath });
    } catch (error) {
      logger.error('Python ML service verification failed', { error: getErrorMessage(error) });
      throw error;
    }
  }
  
  private async executePythonService(request: PythonMLRequest): Promise<PythonMLResponse> {
    return new Promise((resolve, reject) => {
      const requestJson = JSON.stringify(request);
      let stdout = '';
      let stderr = '';
      
      // Spawn Python process
      const pythonProcess: ChildProcess = spawn(this.pythonPath, [this.scriptPath, requestJson], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeout,
        detached: false
      });
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        pythonProcess.kill('SIGKILL');
        reject(new Error(`Python ML service timeout after ${this.timeout}ms`));
      }, this.timeout);
      
      // Handle stdout
      pythonProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      // Handle stderr
      pythonProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Handle process exit
      pythonProcess.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        
        if (signal === 'SIGKILL') {
          reject(new Error('Python ML service was killed due to timeout'));
          return;
        }
        
        if (code !== 0) {
          reject(new Error(`Python ML service exited with code ${code}: ${stderr}`));
          return;
        }
        
        try {
          const response = JSON.parse(stdout.trim());
          resolve(response);
        } catch (parseError) {
          reject(new Error(`Failed to parse Python ML service response: ${getErrorMessage(parseError)}`));
        }
      });
      
      // Handle process errors
      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Python ML service process error: ${getErrorMessage(error)}`));
      });
      
      // Monitor memory usage (if possible)
      if (pythonProcess.pid) {
        this.monitorProcessMemory(pythonProcess.pid);
      }
    });
  }
  
  private async monitorProcessMemory(pid: number): Promise<void> {
    try {
      // This would require additional monitoring - placeholder for now
      // Could use psutil or similar to monitor Python process memory
      logger.debug('Monitoring Python process memory', { pid });
    } catch (error) {
      // Non-critical error
      logger.debug('Memory monitoring failed', { error: getErrorMessage(error) });
    }
  }
  
  private generateCacheKey(request: PythonMLRequest): string {
    // Generate cache key from file content hash and filename
    const contentHash = createHash('sha256').update(request.fileContent).digest('hex');
    return `${request.filename}-${contentHash.substring(0, 16)}`;
  }
  
  private getCachedResult(cacheKey: string): LayoutClassificationNew | null {
    const cached = this.resultCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    
    // Check if cache is still valid (1 hour TTL)
    const now = Date.now();
    const cacheAge = now - cached.timestamp;
    const cacheMaxAge = 60 * 60 * 1000; // 1 hour
    
    if (cacheAge > cacheMaxAge) {
      this.resultCache.delete(cacheKey);
      return null;
    }
    
    return cached.result;
  }
  
  private cacheResult(cacheKey: string, result: LayoutClassificationNew): void {
    // Only cache successful results with reasonable confidence
    if (result.confidence.overall > 0.5) {
      this.resultCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
      
      // Limit cache size (simple LRU)
      if (this.resultCache.size > 1000) {
        const firstKey = this.resultCache.keys().next().value;
        if (firstKey) {
          this.resultCache.delete(firstKey);
        }
      }
    }
  }
  
  private convertToLayoutClassification(
    request: PythonMLRequest,
    response: PythonMLResponse
  ): LayoutClassificationNew {
    if (!response.result) {
      throw new Error('No result in Python ML response');
    }
    
    const result = response.result;
    
    return {
      jobId: request.jobId,
      format: this.mapFileFormat(result.format),
      carrier: this.mapCarrierType(result.carrier),
      confidence: {
        format: result.confidence.format,
        carrier: result.confidence.carrier,
        overall: result.confidence.overall
      },
      fieldMappings: result.fieldMappings || {},
      templateId: result.templateId || undefined,
      detectedAt: new Date(),
      processingMetrics: {
        processingTime: result.processingTime,
        memoryUsage: response.metrics.memoryUsage,
        accuracy: result.confidence.overall
      },
      fallbackRequired: result.confidence.overall < 0.8
    };
  }
  
  private mapFileFormat(format: string): FileFormat {
    switch (format.toLowerCase()) {
      case 'pdf': return FileFormat.PDF;
      case 'csv': return FileFormat.CSV;
      case 'xlsx': return FileFormat.XLSX;
      case 'xls': return FileFormat.XLS;
      case 'json': return FileFormat.JSON;
      case 'txt': return FileFormat.TXT;
      default: return FileFormat.UNKNOWN;
    }
  }
  
  private mapCarrierType(carrier: string): CarrierType {
    switch (carrier.toLowerCase()) {
      case 'att': return CarrierType.ATT;
      case 'verizon': return CarrierType.VERIZON;
      case 'tmobile': return CarrierType.TMOBILE;
      case 'sprint': return CarrierType.SPRINT;
      default: return CarrierType.UNKNOWN;
    }
  }
}

// Export singleton instance
export const pythonMLWrapper = new PythonMLWrapper({
  timeout: 60000, // 1 minute
  maxMemoryMB: 2048, // 2GB
  cacheEnabled: true
});