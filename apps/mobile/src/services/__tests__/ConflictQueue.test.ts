import { ConflictQueue } from '../ConflictQueue';
import { ConflictEvent, ConflictBatch } from '@phonelogai/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('ConflictQueue', () => {
  const sampleEvent: ConflictEvent = {
    id: 'conflict-1',
    user_id: 'user-1',
    original: {
      id: 'event-1',
      user_id: 'user-1',
      line_id: 'line-1',
      ts: '2023-01-01T10:00:00Z',
      number: '+1234567890',
      direction: 'inbound',
      type: 'call',
      created_at: '2023-01-01T10:00:00Z',
      updated_at: '2023-01-01T10:00:00Z'
    },
    duplicate: {
      id: 'event-2',
      user_id: 'user-1',
      line_id: 'line-1',
      ts: '2023-01-01T10:00:00Z',
      number: '+1234567890',
      direction: 'inbound',
      type: 'call',
      created_at: '2023-01-01T10:00:00Z',
      updated_at: '2023-01-01T10:00:00Z'
    },
    conflict_type: 'exact',
    similarity: 1.0,
    original_quality: {
      completeness: 0.9,
      source_reliability: 0.9,
      freshness: 1.0,
      overall: 0.93
    },
    duplicate_quality: {
      completeness: 0.8,
      source_reliability: 0.7,
      freshness: 1.0,
      overall: 0.8
    },
    resolution_strategy: 'automatic',
    created_at: '2023-01-01T10:00:00Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
  });

  describe('Initialization', () => {
    it('should initialize empty queue when no stored data', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      await ConflictQueue.initialize();
      const stats = await ConflictQueue.getStats();

      expect(stats.totalBatches).toBe(0);
      expect(stats.totalConflicts).toBe(0);
    });

    it('should load stored queue data on initialization', async () => {
      const storedBatch: ConflictBatch = {
        id: 'batch-1',
        conflicts: [sampleEvent],
        priority: 'high',
        batch_type: 'duplicate_group',
        created_at: '2023-01-01T10:00:00Z',
        requires_user_input: false
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify([storedBatch]));

      await ConflictQueue.initialize();
      const stats = await ConflictQueue.getStats();

      expect(stats.totalBatches).toBe(1);
      expect(stats.totalConflicts).toBe(1);
    });

    it('should handle corrupted storage data gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json');

      await ConflictQueue.initialize();
      const stats = await ConflictQueue.getStats();

      expect(stats.totalBatches).toBe(0);
    });
  });

  describe('Queue Management', () => {
    beforeEach(async () => {
      await ConflictQueue.initialize();
    });

    it('should enqueue conflicts and create optimal batches', async () => {
      const exactConflicts = Array.from({ length: 5 }, (_, i) => ({
        ...sampleEvent,
        id: `exact-${i}`,
        conflict_type: 'exact' as const
      }));

      const fuzzyConflicts = Array.from({ length: 3 }, (_, i) => ({
        ...sampleEvent,
        id: `fuzzy-${i}`,
        conflict_type: 'fuzzy' as const
      }));

      await ConflictQueue.enqueueConflicts([...exactConflicts, ...fuzzyConflicts]);

      const stats = await ConflictQueue.getStats();
      expect(stats.totalConflicts).toBe(8);
      expect(stats.totalBatches).toBeGreaterThan(0);
      expect(stats.highPriorityBatches).toBeGreaterThan(0); // Exact conflicts are high priority
    });

    it('should respect batch size limits', async () => {
      const conflicts = Array.from({ length: 150 }, (_, i) => ({
        ...sampleEvent,
        id: `conflict-${i}`
      }));

      await ConflictQueue.enqueueConflicts(conflicts);

      const stats = await ConflictQueue.getStats();
      expect(stats.totalBatches).toBeGreaterThan(1); // Should split into multiple batches
    });

    it('should prioritize critical conflicts', async () => {
      const criticalConflicts = [
        { ...sampleEvent, id: 'critical-1', conflict_type: 'exact' as const }
      ];
      const lowPriorityConflicts = [
        { ...sampleEvent, id: 'low-1', conflict_type: 'fuzzy' as const }
      ];

      await ConflictQueue.enqueueConflicts([...lowPriorityConflicts, ...criticalConflicts]);

      const batch = await ConflictQueue.dequeue({ priorityLevels: ['critical', 'high'] });
      expect(batch).toBeTruthy();
      expect(batch?.priority).toBe('critical');
    });
  });

  describe('Batch Processing', () => {
    beforeEach(async () => {
      await ConflictQueue.initialize();
    });

    it('should process batches in priority order', async () => {
      const conflicts = [
        { ...sampleEvent, id: 'exact-1', conflict_type: 'exact' as const },
        { ...sampleEvent, id: 'fuzzy-1', conflict_type: 'fuzzy' as const }
      ];

      await ConflictQueue.enqueueConflicts(conflicts);

      const processedBatches: ConflictBatch[] = [];
      const processor = jest.fn(async (batch: ConflictBatch) => {
        processedBatches.push(batch);
      });

      const result = await ConflictQueue.processBatches(processor, {
        processingTimeout: 10000
      });

      expect(result.processed).toBeGreaterThan(0);
      expect(processor).toHaveBeenCalled();
      // Critical/high priority should be processed first
      expect(processedBatches[0].priority).toMatch(/critical|high/);
    });

    it('should handle processing failures gracefully', async () => {
      const conflicts = [{ ...sampleEvent, id: 'fail-test' }];
      await ConflictQueue.enqueueConflicts(conflicts);

      const processor = jest.fn(async () => {
        throw new Error('Processing failed');
      });

      const result = await ConflictQueue.processBatches(processor, {
        processingTimeout: 5000
      });

      expect(result.failed).toBeGreaterThan(0);
      expect(result.processed).toBe(0);
    });

    it('should respect processing timeout', async () => {
      const conflicts = Array.from({ length: 100 }, (_, i) => ({
        ...sampleEvent,
        id: `timeout-test-${i}`
      }));

      await ConflictQueue.enqueueConflicts(conflicts);

      const processor = jest.fn(async () => {
        // Simulate slow processing
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const startTime = Date.now();
      await ConflictQueue.processBatches(processor, {
        processingTimeout: 500 // 500ms timeout
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should timeout before 1 second
    });

    it('should manage memory usage effectively', async () => {
      const conflicts = Array.from({ length: 1000 }, (_, i) => ({
        ...sampleEvent,
        id: `memory-test-${i}`
      }));

      await ConflictQueue.enqueueConflicts(conflicts);

      const initialStats = await ConflictQueue.getStats();
      expect(initialStats.memoryUsage).toBeGreaterThan(0);

      // Process some batches
      const processor = jest.fn();
      await ConflictQueue.processBatches(processor, { 
        batchSize: 50,
        processingTimeout: 10000 
      });

      const finalStats = await ConflictQueue.getStats();
      expect(finalStats.memoryUsage).toBeLessThan(initialStats.memoryUsage);
    });
  });

  describe('Queue Optimization', () => {
    beforeEach(async () => {
      await ConflictQueue.initialize();
    });

    it('should remove empty batches during optimization', async () => {
      // Create a batch and then manually empty it (simulating processing)
      const conflicts = [sampleEvent];
      await ConflictQueue.enqueueConflicts(conflicts);

      // Process the batch
      await ConflictQueue.processBatches(async () => {});

      await ConflictQueue.optimizeQueue();

      const stats = await ConflictQueue.getStats();
      expect(stats.totalConflicts).toBe(0);
    });

    it('should remove old low-priority batches', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      
      const oldConflict = {
        ...sampleEvent,
        id: 'old-conflict',
        conflict_type: 'fuzzy' as const,
        created_at: oldDate.toISOString()
      };

      const recentConflict = {
        ...sampleEvent,
        id: 'recent-conflict',
        conflict_type: 'exact' as const
      };

      await ConflictQueue.enqueueConflicts([oldConflict, recentConflict]);
      await ConflictQueue.optimizeQueue();

      const stats = await ConflictQueue.getStats();
      // Old low-priority conflicts should be removed, but recent high-priority kept
      expect(stats.totalConflicts).toBe(1);
    });

    it('should preserve critical batches regardless of age', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      
      const oldCriticalConflict = {
        ...sampleEvent,
        id: 'old-critical',
        conflict_type: 'exact' as const,
        created_at: oldDate.toISOString()
      };

      await ConflictQueue.enqueueConflicts([oldCriticalConflict]);
      await ConflictQueue.optimizeQueue();

      const stats = await ConflictQueue.getStats();
      expect(stats.totalConflicts).toBe(1); // Critical conflict should be preserved
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await ConflictQueue.initialize();
    });

    it('should provide accurate queue statistics', async () => {
      const exactConflicts = Array.from({ length: 5 }, (_, i) => ({
        ...sampleEvent,
        id: `exact-${i}`,
        conflict_type: 'exact' as const
      }));

      const fuzzyConflicts = Array.from({ length: 3 }, (_, i) => ({
        ...sampleEvent,
        id: `fuzzy-${i}`,
        conflict_type: 'fuzzy' as const
      }));

      await ConflictQueue.enqueueConflicts([...exactConflicts, ...fuzzyConflicts]);

      const stats = await ConflictQueue.getStats();

      expect(stats.totalConflicts).toBe(8);
      expect(stats.highPriorityBatches).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.oldestBatch).toBeDefined();
    });

    it('should track memory usage accurately', async () => {
      const initialStats = await ConflictQueue.getStats();
      expect(initialStats.memoryUsage).toBe(0);

      const conflicts = Array.from({ length: 50 }, (_, i) => ({
        ...sampleEvent,
        id: `memory-${i}`
      }));

      await ConflictQueue.enqueueConflicts(conflicts);

      const afterEnqueueStats = await ConflictQueue.getStats();
      expect(afterEnqueueStats.memoryUsage).toBeGreaterThan(0);

      // Process all batches
      await ConflictQueue.processBatches(async () => {});

      const afterProcessingStats = await ConflictQueue.getStats();
      expect(afterProcessingStats.memoryUsage).toBeLessThan(afterEnqueueStats.memoryUsage);
    });
  });

  describe('Persistence', () => {
    it('should persist queue state to AsyncStorage', async () => {
      await ConflictQueue.initialize();

      const conflicts = [sampleEvent];
      await ConflictQueue.enqueueConflicts(conflicts);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@phonelogai:conflict_queue',
        expect.any(String)
      );
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      await ConflictQueue.initialize();

      // Should not throw error
      await expect(ConflictQueue.enqueueConflicts([sampleEvent])).resolves.not.toThrow();
    });
  });
});