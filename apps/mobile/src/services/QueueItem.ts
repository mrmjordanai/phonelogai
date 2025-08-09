import { Event, Contact, SyncHealth } from '@phonelogai/types';

export type QueuePriority = 'high' | 'normal' | 'low';
export type QueueStatus = 'pending' | 'processing' | 'failed' | 'completed';

export interface QueueItemMetadata {
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  lastError?: string;
  processingStartedAt?: string;
  estimatedSize: number; // bytes
  compressionRatio?: number;
  encrypted: boolean;
}

export interface QueueConflictKey {
  line_id: string;
  ts_tolerance_ms: number; // ±1 second default
  number: string;
  direction: 'inbound' | 'outbound';
  duration_tolerance_s?: number; // for calls only
}

export interface QueueItemBase {
  id: string; // UUID
  userId: string;
  priority: QueuePriority;
  status: QueueStatus;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  metadata: QueueItemMetadata;
  conflictKey?: QueueConflictKey; // for duplicate detection
}

// Specific operation types
export interface CreateEventOperation {
  type: 'CREATE_EVENT';
  payload: Event;
}

export interface UpdateEventOperation {
  type: 'UPDATE_EVENT';
  payload: Event;
  originalEventId: string;
}

export interface DeleteEventOperation {
  type: 'DELETE_EVENT';
  payload: { eventId: string };
}

export interface CreateContactOperation {
  type: 'CREATE_CONTACT';
  payload: Contact;
}

export interface UpdateContactOperation {
  type: 'UPDATE_CONTACT';
  payload: Contact;
  originalContactId: string;
}

export interface SyncHealthOperation {
  type: 'UPDATE_SYNC_HEALTH';
  payload: SyncHealth;
}

export type QueueOperation = 
  | CreateEventOperation
  | UpdateEventOperation
  | DeleteEventOperation
  | CreateContactOperation
  | UpdateContactOperation
  | SyncHealthOperation;

export interface QueueItem extends QueueItemBase {
  operation: QueueOperation;
}

export class QueueItemBuilder {
  private item: Partial<QueueItem> = {};

  constructor(operation: QueueOperation, userId: string) {
    const now = new Date().toISOString();
    
    this.item = {
      id: this.generateUUID(),
      userId,
      operation,
      priority: this.determinePriority(operation),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      metadata: {
        retryCount: 0,
        maxRetries: 5,
        estimatedSize: this.estimateSize(operation),
        encrypted: this.shouldEncrypt(operation),
      }
    };
  }

  withPriority(priority: QueuePriority): QueueItemBuilder {
    this.item.priority = priority;
    return this;
  }

  withConflictKey(conflictKey: QueueConflictKey): QueueItemBuilder {
    this.item.conflictKey = conflictKey;
    return this;
  }

  withMaxRetries(maxRetries: number): QueueItemBuilder {
    if (this.item.metadata) {
      this.item.metadata.maxRetries = maxRetries;
    }
    return this;
  }

  build(): QueueItem {
    if (!this.isValid()) {
      throw new Error('Invalid queue item configuration');
    }
    return this.item as QueueItem;
  }

  private generateUUID(): string {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private determinePriority(operation: QueueOperation): QueuePriority {
    switch (operation.type) {
      case 'CREATE_EVENT':
      case 'UPDATE_EVENT':
      case 'DELETE_EVENT':
        return 'high'; // Events are high priority
      case 'CREATE_CONTACT':
      case 'UPDATE_CONTACT':
        return 'normal'; // Contacts are normal priority
      case 'UPDATE_SYNC_HEALTH':
        return 'low'; // Sync health is low priority
      default:
        return 'normal';
    }
  }

  private estimateSize(operation: QueueOperation): number {
    // Rough size estimation in bytes
    const baseSize = 200; // Base object overhead
    const payloadSize = JSON.stringify(operation.payload).length;
    return baseSize + payloadSize;
  }

  private shouldEncrypt(operation: QueueOperation): boolean {
    // Encrypt operations with sensitive data
    switch (operation.type) {
      case 'CREATE_EVENT':
      case 'UPDATE_EVENT':
        return true; // Events contain phone numbers and content
      case 'CREATE_CONTACT':
      case 'UPDATE_CONTACT':
        return true; // Contacts contain personal information
      default:
        return false;
    }
  }

  private isValid(): boolean {
    return !!(
      this.item.id &&
      this.item.userId &&
      this.item.operation &&
      this.item.priority &&
      this.item.status &&
      this.item.createdAt &&
      this.item.updatedAt &&
      this.item.metadata
    );
  }
}

// Factory functions for common operations
export class QueueItemFactory {
  static createEvent(event: Event): QueueItem {
    const operation: CreateEventOperation = {
      type: 'CREATE_EVENT',
      payload: event
    };

    const conflictKey: QueueConflictKey = {
      line_id: event.line_id,
      ts_tolerance_ms: 1000, // ±1 second
      number: event.number,
      direction: event.direction,
      duration_tolerance_s: event.type === 'call' ? 1 : undefined
    };

    return new QueueItemBuilder(operation, event.user_id)
      .withConflictKey(conflictKey)
      .build();
  }

