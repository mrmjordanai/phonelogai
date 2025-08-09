import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';
import crypto from 'crypto';

// Manual mapping workflow schema
const mappingSessionSchema = z.object({
  filename: z.string().min(1),
  file_format: z.enum(['csv', 'pdf', 'txt', 'xlsx', 'json']),
  file_sample: z.string().min(1), // Sample content for mapping
  carrier: z.string().optional(),
  description: z.string().optional(),
});

// Field mapping schema
const fieldMappingSchema = z.object({
  source_field: z.string().min(1),
  target_field: z.string().min(1),
  data_type: z.enum(['text', 'phone_number', 'datetime', 'number', 'boolean', 'email']),
  required: z.boolean().default(false),
  transformation: z.object({
    normalize_phone: z.boolean().optional(),
    parse_date: z.boolean().optional(),
    trim_whitespace: z.boolean().optional(),
    lowercase: z.boolean().optional(),
    uppercase: z.boolean().optional(),
    custom_regex: z.string().optional(),
  }).optional(),
  validation: z.object({
    pattern: z.string().optional(),
    min_length: z.number().optional(),
    max_length: z.number().optional(),
    required: z.boolean().optional(),
  }).optional(),
});

// Complete mapping submission schema
const completeMappingSchema = z.object({
  template_name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  carrier: z.string().max(50).optional(),
  field_mappings: z.array(fieldMappingSchema).min(1),
  validation_rules: z.record(z.any()).default({}),
  transformation_rules: z.record(z.any()).default({}),
  is_public: z.boolean().default(false),
  shared_with_org: z.boolean().default(false),
  test_with_sample: z.boolean().default(true),
});

/**
 * POST /api/templates/mapping
 * 
 * Start a manual mapping workflow session
 */
