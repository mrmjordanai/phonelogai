// Enhanced Offline Queue Service - Integrates with the comprehensive queue system
import { Event, Contact, SyncHealth } from '@phonelogai/types';
import { QueueManager } from './QueueManager';
import { SyncEngine, SyncResult, SyncProgress } from './SyncEngine';
import { NetworkDetector } from './NetworkDetector';
import { QueuePriority, QueueItem } from './QueueItem';

// Legacy interfaces for backward compatibility
export type QueuedActionType = 
  | 'CREATE_EVENT' 
  | 'UPDATE_EVENT' 
  | 'DELETE_EVENT'
  | 'CREATE_CONTACT'
  | 'UPDATE_CONTACT'
  | 'UPDATE_SYNC_HEALTH';

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  payload: any;
  userId: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  nextRetryAt?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface QueuedEvent extends QueuedAction {
  type: 'CREATE_EVENT' | 'UPDATE_EVENT' | 'DELETE_EVENT';
  payload: Event;
}

export interface QueuedContact extends QueuedAction {
  type: 'CREATE_CONTACT' | 'UPDATE_CONTACT';
  payload: Contact;
}

export interface QueuedSyncHealth extends QueuedAction {
  type: 'UPDATE_SYNC_HEALTH';
  payload: SyncHealth;
}

export interface QueueStats {
  totalItems: number;
  pendingItems: number;
  failedItems: number;
  oldestItem?: Date;
  newestItem?: Date;
  sizeInBytes: number;
}

export interface QueueFilter {
  userId?: string;
  type?: QueuedActionType;
  priority?: 'high' | 'medium' | 'low';
  maxAge?: number; // Max age in milliseconds
  hasErrors?: boolean;
}

/**
 * Enhanced Offline Queue Service
 * 
 * This service provides backward compatibility with the existing OfflineQueue interface
 * while leveraging the new comprehensive queue system architecture.
 * 
 * Key improvements:
 * - Network-aware sync processing
 * - Advanced conflict resolution
 * - Compression and encryption
 * - Performance monitoring
 * - Priority-based processing
 */
class OfflineQueueService {
  private static instance: OfflineQueueService;
  private queueManager: typeof QueueManager;
  private syncEngine: typeof SyncEngine;
  private networkDetector: typeof NetworkDetector;
  private isInitialized = false;

  private constructor() {
    this.queueManager = QueueManager.getInstance();
    this.syncEngine = SyncEngine.getInstance();
    this.networkDetector = NetworkDetector.getInstance();
  }

  public static getInstance(): OfflineQueueService {
    if (!OfflineQueueService.instance) {
      OfflineQueueService.instance = new OfflineQueueService();
    }
    return OfflineQueueService.instance;
  }

  /**
   * Initialize the enhanced queue system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize the enhanced queue components
      await this.queueManager.initialize();
      await this.syncEngine.initialize();
      
      this.isInitialized = true;
      console.log('Enhanced offline queue initialized');
    } catch (error) {
      console.error('Failed to initialize enhanced offline queue:', error);
      throw error;
    }
  }

  /**
   * Add an event to the queue with enhanced processing
   */
  public async enqueueEvent(event: Event, actionType: 'CREATE_EVENT' | 'UPDATE_EVENT' | 'DELETE_EVENT' = 'CREATE_EVENT'): Promise<string> {
    await this.ensureInitialized();
    
    const priority = this.mapLegacyPriority('high');
    return await this.queueManager.enqueueEvent(event, priority, actionType);
  }

  /**
   * Add a contact to the queue with enhanced processing
   */
  public async enqueueContact(contact: Contact, actionType: 'CREATE_CONTACT' | 'UPDATE_CONTACT' = 'CREATE_CONTACT'): Promise<string> {
    await this.ensureInitialized();
    
    const priority = this.mapLegacyPriority('medium');
    return await this.queueManager.enqueueContact(contact, priority, actionType);
  }

  /**
   * Add sync health update to the queue with enhanced processing
   */
  public async enqueueSyncHealth(syncHealth: SyncHealth): Promise<string> {
    await this.ensureInitialized();
    
    return await this.queueManager.enqueueSyncHealth(syncHealth);
  }

  /**
   * Add multiple events in batch with enhanced processing
   */
  public async enqueueBatch(events: Event[], actionType: 'CREATE_EVENT' | 'UPDATE_EVENT' = 'CREATE_EVENT'): Promise<string[]> {
    await this.ensureInitialized();
    
    const priority = this.mapLegacyPriority('high');
    return await this.queueManager.enqueueBatch(events, priority, actionType);
  }

  /**
   * Get next batch of items to sync (enhanced)
   */
  public async getNextBatch(batchSize: number = 50, filter?: QueueFilter): Promise<QueuedAction[]> {
    await this.ensureInitialized();
    
    // Convert modern QueueItem[] to legacy QueuedAction[] format
    const items = await this.queueManager.getReadyItems(batchSize);
    const legacyItems = items.map(item => this.convertToLegacyFormat(item));
    
    // Apply legacy filters if provided
    if (filter) {
      return this.applyLegacyFilter(legacyItems, filter);
    }
    
    return legacyItems;
  }

  /**
   * Mark item as successfully processed and remove from queue (enhanced)
   */
  public async markProcessed(actionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.queueManager.markProcessed(actionId);
  }

