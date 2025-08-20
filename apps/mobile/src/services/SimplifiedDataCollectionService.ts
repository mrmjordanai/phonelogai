import { Contact } from '@phonelogai/types';
import * as Contacts from 'expo-contacts';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { OfflineQueue } from './OfflineQueue';
import { SyncService } from './SyncService';

export interface DataCollectionCapabilities {
  canAccessContacts: boolean;
  canImportFiles: boolean;
  canManualEntry: boolean;
  platformSupport: {
    contacts: boolean;
    fileImport: boolean;
    deviceInfo: boolean;
  };
}

export interface CollectionOptions {
  userId: string;
  lineId: string;
  includeContacts?: boolean;
  autoSync?: boolean;
}

export interface CollectionResult {
  success: boolean;
  contacts: Contact[];
  stats: {
    contactsCollected: number;
    errorsEncountered: number;
  };
  errors: string[];
  duration: number;
  queuedForSync: boolean;
}

export interface CollectionProgress {
  phase: 'initializing' | 'permissions' | 'collecting_contacts' | 'queuing' | 'complete';
  progress: number; // 0-100
  message: string;
  itemsProcessed: number;
  itemsTotal: number;
}

class SimplifiedDataCollectionServiceImpl {
  private static instance: SimplifiedDataCollectionServiceImpl;
  private collectionInProgress = false;
  private progressListeners: Array<(_progress: CollectionProgress) => void> = [];

  private constructor() {}

  public static getInstance(): SimplifiedDataCollectionServiceImpl {
    if (!SimplifiedDataCollectionServiceImpl.instance) {
      SimplifiedDataCollectionServiceImpl.instance = new SimplifiedDataCollectionServiceImpl();
    }
    return SimplifiedDataCollectionServiceImpl.instance;
  }

