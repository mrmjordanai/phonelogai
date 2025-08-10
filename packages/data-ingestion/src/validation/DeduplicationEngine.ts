import { Event, Contact } from '@phonelogai/types';
import { MergeConflict, DeduplicationResult } from '../types/index.js';
import crypto from 'crypto';

/**
 * Advanced deduplication engine for the ETL pipeline
 * Handles composite key generation, similarity matching, and conflict resolution
 */
export class DeduplicationEngine {
  private similarityThreshold: number;
  private conflictResolutionStrategy: 'keep_first' | 'keep_last' | 'merge' | 'manual';

  constructor(
    similarityThreshold: number = 0.85,
    conflictResolutionStrategy: 'keep_first' | 'keep_last' | 'merge' | 'manual' = 'merge'
  ) {
    this.similarityThreshold = similarityThreshold;
    this.conflictResolutionStrategy = conflictResolutionStrategy;
  }

  /**
   * Generate composite key for an event
   * Key components: normalized_phone, timestamp_rounded, event_type, direction
   */
  generateEventCompositeKey(event: Partial<Event>): string {
    const components = [
      this.normalizePhoneForKey(event.number || ''),
      this.roundTimestampForKey(event.ts),
      event.type || 'unknown',
      event.direction || 'unknown'
    ];

    // Add duration for calls (rounded to nearest 30 seconds)
    if (event.type === 'call' && event.duration !== undefined && event.duration !== null) {
      const roundedDuration = Math.round((event.duration || 0) / 30) * 30;
      components.push(roundedDuration.toString());
    }

    return this.hashComponents(components);
  }

  /**
   * Generate composite key for a contact
   * Key components: normalized_phone, name_normalized (if available)
   */
  generateContactCompositeKey(contact: Partial<Contact>): string {
    const components = [
      this.normalizePhoneForKey(contact.number || (contact as any).phone_number || ''),
    ];

    // Add normalized name if available
    if (contact.name && contact.name.trim()) {
      components.push(this.normalizeNameForKey(contact.name));
    }

    return this.hashComponents(components);
  }

  /**
   * Deduplicate events using composite keys and similarity matching
   */
  deduplicateEvents(events: Partial<Event>[]): {
    uniqueEvents: Partial<Event>[];
    duplicateGroups: Array<{
      key: string;
      events: Partial<Event>[];
      mergedEvent: Partial<Event>;
      conflicts: MergeConflict[];
    }>;
    metrics: {
      totalEvents: number;
      uniqueEvents: number;
      duplicatesRemoved: number;
      duplicateRate: number;
      conflictsCount: number;
    };
  } {
    const eventGroups = new Map<string, Partial<Event>[]>();
    const uniqueEvents: Partial<Event>[] = [];
    const duplicateGroups: Array<{
      key: string;
      events: Partial<Event>[];
      mergedEvent: Partial<Event>;
      conflicts: MergeConflict[];
    }> = [];
    let totalConflicts = 0;

    // Group events by composite key
    for (const event of events) {
      const key = this.generateEventCompositeKey(event);
      if (!eventGroups.has(key)) {
        eventGroups.set(key, []);
      }
      eventGroups.get(key)!.push(event);
    }

    // Process each group
    for (const [key, groupEvents] of eventGroups) {
      if (groupEvents.length === 1) {
        // No duplicates
        uniqueEvents.push(groupEvents[0]);
      } else {
        // Duplicates found - merge them
        const mergeResult = this.mergeEvents(groupEvents);
        uniqueEvents.push(mergeResult.mergedEvent);
        totalConflicts += mergeResult.conflicts.length;

        duplicateGroups.push({
          key,
          events: groupEvents,
          mergedEvent: mergeResult.mergedEvent,
          conflicts: mergeResult.conflicts
        });
      }
    }

    // Additional similarity-based deduplication for near-matches
    const similarityGroups = this.findSimilarEvents(uniqueEvents);
    const finalUniqueEvents: Partial<Event>[] = [];
    
    for (const group of similarityGroups) {
      if (group.length === 1) {
        finalUniqueEvents.push(group[0]);
      } else {
        const mergeResult = this.mergeEvents(group);
        finalUniqueEvents.push(mergeResult.mergedEvent);
        totalConflicts += mergeResult.conflicts.length;

        duplicateGroups.push({
          key: `similarity_${Date.now()}_${Math.random()}`,
          events: group,
          mergedEvent: mergeResult.mergedEvent,
          conflicts: mergeResult.conflicts
        });
      }
    }

    const totalEvents = events.length;
    const finalUniqueCount = finalUniqueEvents.length;
    const duplicatesRemoved = totalEvents - finalUniqueCount;

    return {
      uniqueEvents: finalUniqueEvents,
      duplicateGroups,
      metrics: {
        totalEvents,
        uniqueEvents: finalUniqueCount,
        duplicatesRemoved,
        duplicateRate: totalEvents > 0 ? (duplicatesRemoved / totalEvents) * 100 : 0,
        conflictsCount: totalConflicts
      }
    };
  }

