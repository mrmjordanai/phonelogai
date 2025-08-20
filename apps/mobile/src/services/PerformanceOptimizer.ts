/**
 * PerformanceOptimizer - Runtime performance optimization service
 * 
 * Provides runtime optimizations, caching, and performance improvements
 * for React Native app performance.
 */

// AsyncStorage import removed as unused
// Platform import removed as unused

// React Native polyfills for web types
interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  [key: string]: unknown;
}

interface URLLike {
  searchParams: {
    set: (_key: string, _value: string) => void;
  };
  toString: () => string;
}

interface BlobLike {
  size: number;
}

declare const URL: {
  new (_url: string): URLLike;
};

declare const Blob: {
  new (_data: Array<string | ArrayBuffer | ArrayBufferView | Blob>): BlobLike;
};

interface OptimizationConfig {
  enableMemoryOptimization: boolean;
  enableNetworkOptimization: boolean;
  enableRenderOptimization: boolean;
  enableDataOptimization: boolean;
  cacheSize: number;
  batchSize: number;
  debounceTime: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  size: number;
}

interface PerformanceHint {
  type: 'memory' | 'network' | 'render' | 'data';
  action: 'prefetch' | 'cache' | 'batch' | 'defer' | 'compress';
  priority: 'low' | 'medium' | 'high';
  description: string;
}

