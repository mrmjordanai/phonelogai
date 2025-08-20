/**
 * Enhanced Export Service
 * Main service for advanced export functionality with multiple formats
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Share } from 'react-native';
import { UIEvent } from '../../screens/EventsScreen/types';
import {
  ExportOptions,
  ExportResult,
  ExportProgressCallback,
  ExportFormat,
  ExcelExportOptions,
  PDFExportOptions,
  ZIPExportOptions,
  SizeEstimate
} from '../../types/export';
import {
  ExportError,
  ExportValidationError,
  ExportProcessingError
} from '../../types/export/ExportTypes';
import { ExcelFormatter, PDFFormatter, ZIPFormatter } from './formatters';

export class EnhancedExportService {
  private static instance: EnhancedExportService;
  private excelFormatter: ExcelFormatter;
  private pdfFormatter: PDFFormatter;
  private zipFormatter: ZIPFormatter;

  private constructor() {
    this.excelFormatter = new ExcelFormatter();
    this.pdfFormatter = new PDFFormatter();
    this.zipFormatter = new ZIPFormatter();
  }

  static getInstance(): EnhancedExportService {
    if (!EnhancedExportService.instance) {
      EnhancedExportService.instance = new EnhancedExportService();
    }
    return EnhancedExportService.instance;
  }

  /**
   * Export events to specified format
   */
  async exportEvents(
    events: UIEvent[],
    options: ExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    try {
      // Validate input
      this.validateExportOptions(events, options);

      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'preparing',
        stage: 'Validating export options'
      });

      let result: ExportResult;

      switch (options.format) {
        case 'csv':
          result = await this.exportToCSV(events, options, onProgress);
          break;
        case 'json':
          result = await this.exportToJSON(events, options, onProgress);
          break;
        case 'excel':
          result = await this.exportToExcel(events, options as ExcelExportOptions, onProgress);
          break;
        case 'pdf':
          result = await this.exportToPDF(events, options as PDFExportOptions, onProgress);
          break;
        case 'zip':
          result = await this.exportToZIP(events, options as ZIPExportOptions, onProgress);
          break;
        default:
          throw new ExportValidationError(`Unsupported export format: ${options.format}`, 'format');
      }

      // Save export to history
      await this.saveExportHistory(result, options);

      return result;

    } catch (error) {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Export failed'
      });

      if (error instanceof ExportError) {
        throw error;
      }

      throw new ExportProcessingError(
        error instanceof Error ? error.message : 'Unknown export error',
        'export'
      );
    }
  }

  /**
   * Export to CSV format
   */
  private async exportToCSV(
    events: UIEvent[],
    options: ExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    const { includePrivate = false, includeContent = true } = options;

    try {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'preparing',
        stage: 'Preparing CSV export'
      });

      // Filter events
      const filteredEvents = events.filter(event => {
        if (!includePrivate && event.is_anonymized) {
          return false;
        }
        return true;
      });

      // Generate CSV content
      const csvContent = await this.generateCSVContent(filteredEvents, includeContent, includePrivate, onProgress);

      // Save to file
      const filename = options.filename || `events_export_${Date.now()}.csv`;
      const uri = await this.saveToFile(csvContent, filename);

      onProgress?.({
        total: filteredEvents.length,
        processed: filteredEvents.length,
        percentage: 100,
        status: 'complete'
      });

      return {
        success: true,
        filename,
        size: csvContent.length * 2, // UTF-8 estimation
        format: 'csv',
        uri
      };

    } catch (error) {
      throw new ExportProcessingError(
        error instanceof Error ? error.message : 'CSV export failed',
        'csv_generation'
      );
    }
  }

  /**
   * Export to JSON format
   */
  private async exportToJSON(
    events: UIEvent[],
    options: ExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    const { includePrivate = false, includeContent = true } = options;

    try {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'preparing',
        stage: 'Preparing JSON export'
      });

      // Process events
      const processedEvents: unknown[] = [];
      const batchSize = 50;

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);

        for (const event of batch) {
          if (!includePrivate && event.is_anonymized) {
            continue;
          }

          const processedEvent = this.formatEventForJSON(event, includeContent, includePrivate);
          processedEvents.push(processedEvent);
        }

        // Update progress
        const processed = Math.min(i + batchSize, events.length);
        onProgress?.({
          total: events.length,
          processed,
          percentage: Math.round((processed / events.length) * 80),
          status: 'processing',
          stage: `Processing events: ${processed}/${events.length}`
        });

        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const exportData = {
        export_info: {
          exported_at: new Date().toISOString(),
          total_events: processedEvents.length,
          include_private: includePrivate,
          include_content: includeContent,
          version: '1.0'
        },
        events: processedEvents
      };

      const jsonContent = JSON.stringify(exportData, null, 2);

      // Save to file
      const filename = options.filename || `events_export_${Date.now()}.json`;
      const uri = await this.saveToFile(jsonContent, filename);

      onProgress?.({
        total: events.length,
        processed: events.length,
        percentage: 100,
        status: 'complete'
      });

      return {
        success: true,
        filename,
        size: jsonContent.length * 2,
        format: 'json',
        uri
      };

    } catch (error) {
      throw new ExportProcessingError(
        error instanceof Error ? error.message : 'JSON export failed',
        'json_generation'
      );
    }
  }

  /**
   * Export to Excel format
   */
  private async exportToExcel(
    events: UIEvent[],
    options: ExcelExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    try {
      const excelBuffer = await this.excelFormatter.formatToExcel(events, options, onProgress);

      // Convert to base64 for file saving
      const base64Content = this.arrayBufferToBase64(excelBuffer);
      const filename = options.filename || `events_export_${Date.now()}.xlsx`;
      
      await FileSystem.writeAsStringAsync(
        `${FileSystem.documentDirectory}${filename}`,
        base64Content,
        { encoding: FileSystem.EncodingType.Base64 }
      );

      return {
        success: true,
        filename,
        size: excelBuffer.byteLength,
        format: 'excel',
        uri: `${FileSystem.documentDirectory}${filename}`
      };

    } catch (error) {
      throw new ExportProcessingError(
        error instanceof Error ? error.message : 'Excel export failed',
        'excel_generation'
      );
    }
  }

  /**
   * Export to PDF format
   */
  private async exportToPDF(
    events: UIEvent[],
    options: PDFExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    try {
      const pdfBytes = await PDFFormatter.formatToPDF(events, options, onProgress);

      // Convert to base64 for file saving
      const base64Content = this.uint8ArrayToBase64(pdfBytes);
      const filename = options.filename || `events_export_${Date.now()}.pdf`;

      await FileSystem.writeAsStringAsync(
        `${FileSystem.documentDirectory}${filename}`,
        base64Content,
        { encoding: FileSystem.EncodingType.Base64 }
      );

      return {
        success: true,
        filename,
        size: pdfBytes.byteLength,
        format: 'pdf',
        uri: `${FileSystem.documentDirectory}${filename}`
      };

    } catch (error) {
      throw new ExportProcessingError(
        error instanceof Error ? error.message : 'PDF export failed',
        'pdf_generation'
      );
    }
  }

  /**
   * Export to ZIP format
   */
  private async exportToZIP(
    events: UIEvent[],
    options: ZIPExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    try {
      const zipPath = await this.zipFormatter.formatToZIP(events, options, onProgress);
      const fileInfo = await FileSystem.getInfoAsync(zipPath);

      return {
        success: true,
        filename: zipPath.split('/').pop() || 'export.zip',
        size: fileInfo.exists ? (fileInfo as any).size || 0 : 0,
        format: 'zip',
        uri: zipPath
      };

    } catch (error) {
      throw new ExportProcessingError(
        error instanceof Error ? error.message : 'ZIP export failed',
        'zip_generation'
      );
    }
  }

  /**
   * Share export result
   */
  async shareExport(
    events: UIEvent[],
    options: ExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<void> {
    try {
      const result = await this.exportEvents(events, options, onProgress);

      await Share.share({
        url: result.uri,
        title: `Export: ${result.filename}`,
        message: `Exported ${events.length} events in ${options.format.toUpperCase()} format`
      });

    } catch (error) {
      throw new ExportProcessingError(
        error instanceof Error ? error.message : 'Failed to share export',
        'sharing'
      );
    }
  }

  /**
   * Get estimated export size
   */
  getEstimatedSize(
    events: UIEvent[],
    format: ExportFormat,
    includeContent: boolean = true
  ): SizeEstimate {
    let bytesPerEvent: number;
    let estimatedTimePerEvent: number; // milliseconds

    switch (format) {
      case 'csv':
        bytesPerEvent = includeContent ? 200 : 150;
        estimatedTimePerEvent = 0.1;
        break;
      case 'json':
        bytesPerEvent = includeContent ? 400 : 300;
        estimatedTimePerEvent = 0.2;
        break;
      case 'excel':
        bytesPerEvent = includeContent ? 300 : 250;
        estimatedTimePerEvent = 1;
        break;
      case 'pdf':
        bytesPerEvent = includeContent ? 500 : 350;
        estimatedTimePerEvent = 5;
        break;
      case 'zip':
        // Estimate for multiple formats (default: CSV + JSON + Excel)
        bytesPerEvent = includeContent ? 600 : 450;
        estimatedTimePerEvent = 3;
        break;
      default:
        bytesPerEvent = 200;
        estimatedTimePerEvent = 0.5;
    }

    const bytes = events.length * bytesPerEvent;
    const estimatedTime = Math.ceil((events.length * estimatedTimePerEvent) / 1000); // seconds

    return {
      estimatedSize: bytes,
      unit: this.getFileSizeUnit(bytes),
      formattedSize: this.formatFileSize(bytes),
      accuracy: 'medium',
      readable: this.formatFileSize(bytes),
      estimatedTime: estimatedTime * 1000 // Convert to milliseconds
    };
  }

  /**
   * Get available export formats
   */
  getAvailableFormats(): Array<{
    format: ExportFormat;
    name: string;
    description: string;
    icon: string;
  }> {
    return [
      {
        format: 'csv',
        name: 'CSV (Spreadsheet)',
        description: 'Compatible with Excel and other spreadsheet applications',
        icon: '📊'
      },
      {
        format: 'json',
        name: 'JSON (Structured Data)',
        description: 'Machine-readable format for technical use and analysis',
        icon: '🔧'
      },
      {
        format: 'excel',
        name: 'Excel Workbook',
        description: 'Native Excel format with charts and formatting',
        icon: '📈'
      },
      {
        format: 'pdf',
        name: 'PDF Report',
        description: 'Professional report format with analytics and charts',
        icon: '📄'
      },
      {
        format: 'zip',
        name: 'ZIP Archive',
        description: 'Multiple formats in a compressed archive',
        icon: '🗜️'
      }
    ];
  }

  /**
   * Validate export options
   */
  private validateExportOptions(events: UIEvent[], options: ExportOptions): void {
    if (!events || events.length === 0) {
      throw new ExportValidationError('No events provided for export', 'events');
    }

    if (!options.format) {
      throw new ExportValidationError('Export format is required', 'format');
    }

    const supportedFormats: ExportFormat[] = ['csv', 'json', 'excel', 'pdf', 'zip'];
    if (!supportedFormats.includes(options.format)) {
      throw new ExportValidationError(
        `Unsupported export format: ${options.format}`,
        'format'
      );
    }

    // Format-specific validations
    if (options.format === 'zip') {
      const zipOptions = options as ZIPExportOptions;
      if (!zipOptions.includeFormats || zipOptions.includeFormats.length === 0) {
        throw new ExportValidationError(
          'ZIP export requires at least one format to be included',
          'includeFormats'
        );
      }
    }

    if (options.format === 'pdf') {
      const pdfOptions = options as PDFExportOptions;
      if (pdfOptions.template === 'custom' && !pdfOptions.sections) {
        throw new ExportValidationError(
          'Custom PDF template requires sections to be specified',
          'sections'
        );
      }
    }
  }

  /**
   * Generate CSV content
   */
  private async generateCSVContent(
    events: UIEvent[],
    includeContent: boolean,
    includePrivate: boolean,
    onProgress?: ExportProgressCallback
  ): Promise<string> {
    // Headers
    const headers = [
      'ID',
      'Type',
      'Direction',
      'Date',
      'Time',
      'Display Name',
      'Number',
      'Duration (seconds)',
      'Status',
      'Source',
      ...(includeContent ? ['Content'] : [])
    ];

    let csvContent = headers.join(',') + '\n';

    // Process events in batches
    const batchSize = 50;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      for (const event of batch) {
        const row = this.formatEventForCSV(event, includeContent, includePrivate);
        csvContent += row + '\n';
      }

      // Update progress
      const processed = Math.min(i + batchSize, events.length);
      onProgress?.({
        total: events.length,
        processed,
        percentage: Math.round((processed / events.length) * 90),
        status: 'processing',
        stage: `Generating CSV: ${processed}/${events.length}`
      });

      await new Promise(resolve => setTimeout(resolve, 5));
    }

    return csvContent;
  }

  /**
   * Format event for CSV
   */
  private formatEventForCSV(event: UIEvent, includeContent: boolean, includePrivate: boolean): string {
    const date = new Date(event.ts);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();

    const displayName = includePrivate || !event.is_anonymized
      ? (event.display_name || '')
      : 'Private';

    const number = includePrivate || !event.is_anonymized
      ? (event.display_number || event.number)
      : 'Private';

    const content = includeContent && !event.is_anonymized
      ? (event.content || '')
      : '';

    const values = [
      event.id,
      event.type.toUpperCase(),
      event.direction,
      dateStr,
      timeStr,
      this.escapeCsvValue(displayName),
      this.escapeCsvValue(number),
      event.duration || '',
      event.status || '',
      event.source || '',
      ...(includeContent ? [this.escapeCsvValue(content)] : [])
    ];

    return values.join(',');
  }

  /**
   * Format event for JSON
   */
  private formatEventForJSON(event: UIEvent, includeContent: boolean, includePrivate: boolean): Record<string, unknown> {
    const processedEvent: Record<string, unknown> = {
      id: event.id,
      type: event.type,
      direction: event.direction,
      timestamp: event.ts,
      display_name: includePrivate || !event.is_anonymized ? event.display_name : 'Private',
      number: includePrivate || !event.is_anonymized ? (event.display_number || event.number) : 'Private',
      status: event.status,
      source: event.source,
      is_anonymized: event.is_anonymized || false
    };

    if (event.type === 'call' && event.duration) {
      processedEvent.duration_seconds = event.duration;
    }

    if (includeContent && event.content && !event.is_anonymized) {
      processedEvent.content = event.content;
    }

    if (event.contact_id) {
      processedEvent.contact_id = event.contact_id;
    }

    return processedEvent;
  }

  /**
   * Save content to file
   */
  private async saveToFile(content: string, filename: string): Promise<string> {
    const uri = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, content);
    return uri;
  }

  /**
   * Save export to history
   */
  private async saveExportHistory(result: ExportResult, options: ExportOptions): Promise<void> {
    try {
      const historyKey = 'export_history';
      const existingHistory = await AsyncStorage.getItem(historyKey);
      const history = existingHistory ? JSON.parse(existingHistory) : [];

      const historyItem = {
        id: `export_${Date.now()}`,
        filename: result.filename,
        format: result.format,
        size: result.size,
        created_at: new Date().toISOString(),
        status: 'completed',
        options: {
          includePrivate: options.includePrivate,
          includeContent: options.includeContent
        }
      };

      history.unshift(historyItem);

      // Keep only last 50 exports
      const trimmedHistory = history.slice(0, 50);

      await AsyncStorage.setItem(historyKey, JSON.stringify(trimmedHistory));
    } catch (error) {
      console.warn('Failed to save export history:', error);
    }
  }

  /**
   * Escape CSV values
   */
  private escapeCsvValue(value: string): string {
    if (!value) return '';

    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }

  /**
   * Format file size
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * Get file size unit
   */
  private getFileSizeUnit(bytes: number): 'bytes' | 'KB' | 'MB' | 'GB' {
    if (bytes < 1024) return 'bytes';
    if (bytes < 1024 * 1024) return 'KB';
    if (bytes < 1024 * 1024 * 1024) return 'MB';
    return 'GB';
  }

  /**
   * Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
  }

  /**
   * Convert Uint8Array to base64
   */
  private uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = '';

    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }

    return btoa(binary);
  }
}

// Export singleton instance
export const enhancedExportService = EnhancedExportService.getInstance();