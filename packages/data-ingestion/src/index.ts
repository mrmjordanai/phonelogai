// Main exports for the data-ingestion package

// Types
export * from './types';

// File handling
export { FileDetectionService, FILE_VALIDATION_RULES, CARRIER_PATTERNS } from './utils/fileDetection';
export { FileUploadHandler } from './parsers/FileUploadHandler';

// Parsers
export { BaseParser } from './parsers/BaseParser';
export { CsvParser } from './parsers/CsvParser';
export { PdfParser } from './parsers/PdfParser';
export { ExcelParser } from './parsers/ExcelParser';
export { MultiFormatParser, multiFormatParser } from './parsers/MultiFormatParser';

// ML Classification and Field Mapping
export { MLClassificationService, mlClassificationService } from './ml/MLClassificationService';
export { PythonMLWrapper, pythonMLWrapper } from './ml/PythonMLWrapper';
export { AdvancedFieldMapper, advancedFieldMapper } from './ml/AdvancedFieldMapper';

// Job tracking and orchestration
export { JobTracker, jobTracker } from './workers/JobTracker';
export { ETLOrchestrator } from './workers/ETLOrchestrator';

// ETL Pipeline and Validation (Phase 3)
export { 
  SchemaValidator, 
  DataNormalizer, 
  DeduplicationEngine, 
  ETLPipeline 
} from './validation';

// Re-export common types for convenience
export type {
  FileFormat,
  CarrierType,
  JobStatus,
  ProcessingStep,
  IngestionJob,
  IngestionJobNew,
  JobProgress,
  JobProgressNew,
  FileUploadRequest,
  FileUploadResponse,
  LayoutClassification,
  LayoutClassificationNew,
  IngestionError,
  ProcessingConfig,
  ProcessingMetrics,
  MLConfidenceScore,
  ParsingResult,
  ValidationResultNew
} from './types';