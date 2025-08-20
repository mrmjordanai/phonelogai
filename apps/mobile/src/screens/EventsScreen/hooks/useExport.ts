import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { UIEvent } from '../types';
import { exportService, ExportProgressCallback } from '../services/ExportService';

interface UseExportProps {
  onExportComplete?: (_format: 'csv' | 'json', _filename: string) => void;
  onExportError?: (_error: string) => void;
}

interface ExportProgress {
  total: number;
  processed: number;
  percentage: number;
  status: 'preparing' | 'processing' | 'complete' | 'error';
  error?: string;
}

interface UseExportReturn {
  isExporting: boolean;
  exportProgress: ExportProgress | null;
  
  // Actions
  exportToCSV: (_events: UIEvent[], _options?: {
    includePrivate?: boolean;
    includeContent?: boolean;
    filename?: string;
  }) => Promise<void>;
  
  exportToJSON: (_events: UIEvent[], _options?: {
    includePrivate?: boolean;
    includeContent?: boolean;
    filename?: string;
  }) => Promise<void>;
  
  shareExport: (_events: UIEvent[], _format: 'csv' | 'json', _options?: {
    includePrivate?: boolean;
    includeContent?: boolean;
    filename?: string;
  }) => Promise<void>;
  
  getEstimatedSize: (_events: UIEvent[], _format: 'csv' | 'json', _includeContent?: boolean) => { bytes: number; readable: string };
  getAvailableFormats: () => Array<{ format: 'csv' | 'json'; name: string; description: string }>;
  
  // Reset progress
  resetProgress: () => void;
}

export function useExport({
  onExportComplete,
  onExportError
}: UseExportProps = {}): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  const progressCallback: ExportProgressCallback = useCallback((progress) => {
    setExportProgress(progress);
  }, []);

  const exportToCSV = useCallback(async (
    events: UIEvent[], 
    options: {
      includePrivate?: boolean;
      includeContent?: boolean;
      filename?: string;
    } = {}
  ) => {
    if (events.length === 0) {
      Alert.alert('No Data', 'There are no events to export.');
      return;
    }

    setIsExporting(true);
    setExportProgress(null);

    try {
      const result = await exportService.saveExport(
        events,
        {
          format: 'csv',
          ...options
        },
        progressCallback
      );

      onExportComplete?.('csv', result.filename);
      
      Alert.alert(
        'Export Complete',
        `Successfully exported ${events.length} events to CSV format.\nFile: ${result.filename}\nSize: ${exportService.getEstimatedSize(events, 'csv', options.includeContent).readable}`,
        [{ text: 'OK' }]
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export to CSV';
      onExportError?.(errorMessage);
      Alert.alert('Export Failed', errorMessage);
    } finally {
      setIsExporting(false);
    }
  }, [progressCallback, onExportComplete, onExportError]);

  const exportToJSON = useCallback(async (
    events: UIEvent[], 
    options: {
      includePrivate?: boolean;
      includeContent?: boolean;
      filename?: string;
    } = {}
  ) => {
    if (events.length === 0) {
      Alert.alert('No Data', 'There are no events to export.');
      return;
    }

    setIsExporting(true);
    setExportProgress(null);

    try {
      const result = await exportService.saveExport(
        events,
        {
          format: 'json',
          ...options
        },
        progressCallback
      );

      onExportComplete?.('json', result.filename);
      
      Alert.alert(
        'Export Complete',
        `Successfully exported ${events.length} events to JSON format.\nFile: ${result.filename}\nSize: ${exportService.getEstimatedSize(events, 'json', options.includeContent).readable}`,
        [{ text: 'OK' }]
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export to JSON';
      onExportError?.(errorMessage);
      Alert.alert('Export Failed', errorMessage);
    } finally {
      setIsExporting(false);
    }
  }, [progressCallback, onExportComplete, onExportError]);

  const shareExport = useCallback(async (
    events: UIEvent[], 
    format: 'csv' | 'json',
    options: {
      includePrivate?: boolean;
      includeContent?: boolean;
      filename?: string;
    } = {}
  ) => {
    if (events.length === 0) {
      Alert.alert('No Data', 'There are no events to share.');
      return;
    }

    setIsExporting(true);
    setExportProgress(null);

    try {
      await exportService.shareExport(
        events,
        {
          format,
          ...options
        },
        progressCallback
      );

      onExportComplete?.(format, `shared_export.${format}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to share ${format.toUpperCase()}`;
      onExportError?.(errorMessage);
      Alert.alert('Share Failed', errorMessage);
    } finally {
      setIsExporting(false);
    }
  }, [progressCallback, onExportComplete, onExportError]);

  const getEstimatedSize = useCallback((
    events: UIEvent[], 
    format: 'csv' | 'json',
    includeContent: boolean = true
  ) => {
    return exportService.getEstimatedSize(events, format, includeContent);
  }, []);

  const getAvailableFormats = useCallback(() => {
    return exportService.getAvailableFormats();
  }, []);

  const resetProgress = useCallback(() => {
    setExportProgress(null);
  }, []);

  return {
    isExporting,
    exportProgress,
    
    // Actions
    exportToCSV,
    exportToJSON,
    shareExport,
    getEstimatedSize,
    getAvailableFormats,
    
    // Reset
    resetProgress
  };
}