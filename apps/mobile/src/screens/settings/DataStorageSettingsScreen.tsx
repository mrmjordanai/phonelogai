import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  RefreshControl,
  Platform,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

import { useAuth } from '../../components/AuthProvider';
import { 
  SettingToggle, 
  SettingButton, 
  SettingPicker,
  type PickerOption 
} from '../../components/settings';

import { SettingsService } from '../../services/SettingsService';
import { OfflineStorage } from '../../services/OfflineStorage';
import { CryptoService } from '../../services/CryptoService';

import { StackNavigationProp } from '@react-navigation/stack';
import { SettingsStackParamList } from '../../navigation/SettingsStack';
import type { DataStorageSettings } from '../../types/settings';

interface DataStorageSettingsScreenProps {
  navigation: StackNavigationProp<SettingsStackParamList, 'DataStorageSettings'>;
}

interface StorageUsage {
  events: number;
  contacts: number;
  cache: number;
  settings: number;
  offlineQueue: number;
  total: number;
}

interface ExportProgress {
  isExporting: boolean;
  progress: number;
  currentStep: string;
}

const CACHE_SIZE_OPTIONS: PickerOption[] = [
  { 
    value: 'small', 
    label: 'Small (10MB)',
    description: 'Minimal cache for basic functionality',
    icon: 'phone-portrait'
  },
  { 
    value: 'medium', 
    label: 'Medium (25MB)',
    description: 'Balanced cache for normal usage',
    icon: 'tablet-portrait'
  },
  { 
    value: 'large', 
    label: 'Large (50MB)',
    description: 'Extended cache for heavy usage',
    icon: 'desktop'
  },
];

const BACKUP_FREQUENCY_OPTIONS: PickerOption[] = [
  { value: 'daily', label: 'Daily', icon: 'calendar' },
  { value: 'weekly', label: 'Weekly', icon: 'calendar-outline' },
  { value: 'monthly', label: 'Monthly', icon: 'calendar' },
];

const OFFLINE_AGE_OPTIONS: PickerOption[] = [
  { value: '1', label: '1 Day', description: 'Keep data for 1 day offline' },
  { value: '3', label: '3 Days', description: 'Keep data for 3 days offline' },
  { value: '7', label: '1 Week', description: 'Keep data for 1 week offline' },
  { value: '14', label: '2 Weeks', description: 'Keep data for 2 weeks offline' },
  { value: '30', label: '1 Month', description: 'Keep data for 1 month offline' },
];

