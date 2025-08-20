/**
 * Enhanced Export Hook
 * React hook for advanced export functionality with cloud integration
 */

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { UIEvent } from '../../screens/EventsScreen/types';
import {
  ExportOptions,
  ExportResult,
  ExportProgress,
  ExportFormat,
  CloudProviderType,
  CloudExportOptions,
  SizeEstimate
} from '../../types/export';
import { enhancedExportService } from '../../services/export/EnhancedExportService';
import { cloudStorageService } from '../../services/export/CloudStorageService';

interface UseEnhancedExportProps {
   
  onExportComplete?: (_result: ExportResult) => void;
   
  onExportError?: (_error: string) => void;
}

interface UseEnhancedExportReturn {
  // State
  isExporting: boolean;
  exportProgress: ExportProgress | null;
  availableFormats: Array<{
    format: ExportFormat;
    name: string;
    description: string;
    icon: string;
  }>;
  cloudProviders: Array<{
    type: CloudProviderType;
    name: string;
    enabled: boolean;
    authenticated: boolean;
  }>;

  // Actions
  exportWithFormat: (
    _events: UIEvent[],
    _options: ExportOptions,
    _cloudOptions?: CloudExportOptions
  ) => Promise<ExportResult>;
  
  shareExport: (_events: UIEvent[], _options: ExportOptions) => Promise<void>;
  
  authenticateCloud: (_provider: CloudProviderType) => Promise<boolean>;
  
  getEstimatedSize: (
    _events: UIEvent[],
    _format: ExportFormat,
    _includeContent?: boolean
  ) => SizeEstimate;
  
  getExportHistory: () => Promise<ExportResult[]>;
  
  // Reset
  resetProgress: () => void;
}

export function useEnhancedExport({
  onExportComplete,
  onExportError
}: UseEnhancedExportProps = {}): UseEnhancedExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [availableFormats, setAvailableFormats] = useState<Array<{
    format: ExportFormat;
    name: string;
    description: string;
    icon: string;
  }>>([]);
  const [cloudProviders, setCloudProviders] = useState<Array<{
    type: CloudProviderType;
    name: string;
    enabled: boolean;
    authenticated: boolean;
  }>>([]);

  // Initialize available formats
  useEffect(() => {
    const formats = enhancedExportService.getAvailableFormats();
    setAvailableFormats(formats);
  }, []);

  // Initialize cloud providers
  useEffect(() => {
    const providers = cloudStorageService.getAvailableProviders();
    setCloudProviders(providers);
  }, []);

  // Progress callback
  const progressCallback = useCallback((progress: ExportProgress) => {
    setExportProgress(progress);
  }, []);

  /**
   * Export with specified format
   */
  const exportWithFormat = useCallback(async (
    events: UIEvent[],
    options: ExportOptions,
    cloudOptions?: CloudExportOptions
  ): Promise<ExportResult> => {
    if (events.length === 0) {
      throw new Error('No events to export');
    }

    setIsExporting(true);
    setExportProgress(null);

    try {
      // Perform the export
      const result = await enhancedExportService.exportEvents(
        events,
        options,
        progressCallback
      );

      // Upload to cloud if requested
      if (cloudOptions?.provider && result.uri) {
        try {
          setExportProgress({
            total: 100,
            processed: 90,
            percentage: 90,
            status: 'uploading',
            stage: `Uploading to ${cloudOptions.provider}`
          });

          const cloudResult = await cloudStorageService.uploadToCloud(
            result.uri,
            result.filename,
            cloudOptions
          );

          // Update result with cloud information
          result.cloudUrl = cloudResult.url;

          setExportProgress({
            total: 100,
            processed: 100,
            percentage: 100,
            status: 'complete',
            stage: 'Export uploaded to cloud'
          });

        } catch (cloudError) {
          console.warn('Cloud upload failed:', cloudError);
          // Continue with local export, but show warning
          Alert.alert(
            'Cloud Upload Failed',
            'Export was saved locally, but failed to upload to cloud storage.',
            [{ text: 'OK' }]
          );
        }
      }

      onExportComplete?.(result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      onExportError?.(errorMessage);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, [progressCallback, onExportComplete, onExportError]);

  /**
   * Share export
   */
  const shareExport = useCallback(async (
    events: UIEvent[],
    options: ExportOptions
  ): Promise<void> => {
    if (events.length === 0) {
      throw new Error('No events to share');
    }

    setIsExporting(true);
    setExportProgress(null);

    try {
      await enhancedExportService.shareExport(events, options, progressCallback);
      onExportComplete?.({
        success: true,
        filename: `shared_export.${options.format}`,
        size: 0,
        format: options.format
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Share failed';
      onExportError?.(errorMessage);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, [progressCallback, onExportComplete, onExportError]);

  /**
   * Authenticate with cloud provider
   */
  const authenticateCloud = useCallback(async (
    provider: CloudProviderType
  ): Promise<boolean> => {
    try {
      const success = await cloudStorageService.authenticate(provider);
      
      if (success) {
        // Update provider authentication status
        setCloudProviders(prev => prev.map(p => 
          p.type === provider ? { ...p, authenticated: true, enabled: true } : p
        ));
      }

      return success;

    } catch (error) {
      console.error(`Authentication failed for ${provider}:`, error);
      Alert.alert(
        'Authentication Failed',
        `Could not authenticate with ${provider}. Please try again.`
      );
      return false;
    }
  }, []);

  /**
   * Get estimated export size
   */
  const getEstimatedSize = useCallback((
    events: UIEvent[],
    format: ExportFormat,
    includeContent: boolean = true
  ): SizeEstimate => {
    return enhancedExportService.getEstimatedSize(events, format, includeContent);
  }, []);

  /**
   * Get export history
   */
  const getExportHistory = useCallback(async (): Promise<ExportResult[]> => {
    try {
      const cloudHistory = await cloudStorageService.getUploadHistory();
      // Convert ExportHistoryItem[] to ExportResult[]
      return cloudHistory.map(item => ({
        success: true,
        filename: item.filename,
        size: item.size,
        format: item.format,
        uri: 'uri' in item ? (item as unknown as { uri: string }).uri : undefined,
        cloudUrl: 'cloudUrl' in item ? (item as unknown as { cloudUrl: string }).cloudUrl : undefined
      }));
    } catch (error) {
      console.error('Failed to get export history:', error);
      return [];
    }
  }, []);

  /**
   * Reset progress state
   */
  const resetProgress = useCallback(() => {
    setExportProgress(null);
  }, []);

  return {
    // State
    isExporting,
    exportProgress,
    availableFormats,
    cloudProviders,

    // Actions
    exportWithFormat,
    shareExport,
    authenticateCloud,
    getEstimatedSize,
    getExportHistory,

    // Reset
    resetProgress
  };
}