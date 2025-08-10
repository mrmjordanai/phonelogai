import { 
  Event, 
  Contact, 
  ConflictEvent, 
  ConflictType, 
  ResolutionStrategy, 
  QualityScore, 
  ResolvedConflict, 
  ConflictMetrics 
} from '@phonelogai/types';
import { supabase } from '@phonelogai/database';

// Legacy types for backward compatibility
export interface ConflictResult {
  hasConflict: boolean;
  conflictType?: ConflictType;
  conflictDetails?: string;
  resolution?: ResolutionStrategy;
  mergedData?: Event | Contact;
}

export interface ConflictResolutionOptions {
  timestampTolerance?: number; // seconds (changed from milliseconds for consistency)
  durationTolerance?: number; // seconds for call duration
  autoResolve?: boolean;
  preferNewerData?: boolean;
  mergeDuplicates?: boolean;
  batchSize?: number; // Number of events to process at once
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  existingEventId?: string;
  confidence: number; // 0-1 score
  matchingFields: string[];
  conflictType: ConflictType;
}

class ConflictResolverService {
  private static instance: ConflictResolverService;
  private readonly DEFAULT_TIMESTAMP_TOLERANCE = 1; // 1 second
  private readonly DEFAULT_DURATION_TOLERANCE = 1; // 1 second
  private readonly DUPLICATE_CONFIDENCE_THRESHOLD = 0.8;
  private readonly AUTO_RESOLVE_THRESHOLD = 0.9;
  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly SOURCE_WEIGHTS = {
    'carrier': 0.9,
    'device': 0.7,
    'manual': 0.5
  } as const;

  private constructor() {}

  public static getInstance(): ConflictResolverService {
    if (!ConflictResolverService.instance) {
      ConflictResolverService.instance = new ConflictResolverService();
    }
    return ConflictResolverService.instance;
  }

  /**
   * Detect conflicts for a batch of events using database function
   */
  public async detectConflictsBatch(
    userId: string,
    options: ConflictResolutionOptions = {}
  ): Promise<ConflictEvent[]> {
    const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;
    const timestampTolerance = options.timestampTolerance || this.DEFAULT_TIMESTAMP_TOLERANCE;

    try {
      const { data, error } = await supabase
        .rpc('detect_event_conflicts', {
          p_user_id: userId,
          p_batch_size: batchSize,
          p_time_tolerance_seconds: timestampTolerance
        });

      if (error) {
        console.error('Error detecting conflicts:', error);
        return [];
      }

      // Convert database results to ConflictEvent objects
      const conflicts: ConflictEvent[] = [];
      
      for (const row of data || []) {
        // Get full event details
        const [originalEvent, duplicateEvent] = await Promise.all([
          this.getEventById(row.original_id),
          this.getEventById(row.duplicate_id)
        ]);

        if (originalEvent && duplicateEvent) {
          const [originalQuality, duplicateQuality] = await Promise.all([
            this.calculateQualityScore(originalEvent),
            this.calculateQualityScore(duplicateEvent)
          ]);

          conflicts.push({
            id: `${row.original_id}-${row.duplicate_id}`,
            user_id: userId,
            original: originalEvent,
            duplicate: duplicateEvent,
            conflict_type: row.conflict_type as ConflictType,
            similarity: row.similarity,
            original_quality: originalQuality,
            duplicate_quality: duplicateQuality,
            resolution_strategy: this.determineAutoResolutionStrategy(originalQuality, duplicateQuality, row.similarity),
            created_at: new Date().toISOString()
          });
        }
      }

      return conflicts;
    } catch (error) {
      console.error('Error in detectConflictsBatch:', error);
      return [];
    }
  }

  /**
   * Resolve conflicts automatically where possible
   */
  public async resolveConflictsAutomatically(
    conflicts: ConflictEvent[]
  ): Promise<ResolvedConflict[]> {
    const resolved: ResolvedConflict[] = [];

    for (const conflict of conflicts) {
      if (conflict.resolution_strategy === 'automatic' && conflict.similarity >= this.AUTO_RESOLVE_THRESHOLD) {
        try {
          const resolution = await this.resolveConflictInDatabase(
            conflict.original.id,
            conflict.duplicate.id,
            'automatic',
            conflict.conflict_type,
            conflict.similarity
          );

          if (resolution) {
            resolved.push({
              conflict_id: conflict.id,
              resolution_strategy: 'automatic',
              merged_event: this.createMergedEvent(conflict.original, conflict.duplicate, conflict.original_quality, conflict.duplicate_quality),
              preserved_data: {
                original: conflict.original,
                duplicate: conflict.duplicate,
                quality_scores: {
                  original: conflict.original_quality,
                  duplicate: conflict.duplicate_quality
                }
              },
              resolution_timestamp: new Date().toISOString(),
              auto_resolved: true
            });
          }
        } catch (error) {
          console.error(`Error resolving conflict ${conflict.id}:`, error);
        }
      }
    }

    return resolved;
  }

