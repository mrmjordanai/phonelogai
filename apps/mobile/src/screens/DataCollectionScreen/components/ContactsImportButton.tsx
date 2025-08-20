import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { useContactsImport } from '../hooks/useContactsImport';
import { useAuth } from '../../../components/AuthProvider';
import { Contact } from '@phonelogai/types';

interface ContactsImportButtonProps {
  onImportComplete?: (_contacts: Contact[]) => void;
}

export function ContactsImportButton({ onImportComplete }: ContactsImportButtonProps) {
  const { user } = useAuth();
  const {
    isImporting,
    hasPermission,
    contactsInfo,
    checkContactsAccess,
    startImportFlow
  } = useContactsImport(user?.id);

  useEffect(() => {
    checkContactsAccess();
  }, [checkContactsAccess]);

  const handleImport = async () => {
    const contacts = await startImportFlow();
    if (contacts.length > 0 && onImportComplete) {
      onImportComplete(contacts);
    }
  };

  const getStatusText = () => {
    if (!hasPermission) {
      return 'Tap to grant permission and import contacts';
    }
    
    if (contactsInfo) {
      const { totalContacts, contactsWithPhones } = contactsInfo;
      return `${totalContacts} contacts found (${contactsWithPhones} with phone numbers)`;
    }
    
    return 'Ready to import contacts';
  };

  const getButtonColor = () => {
    if (!hasPermission) return '#FF9800'; // Orange for permission needed
    if (contactsInfo && contactsInfo.contactsWithPhones === 0) return '#757575'; // Gray for no contacts
    return '#4CAF50'; // Green for ready
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Import Device Contacts</Text>
      <Text style={styles.description}>
        Import your device contacts to match phone numbers with names in your call and SMS logs.
      </Text>

      <TouchableOpacity
        style={[styles.importButton, { backgroundColor: getButtonColor() }]}
        onPress={handleImport}
        disabled={isImporting || (contactsInfo?.contactsWithPhones === 0)}
      >
        <View style={styles.buttonContent}>
          {isImporting ? (
            <ActivityIndicator size="small" color="#ffffff" style={styles.icon} />
          ) : (
            <Icon 
              name={hasPermission ? "contacts" : "security"} 
              size={24} 
              color="#ffffff" 
              style={styles.icon} 
            />
          )}
          
          <View style={styles.textContainer}>
            <Text style={styles.buttonTitle}>
              {isImporting ? 'Importing Contacts...' : 'Import Contacts'}
            </Text>
            <Text style={styles.buttonSubtitle}>
              {getStatusText()}
            </Text>
          </View>

          {!isImporting && (
            <Icon name="arrow-forward" size={20} color="#ffffff" />
          )}
        </View>
      </TouchableOpacity>

      {contactsInfo && contactsInfo.contactsWithPhones === 0 && (
        <View style={styles.infoCard}>
          <Icon name="info" size={20} color="#FF9800" />
          <Text style={styles.infoText}>
            No contacts with phone numbers found on your device.
          </Text>
        </View>
      )}

      <View style={styles.benefitsCard}>
        <Text style={styles.benefitsTitle}>Benefits of importing contacts:</Text>
        <View style={styles.benefitsList}>
          <View style={styles.benefitItem}>
            <Icon name="person" size={16} color="#4CAF50" />
            <Text style={styles.benefitText}>Match phone numbers to contact names</Text>
          </View>
          <View style={styles.benefitItem}>
            <Icon name="analytics" size={16} color="#4CAF50" />
            <Text style={styles.benefitText}>Enhanced analytics and insights</Text>
          </View>
          <View style={styles.benefitItem}>
            <Icon name="security" size={16} color="#4CAF50" />
            <Text style={styles.benefitText}>Data stays on your device (privacy-first)</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  importButton: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 2,
  },
  buttonSubtitle: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.9,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#E65100',
  },
  benefitsCard: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  benefitsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  benefitsList: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    fontSize: 13,
    color: '#555',
    flex: 1,
  },
});