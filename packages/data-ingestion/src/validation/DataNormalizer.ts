import { parsePhoneNumber, PhoneNumber } from 'libphonenumber-js';

/**
 * Data normalization system for the ETL pipeline
 * Handles phone numbers, timestamps, timezones, and data type conversions
 */
export class DataNormalizer {
  private readonly defaultTimezone: string;
  private readonly defaultCountry: 'US' | 'CA' = 'US';

  constructor(defaultTimezone: string = 'America/New_York') {
    this.defaultTimezone = defaultTimezone;
  }

  /**
   * Normalize phone number to E.164 international format
   */
  normalizePhoneNumber(phoneNumber: string, country?: string): {
    normalized: string | null;
    original: string;
    isValid: boolean;
    country?: string;
    nationalNumber?: string;
    error?: string;
  } {
    const result = {
      normalized: null as string | null,
      original: phoneNumber,
      isValid: false,
      country: undefined as string | undefined,
      nationalNumber: undefined as string | undefined,
      error: undefined as string | undefined
    };

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      result.error = 'Invalid phone number input';
      return result;
    }

    try {
      // Clean input: remove common separators and spaces
      const cleaned = phoneNumber.replace(/[\s\-\(\)\.\+]/g, '');
      
      // Handle special cases for US numbers
      let numberToParse = cleaned;
      if (cleaned.length === 10 && /^\d{10}$/.test(cleaned)) {
        // Add US country code for 10-digit numbers
        numberToParse = `1${cleaned}`;
      }

      // Parse with libphonenumber-js
      const parsed = parsePhoneNumber(numberToParse, (country as any) || this.defaultCountry);
      
      if (parsed && parsed.isValid()) {
        result.normalized = parsed.number;
        result.isValid = true;
        result.country = parsed.country;
        result.nationalNumber = parsed.nationalNumber;
      } else {
        // Fallback: manual validation for common formats
        const fallback = this.fallbackPhoneNormalization(cleaned);
        if (fallback.isValid) {
          result.normalized = fallback.normalized;
          result.isValid = true;
          result.country = 'US'; // Assume US for fallback
        } else {
          result.error = 'Invalid phone number format';
        }
      }
    } catch (error) {
      result.error = `Phone number parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return result;
  }

  /**
   * Fallback phone number normalization for edge cases
   */
  private fallbackPhoneNormalization(cleaned: string): { normalized: string | null; isValid: boolean } {
    // Remove any remaining non-digits
    const digits = cleaned.replace(/\D/g, '');

    // US number patterns
    if (digits.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      return { normalized: `+1${digits}`, isValid: true };
    }
    
    if (digits.length === 11 && digits.startsWith('1') && /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      return { normalized: `+${digits}`, isValid: true };
    }

    // International numbers (basic validation)
    if (digits.length >= 7 && digits.length <= 15) {
      return { normalized: `+${digits}`, isValid: true };
    }

    return { normalized: null, isValid: false };
  }

  /**
   * Normalize timestamp with timezone handling
   */
  normalizeTimestamp(
    timestamp: any,
    sourceTimezone?: string,
    targetTimezone?: string
  ): {
    normalized: Date | null;
    iso: string | null;
    original: any;
    isValid: boolean;
    timezone: string | null;
    error?: string;
  } {
    const result = {
      normalized: null as Date | null,
      iso: null as string | null,
      original: timestamp,
      isValid: false,
      timezone: sourceTimezone || this.defaultTimezone,
      error: undefined as string | undefined
    };

    if (!timestamp) {
      result.error = 'Empty timestamp';
      return result;
    }

    try {
      let date: Date | null = null;

      // Handle different timestamp formats
      if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string') {
        date = this.parseTimestampString(timestamp, sourceTimezone);
      } else if (typeof timestamp === 'number') {
        // Unix timestamp (seconds or milliseconds)
        const timestampMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
        date = new Date(timestampMs);
      } else {
        result.error = 'Unsupported timestamp format';
        return result;
      }

      if (date && !isNaN(date.getTime())) {
        result.normalized = date;
        result.iso = date.toISOString();
        result.isValid = true;

        // Apply timezone conversion if requested
        if (targetTimezone && targetTimezone !== sourceTimezone) {
          result.normalized = this.convertTimezone(date, sourceTimezone || this.defaultTimezone, targetTimezone);
          result.iso = result.normalized.toISOString();
          result.timezone = targetTimezone;
        }
      } else {
        result.error = 'Invalid date/time value';
      }
    } catch (error) {
      result.error = `Timestamp parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return result;
  }

