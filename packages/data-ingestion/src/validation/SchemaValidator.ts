import { Event, Contact } from '@phonelogai/types';
import { 
  ValidationResult, 
  ValidationError, 
  ValidationWarning, 
  ValidationRule,
  FieldMapping
} from '../types/index.js';

/**
 * Schema validation system for data ingestion pipeline
 * Validates incoming data against expected Event/Contact schemas
 * with configurable rules and constraints
 */
export class SchemaValidator {
  private rules: Map<string, ValidationRule[]>;
  
  constructor() {
    this.rules = new Map();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default validation rules for Event and Contact schemas
   */
  private initializeDefaultRules(): void {
    // Event validation rules
    const eventRules: ValidationRule[] = [
      {
        field: 'ts',
        type: 'required',
        error_message: 'Timestamp is required'
      },
      {
        field: 'ts',
        type: 'format',
        parameters: { type: 'datetime' },
        error_message: 'Invalid timestamp format'
      },
      {
        field: 'number',
        type: 'required',
        error_message: 'Phone number is required'
      },
      {
        field: 'number',
        type: 'format',
        parameters: { 
          pattern: '^\\+?1?[0-9]{10,15}$',
          minLength: 10,
          maxLength: 15
        },
        error_message: 'Invalid phone number format'
      },
      {
        field: 'type',
        type: 'format',
        parameters: { 
          allowed: ['call', 'sms', 'mms', 'voicemail', 'missed_call'] 
        },
        error_message: 'Invalid event type'
      },
      {
        field: 'direction',
        type: 'format',
        parameters: { 
          allowed: ['incoming', 'outgoing'] 
        },
        error_message: 'Invalid direction - must be incoming or outgoing'
      },
      {
        field: 'duration',
        type: 'range',
        parameters: { min: 0, max: 86400 },
        error_message: 'Duration must be between 0 and 86400 seconds (24 hours)'
      }
    ];

    // Contact validation rules
    const contactRules: ValidationRule[] = [
      {
        field: 'phone_number',
        type: 'required',
        error_message: 'Phone number is required for contact'
      },
      {
        field: 'phone_number',
        type: 'format',
        parameters: { 
          pattern: '^\\+?1?[0-9]{10,15}$',
          minLength: 10,
          maxLength: 15
        },
        error_message: 'Invalid contact phone number format'
      },
      {
        field: 'name',
        type: 'format',
        parameters: { 
          maxLength: 255,
          minLength: 1
        },
        error_message: 'Contact name must be 1-255 characters'
      },
      {
        field: 'email',
        type: 'format',
        parameters: { 
          pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
          optional: true
        },
        error_message: 'Invalid email format'
      }
    ];

    this.rules.set('event', eventRules);
    this.rules.set('contact', contactRules);
  }

  /**
   * Add custom validation rules for specific field types
   */
  addCustomRules(entityType: string, rules: ValidationRule[]): void {
    const existingRules = this.rules.get(entityType) || [];
    this.rules.set(entityType, [...existingRules, ...rules]);
  }

  /**
   * Validate a single record against schema rules
   */
  validateRecord(
    record: Record<string, any>,
    entityType: 'event' | 'contact',
    fieldMappings?: FieldMapping[]
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const rules = this.rules.get(entityType) || [];

    // Apply field mappings if provided
    const mappedRecord = fieldMappings 
      ? this.applyFieldMappings(record, fieldMappings)
      : record;

    // Validate each rule
    for (const rule of rules) {
      const fieldValue = mappedRecord[rule.field];
      const validation = this.validateField(fieldValue, rule, mappedRecord);
      
      if (validation.error) {
        errors.push({
          field: rule.field,
          value: fieldValue,
          rule: rule,
          message: validation.error
        });
      }
      
      if (validation.warning) {
        warnings.push({
          field: rule.field,
          value: fieldValue,
          message: validation.warning,
          suggestion: validation.suggestion
        });
      }
    }

    // Check for unexpected fields (warnings)
    const expectedFields = new Set(rules.map(r => r.field));
    for (const [field, value] of Object.entries(mappedRecord)) {
      if (!expectedFields.has(field) && value !== null && value !== undefined) {
        warnings.push({
          field,
          value,
          message: `Unexpected field '${field}' found in ${entityType}`,
          suggestion: `Consider adding validation rule for '${field}' or check field mappings`
        });
      }
    }

    return {
      is_valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate multiple records in batch
   */
  validateBatch(
    records: Record<string, any>[],
    entityType: 'event' | 'contact',
    fieldMappings?: FieldMapping[]
  ): {
    validRecords: Record<string, any>[];
    invalidRecords: Array<{ record: Record<string, any>; validation: ValidationResult; index: number }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
      errorRate: number;
      warningCount: number;
    };
  } {
    const validRecords: Record<string, any>[] = [];
    const invalidRecords: Array<{ record: Record<string, any>; validation: ValidationResult; index: number }> = [];
    let totalWarnings = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const validation = this.validateRecord(record, entityType, fieldMappings);
      
      totalWarnings += validation.warnings.length;

      if (validation.is_valid) {
        validRecords.push(record);
      } else {
        invalidRecords.push({ record, validation, index: i });
      }
    }

    return {
      validRecords,
      invalidRecords,
      summary: {
        total: records.length,
        valid: validRecords.length,
        invalid: invalidRecords.length,
        errorRate: records.length > 0 ? (invalidRecords.length / records.length) * 100 : 0,
        warningCount: totalWarnings
      }
    };
  }

  /**
   * Apply field mappings to transform source fields to target fields
   */
  private applyFieldMappings(
    record: Record<string, any>,
    fieldMappings: FieldMapping[]
  ): Record<string, any> {
    const mappedRecord: Record<string, any> = {};

    for (const mapping of fieldMappings) {
      const sourceValue = record[mapping.source_field];
      
      if (sourceValue !== undefined && sourceValue !== null) {
        // Apply data type transformation
        let transformedValue = this.transformValue(sourceValue, mapping.data_type);
        
        // Apply custom transformation function if specified
        if (mapping.transformation) {
          transformedValue = this.applyTransformation(transformedValue, mapping.transformation);
        }
        
        mappedRecord[mapping.target_field] = transformedValue;
      } else if (mapping.is_required) {
        // Mark required fields as null so validation can catch them
        mappedRecord[mapping.target_field] = null;
      }
    }

    return mappedRecord;
  }

  /**
   * Transform value to target data type
   */
  private transformValue(value: any, dataType: 'string' | 'number' | 'date' | 'boolean'): any {
    try {
      switch (dataType) {
        case 'string':
          return String(value);
        
        case 'number':
          const num = Number(value);
          return isNaN(num) ? value : num;
        
        case 'date':
          if (value instanceof Date) return value;
          const date = new Date(value);
          return isNaN(date.getTime()) ? value : date;
        
        case 'boolean':
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            const lower = value.toLowerCase();
            if (lower === 'true' || lower === '1' || lower === 'yes') return true;
            if (lower === 'false' || lower === '0' || lower === 'no') return false;
          }
          return Boolean(value);
        
        default:
          return value;
      }
    } catch (error) {
      return value; // Return original value if transformation fails
    }
  }

