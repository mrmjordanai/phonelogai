import { Event, Contact } from '@phonelogai/types';
import { Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { OfflineQueue } from './OfflineQueue';
import { SyncService } from './SyncService';

export interface CollectionOptions {
  userId: string;
  lineId: string;
  includeContacts?: boolean;
  autoSync?: boolean;
  source?: 'contacts' | 'file_import' | 'manual_entry';
}

export interface CollectionResult {
  success: boolean;
  events: Event[];
  contacts: Contact[];
  stats: {
    eventsCollected: number;
    contactsCollected: number;
    errorsEncountered: number;
  };
  errors: string[];
  duration: number;
  queuedForSync: boolean;
}

export interface CollectionProgress {
  phase: 'initializing' | 'permissions' | 'collecting' | 'processing' | 'queuing' | 'complete';
  progress: number; // 0-100
  message: string;
  itemsProcessed: number;
  itemsTotal: number;
}

export interface DataCollectionCapabilities {
  canAccessContacts: boolean;
  canImportFiles: boolean;
  canManualEntry: boolean;
  supportedFileTypes: string[];
  platformFeatures: {
    contacts: boolean;
    fileSystem: boolean;
    documentPicker: boolean;
  };
}

class DataCollectionServiceImpl {
  private static instance: DataCollectionServiceImpl;
  private collectionInProgress = false;
  private progressListeners: Array<(_progress: CollectionProgress) => void> = [];

  private constructor() {}

  public static getInstance(): DataCollectionServiceImpl {
    if (!DataCollectionServiceImpl.instance) {
      DataCollectionServiceImpl.instance = new DataCollectionServiceImpl();
    }
    return DataCollectionServiceImpl.instance;
  }

  /**
   * Initialize data collection service with available Expo APIs
   */
  public async initialize(): Promise<void> {
    try {
      await OfflineQueue.initialize();
      await SyncService.initialize();
      console.log('DataCollectionService initialized with Expo APIs');
    } catch (error) {
      console.error('Failed to initialize DataCollectionService:', error);
      throw new Error(`DataCollectionService initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get available data collection capabilities
   */
  public async getCapabilities(): Promise<DataCollectionCapabilities> {
    let canAccessContacts = false;

    try {
      const { status } = await Contacts.getPermissionsAsync();
      canAccessContacts = status === 'granted';
    } catch (error) {
      console.warn('Contacts permission check failed:', error);
    }

    return {
      canAccessContacts,
      canImportFiles: true, // Always available with expo-document-picker
      canManualEntry: true, // Always available
      supportedFileTypes: ['text/csv', 'application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      platformFeatures: {
        contacts: Platform.OS === 'android' || Platform.OS === 'ios',
        fileSystem: true,
        documentPicker: true,
      },
    };
  }

  /**
   * Request necessary permissions for data collection
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
   * Check if data collection is available
   */
  public async canCollectData(): Promise<{
    available: boolean;
    reasons: string[];
    alternatives: string[];
  }> {
    const reasons: string[] = [];
    const alternatives: string[] = [];
    const capabilities = await this.getCapabilities();

    // Always available through file import
    alternatives.push('Import carrier data files (CSV, PDF, Excel)');
    alternatives.push('Manual data entry for key information');

    if (capabilities.canAccessContacts) {
      alternatives.push('Import device contacts for enhanced insights');
    } else {
      reasons.push('Contact access not available - request permissions to enable');
    }

    return {
      available: true, // Always available through file import and manual entry
      reasons,
      alternatives,
    };
  }

  /**
   * Collect data using available methods
   */
  public async collectData(options: CollectionOptions): Promise<CollectionResult> {
    if (this.collectionInProgress) {
      throw new Error('Data collection already in progress');
    }

    const startTime = Date.now();
    this.collectionInProgress = true;

    const result: CollectionResult = {
      success: false,
      events: [],
      contacts: [],
      stats: {
        eventsCollected: 0,
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
        message: 'Starting data collection...',
        itemsProcessed: 0,
        itemsTotal: 0,
      });

      // Handle different collection sources
      switch (options.source) {
        case 'contacts':
          await this.collectContactsData(options, result);
          break;
        case 'file_import':
          await this.collectFileImportData(options, result);
          break;
        case 'manual_entry':
          // Manual entry is handled through UI forms
          this.notifyProgress({
            phase: 'complete',
            progress: 100,
            message: 'Manual entry mode - use forms to add data',
            itemsProcessed: 0,
            itemsTotal: 0,
          });
          break;
        default:
          // Try contacts if available
          if (options.includeContacts !== false) {
            await this.collectContactsData(options, result);
          }
          break;
      }

      // Queue for sync if data was collected
      if (options.autoSync !== false && (result.events.length > 0 || result.contacts.length > 0)) {
        await this.queueForSync(result, options);
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      this.notifyProgress({
        phase: 'complete',
        progress: 100,
        message: `Collection complete: ${result.events.length} events, ${result.contacts.length} contacts`,
        itemsProcessed: result.events.length + result.contacts.length,
        itemsTotal: result.events.length + result.contacts.length,
      });

    } catch (error) {
      console.error('Data collection failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown collection error');
      result.success = false;
      result.duration = Date.now() - startTime;
      result.stats.errorsEncountered += 1;

      this.notifyProgress({
        phase: 'complete',
        progress: 100,
        message: `Collection failed: ${error instanceof Error ? error.message : String(error)}`,
        itemsProcessed: 0,
        itemsTotal: 0,
      });
    } finally {
      this.collectionInProgress = false;
    }

    return result;
  }

  /**
   * Import files using document picker
   */
  public async importFiles(options: { userId: string; lineId: string }): Promise<{
    success: boolean;
    filesProcessed: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      filesProcessed: 0,
      errors: [] as string[],
    };

    try {
      const docResult = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/pdf', '*/*'], // Allow common file types
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!docResult.canceled && docResult.assets) {
        this.notifyProgress({
          phase: 'processing',
          progress: 50,
          message: `Processing ${docResult.assets.length} files...`,
          itemsProcessed: 0,
          itemsTotal: docResult.assets.length,
        });

        for (const asset of docResult.assets) {
          try {
            await this.processImportedFile(asset, options);
            result.filesProcessed += 1;
          } catch (error) {
            console.error('Error processing file:', asset.name, error);
            result.errors.push(`Failed to process ${asset.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        result.success = result.filesProcessed > 0;
      }
    } catch (error) {
      console.error('File import failed:', error);
      result.errors.push(`File import failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Get user guidance for data collection
   */
  public getDataCollectionGuidance(): {
    primaryMethods: string[];
    platformSpecific: Record<string, string[]>;
    fileFormats: string[];
  } {
    return {
      primaryMethods: [
        'Import carrier data files (CSV, PDF, Excel)',
        'Manual data entry through app forms',
        'Import device contacts (if permissions granted)',
      ],
      platformSpecific: {
        android: [
          'Export call logs: Phone app > Settings > Call history > Export',
          'Download carrier files from provider website or app',
          'Use SMS backup apps for message history',
        ],
        ios: [
          'Download call detail records (CDR) from carrier website',
          'Use carrier mobile apps to export data',
          'Request data export from your phone provider',
        ],
      },
      fileFormats: [
        'CSV files from carrier exports',
        'PDF call detail records',
        'Excel spreadsheets with call/SMS data',
      ],
    };
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
   * Collect contacts data using Expo Contacts API
   */
  private async collectContactsData(options: CollectionOptions, result: CollectionResult): Promise<void> {
    this.notifyProgress({
      phase: 'permissions',
      progress: 20,
      message: 'Checking contacts permissions...',
      itemsProcessed: 0,
      itemsTotal: 0,
    });

    const { status } = await Contacts.getPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Contacts permission required for contact collection');
    }

    this.notifyProgress({
      phase: 'collecting',
      progress: 40,
      message: 'Collecting contacts...',
      itemsProcessed: 0,
      itemsTotal: 0,
    });

    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.Name,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
      ],
    });

    this.notifyProgress({
      phase: 'processing',
      progress: 70,
      message: 'Processing contacts...',
      itemsProcessed: 0,
      itemsTotal: data.length,
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

            result.contacts.push(normalizedContact);
          }
        }
      }
    }

    result.stats.contactsCollected = result.contacts.length;
  }

  /**
   * Handle file import data collection
   */
  private async collectFileImportData(options: CollectionOptions, result: CollectionResult): Promise<void> {
    this.notifyProgress({
      phase: 'collecting',
      progress: 30,
      message: 'Opening file picker...',
      itemsProcessed: 0,
      itemsTotal: 0,
    });

    const importResult = await this.importFiles({
      userId: options.userId,
      lineId: options.lineId,
    });

    if (!importResult.success) {
      result.errors.push(...importResult.errors);
      throw new Error('File import failed');
    }

    // File processing would add events/contacts to result
    // This is a placeholder for actual file parsing logic
    result.stats.eventsCollected = importResult.filesProcessed;
  }

  /**
   * Process an imported file
   */
  private async processImportedFile(
    asset: DocumentPicker.DocumentPickerAsset,
    _options: { userId: string; lineId: string }
  ): Promise<void> {
    // Basic file validation
    if (!asset.uri) {
      throw new Error('Invalid file URI');
    }

    const fileInfo = await FileSystem.getInfoAsync(asset.uri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    // Placeholder for actual file parsing
    // Different file types would be processed differently:
    // - CSV: Parse rows and columns
    // - PDF: Extract text and parse call records
    // - Excel: Read spreadsheet data
    
    console.log('Processing file:', asset.name, 'Type:', asset.mimeType, 'Size:', fileInfo.size);
    
    // For now, just log the file info
    // Real implementation would parse the file and extract events/contacts
  }

  /**
   * Queue data for sync
   */
  private async queueForSync(result: CollectionResult, options: CollectionOptions): Promise<void> {
    this.notifyProgress({
      phase: 'queuing',
      progress: 85,
      message: 'Queuing data for sync...',
      itemsProcessed: 0,
      itemsTotal: result.events.length + result.contacts.length,
    });

    try {
      // Queue events
      if (result.events.length > 0) {
        await OfflineQueue.enqueueBatch(result.events, 'CREATE_EVENT');
      }

      // Queue contacts
      for (const contact of result.contacts) {
        await OfflineQueue.enqueueContact(contact, 'CREATE_CONTACT');
      }

      result.queuedForSync = true;

      // Start background sync
      if (options.autoSync === true) {
        SyncService.startSync({
          strategy: 'wifi_preferred',
        }).catch(error => {
          console.error('Background sync failed:', error);
        });
      }

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

export const DataCollectionService = DataCollectionServiceImpl.getInstance();