import csv from 'csv-parser';
import { Readable } from 'stream';
import { BaseParser } from './BaseParser';
import { 
  ExtractionResult, 
  FieldMapping, 
  ProcessingConfig,
  TableStructure,
  ColumnInfo 
} from '../types';
import { Event, Contact } from '@phonelogai/types';

export class CsvParser extends BaseParser {
  private detectedDelimiter: string = ',';
  private detectedEncoding: string = 'utf8';
  private headerRow: string[] = [];

  constructor(jobId: string, config: ProcessingConfig, fieldMappings: FieldMapping[] = []) {
    super(jobId, config, fieldMappings);
  }

  /**
   * Parse CSV file and extract events/contacts
   */
  async parseFile(buffer: Buffer): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    try {
      // Detect file characteristics
      await this.detectFileCharacteristics(buffer);
      
      // Parse CSV data
      const rawRows = await this.parseCsvData(buffer);
      
      // Apply field mappings if available, otherwise use auto-detection
      const events = await this.processInChunks(
        rawRows,
        (chunk) => this.transformRowsToEvents(chunk)
      );

      // Extract contacts from events
      const contacts = this.extractContactsFromEvents(events.flat());

      // Validate data
      const validation = await this.validateData(events.flat(), contacts);

      const processingTime = Date.now() - startTime;
      
      const result: ExtractionResult = {
        events: events.flat(),
        contacts,
        metadata: {
          total_rows: rawRows.length,
          parsed_rows: events.flat().length,
          error_rows: rawRows.length - events.flat().length,
          duplicate_rows: 0, // Will be calculated during deduplication
          processing_time_ms: processingTime
        },
        errors: validation.errors.map(e => ({
          id: '',
          job_id: this.jobId,
          error_type: 'validation_error',
          error_message: e.message,
          severity: 'error',
          created_at: new Date().toISOString(),
          raw_data: { field: e.field, value: e.value }
        })),
        warnings: validation.warnings.map(w => w.message)
      };

      return result;

    } catch (error) {
      throw new Error(`CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect CSV file characteristics (delimiter, encoding, etc.)
   */
  private async detectFileCharacteristics(buffer: Buffer): Promise<void> {
    // Convert first 1KB to string for analysis
    const sample = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
    
    // Detect delimiter
    this.detectedDelimiter = this.detectDelimiter(sample);
    
    // Detect encoding (basic check)
    this.detectedEncoding = this.detectEncoding(buffer);
    
    // Parse header row
    const firstLine = sample.split('\n')[0];
    if (firstLine) {
      this.headerRow = this.parseRow(firstLine, this.detectedDelimiter);
    }
  }

  /**
   * Detect CSV delimiter
   */
  private detectDelimiter(sample: string): string {
    const delimiters = [',', ';', '\t', '|'];
    const counts = delimiters.map(delimiter => ({
      delimiter,
      count: (sample.match(new RegExp(`\\${delimiter}`, 'g')) || []).length
    }));
    
    // Return the delimiter with the highest count
    const best = counts.reduce((max, current) => 
      current.count > max.count ? current : max
    );
    
    return best.count > 0 ? best.delimiter : ',';
  }

  /**
   * Detect file encoding
   */
  private detectEncoding(buffer: Buffer): string {
    // Check for BOM
    if (buffer.length >= 3) {
      const bom = buffer.slice(0, 3);
      if (bom[0] === 0xEF && bom[1] === 0xBB && bom[2] === 0xBF) {
        return 'utf8';
      }
    }
    
    // Simple UTF-8 vs ASCII detection
    try {
      buffer.toString('utf8');
      return 'utf8';
    } catch {
      return 'ascii';
    }
  }

  /**
   * Parse CSV data into raw rows
   */
  private async parseCsvData(buffer: Buffer): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, string>[] = [];
      const stream = Readable.from(buffer.toString(this.detectedEncoding as BufferEncoding));

      stream
        .pipe(csv({ 
          separator: this.detectedDelimiter,
          strict: false
        }))
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', () => {
          resolve(rows);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Parse a single row with given delimiter
   */
  private parseRow(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  /**
   * Transform raw CSV rows to Event objects
   */
  private async transformRowsToEvents(rows: Record<string, string>[]): Promise<Partial<Event>[]> {
    const events: Partial<Event>[] = [];

    for (const row of rows) {
      try {
        let event: Partial<Event>;

        if (this.fieldMappings.length > 0) {
          // Use provided field mappings
          event = this.applyFieldMappings(row);
        } else {
          // Auto-detect field mappings
          event = this.autoMapFields(row);
        }

        // Ensure required fields
        if (event.number && event.ts) {
          events.push(event);
        }

      } catch (error) {
        console.warn(`Skipping invalid row:`, error);
      }
    }

    return events;
  }

  /**
   * Auto-detect field mappings based on common patterns
   */
  private autoMapFields(row: Record<string, string>): Partial<Event> {
    const event: Partial<Event> = {};

    // Try to detect phone number field
    const phoneFields = ['phone', 'number', 'phone_number', 'called_number', 'from', 'to'];
    for (const key of Object.keys(row)) {
      const lowerKey = key.toLowerCase();
      if (phoneFields.some(field => lowerKey.includes(field))) {
        event.number = this.normalizePhoneNumber(row[key]);
        break;
      }
    }

    // Try to detect timestamp field
    const dateFields = ['date', 'time', 'timestamp', 'datetime', 'when'];
    for (const key of Object.keys(row)) {
      const lowerKey = key.toLowerCase();
      if (dateFields.some(field => lowerKey.includes(field))) {
        try {
          const date = new Date(row[key]);
          if (!isNaN(date.getTime())) {
            event.ts = date.toISOString();
            break;
          }
        } catch {
          // Continue trying other fields
        }
      }
    }

    // Try to detect call type
    const typeFields = ['type', 'call_type', 'activity', 'event_type'];
    for (const key of Object.keys(row)) {
      const lowerKey = key.toLowerCase();
      if (typeFields.some(field => lowerKey.includes(field))) {
        const value = row[key].toLowerCase();
        if (value.includes('call') || value.includes('voice')) {
          event.type = 'call';
        } else if (value.includes('sms') || value.includes('text') || value.includes('message')) {
          event.type = 'sms';
        }
        break;
      }
    }

    // Try to detect direction
    const directionFields = ['direction', 'type', 'call_direction'];
    for (const key of Object.keys(row)) {
      const lowerKey = key.toLowerCase();
      if (directionFields.some(field => lowerKey.includes(field))) {
        const value = row[key].toLowerCase();
        if (value.includes('in') || value.includes('received')) {
          event.direction = 'inbound';
        } else if (value.includes('out') || value.includes('sent') || value.includes('made')) {
          event.direction = 'outbound';
        }
        break;
      }
    }

    // Try to detect duration
    const durationFields = ['duration', 'minutes', 'seconds', 'length'];
    for (const key of Object.keys(row)) {
      const lowerKey = key.toLowerCase();
      if (durationFields.some(field => lowerKey.includes(field))) {
        const duration = parseInt(row[key]);
        if (!isNaN(duration)) {
          event.duration = duration;
          break;
        }
      }
    }

    // Try to detect content (for SMS)
    const contentFields = ['content', 'message', 'text', 'body'];
    for (const key of Object.keys(row)) {
      const lowerKey = key.toLowerCase();
      if (contentFields.some(field => lowerKey.includes(field))) {
        event.content = row[key];
        break;
      }
    }

    return event;
  }

  /**
   * Get table structure information for the CSV
   */
  getTableStructure(): TableStructure {
    const columns: ColumnInfo[] = this.headerRow.map((header, index) => ({
      index,
      name: header,
      data_type: 'string', // Default to string, would need sample data to infer
      sample_values: [],
      null_percentage: 0
    }));

    return {
      header_row: 0,
      data_start_row: 1,
      columns,
      delimiter: this.detectedDelimiter,
      encoding: this.detectedEncoding
    };
  }

  /**
   * Analyze column data types from sample data
   */
  private analyzeColumnTypes(rows: Record<string, string>[]): Record<string, string> {
    const types: Record<string, string> = {};
    const sampleSize = Math.min(100, rows.length);
    const sample = rows.slice(0, sampleSize);

    for (const column of this.headerRow) {
      const values = sample.map(row => row[column]).filter(v => v && v.trim());
      
      if (values.length === 0) {
        types[column] = 'string';
        continue;
      }

      // Check if all values are numbers
      const allNumbers = values.every(v => !isNaN(Number(v)));
      if (allNumbers) {
        types[column] = 'number';
        continue;
      }

      // Check if all values are dates
      const allDates = values.every(v => !isNaN(Date.parse(v)));
      if (allDates) {
        types[column] = 'date';
        continue;
      }

      // Check if all values are booleans
      const allBooleans = values.every(v => 
        ['true', 'false', '1', '0', 'yes', 'no'].includes(v.toLowerCase())
      );
      if (allBooleans) {
        types[column] = 'boolean';
        continue;
      }

      // Default to string
      types[column] = 'string';
    }

    return types;
  }

  /**
   * Generate confidence scores for auto-detected mappings
   */
  generateAutoMappings(): FieldMapping[] {
    const mappings: FieldMapping[] = [];
    
    // Common field patterns with confidence scores
    const patterns = [
      { pattern: /phone|number|called/i, target: 'number' as keyof Event, confidence: 0.9 },
      { pattern: /date|time|when/i, target: 'ts' as keyof Event, confidence: 0.85 },
      { pattern: /duration|minutes|seconds/i, target: 'duration' as keyof Event, confidence: 0.8 },
      { pattern: /direction|type/i, target: 'direction' as keyof Event, confidence: 0.75 },
      { pattern: /content|message|text/i, target: 'content' as keyof Event, confidence: 0.7 }
    ];

    for (const header of this.headerRow) {
      for (const { pattern, target, confidence } of patterns) {
        if (pattern.test(header)) {
          mappings.push({
            source_field: header,
            target_field: target,
            data_type: this.inferDataType(target),
            confidence,
            is_required: ['number', 'ts', 'type', 'direction'].includes(target)
          });
          break; // Use first matching pattern
        }
      }
    }

    return mappings;
  }

  /**
   * Infer data type from target field
   */
  private inferDataType(field: keyof Event): 'string' | 'number' | 'date' | 'boolean' {
    const typeMap: Record<string, 'string' | 'number' | 'date' | 'boolean'> = {
      'ts': 'date',
      'duration': 'number',
      'number': 'string',
      'type': 'string',
      'direction': 'string',
      'content': 'string'
    };

    return typeMap[field] || 'string';
  }
}