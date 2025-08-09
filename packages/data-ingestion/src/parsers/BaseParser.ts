import { EventEmitter } from 'events';
import { 
  ExtractionResult, 
  FieldMapping, 
  ValidationResult, 
  ProcessingConfig,
  IngestionError,
  ErrorType 
} from '../types';
import { Event, Contact } from '@phonelogai/types';
import { jobTracker } from '../workers/JobTracker';

export abstract class BaseParser extends EventEmitter {
  protected jobId: string;
  protected config: ProcessingConfig;
  protected fieldMappings: FieldMapping[];

  constructor(jobId: string, config: ProcessingConfig, fieldMappings: FieldMapping[] = []) {
    super();
    this.jobId = jobId;
    this.config = config;
    this.fieldMappings = fieldMappings;
  }

  /**
   * Abstract method to parse file content
   */
  abstract parseFile(buffer: Buffer): Promise<ExtractionResult>;

  /**
   * Validate parsed data
   */
  protected async validateData(
    events: Partial<Event>[], 
    contacts: Partial<Contact>[]
  ): Promise<ValidationResult> {
    const errors: IngestionError[] = [];
    const warnings: string[] = [];

    // Validate events
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const rowErrors = this.validateEvent(event, i + 1);
      errors.push(...rowErrors);
    }

