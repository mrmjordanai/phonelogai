// Core Anonymization Engine for Call/SMS Intelligence Platform
// Provides configurable anonymization strategies with privacy compliance

import type { Database, Event, Contact, AuditLogInsert } from '../types'
import { supabase, supabaseAdmin } from '../client'
import crypto from 'crypto'

// Anonymization strategy types
export type AnonymizationTechnique = 
  | 'masking' 
  | 'tokenization' 
  | 'generalization' 
  | 'suppression'
  | 'perturbation'
  | 'k_anonymity'
  | 'differential_privacy'

export interface AnonymizationStrategy {
  technique: AnonymizationTechnique
  field: string
  config: Record<string, any>
  reversible: boolean
  strength: 'low' | 'medium' | 'high'
}

export interface AnonymizationJob {
  id: string
  userId: string
  strategies: AnonymizationStrategy[]
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  totalRecords: number
  processedRecords: number
  errorCount: number
  startedAt?: Date
  completedAt?: Date
  errors: string[]
  metadata: Record<string, any>
}

export interface AnonymizationResult {
  jobId: string
  originalValue: any
  anonymizedValue: any
  technique: AnonymizationTechnique
  reversible: boolean
  token?: string
  qualityScore: number
  metadata: Record<string, any>
}

export interface AnonymizationConfig {
  // Global settings
  defaultStrength: 'low' | 'medium' | 'high'
  enableReversibility: boolean
  auditLogging: boolean
  
  // Performance settings
  batchSize: number
  maxConcurrency: number
  timeoutMs: number
  
  // Quality settings
  minQualityScore: number
  validateResults: boolean
  
  // Compliance settings
  gdprCompliant: boolean
  ccpaCompliant: boolean
  retainTokens: boolean
}

export class AnonymizationEngine {
  private config: AnonymizationConfig
  private activeJobs = new Map<string, AnonymizationJob>()
  private tokenMap = new Map<string, string>()
  private keyCache = new Map<string, Buffer>()

  constructor(config: Partial<AnonymizationConfig> = {}) {
    this.config = {
      defaultStrength: 'medium',
      enableReversibility: true,
      auditLogging: true,
      batchSize: 1000,
      maxConcurrency: 4,
      timeoutMs: 300000, // 5 minutes
      minQualityScore: 0.7,
      validateResults: true,
      gdprCompliant: true,
      ccpaCompliant: true,
      retainTokens: true,
      ...config
    }
  }

  /**
   * Execute anonymization job with specified strategies
   */
  async anonymizeData(
    userId: string,
    strategies: AnonymizationStrategy[],
    dataSet: any[],
    jobMetadata: Record<string, any> = {}
  ): Promise<AnonymizationJob> {
    const jobId = crypto.randomUUID()
    
    const job: AnonymizationJob = {
      id: jobId,
      userId,
      strategies,
      status: 'pending',
      progress: 0,
      totalRecords: dataSet.length,
      processedRecords: 0,
      errorCount: 0,
      startedAt: new Date(),
      errors: [],
      metadata: jobMetadata
    }

    this.activeJobs.set(jobId, job)

    try {
      // Audit log job start
      if (this.config.auditLogging) {
        await this.logAuditEvent(userId, 'anonymization.job.started', 'anonymization_job', jobId, {
          strategies: strategies.map(s => ({ technique: s.technique, field: s.field })),
          totalRecords: dataSet.length
        })
      }

      job.status = 'processing'
      
      // Process data in batches
      const results: AnonymizationResult[] = []
      const batches = this.createBatches(dataSet, this.config.batchSize)
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        const batchResults = await this.processBatch(job, batch, strategies)
        results.push(...batchResults)
        
        job.processedRecords += batch.length
        job.progress = Math.round((job.processedRecords / job.totalRecords) * 100)
        
        // Update job status
        this.activeJobs.set(jobId, { ...job })
        
        // Check for cancellation or timeout
        if (job.startedAt && Date.now() - job.startedAt.getTime() > this.config.timeoutMs) {
          throw new Error('Anonymization job timed out')
        }
      }

      job.status = 'completed'
      job.completedAt = new Date()
      job.progress = 100
      
      // Audit log job completion
      if (this.config.auditLogging) {
        await this.logAuditEvent(userId, 'anonymization.job.completed', 'anonymization_job', jobId, {
          processedRecords: job.processedRecords,
          errorCount: job.errorCount,
          duration: job.completedAt.getTime() - job.startedAt!.getTime()
        })
      }

    } catch (error) {
      job.status = 'failed'
      job.completedAt = new Date()
      job.errors.push((error as Error).message)
      
      // Audit log job failure
      if (this.config.auditLogging) {
        await this.logAuditEvent(userId, 'anonymization.job.failed', 'anonymization_job', jobId, {
          error: (error as Error).message,
          processedRecords: job.processedRecords
        })
      }
    }

