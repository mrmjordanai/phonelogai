import { Event, Contact } from '@phonelogai/types';

// File processing types
export const FileFormat = {
  PDF: 'pdf' as const,
  CSV: 'csv' as const,
  XLSX: 'xlsx' as const,
  XLS: 'xls' as const,
  JSON: 'json' as const,
  TXT: 'txt' as const,
  UNKNOWN: 'unknown' as const
} as const;

export type FileFormat = typeof FileFormat[keyof typeof FileFormat];

// Create const enums for values that are used as both types and values
export const CarrierType = {
  ATT: 'att' as const,
  VERIZON: 'verizon' as const,
  TMOBILE: 'tmobile' as const,
  SPRINT: 'sprint' as const,
  UNKNOWN: 'unknown' as const
} as const;

export type CarrierType = typeof CarrierType[keyof typeof CarrierType];

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial' | 'cancelled';

// ML Classification types
export interface MLConfidenceScore {
  format: number;
  carrier: number;
  overall: number;
}

export interface LayoutClassificationNew {
  jobId: string;
  format: FileFormat;
  carrier: CarrierType;
  confidence: MLConfidenceScore;
  fieldMappings: Record<string, string>;
  templateId?: string;
  detectedAt: Date;
  processingMetrics?: {
    processingTime: number;
    memoryUsage: number;
    accuracy: number;
  };
  fallbackRequired?: boolean;
}

// Processing Step const enum - for use as both type and value
export const ProcessingStep = {
  QUEUED: 'queued' as const,
  FILE_VALIDATION: 'file_validation' as const,
  LAYOUT_DETECTION: 'layout_detection' as const,
  PARSING: 'parsing' as const,
  VALIDATION: 'validation' as const,
  DEDUPLICATION: 'deduplication' as const,
  STORAGE: 'storage' as const,
  COMPLETED: 'completed' as const,
  // Additional steps from other definitions
  FILE_UPLOAD: 'file_upload' as const,
  FORMAT_DETECTION: 'format_detection' as const,
  LAYOUT_CLASSIFICATION: 'layout_classification' as const,
  DATA_EXTRACTION: 'data_extraction' as const,
  DATABASE_INSERTION: 'database_insertion' as const,
  CONTACT_CREATION: 'contact_creation' as const,
  PRIVACY_APPLICATION: 'privacy_application' as const
} as const;

export type ProcessingStep = typeof ProcessingStep[keyof typeof ProcessingStep];

// Updated IngestionJob interface
export interface IngestionJobNew {
  id: string;
  userId: string;
  filename: string;
  fileSize: number;
  mimeType?: string;
  filePath?: string;
  fileContent?: string;
  status: JobStatus;
  currentStep: ProcessingStep;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// New parsing result types
export interface ParsingResult {
  success: boolean;
  data: any[];
  metrics: {
    totalRows: number;
    processedRows: number;
    skippedRows: number;
    errorRows: number;
    duplicateRows: number;
    processingTime: number;
    peakMemoryUsage: number;
    throughputRowsPerSecond: number;
    accuracy: number;
  };
  classification: LayoutClassificationNew;
  validationResult: {
    validationSummary: {
      totalRows: number;
      validRows: number;
      invalidRows: number;
      errors: string[];
    };
  };
}

// Validation result interface
export interface ValidationResultNew {
  success: boolean;
  data: any[];
  validationSummary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    errors: string[];
  };
}

