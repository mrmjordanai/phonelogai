import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConflictEvent, ConflictBatch } from '@phonelogai/types';

export interface QueueStats {
  totalBatches: number;
  totalConflicts: number;
  highPriorityBatches: number;
  memoryUsage: number; // bytes
  oldestBatch?: Date;
}

export interface ProcessingOptions {
  batchSize: number;
  maxMemoryUsage: number; // bytes
  priorityLevels: ('critical' | 'high' | 'medium' | 'low')[];
  processingTimeout: number; // milliseconds
}

class ConflictQueueService {
  private static instance: ConflictQueueService;
  private readonly STORAGE_KEY = '@phonelogai:conflict_queue';
  private readonly STATS_KEY = '@phonelogai:conflict_queue_stats';
  private readonly MAX_MEMORY_USAGE = 50 * 1024 * 1024; // 50MB
  private readonly DEFAULT_BATCH_SIZE = 50;
  
  private queue: ConflictBatch[] = [];
  private isProcessing = false;
  private memoryUsage = 0;
  private processedCount = 0;

  private constructor() {}

  public static getInstance(): ConflictQueueService {
    if (!ConflictQueueService.instance) {
      ConflictQueueService.instance = new ConflictQueueService();
    }
    return ConflictQueueService.instance;
  }

