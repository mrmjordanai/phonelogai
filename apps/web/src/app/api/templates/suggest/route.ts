import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';

// ML suggestion request schema
const suggestionRequestSchema = z.object({
  file_content: z.string().optional(),
  file_sample: z.string().optional(), // First few lines/pages of content
  file_format: z.enum(['csv', 'pdf', 'txt', 'xlsx', 'json']),
  filename: z.string().min(1),
  file_size: z.number().positive().optional(),
  carrier_hint: z.string().optional(), // User-provided hint about carrier
  additional_context: z.string().optional(),
});

/**
 * POST /api/templates/suggest
 * 
 * Get ML-powered template suggestions based on file content
 */
export async function POST(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'templates', 'read');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const requestData = await request.json();

    // Validate request data
    const validation = suggestionRequestSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const { file_content, file_sample, file_format, filename, file_size, carrier_hint, additional_context } = validation.data;

    // Ensure we have some content to analyze
    const contentToAnalyze = file_content || file_sample;
    if (!contentToAnalyze) {
      return NextResponse.json(
        { error: 'Either file_content or file_sample is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Step 1: Get existing templates for comparison
    const { data: existingTemplates, error: templatesError } = await supabase
      .from('parsing_templates')
      .select('*')
      .eq('file_format', file_format)
      .eq('is_active', true)
      .or(`user_id.eq.${user.id},is_public.eq.true,shared_with_org.eq.true`);

    if (templatesError) {
      console.error('Failed to fetch existing templates:', templatesError);
    }

    // Step 2: Call ML service for layout classification and field detection
    const mlAnalysisResult = await performMLAnalysis({
      content: contentToAnalyze,
      file_format,
      filename,
      file_size,
      carrier_hint,
      existing_templates: existingTemplates || [],
    });

    // Step 3: Find similar existing templates based on ML analysis
    const similarTemplates = await findSimilarTemplates(
      mlAnalysisResult.detected_fields,
      mlAnalysisResult.detected_carrier,
      file_format,
      existingTemplates || []
    );

    // Step 4: Generate new template suggestions if no exact match
    const newTemplateSuggestions = await generateNewTemplateSuggestions(
      mlAnalysisResult,
      file_format,
      filename,
      carrier_hint
    );

    // Step 5: Rank and format all suggestions
    const allSuggestions = [
      ...similarTemplates.map(template => ({
        type: 'existing_template',
        template_id: template.id,
        confidence: calculateTemplateConfidence(template, mlAnalysisResult),
        ...template,
      })),
      ...newTemplateSuggestions,
    ];

    // Sort by confidence score
    allSuggestions.sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json({
      success: true,
      ml_analysis: {
        detected_carrier: mlAnalysisResult.detected_carrier,
        detected_format_variant: mlAnalysisResult.format_variant,
        detected_fields: mlAnalysisResult.detected_fields,
        content_structure: mlAnalysisResult.structure,
        analysis_confidence: mlAnalysisResult.confidence,
        processing_time_ms: mlAnalysisResult.processing_time,
      },
      suggestions: allSuggestions.slice(0, 10), // Return top 10 suggestions
      summary: {
        total_suggestions: allSuggestions.length,
        existing_templates: similarTemplates.length,
        new_template_suggestions: newTemplateSuggestions.length,
        highest_confidence: allSuggestions.length > 0 ? allSuggestions[0].confidence : 0,
        recommendation: allSuggestions.length > 0 
          ? (allSuggestions[0].confidence > 0.8 
              ? 'high_confidence_match' 
              : allSuggestions[0].confidence > 0.5
                ? 'moderate_confidence_match'
                : 'low_confidence_create_new')
          : 'create_new',
      },
      next_steps: {
        use_existing: allSuggestions.find(s => s.type === 'existing_template' && s.confidence > 0.7)?.template_id,
        create_new_endpoint: '/api/templates',
        manual_mapping_endpoint: '/api/templates/mapping',
        test_template_endpoint: '/api/templates/test',
      },
    });

  } catch (error) {
    console.error('Template suggestion error:', error);
    
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
 * Perform ML analysis on file content
 */
async function performMLAnalysis(params: {
  content: string;
  file_format: string;
  filename: string;
  file_size?: number;
  carrier_hint?: string;
  existing_templates: any[];
}): Promise<any> {
  const { content, file_format, filename, carrier_hint } = params;

  // In a real implementation, this would call the Python ML workers
  // For now, we'll simulate ML analysis based on content patterns
  
  const analysisStartTime = Date.now();

  try {
    // Simulate calling ML service
    const mlResult = await simulateMLClassification(content, file_format, filename, carrier_hint);
    
    return {
      ...mlResult,
      processing_time: Date.now() - analysisStartTime,
    };
  } catch (error) {
    console.error('ML analysis failed:', error);
    
    // Return fallback analysis
    return {
      detected_carrier: 'unknown',
      format_variant: 'standard',
      detected_fields: extractBasicFields(content, file_format),
      structure: analyzeBasicStructure(content, file_format),
      confidence: 0.3,
      processing_time: Date.now() - analysisStartTime,
      fallback_used: true,
    };
  }
}

/**
 * Simulate ML classification (replace with actual ML service call)
 */
async function simulateMLClassification(
  content: string, 
  file_format: string, 
  filename: string, 
  carrier_hint?: string
): Promise<any> {
  // Basic carrier detection based on filename and content patterns
  const detectedCarrier = detectCarrier(content, filename, carrier_hint);
  
  // Basic field detection
  const detectedFields = extractBasicFields(content, file_format);
  
  // Analyze structure
  const structure = analyzeBasicStructure(content, file_format);
  
  // Calculate confidence based on detection patterns
  const confidence = calculateMLConfidence(detectedCarrier, detectedFields, structure);

  return {
    detected_carrier: detectedCarrier,
    format_variant: detectFormatVariant(content, file_format),
    detected_fields: detectedFields,
    structure: structure,
    confidence: confidence,
  };
}

/**
 * Detect carrier from content and filename patterns
 */
function detectCarrier(content: string, filename: string, hint?: string): string {
  if (hint) return hint.toLowerCase();

  const carriers = ['att', 'verizon', 'tmobile', 'sprint'];
  const lowerContent = content.toLowerCase();
  const lowerFilename = filename.toLowerCase();

  for (const carrier of carriers) {
    if (lowerContent.includes(carrier) || lowerFilename.includes(carrier)) {
      return carrier;
    }
  }

  // Check for carrier-specific patterns
  if (lowerContent.includes('at&t') || lowerContent.includes('at and t')) return 'att';
  if (lowerContent.includes('t-mobile')) return 'tmobile';
  if (lowerContent.includes('vzw') || lowerContent.includes('wireless')) return 'verizon';

  return 'unknown';
}

/**
 * Extract basic fields from content
 */
function extractBasicFields(content: string, file_format: string): any[] {
  const fields: any[] = [];

  if (file_format === 'csv') {
    // Parse CSV header
    const lines = content.split('\n');
    if (lines.length > 0) {
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      headers.forEach((header, index) => {
        const fieldType = inferFieldType(header, lines.slice(1, 10).map(line => {
          const values = line.split(',');
          return values[index] ? values[index].trim().replace(/"/g, '') : '';
        }));

        fields.push({
          original_name: header,
          suggested_name: normalizeFieldName(header),
          column_index: index,
          data_type: fieldType.type,
          confidence: fieldType.confidence,
          sample_values: fieldType.samples,
        });
      });
    }
  } else if (file_format === 'txt') {
    // Extract fields from structured text
    const lines = content.split('\n').slice(0, 20); // Analyze first 20 lines
    
    lines.forEach((line, index) => {
      if (line.includes(':') || line.includes('=')) {
        const parts = line.split(/[:=]/, 2);
        if (parts.length === 2) {
          const key = parts[0].trim();
          const value = parts[1].trim();
          
          if (key && value) {
            fields.push({
              original_name: key,
              suggested_name: normalizeFieldName(key),
              line_number: index + 1,
              data_type: inferDataType(value),
              confidence: 0.7,
              sample_values: [value],
            });
          }
        }
      }
    });
  }

  return fields;
}

/**
 * Infer field type from header name and sample values
 */
function inferFieldType(header: string, samples: string[]): any {
  const lowerHeader = header.toLowerCase();
  const nonEmptySamples = samples.filter(s => s && s.length > 0);

  // Phone number patterns
  if (lowerHeader.includes('phone') || lowerHeader.includes('number') || lowerHeader.includes('caller')) {
    return {
      type: 'phone_number',
      confidence: 0.9,
      samples: nonEmptySamples.slice(0, 3),
    };
  }

  // Date/time patterns
  if (lowerHeader.includes('date') || lowerHeader.includes('time') || lowerHeader.includes('stamp')) {
    return {
      type: 'datetime',
      confidence: 0.8,
      samples: nonEmptySamples.slice(0, 3),
    };
  }

  // Duration patterns
  if (lowerHeader.includes('duration') || lowerHeader.includes('length')) {
    return {
      type: 'duration',
      confidence: 0.8,
      samples: nonEmptySamples.slice(0, 3),
    };
  }

  // Message content patterns
  if (lowerHeader.includes('message') || lowerHeader.includes('text') || lowerHeader.includes('content')) {
    return {
      type: 'text',
      confidence: 0.7,
      samples: nonEmptySamples.slice(0, 2), // Shorter samples for text
    };
  }

  // Infer from sample values
  if (nonEmptySamples.length > 0) {
    const firstSample = nonEmptySamples[0];
    
    // Check for phone number patterns
    if (/^\+?[\d\-\(\)\s]{10,}$/.test(firstSample)) {
      return { type: 'phone_number', confidence: 0.7, samples: nonEmptySamples.slice(0, 3) };
    }
    
    // Check for date patterns
    if (Date.parse(firstSample)) {
      return { type: 'datetime', confidence: 0.6, samples: nonEmptySamples.slice(0, 3) };
    }
    
    // Check for numeric patterns
    if (!isNaN(Number(firstSample))) {
      return { type: 'number', confidence: 0.5, samples: nonEmptySamples.slice(0, 3) };
    }
  }

  return {
    type: 'text',
    confidence: 0.3,
    samples: nonEmptySamples.slice(0, 3),
  };
}

/**
 * Normalize field name for suggestions
 */
function normalizeFieldName(originalName: string): string {
  return originalName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Infer data type from value
 */
function inferDataType(value: string): string {
  if (!value) return 'text';
  
  if (/^\+?[\d\-\(\)\s]{10,}$/.test(value)) return 'phone_number';
  if (Date.parse(value)) return 'datetime';
  if (!isNaN(Number(value))) return 'number';
  
  return 'text';
}

/**
 * Analyze basic structure of content
 */
function analyzeBasicStructure(content: string, file_format: string): any {
  const lines = content.split('\n');
  
  if (file_format === 'csv') {
    return {
      total_lines: lines.length,
      header_lines: 1,
      data_lines: lines.length - 1,
      delimiter: detectDelimiter(lines[0] || ''),
      has_quotes: content.includes('"'),
      estimated_columns: lines[0] ? lines[0].split(',').length : 0,
    };
  } else if (file_format === 'txt') {
    return {
      total_lines: lines.length,
      non_empty_lines: lines.filter(line => line.trim().length > 0).length,
      structured_lines: lines.filter(line => line.includes(':') || line.includes('=')).length,
      avg_line_length: lines.reduce((sum, line) => sum + line.length, 0) / lines.length,
    };
  }

  return {
    total_lines: lines.length,
    format: file_format,
  };
}

/**
 * Detect CSV delimiter
 */
function detectDelimiter(line: string): string {
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
 * Calculate ML confidence score
 */
function calculateMLConfidence(carrier: string, fields: any[], structure: any): number {
  let confidence = 0.3; // Base confidence

  // Boost for carrier detection
  if (carrier !== 'unknown') confidence += 0.2;

  // Boost for recognized field patterns
  const recognizedFields = fields.filter(f => f.confidence > 0.7);
  confidence += Math.min(recognizedFields.length * 0.1, 0.3);

  // Boost for structured data
  if (structure.estimated_columns > 5 || structure.structured_lines > 10) {
    confidence += 0.2;
  }

  return Math.min(confidence, 0.95);
}

/**
 * Detect format variant
 */
function detectFormatVariant(content: string, file_format: string): string {
  if (file_format === 'csv') {
    if (content.includes(';')) return 'semicolon_separated';
    if (content.includes('\t')) return 'tab_separated';
    return 'comma_separated';
  }
  
  return 'standard';
}

/**
 * Find similar existing templates
 */
async function findSimilarTemplates(
  detectedFields: any[],
  detectedCarrier: string,
  fileFormat: string,
  existingTemplates: any[]
): Promise<any[]> {
  return existingTemplates
    .filter(template => {
      // Filter by carrier and format
      if (template.carrier && detectedCarrier !== 'unknown' && template.carrier !== detectedCarrier) {
        return false;
      }
      return template.file_format === fileFormat;
    })
    .map(template => ({
      ...template,
      similarity_score: calculateTemplateSimilarity(template, detectedFields),
    }))
    .filter(template => template.similarity_score > 0.3)
    .sort((a, b) => b.similarity_score - a.similarity_score);
}

/**
 * Calculate template similarity score
 */
function calculateTemplateSimilarity(template: any, detectedFields: any[]): number {
  const templateFields = Object.keys(template.field_mappings || {});
  const detectedFieldNames = detectedFields.map(f => f.suggested_name);

  if (templateFields.length === 0 || detectedFieldNames.length === 0) {
    return 0;
  }

  const commonFields = templateFields.filter(tf => 
    detectedFieldNames.some(df => df.includes(tf) || tf.includes(df))
  );

  const similarity = commonFields.length / Math.max(templateFields.length, detectedFieldNames.length);
  return similarity;
}

/**
 * Calculate template confidence
 */
function calculateTemplateConfidence(template: any, mlResult: any): number {
  let confidence = template.similarity_score || 0;

  // Boost for carrier match
  if (template.carrier === mlResult.detected_carrier && mlResult.detected_carrier !== 'unknown') {
    confidence += 0.2;
  }

  // Boost for successful usage history
  if (template.success_rate > 0.8 && template.usage_count > 5) {
    confidence += 0.1;
  }

  return Math.min(confidence, 0.95);
}

/**
 * Generate new template suggestions
 */
async function generateNewTemplateSuggestions(
  mlResult: any,
  file_format: string,
  filename: string,
  carrier_hint?: string
): Promise<any[]> {
  const suggestions: any[] = [];

  if (mlResult.detected_fields.length > 0) {
    // Create field mappings
    const field_mappings: Record<string, any> = {};
    mlResult.detected_fields.forEach((field: any) => {
      field_mappings[field.suggested_name] = {
        source_column: field.column_index ?? field.line_number,
        data_type: field.data_type,
        required: field.confidence > 0.8,
        validation_pattern: getValidationPattern(field.data_type),
      };
    });

    suggestions.push({
      type: 'new_template',
      confidence: mlResult.confidence,
      suggested_name: `${mlResult.detected_carrier || 'Custom'} ${file_format.toUpperCase()} Template`,
      suggested_description: `Auto-generated template for ${filename}`,
      carrier: mlResult.detected_carrier !== 'unknown' ? mlResult.detected_carrier : null,
      file_format: file_format,
      field_mappings: field_mappings,
      validation_rules: generateValidationRules(mlResult.detected_fields),
      transformation_rules: generateTransformationRules(mlResult.detected_fields),
      ml_generated: true,
      source_analysis: mlResult,
    });
  }

  return suggestions;
}

/**
 * Get validation pattern for data type
 */
function getValidationPattern(dataType: string): string | null {
  switch (dataType) {
    case 'phone_number':
      return '^\\+?[\\d\\-\\(\\)\\s]{10,}$';
    case 'datetime':
      return null; // Will use Date.parse validation
    case 'number':
      return '^\\d+(\\.\\d+)?$';
    default:
      return null;
  }
}

/**
 * Generate validation rules
 */
function generateValidationRules(fields: any[]): Record<string, any> {
  const rules: Record<string, any> = {};

  fields.forEach(field => {
    if (field.confidence > 0.7) {
      rules[field.suggested_name] = {
        required: true,
        type: field.data_type,
        pattern: getValidationPattern(field.data_type),
      };
    }
  });

  return rules;
}

/**
 * Generate transformation rules
 */
function generateTransformationRules(fields: any[]): Record<string, any> {
  const rules: Record<string, any> = {};

  fields.forEach(field => {
    if (field.data_type === 'phone_number') {
      rules[field.suggested_name] = {
        normalize_phone: true,
        remove_formatting: true,
      };
    } else if (field.data_type === 'datetime') {
      rules[field.suggested_name] = {
        parse_date: true,
        output_format: 'ISO8601',
      };
    }
  });

  return rules;
}