export function DataStorageSettingsScreen({ navigation: _navigation }: DataStorageSettingsScreenProps) {
  const { user } = useAuth();
  
  // Settings state
  const [settings, setSettings] = useState<DataStorageSettings>({
    offlineMode: true,
    autoBackup: true,
    backupFrequency: 'weekly',
    cacheSize: 'medium',
    syncOnWifiOnly: false,
    maxOfflineAge: 7,
    compressionEnabled: true,
    encryptionEnabled: true,
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsage>({
    events: 0,
    contacts: 0,
    cache: 0,
    settings: 0,
    offlineQueue: 0,
    total: 0,
  });
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    isExporting: false,
    progress: 0,
    currentStep: '',
  });

  // Load settings and storage usage
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadSettings(),
        loadStorageUsage(),
      ]);
    } catch (error) {
      console.error('Failed to load data storage settings:', error);
      Alert.alert('Error', 'Failed to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    const userSettings = await SettingsService.getSettings();
    setSettings(userSettings.dataStorage);
  };

  const loadStorageUsage = async () => {
    try {
      // Get offline queue storage stats
      const offlineStorage = OfflineStorage;
      const queueSize = await offlineStorage.getStorageSize();

      // Estimate other storage categories
      const usage: StorageUsage = {
        events: await estimateStorageSize('@phonelogai:events'),
        contacts: await estimateStorageSize('@phonelogai:contacts'),
        cache: await estimateStorageSize('@phonelogai:cache'),
        settings: await estimateStorageSize('@phonelogai:settings'),
        offlineQueue: queueSize,
        total: 0,
      };

      usage.total = usage.events + usage.contacts + usage.cache + usage.settings + usage.offlineQueue;
      setStorageUsage(usage);
    } catch (error) {
      console.error('Failed to load storage usage:', error);
    }
  };

  const estimateStorageSize = async (keyPrefix: string): Promise<number> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const matchingKeys = keys.filter(key => key.startsWith(keyPrefix));
      
      if (matchingKeys.length === 0) return 0;

      const values = await AsyncStorage.multiGet(matchingKeys);
      return values.reduce((total, [_, value]) => total + (value?.length || 0), 0);
    } catch {
      return 0;
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const updateSetting = async (key: keyof DataStorageSettings, value: unknown) => {
    try {
      const updatedSettings = { ...settings, [key]: value };
      setSettings(updatedSettings);

      await SettingsService.updateSetting(`dataStorage.${key}`, value);

      // Handle specific setting changes
      if (key === 'syncOnWifiOnly') {
        // Update sync engine configuration
        // Implementation would depend on SyncEngine API
      }

      if (key === 'compressionEnabled' || key === 'encryptionEnabled') {
        Alert.alert(
          'Restart Required',
          'This change requires an app restart to take effect.',
          [{ text: 'OK', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('Failed to update setting:', error);
      Alert.alert('Error', 'Failed to update setting. Please try again.');
      // Revert the setting
      await loadSettings();
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will remove all cached data. The app will re-download data as needed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              // Clear various cache keys
              const keys = await AsyncStorage.getAllKeys();
              const cacheKeys = keys.filter(key => 
                key.includes('cache') || 
                key.includes('temp') ||
                key.includes('image')
              );
              
              if (cacheKeys.length > 0) {
                await AsyncStorage.multiRemove(cacheKeys);
              }

              // Clear file system cache if it exists
              const cacheDir = `${FileSystem.cacheDirectory}phonelogai/`;
              const dirInfo = await FileSystem.getInfoAsync(cacheDir);
              if (dirInfo.exists) {
                await FileSystem.deleteAsync(cacheDir);
              }

              await loadStorageUsage();
              Alert.alert('Success', 'Cache cleared successfully.');
            } catch (error) {
              console.error('Failed to clear cache:', error);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleExportData = async () => {
    try {
      setExportProgress({
        isExporting: true,
        progress: 0,
        currentStep: 'Preparing export...',
      });

      // Get data collection service instance
      // const dataService = DataCollectionService.getInstance();
      
      setExportProgress(prev => ({
        ...prev,
        progress: 25,
        currentStep: 'Exporting events...',
      }));

      // Export events data (simplified - would need actual implementation)
      const exportData = {
        timestamp: new Date().toISOString(),
        user: user?.id,
        version: '1.0',
        data: {
          // This would be populated by the actual export logic
          events: [],
          contacts: [],
          settings: await SettingsService.exportSettings(),
        },
      };

      setExportProgress(prev => ({
        ...prev,
        progress: 75,
        currentStep: 'Encrypting data...',
      }));

      // Encrypt the export data
      const crypto = CryptoService;
      const encryptedData = await crypto.encrypt(JSON.stringify(exportData));
      
      setExportProgress(prev => ({
        ...prev,
        progress: 90,
        currentStep: 'Creating file...',
      }));

      // Create and share the export file
      const fileName = `phonelogai-export-${new Date().toISOString().split('T')[0]}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(encryptedData));

      setExportProgress(prev => ({
        ...prev,
        progress: 100,
        currentStep: 'Complete!',
      }));

      // Share the file
      if (Platform.OS === 'ios') {
        await Share.share({ url: filePath });
      } else {
        await Share.share({ 
          title: 'PhoneLog AI Data Export',
          message: 'Your exported data is ready.',
        });
      }

    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert('Export Failed', 'Failed to export data. Please try again.');
    } finally {
      setExportProgress({
        isExporting: false,
        progress: 0,
        currentStep: '',
      });
    }
  };

  const handleImportData = async () => {
    Alert.alert(
      'Import Data',
      'Select an encrypted export file to import data and settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Select File',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
              });

              if (!result.canceled && result.assets[0]) {
                const file = result.assets[0];
                const content = await FileSystem.readAsStringAsync(file.uri);
                
                // Import settings using SettingsService
                const importResult = await SettingsService.importSettings(content);
                
                if (importResult.success) {
                  Alert.alert(
                    'Import Successful',
                    `Imported ${importResult.imported.length} setting categories.`
                  );
                  await loadSettings();
                } else {
                  const errorMsg = importResult.errors.map(e => e.message).join('\n');
                  Alert.alert('Import Failed', errorMsg);
                }
              }
            } catch (error) {
              console.error('Import failed:', error);
              Alert.alert('Import Failed', 'Failed to import data. Please check the file format.');
            }
          },
        },
      ]
    );
  };

  const handleCleanupOldData = async () => {
    Alert.alert(
      'Cleanup Old Data',
      `This will remove data older than ${settings.maxOfflineAge} days according to your settings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cleanup',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              // Perform maintenance on offline storage
              const offlineStorage = OfflineStorage;
              const result = await offlineStorage.performMaintenance();
              
              await loadStorageUsage();
              
              Alert.alert(
                'Cleanup Complete',
                `Removed ${result.cleaned} old items and compressed ${result.compressed} items.`
              );
            } catch (error) {
              console.error('Cleanup failed:', error);
              Alert.alert('Error', 'Failed to cleanup old data. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading storage settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Storage Usage Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="pie-chart" size={20} color="#3B82F6" /> Storage Usage
          </Text>
          <Text style={styles.sectionDescription}>
            Current storage usage by category
          </Text>

          <View style={styles.storageCard}>
            <View style={styles.storageHeader}>
              <Text style={styles.storageTotal}>
                Total: {formatBytes(storageUsage.total)}
              </Text>
            </View>
            
            <View style={styles.storageBreakdown}>
              <StorageBar label="Events" size={storageUsage.events} total={storageUsage.total} color="#3B82F6" />
              <StorageBar label="Contacts" size={storageUsage.contacts} total={storageUsage.total} color="#10B981" />
              <StorageBar label="Cache" size={storageUsage.cache} total={storageUsage.total} color="#F59E0B" />
              <StorageBar label="Offline Queue" size={storageUsage.offlineQueue} total={storageUsage.total} color="#8B5CF6" />
              <StorageBar label="Settings" size={storageUsage.settings} total={storageUsage.total} color="#EF4444" />
            </View>
          </View>
        </View>

        {/* Cache Management Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="server" size={20} color="#3B82F6" /> Cache Management
          </Text>

          <SettingPicker
            label="Cache Size"
            description="Amount of data to cache locally"
            value={settings.cacheSize}
            options={CACHE_SIZE_OPTIONS}
            onValueChange={(value) => updateSetting('cacheSize', value)}
            icon="albums"
          />

          <SettingButton
            title="Clear Cache"
            onPress={handleClearCache}
            variant="outline"
            icon="trash"
            disabled={loading}
          />
        </View>

        {/* Offline Data Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="cloud-offline" size={20} color="#3B82F6" /> Offline Data
          </Text>

          <SettingToggle
            label="Offline Mode"
            description="Keep data available when offline"
            value={settings.offlineMode}
            onValueChange={(value) => updateSetting('offlineMode', value)}
            icon="cloud-offline"
          />

          <SettingPicker
            label="Offline Data Retention"
            description="How long to keep data available offline"
            value={settings.maxOfflineAge.toString()}
            options={OFFLINE_AGE_OPTIONS}
            onValueChange={(value) => updateSetting('maxOfflineAge', parseInt(value))}
            icon="time"
          />

          <SettingButton
            title="Cleanup Old Data"
            onPress={handleCleanupOldData}
            variant="outline"
            icon="trash-bin"
            disabled={loading}
          />
        </View>

        {/* Sync Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="sync" size={20} color="#3B82F6" /> Sync Preferences
          </Text>

          <SettingToggle
            label="Auto Backup"
            description="Automatically backup data to cloud"
            value={settings.autoBackup}
            onValueChange={(value) => updateSetting('autoBackup', value)}
            icon="cloud-upload"
          />

          <SettingPicker
            label="Backup Frequency"
            description="How often to create backups"
            value={settings.backupFrequency}
            options={BACKUP_FREQUENCY_OPTIONS}
            onValueChange={(value) => updateSetting('backupFrequency', value)}
            icon="calendar"
            disabled={!settings.autoBackup}
          />

          <SettingToggle
            label="Wi-Fi Only Sync"
            description="Only sync when connected to Wi-Fi"
            value={settings.syncOnWifiOnly}
            onValueChange={(value) => updateSetting('syncOnWifiOnly', value)}
            icon="wifi"
          />
        </View>

        {/* Data Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="shield-checkmark" size={20} color="#3B82F6" /> Data Security
          </Text>

          <SettingToggle
            label="Data Compression"
            description="Compress data to save storage space"
            value={settings.compressionEnabled}
            onValueChange={(value) => updateSetting('compressionEnabled', value)}
            icon="archive"
          />

          <SettingToggle
            label="Data Encryption"
            description="Encrypt sensitive data locally"
            value={settings.encryptionEnabled}
            onValueChange={(value) => updateSetting('encryptionEnabled', value)}
            icon="lock-closed"
          />
        </View>

        {/* Export/Import Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="download" size={20} color="#3B82F6" /> Data Export/Import
          </Text>

          <SettingButton
            title={exportProgress.isExporting ? `Exporting... ${exportProgress.progress}%` : "Export Data"}
            onPress={handleExportData}
            variant="primary"
            icon="download"
            loading={exportProgress.isExporting}
            disabled={exportProgress.isExporting}
          />

          {exportProgress.isExporting && (
            <Text style={styles.exportProgress}>
              {exportProgress.currentStep}
            </Text>
          )}

          <SettingButton
            title="Import Data"
            onPress={handleImportData}
            variant="outline"
            icon="cloud-upload"
            disabled={loading || exportProgress.isExporting}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Helper component for storage usage visualization
function StorageBar({ label, size, total, color }: { 
  label: string; 
  size: number; 
  total: number; 
  color: string; 
}) {
  const percentage = total > 0 ? (size / total) * 100 : 0;
  
  return (
    <View style={styles.storageBarContainer}>
      <View style={styles.storageBarHeader}>
        <Text style={styles.storageBarLabel}>{label}</Text>
        <Text style={styles.storageBarSize}>
          {formatBytes(size)} ({percentage.toFixed(1)}%)
        </Text>
      </View>
      <View style={styles.storageBarTrack}>
        <View 
          style={[
            styles.storageBarFill, 
            { width: `${percentage}%`, backgroundColor: color }
          ]} 
        />
      </View>
    </View>
  );
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  storageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  storageHeader: {
    marginBottom: 16,
  },
  storageTotal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  storageBreakdown: {
    gap: 12,
  },
  storageBarContainer: {
    marginBottom: 8,
  },
  storageBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  storageBarLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  storageBarSize: {
    fontSize: 12,
    color: '#6B7280',
  },
  storageBarTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  storageBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  exportProgress: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});