  /**
   * Initialize queue from persistent storage
   */
  public async initialize(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const batches = JSON.parse(stored) as ConflictBatch[];
        this.queue = batches.map(batch => ({
          ...batch,
          created_at: new Date(batch.created_at).toISOString()
        }));
        this.calculateMemoryUsage();
      }
    } catch (error) {
      console.error('Failed to initialize conflict queue:', error);
      this.queue = [];
    }
  }

  /**
   * Add conflicts to queue with intelligent batching
   */
  public async enqueueConflicts(conflicts: ConflictEvent[]): Promise<void> {
    if (conflicts.length === 0) return;

    // Group conflicts by similarity and type for optimal batching
    const batches = this.createOptimalBatches(conflicts);
    
    for (const batch of batches) {
      // Check memory limits before adding
      const estimatedSize = this.estimateBatchSize(batch);
      if (this.memoryUsage + estimatedSize > this.MAX_MEMORY_USAGE) {
        await this.processOldestBatches(1);
      }

      this.queue.push(batch);
      this.memoryUsage += estimatedSize;
    }

    // Sort queue by priority
    this.sortQueueByPriority();
    await this.persistQueue();
  }

  /**
   * Get next batch for processing
   */
  public async dequeue(options: Partial<ProcessingOptions> = {}): Promise<ConflictBatch | null> {
    if (this.queue.length === 0) return null;

    const opts = {
      batchSize: this.DEFAULT_BATCH_SIZE,
      priorityLevels: ['critical', 'high', 'medium', 'low'] as const,
      ...options
    };

    // Find highest priority batch that matches criteria
    for (const priority of opts.priorityLevels) {
      const batchIndex = this.queue.findIndex(batch => 
        batch.priority === priority && 
        batch.conflicts.length <= opts.batchSize
      );

      if (batchIndex !== -1) {
        const batch = this.queue.splice(batchIndex, 1)[0];
        this.memoryUsage -= this.estimateBatchSize(batch);
        await this.persistQueue();
        return batch;
      }
    }

    return null;
  }

  /**
   * Process conflicts in batches with memory management
   */
  public async processBatches(
    processor: (_batch: ConflictBatch) => Promise<void>,
    options: Partial<ProcessingOptions> = {}
  ): Promise<{ processed: number; failed: number; skipped: number }> {
    if (this.isProcessing) {
      console.warn('Batch processing already in progress');
      return { processed: 0, failed: 0, skipped: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let failed = 0;
    const skipped = 0;

    try {
      const startTime = Date.now();
      const timeout = options.processingTimeout || 30000; // 30 seconds default

      while (this.queue.length > 0) {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          console.warn('Batch processing timeout reached');
          break;
        }

        // Check memory usage
        if (this.memoryUsage > this.MAX_MEMORY_USAGE * 0.8) {
          console.warn('Memory usage high, pausing batch processing');
          break;
        }

        const batch = await this.dequeue(options);
        if (!batch) break;

        try {
          await processor(batch);
          processed++;
          this.processedCount++;
        } catch (error) {
          console.error('Failed to process batch:', error);
          failed++;
          
          // Re-queue batch with lower priority if it wasn't critical
          if (batch.priority !== 'critical') {
            batch.priority = 'low';
            this.queue.unshift(batch);
          }
        }

        // Yield control to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, failed, skipped };
  }

  /**
   * Get queue statistics
   */
  public async getStats(): Promise<QueueStats> {
    const highPriorityBatches = this.queue.filter(b => 
      b.priority === 'critical' || b.priority === 'high'
    ).length;

    const oldestBatch = this.queue.length > 0 
      ? new Date(Math.min(...this.queue.map(b => new Date(b.created_at).getTime())))
      : undefined;

    return {
      totalBatches: this.queue.length,
      totalConflicts: this.queue.reduce((sum, batch) => sum + batch.conflicts.length, 0),
      highPriorityBatches,
      memoryUsage: this.memoryUsage,
      oldestBatch
    };
  }

  /**
   * Clear processed batches and optimize memory
   */
  public async optimizeQueue(): Promise<void> {
    // Remove empty batches
    this.queue = this.queue.filter(batch => batch.conflicts.length > 0);
    
    // Remove batches older than 24 hours that are low priority
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    this.queue = this.queue.filter(batch => 
      batch.priority === 'critical' || 
      batch.priority === 'high' ||
      new Date(batch.created_at).getTime() > dayAgo
    );

    // Recalculate memory usage
    this.calculateMemoryUsage();
    
    await this.persistQueue();
  }

  /**
   * Create optimal batches from conflicts
   */
  private createOptimalBatches(conflicts: ConflictEvent[]): ConflictBatch[] {
    const batches: ConflictBatch[] = [];
    
    // Group conflicts by type and similarity
    const exactConflicts = conflicts.filter(c => c.conflict_type === 'exact');
    const timeVarianceConflicts = conflicts.filter(c => c.conflict_type === 'time_variance');
    const fuzzyConflicts = conflicts.filter(c => c.conflict_type === 'fuzzy');

    // Create batches for each type
    if (exactConflicts.length > 0) {
      batches.push(...this.chunkConflicts(exactConflicts, 'critical', 'duplicate_group'));
    }
    
    if (timeVarianceConflicts.length > 0) {
      batches.push(...this.chunkConflicts(timeVarianceConflicts, 'high', 'similarity_cluster'));
    }
    
    if (fuzzyConflicts.length > 0) {
      batches.push(...this.chunkConflicts(fuzzyConflicts, 'medium', 'manual_review'));
    }

    return batches;
  }

  /**
   * Chunk conflicts into appropriately sized batches
   */
  private chunkConflicts(
    conflicts: ConflictEvent[], 
    priority: ConflictBatch['priority'],
    batchType: ConflictBatch['batch_type']
  ): ConflictBatch[] {
    const batches: ConflictBatch[] = [];
    const chunkSize = this.DEFAULT_BATCH_SIZE;

    for (let i = 0; i < conflicts.length; i += chunkSize) {
      const chunk = conflicts.slice(i, i + chunkSize);
      batches.push({
        id: `${batchType}_${Date.now()}_${i}`,
        conflicts: chunk,
        priority,
        batch_type: batchType,
        created_at: new Date().toISOString(),
        requires_user_input: batchType === 'manual_review'
      });
    }

    return batches;
  }

  /**
   * Sort queue by priority
   */
  private sortQueueByPriority(): void {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    this.queue.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Secondary sort by creation time (oldest first)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  /**
   * Estimate memory usage of a batch
   */
  private estimateBatchSize(batch: ConflictBatch): number {
    // Rough estimation: JSON string length * 2 for overhead
    return JSON.stringify(batch).length * 2;
  }

  /**
   * Calculate current memory usage
   */
  private calculateMemoryUsage(): void {
    this.memoryUsage = this.queue.reduce(
      (total, batch) => total + this.estimateBatchSize(batch),
      0
    );
  }

  /**
   * Process oldest batches to free memory
   */
  private async processOldestBatches(count: number): Promise<void> {
    // Sort by creation time and remove oldest low-priority batches
    const oldBatches = this.queue
      .filter(b => b.priority === 'low' || b.priority === 'medium')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, count);

    for (const batch of oldBatches) {
      const index = this.queue.indexOf(batch);
      if (index !== -1) {
        this.queue.splice(index, 1);
        this.memoryUsage -= this.estimateBatchSize(batch);
      }
    }
  }

  /**
   * Persist queue to storage
   */
  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to persist conflict queue:', error);
    }
  }
}

export const ConflictQueue = ConflictQueueService.getInstance();