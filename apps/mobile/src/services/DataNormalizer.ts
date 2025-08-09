import { Event, Contact } from '@phonelogai/types';
import { ProcessedCallLogEntry } from './android/CallLogCollector';
import { ProcessedSmsEntry } from './android/SmsLogCollector';
import { v4 as uuidv4 } from 'uuid';

export interface NormalizationOptions {
  userId: string;
  lineId: string;
  enableContactMatching?: boolean;
  enablePrivacyFiltering?: boolean;
  anonymizeContent?: boolean;
}

export interface NormalizedData {
  events: Event[];
  contacts: Map<string, Contact>;
  duplicates: string[]; // IDs of duplicate events found
  errors: Array<{
    sourceId: string;
    error: string;
    data?: any;
  }>;
}

export interface ContactMatchResult {
  contact: Contact;
  isNew: boolean;
}

class DataNormalizerService {
  private static instance: DataNormalizerService;
  private contactCache = new Map<string, Contact>();

  private constructor() {}

  public static getInstance(): DataNormalizerService {
    if (!DataNormalizerService.instance) {
      DataNormalizerService.instance = new DataNormalizerService();
    }
    return DataNormalizerService.instance;
  }

  /**
   * Normalize call log entries to Event format
   */
  public async normalizeCallLog(
    callEntries: ProcessedCallLogEntry[],
    options: NormalizationOptions
  ): Promise<NormalizedData> {
    const result: NormalizedData = {
      events: [],
      contacts: new Map(),
      duplicates: [],
      errors: [],
    };

    for (const callEntry of callEntries) {
      try {
        const event = await this.callEntryToEvent(callEntry, options);
        
        // Check for duplicates
        const isDuplicate = this.isDuplicateEvent(event, result.events);
        if (isDuplicate) {
          result.duplicates.push(event.id);
          continue;
        }

        result.events.push(event);

        // Process contact if enabled
        if (options.enableContactMatching) {
          const contactResult = await this.matchOrCreateContact(
            callEntry.number,
            callEntry.contactName,
            options.userId
          );
          
          if (contactResult) {
            result.contacts.set(contactResult.contact.number, contactResult.contact);
            event.contact_id = contactResult.contact.id;
          }
        }
      } catch (error) {
        result.errors.push({
          sourceId: callEntry.id,
          error: error.message || 'Unknown error normalizing call entry',
          data: callEntry,
        });
      }
    }

    return result;
  }

  /**
   * Normalize SMS log entries to Event format
   */
  public async normalizeSmsLog(
    smsEntries: ProcessedSmsEntry[],
    options: NormalizationOptions
  ): Promise<NormalizedData> {
    const result: NormalizedData = {
      events: [],
      contacts: new Map(),
      duplicates: [],
      errors: [],
    };

    for (const smsEntry of smsEntries) {
      try {
        const event = await this.smsEntryToEvent(smsEntry, options);
        
        // Check for duplicates
        const isDuplicate = this.isDuplicateEvent(event, result.events);
        if (isDuplicate) {
          result.duplicates.push(event.id);
          continue;
        }

        result.events.push(event);

        // Process contact if enabled
        if (options.enableContactMatching) {
          const contactResult = await this.matchOrCreateContact(
            smsEntry.number,
            undefined, // SMS doesn't typically have cached name
            options.userId
          );
          
          if (contactResult) {
            result.contacts.set(contactResult.contact.number, contactResult.contact);
            event.contact_id = contactResult.contact.id;
          }
        }
      } catch (error) {
        result.errors.push({
          sourceId: smsEntry.id,
          error: error.message || 'Unknown error normalizing SMS entry',
          data: smsEntry,
        });
      }
    }

    return result;
  }

  /**
   * Normalize mixed call and SMS data
   */
  public async normalizeCommEvents(
    callEntries: ProcessedCallLogEntry[],
    smsEntries: ProcessedSmsEntry[],
    options: NormalizationOptions
  ): Promise<NormalizedData> {
    const callResult = await this.normalizeCallLog(callEntries, options);
    const smsResult = await this.normalizeSmsLog(smsEntries, options);

    // Merge results
    const combined: NormalizedData = {
      events: [...callResult.events, ...smsResult.events],
      contacts: new Map([...callResult.contacts, ...smsResult.contacts]),
      duplicates: [...callResult.duplicates, ...smsResult.duplicates],
      errors: [...callResult.errors, ...smsResult.errors],
    };

    // Sort events by timestamp (most recent first)
    combined.events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    // Check for cross-type duplicates (call and SMS at same time to same number)
    this.detectCrossTypeDuplicates(combined);

    return combined;
  }

