// Enhanced Offline Queue Service - Integrates with the comprehensive queue system
import { Event, Contact, SyncHealth } from '@phonelogai/types';
import { QueueManager } from './QueueManager';
import { SyncEngine } from './SyncEngine';
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
  private queueManager: QueueManager;
  private syncEngine: SyncEngine;
  private networkDetector: NetworkDetector;
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
   * Get queue statistics
   */
  public async getStats(): Promise<QueueStats> {
    await this.ensureCacheLoaded();
    
    const items = Array.from(this.memoryCache.values());
    const failedItems = items.filter(item => !!item.lastError);
    
    let oldestDate: Date | undefined;
    let newestDate: Date | undefined;
    
    if (items.length > 0) {
      const dates = items.map(item => new Date(item.createdAt).getTime());
      oldestDate = new Date(Math.min(...dates));
      newestDate = new Date(Math.max(...dates));
    }

    // Estimate size in bytes (rough calculation)
    const sizeInBytes = await this.estimateStorageSize();

    return {
      totalItems: items.length,
      pendingItems: items.length - failedItems.length,
      failedItems: failedItems.length,
      oldestItem: oldestDate,
      newestItem: newestDate,
      sizeInBytes,
    };
  }

  /**
   * Clear all items from the queue
   */
  public async clear(userId?: string): Promise<void> {
    await this.ensureCacheLoaded();
    
    if (userId) {
      // Clear only items for specific user
      const toDelete = Array.from(this.memoryCache.entries())
        .filter(([_, action]) => action.userId === userId)
        .map(([id, _]) => id);
      
      for (const id of toDelete) {
        this.memoryCache.delete(id);
      }
    } else {
      // Clear all items
      this.memoryCache.clear();
    }

    await this.saveToStorage();
  }

  /**
   * Get all items in queue (for debugging)
   */
  public async getAllItems(filter?: QueueFilter): Promise<QueuedAction[]> {
    await this.ensureCacheLoaded();
    
    let items = Array.from(this.memoryCache.values());

    if (filter) {
      items = items.filter(item => {
        if (filter.userId && item.userId !== filter.userId) return false;
        if (filter.type && item.type !== filter.type) return false;
        if (filter.priority && item.priority !== filter.priority) return false;
        if (filter.hasErrors !== undefined && (!!item.lastError) !== filter.hasErrors) return false;
        return true;
      });
    }

    return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * Remove old items to prevent queue from growing too large
   */
  public async cleanupOldItems(): Promise<number> {
    await this.ensureCacheLoaded();
    
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    let removedCount = 0;

    const toRemove: string[] = [];
    
    for (const [id, action] of this.memoryCache.entries()) {
      const age = now - new Date(action.createdAt).getTime();
      
      // Remove old items or items that have failed too many times
      if (age > maxAge || action.attempts >= this.MAX_RETRY_ATTEMPTS) {
        toRemove.push(id);
      }
    }

    // If queue is too large, remove oldest items
    if (this.memoryCache.size > this.MAX_QUEUE_SIZE) {
      const items = Array.from(this.memoryCache.entries())
        .sort(([, a], [, b]) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      const excessCount = this.memoryCache.size - this.MAX_QUEUE_SIZE;
      for (let i = 0; i < excessCount; i++) {
        toRemove.push(items[i][0]);
      }
    }

    for (const id of toRemove) {
      this.memoryCache.delete(id);
      removedCount++;
    }

    if (removedCount > 0) {
      await this.saveToStorage();
    }

    return removedCount;
  }

  /**
   * Add action to queue
   */
  private async enqueueAction(action: QueuedAction): Promise<string> {
    await this.ensureCacheLoaded();
    
    // Check if queue is at capacity
    if (this.memoryCache.size >= this.MAX_QUEUE_SIZE) {
      await this.cleanupOldItems();
      
      if (this.memoryCache.size >= this.MAX_QUEUE_SIZE) {
        throw new Error('Queue is at capacity. Cannot add more items.');
      }
    }

    this.memoryCache.set(action.id, action);
    await this.saveToStorage();
    
    return action.id;
  }

  /**
   * Load queue from AsyncStorage
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.memoryCache.clear();
        
        for (const [id, action] of Object.entries(parsed)) {
          this.memoryCache.set(id, action as QueuedAction);
        }
      }
    } catch (error) {
      console.error('Failed to load offline queue from storage:', error);
      // Continue with empty cache
    }
  }

  /**
   * Save queue to AsyncStorage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const data = Object.fromEntries(this.memoryCache.entries());
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save offline queue to storage:', error);
      // Continue - this is not critical for app function
    }
  }

  /**
   * Ensure cache is loaded before operations
   */
  private async ensureCacheLoaded(): Promise<void> {
    if (!this.cacheLoaded) {
      await this.initialize();
    }
  }

  /**
   * Estimate storage size of queue data
   */
  private async estimateStorageSize(): Promise<number> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      return data ? new Blob([data]).size : 0;
    } catch (error) {
      return 0;
    }
  }
}

export const OfflineQueue = OfflineQueueService.getInstance();