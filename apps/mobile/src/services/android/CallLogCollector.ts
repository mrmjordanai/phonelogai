import { Platform } from 'react-native';

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
  metadata: {
    source: 'file_import' | 'manual_entry';
    rawType?: number;
  };
}

export interface CallLogCollectionOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Simplified CallLogCollector for Expo managed workflow
 * Focuses on file import and manual entry instead of native module access
 */
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
   * Check if call log collection is available
   * In simplified mode, this always returns false for native access
   * Users are directed to file import or manual entry
   */
  public async canCollectCallLog(): Promise<boolean> {
    // Native call log access not available in Expo managed workflow
    return false;
  }

  /**
   * Get collection guidance for users
   */
  public getCollectionGuidance(): {
    nativeAccessAvailable: boolean;
    alternatives: string[];
    androidInstructions: string[];
    iosInstructions: string[];
  } {
    return {
      nativeAccessAvailable: false,
      alternatives: [
        'Import call log files exported from your device',
        'Download call detail records from your carrier',
        'Enter key call information manually',
      ],
      androidInstructions: [
        '1. Open Phone app > Menu > Settings',
        '2. Look for "Call history" or "Call logs"',
        '3. Tap "Export" or "Backup"',
        '4. Save as CSV or other format',
        '5. Import the file in PhoneLog AI',
      ],
      iosInstructions: [
        '1. Contact your carrier for call detail records',
        '2. Download carrier app and export data',
        '3. Use third-party call log apps',
        '4. Request data export from Settings > Privacy',
        '5. Import the files in PhoneLog AI',
      ],
    };
  }

  /**
   * Process call log entries from imported files
   */
  public processImportedCallLog(rawData: unknown[]): ProcessedCallLogEntry[] {
    const entries: ProcessedCallLogEntry[] = [];

    for (const row of rawData) {
      try {
        const entry = this.processCallLogEntry(row as Record<string, unknown>);
        if (entry) {
          entries.push(entry);
        }
      } catch (error) {
        console.error('Error processing call log entry:', error);
      }
    }

    return entries;
  }

  /**
   * Get call log count estimate (always returns 0 for native access)
   */
  public async getCallLogCount(): Promise<number> {
    return 0;
  }

  /**
   * Get last call timestamp (always returns null for native access)
   */
  public async getLastCallTimestamp(): Promise<Date | null> {
    return null;
  }

  /**
   * Create manual call log entry
   */
  public createManualEntry(data: {
    number: string;
    timestamp: Date;
    duration: number;
    direction: 'inbound' | 'outbound';
    isAnswered: boolean;
    contactName?: string;
  }): ProcessedCallLogEntry {
    return {
      id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      number: this.normalizePhoneNumber(data.number),
      timestamp: data.timestamp,
      duration: data.duration,
      direction: data.direction,
      type: 'call',
      contactName: data.contactName,
      isAnswered: data.isAnswered,
      isMissed: data.direction === 'inbound' && !data.isAnswered,
      metadata: {
        source: 'manual_entry',
      },
    };
  }

  /**
   * Process raw call log entry from imported data
   */
  private processCallLogEntry(rawEntry: Record<string, unknown>): ProcessedCallLogEntry | null {
    try {
      // Handle different possible formats from CSV/Excel imports
      const number = String(rawEntry.number || rawEntry.phone || rawEntry.phoneNumber || '');
      const date = rawEntry.date || rawEntry.timestamp || rawEntry.time;
      const duration = rawEntry.duration || rawEntry.length || 0;
      const type = rawEntry.type || rawEntry.direction || rawEntry.callType;

      if (!number || !date) {
        return null; // Skip entries without required data
      }

      const timestamp = new Date(String(date));
      const direction = this.determineCallDirection(String(type));
      const durationNum = parseInt(String(duration)) || 0;
      const isAnswered = durationNum > 0 || String(type).toLowerCase().includes('answered');

      return {
        id: `imported_${timestamp.getTime()}_${this.normalizePhoneNumber(number)}`,
        number: this.normalizePhoneNumber(number),
        timestamp,
        duration: durationNum,
        direction,
        type: 'call',
        contactName: String(rawEntry.name || rawEntry.contactName || ''),
        isAnswered,
        isMissed: direction === 'inbound' && !isAnswered,
        metadata: {
          source: 'file_import',
          rawType: parseInt(String(rawEntry.type || '0'), 10) || 0,
        },
      };
    } catch (error) {
      console.error('Error processing call log entry:', error);
      return null;
    }
  }

  /**
   * Determine call direction from various input formats
   */
  private determineCallDirection(type: unknown): 'inbound' | 'outbound' {
    if (!type) return 'inbound';

    const typeStr = String(type).toLowerCase();
    
    if (typeStr.includes('out') || typeStr.includes('dialed') || typeStr === '2') {
      return 'outbound';
    } else if (typeStr.includes('in') || typeStr.includes('received') || typeStr.includes('missed') || typeStr === '1' || typeStr === '3') {
      return 'inbound';
    }

    return 'inbound'; // Default to inbound
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
   * Get platform-specific guidance
   */
  public getPlatformGuidance(): {
    platform: string;
    callLogExportSteps: string[];
    alternativeMethods: string[];
  } {
    const isAndroid = Platform.OS === 'android';
    
    return {
      platform: Platform.OS,
      callLogExportSteps: isAndroid ? [
        'Open the default Phone app',
        'Tap the three-dot menu or Settings',
        'Look for "Call history", "Call logs", or "Export"',
        'Select export format (CSV preferred)',
        'Save to Downloads or Google Drive',
        'Import the file in PhoneLog AI'
      ] : [
        'Contact your carrier for call detail records (CDR)',
        'Log into your carrier account online',
        'Download billing statements with call details',
        'Use carrier mobile app export features',
        'Import downloaded files in PhoneLog AI'
      ],
      alternativeMethods: [
        'Manual entry of important calls',
        'Carrier website data export',
        'Third-party call log backup apps',
        'Request data from customer service'
      ]
    };
  }
}

export const CallLogCollector = CallLogCollectorService.getInstance();