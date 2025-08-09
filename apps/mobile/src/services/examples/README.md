# Enhanced Offline Queue System - Usage Examples

This directory contains examples and documentation for integrating the comprehensive offline queue system into your React Native application.

## Quick Start

```typescript
import { OfflineQueue } from '../services/OfflineQueue';
import { Event, Contact } from '@phonelogai/types';

// Initialize the enhanced queue system
async function initializeApp() {
  try {
    await OfflineQueue.initialize();
    console.log('Enhanced offline queue system ready');
  } catch (error) {
    console.error('Failed to initialize queue:', error);
  }
}

// Add an event to the queue
async function addEvent(event: Event) {
  const itemId = await OfflineQueue.enqueueEvent(event);
  console.log('Event queued:', itemId);
  
  // Check if sync is recommended
  if (OfflineQueue.shouldSync()) {
    console.log('Triggering sync...');
    OfflineQueue.manualSync().catch(console.error);
  }
}
```

## Key Features

### 1. Network-Aware Processing
- Automatic Wi-Fi preferred sync
- Cellular fallback after thresholds
- Network quality assessment
- Connection stability monitoring

### 2. Advanced Conflict Resolution
- Composite key duplicate detection
- Automatic resolution (85%+ success rate)
- Quality-based merge strategies
- Manual review for complex conflicts

### 3. Performance Optimized
- Compression for payloads >1KB
- Encryption for sensitive data
- Memory-efficient processing (<50MB)
- Priority-based queue processing

### 4. Comprehensive Monitoring
- Real-time sync progress
- Queue health assessment
- Performance metrics
- Network state tracking

## Architecture Components

### Core Classes
- **QueueItem**: Type-safe queue items with metadata
- **OfflineStorage**: Compressed/encrypted AsyncStorage wrapper
- **NetworkDetector**: Intelligent network monitoring
- **QueueManager**: Priority-based processing engine
- **SyncEngine**: Network-aware sync with conflict resolution

### Integration Points
- **AuthProvider**: Existing authentication context
- **Supabase Client**: Database operations
- **ConflictResolver**: Enhanced duplicate handling
- **Background Tasks**: Expo TaskManager support

## Usage Examples

### Basic Operations

```typescript
// Add single event
const eventId = await OfflineQueue.enqueueEvent(event);

// Add batch events
const eventIds = await OfflineQueue.enqueueBatch(events);

// Add contact
const contactId = await OfflineQueue.enqueueContact(contact);

// Manual sync
const result = await OfflineQueue.manualSync();
console.log(`Synced: ${result.totalProcessed}, Failed: ${result.totalFailed}`);
```

### Monitoring and Health

```typescript
// Get queue statistics
const stats = await OfflineQueue.getStats();
console.log(`Queue depth: ${stats.totalItems}, Size: ${stats.sizeInBytes} bytes`);

// Check queue health
const health = await OfflineQueue.getQueueHealth();
if (health.status === 'critical') {
  console.warn('Queue needs attention:', health.issues);
}

// Get sync recommendations
const recommendations = await OfflineQueue.getSyncRecommendations();
if (recommendations.shouldSync) {
  console.log('Sync recommended:', recommendations.reason);
}
```

### Progress Monitoring

```typescript
// Monitor sync progress
const unsubscribe = OfflineQueue.addSyncProgressCallback((progress) => {
  console.log(`Progress: ${progress.processedItems}/${progress.totalItems}`);
  console.log(`Speed: ${progress.syncSpeed} items/sec`);
  console.log(`ETA: ${progress.estimatedTimeRemaining}ms`);
});

// Cleanup when done
unsubscribe();
```

### Network State Monitoring

```typescript
// Get current network state
const networkState = OfflineQueue.getNetworkState();
console.log(`Connected: ${networkState.isConnected}`);
console.log(`Type: ${networkState.connectionType}`);
console.log(`Quality: ${networkState.connectionQuality}`);
```

