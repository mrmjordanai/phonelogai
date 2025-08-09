/**
 * Permission Cache - High-performance Redis-backed caching for RBAC
 * Provides sub-5ms permission lookups with intelligent cache management
 */

import type { 
  PermissionCacheEntry, 
  PermissionCheckResult 
} from '@phonelogai/shared';
import { RBAC_CACHE_CONFIG } from '@phonelogai/shared';

export interface CacheStats {
  hitRatio: number;
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  totalRequests: number;
}

/**
 * In-memory cache implementation with LRU eviction
 * TODO: Replace with Redis for production multi-instance deployments
 */
export class PermissionCache {
  private cache = new Map<string, PermissionCacheEntry>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private stats = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
  };
  private accessCounter = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private maxSize: number = RBAC_CACHE_CONFIG.MAX_ENTRIES,
    private defaultTTL: number = RBAC_CACHE_CONFIG.DEFAULT_TTL
  ) {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      RBAC_CACHE_CONFIG.CLEANUP_INTERVAL * 1000
    );
  }

  /**
   * Get cached permission result
   */
  async get(key: string): Promise<PermissionCacheEntry | null> {
    this.stats.totalRequests++;
    
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl * 1000) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access order for LRU
    this.accessOrder.set(key, ++this.accessCounter);
    this.stats.hits++;
    
    return entry;
  }

  /**
   * Set cache entry
   */
  async set(
    key: string, 
    result: PermissionCheckResult, 
    ttl: number = this.defaultTTL
  ): Promise<void> {
    // Don't cache non-cacheable results
    if (!result.cacheable) {
      return;
    }

    const entry: PermissionCacheEntry = {
      result,
      timestamp: Date.now(),
      ttl,
    };

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }

  /**
   * Delete specific cache entry
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  /**
   * Invalidate all cache entries for a user
   */
  async invalidateUser(userId: string): Promise<void> {
    const userPrefix = `${RBAC_CACHE_CONFIG.PREFIX}${userId}:`;
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(userPrefix)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
      }
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.totalRequests = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.totalRequests || 1; // Avoid division by zero
    
    return {
      hitRatio: this.stats.hits / totalRequests,
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalRequests: this.stats.totalRequests,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruAccess = Infinity;

    for (const [key, access] of this.accessOrder) {
      if (access < lruAccess) {
        lruAccess = access;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now > entry.timestamp + entry.ttl * 1000) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }
  }

  /**
   * Close cache and cleanup resources
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.clear();
  }

  /**
   * Get memory usage estimate in bytes
   */
  getMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [key, entry] of this.cache) {
      totalSize += key.length * 2; // UTF-16
      totalSize += JSON.stringify(entry).length * 2;
    }
    
    return totalSize;
  }

  /**
   * Set cache size limit
   */
  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    
    // Evict entries if over new limit
    while (this.cache.size > maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Preload cache with common permission patterns
   */
  async preload(entries: Array<{ key: string; result: PermissionCheckResult; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.result, entry.ttl);
    }
  }
}