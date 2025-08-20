/**
 * TestScreen - Demo component to verify Settings infrastructure
 * This component demonstrates the Settings context and service functionality
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { useSettings, useProfileSettings, useUISettings } from '../contexts/SettingsContext';

export function TestScreen() {
  const {
    settings,
    isLoading,
    error,
    updateSetting,
    resetToDefaults,
    exportSettings,
    importSettings,
  } = useSettings();

  const { updateDisplayName, updateLanguage } = useProfileSettings();
  const { updateTheme, updateFontSize } = useUISettings();
  
  const [exportData, setExportData] = useState<string>('');

  useEffect(() => {
    console.log('Settings loaded:', settings);
  }, [settings]);

  const handleExport = async () => {
    try {
      const data = await exportSettings();
      setExportData(data);
      Alert.alert('Success', 'Settings exported successfully');
    } catch (err) {
      Alert.alert('Error', `Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleImport = async () => {
    if (!exportData) {
      Alert.alert('Error', 'No export data available to import');
      return;
    }

    try {
      const result = await importSettings(exportData);
      if (result.success) {
        Alert.alert('Success', `Imported ${result.imported.length} setting categories`);
      } else {
        Alert.alert('Import Failed', result.errors.map(e => e.message).join('\n'));
      }
    } catch (err) {
      Alert.alert('Error', `Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Settings',
      'Are you sure you want to reset all settings to defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => resetToDefaults(),
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Loading Settings...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Settings Error</Text>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings Infrastructure Test</Text>
      
      {/* Profile Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Settings</Text>
        <Text style={styles.label}>Display Name: {settings.profile.displayName || 'Not set'}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => updateDisplayName('Test User ' + Date.now())}
        >
          <Text style={styles.buttonText}>Update Display Name</Text>
        </TouchableOpacity>
        
        <Text style={styles.label}>Language: {settings.profile.language}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => updateLanguage(settings.profile.language === 'en' ? 'es' : 'en')}
        >
          <Text style={styles.buttonText}>Toggle Language (EN/ES)</Text>
        </TouchableOpacity>
      </View>

      {/* UI Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>UI Settings</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Theme: {settings.ui.theme}</Text>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              const themes = ['light', 'dark', 'system'] as const;
              const currentIndex = themes.indexOf(settings.ui.theme);
              const nextTheme = themes[(currentIndex + 1) % themes.length];
              updateTheme(nextTheme);
            }}
          >
            <Text style={styles.buttonText}>Cycle</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Font Size: {settings.ui.fontSize}</Text>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              const sizes = ['small', 'medium', 'large'] as const;
              const currentIndex = sizes.indexOf(settings.ui.fontSize);
              const nextSize = sizes[(currentIndex + 1) % sizes.length];
              updateFontSize(nextSize);
            }}
          >
            <Text style={styles.buttonText}>Cycle</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notification Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Settings</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Push Notifications</Text>
          <Switch
            value={settings.notifications.pushEnabled}
            onValueChange={(value) => updateSetting('notifications.pushEnabled', value)}
          />
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Sync Alerts</Text>
          <Switch
            value={settings.notifications.syncAlerts}
            onValueChange={(value) => updateSetting('notifications.syncAlerts', value)}
          />
        </View>
      </View>

      {/* Privacy Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy Settings</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Enable Anonymization</Text>
          <Switch
            value={settings.privacy.enableAnonymization}
            onValueChange={(value) => updateSetting('privacy.enableAnonymization', value)}
          />
        </View>
        
        <Text style={styles.label}>
          Data Retention: {settings.privacy.dataRetentionDays} days
        </Text>
      </View>

      {/* Data Storage Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Storage Settings</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Offline Mode</Text>
          <Switch
            value={settings.dataStorage.offlineMode}
            onValueChange={(value) => updateSetting('dataStorage.offlineMode', value)}
          />
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Auto Backup</Text>
          <Switch
            value={settings.dataStorage.autoBackup}
            onValueChange={(value) => updateSetting('dataStorage.autoBackup', value)}
          />
        </View>
        
        <Text style={styles.label}>
          Cache Size: {settings.dataStorage.cacheSize}
        </Text>
      </View>

      {/* Export/Import Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Export/Import</Text>
        <TouchableOpacity style={styles.button} onPress={handleExport}>
          <Text style={styles.buttonText}>Export Settings</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, !exportData && styles.buttonDisabled]} 
          onPress={handleImport}
          disabled={!exportData}
        >
          <Text style={styles.buttonText}>Import Settings</Text>
        </TouchableOpacity>
        
        {exportData && (
          <Text style={styles.exportInfo}>
            Export data ready (length: {exportData.length})
          </Text>
        )}
      </View>

      {/* Actions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleReset}>
          <Text style={[styles.buttonText, styles.dangerText]}>Reset All Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Debug Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Debug Info</Text>
        <Text style={styles.debugText}>
          Settings JSON (truncated):
          {JSON.stringify(settings, null, 2).substring(0, 500)}...
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#666',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  smallButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  dangerText: {
    color: 'white',
  },
  error: {
    color: '#FF3B30',
    fontSize: 16,
    textAlign: 'center',
  },
  exportInfo: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    backgroundColor: '#f8f8f8',
    padding: 8,
    borderRadius: 4,
  },
});