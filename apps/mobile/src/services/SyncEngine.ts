import { 
  QueueItem, 
  CreateEventOperation, 
  UpdateEventOperation, 
  DeleteEventOperation, 
  CreateContactOperation, 
  UpdateContactOperation, 
  SyncHealthOperation 
} from './QueueItem';
import { QueueManager, ProcessingResult } from './QueueManager';
import { NetworkDetector, NetworkState } from './NetworkDetector';
import { ConflictResolver } from './ConflictResolver';
import { supabase } from '@phonelogai/database';

export interface SyncProgress {
  totalItems: number;
  processedItems: number;
  failedItems: number;
  currentBatch: number;
  totalBatches: number;
  bytesTransferred: number;
  estimatedTimeRemaining: number; // milliseconds
  syncSpeed: number; // items per second
}

export interface SyncResult {
  success: boolean;
  totalProcessed: number;
  totalFailed: number;
  conflicts: number;
  autoResolved: number;
  manualReviewRequired: number;
  duration: number; // milliseconds
  bytesTransferred: number;
  error?: string;
}

export interface SyncConfig {
  batchSize: number;
  maxConcurrentBatches: number;
  conflictResolutionEnabled: boolean;
  autoResolveThreshold: number; // 0-1
  progressCallbackInterval: number; // milliseconds
  networkQualityThreshold: 'poor' | 'fair' | 'good' | 'excellent';
  retryOnNetworkError: boolean;
  maxNetworkRetries: number;
}

export type SyncProgressCallback = (_progress: SyncProgress) => void;
export type SyncEventCallback = (_event: 'started' | 'paused' | 'resumed' | 'completed' | 'failed', _data?: unknown) => void;

class SyncEngineService {
  private static instance: SyncEngineService;
  private config: SyncConfig;
  private queueManager: QueueManager;
  private networkDetector: NetworkDetector;
  private conflictResolver: ConflictResolver;
  private isSyncing = false;
  private syncPaused = false;
  private currentProgress: SyncProgress = {
    totalItems: 0,
    processedItems: 0,
    failedItems: 0,
    currentBatch: 0,
    totalBatches: 0,
    bytesTransferred: 0,
    estimatedTimeRemaining: 0,
    syncSpeed: 0
  };
  private progressCallbacks: Set<SyncProgressCallback> = new Set();
  private eventCallbacks: Set<SyncEventCallback> = new Set();
  private syncStartTime = 0;
  private lastProgressUpdate = 0;
  private networkStateListener?: () => void;
  private performanceMetrics: Array<{ timestamp: number; itemsProcessed: number; bytesTransferred: number }> = [];

  private constructor(config?: Partial<SyncConfig>) {
    this.config = {
      batchSize: 50,
      maxConcurrentBatches: 2,
      conflictResolutionEnabled: true,
      autoResolveThreshold: 0.85,
      progressCallbackInterval: 1000, // 1 second
      networkQualityThreshold: 'fair',
      retryOnNetworkError: true,
      maxNetworkRetries: 3,
      ...config
    };

    this.queueManager = QueueManager.getInstance();
    this.networkDetector = NetworkDetector.getInstance();
    this.conflictResolver = ConflictResolver.getInstance();
  }

  public static getInstance(config?: Partial<SyncConfig>): SyncEngineService {
    if (!SyncEngineService.instance) {
      SyncEngineService.instance = new SyncEngineService(config);
    }
    return SyncEngineService.instance;
  }

