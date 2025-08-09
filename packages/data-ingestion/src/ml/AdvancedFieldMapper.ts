/**
 * Advanced Field Mapping Service
 * Provides intelligent field mapping with confidence scoring and machine learning
 */

import { z } from 'zod';
import { Event, Contact } from '@phonelogai/types';
import { FieldMapping, CarrierType, FileFormat } from '../types';
import logger from '../utils/logger';
import { isError, getErrorMessage } from '../utils/errorUtils';

// Validation schemas
const FieldMappingRequestSchema = z.object({
  headers: z.array(z.string()),
  sampleData: z.array(z.array(z.string())).optional(),
  carrier: z.enum(['att', 'verizon', 'tmobile', 'sprint', 'unknown']).optional(),
  fileFormat: z.enum(['pdf', 'csv', 'xlsx', 'xls', 'json', 'txt', 'unknown']).optional(),
  existingMappings: z.record(z.string(), z.string()).optional()
});

type FieldMappingRequest = z.infer<typeof FieldMappingRequestSchema>;

interface FieldMappingResult {
  mappings: FieldMapping[];
  confidence: number;
  suggestions: FieldMappingSuggestion[];
  unmappedFields: string[];
  carrierTemplate?: string;
}

interface FieldMappingSuggestion {
  sourceField: string;
  targetField: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    field: string;
    confidence: number;
  }>;
}

interface CarrierTemplate {
  id: string;
  carrier: CarrierType;
  name: string;
  commonHeaders: Record<string, string[]>;
  fieldPatterns: Record<string, RegExp[]>;
  dataValidation: Record<string, (value: any) => boolean>;
}

/**
 * Advanced Field Mapping Service
 * Uses ML techniques and pattern matching for intelligent field mapping
 */
export class AdvancedFieldMapper {
  private readonly carrierTemplates: Map<CarrierType, CarrierTemplate>;
  private readonly targetFields: Record<string, any>;
  
  constructor() {
    this.carrierTemplates = new Map();
    this.targetFields = this.initializeTargetFields();
    this.initializeCarrierTemplates();
  }
  
  /**
   * Generate field mappings with confidence scoring
   */
  async generateFieldMappings(request: FieldMappingRequest): Promise<FieldMappingResult> {
    try {
      const validatedRequest = FieldMappingRequestSchema.parse(request);
      
      logger.info('Generating field mappings', {
        headerCount: validatedRequest.headers.length,
        carrier: validatedRequest.carrier,
        format: validatedRequest.fileFormat
      });
      
      // Step 1: Apply carrier-specific templates if available
      let mappings: FieldMapping[] = [];
      let confidence = 0;
      let carrierTemplate: string | undefined;
      
      if (validatedRequest.carrier && validatedRequest.carrier !== 'unknown') {
        const templateResult = this.applyCarrierTemplate(
          validatedRequest.headers,
          validatedRequest.carrier,
          validatedRequest.sampleData
        );
        mappings = templateResult.mappings;
        confidence = templateResult.confidence;
        carrierTemplate = templateResult.templateId;
      }
      
      // Step 2: Apply generic pattern matching for unmapped fields
      const unmappedHeaders = validatedRequest.headers.filter(header => 
        !mappings.find(m => m.source_field === header)
      );
      
      if (unmappedHeaders.length > 0) {
        const patternMappings = this.applyPatternMatching(
          unmappedHeaders,
          validatedRequest.sampleData
        );
        mappings.push(...patternMappings);
      }
      
      // Step 3: Apply ML-based similarity matching
      const stillUnmapped = validatedRequest.headers.filter(header => 
        !mappings.find(m => m.source_field === header)
      );
      
      if (stillUnmapped.length > 0) {
        const similarityMappings = this.applySimilarityMatching(stillUnmapped);
        mappings.push(...similarityMappings);
      }
      
      // Step 4: Generate suggestions for review
      const suggestions = this.generateSuggestions(validatedRequest.headers, mappings);
      
      // Step 5: Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(mappings, validatedRequest.headers);
      
      // Step 6: Identify completely unmapped fields
      const unmappedFields = validatedRequest.headers.filter(header => 
        !mappings.find(m => m.source_field === header)
      );
      
      const result: FieldMappingResult = {
        mappings,
        confidence: overallConfidence,
        suggestions,
        unmappedFields,
        carrierTemplate
      };
      
      logger.info('Field mapping completed', {
        totalMappings: mappings.length,
        confidence: overallConfidence,
        unmappedCount: unmappedFields.length
      });
      
      return result;
      
    } catch (error) {
      logger.error('Field mapping failed', {
        error: getErrorMessage(error),
        stack: isError(error) ? error.stack : undefined
      });
      throw error;
    }
  }
  
