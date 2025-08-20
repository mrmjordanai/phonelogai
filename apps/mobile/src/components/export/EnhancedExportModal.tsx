/**
 * Enhanced Export Modal
 * Comprehensive export interface with multiple formats and cloud integration
 */

import React, { useState, useEffect } from 'react';
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
import { UIEvent } from '../../screens/EventsScreen/types';
import {
  ExportFormat,
  ExportOptions,
  CloudProviderType,
  SizeEstimate
} from '../../types/export';
import { useEnhancedExport } from '../../hooks/export/useEnhancedExport';
import { ExportFormatSelector } from './ExportFormatSelector';
import { CloudStorageSelector } from './CloudStorageSelector';
import { ExportProgressTracker } from './ExportProgressTracker';

interface EnhancedExportModalProps {
  visible: boolean;
  events: UIEvent[];
  context: 'events' | 'dashboard' | 'contacts' | 'analytics';
  onClose: () => void;
  onExportComplete?: (_result: unknown) => void;
}

interface ExportStep {
  id: string;
  title: string;
  completed: boolean;
  active: boolean;
}

export function EnhancedExportModal({
  visible,
  events,
  context,
  onClose,
  onExportComplete
}: EnhancedExportModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'csv',
    includePrivate: false,
    includeContent: true,
    compression: false
  });
  const [cloudOptions, setCloudOptions] = useState<{
    enabled: boolean;
    provider?: CloudProviderType;
    folder?: string;
  }>({
    enabled: false
  });
  const [sizeEstimate, setSizeEstimate] = useState<SizeEstimate | null>(null);

  const {
    isExporting,
    exportProgress,
    availableFormats,
    cloudProviders,
    exportWithFormat,
    shareExport,
    getEstimatedSize,
    resetProgress
  } = useEnhancedExport({
    onExportComplete: (result) => {
      onExportComplete?.(result);
      handleComplete();
    },
    onExportError: (error) => {
      Alert.alert('Export Failed', error);
    }
  });

  const exportSteps: ExportStep[] = [
    { id: 'format', title: 'Choose Format', completed: false, active: true },
    { id: 'options', title: 'Export Options', completed: false, active: false },
    { id: 'cloud', title: 'Cloud Storage', completed: false, active: false },
    { id: 'confirm', title: 'Confirm & Export', completed: false, active: false }
  ];

  const [steps, setSteps] = useState(exportSteps);

  useEffect(() => {
    if (visible) {
      // Reset state when modal opens
      setCurrentStep(0);
      setSelectedFormat('csv');
      setExportOptions({
        format: 'csv',
        includePrivate: false,
        includeContent: true,
        compression: false
      });
      setCloudOptions({ enabled: false });
      resetProgress();
      updateSteps(0);
    }
  }, [visible]);

  useEffect(() => {
    // Update size estimate when options change
    if (events.length > 0) {
      const estimate = getEstimatedSize(events, selectedFormat, exportOptions.includeContent);
      setSizeEstimate(estimate);
    }
  }, [selectedFormat, exportOptions, events]);

  const updateSteps = (activeStep: number) => {
    const updatedSteps = steps.map((step, index) => ({
      ...step,
      completed: index < activeStep,
      active: index === activeStep
    }));
    setSteps(updatedSteps);
  };

  const handleFormatSelect = (format: ExportFormat) => {
    setSelectedFormat(format);
    setExportOptions(prev => ({ ...prev, format }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      updateSteps(nextStep);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      updateSteps(prevStep);
    }
  };

  const handleExport = async () => {
    if (events.length === 0) {
      Alert.alert('No Data', 'There are no events to export.');
      return;
    }

    try {
      if (cloudOptions.enabled && cloudOptions.provider) {
        // Export to cloud
        await exportWithFormat(events, {
          ...exportOptions,
          filename: `${context}_export_${Date.now()}.${selectedFormat}`
        }, {
          format: selectedFormat,
          cloudProvider: cloudOptions.provider,
          cloudFolder: cloudOptions.folder,
          enableCloudSync: true
        });
      } else {
        // Local export
        await exportWithFormat(events, {
          ...exportOptions,
          filename: `${context}_export_${Date.now()}.${selectedFormat}`
        });
      }
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert(
        'Export Failed',
        error instanceof Error ? error.message : 'An unknown error occurred'
      );
    }
  };

  const handleShare = async () => {
    try {
      await shareExport(events, exportOptions);
    } catch (error) {
      console.error('Share failed:', error);
      Alert.alert(
        'Share Failed',
        error instanceof Error ? error.message : 'Failed to share export'
      );
    }
  };

  const handleComplete = () => {
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleClose = () => {
    if (isExporting) {
      Alert.alert(
        'Export in Progress',
        'An export is currently in progress. Are you sure you want to cancel?',
        [
          { text: 'Continue Export', style: 'cancel' },
          {
            text: 'Cancel Export',
            style: 'destructive',
            onPress: () => {
              resetProgress();
              onClose();
            }
          }
        ]
      );
    } else {
      onClose();
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {steps.map((step, index) => (
        <View key={step.id} style={styles.stepContainer}>
          <View
            style={[
              styles.stepCircle,
              step.completed && styles.stepCompleted,
              step.active && styles.stepActive
            ]}
          >
            <Text
              style={[
                styles.stepNumber,
                (step.completed || step.active) && styles.stepNumberActive
              ]}
            >
              {step.completed ? '✓' : index + 1}
            </Text>
          </View>
          <Text style={[styles.stepTitle, step.active && styles.stepTitleActive]}>
            {step.title}
          </Text>
          {index < steps.length - 1 && <View style={styles.stepConnector} />}
        </View>
      ))}
    </View>
  );

  const renderFormatStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>
        Choose the export format that best suits your needs:
      </Text>
      <ExportFormatSelector
        formats={availableFormats}
        selectedFormat={selectedFormat}
        onFormatSelect={handleFormatSelect}
        sizeEstimate={sizeEstimate}
      />
    </View>
  );

  const renderOptionsStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>
        Configure your export options:
      </Text>
      
      <View style={styles.optionCard}>
        <View style={styles.optionRow}>
          <View style={styles.optionInfo}>
            <Text style={styles.optionLabel}>Include Private Contacts</Text>
            <Text style={styles.optionDescription}>
              Export anonymized contacts with masked information
            </Text>
          </View>
          <Switch
            value={exportOptions.includePrivate}
            onValueChange={(value) =>
              setExportOptions(prev => ({ ...prev, includePrivate: value }))
            }
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
            value={exportOptions.includeContent}
            onValueChange={(value) =>
              setExportOptions(prev => ({ ...prev, includeContent: value }))
            }
            disabled={isExporting}
          />
        </View>

        {selectedFormat === 'zip' && (
          <View style={styles.optionRow}>
            <View style={styles.optionInfo}>
              <Text style={styles.optionLabel}>Enable Compression</Text>
              <Text style={styles.optionDescription}>
                Reduce file size with compression
              </Text>
            </View>
            <Switch
              value={exportOptions.compression}
              onValueChange={(value) =>
                setExportOptions(prev => ({ ...prev, compression: value }))
              }
              disabled={isExporting}
            />
          </View>
        )}
      </View>

      {sizeEstimate && (
        <View style={styles.estimateCard}>
          <Text style={styles.estimateTitle}>Export Estimate</Text>
          <Text style={styles.estimateSize}>Size: {sizeEstimate.readable}</Text>
          <Text style={styles.estimateTime}>
            Estimated time: {sizeEstimate.estimatedTime}s
          </Text>
        </View>
      )}
    </View>
  );

  const renderCloudStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>
        Choose where to save your export:
      </Text>
      
      <View style={styles.optionCard}>
        <View style={styles.optionRow}>
          <View style={styles.optionInfo}>
            <Text style={styles.optionLabel}>Save to Cloud Storage</Text>
            <Text style={styles.optionDescription}>
              Automatically upload to your cloud storage
            </Text>
          </View>
          <Switch
            value={cloudOptions.enabled}
            onValueChange={(value) =>
              setCloudOptions(prev => ({ ...prev, enabled: value }))
            }
            disabled={isExporting}
          />
        </View>
      </View>

      {cloudOptions.enabled && (
        <CloudStorageSelector
          providers={cloudProviders}
          selectedProvider={cloudOptions.provider}
          onProviderSelect={(provider) =>
            setCloudOptions(prev => ({ ...prev, provider }))
          }
          folder={cloudOptions.folder}
          onFolderChange={(folder) =>
            setCloudOptions(prev => ({ ...prev, folder }))
          }
        />
      )}
    </View>
  );

  const renderConfirmStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepDescription}>
        Review your export settings:
      </Text>
      
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Format:</Text>
          <Text style={styles.summaryValue}>{selectedFormat.toUpperCase()}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Events:</Text>
          <Text style={styles.summaryValue}>{events.length}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Include Private:</Text>
          <Text style={styles.summaryValue}>
            {exportOptions.includePrivate ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Include Content:</Text>
          <Text style={styles.summaryValue}>
            {exportOptions.includeContent ? 'Yes' : 'No'}
          </Text>
        </View>
        {cloudOptions.enabled && (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cloud Storage:</Text>
              <Text style={styles.summaryValue}>
                {typeof cloudOptions.provider === 'string' ? cloudOptions.provider.replace('-', ' ').toUpperCase() : 'Unknown'}
              </Text>
            </View>
            {cloudOptions.folder && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Folder:</Text>
                <Text style={styles.summaryValue}>{cloudOptions.folder}</Text>
              </View>
            )}
          </>
        )}
        {sizeEstimate && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Estimated Size:</Text>
            <Text style={styles.summaryValue}>{sizeEstimate.readable}</Text>
          </View>
        )}
      </View>

      {isExporting && exportProgress && (
        <ExportProgressTracker progress={exportProgress} />
      )}
    </View>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderFormatStep();
      case 1:
        return renderOptionsStep();
      case 2:
        return renderCloudStep();
      case 3:
        return renderConfirmStep();
      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return selectedFormat !== null;
      case 1:
        return true;
      case 2:
        return !cloudOptions.enabled || cloudOptions.provider;
      case 3:
        return true;
      default:
        return false;
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
          <Text style={styles.headerTitle}>Enhanced Export</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Step Indicator */}
          {renderStepIndicator()}

          {/* Step Content */}
          {renderStepContent()}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          {currentStep === 3 ? (
            <View style={styles.finalActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.shareButton]}
                onPress={handleShare}
                disabled={isExporting}
              >
                <Text style={styles.shareButtonText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.exportButton]}
                onPress={handleExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.exportButtonText}>Export</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.navigationButtons}>
              {currentStep > 0 && (
                <TouchableOpacity
                  style={[styles.navButton, styles.prevButton]}
                  onPress={handlePrevious}
                  disabled={isExporting}
                >
                  <Text style={styles.prevButtonText}>Previous</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.navButton,
                  styles.nextButton,
                  !canProceed() && styles.disabledButton
                ]}
                onPress={handleNext}
                disabled={!canProceed() || isExporting}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
  
  // Step Indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  stepContainer: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepCompleted: {
    backgroundColor: '#10B981',
  },
  stepActive: {
    backgroundColor: '#3B82F6',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  stepNumberActive: {
    color: '#FFFFFF',
  },
  stepTitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  stepTitleActive: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  stepConnector: {
    position: 'absolute',
    top: 16,
    left: '100%',
    width: '100%',
    height: 1,
    backgroundColor: '#E5E7EB',
    zIndex: -1,
  },

  // Step Content
  stepContent: {
    marginBottom: 24,
  },
  stepDescription: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 20,
    textAlign: 'center',
  },

  // Options
  optionCard: {
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

  // Estimate Card
  estimateCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  estimateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  estimateSize: {
    fontSize: 14,
    color: '#6B7280',
  },
  estimateTime: {
    fontSize: 14,
    color: '#6B7280',
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },

  // Footer
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  navButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  prevButton: {
    backgroundColor: '#F3F4F6',
  },
  nextButton: {
    backgroundColor: '#3B82F6',
  },
  disabledButton: {
    backgroundColor: '#E5E7EB',
  },
  prevButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  finalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButton: {
    backgroundColor: '#F3F4F6',
  },
  exportButton: {
    backgroundColor: '#3B82F6',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
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

export default EnhancedExportModal;