  /**
   * Deduplicate contacts using composite keys
   */
  deduplicateContacts(contacts: Partial<Contact>[]): {
    uniqueContacts: Partial<Contact>[];
    duplicateGroups: Array<{
      key: string;
      contacts: Partial<Contact>[];
      mergedContact: Partial<Contact>;
      conflicts: MergeConflict[];
    }>;
    metrics: {
      totalContacts: number;
      uniqueContacts: number;
      duplicatesRemoved: number;
      duplicateRate: number;
      conflictsCount: number;
    };
  } {
    const contactGroups = new Map<string, Partial<Contact>[]>();
    const uniqueContacts: Partial<Contact>[] = [];
    const duplicateGroups: Array<{
      key: string;
      contacts: Partial<Contact>[];
      mergedContact: Partial<Contact>;
      conflicts: MergeConflict[];
    }> = [];
    let totalConflicts = 0;

    // Group contacts by composite key
    for (const contact of contacts) {
      const key = this.generateContactCompositeKey(contact);
      if (!contactGroups.has(key)) {
        contactGroups.set(key, []);
      }
      contactGroups.get(key)!.push(contact);
    }

    // Process each group
    for (const [key, groupContacts] of contactGroups) {
      if (groupContacts.length === 1) {
        uniqueContacts.push(groupContacts[0]);
      } else {
        const mergeResult = this.mergeContacts(groupContacts);
        uniqueContacts.push(mergeResult.mergedContact);
        totalConflicts += mergeResult.conflicts.length;

        duplicateGroups.push({
          key,
          contacts: groupContacts,
          mergedContact: mergeResult.mergedContact,
          conflicts: mergeResult.conflicts
        });
      }
    }

    const totalContacts = contacts.length;
    const uniqueCount = uniqueContacts.length;
    const duplicatesRemoved = totalContacts - uniqueCount;

    return {
      uniqueContacts,
      duplicateGroups,
      metrics: {
        totalContacts,
        uniqueContacts: uniqueCount,
        duplicatesRemoved,
        duplicateRate: totalContacts > 0 ? (duplicatesRemoved / totalContacts) * 100 : 0,
        conflictsCount: totalConflicts
      }
    };
  }

