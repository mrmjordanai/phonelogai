import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UploadProgress as UploadProgressType } from '../../services/ios/FileImportService';

interface UploadProgressProps {
  progress: UploadProgressType;
  onCancel?: (_fileId: string) => void;
  onRetry?: (_fileId: string) => void;
  style?: object;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({
  progress,
  onCancel,
  onRetry,
  style,
}) => {
  const getStatusIcon = () => {
    switch (progress.status) {
      case 'pending':
        return { name: 'hourglass-outline', color: '#666' };
      case 'uploading':
        return { name: 'cloud-upload-outline', color: '#007AFF' };
      case 'processing':
        return { name: 'cog-outline', color: '#FF9500' };
      case 'completed':
        return { name: 'checkmark-circle', color: '#34C759' };
      case 'failed':
        return { name: 'close-circle', color: '#FF3B30' };
      case 'cancelled':
        return { name: 'stop-circle-outline', color: '#666' };
      default:
        return { name: 'document-outline', color: '#666' };
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'pending':
        return 'Preparing...';
      case 'uploading':
        return `Uploading... ${progress.progress}%`;
      case 'processing':
        return 'Processing...';
      case 'completed':
        return 'Upload complete';
      case 'failed':
        return progress.error || 'Upload failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown status';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTimeRemaining = (seconds?: number): string => {
    if (!seconds) return '';
    if (seconds < 60) return `${Math.round(seconds)}s remaining`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m remaining`;
    return `${Math.round(seconds / 3600)}h remaining`;
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Upload',
      `Are you sure you want to cancel uploading "${progress.fileName}"?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => onCancel?.(progress.fileId),
        },
      ]
    );
  };

  const handleRetry = () => {
    onRetry?.(progress.fileId);
  };

  const icon = getStatusIcon();
  const canCancel = progress.status === 'uploading' || progress.status === 'pending';
  const canRetry = progress.status === 'failed';
  const showProgressBar = progress.status === 'uploading' || progress.status === 'processing';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Ionicons name={icon.name as keyof typeof Ionicons.glyphMap} size={20} color={icon.color} />
        <Text style={styles.fileName} numberOfLines={1}>
          {progress.fileName}
        </Text>
      </View>

      <View style={styles.statusContainer}>
        <Text style={[styles.statusText, { color: icon.color }]}>
          {getStatusText()}
        </Text>
        
        {progress.estimatedTimeRemaining && progress.status === 'uploading' && (
          <Text style={styles.timeRemaining}>
            {formatTimeRemaining(progress.estimatedTimeRemaining)}
          </Text>
        )}
      </View>

      {showProgressBar && (
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <View 
              style={[
                styles.progressBarFill, 
                { 
                  width: `${progress.progress}%`,
                  backgroundColor: progress.status === 'processing' ? '#FF9500' : '#007AFF'
                }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {formatFileSize(progress.bytesUploaded)} / {formatFileSize(progress.totalBytes)}
          </Text>
        </View>
      )}

      {progress.status === 'completed' && (
        <Text style={styles.completedText}>
          {formatFileSize(progress.totalBytes)} uploaded successfully
        </Text>
      )}

      <View style={styles.actions}>
        {canCancel && onCancel && (
          <TouchableOpacity style={styles.actionButton} onPress={handleCancel}>
            <Ionicons name="stop" size={16} color="#FF3B30" />
            <Text style={[styles.actionText, { color: '#FF3B30' }]}>Cancel</Text>
          </TouchableOpacity>
        )}

        {canRetry && onRetry && (
          <TouchableOpacity style={styles.actionButton} onPress={handleRetry}>
            <Ionicons name="refresh" size={16} color="#007AFF" />
            <Text style={[styles.actionText, { color: '#007AFF' }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fileName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginLeft: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  timeRemaining: {
    fontSize: 12,
    color: '#666',
  },
  progressBarContainer: {
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#e9ecef',
    borderRadius: 3,
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  completedText: {
    fontSize: 12,
    color: '#34C759',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f8f9fa',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
});