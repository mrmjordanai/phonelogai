import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { ContactsImportService, ContactImportResult } from '../../../services/ContactsImportService';
import { Contact } from '@phonelogai/types';

export interface ContactsImportState {
  isImporting: boolean;
  hasPermission: boolean;
  contactsInfo: {
    totalContacts?: number;
    contactsWithPhones?: number;
  } | null;
  lastImportResult: ContactImportResult | null;
}

export const useContactsImport = (userId?: string, lineId?: string) => {
  const [state, setState] = useState<ContactsImportState>({
    isImporting: false,
    hasPermission: false,
    contactsInfo: null,
    lastImportResult: null
  });

  /**
   * Check contacts permission and get info
   */
  const checkContactsAccess = useCallback(async () => {
    try {
      const info = await ContactsImportService.getContactsInfo();
      setState(prev => ({
        ...prev,
        hasPermission: info.hasPermission,
        contactsInfo: info.hasPermission ? {
          totalContacts: info.totalContacts,
          contactsWithPhones: info.contactsWithPhones
        } : null
      }));
      return info.hasPermission;
    } catch (error) {
      console.error('Error checking contacts access:', error);
      return false;
    }
  }, []);

  /**
   * Request contacts permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const granted = await ContactsImportService.requestContactsPermission();
      setState(prev => ({ ...prev, hasPermission: granted }));
      
      if (granted) {
        await checkContactsAccess(); // Refresh info after permission granted
      }
      
      return granted;
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    }
  }, [checkContactsAccess]);

  /**
   * Import all contacts
   */
  const importContacts = useCallback(async (): Promise<ContactImportResult | null> => {
    if (!userId) {
      Alert.alert('Error', 'User ID is required to import contacts');
      return null;
    }

    setState(prev => ({ ...prev, isImporting: true }));

    try {
      const result = await ContactsImportService.importContacts({
        userId,
        lineId
      });

      setState(prev => ({
        ...prev,
        isImporting: false,
        lastImportResult: result
      }));

      if (result.success) {
        Alert.alert(
          'Import Successful',
          `Imported ${result.contactsImported} contacts with phone numbers.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Import Failed',
          result.errors.join('\n'),
          [{ text: 'OK' }]
        );
      }

      return result;
    } catch (error) {
      setState(prev => ({ ...prev, isImporting: false }));
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Import Error', errorMessage);
      
      console.error('Contacts import error:', error);
      return null;
    }
  }, [userId, lineId]);

  /**
   * Start the full import flow (permission + import)
   */
  const startImportFlow = useCallback(async (): Promise<Contact[]> => {
    try {
      // Check/request permission first
      let hasPermission = state.hasPermission;
      if (!hasPermission) {
        hasPermission = await requestPermission();
        if (!hasPermission) {
          Alert.alert(
            'Permission Required',
            'Please grant contacts permission to import your contacts.',
            [{ text: 'OK' }]
          );
          return [];
        }
      }

      // Perform the import
      const result = await importContacts();
      return result?.contactsData || [];

    } catch (error) {
      console.error('Error in import flow:', error);
      return [];
    }
  }, [state.hasPermission, requestPermission, importContacts]);

  return {
    ...state,
    checkContactsAccess,
    requestPermission,
    importContacts,
    startImportFlow
  };
};