  /**
   * Apply custom transformation functions
   */
  private applyTransformation(value: any, transformationName: string): any {
    switch (transformationName) {
      case 'phone_normalize':
        return this.normalizePhoneNumber(value);
      
      case 'timestamp_normalize':
        return this.normalizeTimestamp(value);
      
      case 'duration_seconds':
        return this.convertDurationToSeconds(value);
      
      case 'trim_whitespace':
        return typeof value === 'string' ? value.trim() : value;
      
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;
      
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;
      
      default:
        return value;
    }
  }

  /**
   * Normalize phone number format
   */
  private normalizePhoneNumber(value: any): string {
    if (typeof value !== 'string') return String(value);
    
    // Remove all non-numeric characters
    const digits = value.replace(/\D/g, '');
    
    // Handle US numbers
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    // Return with + prefix if not already present
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  /**
   * Normalize timestamp to ISO format
   */
  private normalizeTimestamp(value: any): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : date.toISOString();
    }
    
    return String(value);
  }

  /**
   * Convert duration to seconds
   */
  private convertDurationToSeconds(value: any): number {
    if (typeof value === 'number') return value;
    
    if (typeof value === 'string') {
      // Handle MM:SS format
      const timeMatch = value.match(/^(\d+):(\d{2})$/);
      if (timeMatch) {
        const minutes = parseInt(timeMatch[1]);
        const seconds = parseInt(timeMatch[2]);
        return minutes * 60 + seconds;
      }
      
      // Handle numeric string
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }
    
    return 0;
  }

  /**
   * Validate individual field against rule
   */
  private validateField(
    value: any, 
    rule: ValidationRule,
    fullRecord: Record<string, any>
  ): { error?: string; warning?: string; suggestion?: string } {
    const { type, parameters = {} as Record<string, any> } = rule;

    switch (type) {
      case 'required':
        if (value === null || value === undefined || value === '') {
          return { error: rule.error_message };
        }
        break;

      case 'format':
        if (value === null || value === undefined) {
          if (!parameters.optional) {
            return { error: `${rule.field} is required` };
          }
          break;
        }

        // Pattern validation
        if (parameters.pattern) {
          const pattern = new RegExp(parameters.pattern);
          if (!pattern.test(String(value))) {
            return { error: rule.error_message };
          }
        }

        // Length validation
        if (parameters.minLength && String(value).length < parameters.minLength) {
          return { error: `${rule.field} must be at least ${parameters.minLength} characters` };
        }
        if (parameters.maxLength && String(value).length > parameters.maxLength) {
          return { error: `${rule.field} must be at most ${parameters.maxLength} characters` };
        }

        // Allowed values validation
        if (parameters.allowed && !parameters.allowed.includes(value)) {
          return { 
            error: rule.error_message,
            suggestion: `Allowed values: ${parameters.allowed.join(', ')}`
          };
        }

        // Type validation
        if (parameters.type === 'datetime') {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            return { error: rule.error_message };
          }
        }
        break;

      case 'range':
        const numValue = Number(value);
        if (isNaN(numValue)) {
          return { error: `${rule.field} must be a number` };
        }
        
        if (parameters.min !== undefined && typeof parameters.min === 'number' && numValue < parameters.min) {
          return { error: `${rule.field} must be at least ${parameters.min}` };
        }
        if (parameters.max !== undefined && typeof parameters.max === 'number' && numValue > parameters.max) {
          return { error: `${rule.field} must be at most ${parameters.max}` };
        }
        break;

      case 'custom':
        // For custom validation functions
        if (parameters.validator && typeof parameters.validator === 'function') {
          const customResult = parameters.validator(value, fullRecord);
          if (!customResult.isValid) {
            return { error: customResult.error || rule.error_message };
          }
        }
        break;
    }

    return {};
  }

  /**
   * Get validation statistics
   */
  getValidationStats(
    validationResults: ValidationResult[]
  ): {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    errorRate: number;
    warningCount: number;
    commonErrors: Array<{ field: string; count: number; message: string }>;
  } {
    const totalRecords = validationResults.length;
    const validRecords = validationResults.filter(r => r.is_valid).length;
    const invalidRecords = totalRecords - validRecords;
    const totalWarnings = validationResults.reduce((sum, r) => sum + r.warnings.length, 0);

    // Count common errors
    const errorCounts = new Map<string, { count: number; message: string }>();
    
    for (const result of validationResults) {
      for (const error of result.errors) {
        const key = `${error.field}:${error.rule.type}`;
        if (errorCounts.has(key)) {
          errorCounts.get(key)!.count++;
        } else {
          errorCounts.set(key, { count: 1, message: error.message });
        }
      }
    }

    const commonErrors = Array.from(errorCounts.entries())
      .map(([key, data]) => ({
        field: key.split(':')[0],
        count: data.count,
        message: data.message
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 most common errors

    return {
      totalRecords,
      validRecords,
      invalidRecords,
      errorRate: totalRecords > 0 ? (invalidRecords / totalRecords) * 100 : 0,
      warningCount: totalWarnings,
      commonErrors
    };
  }
}

export default SchemaValidator;