export async function POST(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'templates', 'create');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const requestData = await request.json();

    // Validate request data
    const validation = mappingSessionSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid mapping session data',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const { filename, file_format, file_sample, carrier, description } = validation.data;

    // Analyze file sample to extract structure and suggest mappings
    const analysisResult = await analyzeFileStructure(file_sample, file_format);

    // Generate mapping session ID
    const sessionId = crypto.randomUUID();

    // Store session data (in a real implementation, this might go to Redis or database)
    // For now, we'll return all the analysis data for the client to use

    return NextResponse.json({
      success: true,
      session_id: sessionId,
      filename,
      file_format,
      carrier,
      description,
      
      // Structural analysis
      structure: analysisResult.structure,
      
      // Detected source fields with suggested mappings
      source_fields: analysisResult.source_fields,
      
      // Standard target fields for this format/carrier
      suggested_target_fields: getStandardTargetFields(file_format, carrier),
      
      // Pre-suggested mappings based on analysis
      suggested_mappings: analysisResult.suggested_mappings,
      
      // Validation recommendations
      validation_suggestions: analysisResult.validation_suggestions,
      
      // Sample data for preview
      sample_data: analysisResult.sample_data,
      
      // Workflow steps
      next_steps: {
        review_mappings: 'Review and adjust the suggested field mappings',
        configure_validation: 'Set up validation rules for each field',
        configure_transformations: 'Configure data transformations',
        test_mapping: 'Test the mapping with sample data',
        save_template: 'Save as reusable template',
      },
      
      // API endpoints for workflow steps
      endpoints: {
        preview_mapping: `/api/templates/mapping/${sessionId}/preview`,
        test_mapping: `/api/templates/mapping/${sessionId}/test`,
        save_template: `/api/templates/mapping/${sessionId}/save`,
        get_suggestions: `/api/templates/mapping/${sessionId}/suggestions`,
      },
    });

  } catch (error) {
    console.error('Start mapping workflow error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Analyze file structure and suggest mappings
 */
async function analyzeFileStructure(sample: string, format: string): Promise<{
  structure: any;
  source_fields: any[];
  suggested_mappings: any[];
  validation_suggestions: any[];
  sample_data: any[];
}> {
  const lines = sample.split('\n').filter(line => line.trim().length > 0);
  
  if (format === 'csv') {
    return analyzeCSVStructure(lines);
  } else if (format === 'txt') {
    return analyzeTextStructure(lines);
  } else if (format === 'json') {
    return analyzeJSONStructure(sample);
  }
  
  // Default analysis for other formats
  return {
    structure: { format, total_lines: lines.length },
    source_fields: [],
    suggested_mappings: [],
    validation_suggestions: [],
    sample_data: [],
  };
}

/**
 * Analyze CSV structure
 */
function analyzeCSVStructure(lines: string[]): {
  structure: any;
  source_fields: any[];
  suggested_mappings: any[];
  validation_suggestions: any[];
  sample_data: any[];
} {
  if (lines.length === 0) {
    throw new Error('No data lines found');
  }

  // Detect delimiter
  const delimiter = detectCSVDelimiter(lines[0]);
  
  // Parse header
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/['"]/g, ''));
  
  // Parse sample data
  const sampleData = lines.slice(1, Math.min(6, lines.length)).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/['"]/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });

  // Analyze each field
  const sourceFields = headers.map((header, index) => {
    const columnValues = sampleData.map(row => row[header]).filter(v => v && v.length > 0);
    const fieldType = inferFieldTypeFromSamples(header, columnValues);
    
    return {
      index,
      name: header,
      original_name: header,
      normalized_name: normalizeFieldName(header),
      data_type: fieldType.type,
      confidence: fieldType.confidence,
      sample_values: columnValues.slice(0, 3),
      null_count: sampleData.length - columnValues.length,
      unique_count: new Set(columnValues).size,
    };
  });

  // Generate suggested mappings
  const suggestedMappings = sourceFields.map(field => {
    const targetField = suggestTargetField(field.normalized_name, field.data_type);
    
    return {
      source_field: field.name,
      target_field: targetField.name,
      confidence: Math.min(field.confidence, targetField.confidence),
      data_type: field.data_type,
      required: targetField.required,
      suggested_transformations: getSuggestedTransformations(field.data_type),
      suggested_validations: getSuggestedValidations(field.data_type, field.sample_values),
    };
  });

  return {
    structure: {
      format: 'csv',
      delimiter,
      headers: headers.length,
      data_rows: lines.length - 1,
      sample_rows: sampleData.length,
    },
    source_fields: sourceFields,
    suggested_mappings: suggestedMappings,
    validation_suggestions: generateValidationSuggestions(sourceFields),
    sample_data: sampleData,
  };
}

/**
 * Analyze text structure
 */
function analyzeTextStructure(lines: string[]): {
  structure: any;
  source_fields: any[];
  suggested_mappings: any[];
  validation_suggestions: any[];
  sample_data: any[];
} {
  const structuredLines = lines.filter(line => 
    line.includes(':') || line.includes('=') || line.includes('|')
  );

  // Extract key-value pairs
  const keyValuePairs: { key: string; value: string; line: number }[] = [];
  
  structuredLines.forEach((line, index) => {
    const separators = [':', '=', '|'];
    
    for (const sep of separators) {
      if (line.includes(sep)) {
        const parts = line.split(sep, 2);
        if (parts.length === 2) {
          const key = parts[0].trim();
          const value = parts[1].trim();
          
          if (key && value) {
            keyValuePairs.push({ key, value, line: index + 1 });
          }
        }
        break;
      }
    }
  });

  // Analyze fields
  const sourceFields = keyValuePairs.map((pair, index) => {
    const fieldType = inferFieldTypeFromSamples(pair.key, [pair.value]);
    
    return {
      index,
      name: pair.key,
      original_name: pair.key,
      normalized_name: normalizeFieldName(pair.key),
      data_type: fieldType.type,
      confidence: fieldType.confidence,
      sample_values: [pair.value],
      line_number: pair.line,
    };
  });

  // Generate mappings
  const suggestedMappings = sourceFields.map(field => {
    const targetField = suggestTargetField(field.normalized_name, field.data_type);
    
    return {
      source_field: field.name,
      target_field: targetField.name,
      confidence: Math.min(field.confidence, targetField.confidence),
      data_type: field.data_type,
      required: targetField.required,
      extraction_method: 'key_value',
      line_number: field.line_number,
    };
  });

  return {
    structure: {
      format: 'txt',
      total_lines: lines.length,
      structured_lines: structuredLines.length,
      key_value_pairs: keyValuePairs.length,
    },
    source_fields: sourceFields,
    suggested_mappings: suggestedMappings,
    validation_suggestions: generateValidationSuggestions(sourceFields),
    sample_data: keyValuePairs.map(pair => ({ [pair.key]: pair.value })),
  };
}

/**
 * Analyze JSON structure
 */
function analyzeJSONStructure(sample: string): {
  structure: any;
  source_fields: any[];
  suggested_mappings: any[];
  validation_suggestions: any[];
  sample_data: any[];
} {
  try {
    const parsed = JSON.parse(sample);
    const isArray = Array.isArray(parsed);
    const sampleObject = isArray ? (parsed[0] || {}) : parsed;
    
    // Extract fields from object keys
    const sourceFields = Object.keys(sampleObject).map((key, index) => {
      const value = sampleObject[key];
      const fieldType = inferFieldTypeFromValue(key, value);
      
      return {
        index,
        name: key,
        original_name: key,
        normalized_name: normalizeFieldName(key),
        data_type: fieldType.type,
        confidence: fieldType.confidence,
        sample_values: [String(value)],
        json_path: `$.${key}`,
      };
    });

    // Generate mappings
    const suggestedMappings = sourceFields.map(field => {
      const targetField = suggestTargetField(field.normalized_name, field.data_type);
      
      return {
        source_field: field.name,
        target_field: targetField.name,
        confidence: Math.min(field.confidence, targetField.confidence),
        data_type: field.data_type,
        required: targetField.required,
        json_path: field.json_path,
      };
    });

    return {
      structure: {
        format: 'json',
        is_array: isArray,
        object_keys: Object.keys(sampleObject).length,
        sample_objects: isArray ? Math.min(parsed.length, 5) : 1,
      },
      source_fields: sourceFields,
      suggested_mappings: suggestedMappings,
      validation_suggestions: generateValidationSuggestions(sourceFields),
      sample_data: isArray ? parsed.slice(0, 5) : [parsed],
    };
  } catch (error) {
    throw new Error('Invalid JSON format');
  }
}

/**
 * Detect CSV delimiter
 */
function detectCSVDelimiter(line: string): string {
  const delimiters = [',', ';', '\t', '|'];
  let bestDelimiter = ',';
  let maxCount = 0;

  delimiters.forEach(delimiter => {
    const count = (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delimiter;
    }
  });

  return bestDelimiter;
}

/**
 * Infer field type from header and sample values
 */
function inferFieldTypeFromSamples(header: string, samples: string[]): { type: string; confidence: number } {
  const lowerHeader = header.toLowerCase();
  const nonEmptySamples = samples.filter(s => s && s.length > 0);

  // Header-based detection (high confidence)
  if (lowerHeader.includes('phone') || lowerHeader.includes('number') || lowerHeader.includes('caller')) {
    return { type: 'phone_number', confidence: 0.9 };
  }
  if (lowerHeader.includes('date') || lowerHeader.includes('time') || lowerHeader.includes('stamp')) {
    return { type: 'datetime', confidence: 0.8 };
  }
  if (lowerHeader.includes('email') || lowerHeader.includes('mail')) {
    return { type: 'email', confidence: 0.9 };
  }
  if (lowerHeader.includes('duration') || lowerHeader.includes('length')) {
    return { type: 'number', confidence: 0.8 };
  }

  // Sample-based detection (medium confidence)
  if (nonEmptySamples.length > 0) {
    const firstSample = nonEmptySamples[0];
    
    // Phone number pattern
    if (/^\+?[\d\-\(\)\s]{10,}$/.test(firstSample)) {
      return { type: 'phone_number', confidence: 0.7 };
    }
    
    // Email pattern
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(firstSample)) {
      return { type: 'email', confidence: 0.8 };
    }
    
    // Date pattern
    if (Date.parse(firstSample)) {
      return { type: 'datetime', confidence: 0.6 };
    }
    
    // Number pattern
    if (!isNaN(Number(firstSample))) {
      return { type: 'number', confidence: 0.5 };
    }
    
    // Boolean pattern
    if (['true', 'false', 'yes', 'no', '1', '0'].includes(firstSample.toLowerCase())) {
      return { type: 'boolean', confidence: 0.7 };
    }
  }

  return { type: 'text', confidence: 0.3 };
}

/**
 * Infer field type from JSON value
 */
function inferFieldTypeFromValue(key: string, value: any): { type: string; confidence: number } {
  const lowerKey = key.toLowerCase();

  // Key-based detection
  if (lowerKey.includes('phone') || lowerKey.includes('number')) {
    return { type: 'phone_number', confidence: 0.8 };
  }
  if (lowerKey.includes('email') || lowerKey.includes('mail')) {
    return { type: 'email', confidence: 0.9 };
  }
  if (lowerKey.includes('date') || lowerKey.includes('time')) {
    return { type: 'datetime', confidence: 0.8 };
  }

  // Value-based detection
  if (typeof value === 'number') {
    return { type: 'number', confidence: 0.9 };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', confidence: 0.9 };
  }
  if (typeof value === 'string') {
    if (/^\+?[\d\-\(\)\s]{10,}$/.test(value)) {
      return { type: 'phone_number', confidence: 0.7 };
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { type: 'email', confidence: 0.8 };
    }
    if (Date.parse(value)) {
      return { type: 'datetime', confidence: 0.6 };
    }
  }

  return { type: 'text', confidence: 0.5 };
}

/**
 * Normalize field name
 */
function normalizeFieldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Suggest target field based on normalized name and data type
 */
function suggestTargetField(normalizedName: string, dataType: string): { name: string; confidence: number; required: boolean } {
  // Phone number fields
  if (dataType === 'phone_number' || normalizedName.includes('phone') || normalizedName.includes('number')) {
    if (normalizedName.includes('caller') || normalizedName.includes('from')) {
      return { name: 'caller_number', confidence: 0.9, required: true };
    }
    if (normalizedName.includes('called') || normalizedName.includes('to')) {
      return { name: 'called_number', confidence: 0.9, required: true };
    }
    return { name: 'phone_number', confidence: 0.8, required: true };
  }

  // Date/time fields
  if (dataType === 'datetime' || normalizedName.includes('date') || normalizedName.includes('time')) {
    if (normalizedName.includes('start')) {
      return { name: 'start_time', confidence: 0.9, required: true };
    }
    if (normalizedName.includes('end')) {
      return { name: 'end_time', confidence: 0.8, required: false };
    }
    return { name: 'timestamp', confidence: 0.8, required: true };
  }

  // Duration fields
  if (normalizedName.includes('duration') || normalizedName.includes('length')) {
    return { name: 'duration', confidence: 0.9, required: false };
  }

  // Message fields
  if (normalizedName.includes('message') || normalizedName.includes('text') || normalizedName.includes('content')) {
    return { name: 'message_content', confidence: 0.8, required: false };
  }

  // Email fields
  if (dataType === 'email' || normalizedName.includes('email') || normalizedName.includes('mail')) {
    return { name: 'email', confidence: 0.9, required: false };
  }

  // Default mapping
  return { name: normalizedName, confidence: 0.5, required: false };
}

/**
 * Get standard target fields for format/carrier
 */
function getStandardTargetFields(format: string, carrier?: string): any[] {
  const standardFields = [
    { name: 'caller_number', type: 'phone_number', required: true, description: 'Calling party phone number' },
    { name: 'called_number', type: 'phone_number', required: true, description: 'Called party phone number' },
    { name: 'timestamp', type: 'datetime', required: true, description: 'Call/message timestamp' },
    { name: 'duration', type: 'number', required: false, description: 'Call duration in seconds' },
    { name: 'call_type', type: 'text', required: false, description: 'Type of call (incoming, outgoing, missed)' },
    { name: 'message_content', type: 'text', required: false, description: 'SMS message content' },
    { name: 'message_type', type: 'text', required: false, description: 'Type of message (SMS, MMS)' },
    { name: 'location', type: 'text', required: false, description: 'Call location or tower information' },
    { name: 'carrier_info', type: 'text', required: false, description: 'Carrier-specific information' },
  ];

  // Add carrier-specific fields
  if (carrier === 'att') {
    standardFields.push(
      { name: 'att_cell_tower', type: 'text', required: false, description: 'AT&T cell tower information' },
      { name: 'att_billing_code', type: 'text', required: false, description: 'AT&T billing code' }
    );
  } else if (carrier === 'verizon') {
    standardFields.push(
      { name: 'vzw_location_id', type: 'text', required: false, description: 'Verizon location ID' },
      { name: 'vzw_call_reference', type: 'text', required: false, description: 'Verizon call reference number' }
    );
  }

  return standardFields;
}

/**
 * Get suggested transformations for data type
 */
function getSuggestedTransformations(dataType: string): any[] {
  switch (dataType) {
    case 'phone_number':
      return [
        { name: 'normalize_phone', description: 'Normalize phone number format', enabled: true },
        { name: 'remove_formatting', description: 'Remove formatting characters', enabled: true },
      ];
    case 'datetime':
      return [
        { name: 'parse_date', description: 'Parse date into standard format', enabled: true },
        { name: 'convert_timezone', description: 'Convert to UTC timezone', enabled: false },
      ];
    case 'text':
      return [
        { name: 'trim_whitespace', description: 'Remove leading/trailing whitespace', enabled: true },
        { name: 'normalize_case', description: 'Normalize text case', enabled: false },
      ];
    default:
      return [];
  }
}

/**
 * Get suggested validations for data type and samples
 */
function getSuggestedValidations(dataType: string, samples: string[]): any[] {
  const validations: any[] = [];

  switch (dataType) {
    case 'phone_number':
      validations.push(
        { name: 'phone_format', description: 'Validate phone number format', pattern: '^\\+?[\\d\\-\\(\\)\\s]{10,}$' },
        { name: 'min_length', description: 'Minimum length validation', value: 10 }
      );
      break;
    case 'email':
      validations.push(
        { name: 'email_format', description: 'Validate email format', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }
      );
      break;
    case 'datetime':
      validations.push(
        { name: 'date_range', description: 'Validate date is within reasonable range', enabled: true }
      );
      break;
  }

  if (samples.length > 0) {
    const maxLength = Math.max(...samples.map(s => s.length));
    const minLength = Math.min(...samples.map(s => s.length));
    
    if (maxLength > minLength) {
      validations.push(
        { name: 'length_range', description: `Length between ${minLength} and ${maxLength} characters`, min: minLength, max: maxLength }
      );
    }
  }

  return validations;
}

/**
 * Generate validation suggestions for all fields
 */
function generateValidationSuggestions(fields: any[]): any[] {
  const suggestions: any[] = [];

  // Check for required fields
  const phoneFields = fields.filter(f => f.data_type === 'phone_number');
  if (phoneFields.length >= 2) {
    suggestions.push({
      type: 'required_fields',
      message: 'Consider marking phone number fields as required',
      fields: phoneFields.map(f => f.name),
    });
  }

  // Check for date fields
  const dateFields = fields.filter(f => f.data_type === 'datetime');
  if (dateFields.length > 0) {
    suggestions.push({
      type: 'date_validation',
      message: 'Add date range validation to prevent future dates or very old dates',
      fields: dateFields.map(f => f.name),
    });
  }

  // Check for potential duplicates
  const fieldNames = fields.map(f => f.normalized_name.toLowerCase());
  const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
  if (duplicates.length > 0) {
    suggestions.push({
      type: 'duplicate_fields',
      message: 'Review potential duplicate field mappings',
      fields: duplicates,
    });
  }

  return suggestions;
}