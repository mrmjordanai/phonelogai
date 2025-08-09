import { Event, Contact, SyncHealth } from '@phonelogai/types';
import { PlatformDetector } from '../utils/PlatformDetector';
import { PermissionsManager } from './PermissionsManager';
import { CallLogCollector, ProcessedCallLogEntry } from './android/CallLogCollector';
import { SmsLogCollector, ProcessedSmsEntry } from './android/SmsLogCollector';
import { DataNormalizer, NormalizedData, NormalizationOptions } from './DataNormalizer';
import { OfflineQueue } from './OfflineQueue';
import { SyncService, SyncOptions } from './SyncService';
import { CryptoService } from './CryptoService';

export interface CollectionOptions {
  userId: string;
  lineId: string;
  includeCallLog?: boolean;
  includeSmsLog?: boolean;
  includeContactMatching?: boolean;
  enablePrivacyFiltering?: boolean;
  anonymizeContent?: boolean;
  startDate?: Date;
  endDate?: Date;
  batchSize?: number;
  autoSync?: boolean;
  encryptLocally?: boolean;
}

export interface CollectionResult {
  success: boolean;
  events: Event[];
  contacts: Map<string, Contact>;
  stats: {
    callsCollected: number;
    smsCollected: number;
    contactsMatched: number;
    duplicatesFound: number;
    errorsEncountered: number;
  };
  errors: string[];
  duration: number;
  queuedForSync: boolean;
}

export interface CollectionProgress {
  phase: 'initializing' | 'permissions' | 'collecting_calls' | 'collecting_sms' | 'normalizing' | 'queuing' | 'syncing' | 'complete';
  progress: number; // 0-100
  message: string;
  itemsProcessed: number;
  itemsTotal: number;
}

class DataCollectionServiceImpl {
  private static instance: DataCollectionServiceImpl;
  private collectionInProgress = false;
  private progressListeners: Array<(progress: CollectionProgress) => void> = [];

  private constructor() {}

  public static getInstance(): DataCollectionServiceImpl {
    if (!DataCollectionServiceImpl.instance) {
      DataCollectionServiceImpl.instance = new DataCollectionServiceImpl();
    }
    return DataCollectionServiceImpl.instance;
  }

  /**
   * Initialize data collection service
   */
  public async initialize(): Promise<void> {
    try {
      await PlatformDetector.initialize();
      await OfflineQueue.initialize();
      await SyncService.initialize();
      await CryptoService.initialize();
      
      console.log('DataCollectionService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize DataCollectionService:', error);
      throw new Error(`DataCollectionService initialization failed: ${error.message}`);
    }
  }

  /**
   * Check if data collection is available on current platform
   */
  public async canCollectData(): Promise<{
    available: boolean;
    reasons: string[];
    requiredPermissions: string[];
  }> {
    const reasons: string[] = [];
    const requiredPermissions: string[] = [];

    // Check platform support
    if (!PlatformDetector.canCollectDeviceData) {
      reasons.push(PlatformDetector.getDataCollectionMessage());
      return {
        available: false,
        reasons,
        requiredPermissions,
      };
    }

    // Check permissions
    const permissions = await PermissionsManager.checkAllPermissions();
    
    if (permissions.callLog.status !== 'granted') {
      reasons.push('Call log access permission required');
      requiredPermissions.push('READ_CALL_LOG');
    }

    if (permissions.sms.status !== 'granted') {
      reasons.push('SMS access permission required');
      requiredPermissions.push('READ_SMS');
    }

    if (permissions.contacts.status !== 'granted') {
      reasons.push('Contacts access permission recommended for better insights');
      requiredPermissions.push('READ_CONTACTS');
    }

    const hasRequiredPermissions = permissions.callLog.status === 'granted' || 
                                  permissions.sms.status === 'granted';

    return {
      available: hasRequiredPermissions,
      reasons,
      requiredPermissions,
    };
  }

  /**
   * Request necessary permissions for data collection
   */
  public async requestPermissions(): Promise<{
    granted: boolean;
    permissions: {
      callLog: boolean;
      sms: boolean;
      contacts: boolean;
    };
  }> {
    if (!PlatformDetector.isAndroid) {
      return {
        granted: false,
        permissions: {
          callLog: false,
          sms: false,
          contacts: false,
        },
      };
    }

    const permissionsState = await PermissionsManager.requestDataCollectionPermissions();

    const permissions = {
      callLog: permissionsState.callLog.status === 'granted',
      sms: permissionsState.sms.status === 'granted',
      contacts: permissionsState.contacts.status === 'granted',
    };

    const granted = permissions.callLog || permissions.sms;

    return { granted, permissions };
  }