  /**
   * Apply carrier-specific template
   */
  private applyCarrierTemplate(
    headers: string[],
    carrier: CarrierType,
    sampleData?: string[][]
  ): { mappings: FieldMapping[]; confidence: number; templateId: string } {
    const template = this.carrierTemplates.get(carrier);
    if (!template) {
      return { mappings: [], confidence: 0, templateId: '' };
    }
    
    const mappings: FieldMapping[] = [];
    let totalMatches = 0;
    
    headers.forEach(header => {
      const headerLower = header.toLowerCase().trim();
      
      // Check each target field for matches
      Object.entries(template.commonHeaders).forEach(([targetField, patterns]) => {
        const matchScore = this.calculateHeaderMatchScore(headerLower, patterns);
        
        if (matchScore > 0.7) {
          // Validate with sample data if available
          let dataValidation = 1.0;
          if (sampleData && template.dataValidation[targetField]) {
            dataValidation = this.validateSampleData(
              sampleData,
              headers.indexOf(header),
              template.dataValidation[targetField]
            );
          }
          
          const finalConfidence = matchScore * dataValidation;
          
          mappings.push({
            source_field: header,
            target_field: targetField as keyof Event | keyof Contact,
            data_type: this.inferDataType(targetField),
            transformation: this.getTransformationFunction(targetField),
            confidence: finalConfidence,
            is_required: this.isRequiredField(targetField)
          });
          
          totalMatches++;
        }
      });
    });
    
    const confidence = totalMatches / headers.length;
    
    return {
      mappings,
      confidence,
      templateId: template.id
    };
  }
  
