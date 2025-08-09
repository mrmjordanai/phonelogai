// Platform and NativeModules imports removed as they are not used in this file
import { PermissionsManager } from '../PermissionsManager';
import { PlatformDetector } from '../../utils/PlatformDetector';

// Android CallLog.Calls column constants
export const CALL_LOG_COLUMNS = {
  ID: '_id',
  NUMBER: 'number',
  DATE: 'date',
  DURATION: 'duration',
  TYPE: 'type',
  CACHED_NAME: 'cached_name',
  CACHED_NUMBER_TYPE: 'cached_number_type',
  CACHED_NUMBER_LABEL: 'cached_number_label',
  NEW: 'new',
  COUNTRY_ISO: 'countryiso',
  GEOCODED_LOCATION: 'geocoded_location',
  PHONE_ACCOUNT_ID: 'phone_account_id',
} as const;

// Android CallLog.Calls.TYPE constants
export const CALL_TYPES = {
  INCOMING: 1,
  OUTGOING: 2,
  MISSED: 3,
  VOICEMAIL: 4,
  REJECTED: 5,
  BLOCKED: 6,
  ANSWERED_EXTERNALLY: 7,
} as const;

export interface RawCallLogEntry {
  id: string;
  number: string;
  date: number; // Unix timestamp in milliseconds
  duration: number; // Duration in seconds
  type: number; // CALL_TYPES
  cachedName?: string;
  cachedNumberType?: number;
  cachedNumberLabel?: string;
  isNew: boolean;
  countryIso?: string;
  geocodedLocation?: string;
  phoneAccountId?: string;
}

export interface ProcessedCallLogEntry {
  id: string;
  number: string;
  timestamp: Date;
  duration: number;
  direction: 'inbound' | 'outbound';
  type: 'call';
  contactName?: string;
  isAnswered: boolean;
  isMissed: boolean;
  phoneAccountId?: string;
  metadata: {
    rawType: number;
    countryIso?: string;
    geocodedLocation?: string;
    cachedNumberType?: number;
    cachedNumberLabel?: string;
  };
}

export interface CallLogCollectionOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  phoneNumbers?: string[];
}

class CallLogCollectorService {
  private static instance: CallLogCollectorService;

  private constructor() {}

  public static getInstance(): CallLogCollectorService {
    if (!CallLogCollectorService.instance) {
      CallLogCollectorService.instance = new CallLogCollectorService();
    }
    return CallLogCollectorService.instance;
  }

  /**
   * Check if call log collection is available and permissions are granted
   */
  public async canCollectCallLog(): Promise<boolean> {
    if (!PlatformDetector.isAndroid) {
      return false;
    }

    const permissions = await PermissionsManager.checkAllPermissions();
    return permissions.callLog.status === 'granted';
  }

