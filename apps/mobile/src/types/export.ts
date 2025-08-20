/**
 * Enhanced Export System Types
 * Comprehensive type definitions for the enhanced data export functionality
 */

import { UIEvent } from '../screens/EventsScreen/types';

// ===== Core Export Types =====

export type ExportFormat = 'csv' | 'json' | 'excel' | 'pdf' | 'zip';

export interface ExportData {
  events?: UIEvent[];
  dashboardMetrics?: DashboardMetrics;
  contactIntelligence?: ContactIntelligence;
  customData?: Record<string, unknown>;
}

export interface ExportOptions {
  format: ExportFormat;
  includePrivate?: boolean;
  includeContent?: boolean;
  filename?: string;
  template?: string;
  cloudProvider?: string;
  cloudPath?: string;
  compression?: boolean;
  password?: string;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  size: number;
  format: ExportFormat;
  cloudUrl?: string;
  uri?: string; // File URI for sharing
  error?: string;
  metadata?: ExportMetadata;
}

export interface ExportMetadata {
  exportedAt: string;
  exportedBy: string;
  totalRecords: number;
  includePrivate: boolean;
  includeContent: boolean;
  template?: string;
  version: string;
}

// ===== Export Progress Tracking =====

export interface ExportProgress {
  total: number;
  processed: number;
  percentage: number;
  status: 'preparing' | 'processing' | 'uploading' | 'complete' | 'error';
  stage?: string;
  error?: string;
  estimatedTimeRemaining?: number;
}

export type ExportProgressCallback = (_progress: ExportProgress) => void;

// ===== Export Templates =====

export interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  format: ExportFormat;
  fields: ExportField[];
  layout: TemplateLayout;
  branding?: BrandingOptions;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExportField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'object';
  required: boolean;
  anonymizable: boolean;
  formatter?: string;
  validation?: FieldValidation;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  required?: boolean;
}

export interface TemplateLayout {
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'A4' | 'letter' | 'A3';
  margins?: PageMargins;
  header?: LayoutSection;
  footer?: LayoutSection;
  sections: LayoutSection[];
}

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutSection {
  type: 'header' | 'data' | 'chart' | 'summary' | 'footer';
  title?: string;
  fields?: string[];
  chartType?: ChartType;
  options?: SectionOptions;
}

export interface SectionOptions {
  showBorder?: boolean;
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  alignment?: 'left' | 'center' | 'right';
}

export type ChartType = 'line' | 'bar' | 'pie' | 'doughnut' | 'area';

export interface BrandingOptions {
  [key: string]: unknown;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  companyName?: string;
  footer?: string;
  title?: string;
}

// ===== Cloud Storage Types =====

export interface CloudProvider {
  id: string;
  name: string;
  icon: string;
  isAuthenticated: boolean | (() => Promise<boolean>);
  supportedFormats: ExportFormat[];
  maxFileSize: number;
  quotaUsed?: number;
  quotaTotal?: number;
}

export interface CloudAuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
}

export interface CloudUploadResult {
  success: boolean;
  url?: string;
  fileId?: string;
  error?: string;
  metadata?: CloudFileMetadata;
}

export interface CloudFileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  modifiedAt: string;
  downloadUrl?: string;
  shareUrl?: string;
}

