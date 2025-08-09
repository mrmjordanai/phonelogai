"""
Comprehensive Data Validation Pipeline

This package provides a three-phase validation system:
- Phase 1: Field Mapping System with ML-powered detection
- Phase 2: Data Normalization Engine  
- Phase 3: Duplicate Detection System
"""

from .field_mapping_system import (
    FieldMappingSystem,
    MappingWizard, 
    ConfidenceScorer,
    TemplateManager
)
from .data_normalization_engine import (
    DataNormalizationEngine,
    PhoneNumberNormalizer,
    DateTimeNormalizer,
    DurationNormalizer,
    ContentSanitizer
)
from .duplicate_detection_system import (
    DuplicateDetectionSystem,
    CompositeKeyGenerator,
    FuzzyMatcher,
    ConflictResolver
)
from .validation_pipeline import (
    ValidationPipeline, 
    validation_pipeline,
    validate_data_pipeline_task
)
from .performance_optimizer import (
    PerformanceOptimizer,
    performance_optimizer,
    MemoryManager,
    IntelligentCache,
    StreamingProcessor,
    ParallelProcessor
)
from .error_handler import (
    EnhancedErrorHandler,
    enhanced_error_handler,
    ErrorCategory,
    ErrorSeverity,
    RecoveryStrategy,
    ValidationError,
    DeadLetterQueue,
    with_error_handling
)

__all__ = [
    # Main Pipeline
    'ValidationPipeline',
    'validation_pipeline',
    'validate_data_pipeline_task',
    
    # Field Mapping System
    'FieldMappingSystem',
    'MappingWizard',
    'ConfidenceScorer', 
    'TemplateManager',
    
    # Data Normalization
    'DataNormalizationEngine',
    'PhoneNumberNormalizer',
    'DateTimeNormalizer',
    'DurationNormalizer',
    'ContentSanitizer',
    
    # Duplicate Detection
    'DuplicateDetectionSystem',
    'CompositeKeyGenerator',
    'FuzzyMatcher',
    'ConflictResolver',
    
    # Performance Optimization
    'PerformanceOptimizer',
    'performance_optimizer',
    'MemoryManager',
    'IntelligentCache',
    'StreamingProcessor',
    'ParallelProcessor',
    
    # Error Handling
    'EnhancedErrorHandler',
    'enhanced_error_handler',
    'ErrorCategory',
    'ErrorSeverity',
    'RecoveryStrategy',
    'ValidationError',
    'DeadLetterQueue',
    'with_error_handling'
]