  /**
   * Apply pattern matching for field detection
   */
  private applyPatternMatching(
    headers: string[],
    sampleData?: string[][]
  ): FieldMapping[] {
    const mappings: FieldMapping[] = [];
    
    // Pattern definitions for common fields
    const patterns = {
      phone_number: {
        header: [/phone|number|caller|recipient|from|to|contact/i],
        data: [/^\+?1?[-.\s()]?\d{3}[-.\s()]?\d{3}[-.\s()]?\d{4}$/],
        confidence: 0.8
      },
      contact_name: {
        header: [/name|contact|person|caller.*name|recipient.*name/i],
        data: [/^[a-zA-Z\s'-]{2,50}$/],
        confidence: 0.7
      },
      start_time: {
        header: [/date|time|timestamp|start|begin|when/i],
        data: [/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/, /^\d{4}-\d{2}-\d{2}/, /\d{1,2}:\d{2}/],
        confidence: 0.8
      },
      duration_seconds: {
        header: [/duration|length|time|seconds|mins|hours/i],
        data: [/^\d+$/, /^\d{1,2}:\d{2}(?::\d{2})?$/],
        confidence: 0.8
      },
      event_type: {
        header: [/type|direction|call.*type|category/i],
        data: [/^(incoming|outgoing|missed|voice|sms|text|data)$/i],
        confidence: 0.9
      }
    };
    
    headers.forEach(header => {
      const headerLower = header.toLowerCase().trim();
      
      Object.entries(patterns).forEach(([targetField, pattern]) => {
        // Check header patterns
        const headerMatch = pattern.header.some(regex => regex.test(headerLower));
        
        if (headerMatch) {
          let confidence = pattern.confidence;
          
          // Validate with sample data if available
          if (sampleData) {
            const headerIndex = headers.findIndex(h => h === header);
            const dataValidation = this.validatePatternWithSampleData(
              sampleData,
              headerIndex,
              pattern.data
            );
            confidence *= dataValidation;
          }
          
          if (confidence > 0.5) {
            mappings.push({
              source_field: header,
              target_field: targetField as keyof Event | keyof Contact,
              data_type: this.inferDataType(targetField),
              transformation: this.getTransformationFunction(targetField),
              confidence,
              is_required: this.isRequiredField(targetField)
            });
          }
        }
      });
    });
    
    return mappings;
  }
  
  /**
   * Apply similarity matching using string similarity algorithms
   */
  private applySimilarityMatching(headers: string[]): FieldMapping[] {
    const mappings: FieldMapping[] = [];
    const targetFieldNames = Object.keys(this.targetFields);
    
    headers.forEach(header => {
      const headerLower = header.toLowerCase().trim();
      let bestMatch: { field: string; score: number } | null = null;
      
      targetFieldNames.forEach(targetField => {
        const score = this.calculateStringSimilarity(headerLower, targetField);
        
        if (score > 0.6 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { field: targetField, score };
        }
      });
      
      if (bestMatch && bestMatch.score > 0.6) {
        const matchedField = bestMatch.field;
        const matchedScore = bestMatch.score;
        mappings.push({
          source_field: header,
          target_field: matchedField as keyof Event | keyof Contact,
          data_type: this.inferDataType(matchedField),
          transformation: this.getTransformationFunction(matchedField),
          confidence: matchedScore * 0.7, // Reduce confidence for similarity matching
          is_required: this.isRequiredField(matchedField)
        });
      }
    });
    
    return mappings;
  }
  
  /**
   * Generate suggestions for user review
   */
  private generateSuggestions(
    headers: string[],
    mappings: FieldMapping[]
  ): FieldMappingSuggestion[] {
    const suggestions: FieldMappingSuggestion[] = [];
    const targetFieldNames = Object.keys(this.targetFields);
    
    // Generate suggestions for low-confidence mappings
    mappings.forEach(mapping => {
      if (mapping.confidence < 0.8) {
        const alternatives: Array<{ field: string; confidence: number }> = [];
        
        targetFieldNames.forEach(targetField => {
          if (targetField !== mapping.target_field) {
            const similarity = this.calculateStringSimilarity(
              mapping.source_field.toLowerCase(),
              targetField
            );
            
            if (similarity > 0.4) {
              alternatives.push({
                field: targetField,
                confidence: similarity * 0.8
              });
            }
          }
        });
        
        alternatives.sort((a, b) => b.confidence - a.confidence);
        
        suggestions.push({
          sourceField: mapping.source_field,
          targetField: mapping.target_field,
          confidence: mapping.confidence,
          reasoning: this.generateMappingReasoning(mapping),
          alternatives: alternatives.slice(0, 3) // Top 3 alternatives
        });
      }
    });
    
    return suggestions;
  }
  
  // Helper methods
  
  private calculateHeaderMatchScore(header: string, patterns: string[]): number {
    let maxScore = 0;
    
    patterns.forEach(pattern => {
      const patternLower = pattern.toLowerCase();
      
      // Exact match
      if (header === patternLower) {
        maxScore = Math.max(maxScore, 1.0);
      }
      // Contains match
      else if (header.includes(patternLower) || patternLower.includes(header)) {
        maxScore = Math.max(maxScore, 0.8);
      }
      // Partial word match
      else {
        const words = header.split(/[\s_-]+/);
        const patternWords = patternLower.split(/[\s_-]+/);
        
        let wordMatches = 0;
        words.forEach(word => {
          if (patternWords.some(pw => pw.includes(word) || word.includes(pw))) {
            wordMatches++;
          }
        });
        
        if (wordMatches > 0) {
          maxScore = Math.max(maxScore, (wordMatches / Math.max(words.length, patternWords.length)) * 0.6);
        }
      }
    });
    
    return maxScore;
  }
  
  private validateSampleData(
    sampleData: string[][],
    columnIndex: number,
    validator: (value: any) => boolean
  ): number {
    if (!sampleData || columnIndex >= sampleData[0]?.length) {
      return 1.0; // No data to validate
    }
    
    let validCount = 0;
    let totalCount = 0;
    
    sampleData.forEach(row => {
      if (row[columnIndex] && row[columnIndex].trim()) {
        totalCount++;
        if (validator(row[columnIndex])) {
          validCount++;
        }
      }
    });
    
    return totalCount > 0 ? validCount / totalCount : 1.0;
  }
  
  private validatePatternWithSampleData(
    sampleData: string[][],
    columnIndex: number,
    patterns: RegExp[]
  ): number {
    if (!sampleData || columnIndex >= sampleData[0]?.length) {
      return 1.0;
    }
    
    let matchCount = 0;
    let totalCount = 0;
    
    sampleData.forEach(row => {
      if (row[columnIndex] && row[columnIndex].trim()) {
        totalCount++;
        const value = row[columnIndex].trim();
        
        if (patterns.some(pattern => pattern.test(value))) {
          matchCount++;
        }
      }
    });
    
    return totalCount > 0 ? matchCount / totalCount : 1.0;
  }
  
  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance-based similarity
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;
    
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,    // deletion
          matrix[j - 1][i] + 1,    // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }
    
    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len2][len1]) / maxLen;
  }
  
  private calculateOverallConfidence(mappings: FieldMapping[], headers: string[]): number {
    if (mappings.length === 0) return 0;
    
    const mappedRatio = mappings.length / headers.length;
    const avgConfidence = mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length;
    
    // Required fields bonus
    const requiredFields = ['phone_number', 'start_time'];
    const requiredMapped = requiredFields.filter(field => 
      mappings.some(m => m.target_field === field && m.confidence > 0.7)
    ).length;
    const requiredBonus = requiredMapped / requiredFields.length * 0.2;
    
    return Math.min(1.0, mappedRatio * 0.4 + avgConfidence * 0.6 + requiredBonus);
  }
  
  private generateMappingReasoning(mapping: FieldMapping): string {
    if (mapping.confidence > 0.9) {
      return `High confidence match based on field name similarity`;
    } else if (mapping.confidence > 0.7) {
      return `Good match based on header pattern and data validation`;
    } else if (mapping.confidence > 0.5) {
      return `Moderate confidence - please review and confirm`;
    } else {
      return `Low confidence mapping - manual review recommended`;
    }
  }
  
  private initializeTargetFields(): Record<string, any> {
    return {
      // Event fields
      phone_number: { type: 'string', required: true },
      contact_name: { type: 'string', required: false },
      event_type: { type: 'string', required: true },
      start_time: { type: 'date', required: true },
      end_time: { type: 'date', required: false },
      duration_seconds: { type: 'number', required: false },
      direction: { type: 'string', required: false },
      call_status: { type: 'string', required: false },
      
      // Contact fields
      contact_phone: { type: 'string', required: false },
      contact_email: { type: 'string', required: false },
      contact_address: { type: 'string', required: false }
    };
  }
  
  private initializeCarrierTemplates(): void {
    // AT&T Template
    this.carrierTemplates.set(CarrierType.ATT, {
      id: 'att_template_v1',
      carrier: CarrierType.ATT,
      name: 'AT&T Standard Template',
      commonHeaders: {
        phone_number: ['phone number', 'caller id', 'number called', 'phone', 'number'],
        contact_name: ['name', 'caller name', 'contact name'],
        start_time: ['date', 'call date', 'timestamp', 'date/time'],
        duration_seconds: ['duration', 'call duration', 'talk time'],
        event_type: ['type', 'call type', 'record type'],
        direction: ['direction', 'in/out', 'call direction']
      },
      fieldPatterns: {
        phone_number: [/^\d{3}-\d{3}-\d{4}$/, /^\(\d{3}\) \d{3}-\d{4}$/],
        start_time: [/^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2}:\d{2} (AM|PM)$/],
        event_type: [/^(Voice|SMS|Data)$/i]
      },
      dataValidation: {
        phone_number: (value) => /^\+?1?[-.\s()]?\d{3}[-.\s()]?\d{3}[-.\s()]?\d{4}$/.test(String(value)),
        event_type: (value) => /^(voice|sms|data|incoming|outgoing)$/i.test(String(value))
      }
    });
    
    // Verizon Template
    this.carrierTemplates.set(CarrierType.VERIZON, {
      id: 'verizon_template_v1',
      carrier: CarrierType.VERIZON,
      name: 'Verizon Standard Template',
      commonHeaders: {
        phone_number: ['mobile number', 'device number', 'phone', 'number'],
        contact_name: ['contact', 'name', 'caller'],
        start_time: ['date & time', 'call start', 'timestamp'],
        duration_seconds: ['usage', 'duration', 'minutes'],
        event_type: ['feature', 'service type', 'activity type']
      },
      fieldPatterns: {
        phone_number: [/^\(\d{3}\) \d{3}-\d{4}$/, /^\d{3}\.\d{3}\.\d{4}$/],
        start_time: [/^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2} (AM|PM)$/]
      },
      dataValidation: {
        phone_number: (value) => /^\+?1?[-.\s()]?\d{3}[-.\s()]?\d{3}[-.\s()]?\d{4}$/.test(String(value)),
        event_type: (value) => /^(call|text|data|voice|sms)$/i.test(String(value))
      }
    });
    
    // T-Mobile Template
    this.carrierTemplates.set(CarrierType.TMOBILE, {
      id: 'tmobile_template_v1',
      carrier: CarrierType.TMOBILE,
      name: 'T-Mobile Standard Template',
      commonHeaders: {
        phone_number: ['phone number', 'from', 'to', 'number'],
        contact_name: ['contact name', 'name'],
        start_time: ['date', 'time', 'call date & time'],
        duration_seconds: ['call duration', 'duration', 'length'],
        event_type: ['call type', 'type', 'activity']
      },
      fieldPatterns: {
        phone_number: [/^\d{10}$/, /^\+1\d{10}$/],
        start_time: [/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/]
      },
      dataValidation: {
        phone_number: (value) => /^\+?1?\d{10}$/.test(String(value).replace(/\D/g, '')),
        event_type: (value) => /^(voice|sms|mms|data)$/i.test(String(value))
      }
    });
  }
  
  private inferDataType(fieldName: string): 'string' | 'number' | 'date' | 'boolean' {
    if (fieldName.includes('time') || fieldName.includes('date')) {
      return 'date';
    } else if (fieldName.includes('duration') || fieldName.includes('count') || fieldName.includes('seconds')) {
      return 'number';
    } else {
      return 'string';
    }
  }
  
  private getTransformationFunction(fieldName: string): string | undefined {
    if (fieldName.includes('phone')) {
      return 'normalizePhoneNumber';
    } else if (fieldName.includes('time') || fieldName.includes('date')) {
      return 'parseDateTime';
    } else if (fieldName.includes('duration')) {
      return 'parseDuration';
    }
    
    return undefined;
  }
  
  private isRequiredField(fieldName: string): boolean {
    const requiredFields = ['phone_number', 'start_time', 'event_type'];
    return requiredFields.includes(fieldName);
  }
}

// Export singleton instance
export const advancedFieldMapper = new AdvancedFieldMapper();