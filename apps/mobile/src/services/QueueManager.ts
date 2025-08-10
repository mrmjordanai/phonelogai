import { 
  QueueItem, 
  QueueItemFactory, 
  QueuePriority, 
  QueueItemUtils 
} from './QueueItem';
import { OfflineStorage, StorageFilter } from './OfflineStorage';
import { NetworkDetector, NetworkState } from './NetworkDetector';
import { Event, Contact, SyncHealth } from '@phonelogai/types';

export interface QueueManagerConfig {
  maxQueueSize: number;
  maxMemoryUsageMB: number;
  processingBatchSize: number;
  maxProcessingConcurrency: number;
  maintenanceInterval: number; // milliseconds
  performanceMonitoringEnabled: boolean;
}

export interface ProcessingStats {
  totalProcessed: number;
  totalFailed: number;
  processingRate: number; // items per minute
  averageProcessingTime: number; // milliseconds
  memoryUsage: number; // MB
  queueDepth: number;
  oldestItemAge: number; // milliseconds
}

export interface QueueHealth {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
  metrics: ProcessingStats;
}

export interface ProcessingResult {
  success: boolean;
  itemId: string;
  processingTime: number;
  error?: string;
  retryRecommended?: boolean;
}

export interface BatchProcessingResult {
  totalItems: number;
  successful: number;
  failed: number;
  results: ProcessingResult[];
  processingTime: number;
}

export type ProcessingCallback = (_item: QueueItem) => Promise<ProcessingResult>;

class QueueManagerService {
  private static instance: QueueManagerService;
  private config: QueueManagerConfig;
  private storage: OfflineStorage;
  private networkDetector: NetworkDetector;
  private processingStats: ProcessingStats;
  private isProcessing = false;
  private processingQueue = new Set<string>(); // Track items being processed
  private processingCallbacks: Map<string, ProcessingCallback> = new Map();
  private maintenanceTimer?: ReturnType<typeof setInterval>;
  private performanceHistory: ProcessingStats[] = [];
  private networkStateListener?: () => void;

  private constructor(config?: Partial<QueueManagerConfig>) {
    this.config = {
      maxQueueSize: 10000,
      maxMemoryUsageMB: 50,
      processingBatchSize: 50,
      maxProcessingConcurrency: 3,
      maintenanceInterval: 300000, // 5 minutes
      performanceMonitoringEnabled: true,
      ...config
    };

    this.storage = OfflineStorage.getInstance();
    this.networkDetector = NetworkDetector.getInstance();
    
    this.processingStats = {
      totalProcessed: 0,
      totalFailed: 0,
      processingRate: 0,
      averageProcessingTime: 0,
      memoryUsage: 0,
      queueDepth: 0,
      oldestItemAge: 0
    };
  }

  public static getInstance(config?: Partial<QueueManagerConfig>): QueueManagerService {
    if (!QueueManagerService.instance) {
      QueueManagerService.instance = new QueueManagerService(config);
    }
    return QueueManagerService.instance;
  }