  /**
   * Merge multiple events into a single event
   */
  private mergeEvents(events: Partial<Event>[]): {
    mergedEvent: Partial<Event>;
    conflicts: MergeConflict[];
  } {
    if (events.length === 0) {
      throw new Error('Cannot merge empty events array');
    }

    if (events.length === 1) {
      return { mergedEvent: events[0], conflicts: [] };
    }

    const mergedEvent: Partial<Event> = {};
    const conflicts: MergeConflict[] = [];

    // Define merge strategies for different fields
    const mergeStrategies: Record<string, MergeConflict['resolution']> = {
      id: 'first',
      user_id: 'first',
      ts: 'first', // Use first timestamp (earliest)
      number: 'first',
      type: 'first',
      direction: 'first',
      duration: 'max', // Use longest duration for calls
      content: 'longest', // Use longest message content
      metadata: 'merge'
    };

    // Get all unique field names
    const allFields = new Set<string>();
    events.forEach(event => {
      Object.keys(event).forEach(field => allFields.add(field));
    });

    // Merge each field
    for (const field of allFields) {
      const values = events
        .map(event => (event as any)[field])
        .filter(value => value !== null && value !== undefined);

      if (values.length === 0) {
        continue; // Skip if all values are null/undefined
      }

      if (values.length === 1) {
        (mergedEvent as any)[field] = values[0];
        continue;
      }

      // Check for conflicts (different non-null values)
      const uniqueValues = [...new Set(values.map(v => JSON.stringify(v)))];
      
      if (uniqueValues.length > 1) {
        const strategy = mergeStrategies[field] || this.conflictResolutionStrategy;
        const resolvedValue = this.resolveConflict(values, strategy);
        
        (mergedEvent as any)[field] = resolvedValue;
        
        conflicts.push({
          field,
          values: values,
          resolution: strategy as MergeConflict['resolution']
        });
      } else {
        (mergedEvent as any)[field] = values[0];
      }
    }

    return { mergedEvent, conflicts };
  }

  /**
   * Merge multiple contacts into a single contact
   */
  private mergeContacts(contacts: Partial<Contact>[]): {
    mergedContact: Partial<Contact>;
    conflicts: MergeConflict[];
  } {
    if (contacts.length === 0) {
      throw new Error('Cannot merge empty contacts array');
    }

    if (contacts.length === 1) {
      return { mergedContact: contacts[0], conflicts: [] };
    }

    const mergedContact: Partial<Contact> = {};
    const conflicts: MergeConflict[] = [];

    const mergeStrategies: Record<string, MergeConflict['resolution']> = {
      id: 'first',
      user_id: 'first',
      phone_number: 'first',
      name: 'longest', // Use longest name
      email: 'first',
      avatar_url: 'first',
      is_blocked: 'last', // Use most recent block status
      total_events: 'max',
      last_event_at: 'last',
      metadata: 'merge'
    };

    // Get all unique field names
    const allFields = new Set<string>();
    contacts.forEach(contact => {
      Object.keys(contact).forEach(field => allFields.add(field));
    });

    // Merge each field
    for (const field of allFields) {
      const values = contacts
        .map(contact => (contact as any)[field])
        .filter(value => value !== null && value !== undefined);

      if (values.length === 0) {
        continue;
      }

      if (values.length === 1) {
        (mergedContact as any)[field] = values[0];
        continue;
      }

      // Check for conflicts
      const uniqueValues = [...new Set(values.map(v => JSON.stringify(v)))];
      
      if (uniqueValues.length > 1) {
        const strategy = mergeStrategies[field] || this.conflictResolutionStrategy;
        const resolvedValue = this.resolveConflict(values, strategy);
        
        (mergedContact as any)[field] = resolvedValue;
        
        conflicts.push({
          field,
          values: values,
          resolution: strategy as MergeConflict['resolution']
        });
      } else {
        (mergedContact as any)[field] = values[0];
      }
    }

    return { mergedContact, conflicts };
  }

  /**
   * Resolve conflicts between values using specified strategy
   */
  private resolveConflict(values: any[], strategy: string): any {
    switch (strategy) {
      case 'keep_first':
      case 'first':
        return values[0];
      
      case 'keep_last':
      case 'last':
        return values[values.length - 1];
      
      case 'longest':
        return values.reduce((longest, current) => 
          String(current).length > String(longest).length ? current : longest
        );
      
      case 'shortest':
        return values.reduce((shortest, current) => 
          String(current).length < String(shortest).length ? current : shortest
        );
      
      case 'max':
        return Math.max(...values.filter(v => typeof v === 'number'));
      
      case 'min':
        return Math.min(...values.filter(v => typeof v === 'number'));
      
      case 'merge':
        // For objects, merge them; for arrays, concatenate unique values
        if (Array.isArray(values[0])) {
          return [...new Set(values.flat())];
        } else if (typeof values[0] === 'object' && values[0] !== null) {
          return Object.assign({}, ...values);
        }
        return values[0]; // Fallback to first value
      
      case 'manual':
      default:
        return values[0]; // Default to first value, manual resolution needed
    }
  }