    this.activeJobs.set(jobId, job)
    return job
  }

  /**
   * Process single batch of records
   */
  private async processBatch(
    job: AnonymizationJob,
    batch: any[],
    strategies: AnonymizationStrategy[]
  ): Promise<AnonymizationResult[]> {
    const results: AnonymizationResult[] = []

    for (const record of batch) {
      try {
        for (const strategy of strategies) {
          const result = await this.applyStrategy(job.id, record, strategy)
          results.push(result)
          
          // Update original record with anonymized value
          if (record[strategy.field] !== undefined) {
            record[strategy.field] = result.anonymizedValue
          }
        }
      } catch (error) {
        job.errorCount++
        job.errors.push(`Record processing error: ${(error as Error).message}`)
      }
    }

    return results
  }

  /**
   * Apply anonymization strategy to single field
   */
  private async applyStrategy(
    jobId: string,
    record: any,
    strategy: AnonymizationStrategy
  ): Promise<AnonymizationResult> {
    const originalValue = record[strategy.field]
    
    if (originalValue === null || originalValue === undefined) {
      return {
        jobId,
        originalValue,
        anonymizedValue: originalValue,
        technique: strategy.technique,
        reversible: false,
        qualityScore: 1.0,
        metadata: { reason: 'null_value' }
      }
    }

    let anonymizedValue: any
    let token: string | undefined
    let qualityScore = 1.0

    switch (strategy.technique) {
      case 'masking':
        anonymizedValue = this.applyMasking(originalValue, strategy.config)
        qualityScore = this.calculateMaskingQuality(originalValue, anonymizedValue)
        break

      case 'tokenization':
        const tokenResult = await this.applyTokenization(originalValue, strategy.config)
        anonymizedValue = tokenResult.token
        token = tokenResult.token
        qualityScore = 1.0 // Tokenization preserves full utility for authorized users
        break

      case 'generalization':
        anonymizedValue = this.applyGeneralization(originalValue, strategy.config)
        qualityScore = this.calculateGeneralizationQuality(originalValue, anonymizedValue, strategy.config)
        break

      case 'suppression':
        anonymizedValue = this.applySuppression(originalValue, strategy.config)
        qualityScore = 0.0 // Suppression removes all utility
        break

      case 'perturbation':
        anonymizedValue = this.applyPerturbation(originalValue, strategy.config)
        qualityScore = this.calculatePerturbationQuality(originalValue, anonymizedValue, strategy.config)
        break

      case 'k_anonymity':
        anonymizedValue = await this.applyKAnonymity(originalValue, strategy.config, record)
        qualityScore = this.calculateKAnonymityQuality(strategy.config)
        break

      case 'differential_privacy':
        anonymizedValue = this.applyDifferentialPrivacy(originalValue, strategy.config)
        qualityScore = this.calculateDifferentialPrivacyQuality(strategy.config)
        break

      default:
        throw new Error(`Unsupported anonymization technique: ${strategy.technique}`)
    }

    return {
      jobId,
      originalValue,
      anonymizedValue,
      technique: strategy.technique,
      reversible: strategy.reversible && !!token,
      token,
      qualityScore,
      metadata: {
        field: strategy.field,
        config: strategy.config,
        strength: strategy.strength
      }
    }
  }

  /**
   * Apply masking anonymization
   */
  private applyMasking(value: any, config: Record<string, any>): any {
    if (typeof value !== 'string') return value

    const {
      maskChar = '*',
      preserveStart = 3,
      preserveEnd = 4,
      preserveFormat = true
    } = config

    if (value.length <= preserveStart + preserveEnd) {
      // For short values, mask middle portion
      const start = value.substring(0, Math.floor(value.length / 3))
      const end = value.substring(Math.ceil(value.length * 2 / 3))
      const middle = maskChar.repeat(value.length - start.length - end.length)
      return start + middle + end
    }

    const start = value.substring(0, preserveStart)
    const end = value.substring(value.length - preserveEnd)
    const middleLength = value.length - preserveStart - preserveEnd
    
    let middle = maskChar.repeat(middleLength)
    
    // Preserve format characters if requested
    if (preserveFormat) {
      const originalMiddle = value.substring(preserveStart, value.length - preserveEnd)
      middle = originalMiddle.replace(/[a-zA-Z0-9]/g, maskChar)
    }

    return start + middle + end
  }

  /**
   * Apply tokenization anonymization
   */
  private async applyTokenization(
    value: any,
    config: Record<string, any>
  ): Promise<{ token: string; reversible: boolean }> {
    const { consistent = true, format = 'uuid', keyId = 'default' } = config
    
    // Check for existing token if consistency is required
    if (consistent) {
      const existingToken = this.tokenMap.get(String(value))
      if (existingToken) {
        return { token: existingToken, reversible: true }
      }
    }

    let token: string
    
    switch (format) {
      case 'uuid':
        token = crypto.randomUUID()
        break
      case 'hash':
        token = crypto.createHash('sha256').update(String(value)).digest('hex').substring(0, 16)
        break
      case 'encrypted':
        const key = await this.getEncryptionKey(keyId)
        const cipher = crypto.createCipher('aes-256-gcm', key)
        token = cipher.update(String(value), 'utf8', 'hex') + cipher.final('hex')
        break
      default:
        token = crypto.randomUUID()
    }

    // Store mapping for consistency and reversibility
    if (consistent || format === 'encrypted') {
      this.tokenMap.set(String(value), token)
    }

    return { token, reversible: format === 'encrypted' }
  }

  /**
   * Apply generalization anonymization
   */
  private applyGeneralization(value: any, config: Record<string, any>): any {
    const { type, level = 1 } = config

    switch (type) {
      case 'numeric_range':
        if (typeof value === 'number') {
          const rangeSize = Math.pow(10, level)
          return Math.floor(value / rangeSize) * rangeSize + '-' + (Math.floor(value / rangeSize) + 1) * rangeSize
        }
        break

      case 'temporal':
        if (value instanceof Date || typeof value === 'string') {
          const date = new Date(value)
          switch (level) {
            case 1: // Hour precision
              return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours())
            case 2: // Day precision
              return new Date(date.getFullYear(), date.getMonth(), date.getDate())
            case 3: // Month precision
              return new Date(date.getFullYear(), date.getMonth())
            case 4: // Year precision
              return new Date(date.getFullYear(), 0)
          }
        }
        break

      case 'location':
        if (typeof value === 'string') {
          // Simple location generalization (city level)
          const parts = value.split(',').map(p => p.trim())
          return parts.length > level ? parts.slice(-level).join(', ') : value
        }
        break
    }

    return value
  }

  /**
   * Apply suppression anonymization
   */
  private applySuppression(value: any, config: Record<string, any>): any {
    const { replacement = '[REDACTED]', condition = 'always' } = config

    switch (condition) {
      case 'always':
        return replacement
      case 'length':
        const minLength = config.minLength || 0
        return String(value).length >= minLength ? replacement : value
      case 'pattern':
        const pattern = new RegExp(config.pattern || '.*')
        return pattern.test(String(value)) ? replacement : value
      default:
        return replacement
    }
  }

  /**
   * Apply perturbation anonymization
   */
  private applyPerturbation(value: any, config: Record<string, any>): any {
    if (typeof value !== 'number') return value

    const { 
      method = 'gaussian', 
      epsilon = 1.0, 
      sensitivity = 1.0,
      noiseScale = 0.1 
    } = config

    switch (method) {
      case 'gaussian':
        const noise = this.generateGaussianNoise(0, noiseScale * Math.abs(value))
        return value + noise

      case 'laplacian':
        const scale = sensitivity / epsilon
        const laplaceNoise = this.generateLaplaceNoise(scale)
        return value + laplaceNoise

      case 'uniform':
        const range = Math.abs(value) * noiseScale
        const uniformNoise = (Math.random() - 0.5) * 2 * range
        return value + uniformNoise

      default:
        return value
    }
  }

  /**
   * Apply k-anonymity anonymization
   */
  private async applyKAnonymity(
    value: any,
    config: Record<string, any>,
    record: any
  ): Promise<any> {
    const { k = 5, quasiIdentifiers = [] } = config
    
    // This is a simplified implementation
    // In practice, k-anonymity requires analyzing the entire dataset
    // to ensure groups of at least k records share the same quasi-identifier values
    
    // For now, apply generalization based on the k value
    const generalizationLevel = Math.ceil(Math.log10(k))
    return this.applyGeneralization(value, {
      type: 'numeric_range',
      level: generalizationLevel
    })
  }

  /**
   * Apply differential privacy anonymization
   */
  private applyDifferentialPrivacy(value: any, config: Record<string, any>): any {
    if (typeof value !== 'number') return value

    const { epsilon = 1.0, sensitivity = 1.0, mechanism = 'laplacian' } = config

    switch (mechanism) {
      case 'laplacian':
        const scale = sensitivity / epsilon
        const noise = this.generateLaplaceNoise(scale)
        return value + noise

      case 'exponential':
        // Exponential mechanism for non-numeric outputs
        // This is a simplified implementation
        return value

      default:
        return value
    }
  }

  /**
   * Generate Gaussian noise
   */
  private generateGaussianNoise(mean: number, stdDev: number): number {
    // Box-Muller transform
    const u1 = Math.random()
    const u2 = Math.random()
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return mean + stdDev * z0
  }

  /**
   * Generate Laplace noise
   */
  private generateLaplaceNoise(scale: number): number {
    const u = Math.random() - 0.5
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u))
  }

  /**
   * Quality assessment methods
   */
  private calculateMaskingQuality(original: any, masked: any): number {
    if (typeof original !== 'string' || typeof masked !== 'string') return 1.0
    
    // Quality based on preserved characters ratio
    const preservedChars = masked.split('').filter(c => c !== '*').length
    return preservedChars / original.length
  }

  private calculateGeneralizationQuality(original: any, generalized: any, config: Record<string, any>): number {
    // Quality inversely related to generalization level
    const level = config.level || 1
    return Math.max(0, 1 - (level * 0.2))
  }

  private calculatePerturbationQuality(original: number, perturbed: number, config: Record<string, any>): number {
    if (original === 0) return perturbed === 0 ? 1.0 : 0.5
    
    const relativeDifference = Math.abs(perturbed - original) / Math.abs(original)
    return Math.max(0, 1 - relativeDifference)
  }

  private calculateKAnonymityQuality(config: Record<string, any>): number {
    const k = config.k || 5
    // Higher k values provide more privacy but lower utility
    return Math.max(0.1, 1 - (k * 0.1))
  }

  private calculateDifferentialPrivacyQuality(config: Record<string, any>): number {
    const epsilon = config.epsilon || 1.0
    // Lower epsilon provides more privacy but lower utility
    return Math.max(0.1, Math.min(1.0, epsilon))
  }

  /**
   * Utility methods
   */
  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize))
    }
    return batches
  }

  private async getEncryptionKey(keyId: string): Promise<Buffer> {
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId)!
    }

    // In production, this should retrieve keys from a secure key management service
    const key = crypto.randomBytes(32)
    this.keyCache.set(keyId, key)
    return key
  }

  private async logAuditEvent(
    actorId: string,
    action: string,
    resource: string,
    resourceId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const auditLog: AuditLogInsert = {
        actor_id: actorId,
        action,
        resource,
        resource_id: resourceId,
        metadata,
        ts: new Date().toISOString()
      }

      await supabaseAdmin.from('audit_log').insert(auditLog)
    } catch (error) {
      console.error('Failed to log audit event:', error)
    }
  }

  /**
   * Public API methods
   */
  
  /**
   * Get job status
   */
  getJobStatus(jobId: string): AnonymizationJob | null {
    return this.activeJobs.get(jobId) || null
  }

  /**
   * Cancel running job
   */
  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId)
    if (!job || job.userId !== userId) {
      return false
    }

    if (job.status === 'processing') {
      job.status = 'failed'
      job.completedAt = new Date()
      job.errors.push('Job cancelled by user')
      
      if (this.config.auditLogging) {
        await this.logAuditEvent(userId, 'anonymization.job.cancelled', 'anonymization_job', jobId, {
          processedRecords: job.processedRecords
        })
      }
    }

    return true
  }

  /**
   * Get all jobs for user
   */
  getUserJobs(userId: string): AnonymizationJob[] {
    return Array.from(this.activeJobs.values()).filter(job => job.userId === userId)
  }

  /**
   * Clean up completed jobs
   */
  cleanupJobs(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge)
    
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.completedAt && job.completedAt < cutoff) {
        this.activeJobs.delete(jobId)
      }
    }
  }
}

// Export singleton instance
export const anonymizationEngine = new AnonymizationEngine()