  static updateEvent(event: Event, originalEventId: string): QueueItem {
    const operation: UpdateEventOperation = {
      type: 'UPDATE_EVENT',
      payload: event,
      originalEventId
    };

    const conflictKey: QueueConflictKey = {
      line_id: event.line_id,
      ts_tolerance_ms: 1000,
      number: event.number,
      direction: event.direction,
      duration_tolerance_s: event.type === 'call' ? 1 : undefined
    };

    return new QueueItemBuilder(operation, event.user_id)
      .withConflictKey(conflictKey)
      .build();
  }

  static deleteEvent(eventId: string, userId: string): QueueItem {
    const operation: DeleteEventOperation = {
      type: 'DELETE_EVENT',
      payload: { eventId }
    };

    return new QueueItemBuilder(operation, userId)
      .withPriority('high')
      .build();
  }

  static createContact(contact: Contact): QueueItem {
    const operation: CreateContactOperation = {
      type: 'CREATE_CONTACT',
      payload: contact
    };

    return new QueueItemBuilder(operation, contact.user_id)
      .build();
  }

  static updateContact(contact: Contact, originalContactId: string): QueueItem {
    const operation: UpdateContactOperation = {
      type: 'UPDATE_CONTACT',
      payload: contact,
      originalContactId
    };

    return new QueueItemBuilder(operation, contact.user_id)
      .build();
  }

  static updateSyncHealth(syncHealth: SyncHealth): QueueItem {
    const operation: SyncHealthOperation = {
      type: 'UPDATE_SYNC_HEALTH',
      payload: syncHealth
    };

    return new QueueItemBuilder(operation, syncHealth.user_id)
      .build();
  }
}

// Serialization utilities
export class QueueItemSerializer {
  static serialize(item: QueueItem): string {
    return JSON.stringify(item);
  }

  static deserialize(data: string): QueueItem {
    const parsed = JSON.parse(data);
    
    // Validate required fields
    if (!parsed.id || !parsed.userId || !parsed.operation) {
      throw new Error('Invalid serialized queue item');
    }

    return parsed as QueueItem;
  }

  static serializeBatch(items: QueueItem[]): string {
    return JSON.stringify(items);
  }

  static deserializeBatch(data: string): QueueItem[] {
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid serialized queue item batch');
    }

    return parsed.map(item => {
      if (!item.id || !item.userId || !item.operation) {
        throw new Error('Invalid queue item in batch');
      }
      return item as QueueItem;
    });
  }
}

// Queue item utilities
export class QueueItemUtils {
  static isExpired(item: QueueItem, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): boolean {
    const age = Date.now() - new Date(item.createdAt).getTime();
    return age > maxAgeMs;
  }

  static shouldRetry(item: QueueItem): boolean {
    return item.metadata.retryCount < item.metadata.maxRetries &&
           item.status === 'failed' &&
           (!item.metadata.nextRetryAt || new Date(item.metadata.nextRetryAt) <= new Date());
  }

  static calculateNextRetryTime(retryCount: number, baseDelayMs: number = 1000): Date {
    // Exponential backoff with jitter
    const delay = baseDelayMs * Math.pow(2, retryCount);
    const jitter = Math.random() * 0.1 * delay; // 10% jitter
    return new Date(Date.now() + delay + jitter);
  }

  static getPriorityWeight(priority: QueuePriority): number {
    switch (priority) {
      case 'high': return 0;
      case 'normal': return 1;
      case 'low': return 2;
      default: return 1;
    }
  }

  static compareByPriorityAndAge(a: QueueItem, b: QueueItem): number {
    // First sort by priority
    const priorityDiff = QueueItemUtils.getPriorityWeight(a.priority) - QueueItemUtils.getPriorityWeight(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    
    // Then by creation time (older first)
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  static estimateBatchSize(items: QueueItem[]): number {
    return items.reduce((total, item) => total + item.metadata.estimatedSize, 0);
  }

  static getConflictKeyString(conflictKey: QueueConflictKey): string {
    return `${conflictKey.line_id}:${conflictKey.number}:${conflictKey.direction}`;
  }
}