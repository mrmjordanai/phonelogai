// Platform and NativeModules imports removed as they are not used in this file
import { PermissionsManager } from '../PermissionsManager';
import { PlatformDetector } from '../../utils/PlatformDetector';

// Android Telephony.Sms column constants
export const SMS_COLUMNS = {
  ID: '_id',
  THREAD_ID: 'thread_id',
  ADDRESS: 'address',
  PERSON: 'person',
  DATE: 'date',
  DATE_SENT: 'date_sent',
  PROTOCOL: 'protocol',
  READ: 'read',
  STATUS: 'status',
  TYPE: 'type',
  REPLY_PATH_PRESENT: 'reply_path_present',
  SUBJECT: 'subject',
  BODY: 'body',
  SERVICE_CENTER: 'service_center',
  LOCKED: 'locked',
  ERROR_CODE: 'error_code',
  SEEN: 'seen',
} as const;

// Android Telephony.Sms.TYPE constants
export const SMS_TYPES = {
  ALL: 0,
  INBOX: 1,
  SENT: 2,
  DRAFT: 3,
  OUTBOX: 4,
  FAILED: 5,
  QUEUED: 6,
} as const;

// SMS status constants
export const SMS_STATUS = {
  NONE: -1,
  COMPLETE: 0,
  PENDING: 32,
  FAILED: 64,
} as const;

export interface RawSmsEntry {
  id: string;
  threadId: string;
  address: string; // Phone number
  person?: string; // Contact ID
  date: number; // Unix timestamp in milliseconds
  dateSent: number; // When message was sent (may differ from received date)
  protocol?: number;
  read: boolean;
  status: number;
  type: number; // SMS_TYPES
  replyPathPresent?: boolean;
  subject?: string;
  body: string;
  serviceCenter?: string;
  locked: boolean;
  errorCode?: number;
  seen: boolean;
}

export interface ProcessedSmsEntry {
  id: string;
  threadId: string;
  number: string;
  timestamp: Date;
  dateSent: Date;
  direction: 'inbound' | 'outbound';
  type: 'sms';
  content: string;
  subject?: string;
  isRead: boolean;
  isSeen: boolean;
  status: 'sent' | 'pending' | 'failed' | 'draft' | 'queued';
  contactId?: string;
  metadata: {
    rawType: number;
    rawStatus: number;
    protocol?: number;
    serviceCenter?: string;
    errorCode?: number;
    locked: boolean;
  };
}

