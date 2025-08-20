import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FileImportService, ImportedFile, FileValidationResult } from '../../services/ios/FileImportService';
import { PlatformDetector } from '../../utils/PlatformDetector';

interface FileImportButtonProps {
  onFilesSelected?: (_files: ImportedFile[]) => void;
  onValidationComplete?: (_file: ImportedFile, _validation: FileValidationResult) => void;
  disabled?: boolean;
  style?: object;
  title?: string;
  subtitle?: string;
  allowMultiple?: boolean;
  maxFileSize?: number; // in MB
}

export const FileImportButton: React.FC<FileImportButtonProps> = ({
  onFilesSelected,
  onValidationComplete,
  disabled = false,
  style,
  title = "Import Carrier Data",
  subtitle = "Upload CSV, PDF, or Excel files",
  allowMultiple = true,
  maxFileSize = 100, // 100MB default
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleImportPress = async () => {
    if (!FileImportService.isAvailable) {
      Alert.alert(
        'File Import Unavailable',
        'File import is not supported on this platform.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsLoading(true);

      const files = await FileImportService.pickFiles({
        allowMultipleSelection: allowMultiple,
        maxFileSize: maxFileSize * 1024 * 1024, // Convert MB to bytes
      });

      if (files.length === 0) {
        setIsLoading(false);
        return; // User cancelled selection
      }

      // Validate each selected file
      const validatedFiles: ImportedFile[] = [];
      for (const file of files) {
        const validation = await FileImportService.validateFile(file);
        
        if (onValidationComplete) {
          onValidationComplete(file, validation);
        }

        if (validation.isValid) {
          validatedFiles.push(file);
        } else {
          // Show validation errors
          Alert.alert(
            `Invalid File: ${file.name}`,
            validation.errors.join('\n'),
            [{ text: 'OK' }]
          );
        }
      }

      if (validatedFiles.length > 0 && onFilesSelected) {
        onFilesSelected(validatedFiles);
      }

    } catch (error: unknown) {
      console.error('FileImportButton: Error importing files:', error);
      Alert.alert(
        'Import Error',
        error instanceof Error ? error.message : 'Failed to import files. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getSubtitle = () => {
    if (PlatformDetector.isIOS) {
      return "Upload carrier data files from your device";
    } else if (PlatformDetector.isAndroid) {
      return "Import files or enable automatic data collection";
    } else {
      return subtitle;
    }
  };

  if (!FileImportService.isAvailable) {
    return (
      <View style={[styles.container, styles.unavailable, style]}>
        <Ionicons name="document-outline" size={24} color="#999" />
        <Text style={styles.unavailableText}>File import not available</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, disabled && styles.disabled, style]}
      onPress={handleImportPress}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#007AFF" />
      ) : (
        <Ionicons name="cloud-upload-outline" size={24} color="#007AFF" />
      )}
      
      <View style={styles.textContainer}>
        <Text style={[styles.title, disabled && styles.disabledText]}>
          {title}
        </Text>
        <Text style={[styles.subtitle, disabled && styles.disabledText]}>
          {getSubtitle()}
        </Text>
      </View>

      {!isLoading && (
        <Ionicons name="chevron-forward" size={16} color="#007AFF" />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  disabled: {
    opacity: 0.6,
    backgroundColor: '#f5f5f5',
  },
  disabledText: {
    color: '#999',
  },
  unavailable: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
  },
  unavailableText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
  },
});