// Job progress interface  
export interface JobProgressNew {
  jobId: string;
  status: JobStatus;
  currentStep: ProcessingStep;
  progress: number;
  updatedAt: Date;
  metrics?: {
    processingTime?: number;
    rowsProcessed?: number;
    accuracy?: number;
    throughput?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Ingestion job tracking
export interface IngestionJob {
  id: string;
  user_id: string;
  filename: string;
  file_size: number;
  format: FileFormat;
  carrier?: CarrierType;
  status: JobStatus;
  progress: number; // 0-100
  total_rows?: number;
  processed_rows: number;
  errors: IngestionError[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
  metadata?: Record<string, unknown>;
}

// Layout classification results
export interface LayoutClassification {
  id: string;
  job_id: string;
  detected_format: FileFormat;
  carrier: CarrierType;
  confidence: number; // 0-1
  field_mappings: FieldMapping[];
  table_structure?: TableStructure;
  requires_manual_mapping: boolean;
  created_at: string;
  // Add missing properties used in MLClassificationService
  format: FileFormat;
  overall: number;
  fallbackRequired?: boolean;
}

// Field mapping for data extraction
export interface FieldMapping {
  source_field: string;
  target_field: keyof Event | keyof Contact;
  data_type: 'string' | 'number' | 'date' | 'boolean';
  transformation?: string; // Function name for data transformation
  confidence: number;
  is_required: boolean;
}

// Table structure detection
export interface TableStructure {
  header_row: number;
  data_start_row: number;
  columns: ColumnInfo[];
  delimiter?: string; // For CSV files
  encoding?: string;
}

export interface ColumnInfo {
  index: number;
  name: string;
  data_type: 'string' | 'number' | 'date' | 'boolean';
  sample_values: string[];
  null_percentage: number;
}

// Error tracking
export interface IngestionError {
  id: string;
  job_id: string;
  row_number?: number;
  error_type: ErrorType;
  error_message: string;
  raw_data?: Record<string, unknown>;
  severity: 'warning' | 'error' | 'critical';
  created_at: string;
}

export type ErrorType = 
  | 'file_format_error'
  | 'parsing_error'
  | 'validation_error'
  | 'database_error'
  | 'system_error'
  | 'duplicate_data'
  | 'missing_required_field'
  | 'invalid_data_type'
  | 'constraint_violation';

// File processing configuration
export interface ProcessingConfig {
  chunk_size: number;
  max_errors: number;
  skip_validation: boolean;
  deduplication_enabled: boolean;
  anonymization_enabled: boolean;
  batch_size: number;
  timeout_minutes: number;
}

// Data extraction results
export interface ExtractionResult {
  events: Partial<Event>[];
  contacts: Partial<Contact>[];
  metadata: {
    total_rows: number;
    parsed_rows: number;
    error_rows: number;
    duplicate_rows: number;
    processing_time_ms: number;
  };
  errors: IngestionError[];
  warnings: string[];
}

// ML model inference types
export interface LayoutPrediction {
  carrier: CarrierType;
  format: FileFormat;
  confidence: number;
  field_predictions: FieldPrediction[];
}

export interface FieldPrediction {
  column_name: string;
  predicted_field: string;
  confidence: number;
  data_type: 'string' | 'number' | 'date' | 'boolean';
}

// File upload handling
export interface FileUploadRequest {
  file: Buffer;
  filename: string;
  mimetype: string;
  size: number;
  user_id: string;
  processing_config?: Partial<ProcessingConfig>;
}

export interface FileUploadResponse {
  job_id: string;
  status: JobStatus;
  estimated_processing_time?: number;
  message?: string;
}

// Progress tracking
export interface JobProgress {
  job_id: string;
  status: JobStatus;
  progress: number;
  current_step: ProcessingStep;
  processed_rows: number;
  total_rows?: number;
  estimated_completion?: string;
  errors_count: number;
  warnings_count: number;
}

// Remove duplicate ProcessingStep definition - already defined above

// Validation schema
export interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'range' | 'custom';
  parameters?: Record<string, unknown>;
  error_message: string;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  value: unknown;
  rule: ValidationRule;
  message: string;
}

export interface ValidationWarning {
  field: string;
  value: unknown;
  message: string;
  suggestion?: string;
}

// Deduplication
export interface DeduplicationResult {
  duplicates_found: number;
  duplicates_removed: number;
  merge_conflicts: MergeConflict[];
  unique_events: Partial<Event>[];
}

export interface MergeConflict {
  field: string;
  values: unknown[];
  resolution: 'keep_first' | 'keep_last' | 'merge' | 'manual';
}

// Manual mapping wizard
export interface ManualMappingRequest {
  job_id: string;
  field_mappings: FieldMapping[];
  user_provided_mappings: Record<string, string>;
}

export interface ManualMappingResponse {
  mapping_id: string;
  is_valid: boolean;
  validation_errors: string[];
  sample_output: Partial<Event>[];
}

// Carrier template definitions
export interface CarrierTemplate {
  id: string;
  carrier: CarrierType;
  name: string;
  description: string;
  supported_formats: FileFormat[];
  field_mappings: FieldMapping[];
  validation_rules: ValidationRule[];
  sample_files: string[];
  created_at: string;
  updated_at: string;
}

// Performance metrics
export interface ProcessingMetrics {
  job_id: string;
  file_size_mb: number;
  processing_time_ms: number;
  rows_per_second: number;
  memory_usage_mb: number;
  cpu_usage_percent: number;
  errors_per_1000_rows: number;
  quality_score: number; // 0-1
}

// Queue management for workers
export interface QueueJob {
  id: string;
  type: 'parse_file' | 'validate_data' | 'write_database';
  payload: Record<string, unknown>;
  priority: number;
  attempts: number;
  max_attempts: number;
  created_at: string;
  scheduled_at?: string;
  processing_started_at?: string;
  processing_completed_at?: string;
  error_message?: string;
}

// API request/response types
export interface GetJobStatusResponse {
  job: IngestionJob;
  progress: JobProgress;
  classification?: LayoutClassification;
  metrics?: ProcessingMetrics;
}

export interface RetryJobRequest {
  job_id: string;
  retry_from_step?: ProcessingStep;
  new_config?: Partial<ProcessingConfig>;
}

export interface ListJobsRequest {
  user_id: string;
  status?: JobStatus;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'completed_at' | 'filename';
  sort_order?: 'asc' | 'desc';
}

export interface ListJobsResponse {
  jobs: IngestionJob[];
  total: number;
  has_more: boolean;
}