  /**
   * Collect call log entries with optional filtering
   */
  public async collectCallLog(options: CallLogCollectionOptions = {}): Promise<ProcessedCallLogEntry[]> {
    if (!await this.canCollectCallLog()) {
      throw new Error('Call log collection not available. Check permissions and platform support.');
    }

    try {
      const rawEntries = await this.fetchRawCallLog(options);
      return rawEntries.map(entry => this.processCallLogEntry(entry));
    } catch (error) {
      console.error('Error collecting call log:', error);
      throw new Error(`Failed to collect call log: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get call log count for date range
   */
  public async getCallLogCount(_startDate?: Date, _endDate?: Date): Promise<number> {
    if (!await this.canCollectCallLog()) {
      return 0;
    }

    // This would typically use a count query to avoid loading all data
    // In a real implementation, this would be a proper count query
    // For now, we'll return 0 as a placeholder
    return 0;
  }

  /**
   * Collect call log entries in batches for large datasets
   */
  public async *collectCallLogBatches(
    options: CallLogCollectionOptions & { batchSize?: number } = {}
  ): AsyncGenerator<ProcessedCallLogEntry[], void, unknown> {
    if (!await this.canCollectCallLog()) {
      return;
    }

    const batchSize = options.batchSize || 100;
    let offset = options.offset || 0;
    
    while (true) {
      try {
        const batch = await this.collectCallLog({
          ...options,
          limit: batchSize,
          offset,
        });

        if (batch.length === 0) {
          break;
        }

        yield batch;
        
        if (batch.length < batchSize) {
          break; // Last batch
        }

        offset += batchSize;
      } catch (error) {
        console.error('Error in call log batch collection:', error);
        break;
      }
    }
  }

  /**
   * Get the most recent call log entry timestamp
   */
  public async getLastCallTimestamp(): Promise<Date | null> {
    if (!await this.canCollectCallLog()) {
      return null;
    }

    try {
      const entries = await this.fetchRawCallLog({ limit: 1 });
      return entries.length > 0 ? new Date(entries[0].date) : null;
    } catch (error) {
      console.error('Error getting last call timestamp:', error);
      return null;
    }
  }

  /**
   * Fetch raw call log data from Android ContentResolver
   * Note: This would typically use React Native's NativeModules to access Android's CallLog.Calls content provider
   */
  private async fetchRawCallLog(options: CallLogCollectionOptions): Promise<RawCallLogEntry[]> {
    // In a real implementation, this would use React Native's bridge to Android
    // For now, we'll return mock data structure to establish the interface

    if (!PlatformDetector.isAndroid) {
      return [];
    }

    // This is where we would call a native Android module
    // Example: const result = await NativeModules.CallLogModule.getCallLog(options);
    
    // Mock implementation for interface establishment
    console.log('CallLogCollector: fetchRawCallLog called with options:', options);
    
    // Return empty array as placeholder - real implementation would fetch from ContentResolver
    return [];
  }

  /**
   * Process raw call log entry into our standardized format
   */
  private processCallLogEntry(rawEntry: RawCallLogEntry): ProcessedCallLogEntry {
    const direction = this.determineCallDirection(rawEntry.type);
    const isAnswered = this.isCallAnswered(rawEntry.type, rawEntry.duration);
    const isMissed = rawEntry.type === CALL_TYPES.MISSED;

    return {
      id: rawEntry.id,
      number: this.normalizePhoneNumber(rawEntry.number),
      timestamp: new Date(rawEntry.date),
      duration: rawEntry.duration,
      direction,
      type: 'call',
      contactName: rawEntry.cachedName || undefined,
      isAnswered,
      isMissed,
      phoneAccountId: rawEntry.phoneAccountId,
      metadata: {
        rawType: rawEntry.type,
        countryIso: rawEntry.countryIso,
        geocodedLocation: rawEntry.geocodedLocation,
        cachedNumberType: rawEntry.cachedNumberType,
        cachedNumberLabel: rawEntry.cachedNumberLabel,
      },
    };
  }

  /**
   * Determine call direction from Android call type
   */
  private determineCallDirection(callType: number): 'inbound' | 'outbound' {
    switch (callType) {
      case CALL_TYPES.INCOMING:
      case CALL_TYPES.MISSED:
      case CALL_TYPES.VOICEMAIL:
      case CALL_TYPES.REJECTED:
      case CALL_TYPES.ANSWERED_EXTERNALLY:
        return 'inbound';
      case CALL_TYPES.OUTGOING:
        return 'outbound';
      case CALL_TYPES.BLOCKED:
        return 'inbound'; // Blocked calls are typically incoming
      default:
        return 'inbound'; // Default to inbound for unknown types
    }
  }

  /**
   * Determine if call was answered based on type and duration
   */
  private isCallAnswered(callType: number, duration: number): boolean {
    if (callType === CALL_TYPES.MISSED || callType === CALL_TYPES.REJECTED || callType === CALL_TYPES.BLOCKED) {
      return false;
    }
    
    if (callType === CALL_TYPES.ANSWERED_EXTERNALLY) {
      return true;
    }

    // For incoming/outgoing calls, consider answered if duration > 0
    return duration > 0;
  }

  /**
   * Normalize phone number format
   */
  private normalizePhoneNumber(number: string): string {
    if (!number) return '';
    
    // Remove common formatting characters
    const normalized = number.replace(/[\s\-()+]/g, '');
    
    // Handle international format
    if (normalized.startsWith('1') && normalized.length === 11) {
      // US/Canada number with country code
      return normalized;
    } else if (normalized.length === 10) {
      // US/Canada number without country code
      return '1' + normalized;
    }
    
    return normalized;
  }

  /**
   * Get human-readable call type description
   */
  public getCallTypeDescription(callType: number): string {
    switch (callType) {
      case CALL_TYPES.INCOMING:
        return 'Incoming';
      case CALL_TYPES.OUTGOING:
        return 'Outgoing';
      case CALL_TYPES.MISSED:
        return 'Missed';
      case CALL_TYPES.VOICEMAIL:
        return 'Voicemail';
      case CALL_TYPES.REJECTED:
        return 'Rejected';
      case CALL_TYPES.BLOCKED:
        return 'Blocked';
      case CALL_TYPES.ANSWERED_EXTERNALLY:
        return 'Answered Externally';
      default:
        return 'Unknown';
    }
  }
}

export const CallLogCollector = CallLogCollectorService.getInstance();