export interface SmsCollectionOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  phoneNumbers?: string[];
  includeContent?: boolean; // For privacy - allow collection without message content
  messageTypes?: number[]; // Filter by SMS_TYPES
}

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
   * Check if SMS log collection is available and permissions are granted
   */
  public async canCollectSmsLog(): Promise<boolean> {
    if (!PlatformDetector.isAndroid) {
      return false;
    }

    const permissions = await PermissionsManager.checkAllPermissions();
    return permissions.sms.status === 'granted';
  }

  /**
   * Collect SMS log entries with optional filtering
   */
  public async collectSmsLog(options: SmsCollectionOptions = {}): Promise<ProcessedSmsEntry[]> {
    if (!await this.canCollectSmsLog()) {
      throw new Error('SMS log collection not available. Check permissions and platform support.');
    }

    try {
      const rawEntries = await this.fetchRawSmsLog(options);
      return rawEntries.map(entry => this.processSmsEntry(entry, options.includeContent !== false));
    } catch (error) {
      console.error('Error collecting SMS log:', error);
      throw new Error(`Failed to collect SMS log: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get SMS log count for date range
   */
  public async getSmsLogCount(_startDate?: Date, _endDate?: Date): Promise<number> {
    if (!await this.canCollectSmsLog()) {
      return 0;
    }

    // This would typically use a count query to avoid loading all data
    // In a real implementation, this would be a proper count query
    // For now, we'll return 0 as a placeholder
    return 0;
  }

  /**
   * Collect SMS log entries in batches for large datasets
   */
  public async *collectSmsLogBatches(
    options: SmsCollectionOptions & { batchSize?: number } = {}
  ): AsyncGenerator<ProcessedSmsEntry[], void, unknown> {
    if (!await this.canCollectSmsLog()) {
      return;
    }

    const batchSize = options.batchSize || 100;
    let offset = options.offset || 0;
    
    while (true) {
      try {
        const batch = await this.collectSmsLog({
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
        console.error('Error in SMS log batch collection:', error);
        break;
      }
    }
  }

  /**
   * Get the most recent SMS timestamp
   */
  public async getLastSmsTimestamp(): Promise<Date | null> {
    if (!await this.canCollectSmsLog()) {
      return null;
    }

    try {
      const entries = await this.fetchRawSmsLog({ limit: 1 });
      return entries.length > 0 ? new Date(entries[0].date) : null;
    } catch (error) {
      console.error('Error getting last SMS timestamp:', error);
      return null;
    }
  }

  /**
   * Get SMS conversation threads
   */
  public async getSmsThreads(): Promise<Array<{
    threadId: string;
    address: string;
    messageCount: number;
    lastMessage: Date;
  }>> {
    if (!await this.canCollectSmsLog()) {
      return [];
    }

    try {
      // This would typically use a GROUP BY query on thread_id
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.error('Error getting SMS threads:', error);
      return [];
    }
  }

  /**
   * Fetch raw SMS data from Android ContentResolver
   * Note: This would typically use React Native's NativeModules to access Android's Telephony.Sms content provider
   */
  private async fetchRawSmsLog(options: SmsCollectionOptions): Promise<RawSmsEntry[]> {
    // In a real implementation, this would use React Native's bridge to Android
    // For now, we'll return mock data structure to establish the interface

    if (!PlatformDetector.isAndroid) {
      return [];
    }

    // This is where we would call a native Android module
    // Example: const result = await NativeModules.SmsLogModule.getSmsLog(options);
    
    // Mock implementation for interface establishment
    console.log('SmsLogCollector: fetchRawSmsLog called with options:', options);
    
    // Return empty array as placeholder - real implementation would fetch from ContentResolver
    return [];
  }

  /**
   * Process raw SMS entry into our standardized format
   */
  private processSmsEntry(rawEntry: RawSmsEntry, includeContent: boolean): ProcessedSmsEntry {
    const direction = this.determineSmsDirection(rawEntry.type);
    const status = this.determineSmsStatus(rawEntry.type, rawEntry.status);

    return {
      id: rawEntry.id,
      threadId: rawEntry.threadId,
      number: this.normalizePhoneNumber(rawEntry.address),
      timestamp: new Date(rawEntry.date),
      dateSent: new Date(rawEntry.dateSent),
      direction,
      type: 'sms',
      content: includeContent ? rawEntry.body : '', // Respect privacy setting
      subject: rawEntry.subject,
      isRead: rawEntry.read,
      isSeen: rawEntry.seen,
      status,
      contactId: rawEntry.person,
      metadata: {
        rawType: rawEntry.type,
        rawStatus: rawEntry.status,
        protocol: rawEntry.protocol,
        serviceCenter: rawEntry.serviceCenter,
        errorCode: rawEntry.errorCode,
        locked: rawEntry.locked,
      },
    };
  }

  /**
   * Determine SMS direction from Android SMS type
   */
  private determineSmsDirection(smsType: number): 'inbound' | 'outbound' {
    switch (smsType) {
      case SMS_TYPES.INBOX:
        return 'inbound';
      case SMS_TYPES.SENT:
      case SMS_TYPES.OUTBOX:
      case SMS_TYPES.DRAFT:
      case SMS_TYPES.QUEUED:
        return 'outbound';
      case SMS_TYPES.FAILED:
        return 'outbound'; // Failed messages are typically outbound
      default:
        return 'inbound'; // Default to inbound for unknown types
    }
  }

  /**
   * Determine SMS status from type and status fields
   */
  private determineSmsStatus(smsType: number, statusCode: number): 'sent' | 'pending' | 'failed' | 'draft' | 'queued' {
    // First check the SMS type
    switch (smsType) {
      case SMS_TYPES.DRAFT:
        return 'draft';
      case SMS_TYPES.QUEUED:
        return 'queued';
      case SMS_TYPES.FAILED:
        return 'failed';
      case SMS_TYPES.SENT:
      case SMS_TYPES.INBOX:
        return 'sent';
      case SMS_TYPES.OUTBOX:
        // Outbox - check status code
        switch (statusCode) {
          case SMS_STATUS.COMPLETE:
            return 'sent';
          case SMS_STATUS.PENDING:
            return 'pending';
          case SMS_STATUS.FAILED:
            return 'failed';
          default:
            return 'pending';
        }
      default:
        return 'sent';
    }
  }

  /**
   * Normalize phone number format
   */
  private normalizePhoneNumber(address: string): string {
    if (!address) return '';
    
    // Remove common formatting characters
    const normalized = address.replace(/[\s\-()+]/g, '');
    
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
   * Get human-readable SMS type description
   */
  public getSmsTypeDescription(smsType: number): string {
    switch (smsType) {
      case SMS_TYPES.INBOX:
        return 'Received';
      case SMS_TYPES.SENT:
        return 'Sent';
      case SMS_TYPES.DRAFT:
        return 'Draft';
      case SMS_TYPES.OUTBOX:
        return 'Outbox';
      case SMS_TYPES.FAILED:
        return 'Failed';
      case SMS_TYPES.QUEUED:
        return 'Queued';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get human-readable SMS status description
   */
  public getSmsStatusDescription(status: number): string {
    switch (status) {
      case SMS_STATUS.COMPLETE:
        return 'Complete';
      case SMS_STATUS.PENDING:
        return 'Pending';
      case SMS_STATUS.FAILED:
        return 'Failed';
      case SMS_STATUS.NONE:
        return 'None';
      default:
        return 'Unknown';
    }
  }

  /**
   * Privacy-safe SMS collection (metadata only, no content)
   */
  public async collectSmsMetadata(options: SmsCollectionOptions = {}): Promise<ProcessedSmsEntry[]> {
    return this.collectSmsLog({
      ...options,
      includeContent: false,
    });
  }
}

export const SmsLogCollector = SmsLogCollectorService.getInstance();