class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private config: OptimizationConfig;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private batchQueue: Map<string, unknown[]> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private optimizationHints: PerformanceHint[] = [];

  private constructor() {
    this.config = {
      enableMemoryOptimization: true,
      enableNetworkOptimization: true,
      enableRenderOptimization: true,
      enableDataOptimization: true,
      cacheSize: 50 * 1024 * 1024, // 50MB cache
      batchSize: 100,
      debounceTime: 300,
    };
  }

  public static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  /**
   * Configure optimization settings
   */
  public configure(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[PerformanceOptimizer] Configuration updated:', config);
  }

  /**
   * Smart caching with LRU eviction
   */
  public cacheData<T>(key: string, data: T, ttl: number = 300000): T {
    if (!this.config.enableMemoryOptimization) return data;

    try {
      const size = this.estimateDataSize(data);
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        accessCount: 1,
        size,
      };

      // Check cache size limits
      this.evictIfNecessary(size);
      
      this.cache.set(key, entry);
      
      // Set TTL
      setTimeout(() => {
        this.cache.delete(key);
      }, ttl);

      console.log(`[PerformanceOptimizer] Cached ${key} (${size} bytes)`);
      return data;
    } catch (error) {
      console.error('[PerformanceOptimizer] Cache error:', error);
      return data;
    }
  }

  /**
   * Retrieve from cache
   */
  public getFromCache<T>(key: string): T | null {
    if (!this.config.enableMemoryOptimization) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Update access count for LRU
    entry.accessCount++;
    entry.timestamp = Date.now();

    return entry.data as T;
  }

  /**
   * Batch operations for efficiency
   */
  public batch<T>(
    operationKey: string,
    item: T,
    // eslint-disable-next-line no-unused-vars
    processor: (items: T[]) => Promise<void>
  ): void {
    if (!this.config.enableDataOptimization) {
      processor([item]).catch(() => {});
      return;
    }

    // Add to batch queue
    if (!this.batchQueue.has(operationKey)) {
      this.batchQueue.set(operationKey, []);
    }
    
    const queue = this.batchQueue.get(operationKey)!;
    queue.push(item);

    // Clear existing timer
    if (this.debounceTimers.has(operationKey)) {
      clearTimeout(this.debounceTimers.get(operationKey)!);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      const items = this.batchQueue.get(operationKey) || [];
      this.batchQueue.delete(operationKey);
      this.debounceTimers.delete(operationKey);

      if (items.length > 0) {
        try {
          await processor(items as T[]);
          console.log(`[PerformanceOptimizer] Processed batch of ${items.length} items for ${operationKey}`);
        } catch (error) {
          console.error(`[PerformanceOptimizer] Batch processing error for ${operationKey}:`, error);
        }
      }
    }, 300); // 300ms default debounce

    this.debounceTimers.set(operationKey, timer);

    // Force process if batch size reached
    if (queue.length >= this.config.batchSize) {
      clearTimeout(timer);
      this.debounceTimers.delete(operationKey);
      
      const items = [...queue];
      this.batchQueue.set(operationKey, []);
      
      processor(items as T[]).catch(error => {
        console.error(`[PerformanceOptimizer] Force batch processing error:`, error);
      });
    }
  }

  /**
   * Debounce function calls
   */
  public debounce<T extends (..._args: unknown[]) => unknown>(
    key: string,
    func: T,
    delay: number = this.config.debounceTime
  ): T {
    return ((..._args: Parameters<T>) => {
      // Clear existing timer
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key)!);
      }

      // Set new timer
      const timer = setTimeout(() => {
        this.debounceTimers.delete(key);
        func(..._args);
      }, delay);

      this.debounceTimers.set(key, timer);
    }) as T;
  }

  /**
   * Optimize network requests
   */
  public optimizeNetworkRequest(
    url: string,
    options: RequestInit = {}
  ): RequestInit {
    if (!this.config.enableNetworkOptimization) return options;

    const optimizedOptions = { ...options };

    // Add compression headers
    if (!optimizedOptions.headers) {
      optimizedOptions.headers = {};
    }

    const headers = optimizedOptions.headers as Record<string, string>;
    
    if (!headers['Accept-Encoding']) {
      headers['Accept-Encoding'] = 'gzip, deflate, br';
    }

    // Add caching headers for appropriate requests
    if (options.method === 'GET' || !options.method) {
      if (!headers['Cache-Control']) {
        headers['Cache-Control'] = 'max-age=300'; // 5 minutes
      }
    }

    // Add connection optimization
    if (!headers['Connection']) {
      headers['Connection'] = 'keep-alive';
    }

    console.log(`[PerformanceOptimizer] Optimized network request to ${url}`);
    return optimizedOptions;
  }

  /**
   * Optimize data structures for performance
   */
  public optimizeDataStructure<T>(data: T[], keyExtractor: (_item: T) => string): Map<string, T> {
    if (!this.config.enableDataOptimization) {
      return new Map(data.map(_item => [keyExtractor(_item), _item]));
    }

    const optimizedMap = new Map<string, T>();
    
    // Batch process for large datasets
    const batchSize = 1000;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      for (const item of batch) {
        const key = keyExtractor(item);
        optimizedMap.set(key, item);
      }
      
      // Yield control periodically for large datasets
      if (i > 0 && i % (batchSize * 10) === 0) {
        // Use setTimeout to yield control
        setTimeout(() => {}, 0);
      }
    }

    console.log(`[PerformanceOptimizer] Optimized data structure with ${data.length} items`);
    return optimizedMap;
  }

  /**
   * Memory-efficient array operations
   */
  public processLargeArray<T, R>(
    array: T[],
    processor: (_item: T, _index: number) => R,
    batchSize: number = this.config.batchSize
  ): Promise<R[]> {
    return new Promise((resolve, reject) => {
      const results: R[] = [];
      let currentIndex = 0;

      const processBatch = () => {
        try {
          const endIndex = Math.min(currentIndex + batchSize, array.length);
          
          for (let i = currentIndex; i < endIndex; i++) {
            const result = processor(array[i], i);
            results.push(result);
          }
          
          currentIndex = endIndex;
          
          if (currentIndex >= array.length) {
            resolve(results);
          } else {
            // Yield control and continue processing
            setTimeout(processBatch, 0);
          }
        } catch (error) {
          reject(error);
        }
      };

      processBatch();
    });
  }

  /**
   * Image optimization
   */
  public optimizeImageLoading(uri: string, dimensions: { width: number; height: number }): string {
    if (!this.config.enableRenderOptimization) return uri;

    // Add optimization parameters for remote images
    if (uri.startsWith('http')) {
      const url = new URL(uri);
      url.searchParams.set('w', dimensions.width.toString());
      url.searchParams.set('h', dimensions.height.toString());
      url.searchParams.set('q', '80'); // Quality
      url.searchParams.set('f', 'webp'); // Format
      
      return url.toString();
    }

    return uri;
  }

  /**
   * Component render optimization
   */
  public shouldComponentUpdate<T>(
    prevProps: T,
    nextProps: T,
    shallowKeys: (keyof T)[] = []
  ): boolean {
    if (!this.config.enableRenderOptimization) return true;

    // Shallow comparison for specified keys
    for (const key of shallowKeys) {
      if (prevProps[key] !== nextProps[key]) {
        return true;
      }
    }

    // Deep comparison for other props (simplified)
    const prevKeys = Object.keys(prevProps as Record<string, unknown>);
    const nextKeys = Object.keys(nextProps as Record<string, unknown>);

    if (prevKeys.length !== nextKeys.length) {
      return true;
    }

    for (const key of prevKeys) {
      if ((prevProps as Record<string, unknown>)[key] !== (nextProps as Record<string, unknown>)[key]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Add performance hint
   */
  public addPerformanceHint(hint: PerformanceHint): void {
    this.optimizationHints.push(hint);
    
    // Keep only recent hints
    if (this.optimizationHints.length > 100) {
      this.optimizationHints = this.optimizationHints.slice(-100);
    }
    
    console.log(`[PerformanceOptimizer] Added hint: ${hint.type} - ${hint.description}`);
  }

  /**
   * Get performance recommendations
   */
  public getPerformanceRecommendations(): PerformanceHint[] {
    const recommendations: PerformanceHint[] = [];
    
    // Analyze cache hit rate
    const totalAccess = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.accessCount, 0);
    const cacheHitRate = this.cache.size > 0 ? totalAccess / this.cache.size : 0;
    
    if (cacheHitRate < 2) {
      recommendations.push({
        type: 'memory',
        action: 'cache',
        priority: 'medium',
        description: 'Consider increasing cache usage for frequently accessed data',
      });
    }
    
    // Analyze batch queue efficiency
    const totalQueueItems = Array.from(this.batchQueue.values()).reduce((sum, queue) => sum + queue.length, 0);
    
    if (totalQueueItems > this.config.batchSize * 3) {
      recommendations.push({
        type: 'data',
        action: 'batch',
        priority: 'high',
        description: 'Consider reducing batch size or increasing processing frequency',
      });
    }
    
    // Add recent hints
    recommendations.push(...this.optimizationHints.slice(-10));
    
    return recommendations;
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    size: number;
    itemCount: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const totalSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);
    const totalAccess = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.accessCount, 0);
    
    return {
      size: totalSize,
      itemCount: this.cache.size,
      hitRate: this.cache.size > 0 ? totalAccess / this.cache.size : 0,
      memoryUsage: (totalSize / this.config.cacheSize) * 100,
    };
  }

  /**
   * Clear all optimizations
   */
  public reset(): void {
    this.cache.clear();
    this.batchQueue.clear();
    
    // Clear all timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    this.optimizationHints = [];
    
    console.log('[PerformanceOptimizer] Reset all optimizations');
  }

  /**
   * Estimate data size in bytes
   */
  private estimateDataSize(data: unknown): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      // Fallback estimation
      const str = JSON.stringify(data);
      return str.length * 2; // Rough estimate for UTF-16
    }
  }

  /**
   * Evict cache entries if necessary
   */
  private evictIfNecessary(newDataSize: number): void {
    const currentSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);
    
    if (currentSize + newDataSize > this.config.cacheSize) {
      // Sort by access count and timestamp (LRU)
      const entries = Array.from(this.cache.entries()).sort(([, a], [, b]) => {
        if (a.accessCount !== b.accessCount) {
          return a.accessCount - b.accessCount;
        }
        return a.timestamp - b.timestamp;
      });
      
      // Remove entries until we have enough space
      let freedSpace = 0;
      for (const [key, entry] of entries) {
        this.cache.delete(key);
        freedSpace += entry.size;
        
        if (freedSpace >= newDataSize) {
          break;
        }
      }
      
      console.log(`[PerformanceOptimizer] Evicted ${freedSpace} bytes from cache`);
    }
  }
}

export default PerformanceOptimizer;