import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueueItem, QueueItemSerializer, QueuePriority, QueueStatus } from './QueueItem';
import { CryptoService } from './CryptoService';

export interface StorageFilter {
  userId?: string;
  priority?: QueuePriority;
  status?: QueueStatus;
  operationType?: string;
  maxAge?: number; // milliseconds
  hasErrors?: boolean;
}

export interface StorageStats {
  totalItems: number;
  totalSizeBytes: number;
  itemsByStatus: Record<QueueStatus, number>;
  itemsByPriority: Record<QueuePriority, number>;
  oldestItemAge: number; // milliseconds
  newestItemAge: number; // milliseconds
  averageItemSize: number;
  compressionRatio: number;
}

export interface StorageConfig {
  keyPrefix: string;
  enableCompression: boolean;
  enableEncryption: boolean;
  compressionThreshold: number; // bytes
  maxItemAge: number; // milliseconds
  maxStorageSize: number; // bytes
  batchSize: number;
}

class OfflineStorageService {
  private static instance: OfflineStorageService;
  private readonly config: StorageConfig;
  private readonly cryptoService: CryptoService;
  private memoryCache: Map<string, QueueItem> = new Map();
  private cacheLoaded = false;
  private compressionStats = { compressed: 0, total: 0 };

  private constructor(config?: Partial<StorageConfig>) {
    this.config = {
      keyPrefix: '@phonelogai:offline_queue:v2',
      enableCompression: true,
      enableEncryption: true,
      compressionThreshold: 1024, // 1KB
      maxItemAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxStorageSize: 50 * 1024 * 1024, // 50MB
      batchSize: 100,
      ...config
    };
    this.cryptoService = CryptoService.getInstance();
  }

  public static getInstance(config?: Partial<StorageConfig>): OfflineStorageService {
    if (!OfflineStorageService.instance) {
      OfflineStorageService.instance = new OfflineStorageService(config);
    }
    return OfflineStorageService.instance;
  }

  /**
   * Initialize storage and load all items into memory cache
   */
  async initialize(): Promise<void> {
    try {
      await this.loadAllItems();
      await this.performMaintenance();
      this.cacheLoaded = true;
      
      console.log(`Offline storage initialized with ${this.memoryCache.size} items`);
    } catch (error) {
      console.error('Failed to initialize offline storage:', error);
      this.cacheLoaded = true; // Continue with empty cache
    }
  }

  /**
   * Store a queue item
   */
  async store(item: QueueItem): Promise<void> {
    await this.ensureInitialized();
    
    // Update item metadata
    const updatedItem = {
      ...item,
      updatedAt: new Date().toISOString()
    };

    // Store in memory cache
    this.memoryCache.set(item.id, updatedItem);
    
    // Persist to storage
    await this.persistItem(updatedItem);
    
    // Check storage limits
    await this.checkStorageLimits();
  }

  /**
   * Store multiple items in batch
   */
  async storeBatch(items: QueueItem[]): Promise<void> {
    await this.ensureInitialized();
    
    const now = new Date().toISOString();
    const updatedItems = items.map(item => ({
      ...item,
      updatedAt: now
    }));

    // Update memory cache
    for (const item of updatedItems) {
      this.memoryCache.set(item.id, item);
    }

    // Persist in batches
    const batches = this.chunkArray(updatedItems, this.config.batchSize);
    for (const batch of batches) {
      await this.persistBatch(batch);
    }

    await this.checkStorageLimits();
  }

  /**
   * Retrieve a queue item by ID
   */
  async retrieve(itemId: string): Promise<QueueItem | null> {
    await this.ensureInitialized();
    return this.memoryCache.get(itemId) || null;
  }