  /**
   * Find similar events using fuzzy matching
   */
  private findSimilarEvents(events: Partial<Event>[]): Partial<Event>[][] {
    const groups: Partial<Event>[][] = [];
    const processed = new Set<number>();

    for (let i = 0; i < events.length; i++) {
      if (processed.has(i)) continue;

      const group = [events[i]];
      processed.add(i);

      for (let j = i + 1; j < events.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.calculateEventSimilarity(events[i], events[j]);
        if (similarity >= this.similarityThreshold) {
          group.push(events[j]);
          processed.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Calculate similarity score between two events
   */
  private calculateEventSimilarity(event1: Partial<Event>, event2: Partial<Event>): number {
    let totalWeight = 0;
    let matchingWeight = 0;

    // Phone number similarity (highest weight)
    const phoneWeight = 0.4;
    totalWeight += phoneWeight;
    if (this.phoneSimilarity(event1.number, event2.number) > 0.9) {
      matchingWeight += phoneWeight;
    }

    // Timestamp similarity (within 5 minutes)
    const timeWeight = 0.3;
    totalWeight += timeWeight;
    if (this.timeSimilarity(event1.ts, event2.ts) > 0.8) {
      matchingWeight += timeWeight;
    }

    // Type and direction match
    const typeWeight = 0.15;
    const directionWeight = 0.15;
    totalWeight += typeWeight + directionWeight;
    
    if (event1.type === event2.type) {
      matchingWeight += typeWeight;
    }
    if (event1.direction === event2.direction) {
      matchingWeight += directionWeight;
    }

    return totalWeight > 0 ? matchingWeight / totalWeight : 0;
  }

  /**
   * Calculate phone number similarity
   */
  private phoneSimilarity(phone1?: string, phone2?: string): number {
    if (!phone1 || !phone2) return 0;
    
    const norm1 = this.normalizePhoneForKey(phone1);
    const norm2 = this.normalizePhoneForKey(phone2);
    
    return norm1 === norm2 ? 1 : 0;
  }

  /**
   * Calculate timestamp similarity
   */
  private timeSimilarity(ts1?: Date | string, ts2?: Date | string): number {
    if (!ts1 || !ts2) return 0;
    
    const date1 = new Date(ts1);
    const date2 = new Date(ts2);
    
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return 0;
    
    const diffMinutes = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
    
    // Return high similarity if within 5 minutes
    if (diffMinutes <= 5) return 1;
    if (diffMinutes <= 15) return 0.8;
    if (diffMinutes <= 60) return 0.5;
    
    return 0;
  }

  /**
   * Normalize phone number for key generation
   */
  private normalizePhoneForKey(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    
    // Handle US numbers
    if (digits.length === 10) {
      return `1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return digits;
    }
    
    return digits;
  }

  /**
   * Round timestamp to nearest 5-minute window for key generation
   */
  private roundTimestampForKey(ts?: Date | string): string {
    if (!ts) return 'unknown';
    
    const date = new Date(ts);
    if (isNaN(date.getTime())) return 'unknown';
    
    // Round to nearest 5-minute window
    const roundedMinutes = Math.round(date.getMinutes() / 5) * 5;
    const rounded = new Date(date);
    rounded.setMinutes(roundedMinutes, 0, 0); // Reset seconds and milliseconds
    
    return rounded.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  }

  /**
   * Normalize name for key generation
   */
  private normalizeNameForKey(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Hash components to create composite key
   */
  private hashComponents(components: string[]): string {
    const joined = components.join('|');
    return crypto.createHash('sha256').update(joined).digest('hex').slice(0, 16);
  }

  /**
   * Detect data gaps in events timeline
   */
  detectDataGaps(
    events: Partial<Event>[],
    options: {
      gapThresholdHours?: number;
      expectedFrequency?: 'high' | 'medium' | 'low';
      analysisPeriodDays?: number;
    } = {}
  ): {
    gaps: Array<{
      start: Date;
      end: Date;
      durationHours: number;
      severity: 'minor' | 'moderate' | 'major';
      likelyDeleted: boolean;
    }>;
    analysis: {
      totalGaps: number;
      totalGapTime: number;
      averageGapSize: number;
      suspiciousGaps: number;
      dataQualityScore: number; // 0-100
    };
  } {
    const gapThreshold = options.gapThresholdHours || 24;
    const analysisPeriod = options.analysisPeriodDays || 30;
    
    // Sort events by timestamp
    const sortedEvents = events
      .filter(e => e.ts)
      .sort((a, b) => new Date(a.ts!).getTime() - new Date(b.ts!).getTime());

    if (sortedEvents.length < 2) {
      return {
        gaps: [],
        analysis: {
          totalGaps: 0,
          totalGapTime: 0,
          averageGapSize: 0,
          suspiciousGaps: 0,
          dataQualityScore: 0
        }
      };
    }

    const gaps: Array<{
      start: Date;
      end: Date;
      durationHours: number;
      severity: 'minor' | 'moderate' | 'major';
      likelyDeleted: boolean;
    }> = [];

    // Analyze gaps between consecutive events
    for (let i = 1; i < sortedEvents.length; i++) {
      const prevEvent = sortedEvents[i - 1];
      const currentEvent = sortedEvents[i];
      
      const prevTime = new Date(prevEvent.ts!);
      const currentTime = new Date(currentEvent.ts!);
      const gapHours = (currentTime.getTime() - prevTime.getTime()) / (1000 * 60 * 60);

      if (gapHours >= gapThreshold) {
        const severity = this.classifyGapSeverity(gapHours);
        const likelyDeleted = this.isLikelyDeletedData(gapHours, options.expectedFrequency);

        gaps.push({
          start: prevTime,
          end: currentTime,
          durationHours: gapHours,
          severity,
          likelyDeleted
        });
      }
    }

    // Calculate analysis metrics
    const totalGapTime = gaps.reduce((sum, gap) => sum + gap.durationHours, 0);
    const suspiciousGaps = gaps.filter(gap => gap.likelyDeleted).length;
    
    const totalPeriod = analysisPeriod * 24; // hours
    const dataQualityScore = Math.max(0, Math.min(100, 
      100 - ((totalGapTime / totalPeriod) * 100)
    ));

    return {
      gaps,
      analysis: {
        totalGaps: gaps.length,
        totalGapTime,
        averageGapSize: gaps.length > 0 ? totalGapTime / gaps.length : 0,
        suspiciousGaps,
        dataQualityScore
      }
    };
  }

  /**
   * Classify gap severity
   */
  private classifyGapSeverity(gapHours: number): 'minor' | 'moderate' | 'major' {
    if (gapHours < 48) return 'minor';      // Less than 2 days
    if (gapHours < 168) return 'moderate';  // Less than 1 week
    return 'major';                         // 1 week or more
  }

  /**
   * Determine if gap is likely from deleted data
   */
  private isLikelyDeletedData(gapHours: number, expectedFrequency?: string): boolean {
    const thresholds: Record<string, number> = {
      high: 12,    // High frequency users: gap > 12 hours suspicious
      medium: 48,  // Medium frequency users: gap > 48 hours suspicious
      low: 168     // Low frequency users: gap > 1 week suspicious
    };

    const threshold = thresholds[expectedFrequency || 'medium'] || thresholds.medium;
    return gapHours > threshold;
  }
}

export default DeduplicationEngine;