import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FileImportButton } from './FileImportButton';
import { UploadProgress } from './UploadProgress';
import { 
  FileImportService, 
  ImportedFile, 
  FileValidationResult,
  UploadProgress as UploadProgressType 
} from '../../services/ios/FileImportService';
import { PlatformDetector } from '../../utils/PlatformDetector';

export const FileImportScreen: React.FC = () => {
  const [uploads, setUploads] = useState<Map<string, UploadProgressType>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updateUploadProgress = useCallback((progress: UploadProgressType) => {
    setUploads(prev => new Map(prev.set(progress.fileId, progress)));
  }, []);

  const handleFilesSelected = async (files: ImportedFile[]) => {
    // Start upload for each valid file
    for (const file of files) {
      try {
        await FileImportService.uploadFile(file, updateUploadProgress);
      } catch (error: unknown) {
        console.error('FileImportScreen: Upload failed for file:', file.name, error);
        Alert.alert(
          'Upload Failed',
          `Failed to upload "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
          [{ text: 'OK' }]
        );
      }
    }
  };

  const handleValidationComplete = (file: ImportedFile, validation: FileValidationResult) => {
    if (validation.warnings.length > 0) {
      Alert.alert(
        `File Warnings: ${file.name}`,
        validation.warnings.join('\n\n'),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'default' }
        ]
      );
    }
  };

  const handleCancelUpload = (fileId: string) => {
    const success = FileImportService.cancelUpload(fileId);
    if (!success) {
      Alert.alert('Error', 'Could not cancel upload');
    }
  };

  const handleRetryUpload = (fileId: string) => {
    const progress = uploads.get(fileId);
    if (progress) {
      Alert.alert(
        'Retry Upload',
        'Please select the file again to retry the upload.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Clear completed/failed uploads after refresh
    setUploads(prev => {
      const filtered = new Map();
      prev.forEach((progress, fileId) => {
        if (progress.status === 'uploading' || progress.status === 'pending' || progress.status === 'processing') {
          filtered.set(fileId, progress);
        }
      });
      return filtered;
    });
    setIsRefreshing(false);
  };

  const getInstructionText = () => {
    if (PlatformDetector.isIOS) {
      return "iOS doesn't allow automatic data collection. Upload carrier data files (CDR, CSV, PDF) from your phone's Files app or cloud storage.";
    } else if (PlatformDetector.isAndroid) {
      return "Android allows automatic data collection, but you can also manually import carrier files for additional data sources.";
    } else {
      return "Import carrier data files to analyze your communication patterns.";
    }
  };

  const getSupportedFormats = () => {
    return [
      { format: 'CSV', description: 'Call detail records from carriers' },
      { format: 'PDF', description: 'Carrier statements and bills' },
      { format: 'Excel', description: 'Spreadsheet data from carriers' },
      { format: 'JSON', description: 'Exported data from other apps' },
      { format: 'ZIP', description: 'Compressed archives with multiple files' },
    ];
  };

  useFocusEffect(
    useCallback(() => {
      // Clean up any old upload states when screen focuses
      const activeUploads = FileImportService.getActiveUploads();
      setUploads(prev => {
        const filtered = new Map();
        activeUploads.forEach(fileId => {
          if (prev.has(fileId)) {
            filtered.set(fileId, prev.get(fileId)!);
          }
        });
        return filtered;
      });
    }, [])
  );

  const uploadArray = Array.from(uploads.values());

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Import Data</Text>
          <Text style={styles.subtitle}>{getInstructionText()}</Text>
        </View>

        <FileImportButton
          onFilesSelected={handleFilesSelected}
          onValidationComplete={handleValidationComplete}
          style={styles.importButton}
        />

        {uploadArray.length > 0 && (
          <View style={styles.uploadsSection}>
            <Text style={styles.sectionTitle}>File Uploads</Text>
            {uploadArray.map(progress => (
              <UploadProgress
                key={progress.fileId}
                progress={progress}
                onCancel={handleCancelUpload}
                onRetry={handleRetryUpload}
              />
            ))}
          </View>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Supported File Formats</Text>
          {getSupportedFormats().map((item, index) => (
            <View key={index} style={styles.formatItem}>
              <Text style={styles.formatName}>{item.format}</Text>
              <Text style={styles.formatDescription}>{item.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tipsSection}>
          <Text style={styles.sectionTitle}>Import Tips</Text>
          <View style={styles.tipItem}>
            <Text style={styles.tipText}>
              • Contact your carrier to request call detail records (CDR)
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipText}>
              • Larger files may take several minutes to process
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipText}>
              • Multiple files will be merged and deduplicated automatically
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipText}>
              • Keep the app open during upload for best performance
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  importButton: {
    marginBottom: 24,
  },
  uploadsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  infoSection: {
    marginBottom: 24,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
  },
  formatItem: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  formatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  formatDescription: {
    fontSize: 14,
    color: '#666',
  },
  tipsSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  tipItem: {
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});