  /**
   * Collect call and SMS data from device
   */
  public async collectData(options: CollectionOptions): Promise<CollectionResult> {
    if (this.collectionInProgress) {
      throw new Error('Data collection already in progress');
    }

    const startTime = Date.now();
    this.collectionInProgress = true;

    const result: CollectionResult = {
      success: false,
      events: [],
      contacts: new Map(),
      stats: {
        callsCollected: 0,
        smsCollected: 0,
        contactsMatched: 0,
        duplicatesFound: 0,
        errorsEncountered: 0,
      },
      errors: [],
      duration: 0,
      queuedForSync: false,
    };

    try {
      this.notifyProgress({
        phase: 'initializing',
        progress: 0,
        message: 'Initializing data collection...',
        itemsProcessed: 0,
        itemsTotal: 0,
      });

      // Check permissions
      this.notifyProgress({
        phase: 'permissions',
        progress: 10,
        message: 'Checking permissions...',
        itemsProcessed: 0,
        itemsTotal: 0,
      });

      const canCollect = await this.canCollectData();
      if (!canCollect.available) {
        throw new Error(`Cannot collect data: ${canCollect.reasons.join(', ')}`);
      }

      // Collect call log data
      let callEntries: ProcessedCallLogEntry[] = [];
      if (options.includeCallLog !== false) {
        this.notifyProgress({
          phase: 'collecting_calls',
          progress: 20,
          message: 'Collecting call log data...',
          itemsProcessed: 0,
          itemsTotal: 0,
        });

        callEntries = await this.collectCallLogData(options);
        result.stats.callsCollected = callEntries.length;
      }

      // Collect SMS data
      let smsEntries: ProcessedSmsEntry[] = [];
      if (options.includeSmsLog !== false) {
        this.notifyProgress({
          phase: 'collecting_sms',
          progress: 40,
          message: 'Collecting SMS data...',
          itemsProcessed: 0,
          itemsTotal: 0,
        });

        smsEntries = await this.collectSmsData(options);
        result.stats.smsCollected = smsEntries.length;
      }

      // Normalize data
      this.notifyProgress({
        phase: 'normalizing',
        progress: 60,
        message: 'Normalizing collected data...',
        itemsProcessed: 0,
        itemsTotal: callEntries.length + smsEntries.length,
      });

      const normalizedData = await this.normalizeData(callEntries, smsEntries, options);
      
      result.events = normalizedData.events;
      result.contacts = normalizedData.contacts;
      result.stats.contactsMatched = normalizedData.contacts.size;
      result.stats.duplicatesFound = normalizedData.duplicates.length;
      result.stats.errorsEncountered = normalizedData.errors.length;
      result.errors = normalizedData.errors.map(e => e.error);

      // Queue for sync
      if (options.autoSync !== false && result.events.length > 0) {
        this.notifyProgress({
          phase: 'queuing',
          progress: 80,
          message: 'Queuing data for sync...',
          itemsProcessed: 0,
          itemsTotal: result.events.length,
        });

        await this.queueDataForSync(result.events, Array.from(result.contacts.values()), options);
        result.queuedForSync = true;

        // Trigger immediate sync if conditions are met
        if (options.autoSync === true) {
          this.notifyProgress({
            phase: 'syncing',
            progress: 90,
            message: 'Starting data sync...',
            itemsProcessed: 0,
            itemsTotal: result.events.length,
          });

          // Start sync in background (don't wait for completion)
          SyncService.startSync({
            strategy: 'wifi_preferred',
            enableEncryption: options.encryptLocally,
          }).catch(error => {
            console.error('Background sync failed:', error);
          });
        }
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      this.notifyProgress({
        phase: 'complete',
        progress: 100,
        message: `Collection complete: ${result.events.length} events processed`,
        itemsProcessed: result.events.length,
        itemsTotal: result.events.length,
      });

    } catch (error) {
      console.error('Data collection failed:', error);
      result.errors.push(error.message || 'Unknown collection error');
      result.success = false;
      result.duration = Date.now() - startTime;

      this.notifyProgress({
        phase: 'complete',
        progress: 100,
        message: `Collection failed: ${error.message}`,
        itemsProcessed: 0,
        itemsTotal: 0,
      });
    } finally {
      this.collectionInProgress = false;
    }

    return result;
  }

  /**
   * Get collection statistics without full collection
   */
  public async getCollectionStats(options: Partial<CollectionOptions> = {}): Promise<{
    estimatedCallCount: number;
    estimatedSmsCount: number;
    lastCallTimestamp?: Date;
    lastSmsTimestamp?: Date;
    canCollectCalls: boolean;
    canCollectSms: boolean;
  }> {
    const stats = {
      estimatedCallCount: 0,
      estimatedSmsCount: 0,
      lastCallTimestamp: undefined as Date | undefined,
      lastSmsTimestamp: undefined as Date | undefined,
      canCollectCalls: false,
      canCollectSms: false,
    };

    try {
      stats.canCollectCalls = await CallLogCollector.canCollectCallLog();
      stats.canCollectSms = await SmsLogCollector.canCollectSmsLog();

      if (stats.canCollectCalls) {
        stats.estimatedCallCount = await CallLogCollector.getCallLogCount(
          options.startDate,
          options.endDate
        );
        stats.lastCallTimestamp = await CallLogCollector.getLastCallTimestamp();
      }

      if (stats.canCollectSms) {
        stats.estimatedSmsCount = await SmsLogCollector.getSmsLogCount(
          options.startDate,
          options.endDate
        );
        stats.lastSmsTimestamp = await SmsLogCollector.getLastSmsTimestamp();
      }
    } catch (error) {
      console.error('Failed to get collection stats:', error);
    }

    return stats;
  }

  /**
   * Subscribe to collection progress updates
   */
  public onProgress(callback: (progress: CollectionProgress) => void): () => void {
    this.progressListeners.push(callback);
    
    return () => {
      const index = this.progressListeners.indexOf(callback);
      if (index !== -1) {
        this.progressListeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if collection is currently in progress
   */
  public get isCollecting(): boolean {
    return this.collectionInProgress;
  }

  /**
   * Collect call log data with batch processing
   */
  private async collectCallLogData(options: CollectionOptions): Promise<ProcessedCallLogEntry[]> {
    const entries: ProcessedCallLogEntry[] = [];
    const batchSize = options.batchSize || 100;

    try {
      const batches = CallLogCollector.collectCallLogBatches({
        startDate: options.startDate,
        endDate: options.endDate,
        batchSize,
      });

      for await (const batch of batches) {
        entries.push(...batch);
        
        this.notifyProgress({
          phase: 'collecting_calls',
          progress: 20 + (entries.length / (entries.length + 100)) * 15, // Rough progress
          message: `Collected ${entries.length} calls...`,
          itemsProcessed: entries.length,
          itemsTotal: entries.length + 100, // Estimate
        });
      }
    } catch (error) {
      console.error('Call log collection failed:', error);
      throw new Error(`Call log collection failed: ${error.message}`);
    }

    return entries;
  }

  /**
   * Collect SMS data with batch processing
   */
  private async collectSmsData(options: CollectionOptions): Promise<ProcessedSmsEntry[]> {
    const entries: ProcessedSmsEntry[] = [];
    const batchSize = options.batchSize || 100;

    try {
      const batches = SmsLogCollector.collectSmsLogBatches({
        startDate: options.startDate,
        endDate: options.endDate,
        batchSize,
        includeContent: !options.anonymizeContent,
      });

      for await (const batch of batches) {
        entries.push(...batch);
        
        this.notifyProgress({
          phase: 'collecting_sms',
          progress: 40 + (entries.length / (entries.length + 100)) * 15, // Rough progress
          message: `Collected ${entries.length} SMS messages...`,
          itemsProcessed: entries.length,
          itemsTotal: entries.length + 100, // Estimate
        });
      }
    } catch (error) {
      console.error('SMS collection failed:', error);
      throw new Error(`SMS collection failed: ${error.message}`);
    }

    return entries;
  }

  /**
   * Normalize collected data
   */
  private async normalizeData(
    callEntries: ProcessedCallLogEntry[],
    smsEntries: ProcessedSmsEntry[],
    options: CollectionOptions
  ): Promise<NormalizedData> {
    const normalizationOptions: NormalizationOptions = {
      userId: options.userId,
      lineId: options.lineId,
      enableContactMatching: options.includeContactMatching,
      enablePrivacyFiltering: options.enablePrivacyFiltering,
      anonymizeContent: options.anonymizeContent,
    };

    return await DataNormalizer.normalizeCommEvents(
      callEntries,
      smsEntries,
      normalizationOptions
    );
  }

  /**
   * Queue normalized data for sync
   */
  private async queueDataForSync(
    events: Event[],
    contacts: Contact[],
    options: CollectionOptions
  ): Promise<void> {
    try {
      // Queue events
      if (events.length > 0) {
        await OfflineQueue.enqueueBatch(events, 'CREATE_EVENT');
      }

      // Queue contacts
      for (const contact of contacts) {
        await OfflineQueue.enqueueContact(contact, 'CREATE_CONTACT');
      }

      console.log(`Queued ${events.length} events and ${contacts.length} contacts for sync`);
    } catch (error) {
      console.error('Failed to queue data for sync:', error);
      throw new Error(`Failed to queue data for sync: ${error.message}`);
    }
  }

  /**
   * Notify progress listeners
   */
  private notifyProgress(progress: CollectionProgress): void {
    for (const listener of this.progressListeners) {
      try {
        listener(progress);
      } catch (error) {
        console.error('Progress listener error:', error);
      }
    }
  }
}

export const DataCollectionService = DataCollectionServiceImpl.getInstance();