  /**
   * Retrieve multiple items with filtering and pagination
   */
  async retrieveMany(
    filter?: StorageFilter,
    limit?: number,
    offset: number = 0
  ): Promise<QueueItem[]> {
    await this.ensureInitialized();
    
    let items = Array.from(this.memoryCache.values());
    
    // Apply filters
    if (filter) {
      items = this.applyFilter(items, filter);
    }

    // Sort by priority and age
    items.sort((a, b) => {
      // Priority first (high = 0, normal = 1, low = 2)
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by creation time (oldest first)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Apply pagination
    const start = offset;
    const end = limit ? start + limit : items.length;
    return items.slice(start, end);
  }

  /**
   * Update a queue item
   */
  async update(itemId: string, updates: Partial<QueueItem>): Promise<void> {
    await this.ensureInitialized();
    
    const existingItem = this.memoryCache.get(itemId);
    if (!existingItem) {
      throw new Error(`Queue item with ID ${itemId} not found`);
    }

    const updatedItem = {
      ...existingItem,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.memoryCache.set(itemId, updatedItem);
    await this.persistItem(updatedItem);
  }

  /**
   * Delete a queue item
   */
  async delete(itemId: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const wasDeleted = this.memoryCache.delete(itemId);
    if (wasDeleted) {
      await this.deleteFromStorage(itemId);
    }
    
    return wasDeleted;
  }

  /**
   * Delete multiple items
   */
  async deleteBatch(itemIds: string[]): Promise<number> {
    await this.ensureInitialized();
    
    let deletedCount = 0;
    const storageKeysToDelete: string[] = [];

    for (const itemId of itemIds) {
      if (this.memoryCache.delete(itemId)) {
        deletedCount++;
        storageKeysToDelete.push(this.getStorageKey(itemId));
      }
    }

    // Delete from storage in batch
    if (storageKeysToDelete.length > 0) {
      await AsyncStorage.multiRemove(storageKeysToDelete);
    }

    return deletedCount;
  }

  /**
   * Clear all items matching filter
   */
  async clear(filter?: StorageFilter): Promise<number> {
    await this.ensureInitialized();
    
    const itemsToDelete = filter ? 
      this.applyFilter(Array.from(this.memoryCache.values()), filter) :
      Array.from(this.memoryCache.values());
    
    const itemIds = itemsToDelete.map(item => item.id);
    return await this.deleteBatch(itemIds);
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    await this.ensureInitialized();
    
    const items = Array.from(this.memoryCache.values());
    const now = Date.now();
    
    // Calculate stats
    const totalItems = items.length;
    const totalSizeBytes = items.reduce((sum, item) => sum + item.metadata.estimatedSize, 0);
    
    const itemsByStatus: Record<QueueStatus, number> = {
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0
    };
    
    const itemsByPriority: Record<QueuePriority, number> = {
      high: 0,
      normal: 0,
      low: 0
    };
    
    let oldestTime = now;
    let newestTime = 0;
    
    for (const item of items) {
      itemsByStatus[item.status]++;
      itemsByPriority[item.priority]++;
      
      const itemTime = new Date(item.createdAt).getTime();
      oldestTime = Math.min(oldestTime, itemTime);
      newestTime = Math.max(newestTime, itemTime);
    }

    return {
      totalItems,
      totalSizeBytes,
      itemsByStatus,
      itemsByPriority,
      oldestItemAge: totalItems > 0 ? now - oldestTime : 0,
      newestItemAge: totalItems > 0 ? now - newestTime : 0,
      averageItemSize: totalItems > 0 ? totalSizeBytes / totalItems : 0,
      compressionRatio: this.compressionStats.total > 0 ? 
        this.compressionStats.compressed / this.compressionStats.total : 1
    };
  }

  /**
   * Perform maintenance tasks (cleanup, compression, etc.)
   */
  async performMaintenance(): Promise<{ cleaned: number; compressed: number }> {
    await this.ensureInitialized();
    
    const startTime = Date.now();
    let cleanedCount = 0;
    let compressedCount = 0;

    // Clean up expired items
    const expiredItems = Array.from(this.memoryCache.values())
      .filter(item => this.isExpired(item));
    
    if (expiredItems.length > 0) {
      cleanedCount = await this.deleteBatch(expiredItems.map(item => item.id));
    }

    // Re-compress items if needed
    for (const item of this.memoryCache.values()) {
      if (this.shouldCompress(item) && !item.metadata.compressionRatio) {
        await this.persistItem(item);
        compressedCount++;
      }
    }

    console.log(`Maintenance completed in ${Date.now() - startTime}ms: cleaned ${cleanedCount}, compressed ${compressedCount}`);
    
    return { cleaned: cleanedCount, compressed: compressedCount };
  }

  /**
   * Get storage size estimate
   */
  async getStorageSize(): Promise<number> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const queueKeys = keys.filter(key => key.startsWith(this.config.keyPrefix));
      
      if (queueKeys.length === 0) return 0;

      const values = await AsyncStorage.multiGet(queueKeys);
      return values.reduce((total, [_, value]) => total + (value?.length || 0), 0);
    } catch (error) {
      console.error('Failed to get storage size:', error);
      return 0;
    }
  }

  /**
   * Private helper methods
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.cacheLoaded) {
      await this.initialize();
    }
  }

  private async loadAllItems(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const queueKeys = keys.filter(key => key.startsWith(this.config.keyPrefix));
      
      if (queueKeys.length === 0) return;

      const keyValuePairs = await AsyncStorage.multiGet(queueKeys);
      
      for (const [key, value] of keyValuePairs) {
        if (value) {
          try {
            const item = await this.deserializeItem(value);
            this.memoryCache.set(item.id, item);
          } catch (error) {
            console.error(`Failed to deserialize item ${key}:`, error);
            // Remove corrupted item
            await AsyncStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load items from storage:', error);
    }
  }

  private async persistItem(item: QueueItem): Promise<void> {
    try {
      const serializedData = await this.serializeItem(item);
      const key = this.getStorageKey(item.id);
      await AsyncStorage.setItem(key, serializedData);
    } catch (error) {
      console.error(`Failed to persist item ${item.id}:`, error);
      throw error;
    }
  }

  private async persistBatch(items: QueueItem[]): Promise<void> {
    try {
      const keyValuePairs: [string, string][] = [];
      
      for (const item of items) {
        const serializedData = await this.serializeItem(item);
        const key = this.getStorageKey(item.id);
        keyValuePairs.push([key, serializedData]);
      }
      
      await AsyncStorage.multiSet(keyValuePairs);
    } catch (error) {
      console.error('Failed to persist batch:', error);
      throw error;
    }
  }

  private async serializeItem(item: QueueItem): Promise<string> {
    let data = QueueItemSerializer.serialize(item);
    
    // Apply compression if enabled and data size exceeds threshold
    if (this.config.enableCompression && data.length > this.config.compressionThreshold) {
      const originalSize = data.length;
      data = await this.compress(data);
      const compressedSize = data.length;
      
      // Update compression stats
      this.compressionStats.compressed += compressedSize;
      this.compressionStats.total += originalSize;
      
      // Update item metadata
      item.metadata.compressionRatio = compressedSize / originalSize;
    }
    
    // Apply encryption if enabled and item contains sensitive data
    if (this.config.enableEncryption && item.metadata.encrypted) {
      data = await this.cryptoService.encrypt(data);
    }
    
    return data;
  }

  private async deserializeItem(data: string): Promise<QueueItem> {
    let processedData = data;
    
    // Try to decrypt if it looks encrypted
    if (this.config.enableEncryption && this.isEncrypted(data)) {
      processedData = await this.cryptoService.decrypt(data);
    }
    
    // Try to decompress if it looks compressed
    if (this.config.enableCompression && this.isCompressed(processedData)) {
      processedData = await this.decompress(processedData);
    }
    
    return QueueItemSerializer.deserialize(processedData);
  }

  private async deleteFromStorage(itemId: string): Promise<void> {
    const key = this.getStorageKey(itemId);
    await AsyncStorage.removeItem(key);
  }

  private applyFilter(items: QueueItem[], filter: StorageFilter): QueueItem[] {
    return items.filter(item => {
      if (filter.userId && item.userId !== filter.userId) return false;
      if (filter.priority && item.priority !== filter.priority) return false;
      if (filter.status && item.status !== filter.status) return false;
      if (filter.operationType && item.operation.type !== filter.operationType) return false;
      if (filter.hasErrors !== undefined && (!!item.metadata.lastError) !== filter.hasErrors) return false;
      
      if (filter.maxAge) {
        const age = Date.now() - new Date(item.createdAt).getTime();
        if (age > filter.maxAge) return false;
      }
      
      return true;
    });
  }

  private isExpired(item: QueueItem): boolean {
    const age = Date.now() - new Date(item.createdAt).getTime();
    return age > this.config.maxItemAge;
  }

  private shouldCompress(item: QueueItem): boolean {
    return this.config.enableCompression && 
           item.metadata.estimatedSize > this.config.compressionThreshold;
  }

  private async checkStorageLimits(): Promise<void> {
    const storageSize = await this.getStorageSize();
    
    if (storageSize > this.config.maxStorageSize) {
      console.warn(`Storage size (${storageSize}) exceeds limit (${this.config.maxStorageSize}), performing cleanup`);
      await this.performMaintenance();
    }
  }

  private getStorageKey(itemId: string): string {
    return `${this.config.keyPrefix}:${itemId}`;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async compress(data: string): Promise<string> {
    // Simple compression using btoa (base64) - in a real app, use pako or similar
    // This is a placeholder implementation
    try {
      const compressed = btoa(data);
      return `COMPRESSED:${compressed}`;
    } catch (error) {
      console.warn('Compression failed, using original data:', error);
      return data;
    }
  }

  private async decompress(data: string): Promise<string> {
    if (data.startsWith('COMPRESSED:')) {
      try {
        return atob(data.slice(11)); // Remove 'COMPRESSED:' prefix
      } catch (error) {
        console.error('Decompression failed:', error);
        throw error;
      }
    }
    return data;
  }

  private isCompressed(data: string): boolean {
    return data.startsWith('COMPRESSED:');
  }

  private isEncrypted(data: string): boolean {
    // Simple heuristic - encrypted data typically doesn't start with '{'
    return !data.trim().startsWith('{');
  }
}

export const OfflineStorage = OfflineStorageService.getInstance();