  /**
   * Initialize the sync engine
   */
  async initialize(): Promise<void> {
    try {
      // Initialize dependencies
      await this.queueManager.initialize();
      
      // Register processing callbacks with the queue manager
      this.registerProcessingCallbacks();

      // Set up network state listener
      this.networkStateListener = this.networkDetector.addListener((state) => {
        this.handleNetworkChange(state);
      });

      console.log('Sync engine initialized');
    } catch (error) {
      console.error('Failed to initialize sync engine:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.networkStateListener?.();
    this.progressCallbacks.clear();
    this.eventCallbacks.clear();
    this.queueManager.destroy();
  }

  /**
   * Start synchronization process
   */
  async startSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    try {
      this.isSyncing = true;
      this.syncPaused = false;
      this.syncStartTime = Date.now();
      this.resetProgress();
      
      this.notifyEvent('started');
      
      const result = await this.performSync();
      
      this.notifyEvent('completed', result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      console.error('Sync failed:', errorMessage);
      
      const failedResult: SyncResult = {
        success: false,
        totalProcessed: this.currentProgress.processedItems,
        totalFailed: this.currentProgress.failedItems,
        conflicts: 0,
        autoResolved: 0,
        manualReviewRequired: 0,
        duration: Date.now() - this.syncStartTime,
        bytesTransferred: this.currentProgress.bytesTransferred,
        error: errorMessage
      };
      
      this.notifyEvent('failed', failedResult);
      return failedResult;

    } finally {
      this.isSyncing = false;
      this.syncPaused = false;
    }
  }

  /**
   * Pause ongoing synchronization
   */
  async pauseSync(): Promise<void> {
    if (!this.isSyncing) {
      throw new Error('No sync in progress');
    }

    this.syncPaused = true;
    this.notifyEvent('paused');
    
    // Wait for current batch to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Resume paused synchronization
   */
  async resumeSync(): Promise<void> {
    if (!this.isSyncing || !this.syncPaused) {
      throw new Error('No paused sync to resume');
    }

    this.syncPaused = false;
    this.notifyEvent('resumed');
  }

  /**
   * Stop synchronization
   */
  async stopSync(): Promise<void> {
    this.isSyncing = false;
    this.syncPaused = false;
    await this.queueManager.stopProcessing();
  }

  /**
   * Get current sync progress
   */
  getProgress(): SyncProgress {
    return { ...this.currentProgress };
  }

  /**
   * Add progress callback
   */
  addProgressCallback(callback: SyncProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  /**
   * Add event callback
   */
  addEventListener(callback: SyncEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Manual sync trigger
   */
  async manualSync(): Promise<SyncResult> {
    // Override network preferences for manual sync
    const originalThreshold = this.config.networkQualityThreshold;
    this.config.networkQualityThreshold = 'poor'; // Allow sync on any connection
    
    try {
      return await this.startSync();
    } finally {
      this.config.networkQualityThreshold = originalThreshold;
    }
  }

  /**
   * Sync specific item by ID
   */
  async syncItem(itemId: string): Promise<ProcessingResult> {
    const item = await this.queueManager.getReadyItems(1);
    const targetItem = item.find(i => i.id === itemId);
    
    if (!targetItem) {
      throw new Error(`Item ${itemId} not found or not ready for sync`);
    }

    return await this.processQueueItem(targetItem);
  }

  /**
   * Check if sync should run based on current conditions
   */
  shouldSync(): boolean {
    const networkState = this.networkDetector.getCurrentState();
    
    // Basic connectivity check
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      return false;
    }

    // Network quality check
    const qualityMet = this.isNetworkQualityAcceptable(networkState.connectionQuality);
    
    return qualityMet;
  }

  /**
   * Get sync recommendations
   */
  async getSyncRecommendations(): Promise<{
    shouldSync: boolean;
    reason: string;
    recommendedBatchSize: number;
    estimatedDuration: number; // milliseconds
    networkOptimal: boolean;
  }> {
    const queueStats = await this.queueManager.getStats();
    const networkState = this.networkDetector.getCurrentState();
    
    const shouldSync = this.shouldSync();
    const recommendedBatchSize = this.networkDetector.getRecommendedBatchSize();
    const estimatedDuration = this.estimateSyncDuration(queueStats.queueDepth, recommendedBatchSize);
    const networkOptimal = networkState.isWiFi && networkState.connectionQuality === 'excellent';

    let reason = '';
    if (!shouldSync) {
      if (!networkState.isConnected) {
        reason = 'No network connection';
      } else if (!this.isNetworkQualityAcceptable(networkState.connectionQuality)) {
        reason = `Network quality (${networkState.connectionQuality}) below threshold`;
      }
    } else {
      reason = networkOptimal ? 'Optimal sync conditions' : 'Acceptable sync conditions';
    }

    return {
      shouldSync,
      reason,
      recommendedBatchSize,
      estimatedDuration,
      networkOptimal
    };
  }

  /**
   * Private implementation methods
   */
  private async performSync(): Promise<SyncResult> {
    let totalProcessed = 0;
    let totalFailed = 0;
    let conflictCount = 0;
    let autoResolvedCount = 0;
    let manualReviewCount = 0;
    let bytesTransferred = 0;

    // Get initial queue stats
    const queueStats = await this.queueManager.getStats();
    this.currentProgress.totalItems = queueStats.queueDepth;
    this.currentProgress.totalBatches = Math.ceil(queueStats.queueDepth / this.config.batchSize);

    while (!this.syncPaused && this.isSyncing) {
      // Get next batch of items
      const items = await this.queueManager.getReadyItems(this.config.batchSize);
      
      if (items.length === 0) {
        break; // No more items to process
      }

      // Check network conditions
      if (!this.shouldSync()) {
        console.log('Network conditions no longer suitable for sync, pausing...');
        break;
      }

      // Process the batch
      this.currentProgress.currentBatch++;
      const batchResult = await this.processBatch(items);
      
      totalProcessed += batchResult.successful;
      totalFailed += batchResult.failed;
      bytesTransferred += this.estimateBatchSize(items);

      // Update progress
      this.currentProgress.processedItems = totalProcessed;
      this.currentProgress.failedItems = totalFailed;
      this.currentProgress.bytesTransferred = bytesTransferred;
      
      this.updateSyncSpeed();
      this.updateEstimatedTimeRemaining();
      this.notifyProgress();

      // Detect and resolve conflicts if enabled
      if (this.config.conflictResolutionEnabled) {
        const conflicts = await this.detectAndResolveConflicts(items);
        conflictCount += conflicts.total;
        autoResolvedCount += conflicts.autoResolved;
        manualReviewCount += conflicts.manualReview;
      }

      // Small delay to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const duration = Date.now() - this.syncStartTime;

    return {
      success: !this.syncPaused && totalFailed === 0,
      totalProcessed,
      totalFailed,
      conflicts: conflictCount,
      autoResolved: autoResolvedCount,
      manualReviewRequired: manualReviewCount,
      duration,
      bytesTransferred
    };
  }

  private async processBatch(items: QueueItem[]): Promise<{ successful: number; failed: number }> {
    let successful = 0;
    let failed = 0;

    // Process items with concurrency control
    const batchPromises: Promise<ProcessingResult>[] = [];
    
    for (const item of items) {
      if (batchPromises.length >= this.config.maxConcurrentBatches) {
        const result = await Promise.race(batchPromises);
        if (result.success) successful++;
        else failed++;
        
        // Remove completed promise
        const index = batchPromises.findIndex(p => p === Promise.resolve(result));
        if (index > -1) batchPromises.splice(index, 1);
      }

      batchPromises.push(this.processQueueItem(item));
    }

    // Wait for remaining promises
    const results = await Promise.all(batchPromises);
    for (const result of results) {
      if (result.success) successful++;
      else failed++;
    }

    return { successful, failed };
  }

  private async processQueueItem(item: QueueItem): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      let result: ProcessingResult;

      switch (item.operation.type) {
        case 'CREATE_EVENT':
          result = await this.processCreateEvent(item);
          break;
        case 'UPDATE_EVENT':
          result = await this.processUpdateEvent(item);
          break;
        case 'DELETE_EVENT':
          result = await this.processDeleteEvent(item);
          break;
        case 'CREATE_CONTACT':
          result = await this.processCreateContact(item);
          break;
        case 'UPDATE_CONTACT':
          result = await this.processUpdateContact(item);
          break;
        case 'UPDATE_SYNC_HEALTH':
          result = await this.processSyncHealth(item);
          break;
        default:
          throw new Error(`Unknown operation type: ${item.operation.type}`);
      }

      result.processingTime = Date.now() - startTime;
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        itemId: item.id,
        processingTime: Date.now() - startTime,
        error: errorMessage,
        retryRecommended: this.shouldRetryOnError(error)
      };
    }
  }

  private async processCreateEvent(item: QueueItem): Promise<ProcessingResult> {
    const operation = item.operation as CreateEventOperation;
    const event = operation.payload;

    try {
      const { error } = await supabase
        .from('events')
        .insert([event])
        .select()
        .single();

      if (error) {
        // Check for duplicate key error (conflict)
        if (error.code === '23505') { // unique_violation
          return {
            success: false,
            itemId: item.id,
            error: 'Event already exists (duplicate)',
            retryRecommended: false
          };
        }
        throw error;
      }

      return {
        success: true,
        itemId: item.id
      };

    } catch (error) {
      throw new Error(`Failed to create event: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async processUpdateEvent(item: QueueItem): Promise<ProcessingResult> {
    const operation = item.operation as UpdateEventOperation;
    const event = operation.payload;
    const originalEventId = operation.originalEventId;

    try {
      const { data, error } = await supabase
        .from('events')
        .update(event)
        .eq('id', originalEventId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        return {
          success: false,
          itemId: item.id,
          error: 'Event not found for update',
          retryRecommended: false
        };
      }

      return {
        success: true,
        itemId: item.id
      };

    } catch (error) {
      throw new Error(`Failed to update event: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async processDeleteEvent(item: QueueItem): Promise<ProcessingResult> {
    const operation = item.operation as DeleteEventOperation;
    const eventId = operation.payload.eventId;

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) {
        throw error;
      }

      return {
        success: true,
        itemId: item.id
      };

    } catch (error) {
      throw new Error(`Failed to delete event: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async processCreateContact(item: QueueItem): Promise<ProcessingResult> {
    const operation = item.operation as CreateContactOperation;
    const contact = operation.payload;

    try {
      const { error } = await supabase
        .from('contacts')
        .insert([contact])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // unique_violation
          return {
            success: false,
            itemId: item.id,
            error: 'Contact already exists (duplicate)',
            retryRecommended: false
          };
        }
        throw error;
      }

      return {
        success: true,
        itemId: item.id
      };

    } catch (error) {
      throw new Error(`Failed to create contact: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async processUpdateContact(item: QueueItem): Promise<ProcessingResult> {
    const operation = item.operation as UpdateContactOperation;
    const contact = operation.payload;
    const originalContactId = operation.originalContactId;

    try {
      const { data, error } = await supabase
        .from('contacts')
        .update(contact)
        .eq('id', originalContactId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        return {
          success: false,
          itemId: item.id,
          error: 'Contact not found for update',
          retryRecommended: false
        };
      }

      return {
        success: true,
        itemId: item.id
      };

    } catch (error) {
      throw new Error(`Failed to update contact: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async processSyncHealth(item: QueueItem): Promise<ProcessingResult> {
    const operation = item.operation as SyncHealthOperation;
    const syncHealth = operation.payload;

    try {
      const { error } = await supabase
        .from('sync_health')
        .upsert([syncHealth])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        itemId: item.id
      };

    } catch (error) {
      throw new Error(`Failed to update sync health: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async detectAndResolveConflicts(items: QueueItem[]): Promise<{
    total: number;
    autoResolved: number;
    manualReview: number;
  }> {
    let total = 0;
    let autoResolved = 0;
    let manualReview = 0;

    // Extract user IDs from items
    const userIds = [...new Set(items.map(item => item.userId))];

    for (const userId of userIds) {
      try {
        // Detect conflicts for this user
        const conflicts = await this.conflictResolver.detectConflictsBatch(userId, {
          batchSize: this.config.batchSize,
          timestampTolerance: 1, // 1 second
          autoResolve: true
        });

        total += conflicts.length;

        // Attempt to resolve conflicts automatically
        const resolved = await this.conflictResolver.resolveConflictsAutomatically(conflicts);
        autoResolved += resolved.length;

        // Remaining conflicts need manual review
        manualReview += conflicts.length - resolved.length;

      } catch (error) {
        console.error(`Conflict resolution failed for user ${userId}:`, error);
      }
    }

    return { total, autoResolved, manualReview };
  }

  private resetProgress(): void {
    this.currentProgress = {
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
      currentBatch: 0,
      totalBatches: 0,
      bytesTransferred: 0,
      estimatedTimeRemaining: 0,
      syncSpeed: 0
    };
    this.performanceMetrics = [];
  }

  private updateSyncSpeed(): void {
    const now = Date.now();
    this.performanceMetrics.push({
      timestamp: now,
      itemsProcessed: this.currentProgress.processedItems,
      bytesTransferred: this.currentProgress.bytesTransferred
    });

    // Keep only last 10 measurements for speed calculation
    if (this.performanceMetrics.length > 10) {
      this.performanceMetrics.shift();
    }

    if (this.performanceMetrics.length >= 2) {
      const first = this.performanceMetrics[0];
      const last = this.performanceMetrics[this.performanceMetrics.length - 1];
      
      const timeSpanSeconds = (last.timestamp - first.timestamp) / 1000;
      const itemsProcessed = last.itemsProcessed - first.itemsProcessed;
      
      this.currentProgress.syncSpeed = timeSpanSeconds > 0 ? itemsProcessed / timeSpanSeconds : 0;
    }
  }

  private updateEstimatedTimeRemaining(): void {
    const remainingItems = this.currentProgress.totalItems - this.currentProgress.processedItems;
    
    if (this.currentProgress.syncSpeed > 0 && remainingItems > 0) {
      this.currentProgress.estimatedTimeRemaining = (remainingItems / this.currentProgress.syncSpeed) * 1000;
    } else {
      this.currentProgress.estimatedTimeRemaining = 0;
    }
  }

  private estimateBatchSize(items: QueueItem[]): number {
    return items.reduce((total, item) => total + item.metadata.estimatedSize, 0);
  }

  private estimateSyncDuration(queueDepth: number, batchSize: number): number {
    // Rough estimate based on average processing time per item
    const avgTimePerItem = 200; // milliseconds
    const avgBatchOverhead = 500; // milliseconds per batch
    const batches = Math.ceil(queueDepth / batchSize);
    
    return (queueDepth * avgTimePerItem) + (batches * avgBatchOverhead);
  }

  private isNetworkQualityAcceptable(quality: string): boolean {
    const qualityOrder = ['none', 'poor', 'fair', 'good', 'excellent'];
    const currentIndex = qualityOrder.indexOf(quality);
    const thresholdIndex = qualityOrder.indexOf(this.config.networkQualityThreshold);
    
    return currentIndex >= thresholdIndex;
  }

  private shouldRetryOnError(error: Error | unknown): boolean {
    if (!this.config.retryOnNetworkError) return false;

    // Network-related errors that should be retried
    const retryableErrors = [
      'Network request failed',
      'Request timeout',
      'Connection aborted',
      'ECONNRESET',
      'ETIMEDOUT'
    ];

    const errorMessage = error instanceof Error ? error.message : String(error);
    return retryableErrors.some(retryable => errorMessage.includes(retryable));
  }

  private handleNetworkChange(networkState: NetworkState): void {
    if (this.isSyncing) {
      if (!networkState.isConnected || !this.isNetworkQualityAcceptable(networkState.connectionQuality)) {
        console.log('Network degraded during sync, pausing...');
        this.pauseSync();
      } else if (this.syncPaused && this.shouldSync()) {
        console.log('Network restored, resuming sync...');
        this.resumeSync();
      }
    }
  }

  private registerProcessingCallbacks(): void {
    // Register all processing callbacks with the queue manager
    this.queueManager.registerProcessingCallback('CREATE_EVENT', (item) => this.processQueueItem(item));
    this.queueManager.registerProcessingCallback('UPDATE_EVENT', (item) => this.processQueueItem(item));
    this.queueManager.registerProcessingCallback('DELETE_EVENT', (item) => this.processQueueItem(item));
    this.queueManager.registerProcessingCallback('CREATE_CONTACT', (item) => this.processQueueItem(item));
    this.queueManager.registerProcessingCallback('UPDATE_CONTACT', (item) => this.processQueueItem(item));
    this.queueManager.registerProcessingCallback('UPDATE_SYNC_HEALTH', (item) => this.processQueueItem(item));
  }

  private notifyProgress(): void {
    const now = Date.now();
    if (now - this.lastProgressUpdate >= this.config.progressCallbackInterval) {
      for (const callback of this.progressCallbacks) {
        try {
          callback(this.currentProgress);
        } catch (error) {
          console.error('Progress callback error:', error);
        }
      }
      this.lastProgressUpdate = now;
    }
  }

  private notifyEvent(event: 'started' | 'paused' | 'resumed' | 'completed' | 'failed', data?: SyncResult): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Event callback error:', error);
      }
    }
  }
}

export const SyncEngine = SyncEngineService.getInstance();