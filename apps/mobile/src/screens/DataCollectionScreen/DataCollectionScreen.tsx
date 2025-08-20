import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDataCollection } from './hooks/useDataCollection';
import { useFileImport } from './hooks/useFileImport';
import { MethodSelector } from './components/MethodSelector';
import { FileImportSection } from './components/FileImportSection';
import { ManualEntryForms } from './components/ManualEntryForms';
import { GuidanceSection } from './components/GuidanceSection';
import { CollectionProgress } from './components/CollectionProgress';
import { ContactsImportButton } from './components/ContactsImportButton';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { DataCollectionMethod } from '../../services/DataCollectionGuidanceService';

export interface DataCollectionScreenProps {
  // Screen props if needed
}

export function DataCollectionScreen(_props: DataCollectionScreenProps) {
  const [selectedMethod, setSelectedMethod] = useState<DataCollectionMethod | null>(null);
  const [activeTab, setActiveTab] = useState<'methods' | 'import' | 'manual' | 'contacts' | 'help'>('methods');

  const {
    capabilities,
    recommendedMethods,
    isLoading: capabilitiesLoading,
    refreshCapabilities,
  } = useDataCollection();

  const {
    importProgress,
    isImporting,
    importResults,
    startFileImport,
    cancelImport,
    clearResults,
  } = useFileImport();

  const handleMethodSelected = (method: DataCollectionMethod) => {
    setSelectedMethod(method);
    
    // Navigate to appropriate tab based on method
    if (method.id.startsWith('file_import')) {
      setActiveTab('import');
    } else if (method.id === 'manual_entry') {
      setActiveTab('manual');
    } else {
      setActiveTab('help');
    }
  };

  const handleFileImportStart = async (files: { uri: string; name: string; type: string }[]) => {
    try {
      await startFileImport(files);
      Alert.alert(
        'Import Started',
        'Your files are being processed. You can monitor progress below.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Import Failed',
        error instanceof Error ? error.message : 'Failed to start file import',
        [{ text: 'OK' }]
      );
    }
  };

  const handleRefresh = async () => {
    await refreshCapabilities();
    clearResults();
  };

  if (capabilitiesLoading && !capabilities) {
    return <LoadingOverlay message="Loading data collection options..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={capabilitiesLoading}
            onRefresh={handleRefresh}
          />
        }
      >
        <View style={styles.content}>
          {/* Method Selection */}
          {activeTab === 'methods' && (
            <MethodSelector
              capabilities={capabilities}
              recommendedMethods={recommendedMethods}
              selectedMethod={selectedMethod}
              onMethodSelected={handleMethodSelected}
              onTabChange={setActiveTab}
            />
          )}

          {/* File Import */}
          {activeTab === 'import' && (
            <FileImportSection
              selectedMethod={selectedMethod}
              onFileImport={handleFileImportStart}
              onBack={() => setActiveTab('methods')}
            />
          )}

          {/* Manual Entry */}
          {activeTab === 'manual' && (
            <ManualEntryForms
              selectedMethod={selectedMethod}
              onBack={() => setActiveTab('methods')}
            />
          )}

          {/* Help & Guidance */}
          {activeTab === 'help' && (
            <GuidanceSection
              selectedMethod={selectedMethod}
              capabilities={capabilities}
              onBack={() => setActiveTab('methods')}
            />
          )}

          {/* Contacts Import */}
          {activeTab === 'contacts' && (
            <ContactsImportButton
              onImportComplete={(contacts) => {
                console.log(`Imported ${contacts.length} contacts`);
                // Could add success message or navigate back
                setTimeout(() => setActiveTab('methods'), 2000);
              }}
            />
          )}

          {/* Import Progress (always visible when active) */}
          {(isImporting || importProgress || importResults) && (
            <CollectionProgress
              progress={importProgress}
              isActive={isImporting}
              results={importResults}
              onCancel={cancelImport}
              onClearResults={clearResults}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
});