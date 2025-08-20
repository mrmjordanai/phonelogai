/**
 * Cloud Storage Selector
 * Component for choosing cloud storage provider and settings
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator
} from 'react-native';
import { CloudProviderType } from '../../types/export';

interface CloudStorageSelectorProps {
  providers: Array<{
    type: CloudProviderType;
    name: string;
    enabled: boolean;
    authenticated: boolean;
  }>;
  selectedProvider?: CloudProviderType;
   
  onProviderSelect: (_provider: CloudProviderType) => void;
  folder?: string;
   
  onFolderChange: (_folder: string) => void;
}

interface ProviderCardProps {
  provider: {
    type: CloudProviderType;
    name: string;
    enabled: boolean;
    authenticated: boolean;
  };
  isSelected: boolean;
  onPress: () => void;
  onAuthenticate: () => void;
}

function ProviderCard({ provider, isSelected, onPress, onAuthenticate }: ProviderCardProps) {
  const [authenticating, setAuthenticating] = useState(false);

  const getProviderIcon = () => {
    switch (provider.type) {
      case 'google-drive':
        return '📁';
      case 'dropbox':
        return '📦';
      case 'icloud':
        return '☁️';
      case 'onedrive':
        return '📂';
      default:
        return '💾';
    }
  };

  const getProviderStatus = () => {
    if (!provider.enabled) {
      return { text: 'Not Available', color: '#9CA3AF' };
    }
    if (!provider.authenticated) {
      return { text: 'Not Connected', color: '#EF4444' };
    }
    return { text: 'Connected', color: '#10B981' };
  };

  const handleAuthenticate = async () => {
    setAuthenticating(true);
    try {
      await onAuthenticate();
    } finally {
      setAuthenticating(false);
    }
  };

  const status = getProviderStatus();

  return (
    <TouchableOpacity
      style={[
        styles.providerCard,
        isSelected && styles.providerCardSelected,
        !provider.enabled && styles.providerCardDisabled
      ]}
      onPress={onPress}
      disabled={!provider.enabled}
      activeOpacity={0.7}
    >
      <View style={styles.providerContent}>
        <Text style={styles.providerIcon}>{getProviderIcon()}</Text>
        <View style={styles.providerInfo}>
          <Text style={[
            styles.providerName,
            isSelected && styles.providerNameSelected,
            !provider.enabled && styles.providerNameDisabled
          ]}>
            {provider.name}
          </Text>
          <View style={styles.providerStatusContainer}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.providerStatus, { color: status.color }]}>
              {status.text}
            </Text>
          </View>
        </View>
        {isSelected && (
          <View style={styles.selectedIndicator}>
            <Text style={styles.selectedCheck}>✓</Text>
          </View>
        )}
      </View>

      {provider.enabled && !provider.authenticated && (
        <TouchableOpacity
          style={styles.authButton}
          onPress={handleAuthenticate}
          disabled={authenticating}
        >
          {authenticating ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Text style={styles.authButtonText}>Connect</Text>
          )}
        </TouchableOpacity>
      )}

      {provider.authenticated && (
        <View style={styles.connectedInfo}>
          <Text style={styles.connectedText}>
            Ready to upload files to {provider.name}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function CloudStorageSelector({
  providers,
  selectedProvider,
  onProviderSelect,
  folder,
  onFolderChange
}: CloudStorageSelectorProps) {
  const [customFolder, setCustomFolder] = useState(folder || 'PhoneLogAI Exports');

  const handleFolderChange = (text: string) => {
    setCustomFolder(text);
    onFolderChange(text);
  };

  const handleProviderSelect = (provider: CloudProviderType) => {
    const providerInfo = providers.find(p => p.type === provider);
    if (!providerInfo?.authenticated) {
      Alert.alert(
        'Not Connected',
        `Please connect to ${providerInfo?.name} first.`,
        [{ text: 'OK' }]
      );
      return;
    }
    onProviderSelect(provider);
  };

  const handleAuthenticate = async (provider: CloudProviderType) => {
    // This would trigger authentication through the parent component
    // For now, we'll just show an alert
    Alert.alert(
      'Authentication',
      `Authentication for ${provider} would be triggered here.`,
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Choose Cloud Provider</Text>
      
      {providers.map((provider) => (
        <ProviderCard
          key={provider.type}
          provider={provider}
          isSelected={selectedProvider === provider.type}
          onPress={() => handleProviderSelect(provider.type)}
          onAuthenticate={() => handleAuthenticate(provider.type)}
        />
      ))}

      {selectedProvider && (
        <View style={styles.folderSection}>
          <Text style={styles.folderLabel}>Folder Name</Text>
          <TextInput
            style={styles.folderInput}
            value={customFolder}
            onChangeText={handleFolderChange}
            placeholder="Enter folder name"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.folderHint}>
            Files will be saved to this folder in your cloud storage
          </Text>
        </View>
      )}

      {/* Cloud Storage Tips */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>Cloud Storage Tips</Text>
        <View style={styles.tipsList}>
          <Text style={styles.tipItem}>
            • Files are automatically organized by date and type
          </Text>
          <Text style={styles.tipItem}>
            • Your data remains private and secure
          </Text>
          <Text style={styles.tipItem}>
            • Access your exports from any device
          </Text>
          <Text style={styles.tipItem}>
            • Large files are automatically compressed
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  
  // Provider Card
  providerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  providerCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#F0F7FF',
  },
  providerCardDisabled: {
    opacity: 0.5,
    backgroundColor: '#F9FAFB',
  },
  providerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  providerIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 32,
    textAlign: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  providerNameSelected: {
    color: '#1D4ED8',
  },
  providerNameDisabled: {
    color: '#9CA3AF',
  },
  providerStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  providerStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCheck: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  // Authentication
  authButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
    minWidth: 80,
    alignItems: 'center',
  },
  authButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  connectedInfo: {
    backgroundColor: '#F0FDF4',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  connectedText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
  },

  // Folder Section
  folderSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  folderLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  folderInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  folderHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },

  // Tips Card
  tipsCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  tipsList: {
    gap: 4,
  },
  tipItem: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
});

export default CloudStorageSelector;