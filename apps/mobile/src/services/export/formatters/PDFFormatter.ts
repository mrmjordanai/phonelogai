/**
 * PDF Formatter - Stub Implementation
 * TODO: Implement when react-native-pdf-lib is properly installed and configured
 */

import { UIEvent } from '../../../screens/EventsScreen/types';
import { PDFExportOptions, ExportProgressCallback } from '../../../types/export';

export class PDFFormatter {
  static async generatePDF(
    events: UIEvent[],
    options: PDFExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<Uint8Array> {
    onProgress?.({
      processed: 0,
      total: events.length,
      percentage: 0,
      status: 'error',
      stage: 'PDF formatter not implemented'
    });
    
    throw new Error('PDF formatter not yet implemented - install react-native-pdf-lib');
  }

  static async createReport(
    events: UIEvent[],
    options: PDFExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<Uint8Array> {
    return this.generatePDF(events, options, onProgress);
  }

  static async formatToPDF(
    events: UIEvent[],
    options: PDFExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<Uint8Array> {
    return this.generatePDF(events, options, onProgress);
  }
}