  /**
   * Convert call entry to Event format
   */
  private async callEntryToEvent(
    callEntry: ProcessedCallLogEntry,
    options: NormalizationOptions
  ): Promise<Event> {
    const now = new Date().toISOString();
    
    return {
      id: uuidv4(),
      user_id: options.userId,
      line_id: options.lineId,
      ts: callEntry.timestamp.toISOString(),
      number: this.normalizePhoneNumber(callEntry.number),
      direction: callEntry.direction,
      type: 'call',
      duration: callEntry.duration,
      content: this.generateCallContent(callEntry, options.anonymizeContent),
      contact_id: undefined, // Will be set during contact matching
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Convert SMS entry to Event format
   */
  private async smsEntryToEvent(
    smsEntry: ProcessedSmsEntry,
    options: NormalizationOptions
  ): Promise<Event> {
    const now = new Date().toISOString();
    
    return {
      id: uuidv4(),
      user_id: options.userId,
      line_id: options.lineId,
      ts: smsEntry.timestamp.toISOString(),
      number: this.normalizePhoneNumber(smsEntry.number),
      direction: smsEntry.direction,
      type: 'sms',
      duration: undefined, // SMS doesn't have duration
      content: this.generateSmsContent(smsEntry, options.anonymizeContent),
      contact_id: undefined, // Will be set during contact matching
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Generate call content with privacy considerations
   */
  private generateCallContent(callEntry: ProcessedCallLogEntry, anonymize?: boolean): string | undefined {
    if (anonymize) {
      return undefined;
    }

    const parts: string[] = [];
    
    if (callEntry.isMissed) {
      parts.push('Missed call');
    } else if (callEntry.isAnswered) {
      parts.push('Call answered');
    } else {
      parts.push('Call');
    }

    if (callEntry.duration > 0) {
      parts.push(`Duration: ${this.formatDuration(callEntry.duration)}`);
    }

    if (callEntry.metadata.geocodedLocation) {
      parts.push(`Location: ${callEntry.metadata.geocodedLocation}`);
    }

    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  /**
   * Generate SMS content with privacy considerations
   */
  private generateSmsContent(smsEntry: ProcessedSmsEntry, anonymize?: boolean): string | undefined {
    if (anonymize || !smsEntry.content) {
      return undefined;
    }

    // For privacy, we might want to store just metadata or truncated content
    const content = smsEntry.content;
    const maxLength = 100; // Configurable

    if (content.length > maxLength) {
      return content.substring(0, maxLength) + '...';
    }

    return content;
  }

  /**
   * Match phone number to existing contact or create new one
   */
  private async matchOrCreateContact(
    phoneNumber: string,
    cachedName?: string,
    userId?: string
  ): Promise<ContactMatchResult | null> {
    const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
    
    // Check cache first
    if (this.contactCache.has(normalizedNumber)) {
      return {
        contact: this.contactCache.get(normalizedNumber)!,
        isNew: false,
      };
    }

    // Create new contact
    const now = new Date().toISOString();
    const contact: Contact = {
      id: uuidv4(),
      user_id: userId || '',
      number: normalizedNumber,
      name: cachedName || undefined,
      company: undefined,
      tags: [],
      first_seen: now,
      last_seen: now,
      total_calls: 0,
      total_sms: 0,
      created_at: now,
      updated_at: now,
    };

    this.contactCache.set(normalizedNumber, contact);

    return {
      contact,
      isNew: true,
    };
  }

  /**
   * Check if event is a duplicate using composite key strategy
   */
  private isDuplicateEvent(event: Event, existingEvents: Event[]): boolean {
    const tolerance = 1000; // 1 second tolerance for timestamp matching

    return existingEvents.some(existing => {
      // Composite key: (line_id, ts±1s, number, direction, type)
      const timeDiff = Math.abs(
        new Date(event.ts).getTime() - new Date(existing.ts).getTime()
      );
      
      return (
        existing.line_id === event.line_id &&
        timeDiff <= tolerance &&
        existing.number === event.number &&
        existing.direction === event.direction &&
        existing.type === event.type &&
        // For calls, also check duration (±1s tolerance)
        (event.type !== 'call' || 
         Math.abs((existing.duration || 0) - (event.duration || 0)) <= 1)
      );
    });
  }

  /**
   * Detect cross-type duplicates (e.g., missed call immediately followed by SMS)
   */
  private detectCrossTypeDuplicates(data: NormalizedData): void {
    const tolerance = 30000; // 30 seconds tolerance for cross-type detection
    const crossTypeDuplicates: string[] = [];

    for (let i = 0; i < data.events.length; i++) {
      for (let j = i + 1; j < data.events.length; j++) {
        const event1 = data.events[i];
        const event2 = data.events[j];

        // Skip if same type or different numbers
        if (event1.type === event2.type || event1.number !== event2.number) {
          continue;
        }

        const timeDiff = Math.abs(
          new Date(event1.ts).getTime() - new Date(event2.ts).getTime()
        );

        // If events are very close in time, mark as potential duplicate
        if (timeDiff <= tolerance) {
          crossTypeDuplicates.push(`${event1.id}+${event2.id}`);
        }
      }
    }

    // Add cross-type duplicates to the duplicates array
    data.duplicates.push(...crossTypeDuplicates);
  }

  /**
   * Normalize phone number to consistent format
   */
  private normalizePhoneNumber(number: string): string {
    if (!number) return '';
    
    // Remove all non-digit characters
    let digits = number.replace(/\D/g, '');
    
    // Handle different number formats
    if (digits.length === 11 && digits.startsWith('1')) {
      // US/Canada with country code
      return digits;
    } else if (digits.length === 10) {
      // US/Canada without country code
      return '1' + digits;
    } else if (digits.length > 11) {
      // International number - keep as is
      return digits;
    } else if (digits.length < 10) {
      // Short codes or incomplete numbers
      return digits;
    }
    
    return digits;
  }

  /**
   * Format call duration in human-readable format
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Clear contact cache (useful for testing or memory management)
   */
  public clearContactCache(): void {
    this.contactCache.clear();
  }

  /**
   * Get statistics about normalization results
   */
  public getStats(data: NormalizedData): {
    totalEvents: number;
    callEvents: number;
    smsEvents: number;
    uniqueContacts: number;
    duplicatesFound: number;
    errorsFound: number;
  } {
    return {
      totalEvents: data.events.length,
      callEvents: data.events.filter(e => e.type === 'call').length,
      smsEvents: data.events.filter(e => e.type === 'sms').length,
      uniqueContacts: data.contacts.size,
      duplicatesFound: data.duplicates.length,
      errorsFound: data.errors.length,
    };
  }
}

export const DataNormalizer = DataNormalizerService.getInstance();