  /**
   * Get conflict metrics for a user
   */
  public async getConflictMetrics(userId: string): Promise<ConflictMetrics | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_conflict_metrics', { p_user_id: userId });

      if (error) {
        console.error('Error getting conflict metrics:', error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error('Error in getConflictMetrics:', error);
      return null;
    }
  }

  /**
   * Calculate quality score for an event
   */
  public calculateQualityScore(event: Event): QualityScore {
    const requiredFields = ['id', 'user_id', 'line_id', 'ts', 'number', 'direction', 'type'];
    const optionalFields = ['duration', 'content', 'contact_id'];
    
    // Calculate completeness
    let filledOptionalFields = 0;
    optionalFields.forEach(field => {
      if ((event as Record<string, unknown>)[field] != null) filledOptionalFields++;
    });
    
    const completeness = (requiredFields.length + filledOptionalFields) / (requiredFields.length + optionalFields.length);

    // Get source reliability (default to 'device' if not set)
    const source = event.source || 'device';
    const sourceReliability = this.SOURCE_WEIGHTS[source as keyof typeof this.SOURCE_WEIGHTS] || 0.5;

    // Calculate freshness based on sync_timestamp or created_at
    const eventWithSync = event as Event & { sync_timestamp?: string };
    const syncTime = eventWithSync.sync_timestamp || event.created_at;
    const ageInDays = (Date.now() - new Date(syncTime).getTime()) / (1000 * 60 * 60 * 24);
    const freshness = Math.max(0, 1 - (ageInDays / 7)); // 7 days for full decay

    // Calculate weighted overall score
    const overall = (completeness * 0.4) + (sourceReliability * 0.4) + (freshness * 0.2);

    return {
      completeness: Math.round(completeness * 1000) / 1000,
      source_reliability: Math.round(sourceReliability * 1000) / 1000,
      freshness: Math.round(freshness * 1000) / 1000,
      overall: Math.round(overall * 1000) / 1000
    };
  }

