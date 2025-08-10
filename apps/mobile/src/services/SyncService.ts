import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Event, Contact, SyncHealth } from '@phonelogai/types';
import { OfflineQueue, QueuedAction } from './OfflineQueue';
import { CryptoService } from './CryptoService';
import { supabase } from '@phonelogai/database';

export type SyncStrategy = 'wifi_only' | 'wifi_preferred' | 'cellular_allowed';

export interface SyncOptions {
  strategy?: SyncStrategy;
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableEncryption?: boolean;
  conflictResolution?: 'auto' | 'manual';
}

export interface SyncResult {
  success: boolean;
  processedItems: number;
  failedItems: number;
  conflictsFound: number;
  conflictsResolved: number;
  bytesTransferred: number;
  duration: number;
  errors: string[];
}

export interface SyncStatus {
  isActive: boolean;
  currentPhase: 'idle' | 'collecting' | 'encrypting' | 'uploading' | 'resolving_conflicts' | 'completing';
  progress: number; // 0-100
  itemsProcessed: number;
  itemsTotal: number;
  lastSync?: Date;
  nextSync?: Date;
  error?: string;
}

export interface NetworkInfo {
  isConnected: boolean;
  connectionType: string;
  isWiFi: boolean;
  isCellular: boolean;
  isMetered: boolean;
  strength?: number;
}

class SyncServiceImpl {
  private static instance: SyncServiceImpl;
  private syncInProgress = false;
  private syncStatus: SyncStatus = {
    isActive: false,
    currentPhase: 'idle',
    progress: 0,
    itemsProcessed: 0,
    itemsTotal: 0,
  };
  
  private networkInfo: NetworkInfo = {
    isConnected: false,
    connectionType: 'unknown',
    isWiFi: false,
    isCellular: false,
    isMetered: false,
  };

  private syncIntervalId?: ReturnType<typeof setInterval>;
  private statusListeners: Array<(_status: SyncStatus) => void> = [];
  private readonly DEFAULT_BATCH_SIZE = 50;
  private readonly DEFAULT_RETRY_DELAY = 5000; // 5 seconds
  private readonly MAX_BACKOFF_DELAY = 300000; // 5 minutes

  private constructor() {}

  public static getInstance(): SyncServiceImpl {
    if (!SyncServiceImpl.instance) {
      SyncServiceImpl.instance = new SyncServiceImpl();
    }
    return SyncServiceImpl.instance;
  }

  /**
   * Initialize sync service
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize dependencies
      await OfflineQueue.initialize();
      await CryptoService.initialize();

      // Set up network monitoring
      await this.setupNetworkMonitoring();

      // Set up periodic sync
      this.setupPeriodicSync();

      console.log('SyncService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SyncService:', error);
      throw new Error(`SyncService initialization failed: ${error.message}`);
    }
  }

  /**
   * Start manual sync
   */
  public async startSync(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    const startTime = Date.now();
    this.syncInProgress = true;
    
    const result: SyncResult = {
      success: false,
      processedItems: 0,
      failedItems: 0,
      conflictsFound: 0,
      conflictsResolved: 0,
      bytesTransferred: 0,
      duration: 0,
      errors: [],
    };

    try {
      // Check network conditions
      const canSync = await this.checkSyncConditions(options.strategy);
      if (!canSync) {
        throw new Error('Network conditions do not meet sync requirements');
      }

      this.updateSyncStatus({
        isActive: true,
        currentPhase: 'collecting',
        progress: 10,
        itemsProcessed: 0,
        itemsTotal: 0,
      });

      // Get items from queue
      const queuedItems = await OfflineQueue.getNextBatch(
        options.batchSize || this.DEFAULT_BATCH_SIZE
      );

      if (queuedItems.length === 0) {
        result.success = true;
        result.duration = Date.now() - startTime;
        return result;
      }

      this.updateSyncStatus({
        currentPhase: 'encrypting',
        progress: 20,
        itemsTotal: queuedItems.length,
      });

      // Process items in batches
      const batchResults = await this.processSyncBatches(queuedItems, options);
      
      // Aggregate results
      for (const batchResult of batchResults) {
        result.processedItems += batchResult.processedItems;
        result.failedItems += batchResult.failedItems;
        result.conflictsFound += batchResult.conflictsFound;
        result.conflictsResolved += batchResult.conflictsResolved;
        result.bytesTransferred += batchResult.bytesTransferred;
        result.errors.push(...batchResult.errors);
      }

      // Update sync health
      await this.updateSyncHealth(result);

      result.success = result.failedItems === 0;
      result.duration = Date.now() - startTime;

      this.updateSyncStatus({
        currentPhase: 'completing',
        progress: 100,
        itemsProcessed: result.processedItems,
        lastSync: new Date(),
      });

    } catch (error) {
      console.error('Sync failed:', error);
      result.errors.push(error.message || 'Unknown sync error');
      result.success = false;
      
      this.updateSyncStatus({
        error: error.message || 'Sync failed',
      });
    } finally {
      this.syncInProgress = false;
      this.updateSyncStatus({
        isActive: false,
        currentPhase: 'idle',
        progress: 0,
      });
    }

    return result;
  }