  /**
   * Mark multiple items as processed (enhanced)
   */
  public async markBatchProcessed(actionIds: string[]): Promise<void> {
    await this.ensureInitialized();
    
    for (const id of actionIds) {
      await this.queueManager.markProcessed(id);
    }
  }

  /**
   * Mark item as failed with error message (enhanced)
   */
  public async markFailed(actionId: string, error: string): Promise<void> {
    await this.ensureInitialized();
    await this.queueManager.markFailed(actionId, error, true);
  }

  /**
   * Get queue statistics (enhanced)
   */
  public async getStats(): Promise<QueueStats> {
    await this.ensureInitialized();
    
    const stats = await this.queueManager.getStats();
    
    return {
      totalItems: stats.queueDepth,
      pendingItems: stats.queueDepth, // All items in queue are considered pending
      failedItems: stats.totalFailed,
      oldestItem: stats.oldestItemAge > 0 ? new Date(Date.now() - stats.oldestItemAge) : undefined,
      newestItem: new Date(), // Approximation
      sizeInBytes: stats.memoryUsage * 1024 * 1024 // Convert MB to bytes
    };
  }

  /**
   * Clear all items from the queue (enhanced)
   */
  public async clear(userId?: string): Promise<void> {
    await this.ensureInitialized();
    
    if (userId) {
      await this.queueManager.clearForUser(userId);
    } else {
      await this.queueManager.clearAll();
    }
  }

  /**
   * Get all items in queue (enhanced)
   */
  public async getAllItems(filter?: QueueFilter): Promise<QueuedAction[]> {
    await this.ensureInitialized();
    
    // Get a large batch to simulate "all items"
    const items = await this.queueManager.getReadyItems(10000);
    const legacyItems = items.map(item => this.convertToLegacyFormat(item));
    
    if (filter) {
      return this.applyLegacyFilter(legacyItems, filter);
    }
    
    return legacyItems;
  }

  /**
   * Remove old items to prevent queue from growing too large (enhanced)
   */
  public async cleanupOldItems(): Promise<number> {
    await this.ensureInitialized();
    
    const result = await this.queueManager.getHealth();
    
    // The enhanced system handles cleanup automatically
    // This method is maintained for backward compatibility
    return result.metrics.totalFailed; // Return failed items as "cleaned" count
  }

  /**
   * Enhanced methods - Not in original interface but provide additional functionality
   */

  /**
   * Start enhanced synchronization
   */
  public async startSync(): Promise<SyncResult> {
    await this.ensureInitialized();
    return await this.syncEngine.startSync();
  }

  /**
   * Manual sync trigger
   */
  public async manualSync(): Promise<SyncResult> {
    await this.ensureInitialized();
    return await this.syncEngine.manualSync();
  }

  /**
   * Get sync progress
   */
  public getSyncProgress(): SyncProgress {
    return this.syncEngine.getProgress();
  }

  /**
   * Add sync progress callback
   */
  public addSyncProgressCallback(callback: (progress: SyncProgress) => void): () => void {
    return this.syncEngine.addProgressCallback(callback);
  }

  /**
   * Get sync recommendations
   */
  public async getSyncRecommendations(): Promise<{
    shouldSync: boolean;
    reason: string;
    recommendedBatchSize: number;
    estimatedDuration: number;
    networkOptimal: boolean;
  }> {
    await this.ensureInitialized();
    return await this.syncEngine.getSyncRecommendations();
  }

  /**
   * Get queue health assessment
   */
  public async getQueueHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  }> {
    await this.ensureInitialized();
    
    const health = await this.queueManager.getHealth();
    return {
      status: health.status,
      issues: health.issues,
      recommendations: health.recommendations
    };
  }

  /**
   * Check if sync should run
   */
  public shouldSync(): boolean {
    return this.syncEngine.shouldSync();
  }

  /**
   * Get network state
   */
  public getNetworkState() {
    return this.networkDetector.getCurrentState();
  }

  /**
   * Private helper methods
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private mapLegacyPriority(legacyPriority: 'high' | 'medium' | 'low'): QueuePriority {
    switch (legacyPriority) {
      case 'high': return 'high';
      case 'medium': return 'normal';
      case 'low': return 'low';
      default: return 'normal';
    }
  }

  private mapModernPriority(modernPriority: QueuePriority): 'high' | 'medium' | 'low' {
    switch (modernPriority) {
      case 'high': return 'high';
      case 'normal': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  private convertToLegacyFormat(item: QueueItem): QueuedAction {
    return {
      id: item.id,
      type: item.operation.type as QueuedActionType,
      payload: item.operation.payload,
      userId: item.userId,
      createdAt: item.createdAt,
      attempts: item.metadata.retryCount,
      lastError: item.metadata.lastError,
      nextRetryAt: item.metadata.nextRetryAt,
      priority: this.mapModernPriority(item.priority)
    };
  }

  private applyLegacyFilter(items: QueuedAction[], filter: QueueFilter): QueuedAction[] {
    return items.filter(item => {
      if (filter.userId && item.userId !== filter.userId) return false;
      if (filter.type && item.type !== filter.type) return false;
      if (filter.priority && item.priority !== filter.priority) return false;
      if (filter.hasErrors !== undefined && (!!item.lastError) !== filter.hasErrors) return false;
      
      if (filter.maxAge) {
        const age = Date.now() - new Date(item.createdAt).getTime();
        if (age > filter.maxAge) return false;
      }
      
      return true;
    });
  }
}

export const OfflineQueue = OfflineQueueService.getInstance();