  /**
   * Helper method to get event by ID
   */
  private async getEventById(eventId: string): Promise<Event | null> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error || !data) {
        console.error('Error fetching event:', error);
        return null;
      }

      return data as Event;
    } catch (error) {
      console.error('Error in getEventById:', error);
      return null;
    }
  }

  /**
   * Determine automatic resolution strategy based on quality scores
   */
  private determineAutoResolutionStrategy(
    originalQuality: QualityScore,
    duplicateQuality: QualityScore,
    similarity: number
  ): ResolutionStrategy {
    // If similarity is very high and one source is clearly better, auto-resolve
    if (similarity >= this.AUTO_RESOLVE_THRESHOLD) {
      const qualityDiff = Math.abs(originalQuality.overall - duplicateQuality.overall);
      if (qualityDiff > 0.2) {
        return 'automatic';
      }
    }

    // If similarity is high and sources are similar quality, merge
    if (similarity >= 0.8 && Math.abs(originalQuality.overall - duplicateQuality.overall) <= 0.1) {
      return 'merge';
    }

    // Otherwise, require manual review
    return 'manual';
  }

  /**
   * Resolve conflict in database using stored procedure
   */
  private async resolveConflictInDatabase(
    originalId: string,
    duplicateId: string,
    strategy: ResolutionStrategy,
    conflictType: ConflictType,
    similarity: number,
    resolvedBy?: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .rpc('resolve_event_conflict', {
          p_original_id: originalId,
          p_duplicate_id: duplicateId,
          p_resolution_strategy: strategy,
          p_conflict_type: conflictType,
          p_similarity_score: similarity,
          p_resolved_by: resolvedBy || null
        });

      if (error) {
        console.error('Error resolving conflict in database:', error);
        return null;
      }

      return data; // Returns conflict_resolution_id
    } catch (error) {
      console.error('Error in resolveConflictInDatabase:', error);
      return null;
    }
  }

  /**
   * Create merged event based on quality scores
   */
  private createMergedEvent(
    original: Event,
    duplicate: Event,
    originalQuality: QualityScore,
    duplicateQuality: QualityScore
  ): Event {
    // Choose the higher quality event as base
    const baseEvent = originalQuality.overall >= duplicateQuality.overall ? original : duplicate;
    const otherEvent = originalQuality.overall >= duplicateQuality.overall ? duplicate : original;

    // Create merged event
    const merged: Event = { ...baseEvent };

    // Merge fields intelligently
    // Use the most complete data for each field
    if (!merged.duration && otherEvent.duration) merged.duration = otherEvent.duration;
    if (!merged.content && otherEvent.content) merged.content = otherEvent.content;
    if (!merged.contact_id && otherEvent.contact_id) merged.contact_id = otherEvent.contact_id;

    // For calls, prefer longer duration if within reasonable variance
    if (merged.type === 'call' && merged.duration && otherEvent.duration) {
      const durationDiff = Math.abs(merged.duration - otherEvent.duration);
      if (durationDiff <= 2 && otherEvent.duration > merged.duration) {
        merged.duration = otherEvent.duration;
      }
    }

    // Update timestamps
    merged.updated_at = new Date().toISOString();

    return merged;
  }

  /**
   * Detect if an event is a duplicate using composite key strategy
   */
  public detectDuplicate(
    newEvent: Event,
    existingEvents: Event[],
    options: ConflictResolutionOptions = {}
  ): DuplicateDetectionResult {
    const timestampTolerance = options.timestampTolerance || this.DEFAULT_TIMESTAMP_TOLERANCE;
    const durationTolerance = options.durationTolerance || this.DEFAULT_DURATION_TOLERANCE;

    for (const existing of existingEvents) {
      const matchingFields: string[] = [];
      let confidence = 0;
      let conflictType: ConflictType = 'fuzzy';

      // Core matching criteria (composite key)
      const coreMatches = this.checkCoreMatches(newEvent, existing, timestampTolerance, durationTolerance);
      
      if (coreMatches.isMatch) {
        matchingFields.push(...coreMatches.matchingFields);
        confidence = coreMatches.confidence;

        // Determine conflict type based on matching criteria
        if (this.areEventsIdentical(newEvent, existing)) {
          conflictType = 'exact';
          confidence = 1.0;
        } else if (this.isWithinTimeVariance(newEvent, existing, timestampTolerance)) {
          conflictType = 'time_variance';
        } else {
          conflictType = 'fuzzy';
        }

        // Additional matching for higher confidence
        const additionalMatches = this.checkAdditionalMatches(newEvent, existing);
        matchingFields.push(...additionalMatches.matchingFields);
        confidence = Math.min(1.0, confidence + additionalMatches.confidence);

        if (confidence >= this.DUPLICATE_CONFIDENCE_THRESHOLD) {
          return {
            isDuplicate: true,
            existingEventId: existing.id,
            confidence,
            matchingFields,
            conflictType
          };
        }
      }
    }

    return {
      isDuplicate: false,
      confidence: 0,
      matchingFields: [],
      conflictType: 'fuzzy'
    };
  }

  /**
   * Resolve conflicts between local and remote events
   */
  public resolveEventConflict(
    localEvent: Event,
    remoteEvent: Event,
    options: ConflictResolutionOptions = {}
  ): ConflictResult {
    // Check if they're actually the same event
    const duplicateResult = this.detectDuplicate(localEvent, [remoteEvent], options);
    
    if (!duplicateResult.isDuplicate) {
      return {
        hasConflict: false,
      };
    }

    const conflictType = this.determineConflictType(localEvent, remoteEvent);
    const resolution = this.determineResolution(localEvent, remoteEvent, conflictType, options);

    let mergedData: Event | undefined;
    if (resolution === 'merge') {
      mergedData = this.mergeEvents(localEvent, remoteEvent, options);
    }

    return {
      hasConflict: true,
      conflictType,
      conflictDetails: this.generateConflictDetails(localEvent, remoteEvent, conflictType),
      resolution,
      mergedData,
    };
  }

  /**
   * Resolve conflicts for a batch of events
   */
  public resolveBatchConflicts(
    localEvents: Event[],
    remoteEvents: Event[],
    options: ConflictResolutionOptions = {}
  ): Array<{
    localEvent: Event;
    result: ConflictResult;
  }> {
    const results: Array<{ localEvent: Event; result: ConflictResult }> = [];

    for (const localEvent of localEvents) {
      const duplicateResult = this.detectDuplicate(localEvent, remoteEvents, options);
      
      if (duplicateResult.isDuplicate && duplicateResult.existingEventId) {
        const remoteEvent = remoteEvents.find(e => e.id === duplicateResult.existingEventId);
        
        if (remoteEvent) {
          const conflictResult = this.resolveEventConflict(localEvent, remoteEvent, options);
          results.push({ localEvent, result: conflictResult });
        }
      } else {
        results.push({
          localEvent,
          result: { hasConflict: false },
        });
      }
    }

    return results;
  }

  /**
   * Check if events are within time variance threshold
   */
  private isWithinTimeVariance(event1: Event, event2: Event, timestampTolerance: number): boolean {
    const timeDiff = Math.abs(
      new Date(event1.ts).getTime() - new Date(event2.ts).getTime()
    ) / 1000; // Convert to seconds
    
    return timeDiff <= timestampTolerance;
  }

  /**
   * Check core matching criteria for duplicate detection
   */
  private checkCoreMatches(
    event1: Event,
    event2: Event,
    timestampTolerance: number,
    durationTolerance: number
  ): {
    isMatch: boolean;
    confidence: number;
    matchingFields: string[];
  } {
    const matchingFields: string[] = [];
    let confidence = 0;

    // Check line_id match (required)
    if (event1.line_id !== event2.line_id) {
      return { isMatch: false, confidence: 0, matchingFields: [] };
    }
    matchingFields.push('line_id');
    confidence += 0.2;

    // Check timestamp match (within tolerance) - convert tolerance to milliseconds for comparison
    const timeDiff = Math.abs(
      new Date(event1.ts).getTime() - new Date(event2.ts).getTime()
    );
    if (timeDiff <= timestampTolerance * 1000) { // Convert seconds to milliseconds
      matchingFields.push('timestamp');
      confidence += 0.3;
    } else {
      return { isMatch: false, confidence: 0, matchingFields: [] };
    }

    // Check number match (required)
    if (event1.number !== event2.number) {
      return { isMatch: false, confidence: 0, matchingFields: [] };
    }
    matchingFields.push('number');
    confidence += 0.2;

    // Check direction match (required)
    if (event1.direction !== event2.direction) {
      return { isMatch: false, confidence: 0, matchingFields: [] };
    }
    matchingFields.push('direction');
    confidence += 0.1;

    // Check type match (required)
    if (event1.type !== event2.type) {
      return { isMatch: false, confidence: 0, matchingFields: [] };
    }
    matchingFields.push('type');
    confidence += 0.1;

    // For calls, check duration match (within tolerance)
    if (event1.type === 'call' && event2.type === 'call') {
      const duration1 = event1.duration || 0;
      const duration2 = event2.duration || 0;
      const durationDiff = Math.abs(duration1 - duration2);
      
      if (durationDiff <= durationTolerance) {
        matchingFields.push('duration');
        confidence += 0.1;
      }
    }

    return {
      isMatch: confidence >= 0.7, // Minimum confidence for core match
      confidence,
      matchingFields,
    };
  }

  /**
   * Check additional matching criteria for higher confidence
   */
  private checkAdditionalMatches(
    event1: Event,
    event2: Event
  ): {
    confidence: number;
    matchingFields: string[];
  } {
    const matchingFields: string[] = [];
    let confidence = 0;

    // Check contact_id match
    if (event1.contact_id && event2.contact_id && event1.contact_id === event2.contact_id) {
      matchingFields.push('contact_id');
      confidence += 0.1;
    }

    // Check content similarity (for SMS)
    if (event1.type === 'sms' && event2.type === 'sms' && event1.content && event2.content) {
      const similarity = this.calculateStringSimilarity(event1.content, event2.content);
      if (similarity > 0.8) {
        matchingFields.push('content');
        confidence += 0.1;
      }
    }

    return { confidence, matchingFields };
  }

  /**
   * Determine the type of conflict between two events
   */
  private determineConflictType(localEvent: Event, remoteEvent: Event): ConflictType {
    // Check for exact duplicate
    if (this.areEventsIdentical(localEvent, remoteEvent)) {
      return 'duplicate';
    }

    // Check for timestamp drift
    const timeDiff = Math.abs(
      new Date(localEvent.ts).getTime() - new Date(remoteEvent.ts).getTime()
    );
    if (timeDiff > this.DEFAULT_TIMESTAMP_TOLERANCE) {
      return 'timestamp_drift';
    }

    // Check for field mismatches
    if (this.haveFieldMismatches(localEvent, remoteEvent)) {
      return 'field_mismatch';
    }

    return 'duplicate';
  }

  /**
   * Determine how to resolve a conflict
   */
  private determineResolution(
    localEvent: Event,
    remoteEvent: Event,
    conflictType: ConflictType,
    options: ConflictResolutionOptions
  ): 'keep_local' | 'keep_remote' | 'merge' | 'skip' {
    if (options.autoResolve) {
      switch (conflictType) {
        case 'duplicate':
          return options.preferNewerData ? 
            (new Date(localEvent.updated_at) > new Date(remoteEvent.updated_at) ? 'keep_local' : 'keep_remote') :
            'skip';
        
        case 'timestamp_drift':
        case 'field_mismatch':
          return options.mergeDuplicates ? 'merge' : 'keep_remote';
        
        default:
          return 'skip';
      }
    }

    // Default to manual resolution needed
    return 'skip';
  }

  /**
   * Merge two conflicting events
   */
  private mergeEvents(localEvent: Event, remoteEvent: Event, _options: ConflictResolutionOptions): Event {
    const merged: Event = { ...localEvent };

    // Use the more recent updated_at timestamp
    if (new Date(remoteEvent.updated_at) > new Date(localEvent.updated_at)) {
      merged.updated_at = remoteEvent.updated_at;
    }

    // Merge specific fields based on data quality
    // Prefer remote data for core fields, local for derived fields
    merged.ts = remoteEvent.ts; // Server timestamp is more authoritative
    merged.number = remoteEvent.number;
    merged.direction = remoteEvent.direction;
    merged.type = remoteEvent.type;

    // For optional fields, prefer non-null values
    merged.duration = remoteEvent.duration || localEvent.duration;
    merged.content = remoteEvent.content || localEvent.content;
    merged.contact_id = remoteEvent.contact_id || localEvent.contact_id;

    return merged;
  }

  /**
   * Generate human-readable conflict details
   */
  private generateConflictDetails(localEvent: Event, remoteEvent: Event, conflictType: ConflictType): string {
    switch (conflictType) {
      case 'duplicate':
        return `Duplicate event detected for ${localEvent.number} at ${localEvent.ts}`;
      
      case 'timestamp_drift': {
        const timeDiff = Math.abs(
          new Date(localEvent.ts).getTime() - new Date(remoteEvent.ts).getTime()
        );
        return `Timestamp drift of ${timeDiff}ms detected`;
      }
      
      case 'field_mismatch': {
        const mismatches = this.findFieldMismatches(localEvent, remoteEvent);
        return `Field mismatches detected: ${mismatches.join(', ')}`;
      }
      
      default:
        return 'Unknown conflict type';
    }
  }

  /**
   * Check if two events are identical
   */
  private areEventsIdentical(event1: Event, event2: Event): boolean {
    const fieldsToCompare = ['line_id', 'ts', 'number', 'direction', 'type', 'duration', 'content'];
    
    return fieldsToCompare.every(field => {
      const val1 = (event1 as Record<string, unknown>)[field];
      const val2 = (event2 as Record<string, unknown>)[field];
      return val1 === val2;
    });
  }

  /**
   * Check if events have field mismatches
   */
  private haveFieldMismatches(event1: Event, event2: Event): boolean {
    return this.findFieldMismatches(event1, event2).length > 0;
  }

  /**
   * Find specific field mismatches
   */
  private findFieldMismatches(event1: Event, event2: Event): string[] {
    const mismatches: string[] = [];
    const fieldsToCheck = ['duration', 'content', 'contact_id'];

    for (const field of fieldsToCheck) {
      const val1 = (event1 as Record<string, unknown>)[field];
      const val2 = (event2 as Record<string, unknown>)[field];
      
      if (val1 !== val2 && val1 != null && val2 != null) {
        mismatches.push(field);
      }
    }

    return mismatches;
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

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
   * Get conflict resolution statistics
   */
  public getResolutionStats(results: Array<{ localEvent: Event; result: ConflictResult }>): {
    totalConflicts: number;
    resolvedAutomatically: number;
    needsManualResolution: number;
    conflictTypes: Record<ConflictType, number>;
    resolutionTypes: Record<string, number>;
  } {
    const stats = {
      totalConflicts: 0,
      resolvedAutomatically: 0,
      needsManualResolution: 0,
      conflictTypes: {} as Record<ConflictType, number>,
      resolutionTypes: {} as Record<string, number>,
    };

    for (const { result } of results) {
      if (result.hasConflict) {
        stats.totalConflicts++;

        if (result.conflictType) {
          stats.conflictTypes[result.conflictType] = (stats.conflictTypes[result.conflictType] || 0) + 1;
        }

        if (result.resolution) {
          stats.resolutionTypes[result.resolution] = (stats.resolutionTypes[result.resolution] || 0) + 1;
          
          if (result.resolution !== 'skip') {
            stats.resolvedAutomatically++;
          } else {
            stats.needsManualResolution++;
          }
        }
      }
    }

    return stats;
  }
}

export const ConflictResolver = ConflictResolverService.getInstance();