  /**
   * Initialize simplified data collection service
   */
  public async initialize(): Promise<void> {
    try {
      await OfflineQueue.initialize();
      await SyncService.initialize();
      console.log('SimplifiedDataCollectionService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SimplifiedDataCollectionService:', error);
      throw new Error(`SimplifiedDataCollectionService initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get platform capabilities for data collection
   */
  public async getCapabilities(): Promise<DataCollectionCapabilities> {
    // Check contact permissions
    let canAccessContacts = false;
    try {
      const { status } = await Contacts.getPermissionsAsync();
      canAccessContacts = status === 'granted';
    } catch (error) {
      console.log('Contacts permission check failed:', error);
    }

    return {
      canAccessContacts,
      canImportFiles: true, // expo-document-picker works on all platforms
      canManualEntry: true, // Always available
      platformSupport: {
        contacts: Platform.OS === 'android' || Platform.OS === 'ios',
        fileImport: true,
        deviceInfo: true,
      },
    };
  }

  /**
   * Request necessary permissions for available data collection
   */
  public async requestPermissions(): Promise<{
    granted: boolean;
    permissions: {
      contacts: boolean;
    };
  }> {
    let contactsGranted = false;

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      contactsGranted = status === 'granted';
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
    }

    return {
      granted: contactsGranted,
      permissions: {
        contacts: contactsGranted,
      },
    };
  }

  /**
   * Collect available data using Expo APIs
   */
  public async collectData(options: CollectionOptions): Promise<CollectionResult> {
    if (this.collectionInProgress) {
      throw new Error('Data collection already in progress');
    }

    const startTime = Date.now();
    this.collectionInProgress = true;

    const result: CollectionResult = {
      success: false,
      contacts: [],
      stats: {
        contactsCollected: 0,
        errorsEncountered: 0,
      },
      errors: [],
      duration: 0,
      queuedForSync: false,
    };

    try {
      this.notifyProgress({
        phase: 'initializing',
        progress: 0,
        message: 'Initializing data collection...',
        itemsProcessed: 0,
        itemsTotal: 0,
      });

      // Check permissions
      this.notifyProgress({
        phase: 'permissions',
        progress: 20,
        message: 'Checking permissions...',
        itemsProcessed: 0,
        itemsTotal: 0,
      });

      const capabilities = await this.getCapabilities();

      // Collect contacts if available and requested
      if (options.includeContacts !== false && capabilities.canAccessContacts) {
        this.notifyProgress({
          phase: 'collecting_contacts',
          progress: 40,
          message: 'Collecting contacts...',
          itemsProcessed: 0,
          itemsTotal: 0,
        });

        const contacts = await this.collectContacts(options);
        result.contacts = contacts;
        result.stats.contactsCollected = contacts.length;
      }

      // Queue for sync if data was collected
      if (options.autoSync !== false && result.contacts.length > 0) {
        this.notifyProgress({
          phase: 'queuing',
          progress: 80,
          message: 'Queuing data for sync...',
          itemsProcessed: 0,
          itemsTotal: result.contacts.length,
        });

        await this.queueDataForSync(result.contacts);
        result.queuedForSync = true;

        // Start sync in background
        SyncService.startSync({
          strategy: 'wifi_preferred',
        }).catch(error => {
          console.error('Background sync failed:', error);
        });
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      this.notifyProgress({
        phase: 'complete',
        progress: 100,
        message: `Collection complete: ${result.contacts.length} contacts processed`,
        itemsProcessed: result.contacts.length,
        itemsTotal: result.contacts.length,
      });

    } catch (error) {
      console.error('Data collection failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage || 'Unknown collection error');
      result.success = false;
      result.duration = Date.now() - startTime;
      result.stats.errorsEncountered = 1;

      this.notifyProgress({
        phase: 'complete',
        progress: 100,
        message: `Collection failed: ${errorMessage}`,
        itemsProcessed: 0,
        itemsTotal: 0,
      });
    } finally {
      this.collectionInProgress = false;
    }

    return result;
  }

  /**
   * Get collection statistics for available data
   */
  public async getCollectionStats(): Promise<{
    estimatedContactCount: number;
    canCollectContacts: boolean;
    deviceInfo: {
      platform: string;
      modelName?: string;
      osVersion?: string;
    };
  }> {
    const stats = {
      estimatedContactCount: 0,
      canCollectContacts: false,
      deviceInfo: {
        platform: Platform.OS,
        modelName: Device.modelName ?? undefined,
        osVersion: Device.osVersion ?? undefined,
      },
    };

    try {
      const capabilities = await this.getCapabilities();
      stats.canCollectContacts = capabilities.canAccessContacts;

      if (stats.canCollectContacts) {
        // Get contact count without fetching all contacts
        const { data } = await Contacts.getContactsAsync({
          pageSize: 0, // Just get count
        });
        stats.estimatedContactCount = data.length || 0;
      }
    } catch (error) {
      console.error('Failed to get collection stats:', error);
    }

    return stats;
  }

  /**
   * Subscribe to collection progress updates
   */
  public onProgress(callback: (_progress: CollectionProgress) => void): () => void {
    this.progressListeners.push(callback);
    
    return () => {
      const index = this.progressListeners.indexOf(callback);
      if (index !== -1) {
        this.progressListeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if collection is currently in progress
   */
  public get isCollecting(): boolean {
    return this.collectionInProgress;
  }

  /**
   * Get data collection guidance for the user
   */
  public getDataCollectionGuidance(): {
    primaryMethod: string;
    secondaryMethods: string[];
    platformSpecific: {
      android: string[];
      ios: string[];
    };
  } {
    return {
      primaryMethod: 'File Import - Upload carrier export files (CSV, PDF, Excel)',
      secondaryMethods: [
        'Manual Data Entry - Enter key call/SMS information manually',
        'Contact Import - Import contact list for enhanced insights',
      ],
      platformSpecific: {
        android: [
          'Export call logs: Settings > Apps > Phone > Storage > Export',
          'Export SMS: Use SMS backup apps from Play Store',
          'Carrier exports: Download from your carrier\'s website or app',
        ],
        ios: [
          'Download carrier files from your provider\'s website',
          'Request call detail records (CDR) from your carrier',
          'Use carrier mobile apps to export data',
        ],
      },
    };
  }

  /**
   * Collect contacts using Expo Contacts API
   */
  private async collectContacts(options: CollectionOptions): Promise<Contact[]> {
    const contacts: Contact[] = [];

    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });

      for (const contact of data) {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          for (const phoneNumber of contact.phoneNumbers) {
            if (phoneNumber.number) {
              const normalizedContact: Contact = {
                id: `contact_${contact.id}_${phoneNumber.id || 0}`,
                user_id: options.userId,
                line_id: options.lineId,
                number: this.normalizePhoneNumber(phoneNumber.number),
                name: contact.name || 'Unknown Contact',
                email: contact.emails?.[0]?.email,
                tags: [],
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString(),
                total_calls: 0,
                total_sms: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };

              contacts.push(normalizedContact);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error collecting contacts:', error);
      throw new Error(`Contact collection failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return contacts;
  }

  /**
   * Queue contacts for sync
   */
  private async queueDataForSync(contacts: Contact[]): Promise<void> {
    try {
      for (const contact of contacts) {
        await OfflineQueue.enqueueContact(contact, 'CREATE_CONTACT');
      }

      console.log(`Queued ${contacts.length} contacts for sync`);
    } catch (error) {
      console.error('Failed to queue data for sync:', error);
      throw new Error(`Failed to queue data for sync: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalize phone number format
   */
  private normalizePhoneNumber(number: string): string {
    if (!number) return '';
    
    // Remove common formatting characters
    const normalized = number.replace(/[\s\-()+]/g, '');
    
    // Handle international format
    if (normalized.startsWith('1') && normalized.length === 11) {
      // US/Canada number with country code
      return normalized;
    } else if (normalized.length === 10) {
      // US/Canada number without country code
      return '1' + normalized;
    }
    
    return normalized;
  }

  /**
   * Notify progress listeners
   */
  private notifyProgress(progress: CollectionProgress): void {
    for (const listener of this.progressListeners) {
      try {
        listener(progress);
      } catch (error) {
        console.error('Progress listener error:', error);
      }
    }
  }
}

export const SimplifiedDataCollectionService = SimplifiedDataCollectionServiceImpl.getInstance();