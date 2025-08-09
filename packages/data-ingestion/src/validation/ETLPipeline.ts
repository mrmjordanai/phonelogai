import { Event, Contact } from '@phonelogai/types';
import { randomUUID } from 'crypto';
import {
  ValidationResult,
  FieldMapping,
  ProcessingMetrics,
  ExtractionResult,
  IngestionError,
  ErrorType
} from '../types/index.js';

import SchemaValidator from './SchemaValidator.js';
import DataNormalizer from './DataNormalizer.js';
import DeduplicationEngine from './DeduplicationEngine.js';

/**
 * Main ETL Pipeline coordinator that orchestrates validation, normalization,
 * and deduplication processes for the data ingestion system
 */
export class ETLPipeline {
  private schemaValidator: SchemaValidator;
  private dataNormalizer: DataNormalizer;
  private deduplicationEngine: DeduplicationEngine;
  private processingConfig: {
    batchSize: number;
    maxErrors: number;
    skipValidation: boolean;
    deduplicationEnabled: boolean;
    gapDetectionEnabled: boolean;
    similarityThreshold: number;
    conflictResolution: 'keep_first' | 'keep_last' | 'merge' | 'manual';
    timezone: string;
  };

  constructor(config: Partial<ETLPipeline['processingConfig']> = {}) {
    this.processingConfig = {
      batchSize: 1000,
      maxErrors: 100,
      skipValidation: false,
      deduplicationEnabled: true,
      gapDetectionEnabled: true,
      similarityThreshold: 0.85,
      conflictResolution: 'merge',
      timezone: 'America/New_York',
      ...config
    };

    this.schemaValidator = new SchemaValidator();
    this.dataNormalizer = new DataNormalizer(this.processingConfig.timezone);
    this.deduplicationEngine = new DeduplicationEngine(
      this.processingConfig.similarityThreshold,
      this.processingConfig.conflictResolution
    );
  }

