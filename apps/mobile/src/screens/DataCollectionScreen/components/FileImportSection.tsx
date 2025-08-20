import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
// Note: DocumentPicker is imported in FileImportService

import { DataCollectionMethod } from '../../../services/DataCollectionGuidanceService';
import { FileImportService, ImportedFile } from '../../../services/ios/FileImportService';
import { CloudStorageService, CloudStorageProvider } from '../../../services/ios/CloudStorageService';
// Note: PlatformDetector is used indirectly via FileImportService

interface FileImportSectionProps {
  selectedMethod: DataCollectionMethod | null;
  onFileImport: (_files: { uri: string; name: string; type: string }[]) => Promise<void>;
  onBack: () => void;
}

interface CloudStorageState {
  providers: CloudStorageProvider[];
  selectedProvider: string | null;
  isAuthenticating: boolean;
  supportInfo: {
    iCloudAvailable: boolean;
    documentPickerAvailable: boolean;
    shareExtensionAvailable: boolean;
  } | null;
}

export function FileImportSection({
  selectedMethod,
  onFileImport,
  onBack,
}: FileImportSectionProps) {
  const [selectedFiles, setSelectedFiles] = useState<ImportedFile[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [cloudStorage, setCloudStorage] = useState<CloudStorageState>({
    providers: [],
    selectedProvider: null,
    isAuthenticating: false,
    supportInfo: null,
  });
  const [showCloudOptions, setShowCloudOptions] = useState(false);

  // Initialize cloud storage support on component mount
  useEffect(() => {
    initializeCloudStorage();
  }, []);

  const initializeCloudStorage = async () => {
    try {
      const providers = CloudStorageService.getAvailableProviders();
      const supportInfo = await FileImportService.checkCloudStorageSupport();
      
      setCloudStorage(prev => ({
        ...prev,
        providers,
        supportInfo,
      }));
    } catch (error) {
      console.warn('Failed to initialize cloud storage:', error);
    }
  };

  const handleFileSelection = async () => {
    try {
      setIsSelecting(true);
      
      const files = await FileImportService.pickFiles({
        allowMultipleSelection: true,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowCloudStorage: true,
        presentationStyle: Platform.OS === 'ios' ? 'pageSheet' : undefined,
      });
      
      if (files.length > 0) {
        // Validate each file
        const validatedFiles: ImportedFile[] = [];
        const errors: string[] = [];
        
        for (const file of files) {
          try {
            const validation = await FileImportService.validateFile(file);
            if (validation.isValid) {
              validatedFiles.push(file);
            } else {
              errors.push(`${file.name}: ${validation.errors.join(', ')}`);
            }
          } catch {
            errors.push(`${file.name}: Validation failed`);
          }
        }
        
        if (errors.length > 0) {
          Alert.alert(
            'File Validation Issues',
            `Some files have issues:\n\n${errors.join('\n')}`,
            [{ text: 'OK' }]
          );
        }
        
        setSelectedFiles(validatedFiles);
      }
    } catch (error) {
      console.error('Error selecting files:', error);
      
      let errorMessage = 'Failed to select files. Please try again.';
      if (Platform.OS === 'ios') {
        const errorMsg = error instanceof Error ? error.message : '';
        if (errorMsg?.includes('permission')) {
          errorMessage = 'Please grant file access permission in iOS Settings > Privacy & Security > Files and Folders';
        } else if (errorMsg?.includes('icloud')) {
          errorMessage = 'iCloud file access failed. Please ensure iCloud Drive is enabled and the file is downloaded.';
        }
      }
      
      Alert.alert('File Selection Error', errorMessage, [{ text: 'OK' }]);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleStartImport = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert(
        'No Files Selected',
        'Please select at least one file to import.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      // Convert ImportedFile[] to the format expected by onFileImport
      const filesToImport = selectedFiles.map(file => ({
        uri: file.uri,
        name: file.name,
        type: file.type,
      }));
      
      await onFileImport(filesToImport);
      setSelectedFiles([]); // Clear selection after successful start
    } catch (error) {
      console.error('Error starting import:', error);
    }
  };

  const handleCloudStorageAuth = async (providerId: string) => {
    try {
      setCloudStorage(prev => ({ ...prev, isAuthenticating: true }));
      
      const success = await CloudStorageService.authenticateProvider(providerId);
      if (success) {
        setCloudStorage(prev => ({ ...prev, selectedProvider: providerId }));
        Alert.alert(
          'Authentication Successful',
          `Connected to ${providerId}. You can now browse and import files.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Authentication Failed',
          `Failed to connect to ${providerId}. Please try again.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Cloud storage authentication error:', error);
      Alert.alert(
        'Authentication Error',
        'Failed to authenticate with cloud storage provider.',
        [{ text: 'OK' }]
      );
    } finally {
      setCloudStorage(prev => ({ ...prev, isAuthenticating: false }));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(filesList => filesList.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string): keyof typeof Icon.glyphMap => {
    if (type.includes('csv') || type.includes('excel') || type.includes('spreadsheet')) {
      return 'table-chart';
    } else if (type.includes('pdf')) {
      return 'picture-as-pdf';
    } else if (type.includes('xml')) {
      return 'code';
    } else if (type.includes('json')) {
      return 'data-usage';
    }
    return 'description';
  };

  const getSupportedFormats = () => {
    if (Platform.OS === 'ios') {
      return FileImportService.getSupportedFileTypes().map(format => ({
        name: format.type,
        desc: format.description,
        icon: getFormatIcon(format.type),
        recommended: format.recommended,
        extensions: format.extensions.join(', '),
      }));
    }
    
    // Fallback for other platforms
    const formats = [
      { name: 'CSV Files', desc: 'Comma-separated values from exports', icon: 'table-chart', recommended: true },
      { name: 'Excel Files', desc: 'Spreadsheet files (.xlsx, .xls)', icon: 'table-chart', recommended: true },
      { name: 'XML Files', desc: 'SMS Backup & Restore format', icon: 'code', recommended: false },
      { name: 'JSON Files', desc: 'Structured data format', icon: 'data-usage', recommended: true },
      { name: 'PDF Files', desc: 'Carrier billing statements', icon: 'picture-as-pdf', recommended: false },
    ];
    return formats;
  };

  const getFormatIcon = (formatType: string) => {
    if (formatType.toLowerCase().includes('csv') || formatType.toLowerCase().includes('excel')) {
      return 'table-chart';
    } else if (formatType.toLowerCase().includes('pdf')) {
      return 'picture-as-pdf';
    } else if (formatType.toLowerCase().includes('json')) {
      return 'data-usage';
    } else if (formatType.toLowerCase().includes('archive')) {
      return 'archive';
    }
    return 'description';
  };

  const getIOSGuidance = () => {
    if (Platform.OS === 'ios') {
      return FileImportService.getIOSGuidance();
    }
    return null;
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#2196F3" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Import Files</Text>
          {selectedMethod && (
            <Text style={styles.subtitle}>
              {selectedMethod.name}
            </Text>
          )}
        </View>
      </View>

      {/* Method Instructions - iOS Specific */}
      {Platform.OS === 'ios' ? (
        <View style={styles.instructionsCard}>
          <View style={styles.cardHeader}>
            <Icon name="info" size={20} color="#2196F3" />
            <Text style={styles.cardTitle}>{getIOSGuidance()?.title || 'Before You Start'}</Text>
          </View>
          <Text style={styles.instructionsText}>
            {getIOSGuidance()?.description || selectedMethod?.description}
          </Text>
          
          <View style={styles.stepsList}>
            <Text style={styles.stepsTitle}>Required Steps:</Text>
            {(getIOSGuidance()?.steps || selectedMethod?.steps?.slice(0, -1) || []).map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
          
          {getIOSGuidance()?.tips && (
            <View style={styles.stepsList}>
              <Text style={styles.stepsTitle}>iOS Tips:</Text>
              {getIOSGuidance()?.tips.map((tip, index) => (
                <View key={index} style={styles.stepItem}>
                  <Text style={styles.stepNumber}>💡</Text>
                  <Text style={styles.stepText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : selectedMethod && (
        <View style={styles.instructionsCard}>
          <View style={styles.cardHeader}>
            <Icon name="info" size={20} color="#2196F3" />
            <Text style={styles.cardTitle}>Before You Start</Text>
          </View>
          <Text style={styles.instructionsText}>
            {selectedMethod.description}
          </Text>
          
          <View style={styles.stepsList}>
            <Text style={styles.stepsTitle}>Required Steps:</Text>
            {selectedMethod.steps.slice(0, -1).map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Supported Formats */}
      <View style={styles.formatsCard}>
        <Text style={styles.cardTitle}>Supported File Formats</Text>
        {getSupportedFormats().map((format, index) => (
          <View key={index} style={[styles.formatItem, format.recommended && styles.recommendedFormat]}>
            <Icon name={format.icon as keyof typeof Icon.glyphMap} size={20} color={format.recommended ? '#4CAF50' : '#666'} />
            <View style={styles.formatInfo}>
              <View style={styles.formatHeader}>
                <Text style={styles.formatName}>{format.name}</Text>
                {format.recommended && (
                  <Text style={styles.recommendedBadge}>RECOMMENDED</Text>
                )}
              </View>
              <Text style={styles.formatDesc}>{format.desc}</Text>
              {'extensions' in format && format.extensions ? (
                <Text style={styles.formatExtensions}>{String(format.extensions)}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {/* Cloud Storage Options - iOS */}
      {Platform.OS === 'ios' && cloudStorage.supportInfo?.iCloudAvailable && (
        <View style={styles.cloudStorageCard}>
          <View style={styles.cardHeader}>
            <Icon name="cloud" size={20} color="#2196F3" />
            <Text style={styles.cardTitle}>Cloud Storage Access</Text>
            <TouchableOpacity
              onPress={() => setShowCloudOptions(!showCloudOptions)}
              style={styles.expandButton}
            >
              <Icon 
                name={showCloudOptions ? 'expand-less' : 'expand-more'} 
                size={20} 
                color="#666" 
              />
            </TouchableOpacity>
          </View>
          
          {showCloudOptions && (
            <View style={styles.cloudProviders}>
              {cloudStorage.providers.map((provider) => (
                <TouchableOpacity
                  key={provider.id}
                  style={[
                    styles.providerItem,
                    CloudStorageService.isProviderAuthenticated(provider.id) && styles.authenticatedProvider
                  ]}
                  onPress={() => handleCloudStorageAuth(provider.id)}
                  disabled={cloudStorage.isAuthenticating}
                >
                  <Text style={styles.providerIcon}>{provider.icon}</Text>
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{provider.name}</Text>
                    <Text style={styles.providerStatus}>
                      {CloudStorageService.isProviderAuthenticated(provider.id) 
                        ? 'Connected' 
                        : provider.authRequired ? 'Tap to connect' : 'Available'
                      }
                    </Text>
                  </View>
                  {CloudStorageService.isProviderAuthenticated(provider.id) && (
                    <Icon name="check-circle" size={20} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* File Selection */}
      <View style={styles.selectionCard}>
        <Text style={styles.cardTitle}>Select Files to Import</Text>
        
        <TouchableOpacity
          style={styles.selectButton}
          onPress={handleFileSelection}
          disabled={isSelecting}
        >
          <Icon name="upload-file" size={24} color="#2196F3" />
          <Text style={styles.selectButtonText}>
            {isSelecting ? 'Selecting Files...' : 'Choose Files'}
          </Text>
        </TouchableOpacity>

        {selectedFiles.length > 0 && (
          <View style={styles.selectedFiles}>
            <Text style={styles.selectedFilesTitle}>
              Selected Files ({selectedFiles.length})
            </Text>
            {selectedFiles.map((file, index) => (
              <View key={index} style={styles.fileItem}>
                <Icon name={getFileIcon(file.type) as keyof typeof Icon.glyphMap} size={20} color="#666" />
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName}>{file.name}</Text>
                  <Text style={styles.fileType}>{file.type}</Text>
                  {file.isCloudFile && (
                    <Text style={styles.cloudIndicator}>
                      ☁️ {file.cloudProvider ? file.cloudProvider.toUpperCase() : 'CLOUD'}
                    </Text>
                  )}
                  {file.size && (
                    <Text style={styles.fileSize}>
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => removeFile(index)}
                  style={styles.removeButton}
                >
                  <Icon name="close" size={20} color="#F44336" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Import Actions */}
      {selectedFiles.length > 0 && (
        <View style={styles.actionsCard}>
          <TouchableOpacity
            style={styles.importButton}
            onPress={handleStartImport}
          >
            <Icon name="cloud-upload" size={24} color="#fff" />
            <Text style={styles.importButtonText}>
              Start Import ({selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSelectedFiles([])}
          >
            <Text style={styles.clearButtonText}>Clear Selection</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tips */}
      <View style={styles.tipsCard}>
        <View style={styles.cardHeader}>
          <Icon name="lightbulb" size={20} color="#FF9800" />
          <Text style={styles.cardTitle}>Tips for Better Results</Text>
        </View>
        <View style={styles.tipsList}>
          <Text style={styles.tipItem}>• Ensure files are not corrupted or password protected</Text>
          <Text style={styles.tipItem}>• Use CSV format when possible for faster processing</Text>
          <Text style={styles.tipItem}>• Import files one data source at a time to avoid duplicates</Text>
          <Text style={styles.tipItem}>• Check file size limits (recommended under 100MB)</Text>
          <Text style={styles.tipItem}>• Include date ranges that don't overlap with previous imports</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  instructionsCard: {
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  stepsList: {
    marginTop: 8,
  },
  stepsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
    width: 20,
  },
  stepText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
    lineHeight: 18,
  },
  formatsCard: {
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
  formatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  formatInfo: {
    flex: 1,
    marginLeft: 12,
  },
  formatName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  formatDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  selectionCard: {
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
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#2196F3',
    borderStyle: 'dashed',
    marginTop: 12,
  },
  selectButtonText: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '500',
    marginLeft: 8,
  },
  selectedFiles: {
    marginTop: 16,
  },
  selectedFilesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  fileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  fileType: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  removeButton: {
    padding: 4,
  },
  actionsCard: {
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
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  importButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  clearButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#666',
  },
  tipsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tipsList: {
    marginTop: 8,
  },
  tipItem: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    marginBottom: 4,
  },
  // iOS-specific styles
  recommendedFormat: {
    backgroundColor: '#f8fff8',
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  formatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendedBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  formatExtensions: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    fontStyle: 'italic',
  },
  cloudStorageCard: {
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
  expandButton: {
    padding: 4,
    marginLeft: 'auto',
  },
  cloudProviders: {
    marginTop: 12,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  authenticatedProvider: {
    backgroundColor: '#e8f5e8',
    borderColor: '#4CAF50',
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
  cloudIndicator: {
    fontSize: 10,
    color: '#2196F3',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  fileSize: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
});