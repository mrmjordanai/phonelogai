import { Event, ConflictType } from '@phonelogai/types';

export interface PhoneNumber {
  original: string;
  normalized: string;
  countryCode?: string;
}

export interface FuzzyMatchResult {
  similarity: number;
  matchingFields: string[];
  conflictType: ConflictType;
  confidence: number;
}

export interface DetectionOptions {
  timestampTolerance: number; // seconds
  durationTolerance: number; // seconds  
  contentSimilarityThreshold: number; // 0-1
  phoneNumberFuzzyMatch: boolean;
  enableE164Normalization: boolean;
}

class DuplicateDetectorService {
  private static instance: DuplicateDetectorService;
  private readonly DEFAULT_OPTIONS: DetectionOptions = {
    timestampTolerance: 1,
    durationTolerance: 1,
    contentSimilarityThreshold: 0.85,
    phoneNumberFuzzyMatch: true,
    enableE164Normalization: true
  };

  private constructor() {}

  public static getInstance(): DuplicateDetectorService {
    if (!DuplicateDetectorService.instance) {
      DuplicateDetectorService.instance = new DuplicateDetectorService();
    }
    return DuplicateDetectorService.instance;
  }

  /**
   * Advanced duplicate detection with fuzzy matching
   */
  public detectAdvancedDuplicates(
    newEvent: Event,
    candidateEvents: Event[],
    options: Partial<DetectionOptions> = {}
  ): FuzzyMatchResult[] {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const results: FuzzyMatchResult[] = [];

    for (const candidate of candidateEvents) {
      const result = this.compareEvents(newEvent, candidate, opts);
      if (result.similarity > 0.7) { // Only include likely matches
        results.push(result);
      }
    }

    // Sort by similarity (highest first)
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Normalize phone number to E.164 format
   */
  public normalizePhoneNumber(phoneNumber: string, defaultCountryCode: string = 'US'): PhoneNumber {
    const original = phoneNumber;
    
    // Remove all non-digit characters except + 
    let normalized = phoneNumber.replace(/[^\d+]/g, '');
    
    // Handle common US formats
    if (normalized.length === 10 && !normalized.startsWith('+')) {
      normalized = `+1${normalized}`;
    } else if (normalized.length === 11 && normalized.startsWith('1')) {
      normalized = `+${normalized}`;
    } else if (!normalized.startsWith('+') && normalized.length > 10) {
      normalized = `+${normalized}`;
    }

    // Extract country code
    let countryCode = defaultCountryCode;
    if (normalized.startsWith('+1')) {
      countryCode = 'US';
    } else if (normalized.startsWith('+44')) {
      countryCode = 'GB';
    } else if (normalized.startsWith('+49')) {
      countryCode = 'DE';
    }
    // Add more country codes as needed

    return {
      original,
      normalized,
      countryCode
    };
  }

  /**
   * Compare two phone numbers for similarity
   */
  public comparePhoneNumbers(phone1: string, phone2: string): number {
    const norm1 = this.normalizePhoneNumber(phone1);
    const norm2 = this.normalizePhoneNumber(phone2);

    // Exact match on normalized numbers
    if (norm1.normalized === norm2.normalized) {
      return 1.0;
    }

    // Check if one is a subset of the other (handles area code differences)
    const digits1 = norm1.normalized.replace(/\D/g, '');
    const digits2 = norm2.normalized.replace(/\D/g, '');

    if (digits1.includes(digits2) || digits2.includes(digits1)) {
      const overlap = Math.min(digits1.length, digits2.length);
      const total = Math.max(digits1.length, digits2.length);
      return overlap / total;
    }

    // Fuzzy match based on digit similarity
    return this.calculateDigitSimilarity(digits1, digits2);
  }

  /**
   * Calculate SMS content similarity using enhanced Levenshtein
   */
  public compareContent(content1?: string, content2?: string): number {
    if (!content1 || !content2) return content1 === content2 ? 1.0 : 0.0;
    if (content1 === content2) return 1.0;

    // Normalize content (lowercase, trim whitespace)
    const norm1 = content1.toLowerCase().trim();
    const norm2 = content2.toLowerCase().trim();

    if (norm1 === norm2) return 1.0;

    // Use Levenshtein distance with length normalization
    const maxLength = Math.max(norm1.length, norm2.length);
    if (maxLength === 0) return 1.0;

    const distance = this.levenshteinDistance(norm1, norm2);
    return Math.max(0, (maxLength - distance) / maxLength);
  }

  /**
   * Compare timestamp with tolerance handling
   */
  public compareTimestamps(ts1: string, ts2: string, toleranceSeconds: number): {
    similarity: number;
    withinTolerance: boolean;
    timeDiffSeconds: number;
  } {
    const time1 = new Date(ts1).getTime();
    const time2 = new Date(ts2).getTime();
    const diffMs = Math.abs(time1 - time2);
    const diffSeconds = diffMs / 1000;

    const withinTolerance = diffSeconds <= toleranceSeconds;
    const similarity = withinTolerance ? 
      Math.max(0, 1 - (diffSeconds / toleranceSeconds)) : 
      Math.max(0, 1 - (diffSeconds / (toleranceSeconds * 10))); // Decay over 10x tolerance

    return {
      similarity,
      withinTolerance,
      timeDiffSeconds: diffSeconds
    };
  }

  /**
   * Compare call durations with tolerance
   */
  public compareDurations(duration1?: number, duration2?: number, toleranceSeconds: number = 1): number {
    // Handle null/undefined durations
    if (duration1 === undefined && duration2 === undefined) return 1.0;
    if (duration1 === undefined || duration2 === undefined) return 0.0;

    const diff = Math.abs(duration1 - duration2);
    if (diff <= toleranceSeconds) return 1.0;

    // Gradual decay based on percentage difference
    const avgDuration = (duration1 + duration2) / 2;
    const percentDiff = diff / Math.max(avgDuration, 1);
    
    return Math.max(0, 1 - percentDiff);
  }

  /**
   * Comprehensive event comparison
   */
  private compareEvents(event1: Event, event2: Event, options: DetectionOptions): FuzzyMatchResult {
    const matchingFields: string[] = [];
    let totalSimilarity = 0;
    let weights = 0;

    // Core field comparisons
    const coreChecks = [
      { field: 'line_id', weight: 0.2, match: event1.line_id === event2.line_id },
      { field: 'direction', weight: 0.1, match: event1.direction === event2.direction },
      { field: 'type', weight: 0.1, match: event1.type === event2.type }
    ];

    for (const check of coreChecks) {
      if (check.match) {
        matchingFields.push(check.field);
        totalSimilarity += check.weight;
      }
      weights += check.weight;
    }

    // If core fields don't match well enough, it's not a duplicate
    if (totalSimilarity < 0.3) {
      return {
        similarity: 0,
        matchingFields: [],
        conflictType: 'fuzzy',
        confidence: 0
      };
    }

    // Phone number comparison
    const phoneSimilarity = this.comparePhoneNumbers(event1.number, event2.number);
    if (phoneSimilarity > 0.8) {
      matchingFields.push('number');
      totalSimilarity += 0.25 * phoneSimilarity;
    }
    weights += 0.25;

    // Timestamp comparison
    const timestampComp = this.compareTimestamps(event1.ts, event2.ts, options.timestampTolerance);
    if (timestampComp.similarity > 0.5) {
      matchingFields.push('timestamp');
      totalSimilarity += 0.25 * timestampComp.similarity;
    }
    weights += 0.25;

    // Duration comparison (for calls)
    if (event1.type === 'call' && event2.type === 'call') {
      const durationSimilarity = this.compareDurations(event1.duration, event2.duration, options.durationTolerance);
      if (durationSimilarity > 0.5) {
        matchingFields.push('duration');
        totalSimilarity += 0.1 * durationSimilarity;
      }
      weights += 0.1;
    }

    // Content comparison (for SMS)
    if (event1.type === 'sms' && event2.type === 'sms') {
      const contentSimilarity = this.compareContent(event1.content, event2.content);
      if (contentSimilarity > options.contentSimilarityThreshold) {
        matchingFields.push('content');
        totalSimilarity += 0.1 * contentSimilarity;
      }
      weights += 0.1;
    }

    // Contact ID comparison (if available)
    if (event1.contact_id && event2.contact_id) {
      const contactMatch = event1.contact_id === event2.contact_id;
      if (contactMatch) {
        matchingFields.push('contact_id');
        totalSimilarity += 0.1;
      }
      weights += 0.1;
    }

    const normalizedSimilarity = weights > 0 ? totalSimilarity / weights : 0;

    // Determine conflict type
    let conflictType: ConflictType = 'fuzzy';
    if (normalizedSimilarity >= 0.95 && timestampComp.timeDiffSeconds <= 1) {
      conflictType = 'exact';
    } else if (timestampComp.withinTolerance && normalizedSimilarity >= 0.85) {
      conflictType = 'time_variance';
    }

    return {
      similarity: normalizedSimilarity,
      matchingFields,
      conflictType,
      confidence: normalizedSimilarity * (matchingFields.length / 6) // Adjust confidence based on number of matching fields
    };
  }

  /**
   * Calculate digit-only similarity for phone numbers
   */
  private calculateDigitSimilarity(digits1: string, digits2: string): number {
    const maxLength = Math.max(digits1.length, digits2.length);
    if (maxLength === 0) return 1.0;

    let matchingDigits = 0;
    const minLength = Math.min(digits1.length, digits2.length);

    // Count matching digits from the end (most significant for phone numbers)
    for (let i = 0; i < minLength; i++) {
      if (digits1[digits1.length - 1 - i] === digits2[digits2.length - 1 - i]) {
        matchingDigits++;
      }
    }

    return matchingDigits / maxLength;
  }

  /**
   * Enhanced Levenshtein distance calculation
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Batch process events for duplicate detection
   */
  public async batchDetectDuplicates(
    events: Event[],
    options: Partial<DetectionOptions> = {}
  ): Promise<Map<string, FuzzyMatchResult[]>> {
    const duplicateMap = new Map<string, FuzzyMatchResult[]>();
    const processedEvents = new Set<string>();

    for (let i = 0; i < events.length; i++) {
      const currentEvent = events[i];
      
      if (processedEvents.has(currentEvent.id)) continue;

      const candidateEvents = events.slice(i + 1);
      const duplicates = this.detectAdvancedDuplicates(currentEvent, candidateEvents, options);

      if (duplicates.length > 0) {
        duplicateMap.set(currentEvent.id, duplicates);
        
        // Mark high-confidence duplicates as processed to avoid double-processing
        duplicates.forEach(dup => {
          if (dup.confidence > 0.9) {
            const duplicateEvent = candidateEvents.find(e => 
              this.compareEvents(currentEvent, e, { ...this.DEFAULT_OPTIONS, ...options }).similarity === dup.similarity
            );
            if (duplicateEvent) {
              processedEvents.add(duplicateEvent.id);
            }
          }
        });
      }
    }

    return duplicateMap;
  }
}

export const DuplicateDetector = DuplicateDetectorService.getInstance();