  /**
   * Parse timestamp string with various formats
   */
  private parseTimestampString(timestampStr: string, timezone?: string): Date | null {
    const trimmed = timestampStr.trim();
    
    // Common date/time patterns
    const patterns = [
      // ISO formats
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{3})?$/,
      
      // US formats
      /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}(:\d{2})?( [AP]M)?$/i,
      /^\d{1,2}-\d{1,2}-\d{4} \d{1,2}:\d{2}(:\d{2})?( [AP]M)?$/i,
      
      // European formats
      /^\d{1,2}\.\d{1,2}\.\d{4} \d{1,2}:\d{2}(:\d{2})?$/,
      
      // Date only
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{1,2}\/\d{1,2}\/\d{4}$/,
      /^\d{1,2}-\d{1,2}-\d{4}$/,
    ];

    // Try parsing with Date constructor first
    let date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try specific format parsing
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Manual parsing for specific carrier formats
    return this.parseCarrierSpecificTimestamp(trimmed);
  }

  /**
   * Parse carrier-specific timestamp formats
   */
  private parseCarrierSpecificTimestamp(timestampStr: string): Date | null {
    // AT&T format: "MM/DD/YYYY HH:MM:SS AM/PM"
    const attMatch = timestampStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ([AP]M)$/i);
    if (attMatch) {
      const [, month, day, year, hour, minute, second, ampm] = attMatch;
      let hour24 = parseInt(hour);
      if (ampm.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
      if (ampm.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
      
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour24, parseInt(minute), parseInt(second));
    }

    // Verizon format: "YYYY-MM-DD HH:MM"
    const verizonMatch = timestampStr.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (verizonMatch) {
      const [, year, month, day, hour, minute] = verizonMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
    }

    // T-Mobile format: "MM-DD-YYYY HH:MM:SS"
    const tmobileMatch = timestampStr.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    if (tmobileMatch) {
      const [, month, day, year, hour, minute, second] = tmobileMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second));
    }

    return null;
  }

  /**
   * Convert timezone (simplified - for production use a proper timezone library)
   */
  private convertTimezone(date: Date, fromTz: string, toTz: string): Date {
    // This is a simplified implementation
    // For production, use libraries like moment-timezone or date-fns-tz
    
    const timezoneOffsets: Record<string, number> = {
      'America/New_York': -5, // EST (simplified, doesn't handle DST)
      'America/Chicago': -6,  // CST
      'America/Denver': -7,   // MST
      'America/Los_Angeles': -8, // PST
      'UTC': 0
    };

    const fromOffset = timezoneOffsets[fromTz] || 0;
    const toOffset = timezoneOffsets[toTz] || 0;
    const diffHours = toOffset - fromOffset;

    return new Date(date.getTime() + (diffHours * 60 * 60 * 1000));
  }

  /**
   * Normalize duration values to seconds
   */
  normalizeDuration(duration: any): {
    seconds: number;
    original: any;
    isValid: boolean;
    error?: string;
  } {
    const result = {
      seconds: 0,
      original: duration,
      isValid: false,
      error: undefined as string | undefined
    };

    if (duration === null || duration === undefined) {
      result.error = 'Duration is null or undefined';
      return result;
    }

    try {
      // Number (assume seconds)
      if (typeof duration === 'number') {
        if (duration >= 0 && duration <= 86400) { // Max 24 hours
          result.seconds = Math.round(duration);
          result.isValid = true;
        } else {
          result.error = 'Duration out of valid range (0-86400 seconds)';
        }
        return result;
      }

      // String parsing
      if (typeof duration === 'string') {
        const trimmed = duration.trim();

        // Parse MM:SS format
        const mmssMatch = trimmed.match(/^(\d+):([0-5]\d)$/);
        if (mmssMatch) {
          const minutes = parseInt(mmssMatch[1]);
          const seconds = parseInt(mmssMatch[2]);
          result.seconds = minutes * 60 + seconds;
          result.isValid = true;
          return result;
        }

        // Parse HH:MM:SS format
        const hhmmssMatch = trimmed.match(/^(\d+):([0-5]\d):([0-5]\d)$/);
        if (hhmmssMatch) {
          const hours = parseInt(hhmmssMatch[1]);
          const minutes = parseInt(hhmmssMatch[2]);
          const seconds = parseInt(hhmmssMatch[3]);
          result.seconds = hours * 3600 + minutes * 60 + seconds;
          result.isValid = true;
          return result;
        }

        // Parse numeric string
        const numericValue = parseFloat(trimmed);
        if (!isNaN(numericValue) && numericValue >= 0 && numericValue <= 86400) {
          result.seconds = Math.round(numericValue);
          result.isValid = true;
          return result;
        }

        result.error = 'Invalid duration string format';
      } else {
        result.error = 'Unsupported duration type';
      }
    } catch (error) {
      result.error = `Duration parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return result;
  }

  /**
   * Normalize data type based on target schema
   */
  normalizeDataType(
    value: any,
    targetType: 'string' | 'number' | 'boolean' | 'date',
    options: {
      allowNull?: boolean;
      trim?: boolean;
      lowercase?: boolean;
      uppercase?: boolean;
    } = {}
  ): {
    normalized: any;
    original: any;
    isValid: boolean;
    error?: string;
  } {
    const result = {
      normalized: value,
      original: value,
      isValid: false,
      error: undefined as string | undefined
    };

    // Handle null/undefined
    if (value === null || value === undefined) {
      if (options.allowNull) {
        result.normalized = null;
        result.isValid = true;
      } else {
        result.error = 'Value cannot be null';
      }
      return result;
    }

    try {
      switch (targetType) {
        case 'string':
          result.normalized = String(value);
          if (options.trim) result.normalized = result.normalized.trim();
          if (options.lowercase) result.normalized = result.normalized.toLowerCase();
          if (options.uppercase) result.normalized = result.normalized.toUpperCase();
          result.isValid = true;
          break;

        case 'number':
          const num = Number(value);
          if (!isNaN(num)) {
            result.normalized = num;
            result.isValid = true;
          } else {
            result.error = 'Cannot convert to number';
          }
          break;

        case 'boolean':
          if (typeof value === 'boolean') {
            result.normalized = value;
            result.isValid = true;
          } else if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            if (['true', '1', 'yes', 'on'].includes(lower)) {
              result.normalized = true;
              result.isValid = true;
            } else if (['false', '0', 'no', 'off'].includes(lower)) {
              result.normalized = false;
              result.isValid = true;
            } else {
              result.error = 'Cannot convert string to boolean';
            }
          } else if (typeof value === 'number') {
            result.normalized = value !== 0;
            result.isValid = true;
          } else {
            result.error = 'Cannot convert to boolean';
          }
          break;

        case 'date':
          const timestampResult = this.normalizeTimestamp(value);
          result.normalized = timestampResult.normalized;
          result.isValid = timestampResult.isValid;
          result.error = timestampResult.error;
          break;

        default:
          result.error = `Unsupported target type: ${targetType}`;
      }
    } catch (error) {
      result.error = `Type conversion error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return result;
  }

  /**
   * Normalize a complete record with multiple fields
   */
  normalizeRecord(
    record: Record<string, any>,
    fieldDefinitions: Array<{
      field: string;
      type: 'string' | 'number' | 'boolean' | 'date' | 'phone' | 'duration';
      timezone?: string;
      options?: Record<string, any>;
    }>
  ): {
    normalized: Record<string, any>;
    original: Record<string, any>;
    errors: Array<{ field: string; error: string }>;
    warnings: Array<{ field: string; warning: string }>;
  } {
    const normalized: Record<string, any> = {};
    const errors: Array<{ field: string; error: string }> = [];
    const warnings: Array<{ field: string; warning: string }> = [];

    for (const fieldDef of fieldDefinitions) {
      const value = record[fieldDef.field];

      try {
        switch (fieldDef.type) {
          case 'phone':
            const phoneResult = this.normalizePhoneNumber(value);
            if (phoneResult.isValid) {
              normalized[fieldDef.field] = phoneResult.normalized;
            } else {
              errors.push({ field: fieldDef.field, error: phoneResult.error || 'Invalid phone number' });
            }
            break;

          case 'duration':
            const durationResult = this.normalizeDuration(value);
            if (durationResult.isValid) {
              normalized[fieldDef.field] = durationResult.seconds;
            } else {
              errors.push({ field: fieldDef.field, error: durationResult.error || 'Invalid duration' });
            }
            break;

          case 'date':
            const timestampResult = this.normalizeTimestamp(value, fieldDef.timezone);
            if (timestampResult.isValid) {
              normalized[fieldDef.field] = timestampResult.normalized;
            } else {
              errors.push({ field: fieldDef.field, error: timestampResult.error || 'Invalid timestamp' });
            }
            break;

          default:
            const typeResult = this.normalizeDataType(value, fieldDef.type as any, fieldDef.options);
            if (typeResult.isValid) {
              normalized[fieldDef.field] = typeResult.normalized;
            } else {
              errors.push({ field: fieldDef.field, error: typeResult.error || 'Type conversion failed' });
            }
        }
      } catch (error) {
        errors.push({ 
          field: fieldDef.field, 
          error: `Normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      }
    }

    return {
      normalized,
      original: record,
      errors,
      warnings
    };
  }
}

export default DataNormalizer;