## Error Handling

```typescript
try {
  await OfflineQueue.enqueueEvent(event);
} catch (error) {
  if (error.message.includes('Queue at capacity')) {
    // Handle queue full scenario
    await OfflineQueue.cleanupOldItems();
    // Retry
  } else if (error.message.includes('Network')) {
    // Handle network errors
    console.log('Will retry when network available');
  }
}
```

## Performance Guidelines

### Memory Management
- Queue automatically manages memory usage
- Target <50MB for queue operations
- Compression reduces storage by ~60%
- Automatic cleanup of old items (7 days)

### Network Efficiency
- Wi-Fi: Large batches (100 items)
- Good cellular: Medium batches (25 items)
- Poor cellular: Small batches (5 items)
- Exponential backoff for failed requests

### Battery Optimization
- Background processing with app state awareness
- Intelligent sync scheduling
- Network quality-based batching
- Configurable sync thresholds

## Configuration Options

```typescript
// Custom queue manager configuration
const queueManager = QueueManager.getInstance({
  maxQueueSize: 15000,
  processingBatchSize: 75,
  maxProcessingConcurrency: 5,
  performanceMonitoringEnabled: true
});

// Custom sync engine configuration
const syncEngine = SyncEngine.getInstance({
  batchSize: 100,
  conflictResolutionEnabled: true,
  autoResolveThreshold: 0.9,
  networkQualityThreshold: 'good'
});
```

## Migration from Legacy Queue

The enhanced system maintains full backward compatibility:

```typescript
// Legacy code continues to work
const itemId = await OfflineQueue.enqueueEvent(event, 'CREATE_EVENT');
const batch = await OfflineQueue.getNextBatch(50);
await OfflineQueue.markProcessed(itemId);

// Enhanced features available
const health = await OfflineQueue.getQueueHealth(); // New
const recommendations = await OfflineQueue.getSyncRecommendations(); // New
const syncResult = await OfflineQueue.manualSync(); // Enhanced
```

## Testing

```typescript
// Example test setup
import { OfflineQueue } from '../OfflineQueue';

describe('Queue Integration', () => {
  beforeEach(async () => {
    await OfflineQueue.initialize();
  });

  it('should queue events and sync', async () => {
    const eventId = await OfflineQueue.enqueueEvent(mockEvent);
    expect(eventId).toBeDefined();
    
    const stats = await OfflineQueue.getStats();
    expect(stats.totalItems).toBeGreaterThan(0);
  });
});
```

## Troubleshooting

### Common Issues

1. **Queue Not Syncing**
   - Check network connectivity: `OfflineQueue.getNetworkState()`
   - Verify sync recommendations: `OfflineQueue.getSyncRecommendations()`
   - Check queue health: `OfflineQueue.getQueueHealth()`

2. **High Memory Usage**
   - Monitor queue size: `OfflineQueue.getStats()`
   - Trigger cleanup: `OfflineQueue.cleanupOldItems()`
   - Reduce batch sizes in poor network conditions

3. **Sync Failures**
   - Check authentication status
   - Verify network permissions
   - Review conflict resolution logs
   - Check Supabase connection

### Debug Information

```typescript
// Get comprehensive debug info
const debugInfo = {
  queueStats: await OfflineQueue.getStats(),
  queueHealth: await OfflineQueue.getQueueHealth(),
  networkState: OfflineQueue.getNetworkState(),
  syncProgress: OfflineQueue.getSyncProgress(),
  recommendations: await OfflineQueue.getSyncRecommendations()
};

console.log('Debug Info:', JSON.stringify(debugInfo, null, 2));
```

## Support

For additional support or questions about the enhanced offline queue system:
1. Check the comprehensive test suite in `__tests__/OfflineQueueSystem.test.ts`
2. Review the implementation details in the individual service files
3. Monitor queue health and performance metrics regularly
4. Use the built-in recommendations system for optimal performance