  /**
   * Initialize the queue manager
   */
  async initialize(): Promise<void> {
    try {
      // Initialize dependencies
      await this.storage.initialize();
      await this.networkDetector.initialize();
      
      // Set up network state listener
      this.networkStateListener = this.networkDetector.addListener((state) => {
        this.handleNetworkChange(state);
      });

      // Register default processing callbacks
      this.registerProcessingCallbacks();

      // Start maintenance timer
      this.startMaintenanceTimer();

      // Update initial stats
      await this.updateProcessingStats();

      console.log('Queue manager initialized');
    } catch (error) {
      console.error('Failed to initialize queue manager:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.networkStateListener?.();
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
    }
    this.processingCallbacks.clear();
    this.networkDetector.destroy();
  }

  /**
   * Add an event to the queue
   */
  async enqueueEvent(
    event: Event, 
    priority?: QueuePriority,
    actionType: 'CREATE_EVENT' | 'UPDATE_EVENT' = 'CREATE_EVENT'
  ): Promise<string> {
    const item = QueueItemFactory.createEvent(event);
    
    if (priority) {
      item.priority = priority;
    }

    if (actionType === 'UPDATE_EVENT') {
      item.operation = {
        type: 'UPDATE_EVENT',
        payload: event,
        originalEventId: event.id
      };
    }

    await this.storage.store(item);
    await this.updateProcessingStats();
    
    // Trigger processing if conditions are met
    this.maybeStartProcessing();
    
    return item.id;
  }

  /**
   * Add multiple events in batch
   */
  async enqueueBatch(
    events: Event[], 
    priority?: QueuePriority,
    actionType: 'CREATE_EVENT' | 'UPDATE_EVENT' = 'CREATE_EVENT'
  ): Promise<string[]> {
    const items = events.map(event => {
      const item = QueueItemFactory.createEvent(event);
      
      if (priority) {
        item.priority = priority;
      }

      if (actionType === 'UPDATE_EVENT') {
        item.operation = {
          type: 'UPDATE_EVENT',
          payload: event,
          originalEventId: event.id
        };
      }

      return item;
    });

    await this.storage.storeBatch(items);
    await this.updateProcessingStats();
    
    this.maybeStartProcessing();
    
    return items.map(item => item.id);
  }

  /**
   * Add a contact to the queue
   */
  async enqueueContact(
    contact: Contact, 
    priority?: QueuePriority,
    actionType: 'CREATE_CONTACT' | 'UPDATE_CONTACT' = 'CREATE_CONTACT'
  ): Promise<string> {
    const item = actionType === 'CREATE_CONTACT' ?
      QueueItemFactory.createContact(contact) :
      QueueItemFactory.updateContact(contact, contact.id);
    
    if (priority) {
      item.priority = priority;
    }

    await this.storage.store(item);
    await this.updateProcessingStats();
    
    this.maybeStartProcessing();
    
    return item.id;
  }

  /**
   * Add sync health update to the queue
   */
  async enqueueSyncHealth(syncHealth: SyncHealth): Promise<string> {
    const item = QueueItemFactory.updateSyncHealth(syncHealth);
    
    await this.storage.store(item);
    await this.updateProcessingStats();
    
    this.maybeStartProcessing();
    
    return item.id;
  }

  /**
   * Start processing queue items
   */
  async startProcessing(): Promise<BatchProcessingResult> {
    if (this.isProcessing) {
      console.log('Processing already in progress');
      return {
        totalItems: 0,
        successful: 0,
        failed: 0,
        results: [],
        processingTime: 0
      };
    }

    try {
      this.isProcessing = true;
      const startTime = Date.now();

      // Get network state and determine sync strategy
      const networkState = this.networkDetector.getCurrentState();
      const queueStats = await this.storage.getStats();
      const queueSizeMB = queueStats.totalSizeBytes / (1024 * 1024);
      const offlineHours = networkState.disconnectedDuration ? 
        networkState.disconnectedDuration / (1000 * 60 * 60) : 0;

      const syncStrategy = this.networkDetector.determineSyncStrategy(queueSizeMB, offlineHours);
      
      if (syncStrategy === 'offline' || syncStrategy === 'wifi_preferred') {
        console.log(`Skipping processing due to sync strategy: ${syncStrategy}`);
        return {
          totalItems: 0,
          successful: 0,
          failed: 0,
          results: [],
          processingTime: 0
        };
      }

      // Determine batch size based on network conditions
      const batchSize = Math.min(
        this.config.processingBatchSize,
        this.networkDetector.getRecommendedBatchSize()
      );

      // Get items to process
      const itemsToProcess = await this.storage.retrieveMany(
        { status: 'pending' },
        batchSize
      );

      if (itemsToProcess.length === 0) {
        return {
          totalItems: 0,
          successful: 0,
          failed: 0,
          results: [],
          processingTime: Date.now() - startTime
        };
      }

      console.log(`Processing batch of ${itemsToProcess.length} items`);

      // Process items in parallel with concurrency limit
      const results = await this.processBatch(itemsToProcess);

      const processingTime = Date.now() - startTime;
      
      // Update stats
      this.processingStats.totalProcessed += results.successful;
      this.processingStats.totalFailed += results.failed;
      this.processingStats.averageProcessingTime = 
        (this.processingStats.averageProcessingTime + processingTime) / 2;

      await this.updateProcessingStats();

      return {
        ...results,
        processingTime
      };

    } catch (error) {
      console.error('Error during queue processing:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Stop processing
   */
  async stopProcessing(): Promise<void> {
    this.isProcessing = false;
    // Wait for current processing items to complete
    while (this.processingQueue.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<ProcessingStats> {
    await this.updateProcessingStats();
    return { ...this.processingStats };
  }

  /**
   * Get queue health assessment
   */
  async getHealth(): Promise<QueueHealth> {
    const stats = await this.getStats();
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check queue depth
    if (stats.queueDepth > this.config.maxQueueSize * 0.8) {
      status = 'warning';
      issues.push(`Queue depth (${stats.queueDepth}) approaching limit`);
      recommendations.push('Increase sync frequency or queue size limit');
    }

    if (stats.queueDepth > this.config.maxQueueSize) {
      status = 'critical';
      issues.push(`Queue at capacity (${stats.queueDepth})`);
      recommendations.push('Immediate sync required or increase queue capacity');
    }

    // Check memory usage
    if (stats.memoryUsage > this.config.maxMemoryUsageMB * 0.8) {
      status = status === 'critical' ? 'critical' : 'warning';
      issues.push(`Memory usage (${stats.memoryUsage}MB) high`);
      recommendations.push('Reduce batch size or increase memory limit');
    }

    // Check oldest item age (24 hours threshold)
    const maxAge = 24 * 60 * 60 * 1000;
    if (stats.oldestItemAge > maxAge) {
      status = status === 'critical' ? 'critical' : 'warning';
      const hoursOld = Math.round(stats.oldestItemAge / (60 * 60 * 1000));
      issues.push(`Oldest item is ${hoursOld} hours old`);
      recommendations.push('Check network connectivity and sync configuration');
    }

    // Check processing rate
    if (stats.processingRate < 10 && stats.queueDepth > 0) {
      issues.push(`Low processing rate (${stats.processingRate} items/min)`);
      recommendations.push('Check processing callbacks and network performance');
    }

    return {
      status,
      issues,
      recommendations,
      metrics: stats
    };
  }

  /**
   * Get items ready for processing
   */
  async getReadyItems(limit: number = 50): Promise<QueueItem[]> {
    const filter: StorageFilter = {
      status: 'pending'
    };

    return await this.storage.retrieveMany(filter, limit);
  }

  /**
   * Mark item as processed successfully
   */
  async markProcessed(itemId: string): Promise<void> {
    await this.storage.delete(itemId);
    this.processingQueue.delete(itemId);
  }

  /**
   * Mark item as failed
   */
  async markFailed(itemId: string, error: string, retryRecommended = true): Promise<void> {
    const item = await this.storage.retrieve(itemId);
    if (!item) return;

    const retryCount = item.metadata.retryCount + 1;
    const maxRetries = item.metadata.maxRetries;

    if (retryRecommended && retryCount < maxRetries) {
      // Calculate next retry time with exponential backoff
      const nextRetryAt = QueueItemUtils.calculateNextRetryTime(retryCount);
      
      await this.storage.update(itemId, {
        status: 'failed',
        metadata: {
          ...item.metadata,
          retryCount,
          lastError: error,
          nextRetryAt: nextRetryAt.toISOString()
        }
      });
    } else {
      // Max retries reached, remove from queue
      console.warn(`Item ${itemId} failed permanently: ${error}`);
      await this.storage.delete(itemId);
    }

    this.processingQueue.delete(itemId);
    this.processingStats.totalFailed++;
  }

  /**
   * Register a processing callback for specific operation types
   */
  registerProcessingCallback(operationType: string, callback: ProcessingCallback): void {
    this.processingCallbacks.set(operationType, callback);
  }

  /**
   * Clear all items (for testing/debugging)
   */
  async clearAll(): Promise<number> {
    const clearedCount = await this.storage.clear();
    await this.updateProcessingStats();
    return clearedCount;
  }

  /**
   * Clear items for specific user
   */
  async clearForUser(userId: string): Promise<number> {
    const clearedCount = await this.storage.clear({ userId });
    await this.updateProcessingStats();
    return clearedCount;
  }

  /**
   * Private helper methods
   */
  private async processBatch(items: QueueItem[]): Promise<BatchProcessingResult> {
    const results: ProcessingResult[] = [];
    const concurrentProcessing: Promise<ProcessingResult>[] = [];

    for (const item of items) {
      // Respect concurrency limits
      if (concurrentProcessing.length >= this.config.maxProcessingConcurrency) {
        const result = await Promise.race(concurrentProcessing);
        results.push(result);
        concurrentProcessing.splice(
          concurrentProcessing.findIndex(p => p === Promise.resolve(result)), 1
        );
      }

      // Start processing item
      const processingPromise = this.processItem(item);
      concurrentProcessing.push(processingPromise);
    }

    // Wait for remaining items
    const remainingResults = await Promise.all(concurrentProcessing);
    results.push(...remainingResults);

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    return {
      totalItems: items.length,
      successful,
      failed,
      results
    };
  }

  private async processItem(item: QueueItem): Promise<ProcessingResult> {
    const startTime = Date.now();
    this.processingQueue.add(item.id);

    try {
      // Mark as processing
      await this.storage.update(item.id, {
        status: 'processing',
        metadata: {
          ...item.metadata,
          processingStartedAt: new Date().toISOString()
        }
      });

      // Get processing callback
      const callback = this.processingCallbacks.get(item.operation.type);
      if (!callback) {
        throw new Error(`No processing callback registered for ${item.operation.type}`);
      }

      // Process the item
      const result = await callback(item);
      const processingTime = Date.now() - startTime;

      if (result.success) {
        await this.markProcessed(item.id);
        return {
          ...result,
          processingTime
        };
      } else {
        await this.markFailed(item.id, result.error || 'Processing failed', result.retryRecommended);
        return {
          ...result,
          processingTime
        };
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.markFailed(item.id, errorMessage, true);
      
      return {
        success: false,
        itemId: item.id,
        processingTime,
        error: errorMessage,
        retryRecommended: true
      };
    }
  }

  private maybeStartProcessing(): void {
    if (!this.isProcessing) {
      // Use setTimeout to avoid blocking the main thread
      setTimeout(() => this.startProcessing(), 0);
    }
  }

  private handleNetworkChange(networkState: NetworkState): void {
    console.log('Network state changed:', networkState.connectionType, networkState.connectionQuality);
    
    // Start processing if network becomes available and we have items to sync
    if (networkState.isConnected && !this.isProcessing) {
      this.maybeStartProcessing();
    }
  }

  private async updateProcessingStats(): Promise<void> {
    try {
      const storageStats = await this.storage.getStats();
      
      this.processingStats.queueDepth = storageStats.totalItems;
      this.processingStats.memoryUsage = storageStats.totalSizeBytes / (1024 * 1024); // Convert to MB
      this.processingStats.oldestItemAge = storageStats.oldestItemAge;
      
      // Calculate processing rate based on recent history
      if (this.performanceHistory.length > 0) {
        const recentStats = this.performanceHistory.slice(-5); // Last 5 measurements
        const totalProcessed = recentStats.reduce((sum, stat) => sum + stat.totalProcessed, 0);
        const timeSpan = this.config.maintenanceInterval * recentStats.length / 60000; // Convert to minutes
        this.processingStats.processingRate = totalProcessed / timeSpan;
      }

      // Store performance history for rate calculation
      if (this.config.performanceMonitoringEnabled) {
        this.performanceHistory.push({ ...this.processingStats });
        if (this.performanceHistory.length > 20) {
          this.performanceHistory.shift(); // Keep only recent history
        }
      }

    } catch (error) {
      console.error('Failed to update processing stats:', error);
    }
  }

  private startMaintenanceTimer(): void {
    this.maintenanceTimer = setInterval(async () => {
      try {
        // Update stats
        await this.updateProcessingStats();
        
        // Perform storage maintenance
        await this.storage.performMaintenance();
        
        // Check if we should start processing
        if (!this.isProcessing) {
          const networkState = this.networkDetector.getCurrentState();
          const storageStats = await this.storage.getStats();
          const queueSizeMB = storageStats.totalSizeBytes / (1024 * 1024);
          const offlineHours = networkState.disconnectedDuration ? 
            networkState.disconnectedDuration / (1000 * 60 * 60) : 0;
          
          if (this.networkDetector.shouldSync(queueSizeMB, offlineHours)) {
            this.maybeStartProcessing();
          }
        }
        
      } catch (error) {
        console.error('Maintenance timer error:', error);
      }
    }, this.config.maintenanceInterval);
  }

  private registerProcessingCallbacks(): void {
    // These are placeholder callbacks - they should be replaced with actual implementation
    // in the SyncEngine or by the application using this queue manager
    
    this.registerProcessingCallback('CREATE_EVENT', async (item) => {
      // Placeholder for event creation
      console.log(`Processing CREATE_EVENT: ${item.id}`);
      return { success: true, itemId: item.id, processingTime: 100 };
    });

    this.registerProcessingCallback('UPDATE_EVENT', async (item) => {
      // Placeholder for event update
      console.log(`Processing UPDATE_EVENT: ${item.id}`);
      return { success: true, itemId: item.id, processingTime: 100 };
    });

    this.registerProcessingCallback('DELETE_EVENT', async (item) => {
      // Placeholder for event deletion
      console.log(`Processing DELETE_EVENT: ${item.id}`);
      return { success: true, itemId: item.id, processingTime: 50 };
    });

    this.registerProcessingCallback('CREATE_CONTACT', async (item) => {
      // Placeholder for contact creation
      console.log(`Processing CREATE_CONTACT: ${item.id}`);
      return { success: true, itemId: item.id, processingTime: 150 };
    });

    this.registerProcessingCallback('UPDATE_CONTACT', async (item) => {
      // Placeholder for contact update
      console.log(`Processing UPDATE_CONTACT: ${item.id}`);
      return { success: true, itemId: item.id, processingTime: 150 };
    });

    this.registerProcessingCallback('UPDATE_SYNC_HEALTH', async (item) => {
      // Placeholder for sync health update
      console.log(`Processing UPDATE_SYNC_HEALTH: ${item.id}`);
      return { success: true, itemId: item.id, processingTime: 75 };
    });
  }
}

export const QueueManager = QueueManagerService.getInstance();