import * as React from 'react';
import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { UIEvent } from '../types';
import { useExport } from '../hooks/useExport';

interface ExportModalProps {
  visible: boolean;
  events: UIEvent[];
  onClose: () => void;
}

interface ExportOptionCardProps {
  format: 'csv' | 'json';
  name: string;
  description: string;
  estimatedSize: string;
  onPress: () => void;
  disabled?: boolean;
}

function ExportOptionCard({ format, name, description, estimatedSize, onPress, disabled }: ExportOptionCardProps) {
  const getIcon = () => {
    return format === 'csv' ? '📊' : '🔧';
  };

  return (
    <TouchableOpacity
      style={[styles.exportOption, disabled && styles.exportOptionDisabled]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <Text style={styles.exportOptionIcon}>{getIcon()}</Text>
      <View style={styles.exportOptionContent}>
        <Text style={styles.exportOptionName}>{name}</Text>
        <Text style={styles.exportOptionDescription}>{description}</Text>
        <Text style={styles.exportOptionSize}>Estimated size: {estimatedSize}</Text>
      </View>
      <Text style={styles.exportOptionArrow}>→</Text>
    </TouchableOpacity>
  );
}

interface ProgressBarProps {
  progress: number; // 0-100
  status: string;
}

function ProgressBar({ progress, status }: ProgressBarProps) {
  return (
    <View style={styles.progressContainer}>
      <Text style={styles.progressStatus}>{status}</Text>
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.progressPercentage}>{Math.round(progress)}%</Text>
    </View>
  );
}

export function ExportModal({ visible, events, onClose }: ExportModalProps) {
  const [includePrivate, setIncludePrivate] = useState(false);
  const [includeContent, setIncludeContent] = useState(true);

  const {
    isExporting,
    exportProgress,
    exportToCSV,
    exportToJSON,
    shareExport,
    getEstimatedSize,
    getAvailableFormats,
    resetProgress
  } = useExport({
    onExportComplete: (format, filename) => {
      Alert.alert(
        'Export Complete',
        `Successfully exported to ${format.toUpperCase()}\nFilename: ${filename}`,
        [
          { text: 'Share', onPress: () => handleShare(format) },
          { text: 'OK', onPress: onClose }
        ]
      );
    },
    onExportError: (error) => {
      Alert.alert('Export Failed', error);
    }
  });

  const availableFormats = getAvailableFormats();

  const handleExport = (format: 'csv' | 'json') => {
    const options = {
      includePrivate,
      includeContent,
      filename: `events_export_${new Date().toISOString().split('T')[0]}.${format}`
    };

    if (format === 'csv') {
      exportToCSV(events, options);
    } else {
      exportToJSON(events, options);
    }
  };

  const handleShare = (format: 'csv' | 'json') => {
    const options = {
      includePrivate,
      includeContent,
      filename: `events_export_${new Date().toISOString().split('T')[0]}.${format}`
    };

    shareExport(events, format, options);
  };

  const handleClose = () => {
    if (isExporting) {
      Alert.alert(
        'Export in Progress',
        'An export is currently in progress. Are you sure you want to cancel?',
        [
          { text: 'Continue Export', style: 'cancel' },
          { text: 'Cancel Export', style: 'destructive', onPress: () => {
            resetProgress();
            onClose();
          }}
        ]
      );
    } else {
      onClose();
    }
  };

  const getProgressStatus = () => {
    if (!exportProgress) return '';
    
    switch (exportProgress.status) {
      case 'preparing': return 'Preparing export...';
      case 'processing': return `Processing events... (${exportProgress.processed}/${exportProgress.total})`;
      case 'complete': return 'Export complete!';
      case 'error': return `Error: ${exportProgress.error || 'Unknown error'}`;
      default: return '';
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            disabled={isExporting}
          >
            <Text style={[styles.closeButtonText, isExporting && styles.disabledText]}>
              {isExporting ? 'Exporting...' : 'Cancel'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Export Events</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Export Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Export Summary</Text>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatValue}>{events.length}</Text>
                <Text style={styles.summaryStatLabel}>Total Events</Text>
              </View>
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatValue}>
                  {events.filter(e => e.type === 'call').length}
                </Text>
                <Text style={styles.summaryStatLabel}>Calls</Text>
              </View>
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatValue}>
                  {events.filter(e => e.type === 'sms').length}
                </Text>
                <Text style={styles.summaryStatLabel}>Messages</Text>
              </View>
            </View>
          </View>

          {/* Export Options */}
          <View style={styles.optionsCard}>
            <Text style={styles.optionsTitle}>Export Options</Text>
            
            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Text style={styles.optionLabel}>Include Private Contacts</Text>
                <Text style={styles.optionDescription}>
                  Export anonymized contacts with masked information
                </Text>
              </View>
              <Switch
                value={includePrivate}
                onValueChange={setIncludePrivate}
                disabled={isExporting}
              />
            </View>

            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Text style={styles.optionLabel}>Include Message Content</Text>
                <Text style={styles.optionDescription}>
                  Include SMS message text in export
                </Text>
              </View>
              <Switch
                value={includeContent}
                onValueChange={setIncludeContent}
                disabled={isExporting}
              />
            </View>
          </View>

          {/* Export Progress */}
          {isExporting && exportProgress && (
            <View style={styles.progressCard}>
              <Text style={styles.progressTitle}>Export Progress</Text>
              <ProgressBar
                progress={exportProgress.percentage}
                status={getProgressStatus()}
              />
            </View>
          )}

          {/* Format Selection */}
          {!isExporting && (
            <View style={styles.formatsCard}>
              <Text style={styles.formatsTitle}>Choose Export Format</Text>
              
              {availableFormats.map((formatOption) => {
                const size = getEstimatedSize(events, formatOption.format, includeContent);
                return (
                  <ExportOptionCard
                    key={formatOption.format}
                    format={formatOption.format}
                    name={formatOption.name}
                    description={formatOption.description}
                    estimatedSize={size.readable}
                    onPress={() => handleExport(formatOption.format)}
                  />
                );
              })}
            </View>
          )}

          {/* Quick Actions */}
          {!isExporting && (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle}>Quick Actions</Text>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => handleShare('csv')}
              >
                <Text style={styles.quickActionIcon}>📤</Text>
                <Text style={styles.quickActionText}>Share as CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => handleShare('json')}
              >
                <Text style={styles.quickActionIcon}>📤</Text>
                <Text style={styles.quickActionText}>Share as JSON</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Loading Overlay */}
        {isExporting && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },
  disabledText: {
    color: '#9CA3AF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 60,
  },
  content: {
    flex: 1,
    padding: 16,
  },

  // Summary Card
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStatItem: {
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 4,
  },
  summaryStatLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },

  // Options Card
  optionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  optionInfo: {
    flex: 1,
    marginRight: 16,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6B7280',
  },

  // Progress Card
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressStatus: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    textAlign: 'right',
  },

  // Formats Card
  formatsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  formatsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },

  // Export Option
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  exportOptionDisabled: {
    opacity: 0.5,
  },
  exportOptionIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 32,
    textAlign: 'center',
  },
  exportOptionContent: {
    flex: 1,
  },
  exportOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  exportOptionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  exportOptionSize: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  exportOptionArrow: {
    fontSize: 16,
    color: '#9CA3AF',
    marginLeft: 8,
  },

  // Quick Actions Card
  quickActionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  quickActionIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  quickActionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },

  // Loading Overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ExportModal;