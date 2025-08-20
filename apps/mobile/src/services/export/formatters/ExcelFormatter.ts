/**
 * Excel Formatter
 * Handles Excel (.xlsx) export generation using xlsx library
 */

import * as XLSX from 'xlsx';
import { UIEvent } from '../../../screens/EventsScreen/types';
import { ExcelExportOptions, ExportProgressCallback } from '../../../types/export';

export class ExcelFormatter {
  /**
   * Format events data to Excel (.xlsx) format
   */
  async formatToExcel(
    events: UIEvent[],
    options: ExcelExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ArrayBuffer> {
    const {
      includePrivate = false,
      includeContent = true,
      sheetName = 'Events Data',
      includeCharts = false,
      autoFilter = true,
      freezeHeaders = true
    } = options;

    try {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'preparing',
        stage: 'Initializing Excel workbook'
      });

      // Create new workbook
      const workbook = XLSX.utils.book_new();

      // Filter events based on privacy settings
      const filteredEvents = events.filter(event => {
        if (!includePrivate && event.is_anonymized) {
          return false;
        }
        return true;
      });

      onProgress?.({
        total: filteredEvents.length,
        processed: 0,
        percentage: 10,
        status: 'processing',
        stage: 'Processing events data'
      });

      // Prepare worksheet data
      const worksheetData = await this.prepareWorksheetData(
        filteredEvents,
        includeContent,
        includePrivate,
        onProgress
      );

      onProgress?.({
        total: filteredEvents.length,
        processed: filteredEvents.length,
        percentage: 80,
        status: 'processing',
        stage: 'Creating Excel worksheet'
      });

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

      // Apply formatting
      this.applyWorksheetFormatting(worksheet, {
        autoFilter,
        freezeHeaders,
        includeContent
      });

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      // Add summary sheet if requested
      if (includeCharts) {
        await this.addSummarySheet(workbook, filteredEvents);
      }

      onProgress?.({
        total: filteredEvents.length,
        processed: filteredEvents.length,
        percentage: 95,
        status: 'processing',
        stage: 'Generating Excel file'
      });

      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, {
        type: 'array',
        bookType: 'xlsx',
        compression: true
      });

      onProgress?.({
        total: filteredEvents.length,
        processed: filteredEvents.length,
        percentage: 100,
        status: 'complete',
        stage: 'Excel export complete'
      });

      return excelBuffer as ArrayBuffer;

    } catch (error) {
      onProgress?.({
        total: events.length,
        processed: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Excel export failed'
      });
      throw error;
    }
  }

  /**
   * Prepare worksheet data as array of arrays
   */
  private async prepareWorksheetData(
    events: UIEvent[],
    includeContent: boolean,
    includePrivate: boolean,
    onProgress?: ExportProgressCallback
  ): Promise<unknown[][]> {
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

    const data: unknown[][] = [headers];

    // Process events in batches
    const batchSize = 100;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      for (const event of batch) {
        const row = this.formatEventRow(event, includeContent, includePrivate);
        data.push(row);
      }

      // Update progress
      const processed = Math.min(i + batchSize, events.length);
      onProgress?.({
        total: events.length,
        processed,
        percentage: Math.round(20 + (processed / events.length) * 50),
        status: 'processing',
        stage: `Processing events: ${processed}/${events.length}`
      });

      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    return data;
  }

  /**
   * Format single event as Excel row
   */
  private formatEventRow(
    event: UIEvent,
    includeContent: boolean,
    includePrivate: boolean
  ): unknown[] {
    const date = new Date(event.ts);

    const displayName = includePrivate || !event.is_anonymized
      ? (event.display_name || '')
      : 'Private';

    const number = includePrivate || !event.is_anonymized
      ? (event.display_number || event.number)
      : 'Private';

    const content = includeContent && !event.is_anonymized
      ? (event.content || '')
      : '';

    const row = [
      event.id,
      event.type.toUpperCase(),
      event.direction,
      date.toLocaleDateString(),
      date.toLocaleTimeString(),
      displayName,
      number,
      event.duration || '',
      event.status || '',
      event.source || '',
      ...(includeContent ? [content] : [])
    ];

    return row;
  }

  /**
   * Apply formatting to worksheet
   */
  private applyWorksheetFormatting(
    worksheet: XLSX.WorkSheet,
    options: {
      autoFilter: boolean;
      freezeHeaders: boolean;
      includeContent: boolean;
    }
  ): void {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    // Auto-fit column widths
    const columnWidths = [
      { wch: 15 }, // ID
      { wch: 8 },  // Type
      { wch: 10 }, // Direction
      { wch: 12 }, // Date
      { wch: 12 }, // Time
      { wch: 20 }, // Display Name
      { wch: 15 }, // Number
      { wch: 12 }, // Duration
      { wch: 10 }, // Status
      { wch: 12 }, // Source
      ...(options.includeContent ? [{ wch: 30 }] : []) // Content
    ];

    worksheet['!cols'] = columnWidths;

    // Apply auto filter
    if (options.autoFilter) {
      worksheet['!autofilter'] = {
        ref: `A1:${XLSX.utils.encode_col(range.e.c)}${range.e.r + 1}`
      };
    }

    // Freeze header row
    if (options.freezeHeaders) {
      worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    }

    // Style header row
    for (let col = 0; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!worksheet[cellRef]) continue;

      worksheet[cellRef].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '3B82F6' } },
        alignment: { horizontal: 'center' }
      };
    }
  }

  /**
   * Add summary sheet with charts and statistics
   */
  private async addSummarySheet(workbook: XLSX.WorkBook, events: UIEvent[]): Promise<void> {
    const summary = this.generateSummaryData(events);
    
    // Convert summary to worksheet format
    const summaryData = [
      ['Summary Report', ''],
      ['Generated', new Date().toLocaleString()],
      ['Total Events', events.length],
      [''],
      ['Event Types', 'Count'],
      ['Calls', summary.calls],
      ['SMS', summary.sms],
      [''],
      ['Directions', 'Count'],
      ['Incoming', summary.incoming],
      ['Outgoing', summary.outgoing],
      [''],
      ['Time Period', ''],
      ['From', summary.dateRange.start],
      ['To', summary.dateRange.end],
      [''],
      ['Top Contacts', 'Event Count'],
      ...summary.topContacts.map(contact => [contact.name, contact.count])
    ];

    const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Style summary sheet
    summaryWorksheet['!cols'] = [{ wch: 20 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
  }

  /**
   * Generate summary statistics
   */
  private generateSummaryData(events: UIEvent[]) {
    const calls = events.filter(e => e.type === 'call').length;
    const sms = events.filter(e => e.type === 'sms').length;
    const incoming = events.filter(e => e.direction === 'inbound').length;
    const outgoing = events.filter(e => e.direction === 'outbound').length;

    // Calculate date range
    const dates = events.map(e => new Date(e.ts)).sort((a, b) => a.getTime() - b.getTime());
    const dateRange = {
      start: dates[0]?.toLocaleDateString() || '',
      end: dates[dates.length - 1]?.toLocaleDateString() || ''
    };

    // Calculate top contacts
    const contactCounts = new Map<string, number>();
    events.forEach(event => {
      const key = event.display_name || event.display_number || event.number || 'Unknown';
      contactCounts.set(key, (contactCounts.get(key) || 0) + 1);
    });

    const topContacts = Array.from(contactCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      calls,
      sms,
      incoming,
      outgoing,
      dateRange,
      topContacts
    };
  }
}