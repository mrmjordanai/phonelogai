import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';

import { CloudStorageService, CloudStorageProvider } from '../../../services/ios/CloudStorageService';
import { ImportedFile } from '../../../services/ios/FileImportService';

interface CloudStorageSelectorProps {
  onFileSelected: (_files: ImportedFile[]) => void;
  onError: (_error: string) => void;
}

export function CloudStorageSelector({
  onFileSelected: _onFileSelected,
  onError,
}: CloudStorageSelectorProps) {
  const [providers, setProviders] = useState<CloudStorageProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      initializeProviders();
    }
  }, []);

  const initializeProviders = () => {
    const availableProviders = CloudStorageService.getAvailableProviders();
    setProviders(availableProviders);
  };

  const handleProviderAuth = async (providerId: string) => {
    try {
      setIsAuthenticating(true);
      setSelectedProvider(providerId);
      
      const success = await CloudStorageService.authenticateProvider(providerId);
      if (success) {
        Alert.alert(
          'Authentication Successful',
          `Connected to ${providerId}. You can now browse and import files.`,
          [
            {
              text: 'Browse Files',
              onPress: () => handleBrowseFiles(providerId),
            },
            { text: 'Later', style: 'cancel' },
          ]
        );
      } else {
        onError(`Failed to connect to ${providerId}. Please try again.`);
        setSelectedProvider(null);
      }
    } catch (error) {
      console.error('Cloud storage authentication error:', error);
      onError('Failed to authenticate with cloud storage provider.');
      setSelectedProvider(null);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleBrowseFiles = async (providerId: string) => {
    try {
      setIsBrowsing(true);
      
      // For now, show message that cloud browsing is coming soon
      Alert.alert(
        'Cloud Browsing Coming Soon',
        `Cloud file browsing for ${providerId} will be available in a future update. For now, please use the regular file picker which supports iCloud Drive.`,
        [{ text: 'OK' }]
      );
      
      // TODO: Implement actual cloud file browsing
      // const files = await CloudStorageService.browseFiles(providerId);
      // // Show file browser UI
      
    } catch (error) {
      console.error('Cloud storage browsing error:', error);
      onError('Failed to browse cloud storage files.');
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleDisconnectProvider = (providerId: string) => {
    Alert.alert(
      'Disconnect Provider',
      `Disconnect from ${providerId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            CloudStorageService.clearProviderAuth(providerId);
            if (selectedProvider === providerId) {
              setSelectedProvider(null);
            }
          },
        },
      ]
    );
  };

  if (Platform.OS !== 'ios' || providers.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Icon name="cloud" size={20} color="#2196F3" />
        <Text style={styles.title}>Cloud Storage</Text>
      </View>
      
      <Text style={styles.description}>
        Connect to cloud storage providers to import your carrier data files directly.
      </Text>

      <View style={styles.providersList}>
        {providers.map((provider) => {
          const isAuthenticated = CloudStorageService.isProviderAuthenticated(provider.id);
          const isSelected = selectedProvider === provider.id;
          
          return (
            <View key={provider.id} style={styles.providerContainer}>
              <TouchableOpacity
                style={[
                  styles.providerItem,
                  isAuthenticated && styles.authenticatedProvider,
                  isSelected && styles.selectedProvider,
                ]}
                onPress={() => 
                  isAuthenticated 
                    ? handleBrowseFiles(provider.id)
                    : handleProviderAuth(provider.id)
                }
                disabled={isAuthenticating || isBrowsing}
              >
                <Text style={styles.providerIcon}>{provider.icon}</Text>
                <View style={styles.providerInfo}>
                  <Text style={styles.providerName}>{provider.name}</Text>
                  <Text style={styles.providerStatus}>
                    {isAuthenticating && isSelected
                      ? 'Connecting...'
                      : isBrowsing && isSelected
                      ? 'Browsing...'
                      : isAuthenticated
                      ? 'Connected - Tap to browse'
                      : provider.authRequired
                      ? 'Tap to connect'
                      : 'Available'
                    }
                  </Text>
                </View>
                
                {isAuthenticated && (
                  <TouchableOpacity
                    onPress={() => handleDisconnectProvider(provider.id)}
                    style={styles.disconnectButton}
                    disabled={isAuthenticating || isBrowsing}
                  >
                    <Icon name="close" size={16} color="#666" />
                  </TouchableOpacity>
                )}
                
                {isAuthenticated ? (
                  <Icon name="check-circle" size={20} color="#4CAF50" />
                ) : (
                  <Icon name="arrow-forward-ios" size={16} color="#999" />
                )}
              </TouchableOpacity>
              
              {provider.id === 'icloud' && (
                <Text style={styles.providerNote}>
                  iCloud files are accessed through the standard file picker
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>Need Help?</Text>
        <Text style={styles.helpText}>
          • iCloud Drive: Files must be downloaded to your device first
        </Text>
        <Text style={styles.helpText}>
          • Google Drive: Requires Google account authentication
        </Text>
        <Text style={styles.helpText}>
          • Dropbox/OneDrive: Coming in future updates
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  providersList: {
    marginBottom: 16,
  },
  providerContainer: {
    marginBottom: 12,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  authenticatedProvider: {
    backgroundColor: '#e8f5e8',
    borderColor: '#4CAF50',
  },
  selectedProvider: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
  },
  providerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  providerStatus: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  disconnectButton: {
    padding: 4,
    marginRight: 8,
  },
  providerNote: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
    marginLeft: 48,
  },
  helpSection: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    marginBottom: 4,
  },
});