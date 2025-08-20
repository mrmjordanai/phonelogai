/**
 * ZIP Formatter
 * Handles ZIP archive creation with multiple export formats
 */

import { zip } from 'react-native-zip-archive';
import * as FileSystem from 'expo-file-system';
import { UIEvent } from '../../../screens/EventsScreen/types';
import { ZIPExportOptions, ExportProgressCallback, ExportFormat } from '../../../types/export';
import { ExcelFormatter } from './ExcelFormatter';
import { PDFFormatter } from './PDFFormatter';

export class ZIPFormatter {
  private excelFormatter: ExcelFormatter;
  private pdfFormatter: PDFFormatter;

  constructor() {
    this.excelFormatter = new ExcelFormatter();
    this.pdfFormatter = new PDFFormatter();
  }

  /**
   * Create ZIP archive containing multiple export formats
   */
  async formatToZIP(
    events: UIEvent[],
    options: ZIPExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<string> {
    const {
      includeFormats = ['csv', 'json', 'excel'],
      separateByType = false,
      includeMetadata = true,
      filename
    } = options;

    try {
      onProgress?.({
        total: includeFormats.length,
        processed: 0,
        percentage: 0,
        status: 'preparing',
        stage: 'Initializing ZIP creation'
      });

      // Create temporary directory for files
      const tempDir = `${FileSystem.documentDirectory}temp_export_${Date.now()}`;
      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });

      const filePaths: string[] = [];

      try {
        // Process each format
        for (let i = 0; i < includeFormats.length; i++) {
          const format = includeFormats[i];
          
          onProgress?.({
            total: includeFormats.length,
            processed: i,
            percentage: Math.round((i / includeFormats.length) * 80),
            status: 'processing',
            stage: `Creating ${format.toUpperCase()} export`
          });

          if (separateByType) {
            const contactFiles = await this.createContactSeparatedFiles(events, format, tempDir, options);
            filePaths.push(...contactFiles);
          } else {
            const filePath = await this.createSingleFormatFile(events, format, tempDir, options);
            if (filePath) {
              filePaths.push(filePath);
            }
          }
        }

        // Add metadata file if requested
        if (includeMetadata) {
          const metadataPath = await this.createMetadataFile(events, tempDir, options);
          filePaths.push(metadataPath);
        }

        onProgress?.({
          total: includeFormats.length,
          processed: includeFormats.length,
          percentage: 85,
          status: 'processing',
          stage: 'Creating ZIP archive'
        });

        // Create ZIP file
        const zipFilename = filename || `events_export_${Date.now()}.zip`;
        const zipPath = `${FileSystem.documentDirectory}${zipFilename}`;

        await zip(filePaths, zipPath);

        onProgress?.({
          total: includeFormats.length,
          processed: includeFormats.length,
          percentage: 95,
          status: 'processing',
          stage: 'Finalizing ZIP archive'
        });

        // Clean up temporary files
        await this.cleanupTempFiles(tempDir);

        onProgress?.({
          total: includeFormats.length,
          processed: includeFormats.length,
          percentage: 100,
          status: 'complete',
          stage: 'ZIP export complete'
        });

        return zipPath;

      } catch (error) {
        // Clean up on error
        await this.cleanupTempFiles(tempDir);
        throw error;
      }

    } catch (error) {
      onProgress?.({
        total: includeFormats.length,
        processed: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'ZIP export failed'
      });
      throw error;
    }
  }

  /**
   * Create files separated by contact
   */
  private async createContactSeparatedFiles(
    events: UIEvent[],
    format: ExportFormat,
    tempDir: string,
    options: ZIPExportOptions
  ): Promise<string[]> {
    const filePaths: string[] = [];

    // Group events by contact
    const contactGroups = this.groupEventsByContact(events);

    for (const [contactName, contactEvents] of contactGroups.entries()) {
      const sanitizedContactName = this.sanitizeFilename(contactName);
      const filePath = await this.createSingleFormatFile(
        contactEvents,
        format,
        tempDir,
        {
          ...options,
          filename: `${sanitizedContactName}_${format}`
        }
      );

      if (filePath) {
        filePaths.push(filePath);
      }
    }

    return filePaths;
  }

  /**
   * Create single format file
   */
  private async createSingleFormatFile(
    events: UIEvent[],
    format: ExportFormat,
    tempDir: string,
    options: ZIPExportOptions
  ): Promise<string | null> {
    const baseFilename = options.filename || `events_${format}`;
    const filePath = `${tempDir}/${baseFilename}.${format}`;

    try {
      switch (format) {
        case 'csv': {
          const csvContent = await this.generateCSVContent(events, options);
          await FileSystem.writeAsStringAsync(filePath, csvContent);
          break;
        }

        case 'json': {
          const jsonContent = await this.generateJSONContent(events, options);
          await FileSystem.writeAsStringAsync(filePath, jsonContent);
          break;
        }

        case 'excel': {
          const excelBuffer = await this.excelFormatter.formatToExcel(events, {
            ...options,
            format: 'excel'
          });
          // Convert ArrayBuffer to base64 string for file writing
          const excelBase64 = this.arrayBufferToBase64(excelBuffer);
          await FileSystem.writeAsStringAsync(filePath, excelBase64, {
            encoding: FileSystem.EncodingType.Base64
          });
          break;
        }

        case 'pdf': {
          const pdfBuffer = await PDFFormatter.formatToPDF(events, {
            ...options,
            format: 'pdf',
            template: 'detailed'
          });
          // Convert Uint8Array to base64 string for file writing
          const pdfBase64 = this.uint8ArrayToBase64(pdfBuffer);
          await FileSystem.writeAsStringAsync(filePath, pdfBase64, {
            encoding: FileSystem.EncodingType.Base64
          });
          break;
        }

        default: {
          console.warn(`Unsupported format for ZIP: ${format}`);
          return null;
        }
      }

      return filePath;

    } catch (error) {
      console.error(`Failed to create ${format} file:`, error);
      return null;
    }
  }

  /**
   * Create metadata file with export information
   */
  private async createMetadataFile(
    events: UIEvent[],
    tempDir: string,
    options: ZIPExportOptions
  ): Promise<string> {
    const metadata = {
      export_info: {
        created_at: new Date().toISOString(),
        total_events: events.length,
        formats_included: options.includeFormats,
        options: {
          include_private: options.includePrivate,
          include_content: options.includeContent,
          separate_by_type: options.separateByType
        },
        version: '1.0'
      },
      statistics: this.generateStatistics(events),
      contacts: this.generateContactSummary(events)
    };

    const metadataPath = `${tempDir}/export_metadata.json`;
    await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(metadata, null, 2));

    return metadataPath;
  }

  /**
   * Generate CSV content
   */
  private async generateCSVContent(events: UIEvent[], options: ZIPExportOptions): Promise<string> {
    const { includePrivate = false, includeContent = true } = options;

    // Filter events
    const filteredEvents = events.filter(event => {
      if (!includePrivate && event.is_anonymized) {
        return false;
      }
      return true;
    });

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

    // Add events
    filteredEvents.forEach(event => {
      const row = this.formatEventForCSV(event, includeContent, includePrivate);
      csvContent += row + '\n';
    });

    return csvContent;
  }

  /**
   * Generate JSON content
   */
  private async generateJSONContent(events: UIEvent[], options: ZIPExportOptions): Promise<string> {
    const { includePrivate = false, includeContent = true } = options;

    const processedEvents: unknown[] = [];

    events.forEach(event => {
      if (!includePrivate && event.is_anonymized) {
        return;
      }

      const processedEvent = this.formatEventForJSON(event, includeContent, includePrivate);
      processedEvents.push(processedEvent);
    });

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

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Group events by contact
   */
  private groupEventsByContact(events: UIEvent[]): Map<string, UIEvent[]> {
    const groups = new Map<string, UIEvent[]>();

    events.forEach(event => {
      const contactName = event.display_name || event.display_number || event.number || 'Unknown';
      
      if (!groups.has(contactName)) {
        groups.set(contactName, []);
      }
      
      groups.get(contactName)!.push(event);
    });

    return groups;
  }

  /**
   * Generate statistics for metadata
   */
  private generateStatistics(events: UIEvent[]) {
    const calls = events.filter(e => e.type === 'call').length;
    const sms = events.filter(e => e.type === 'sms').length;
    const incoming = events.filter(e => e.direction === 'inbound').length;
    const outgoing = events.filter(e => e.direction === 'outbound').length;

    const uniqueContacts = new Set(
      events.map(e => e.display_name || e.display_number || e.number)
    ).size;

    const dates = events.map(e => new Date(e.ts)).sort((a, b) => a.getTime() - b.getTime());
    const dateRange = {
      start: dates[0]?.toISOString() || '',
      end: dates[dates.length - 1]?.toISOString() || ''
    };

    return {
      total_events: events.length,
      calls,
      sms,
      incoming,
      outgoing,
      unique_contacts: uniqueContacts,
      date_range: dateRange
    };
  }

  /**
   * Generate contact summary for metadata
   */
  private generateContactSummary(events: UIEvent[]) {
    const contactCounts = new Map<string, number>();
    
    events.forEach(event => {
      const key = event.display_name || event.display_number || event.number || 'Unknown';
      contactCounts.set(key, (contactCounts.get(key) || 0) + 1);
    });

    return Array.from(contactCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, event_count: count }));
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
   * Sanitize filename for file system
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
  }

  /**
   * Convert ArrayBuffer to base64 string
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
   * Convert Uint8Array to base64 string
   */
  private uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = '';
    
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    
    return btoa(binary);
  }

  /**
   * Clean up temporary files
   */
  private async cleanupTempFiles(tempDir: string): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(tempDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(tempDir, { idempotent: true });
      }
    } catch (error) {
      console.warn('Failed to cleanup temp files:', error);
    }
  }
}