export interface CloudSyncResult {
  uploaded: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ===== Analytics Export Types =====

export interface DashboardMetrics {
  userId: string;
  dateRange: DateRange;
  totalEvents: number;
  callEvents: number;
  smsEvents: number;
  topContacts: ContactSummary[];
  activityTrends: ActivityTrend[];
  qualityMetrics: QualityMetrics;
}

export interface ContactIntelligence {
  contactId: string;
  displayName: string;
  phoneNumber: string;
  totalInteractions: number;
  callDuration: number;
  messageCount: number;
  lastInteraction: string;
  interactionFrequency: number;
  communicationPreference: 'calls' | 'sms' | 'mixed';
  timePatterns: TimePattern[];
}

export interface ContactSummary {
  contactId: string;
  displayName: string;
  phoneNumber: string;
  eventCount: number;
  lastContact: string;
}

export interface ActivityTrend {
  date: string;
  callCount: number;
  smsCount: number;
  totalDuration: number;
}

export interface QualityMetrics {
  totalEvents: number;
  duplicateEvents: number;
  anonymizedEvents: number;
  qualityScore: number;
  dataGaps: number;
  lastSyncAt: string;
}

export interface TimePattern {
  hour: number;
  dayOfWeek: number;
  frequency: number;
  type: 'call' | 'sms';
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

// ===== Export History Types =====

export interface ExportHistoryItem {
  id: string;
  filename: string;
  format: ExportFormat;
  size: number;
  recordCount?: number;
  created_at: string;
  createdAt?: string; // Alias for created_at
  status: 'completed' | 'failed' | 'uploading' | 'processing';
  cloudProvider?: string;
  cloudUrl?: string;
  url?: string; // Alias for cloudUrl
  cloudPath?: string;
  downloadCount?: number;
  error?: string;
}

export interface ExportQueue {
  id: string;
  priority: number;
  data: ExportData;
  options: ExportOptions;
  progress?: ExportProgress;
  createdAt: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
}

// ===== Format-Specific Options =====

export interface ExcelExportOptions extends ExportOptions {
  format: 'excel';
  worksheetName?: string;
  sheetName?: string; // Alias for worksheetName
  includeFormulas?: boolean;
  includeCharts?: boolean;
  autoFilter?: boolean;
  freezeHeaders?: boolean;
  styles?: ExcelStyles;
}

export interface ExcelStyles {
  headerStyle?: CellStyle;
  dataStyle?: CellStyle;
  alternateRowStyle?: CellStyle;
}

export interface CellStyle {
  font?: {
    bold?: boolean;
    color?: string;
    size?: number;
  };
  fill?: {
    type?: 'solid';
    fgColor?: string;
  };
  border?: {
    style?: 'thin' | 'thick';
    color?: string;
  };
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'middle' | 'bottom';
  };
}

export interface PDFExportOptions extends ExportOptions {
  format: 'pdf';
  template: 'executive' | 'detailed' | 'summary' | 'custom';
  includeCharts?: boolean;
  pageOrientation?: 'portrait' | 'landscape';
  pageSize?: 'A4' | 'letter' | 'A3';
  branding?: BrandingOptions;
  sections?: ReportSection[];
}

export interface ReportSection {
  type: 'header' | 'metrics' | 'chart' | 'table' | 'text' | 'pageBreak' | 'summary';
  title?: string;
  data?: string | number | Record<string, unknown> | unknown[];
  options?: SectionOptions;
  chartConfig?: ChartConfig;
}

export interface ChartConfig {
  type: ChartType;
  width?: number;
  height?: number;
  colors?: string[];
  showLegend?: boolean;
  showAxes?: boolean;
}

export interface ZIPExportOptions extends ExportOptions {
  format: 'zip';
  includeFormats: ExportFormat[];
  separateByType?: boolean;
  compressionLevel?: number;
  includeMetadata?: boolean;
}

// ===== Export Service Interfaces =====

export interface EnhancedExportService {
  // Core export methods
  exportToCSV(_data: ExportData, _options?: ExportOptions): Promise<ExportResult>;
  exportToJSON(_data: ExportData, _options?: ExportOptions): Promise<ExportResult>;
  exportToExcel(_data: ExportData, _options?: ExcelExportOptions): Promise<ExportResult>;
  exportToPDF(_data: ExportData, _options?: PDFExportOptions): Promise<ExportResult>;
  exportToZIP(_data: ExportData, _options?: ZIPExportOptions): Promise<ExportResult>;

  // Template methods
  applyTemplate(_template: ExportTemplate, _data: ExportData): Promise<ExportResult>;
  getAvailableTemplates(): Promise<ExportTemplate[]>;
  saveTemplate(_template: ExportTemplate): Promise<boolean>;
  deleteTemplate(_templateId: string): Promise<boolean>;

  // Cloud storage methods
  uploadToCloud(
    _result: ExportResult,
    _provider: string,
    _path?: string
  ): Promise<CloudUploadResult>;
  getCloudProviders(): Promise<CloudProvider[]>;
  authenticateCloud(_providerId: string): Promise<CloudAuthResult>;

  // Analytics methods
  exportDashboardMetrics(
    _userId: string,
    _options: ExportOptions
  ): Promise<ExportResult>;
  exportContactIntelligence(
    _contactId: string,
    _options: ExportOptions
  ): Promise<ExportResult>;

  // Utility methods
  getEstimatedSize(_data: ExportData, _format: ExportFormat): Promise<number>;
  validateExportData(_data: ExportData): Promise<boolean>;
  getExportHistory(): Promise<ExportHistoryItem[]>;
  deleteExport(_exportId: string): Promise<boolean>;
}

// ===== Hook Interfaces =====

export interface UseEnhancedExportOptions {
  onProgress?: ExportProgressCallback;
  onComplete?: (_result: ExportResult) => void;
  onError?: (_error: string) => void;
  onCloudUpload?: (_result: CloudUploadResult) => void;
}

export interface UseEnhancedExportReturn {
  // State
  isExporting: boolean;
  progress: ExportProgress | null;
  history: ExportHistoryItem[];
  templates: ExportTemplate[];
  cloudProviders: CloudProvider[];

  // Export actions
  exportData: (_data: ExportData, _options: ExportOptions) => Promise<void>;
  shareExport: (_data: ExportData, _options: ExportOptions) => Promise<void>;
  scheduleExport: (_data: ExportData, _options: ExportOptions) => Promise<void>;

