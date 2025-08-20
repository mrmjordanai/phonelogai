import { Platform } from 'react-native';

export interface ProcessedSmsEntry {
  id: string;
  number: string;
  timestamp: Date;
  direction: 'inbound' | 'outbound';
  type: 'sms';
  content?: string;
  contactName?: string;
  metadata: {
    source: 'file_import' | 'manual_entry';
    threadId?: string;
  };
}

export interface SmsLogCollectionOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  includeContent?: boolean;
}

/**
 * Simplified SmsLogCollector for Expo managed workflow
 * Focuses on file import and manual entry instead of native module access
 */
class SmsLogCollectorService {
  private static instance: SmsLogCollectorService;

  private constructor() {}

  public static getInstance(): SmsLogCollectorService {
    if (!SmsLogCollectorService.instance) {
      SmsLogCollectorService.instance = new SmsLogCollectorService();
    }
    return SmsLogCollectorService.instance;
  }

  /**
   * Check if SMS collection is available
   * In simplified mode, this always returns false for native access
   */
  public async canCollectSmsLog(): Promise<boolean> {
    // Native SMS access not available in Expo managed workflow
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
        'Import SMS backup files',
        'Export from SMS backup apps',
        'Download carrier message logs',
        'Enter key messages manually',
      ],
      androidInstructions: [
        '1. Install SMS Backup & Restore app from Play Store',
        '2. Open the app and tap "Backup"',
        '3. Select "Local Backup" or "Google Drive"',
        '4. Choose XML or CSV format',
        '5. Import the backup file in PhoneLog AI',
      ],
      iosInstructions: [
        '1. Use third-party SMS export apps',
        '2. Export through iTunes backup tools',
        '3. Request message logs from carrier',
        '4. Use iMazing or similar tools',
        '5. Import exported files in PhoneLog AI',
      ],
    };
  }

  /**
   * Process SMS entries from imported files
   */
  public processImportedSmsLog(rawData: unknown[], includeContent: boolean = true): ProcessedSmsEntry[] {
    const entries: ProcessedSmsEntry[] = [];

    for (const row of rawData) {
      try {
        const entry = this.processSmsEntry(row as Record<string, unknown>, includeContent);
        if (entry) {
          entries.push(entry);
        }
      } catch (error) {
        console.error('Error processing SMS entry:', error);
      }
    }

    return entries;
  }

  /**
   * Get SMS count estimate (always returns 0 for native access)
   */
  public async getSmsLogCount(): Promise<number> {
    return 0;
  }

  /**
   * Get last SMS timestamp (always returns null for native access)
   */
  public async getLastSmsTimestamp(): Promise<Date | null> {
    return null;
  }

  /**
   * Create manual SMS entry
   */
  public createManualEntry(data: {
    number: string;
    timestamp: Date;
    direction: 'inbound' | 'outbound';
    content?: string;
    contactName?: string;
  }): ProcessedSmsEntry {
    return {
      id: `manual_sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      number: this.normalizePhoneNumber(data.number),
      timestamp: data.timestamp,
      direction: data.direction,
      type: 'sms',
      content: data.content,
      contactName: data.contactName,
      metadata: {
        source: 'manual_entry',
      },
    };
  }

  /**
   * Process raw SMS entry from imported data
   */
  private processSmsEntry(rawEntry: Record<string, unknown>, includeContent: boolean): ProcessedSmsEntry | null {
    try {
      // Handle different possible formats from SMS backup exports
      const number = String(rawEntry.number || rawEntry.address || rawEntry.phone || '');
      const date = rawEntry.date || rawEntry.timestamp || rawEntry.time;
      const type = rawEntry.type || rawEntry.direction || rawEntry.messageType;
      const body = includeContent ? String(rawEntry.body || rawEntry.message || rawEntry.text || '') : undefined;

      if (!number || !date) {
        return null; // Skip entries without required data
      }

      const timestamp = new Date(String(date));
      const direction = this.determineSmsDirection(String(type));

      return {
        id: `imported_sms_${timestamp.getTime()}_${this.normalizePhoneNumber(number)}`,
        number: this.normalizePhoneNumber(number),
        timestamp,
        direction,
        type: 'sms',
        content: body,
        contactName: String(rawEntry.contact_name || rawEntry.contactName || rawEntry.name || ''),
        metadata: {
          source: 'file_import',
          threadId: String(rawEntry.thread_id || rawEntry.threadId || ''),
        },
      };
    } catch (error) {
      console.error('Error processing SMS entry:', error);
      return null;
    }
  }

  /**
   * Determine SMS direction from various input formats
   */
  private determineSmsDirection(type: unknown): 'inbound' | 'outbound' {
    if (!type) return 'inbound';

    const typeStr = String(type).toLowerCase();
    
    // SMS Backup & Restore formats
    if (typeStr === '2' || typeStr.includes('sent') || typeStr.includes('out')) {
      return 'outbound';
    } else if (typeStr === '1' || typeStr.includes('received') || typeStr.includes('in')) {
      return 'inbound';
    }

    // Common text descriptions
    if (typeStr.includes('sent') || typeStr.includes('outgoing')) {
      return 'outbound';
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
    smsExportSteps: string[];
    recommendedApps: string[];
    alternativeMethods: string[];
  } {
    const isAndroid = Platform.OS === 'android';
    
    return {
      platform: Platform.OS,
      smsExportSteps: isAndroid ? [
        'Install "SMS Backup & Restore" from Google Play',
        'Open the app and grant necessary permissions',
        'Tap "Create a backup"',
        'Choose backup location (local or cloud)',
        'Select CSV or XML format',
        'Wait for backup to complete',
        'Import the backup file in PhoneLog AI'
      ] : [
        'Install third-party SMS export app',
        'Use iTunes backup and extraction tools',
        'Try iMazing, 3uTools, or similar software',
        'Export messages to CSV/XML format',
        'Transfer files to device for import'
      ],
      recommendedApps: isAndroid ? [
        'SMS Backup & Restore',
        'My Backup',
        'Titanium Backup (root)',
        'Super Backup'
      ] : [
        'iMazing',
        '3uTools',
        'AnyTrans',
        'Wondershare Dr.Fone'
      ],
      alternativeMethods: [
        'Manual entry of important messages',
        'Carrier account message history',
        'Screenshot key conversations for reference',
        'Export from messaging apps (WhatsApp, etc.)'
      ]
    };
  }

  /**
   * Parse common SMS backup formats
   */
  public parseSmsBackupFile(fileContent: string, format: 'csv' | 'xml' | 'json'): Record<string, unknown>[] {
    try {
      switch (format) {
        case 'csv':
          return this.parseCsvContent(fileContent);
        case 'xml':
          return this.parseXmlContent(fileContent);
        case 'json':
          return JSON.parse(fileContent);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      console.error('Error parsing SMS backup file:', error);
      return [];
    }
  }

  /**
   * Parse CSV content
   */
  private parseCsvContent(content: string): Record<string, unknown>[] {
    const lines = content.split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length === headers.length) {
        const row: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        rows.push(row);
      }
    }

    return rows;
  }

  /**
   * Parse XML content (basic implementation)
   */
  private parseXmlContent(content: string): Record<string, unknown>[] {
    // This is a simplified XML parser for SMS backup format
    // In a real implementation, you'd use a proper XML parser
    const smsPattern = /<sms[^>]*>/g;
    const matches = content.match(smsPattern) || [];
    
    return matches.map(match => {
      const attrs: Record<string, unknown> = {};
      const attrPattern = /(\w+)="([^"]*)"/g;
      let attrMatch;
      
      while ((attrMatch = attrPattern.exec(match)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }
      
      return attrs;
    });
  }
}

export const SmsLogCollector = SmsLogCollectorService.getInstance();