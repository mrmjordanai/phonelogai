/**
 * Enhanced Export Types
 * Comprehensive type definitions for advanced export functionality
 */

export type ExportFormat = 'csv' | 'json' | 'excel' | 'pdf' | 'zip';

export interface ExportOptions {
  format: ExportFormat;
  includePrivate?: boolean;
  includeContent?: boolean;
  filename?: string;
  template?: string;
  compression?: boolean;
}

export interface ExportProgress {
  total: number;
  processed: number;
  percentage: number;
  status: 'preparing' | 'processing' | 'complete' | 'error' | 'uploading';
  error?: string;
  stage?: string;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  size: number;
  format: ExportFormat;
  uri?: string;
  cloudUrl?: string;
  error?: string;
}

export interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  format: ExportFormat;
  fields: ExportField[];
  layout: TemplateLayout;
  branding?: BrandingOptions;
  created_at: string;
  updated_at: string;
}

export interface ExportField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'duration';
  required: boolean;
  anonymizable: boolean;
  format?: string;
  defaultValue?: unknown;
}

export interface TemplateLayout {
  headers: boolean;
  orientation?: 'portrait' | 'landscape';
  fontSize?: number;
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  columns?: ColumnLayout[];
}

export interface ColumnLayout {
  field: string;
  width?: number;
  alignment?: 'left' | 'center' | 'right';
  format?: string;
}

export interface BrandingOptions {
  logo?: string;
  color?: string;
  fontFamily?: string;
  title?: string;
  subtitle?: string;
  footer?: string;
}

export interface ExcelExportOptions extends ExportOptions {
  sheetName?: string;
  includeCharts?: boolean;
  autoFilter?: boolean;
  freezeHeaders?: boolean;
}

export interface PDFExportOptions extends ExportOptions {
  template: 'executive' | 'detailed' | 'summary' | 'custom';
  includeCharts?: boolean;
  branding?: BrandingOptions;
  sections?: ReportSection[];
  pageSize?: 'A4' | 'Letter' | 'Legal';
}

export interface ZIPExportOptions extends ExportOptions {
  includeFormats: ExportFormat[];
  separateByContact?: boolean;
  includeMetadata?: boolean;
}

export interface ReportSection {
  type: 'header' | 'metrics' | 'chart' | 'table' | 'text' | 'summary';
  title: string;
  data?: unknown;
  options?: SectionOptions;
}

export interface SectionOptions {
  chartType?: 'bar' | 'line' | 'pie' | 'donut';
  showLegend?: boolean;
  height?: number;
  width?: number;
  style?: Record<string, unknown>;
}

export interface AnalyticsExportOptions {
  userId: string;
  dateRange: DateRange;
  metrics: AnalyticsMetric[];
  format: ExportFormat;
  includeCharts?: boolean;
  groupBy?: 'day' | 'week' | 'month';
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface AnalyticsMetric {
  type: 'calls' | 'sms' | 'duration' | 'contacts' | 'trends';
  name: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface ContactExportOptions {
  contactIds: string[];
  includeEvents?: boolean;
  includeAnalytics?: boolean;
  format: ExportFormat;
  dateRange?: DateRange;
}

export interface ExportHistoryItem {
  id: string;
  filename: string;
  format: ExportFormat;
  size: number;
  created_at: string;
  status: 'completed' | 'failed' | 'pending';
  url?: string;
  cloudProvider?: string;
  cloudPath?: string;
  error?: string;
}

export interface SizeEstimate {
  bytes: number;
  readable: string;
  estimatedTime: number; // seconds
}

export type ExportProgressCallback = (_progress: ExportProgress) => void;

// Error types
export class ExportError extends Error {
  constructor(
    message: string,
    public _code: string,
    public _details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export class ExportValidationError extends ExportError {
  constructor(message: string, public field: string) {
    super(message, 'VALIDATION_ERROR', { field });
    this.name = 'ExportValidationError';
  }
}

export class ExportProcessingError extends ExportError {
  constructor(message: string, public stage: string) {
    super(message, 'PROCESSING_ERROR', { stage });
    this.name = 'ExportProcessingError';
  }
}