  // Template actions
  saveTemplate: (_template: ExportTemplate) => Promise<void>;
  loadTemplate: (_templateId: string) => Promise<ExportTemplate | null>;
  deleteTemplate: (_templateId: string) => Promise<void>;

  // Cloud actions
  authenticateCloud: (_providerId: string) => Promise<void>;
  uploadToCloud: (_result: ExportResult, _providerId: string) => Promise<void>;
  syncWithCloud: () => Promise<void>;

  // History actions
  refreshHistory: () => Promise<void>;
  deleteFromHistory: (_exportId: string) => Promise<void>;
  downloadFromHistory: (_exportId: string) => Promise<void>;

  // Utility actions
  getEstimatedSize: (_data: ExportData, _format: ExportFormat) => Promise<number>;
  resetProgress: () => void;
}

// ===== Error Types =====

export interface ExportError extends Error {
  code: 'INVALID_DATA' | 'EXPORT_FAILED' | 'CLOUD_UPLOAD_FAILED' | 'TEMPLATE_ERROR';
  details?: Record<string, unknown>;
}

// ===== Constants =====

export const EXPORT_FORMATS: Record<ExportFormat, { name: string; extension: string; mimeType: string }> = {
  csv: {
    name: 'CSV (Comma Separated Values)',
    extension: '.csv',
    mimeType: 'text/csv'
  },
  json: {
    name: 'JSON (JavaScript Object Notation)',
    extension: '.json',
    mimeType: 'application/json'
  },
  excel: {
    name: 'Excel Spreadsheet',
    extension: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  },
  pdf: {
    name: 'PDF Report',
    extension: '.pdf',
    mimeType: 'application/pdf'
  },
  zip: {
    name: 'ZIP Archive',
    extension: '.zip',
    mimeType: 'application/zip'
  }
};

export const DEFAULT_EXPORT_OPTIONS: Partial<ExportOptions> = {
  includePrivate: false,
  includeContent: true,
  compression: true
};

export const CLOUD_PROVIDERS = {
  GOOGLE_DRIVE: 'google_drive',
  DROPBOX: 'dropbox',
  ICLOUD: 'icloud'
} as const;

export type CloudProviderId = typeof CLOUD_PROVIDERS[keyof typeof CLOUD_PROVIDERS];

// Re-export cloud types for consistency
export type { 
  CloudProviderType,
  CloudStorageConfig,
  SyncResult,
  CloudStorageEvent,
  CloudStorageEventCallback
} from './export/CloudTypes';

// Re-export analytics types
export type { AnalyticsExportOptions } from './export/ExportTypes';

// Re-export error classes
export { 
  ExportError as ExportErrorClass,
  ExportValidationError,
  ExportProcessingError
} from './export/ExportTypes';

// Also import to use in this file
import type { CloudProviderType } from './export/CloudTypes';

// Cloud export options interface
export interface CloudExportOptions extends Omit<ExportOptions, 'cloudProvider'> {
  cloudProvider?: CloudProviderType;
  provider?: CloudProviderType; // Alias for cloudProvider
  cloudFolder?: string;
  folder?: string; // Alias for cloudFolder
  enableCloudSync?: boolean;
  public?: boolean;
  notify?: boolean;
}

// Size estimation interface
export interface SizeEstimate {
  estimatedSize: number;
  unit: 'bytes' | 'KB' | 'MB' | 'GB';
  formattedSize: string;
  accuracy: 'low' | 'medium' | 'high';
  factors?: string[];
  readable: string; // Human-readable size
  estimatedTime?: number; // Estimated processing time in milliseconds
}

// ===== Additional Export Provider Types =====

export interface AuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
  user?: CloudUser;
}

export interface FileData {
  id: string;
  name: string;
  size: number;
  content: string | Uint8Array;
  mimeType: string;
  lastModified?: Date;
}

export interface UploadOptions {
  path?: string;
  overwrite?: boolean;
  createFolder?: boolean;
  timeout?: number;
}

export interface UploadResult {
  id: string;
  name: string;
  url: string;
  size: number;
  path: string;
  created_at: string;
  success?: boolean;
  fileId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface FileList {
  files: CloudFile[];
  folders: CloudFolder[];
  hasMore: boolean;
  cursor?: string;
}

export interface CloudFile {
  id: string;
  name: string;
  size: number;
  url: string;
  path: string;
  mimeType: string;
  created_at: string;
  modified_at: string;
}

export interface CloudFolder {
  id: string;
  name: string;
  path: string;
  created_at: string;
  modified_at: string;
}

export interface CloudUser {
  id: string;
  name: string;
  email: string;
  displayName?: string;
  emailAddress?: string;
}

export interface QuotaInfo {
  used: number;
  total: number;
  available: number;
  unit: string;
}