    // Validate contacts
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const rowErrors = this.validateContact(contact, i + 1);
      errors.push(...rowErrors);
    }

    return {
      is_valid: errors.filter(e => e.severity === 'error').length === 0,
      errors: errors.filter(e => e.severity === 'error').map(e => ({
        field: e.error_type,
        value: e.raw_data,
        rule: { field: e.error_type, type: 'required', error_message: e.error_message },
        message: e.error_message
      })),
      warnings: warnings.map(w => ({
        field: 'general',
        value: null,
        message: w
      }))
    };
  }

  /**
   * Validate individual event
   */
  private validateEvent(event: Partial<Event>, rowNumber: number): IngestionError[] {
    const errors: IngestionError[] = [];

    // Required fields validation
    if (!event.number) {
      errors.push(this.createError('missing_required_field', 'Phone number is required', rowNumber, event));
    }

    if (!event.ts) {
      errors.push(this.createError('missing_required_field', 'Timestamp is required', rowNumber, event));
    }

    if (!event.type) {
      errors.push(this.createError('missing_required_field', 'Event type is required', rowNumber, event));
    }

    if (!event.direction) {
      errors.push(this.createError('missing_required_field', 'Direction is required', rowNumber, event));
    }

    // Format validation
    if (event.number && !this.isValidPhoneNumber(event.number)) {
      errors.push(this.createError('invalid_data_type', 'Invalid phone number format', rowNumber, event));
    }

    if (event.ts && !this.isValidTimestamp(event.ts)) {
      errors.push(this.createError('invalid_data_type', 'Invalid timestamp format', rowNumber, event));
    }

    if (event.type && !['call', 'sms'].includes(event.type)) {
      errors.push(this.createError('invalid_data_type', 'Event type must be "call" or "sms"', rowNumber, event));
    }

    if (event.direction && !['inbound', 'outbound'].includes(event.direction)) {
      errors.push(this.createError('invalid_data_type', 'Direction must be "inbound" or "outbound"', rowNumber, event));
    }

    if (event.duration && (typeof event.duration !== 'number' || event.duration < 0)) {
      errors.push(this.createError('invalid_data_type', 'Duration must be a non-negative number', rowNumber, event));
    }

    return errors;
  }

  /**
   * Validate individual contact
   */
  private validateContact(contact: Partial<Contact>, rowNumber: number): IngestionError[] {
    const errors: IngestionError[] = [];

    // Required fields
    if (!contact.number) {
      errors.push(this.createError('missing_required_field', 'Contact phone number is required', rowNumber, contact));
    }

    // Format validation
    if (contact.number && !this.isValidPhoneNumber(contact.number)) {
      errors.push(this.createError('invalid_data_type', 'Invalid contact phone number format', rowNumber, contact));
    }

    return errors;
  }

  /**
   * Create standardized error object
   */
  private createError(
    errorType: ErrorType, 
    message: string, 
    rowNumber: number, 
    rawData: unknown
  ): IngestionError {
    return {
      id: '', // Will be set by database
      job_id: this.jobId,
      row_number: rowNumber,
      error_type: errorType,
      error_message: message,
      raw_data: rawData as Record<string, unknown>,
      severity: 'error',
      created_at: new Date().toISOString()
    };
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Remove common formatting characters
    const cleaned = phone.replace(/[\s\-\(\)\+\.]/g, '');
    
    // Check if it's a valid US phone number (10-11 digits)
    return /^1?[0-9]{10}$/.test(cleaned);
  }

  /**
   * Validate timestamp format
   */
  private isValidTimestamp(timestamp: string): boolean {
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  }

  /**
   * Apply field mappings to transform raw data
   */
  protected applyFieldMappings(rawRow: Record<string, unknown>): Partial<Event> {
    const mappedEvent: Partial<Event> = {};

    for (const mapping of this.fieldMappings) {
      const sourceValue = rawRow[mapping.source_field];
      
      if (sourceValue !== undefined && sourceValue !== null) {
        const transformedValue = this.transformValue(sourceValue, mapping);
        (mappedEvent as any)[mapping.target_field] = transformedValue;
      }
    }

    return mappedEvent;
  }

  /**
   * Transform value based on mapping configuration
   */
  private transformValue(value: unknown, mapping: FieldMapping): unknown {
    switch (mapping.data_type) {
      case 'string':
        return String(value).trim();
      
      case 'number':
        const num = Number(value);
        return isNaN(num) ? null : num;
      
      case 'date':
        return new Date(String(value)).toISOString();
      
      case 'boolean':
        if (typeof value === 'boolean') return value;
        const str = String(value).toLowerCase();
        return ['true', '1', 'yes', 'y'].includes(str);
      
      default:
        return value;
    }
  }

  /**
   * Emit progress update
   */
  protected async updateProgress(
    processedRows: number, 
    totalRows: number, 
    currentStep: string = 'data_extraction'
  ): Promise<void> {
    const progress = Math.min(100, Math.round((processedRows / totalRows) * 100));
    
    await jobTracker.updateProgress(this.jobId, {
      progress,
      processed_rows: processedRows,
      total_rows: totalRows,
      current_step: currentStep as any
    });

    this.emit('progress', { processedRows, totalRows, progress });
  }

  /**
   * Process data in chunks to avoid memory issues
   */
  protected async processInChunks<T, R>(
    data: T[],
    processor: (chunk: T[], chunkIndex: number) => Promise<R[]>,
    chunkSize: number = this.config.chunk_size
  ): Promise<R[]> {
    const results: R[] = [];
    const totalChunks = Math.ceil(data.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      const chunk = data.slice(start, end);

      try {
        const chunkResults = await processor(chunk, i);
        results.push(...chunkResults);

        // Update progress
        await this.updateProgress(end, data.length);

        // Emit chunk processed event
        this.emit('chunkProcessed', {
          chunkIndex: i,
          totalChunks,
          chunkSize: chunk.length,
          processedRows: end
        });

      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error);
        
        // Add error for the entire chunk
        await jobTracker.addError(this.jobId, {
          error_type: 'parsing_error',
          error_message: `Failed to process chunk ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
          raw_data: { chunk_index: i, chunk_size: chunk.length }
        });

        // Continue with next chunk if not configured to stop on errors
        if (this.config.max_errors > 0) {
          const currentErrorCount = await this.getErrorCount();
          if (currentErrorCount >= this.config.max_errors) {
            throw new Error(`Maximum error count (${this.config.max_errors}) exceeded`);
          }
        }
      }
    }

    return results;
  }

  /**
   * Get current error count for the job
   */
  private async getErrorCount(): Promise<number> {
    const progress = jobTracker.getJobProgress(this.jobId);
    return progress?.errors_count || 0;
  }

  /**
   * Clean and normalize phone number
   */
  protected normalizePhoneNumber(phone: string): string {
    // Remove all non-numeric characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Handle US numbers
    if (cleaned.startsWith('+1')) {
      cleaned = cleaned.substring(2);
    } else if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = cleaned.substring(1);
    }
    
    // Ensure 10 digits for US numbers
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    // Return original if not a standard US number
    return phone;
  }

  /**
   * Extract contact information from events
   */
  protected extractContactsFromEvents(events: Partial<Event>[]): Partial<Contact>[] {
    const contactMap = new Map<string, Partial<Contact>>();

    for (const event of events) {
      if (!event.number) continue;

      const normalizedNumber = this.normalizePhoneNumber(event.number);
      
      if (!contactMap.has(normalizedNumber)) {
        contactMap.set(normalizedNumber, {
          number: normalizedNumber,
          first_seen: event.ts,
          last_seen: event.ts,
          total_calls: 0,
          total_sms: 0,
          tags: []
        });
      }

      const contact = contactMap.get(normalizedNumber)!;
      
      // Update contact statistics
      if (event.type === 'call') {
        contact.total_calls = (contact.total_calls || 0) + 1;
      } else if (event.type === 'sms') {
        contact.total_sms = (contact.total_sms || 0) + 1;
      }

      // Update date ranges
      if (event.ts) {
        if (!contact.first_seen || event.ts < contact.first_seen) {
          contact.first_seen = event.ts;
        }
        if (!contact.last_seen || event.ts > contact.last_seen) {
          contact.last_seen = event.ts;
        }
      }
    }

    return Array.from(contactMap.values());
  }
}