  /**
   * Process events through the complete ETL pipeline
   */
  async processEvents(
    rawEvents: Record<string, any>[],
    fieldMappings: FieldMapping[],
    options: {
      userId: string;
      jobId: string;
      carrierType?: string;
      progressCallback?: (progress: number, step: string) => void;
    }
  ): Promise<{
    processedEvents: Partial<Event>[];
    extractedContacts: Partial<Contact>[];
    metrics: ProcessingMetrics & {
      validation: {
        totalRecords: number;
        validRecords: number;
        invalidRecords: number;
        errorRate: number;
        warningCount: number;
      };
      normalization: {
        phoneNumbers: { normalized: number; errors: number };
        timestamps: { normalized: number; errors: number };
        durations: { normalized: number; errors: number };
      };
      deduplication: {
        duplicatesFound: number;
        duplicatesRemoved: number;
        conflictsResolved: number;
        finalUniqueCount: number;
      };
      gapAnalysis?: {
        totalGaps: number;
        suspiciousGaps: number;
        dataQualityScore: number;
      };
    };
    errors: IngestionError[];
    warnings: string[];
  }> {
    const startTime = Date.now();
    const errors: IngestionError[] = [];
    const warnings: string[] = [];
    let processedRecords = 0;

    options.progressCallback?.(0, 'Starting ETL pipeline');

    try {
      // Step 1: Data Normalization
      options.progressCallback?.(10, 'Normalizing data');
      const { normalizedEvents, normalizationMetrics, normalizationErrors } = 
        await this.normalizeEvents(rawEvents, fieldMappings);
      
      errors.push(...normalizationErrors.map(err => this.createIngestionError(
        options.jobId, err.index, 'validation_error', err.message, rawEvents[err.index]
      )));

      // Step 2: Schema Validation (if enabled)
      let validatedEvents = normalizedEvents;
      let validationMetrics = {
        totalRecords: normalizedEvents.length,
        validRecords: normalizedEvents.length,
        invalidRecords: 0,
        errorRate: 0,
        warningCount: 0
      };

      if (!this.processingConfig.skipValidation) {
        options.progressCallback?.(30, 'Validating schemas');
        const validationResult = await this.validateEvents(normalizedEvents, fieldMappings);
        validatedEvents = validationResult.validEvents;
        validationMetrics = validationResult.metrics;
        
        errors.push(...validationResult.errors.map(err => this.createIngestionError(
          options.jobId, err.index, 'validation_error', err.message, rawEvents[err.index]
        )));
        warnings.push(...validationResult.warnings);
      }

      // Step 3: Contact Extraction
      options.progressCallback?.(50, 'Extracting contacts');
      const extractedContacts = this.extractContactsFromEvents(validatedEvents, options.userId);

      // Step 4: Deduplication (if enabled)
      let finalEvents = validatedEvents;
      let finalContacts = extractedContacts;
      let deduplicationMetrics = {
        duplicatesFound: 0,
        duplicatesRemoved: 0,
        conflictsResolved: 0,
        finalUniqueCount: validatedEvents.length
      };

      if (this.processingConfig.deduplicationEnabled) {
        options.progressCallback?.(70, 'Removing duplicates');
        const eventDedup = this.deduplicationEngine.deduplicateEvents(validatedEvents);
        const contactDedup = this.deduplicationEngine.deduplicateContacts(extractedContacts);

        finalEvents = eventDedup.uniqueEvents;
        finalContacts = contactDedup.uniqueContacts;

        deduplicationMetrics = {
          duplicatesFound: eventDedup.metrics.duplicatesRemoved + contactDedup.metrics.duplicatesRemoved,
          duplicatesRemoved: eventDedup.metrics.duplicatesRemoved + contactDedup.metrics.duplicatesRemoved,
          conflictsResolved: eventDedup.metrics.conflictsCount + contactDedup.metrics.conflictsCount,
          finalUniqueCount: finalEvents.length
        };
      }

      // Step 5: Gap Analysis (if enabled)
      let gapAnalysis: any = undefined;
      if (this.processingConfig.gapDetectionEnabled) {
        options.progressCallback?.(85, 'Analyzing data gaps');
        const gapResult = this.deduplicationEngine.detectDataGaps(finalEvents);
        gapAnalysis = gapResult.analysis;

        if (gapResult.gaps.length > 0) {
          warnings.push(`Found ${gapResult.gaps.length} potential data gaps. Quality score: ${gapResult.analysis.dataQualityScore.toFixed(1)}/100`);
        }
      }

      // Step 6: Final Processing
      options.progressCallback?.(95, 'Finalizing results');
      
      // Add user_id to all events and contacts
      finalEvents.forEach(event => {
        event.user_id = options.userId;
        event.created_at = event.created_at || new Date().toISOString();
        event.updated_at = new Date().toISOString();
      });

      finalContacts.forEach(contact => {
        contact.user_id = options.userId;
        contact.created_at = contact.created_at || new Date().toISOString();
        contact.updated_at = new Date().toISOString();
      });

      const processingTime = Date.now() - startTime;
      processedRecords = finalEvents.length;

      options.progressCallback?.(100, 'ETL pipeline completed');

      return {
        processedEvents: finalEvents,
        extractedContacts: finalContacts,
        metrics: {
          job_id: options.jobId,
          file_size_mb: 0, // Will be set by caller
          processing_time_ms: processingTime,
          rows_per_second: processingTime > 0 ? (processedRecords * 1000) / processingTime : 0,
          memory_usage_mb: process.memoryUsage().heapUsed / 1024 / 1024,
          cpu_usage_percent: 0, // Would need system monitoring
          errors_per_1000_rows: processedRecords > 0 ? (errors.length / processedRecords) * 1000 : 0,
          quality_score: this.calculateQualityScore(validationMetrics, deduplicationMetrics, gapAnalysis),
          validation: validationMetrics,
          normalization: normalizationMetrics,
          deduplication: deduplicationMetrics,
          gapAnalysis
        },
        errors,
        warnings
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      errors.push(this.createIngestionError(
        options.jobId,
        undefined,
        'system_error',
        `ETL pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { stage: 'pipeline_execution' }
      ));

      return {
        processedEvents: [],
        extractedContacts: [],
        metrics: {
          job_id: options.jobId,
          file_size_mb: 0,
          processing_time_ms: processingTime,
          rows_per_second: 0,
          memory_usage_mb: process.memoryUsage().heapUsed / 1024 / 1024,
          cpu_usage_percent: 0,
          errors_per_1000_rows: 0,
          quality_score: 0,
          validation: { totalRecords: 0, validRecords: 0, invalidRecords: 0, errorRate: 100, warningCount: 0 },
          normalization: { phoneNumbers: { normalized: 0, errors: 0 }, timestamps: { normalized: 0, errors: 0 }, durations: { normalized: 0, errors: 0 } },
          deduplication: { duplicatesFound: 0, duplicatesRemoved: 0, conflictsResolved: 0, finalUniqueCount: 0 }
        },
        errors,
        warnings
      };
    }
  }

  /**
   * Normalize events data
   */
  private async normalizeEvents(
    rawEvents: Record<string, any>[],
    fieldMappings: FieldMapping[]
  ): Promise<{
    normalizedEvents: Partial<Event>[];
    normalizationMetrics: {
      phoneNumbers: { normalized: number; errors: number };
      timestamps: { normalized: number; errors: number };
      durations: { normalized: number; errors: number };
    };
    normalizationErrors: Array<{ index: number; field: string; message: string }>;
  }> {
    const normalizedEvents: Partial<Event>[] = [];
    const normalizationErrors: Array<{ index: number; field: string; message: string }> = [];
    const metrics = {
      phoneNumbers: { normalized: 0, errors: 0 },
      timestamps: { normalized: 0, errors: 0 },
      durations: { normalized: 0, errors: 0 }
    };

    for (let i = 0; i < rawEvents.length; i++) {
      const rawEvent = rawEvents[i];
      const normalizedEvent: Partial<Event> = {};

      // Apply field mappings and normalization
      for (const mapping of fieldMappings) {
        const sourceValue = rawEvent[mapping.source_field];
        
        if (sourceValue === null || sourceValue === undefined) {
          if (mapping.is_required) {
            normalizedEvent[mapping.target_field as keyof Event] = null as any;
          }
          continue;
        }

        try {
          // Apply normalization based on target field type
          switch (mapping.target_field) {
            case 'number':
              const phoneResult = this.dataNormalizer.normalizePhoneNumber(sourceValue);
              if (phoneResult.isValid && phoneResult.normalized) {
                normalizedEvent.number = phoneResult.normalized;
                metrics.phoneNumbers.normalized++;
              } else {
                metrics.phoneNumbers.errors++;
                normalizationErrors.push({
                  index: i,
                  field: 'number',
                  message: phoneResult.error || 'Phone number normalization failed'
                });
              }
              break;

            case 'ts':
              const timestampResult = this.dataNormalizer.normalizeTimestamp(sourceValue);
              if (timestampResult.isValid && timestampResult.normalized) {
                normalizedEvent.ts = timestampResult.normalized;
                metrics.timestamps.normalized++;
              } else {
                metrics.timestamps.errors++;
                normalizationErrors.push({
                  index: i,
                  field: 'ts',
                  message: timestampResult.error || 'Timestamp normalization failed'
                });
              }
              break;

            case 'duration':
              const durationResult = this.dataNormalizer.normalizeDuration(sourceValue);
              if (durationResult.isValid) {
                normalizedEvent.duration = durationResult.seconds;
                metrics.durations.normalized++;
              } else {
                metrics.durations.errors++;
                normalizationErrors.push({
                  index: i,
                  field: 'duration',
                  message: durationResult.error || 'Duration normalization failed'
                });
              }
              break;

            default:
              // For other fields, apply basic type normalization
              const typeResult = this.dataNormalizer.normalizeDataType(
                sourceValue,
                mapping.data_type as any,
                { trim: true }
              );
              
              if (typeResult.isValid) {
                (normalizedEvent as any)[mapping.target_field] = typeResult.normalized;
              } else {
                normalizationErrors.push({
                  index: i,
                  field: mapping.target_field,
                  message: typeResult.error || 'Data type normalization failed'
                });
              }
          }
        } catch (error) {
          normalizationErrors.push({
            index: i,
            field: mapping.target_field,
            message: `Normalization error: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }

      normalizedEvents.push(normalizedEvent);
    }

    return {
      normalizedEvents,
      normalizationMetrics: metrics,
      normalizationErrors
    };
  }

  /**
   * Validate events against schema
   */
  private async validateEvents(
    events: Partial<Event>[],
    fieldMappings: FieldMapping[]
  ): Promise<{
    validEvents: Partial<Event>[];
    metrics: {
      totalRecords: number;
      validRecords: number;
      invalidRecords: number;
      errorRate: number;
      warningCount: number;
    };
    errors: Array<{ index: number; field: string; message: string }>;
    warnings: string[];
  }> {
    const validEvents: Partial<Event>[] = [];
    const errors: Array<{ index: number; field: string; message: string }> = [];
    const warnings: string[] = [];

    // Process events in batches
    const batchSize = this.processingConfig.batchSize;
    let totalWarnings = 0;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const batchRecords = batch.map((event, index) => ({ ...event, _originalIndex: i + index }));
      
      const validationResult = this.schemaValidator.validateBatch(
        batchRecords,
        'event',
        fieldMappings
      );

      // Process valid records
      validEvents.push(...validationResult.validRecords.map(record => {
        const { _originalIndex, ...cleanRecord } = record;
        return cleanRecord;
      }));

      // Process invalid records
      for (const invalid of validationResult.invalidRecords) {
        const originalIndex = (invalid.record as any)._originalIndex;
        
        for (const error of invalid.validation.errors) {
          errors.push({
            index: originalIndex,
            field: error.field,
            message: error.message
          });
        }
        
        totalWarnings += invalid.validation.warnings.length;
      }

      // Stop processing if too many errors
      if (errors.length >= this.processingConfig.maxErrors) {
        warnings.push(`Processing stopped: exceeded maximum error threshold (${this.processingConfig.maxErrors})`);
        break;
      }
    }

    return {
      validEvents,
      metrics: {
        totalRecords: events.length,
        validRecords: validEvents.length,
        invalidRecords: events.length - validEvents.length,
        errorRate: events.length > 0 ? ((events.length - validEvents.length) / events.length) * 100 : 0,
        warningCount: totalWarnings
      },
      errors,
      warnings
    };
  }

  /**
   * Extract contacts from events
   */
  private extractContactsFromEvents(events: Partial<Event>[], userId: string): Partial<Contact>[] {
    const contactMap = new Map<string, Partial<Contact>>();

    for (const event of events) {
      if (!event.number) continue;

      const key = event.number;
      
      if (!contactMap.has(key)) {
        contactMap.set(key, {
          user_id: userId,
          number: event.number,
          tags: [],
          first_seen: event.ts || new Date().toISOString(),
          last_seen: event.ts || new Date().toISOString(),
          total_calls: 0,
          total_sms: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      const contact = contactMap.get(key)!;
      
      // Update call/SMS counts based on event type
      if (event.type === 'call') {
        contact.total_calls = (contact.total_calls || 0) + 1;
      } else if (event.type === 'sms') {
        contact.total_sms = (contact.total_sms || 0) + 1;
      }

      // Update last seen timestamp if this event is more recent
      if (event.ts && (!contact.last_seen || new Date(event.ts) > new Date(contact.last_seen))) {
        contact.last_seen = event.ts;
        contact.updated_at = new Date().toISOString();
      }
    }

    return Array.from(contactMap.values());
  }

  /**
   * Create standardized ingestion error
   */
  private createIngestionError(
    jobId: string,
    rowNumber: number | undefined,
    errorType: ErrorType,
    message: string,
    rawData?: any
  ): IngestionError {
    return {
      id: randomUUID(),
      job_id: jobId,
      row_number: rowNumber,
      error_type: errorType,
      error_message: message,
      raw_data: rawData,
      severity: this.getErrorSeverity(errorType),
      created_at: new Date().toISOString()
    };
  }

  /**
   * Get error severity based on type
   */
  private getErrorSeverity(errorType: ErrorType): 'warning' | 'error' | 'critical' {
    const severityMap: Record<ErrorType, 'warning' | 'error' | 'critical'> = {
      'file_format_error': 'critical',
      'parsing_error': 'error',
      'validation_error': 'error',
      'database_error': 'critical',
      'system_error': 'critical',
      'duplicate_data': 'warning',
      'missing_required_field': 'error',
      'invalid_data_type': 'error',
      'constraint_violation': 'error'
    };

    return severityMap[errorType] || 'error';
  }

  /**
   * Calculate overall data quality score
   */
  private calculateQualityScore(
    validationMetrics: any,
    deduplicationMetrics: any,
    gapAnalysis: any
  ): number {
    let score = 100;

    // Deduct for validation errors
    score -= validationMetrics.errorRate * 0.5;

    // Deduct for high duplication rate
    if (deduplicationMetrics.duplicatesRemoved > 0) {
      const dupRate = (deduplicationMetrics.duplicatesRemoved / deduplicationMetrics.finalUniqueCount) * 100;
      score -= Math.min(dupRate * 0.3, 20); // Max 20 point deduction
    }

    // Deduct for data gaps
    if (gapAnalysis) {
      score = Math.min(score, gapAnalysis.dataQualityScore);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Update processing configuration
   */
  updateConfig(newConfig: Partial<ETLPipeline['processingConfig']>): void {
    this.processingConfig = { ...this.processingConfig, ...newConfig };
    
    // Update dependent services
    this.dataNormalizer = new DataNormalizer(this.processingConfig.timezone);
    this.deduplicationEngine = new DeduplicationEngine(
      this.processingConfig.similarityThreshold,
      this.processingConfig.conflictResolution
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): ETLPipeline['processingConfig'] {
    return { ...this.processingConfig };
  }
}

export default ETLPipeline;