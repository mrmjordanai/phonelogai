/**
 * Export Service for Events Screen
 * Handles CSV and JSON export functionality with progress tracking
 */

import { UIEvent } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';

interface ExportOptions {
  format: 'csv' | 'json';
  includePrivate?: boolean;
  includeContent?: boolean;
  filename?: string;
}

interface ExportProgress {
  total: number;
  processed: number;
  percentage: number;
  status: 'preparing' | 'processing' | 'complete' | 'error';
  error?: string;
}

export type ExportProgressCallback = (_progress: ExportProgress) => void;

class ExportService {
  private static instance: ExportService;
  
  static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }

  /**
   * Export events to CSV format
   */
  async exportToCSV(
    events: UIEvent[], 
    options: Omit<ExportOptions, 'format'> = {},
    onProgress?: ExportProgressCallback
  ): Promise<string> {
    const { includePrivate = false, includeContent = true } = options;
    
    try {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'preparing'
      });

      // Filter events based on privacy settings
      const filteredEvents = events.filter(event => {
        if (!includePrivate && event.is_anonymized) {
          return false;
        }
        return true;
      });

      // CSV headers
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

      // Process events in batches for better performance
      const batchSize = 50;
      for (let i = 0; i < filteredEvents.length; i += batchSize) {
        const batch = filteredEvents.slice(i, i + batchSize);
        
        for (const event of batch) {
          const row = this.formatEventForCSV(event, includeContent, includePrivate);
          csvContent += row + '\n';
        }

        // Update progress
        const processed = Math.min(i + batchSize, filteredEvents.length);
        onProgress?.({
          total: filteredEvents.length,
          processed,
          percentage: Math.round((processed / filteredEvents.length) * 100),
          status: 'processing'
        });

        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      onProgress?.({
        total: filteredEvents.length,
        processed: filteredEvents.length,
        percentage: 100,
        status: 'complete'
      });

      return csvContent;
    } catch (error) {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Export failed'
      });
      throw error;
    }
  }

  /**
   * Export events to JSON format
   */
  async exportToJSON(
    events: UIEvent[], 
    options: Omit<ExportOptions, 'format'> = {},
    onProgress?: ExportProgressCallback
  ): Promise<string> {
    const { includePrivate = false, includeContent = true } = options;

    try {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'preparing'
      });

      // Filter and process events
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
          percentage: Math.round((processed / events.length) * 100),
          status: 'processing'
        });

        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 10));
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

      onProgress?.({
        total: events.length,
        processed: events.length,
        percentage: 100,
        status: 'complete'
      });

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Export failed'
      });
      throw error;
    }
  }

  /**
   * Share exported data
   */
  async shareExport(
    events: UIEvent[], 
    options: ExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<void> {
    try {
      let content: string;
      let title: string;
      // let mimeType: string; // TODO: Use for file sharing

      if (options.format === 'csv') {
        content = await this.exportToCSV(events, options, onProgress);
        title = 'Events Export (CSV)';
        // mimeType = 'text/csv'; // TODO: Use for file sharing
      } else {
        content = await this.exportToJSON(events, options, onProgress);
        title = 'Events Export (JSON)';
        // mimeType = 'application/json'; // TODO: Use for file sharing
      }

      // const filename = options.filename || `events_export_${Date.now()}.${options.format}`; // TODO: Use for file sharing

      await Share.share({
        message: content,
        title,
        url: undefined, // For file sharing, we'd need to write to a temporary file
      });

    } catch (error) {
      throw new Error(`Failed to share export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save export to device storage
   */
  async saveExport(
    events: UIEvent[], 
    options: ExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<{ filename: string; size: number }> {
    try {
      let content: string;
      
      if (options.format === 'csv') {
        content = await this.exportToCSV(events, options, onProgress);
      } else {
        content = await this.exportToJSON(events, options, onProgress);
      }

      const filename = options.filename || `events_export_${Date.now()}.${options.format}`;
      const storageKey = `export_${filename}`;

      // Save to AsyncStorage (in a real app, you'd want to use a proper file system)
      await AsyncStorage.setItem(storageKey, content);

      return {
        filename,
        size: content.length * 2 // Approximate size in bytes (UTF-8 estimation)
      };

    } catch (error) {
      throw new Error(`Failed to save export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get available export formats
   */
  getAvailableFormats(): Array<{ format: 'csv' | 'json'; name: string; description: string }> {
    return [
      {
        format: 'csv',
        name: 'CSV (Comma Separated Values)',
        description: 'Compatible with Excel and other spreadsheet applications'
      },
      {
        format: 'json',
        name: 'JSON (JavaScript Object Notation)',
        description: 'Structured data format for technical use and analysis'
      }
    ];
  }

  /**
   * Get estimated export size
   */
  getEstimatedSize(
    events: UIEvent[], 
    format: 'csv' | 'json',
    includeContent: boolean = true
  ): { bytes: number; readable: string } {
    // Rough estimation based on event structure
    const avgEventSize = format === 'csv' 
      ? (includeContent ? 200 : 150) // bytes per event in CSV
      : (includeContent ? 400 : 300); // bytes per event in JSON
    
    const bytes = events.length * avgEventSize;
    const readable = this.formatFileSize(bytes);

    return { bytes, readable };
  }

  /**
   * Format event for CSV export
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
   * Format event for JSON export
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
   * Escape CSV values that contain commas, quotes, or newlines
   */
  private escapeCsvValue(value: string): string {
    if (!value) return '';
    
    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    
    return value;
  }

  /**
   * Format file size in human-readable format
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

export default ExportService;

// Export singleton instance
export const exportService = ExportService.getInstance();