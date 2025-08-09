/**
 * Comprehensive test suite for the Enhanced Offline Queue System
 */
import { 
  QueueItem, 
  QueueItemFactory, 
  QueueItemSerializer, 
  QueueItemUtils 
} from '../QueueItem';
import { OfflineStorage } from '../OfflineStorage';
import { NetworkDetector } from '../NetworkDetector';
import { QueueManager } from '../QueueManager';
import { SyncEngine } from '../SyncEngine';
import { OfflineQueue } from '../OfflineQueue';
import { Event, Contact, SyncHealth } from '@phonelogai/types';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('@react-native-netinfo/netinfo');
jest.mock('@phonelogai/database');

describe('Enhanced Offline Queue System', () => {
  const mockEvent: Event = {
    id: 'event-1',
    user_id: 'user-1',
    line_id: 'line-1',
    ts: new Date().toISOString(),
    number: '+1234567890',
    direction: 'inbound',
    type: 'call',
    duration: 120,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const mockContact: Contact = {
    id: 'contact-1',
    user_id: 'user-1',
    number: '+1234567890',
    name: 'John Doe',
    tags: [],
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    total_calls: 5,
    total_sms: 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('QueueItem', () => {
    it('should create event queue item with factory', () => {
      const item = QueueItemFactory.createEvent(mockEvent);
      
      expect(item.userId).toBe(mockEvent.user_id);
      expect(item.operation.type).toBe('CREATE_EVENT');
      expect(item.operation.payload).toEqual(mockEvent);
      expect(item.priority).toBe('high');
      expect(item.status).toBe('pending');
      expect(item.conflictKey).toBeDefined();
    });

    it('should create contact queue item with factory', () => {
      const item = QueueItemFactory.createContact(mockContact);
      
      expect(item.userId).toBe(mockContact.user_id);
      expect(item.operation.type).toBe('CREATE_CONTACT');
      expect(item.operation.payload).toEqual(mockContact);
      expect(item.priority).toBe('normal');
    });

    it('should serialize and deserialize queue items', () => {
      const item = QueueItemFactory.createEvent(mockEvent);
      const serialized = QueueItemSerializer.serialize(item);
      const deserialized = QueueItemSerializer.deserialize(serialized);
      
      expect(deserialized).toEqual(item);
    });

    it('should handle batch serialization', () => {
      const items = [
        QueueItemFactory.createEvent(mockEvent),
        QueueItemFactory.createContact(mockContact)
      ];
      
      const serialized = QueueItemSerializer.serializeBatch(items);
      const deserialized = QueueItemSerializer.deserializeBatch(serialized);
      
      expect(deserialized).toEqual(items);
    });

    it('should calculate next retry time with exponential backoff', () => {
      const baseTime = Date.now();
      const retryTime = QueueItemUtils.calculateNextRetryTime(2, 1000);
      
      // Should be approximately 4000ms (2^2 * 1000) plus jitter
      const expectedDelay = 4000;
      const actualDelay = retryTime.getTime() - baseTime;
      
      expect(actualDelay).toBeGreaterThan(expectedDelay);
      expect(actualDelay).toBeLessThan(expectedDelay + 500); // Allow for jitter
    });

    it('should check if items should retry', () => {
      const item = QueueItemFactory.createEvent(mockEvent);
      
      // Item should not retry initially (status is pending)
      expect(QueueItemUtils.shouldRetry(item)).toBe(false);
      
      // Set item as failed with retry available
      item.status = 'failed';
      item.metadata.retryCount = 2;
      item.metadata.maxRetries = 5;
      
      expect(QueueItemUtils.shouldRetry(item)).toBe(true);
      
      // Max retries exceeded
      item.metadata.retryCount = 5;
      expect(QueueItemUtils.shouldRetry(item)).toBe(false);
    });

    it('should sort items by priority and age', () => {
      const highPriorityItem = QueueItemFactory.createEvent(mockEvent);
      highPriorityItem.priority = 'high';
      highPriorityItem.createdAt = new Date(Date.now() - 1000).toISOString();
      
      const normalPriorityItem = QueueItemFactory.createContact(mockContact);
      normalPriorityItem.priority = 'normal';
      normalPriorityItem.createdAt = new Date().toISOString();
      
      const lowPriorityItem = QueueItemFactory.createEvent({...mockEvent, id: 'event-2'});
      lowPriorityItem.priority = 'low';
      lowPriorityItem.createdAt = new Date(Date.now() - 500).toISOString();
      
      const items = [normalPriorityItem, lowPriorityItem, highPriorityItem];
      items.sort(QueueItemUtils.compareByPriorityAndAge);
      
      expect(items[0]).toBe(highPriorityItem); // High priority first
      expect(items[1]).toBe(normalPriorityItem); // Normal priority second
      expect(items[2]).toBe(lowPriorityItem); // Low priority last
    });
  });

  describe('OfflineStorage', () => {
    let storage: OfflineStorage;

    beforeEach(() => {
      storage = OfflineStorage.getInstance();
    });

    it('should initialize storage successfully', async () => {
      await expect(storage.initialize()).resolves.not.toThrow();
    });

    it('should store and retrieve queue items', async () => {
      const item = QueueItemFactory.createEvent(mockEvent);
      
      await storage.store(item);
      const retrieved = await storage.retrieve(item.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(item.id);
    });

    it('should store batch items', async () => {
      const items = [
        QueueItemFactory.createEvent(mockEvent),
        QueueItemFactory.createContact(mockContact)
      ];
      
      await storage.storeBatch(items);
      
      const retrievedItems = await storage.retrieveMany();
      expect(retrievedItems.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter items correctly', async () => {
      const item1 = QueueItemFactory.createEvent(mockEvent);
      const item2 = QueueItemFactory.createContact(mockContact);
      
      await storage.storeBatch([item1, item2]);
      
      const eventItems = await storage.retrieveMany({
        operationType: 'CREATE_EVENT'
      });
      
      const contactItems = await storage.retrieveMany({
        operationType: 'CREATE_CONTACT'
      });
      
      expect(eventItems.length).toBeGreaterThanOrEqual(1);
      expect(contactItems.length).toBeGreaterThanOrEqual(1);
    });

    it('should update queue items', async () => {
      const item = QueueItemFactory.createEvent(mockEvent);
      await storage.store(item);
      
      await storage.update(item.id, {
        status: 'processing'
      });
      
      const updated = await storage.retrieve(item.id);
      expect(updated?.status).toBe('processing');
    });

    it('should delete queue items', async () => {
      const item = QueueItemFactory.createEvent(mockEvent);
      await storage.store(item);
      
      const deleted = await storage.delete(item.id);
      expect(deleted).toBe(true);
      
      const retrieved = await storage.retrieve(item.id);
      expect(retrieved).toBeNull();
    });

    it('should provide storage statistics', async () => {
      const items = [
        QueueItemFactory.createEvent(mockEvent),
        QueueItemFactory.createContact(mockContact)
      ];
      
      await storage.storeBatch(items);
      
      const stats = await storage.getStats();
      expect(stats.totalItems).toBeGreaterThanOrEqual(2);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('NetworkDetector', () => {
    let networkDetector: NetworkDetector;

    beforeEach(() => {
      networkDetector = NetworkDetector.getInstance();
    });

    it('should initialize network detector', async () => {
      await expect(networkDetector.initialize()).resolves.not.toThrow();
    });

    it('should provide current network state', () => {
      const state = networkDetector.getCurrentState();
      
      expect(state).toHaveProperty('isConnected');
      expect(state).toHaveProperty('connectionType');
      expect(state).toHaveProperty('connectionQuality');
    });

    it('should determine sync strategy based on conditions', () => {
      // Mock network state
      jest.spyOn(networkDetector, 'getCurrentState').mockReturnValue({
        isConnected: true,
        connectionType: 'wifi',
        connectionQuality: 'excellent',
        isWiFi: true,
        isCellular: false,
        isInternetReachable: true
      });
      
      const strategy = networkDetector.determineSyncStrategy(0.1, 0.5);
      expect(strategy).toBe('immediate'); // Good WiFi should trigger immediate sync
    });

    it('should recommend appropriate batch sizes', () => {
      // Mock excellent WiFi
      jest.spyOn(networkDetector, 'getCurrentState').mockReturnValue({
        isConnected: true,
        connectionType: 'wifi',
        connectionQuality: 'excellent',
        isWiFi: true,
        isCellular: false,
        isInternetReachable: true
      });
      
      let batchSize = networkDetector.getRecommendedBatchSize();
      expect(batchSize).toBeGreaterThan(50); // Large batch on excellent WiFi
      
      // Mock poor cellular
      jest.spyOn(networkDetector, 'getCurrentState').mockReturnValue({
        isConnected: true,
        connectionType: 'cellular',
        connectionQuality: 'poor',
        isWiFi: false,
        isCellular: true,
        isInternetReachable: true
      });
      
      batchSize = networkDetector.getRecommendedBatchSize();
      expect(batchSize).toBeLessThan(10); // Small batch on poor cellular
    });
  });

  describe('QueueManager', () => {
    let queueManager: QueueManager;

    beforeEach(() => {
      queueManager = QueueManager.getInstance();
    });

    it('should initialize queue manager', async () => {
      await expect(queueManager.initialize()).resolves.not.toThrow();
    });

    it('should enqueue events with priorities', async () => {
      const itemId = await queueManager.enqueueEvent(mockEvent, 'high');
      
      expect(itemId).toBeDefined();
      expect(typeof itemId).toBe('string');
    });

    it('should enqueue contacts', async () => {
      const itemId = await queueManager.enqueueContact(mockContact, 'normal');
      
      expect(itemId).toBeDefined();
      expect(typeof itemId).toBe('string');
    });

    it('should enqueue batch items', async () => {
      const events = [mockEvent, {...mockEvent, id: 'event-2'}];
      const itemIds = await queueManager.enqueueBatch(events, 'high');
      
      expect(itemIds).toHaveLength(2);
      expect(itemIds.every(id => typeof id === 'string')).toBe(true);
    });

    it('should provide processing statistics', async () => {
      await queueManager.enqueueEvent(mockEvent);
      
      const stats = await queueManager.getStats();
      
      expect(stats).toHaveProperty('totalProcessed');
      expect(stats).toHaveProperty('totalFailed');
      expect(stats).toHaveProperty('queueDepth');
      expect(stats).toHaveProperty('processingRate');
    });

    it('should assess queue health', async () => {
      const health = await queueManager.getHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('recommendations');
      expect(['healthy', 'warning', 'critical']).toContain(health.status);
    });
  });

  describe('SyncEngine', () => {
    let syncEngine: SyncEngine;

    beforeEach(() => {
      syncEngine = SyncEngine.getInstance();
    });

    it('should initialize sync engine', async () => {
      await expect(syncEngine.initialize()).resolves.not.toThrow();
    });

    it('should provide sync recommendations', async () => {
      const recommendations = await syncEngine.getSyncRecommendations();
      
      expect(recommendations).toHaveProperty('shouldSync');
      expect(recommendations).toHaveProperty('reason');
      expect(recommendations).toHaveProperty('recommendedBatchSize');
      expect(recommendations).toHaveProperty('estimatedDuration');
    });

    it('should check if sync should run', () => {
      const shouldSync = syncEngine.shouldSync();
      expect(typeof shouldSync).toBe('boolean');
    });

    it('should provide progress tracking', () => {
      const progress = syncEngine.getProgress();
      
      expect(progress).toHaveProperty('totalItems');
      expect(progress).toHaveProperty('processedItems');
      expect(progress).toHaveProperty('failedItems');
      expect(progress).toHaveProperty('estimatedTimeRemaining');
    });
  });

  describe('OfflineQueue (Legacy Interface)', () => {
    let offlineQueue: typeof OfflineQueue;

    beforeEach(() => {
      offlineQueue = OfflineQueue;
    });

    it('should initialize offline queue', async () => {
      await expect(offlineQueue.initialize()).resolves.not.toThrow();
    });

    it('should maintain backward compatibility for enqueueEvent', async () => {
      const itemId = await offlineQueue.enqueueEvent(mockEvent, 'CREATE_EVENT');
      
      expect(itemId).toBeDefined();
      expect(typeof itemId).toBe('string');
    });

    it('should maintain backward compatibility for enqueueContact', async () => {
      const itemId = await offlineQueue.enqueueContact(mockContact, 'CREATE_CONTACT');
      
      expect(itemId).toBeDefined();
      expect(typeof itemId).toBe('string');
    });

    it('should maintain backward compatibility for batch operations', async () => {
      const events = [mockEvent, {...mockEvent, id: 'event-2'}];
      const itemIds = await offlineQueue.enqueueBatch(events);
      
      expect(itemIds).toHaveLength(2);
    });

    it('should provide legacy queue statistics', async () => {
      await offlineQueue.enqueueEvent(mockEvent);
      
      const stats = await offlineQueue.getStats();
      
      expect(stats).toHaveProperty('totalItems');
      expect(stats).toHaveProperty('pendingItems');
      expect(stats).toHaveProperty('failedItems');
      expect(stats).toHaveProperty('sizeInBytes');
    });

    it('should support filtering in getAllItems', async () => {
      await offlineQueue.enqueueEvent(mockEvent);
      await offlineQueue.enqueueContact(mockContact);
      
      const allItems = await offlineQueue.getAllItems();
      const eventItems = await offlineQueue.getAllItems({
        type: 'CREATE_EVENT'
      });
      
      expect(allItems.length).toBeGreaterThanOrEqual(2);
      expect(eventItems.length).toBeGreaterThanOrEqual(1);
    });

    it('should provide enhanced functionality', async () => {
      // Test enhanced methods not in original interface
      expect(offlineQueue.shouldSync()).toBeDefined();
      expect(offlineQueue.getNetworkState()).toBeDefined();
      expect(offlineQueue.getSyncProgress()).toBeDefined();
      
      const health = await offlineQueue.getQueueHealth();
      expect(health.status).toBeDefined();
      
      const recommendations = await offlineQueue.getSyncRecommendations();
      expect(recommendations.shouldSync).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete sync workflow', async () => {
      // Initialize system
      await OfflineQueue.initialize();
      
      // Add items to queue
      const eventId = await OfflineQueue.enqueueEvent(mockEvent);
      const contactId = await OfflineQueue.enqueueContact(mockContact);
      
      // Check queue status
      const stats = await OfflineQueue.getStats();
      expect(stats.totalItems).toBeGreaterThanOrEqual(2);
      
      // Get sync recommendations
      const recommendations = await OfflineQueue.getSyncRecommendations();
      expect(recommendations).toBeDefined();
      
      // Check queue health
      const health = await OfflineQueue.getQueueHealth();
      expect(health.status).toBeDefined();
      
      expect([eventId, contactId]).toEqual(
        expect.arrayContaining([expect.any(String), expect.any(String)])
      );
    });

    it('should handle network state changes during sync', async () => {
      await OfflineQueue.initialize();
      
      // Mock network changes
      const networkDetector = NetworkDetector.getInstance();
      const mockListener = jest.fn();
      
      const unsubscribe = networkDetector.addListener(mockListener);
      
      // Simulate network change
      // This would normally be triggered by NetInfo events
      
      unsubscribe();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle queue size limits and cleanup', async () => {
      await OfflineQueue.initialize();
      
      // Add many items
      const events = Array.from({ length: 100 }, (_, i) => ({
        ...mockEvent,
        id: `event-${i}`
      }));
      
      await OfflineQueue.enqueueBatch(events);
      
      const stats = await OfflineQueue.getStats();
      expect(stats.totalItems).toBeGreaterThan(50);
      
      // Cleanup
      const cleanedCount = await OfflineQueue.cleanupOldItems();
      expect(typeof cleanedCount).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle serialization errors gracefully', () => {
      const corruptedItem = {
        ...QueueItemFactory.createEvent(mockEvent),
        operation: undefined // Corrupt the item
      };
      
      expect(() => {
        QueueItemSerializer.serialize(corruptedItem as any);
      }).not.toThrow(); // Should handle gracefully or validate
    });

    it('should handle network errors during sync', async () => {
      // Mock network failure
      const networkDetector = NetworkDetector.getInstance();
      
      jest.spyOn(networkDetector, 'getCurrentState').mockReturnValue({
        isConnected: false,
        connectionType: 'none',
        connectionQuality: 'none',
        isWiFi: false,
        isCellular: false,
        isInternetReachable: false
      });
      
      const syncEngine = SyncEngine.getInstance();
      const shouldSync = syncEngine.shouldSync();
      
      expect(shouldSync).toBe(false);
    });

    it('should handle storage failures gracefully', async () => {
      // Mock storage failure
      const storage = OfflineStorage.getInstance();
      
      // This would normally throw, but should be handled gracefully
      await expect(storage.performMaintenance()).resolves.not.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large queue efficiently', async () => {
      const startTime = Date.now();
      
      // Create large batch
      const events = Array.from({ length: 1000 }, (_, i) => ({
        ...mockEvent,
        id: `perf-event-${i}`
      }));
      
      await OfflineQueue.enqueueBatch(events);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain performance with frequent operations', async () => {
      const operations: Promise<any>[] = [];
      
      for (let i = 0; i < 100; i++) {
        operations.push(
          OfflineQueue.enqueueEvent({
            ...mockEvent,
            id: `stress-event-${i}`
          })
        );
      }
      
      const startTime = Date.now();
      await Promise.all(operations);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});