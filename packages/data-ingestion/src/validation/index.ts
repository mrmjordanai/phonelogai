// ETL Pipeline and Data Validation Components
// Phase 3 implementation: Complete validation, normalization, and deduplication system

export { default as SchemaValidator } from './SchemaValidator.js';
export { default as DataNormalizer } from './DataNormalizer.js';
export { default as DeduplicationEngine } from './DeduplicationEngine.js';
export { default as ETLPipeline } from './ETLPipeline.js';

// Re-export types for convenience
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationRule,
  MergeConflict,
  DeduplicationResult
} from '../types/index.js';