  /**
   * Enable automatic periodic sync
   */
  public enablePeriodicSync(intervalMinutes: number = 15): void {
    this.disablePeriodicSync();
    
    this.syncIntervalId = setInterval(async () => {
      try {
        if (!this.syncInProgress) {
          await this.startSync({ strategy: 'wifi_preferred' });
        }
      } catch (error) {
        console.error('Periodic sync failed:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Disable automatic periodic sync
   */
  public disablePeriodicSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
    }
  }

  /**
   * Get current sync status
   */
  public getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Get current network information
   */
  public getNetworkInfo(): NetworkInfo {
    return { ...this.networkInfo };
  }

  /**
   * Subscribe to sync status updates
   */
  public onSyncStatusChanged(callback: (_status: SyncStatus) => void): () => void {
    this.statusListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.statusListeners.indexOf(callback);
      if (index !== -1) {
        this.statusListeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if sync conditions are met based on strategy
   */
  private async checkSyncConditions(strategy: SyncStrategy = 'wifi_preferred'): Promise<boolean> {
    if (!this.networkInfo.isConnected) {
      return false;
    }

    switch (strategy) {
      case 'wifi_only':
        return this.networkInfo.isWiFi;
      
      case 'wifi_preferred':
        return this.networkInfo.isWiFi || this.networkInfo.isCellular;
      
      case 'cellular_allowed':
        return this.networkInfo.isConnected;
      
      default:
        return false;
    }
  }

  /**
   * Process sync batches
   */
  private async processSyncBatches(
    queuedItems: QueuedAction[],
    options: SyncOptions
  ): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;

    for (let i = 0; i < queuedItems.length; i += batchSize) {
      const batch = queuedItems.slice(i, i + batchSize);
      const batchResult = await this.processBatch(batch, options);
      results.push(batchResult);

      // Update progress
      const progress = Math.min(90, 20 + ((i + batch.length) / queuedItems.length) * 70);
      this.updateSyncStatus({
        progress,
        itemsProcessed: i + batch.length,
      });
    }

    return results;
  }

  /**
   * Process a single batch of queued items
   */
  private async processBatch(
    batch: QueuedAction[],
    options: SyncOptions
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      processedItems: 0,
      failedItems: 0,
      conflictsFound: 0,
      conflictsResolved: 0,
      bytesTransferred: 0,
      duration: 0,
      errors: [],
    };

    const startTime = Date.now();

    try {
      // Group items by type for efficient processing
      const events = batch.filter(item => item.type.includes('EVENT'));
      const contacts = batch.filter(item => item.type.includes('CONTACT'));
      const syncHealthItems = batch.filter(item => item.type === 'UPDATE_SYNC_HEALTH');

      // Process events
      if (events.length > 0) {
        const eventResult = await this.syncEvents(events, options);
        this.mergeResults(result, eventResult);
      }

      // Process contacts
      if (contacts.length > 0) {
        const contactResult = await this.syncContacts(contacts, options);
        this.mergeResults(result, contactResult);
      }

      // Process sync health updates
      if (syncHealthItems.length > 0) {
        const syncHealthResult = await this.syncHealthUpdates(syncHealthItems, options);
        this.mergeResults(result, syncHealthResult);
      }

      result.success = result.failedItems === 0;
    } catch (error) {
      console.error('Batch processing failed:', error);
      result.errors.push(error.message || 'Batch processing failed');
      result.failedItems = batch.length;
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Sync events to server
   */
  private async syncEvents(events: QueuedAction[], options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      processedItems: 0,
      failedItems: 0,
      conflictsFound: 0,
      conflictsResolved: 0,
      bytesTransferred: 0,
      duration: 0,
      errors: [],
    };

    try {
      // Prepare event data
      const eventData = events.map(item => item.payload as Event);
      
      // Encrypt if enabled
      if (options.enableEncryption) {
        await CryptoService.encryptBatch(
          eventData.map(e => ({ id: e.id, data: e }))
        );
        // Process encrypted data...
      }

      // Send to server
      const { error } = await supabase
        .from('events')
        .upsert(eventData, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });

      if (error) {
        throw error;
      }

      // Mark items as processed
      const processedIds = events.map(e => e.id);
      await OfflineQueue.markBatchProcessed(processedIds);

      result.processedItems = events.length;
      result.success = true;
      result.bytesTransferred = JSON.stringify(eventData).length;

    } catch (error) {
      console.error('Event sync failed:', error);
      result.errors.push(error.message || 'Event sync failed');
      result.failedItems = events.length;

      // Mark items as failed
      for (const event of events) {
        await OfflineQueue.markFailed(event.id, error.message || 'Sync failed');
      }
    }

    return result;
  }

  /**
   * Sync contacts to server
   */
  private async syncContacts(contacts: QueuedAction[], _options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      processedItems: 0,
      failedItems: 0,
      conflictsFound: 0,
      conflictsResolved: 0,
      bytesTransferred: 0,
      duration: 0,
      errors: [],
    };

    try {
      const contactData = contacts.map(item => item.payload as Contact);

      const { error } = await supabase
        .from('contacts')
        .upsert(contactData, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });

      if (error) {
        throw error;
      }

      const processedIds = contacts.map(c => c.id);
      await OfflineQueue.markBatchProcessed(processedIds);

      result.processedItems = contacts.length;
      result.success = true;
      result.bytesTransferred = JSON.stringify(contactData).length;

    } catch (error) {
      console.error('Contact sync failed:', error);
      result.errors.push(error.message || 'Contact sync failed');
      result.failedItems = contacts.length;

      for (const contact of contacts) {
        await OfflineQueue.markFailed(contact.id, error.message || 'Sync failed');
      }
    }

    return result;
  }

  /**
   * Sync health updates to server
   */
  private async syncHealthUpdates(syncHealthItems: QueuedAction[], _options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      processedItems: 0,
      failedItems: 0,
      conflictsFound: 0,
      conflictsResolved: 0,
      bytesTransferred: 0,
      duration: 0,
      errors: [],
    };

    try {
      const syncHealthData = syncHealthItems.map(item => item.payload as SyncHealth);

      const { error } = await supabase
        .from('sync_health')
        .upsert(syncHealthData, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });

      if (error) {
        throw error;
      }

      const processedIds = syncHealthItems.map(s => s.id);
      await OfflineQueue.markBatchProcessed(processedIds);

      result.processedItems = syncHealthItems.length;
      result.success = true;
      result.bytesTransferred = JSON.stringify(syncHealthData).length;

    } catch (error) {
      console.error('Sync health update failed:', error);
      result.errors.push(error.message || 'Sync health update failed');
      result.failedItems = syncHealthItems.length;

      for (const item of syncHealthItems) {
        await OfflineQueue.markFailed(item.id, error.message || 'Sync failed');
      }
    }

    return result;
  }

  /**
   * Update sync health status
   */
  private async updateSyncHealth(syncResult: SyncResult): Promise<void> {
    try {
      const queueStats = await OfflineQueue.getStats();
      
      const syncHealth: Partial<SyncHealth> = {
        source: 'device',
        last_sync: new Date().toISOString(),
        queue_depth: queueStats.totalItems,
        drift_percentage: this.calculateDriftPercentage(syncResult),
        status: syncResult.success ? 'healthy' : 
                syncResult.errors.length > 0 ? 'error' : 'warning',
        error_message: syncResult.errors.length > 0 ? 
                      syncResult.errors.join('; ') : undefined,
      };

      // Queue sync health update
      if (syncHealth.user_id) {
        await OfflineQueue.enqueueSyncHealth(syncHealth as SyncHealth);
      }
    } catch (error) {
      console.error('Failed to update sync health:', error);
    }
  }

  /**
   * Setup network monitoring
   */
  private async setupNetworkMonitoring(): Promise<void> {
    NetInfo.addEventListener((state: NetInfoState) => {
      this.networkInfo = {
        isConnected: state.isConnected || false,
        connectionType: state.type,
        isWiFi: state.type === 'wifi',
        isCellular: state.type === 'cellular',
        isMetered: state.isMetered || false,
        strength: state.details?.strength,
      };
    });

    // Get initial network state
    const initialState = await NetInfo.fetch();
    this.networkInfo = {
      isConnected: initialState.isConnected || false,
      connectionType: initialState.type,
      isWiFi: initialState.type === 'wifi',
      isCellular: initialState.type === 'cellular',
      isMetered: initialState.isMetered || false,
      strength: initialState.details?.strength,
    };
  }

  /**
   * Setup periodic sync
   */
  private setupPeriodicSync(): void {
    // Enable periodic sync with default 15-minute interval
    this.enablePeriodicSync(15);
  }

  /**
   * Update sync status and notify listeners
   */
  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    this.syncStatus = { ...this.syncStatus, ...updates };
    
    for (const listener of this.statusListeners) {
      try {
        listener(this.syncStatus);
      } catch (error) {
        console.error('Sync status listener error:', error);
      }
    }
  }

  /**
   * Merge batch results
   */
  private mergeResults(target: SyncResult, source: SyncResult): void {
    target.processedItems += source.processedItems;
    target.failedItems += source.failedItems;
    target.conflictsFound += source.conflictsFound;
    target.conflictsResolved += source.conflictsResolved;
    target.bytesTransferred += source.bytesTransferred;
    target.errors.push(...source.errors);
  }

  /**
   * Calculate drift percentage for sync health
   */
  private calculateDriftPercentage(syncResult: SyncResult): number {
    if (syncResult.processedItems === 0) return 0;
    return (syncResult.failedItems / (syncResult.processedItems + syncResult.failedItems)) * 100;
  }
}

export const SyncService = SyncServiceImpl.getInstance();