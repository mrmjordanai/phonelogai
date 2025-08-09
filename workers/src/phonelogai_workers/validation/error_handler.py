"""
Enhanced Error Handling System
Task 4: Enhanced error handling with categorization, retry logic, partial failure recovery, and dead letter queue

This module provides comprehensive error handling capabilities:
- Error categorization and severity assessment
- Intelligent retry logic with exponential backoff
- Partial failure recovery and data preservation
- Dead letter queue integration for failed items
- Circuit breaker patterns for external dependencies
- Error analytics and reporting
"""
import asyncio
import time
import json
import traceback
from typing import Dict, List, Tuple, Optional, Any, Callable, Union, Type
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field, asdict
from enum import Enum
from functools import wraps
import structlog
import redis
from contextlib import asynccontextmanager

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


class ErrorSeverity(Enum):
    """Error severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ErrorCategory(Enum):
    """Error categories for intelligent handling"""
    VALIDATION_ERROR = "validation_error"
    DATA_QUALITY_ERROR = "data_quality_error"
    DATABASE_ERROR = "database_error"
    NETWORK_ERROR = "network_error"
    TIMEOUT_ERROR = "timeout_error"
    MEMORY_ERROR = "memory_error"
    PERMISSION_ERROR = "permission_error"
    RATE_LIMIT_ERROR = "rate_limit_error"
    EXTERNAL_SERVICE_ERROR = "external_service_error"
    CONFIGURATION_ERROR = "configuration_error"
    SYSTEM_ERROR = "system_error"
    UNKNOWN_ERROR = "unknown_error"


class RecoveryStrategy(Enum):
    """Recovery strategies for different error types"""
    RETRY = "retry"
    SKIP = "skip"
    FALLBACK = "fallback"
    DEAD_LETTER = "dead_letter"
    ESCALATE = "escalate"
    PARTIAL_RECOVERY = "partial_recovery"


@dataclass
class ErrorContext:
    """Context information for error handling"""
    job_id: str
    user_id: str
    operation: str
    stage: str
    item_id: Optional[str] = None
    batch_index: Optional[int] = None
    retry_count: int = 0
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationError:
    """Structured validation error"""
    error_id: str
    category: ErrorCategory
    severity: ErrorSeverity
    message: str
    context: ErrorContext
    original_exception: Optional[Exception] = None
    traceback: Optional[str] = None
    recovery_strategy: RecoveryStrategy = RecoveryStrategy.RETRY
    retry_after_seconds: Optional[float] = None
    max_retries: int = 3
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage/transmission"""
        return {
            'error_id': self.error_id,
            'category': self.category.value,
            'severity': self.severity.value,
            'message': self.message,
            'context': asdict(self.context),
            'original_exception': str(self.original_exception) if self.original_exception else None,
            'traceback': self.traceback,
            'recovery_strategy': self.recovery_strategy.value,
            'retry_after_seconds': self.retry_after_seconds,
            'max_retries': self.max_retries,
            'created_at': self.created_at.isoformat()
        }


@dataclass
class CircuitBreakerState:
    """Circuit breaker state tracking"""
    failure_count: int = 0
    last_failure_time: Optional[float] = None
    state: str = "closed"  # closed, open, half_open
    failure_threshold: int = 5
    recovery_timeout: float = 60.0
    success_threshold: int = 2
    consecutive_successes: int = 0


class ErrorClassifier:
    """Intelligent error classification and recovery strategy selection"""
    
    def __init__(self):
        # Error pattern matching rules
        self.classification_rules = {
            # Database errors
            'connection': (ErrorCategory.DATABASE_ERROR, ErrorSeverity.HIGH, RecoveryStrategy.RETRY),
            'timeout': (ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM, RecoveryStrategy.RETRY),
            'deadlock': (ErrorCategory.DATABASE_ERROR, ErrorSeverity.MEDIUM, RecoveryStrategy.RETRY),
            'constraint': (ErrorCategory.VALIDATION_ERROR, ErrorSeverity.LOW, RecoveryStrategy.SKIP),
            
            # Memory errors
            'memory': (ErrorCategory.MEMORY_ERROR, ErrorSeverity.CRITICAL, RecoveryStrategy.ESCALATE),
            'out of memory': (ErrorCategory.MEMORY_ERROR, ErrorSeverity.CRITICAL, RecoveryStrategy.ESCALATE),
            
            # Network errors
            'network': (ErrorCategory.NETWORK_ERROR, ErrorSeverity.MEDIUM, RecoveryStrategy.RETRY),
            'ssl': (ErrorCategory.NETWORK_ERROR, ErrorSeverity.MEDIUM, RecoveryStrategy.RETRY),
            'dns': (ErrorCategory.NETWORK_ERROR, ErrorSeverity.MEDIUM, RecoveryStrategy.RETRY),
            
            # Rate limiting
            'rate limit': (ErrorCategory.RATE_LIMIT_ERROR, ErrorSeverity.LOW, RecoveryStrategy.RETRY),
            'too many requests': (ErrorCategory.RATE_LIMIT_ERROR, ErrorSeverity.LOW, RecoveryStrategy.RETRY),
            
            # Permission errors
            'permission': (ErrorCategory.PERMISSION_ERROR, ErrorSeverity.HIGH, RecoveryStrategy.ESCALATE),
            'unauthorized': (ErrorCategory.PERMISSION_ERROR, ErrorSeverity.HIGH, RecoveryStrategy.ESCALATE),
            'forbidden': (ErrorCategory.PERMISSION_ERROR, ErrorSeverity.HIGH, RecoveryStrategy.ESCALATE),
            
            # Data quality errors
            'invalid format': (ErrorCategory.DATA_QUALITY_ERROR, ErrorSeverity.LOW, RecoveryStrategy.SKIP),
            'parse error': (ErrorCategory.DATA_QUALITY_ERROR, ErrorSeverity.LOW, RecoveryStrategy.SKIP),
            'validation failed': (ErrorCategory.VALIDATION_ERROR, ErrorSeverity.LOW, RecoveryStrategy.SKIP),
        }
        
        # Retry configurations by category
        self.retry_configs = {
            ErrorCategory.DATABASE_ERROR: {'max_retries': 3, 'base_delay': 1.0, 'max_delay': 60.0},
            ErrorCategory.NETWORK_ERROR: {'max_retries': 5, 'base_delay': 2.0, 'max_delay': 120.0},
            ErrorCategory.TIMEOUT_ERROR: {'max_retries': 2, 'base_delay': 5.0, 'max_delay': 30.0},
            ErrorCategory.RATE_LIMIT_ERROR: {'max_retries': 3, 'base_delay': 10.0, 'max_delay': 300.0},
            ErrorCategory.VALIDATION_ERROR: {'max_retries': 1, 'base_delay': 0.5, 'max_delay': 2.0},
            ErrorCategory.DATA_QUALITY_ERROR: {'max_retries': 1, 'base_delay': 0.5, 'max_delay': 2.0},
            ErrorCategory.MEMORY_ERROR: {'max_retries': 0, 'base_delay': 0.0, 'max_delay': 0.0},
            ErrorCategory.PERMISSION_ERROR: {'max_retries': 0, 'base_delay': 0.0, 'max_delay': 0.0},
            ErrorCategory.SYSTEM_ERROR: {'max_retries': 2, 'base_delay': 2.0, 'max_delay': 30.0},
        }
    
    def classify_error(
        self,
        exception: Exception,
        context: ErrorContext
    ) -> ValidationError:
        """Classify error and determine recovery strategy"""
        error_message = str(exception).lower()
        error_type = type(exception).__name__.lower()
        
        # Default classification
        category = ErrorCategory.UNKNOWN_ERROR
        severity = ErrorSeverity.MEDIUM
        recovery_strategy = RecoveryStrategy.RETRY
        
        # Pattern matching
        for pattern, (cat, sev, strategy) in self.classification_rules.items():
            if pattern in error_message or pattern in error_type:
                category = cat
                severity = sev
                recovery_strategy = strategy
                break
        
        # Exception-specific rules
        if isinstance(exception, (ConnectionError, TimeoutError)):
            category = ErrorCategory.NETWORK_ERROR
            severity = ErrorSeverity.MEDIUM
            recovery_strategy = RecoveryStrategy.RETRY
        elif isinstance(exception, MemoryError):
            category = ErrorCategory.MEMORY_ERROR
            severity = ErrorSeverity.CRITICAL
            recovery_strategy = RecoveryStrategy.ESCALATE
        elif isinstance(exception, PermissionError):
            category = ErrorCategory.PERMISSION_ERROR
            severity = ErrorSeverity.HIGH
            recovery_strategy = RecoveryStrategy.ESCALATE
        elif isinstance(exception, ValueError):
            category = ErrorCategory.VALIDATION_ERROR
            severity = ErrorSeverity.LOW
            recovery_strategy = RecoveryStrategy.SKIP
        
        # Get retry configuration
        retry_config = self.retry_configs.get(category, {'max_retries': 3, 'base_delay': 1.0})
        
        # Calculate retry delay using exponential backoff
        retry_delay = None
        if recovery_strategy == RecoveryStrategy.RETRY and context.retry_count < retry_config['max_retries']:
            retry_delay = min(
                retry_config['base_delay'] * (2 ** context.retry_count),
                retry_config.get('max_delay', 60.0)
            )
        
        return ValidationError(
            error_id=self._generate_error_id(context),
            category=category,
            severity=severity,
            message=str(exception),
            context=context,
            original_exception=exception,
            traceback=traceback.format_exc(),
            recovery_strategy=recovery_strategy,
            retry_after_seconds=retry_delay,
            max_retries=retry_config['max_retries']
        )
    
    def _generate_error_id(self, context: ErrorContext) -> str:
        """Generate unique error ID"""
        import uuid
        return str(uuid.uuid4())


class RetryManager:
    """Advanced retry management with exponential backoff and jitter"""
    
    def __init__(self, max_concurrent_retries: int = 10):
        self.max_concurrent_retries = max_concurrent_retries
        self.retry_semaphore = asyncio.Semaphore(max_concurrent_retries)
        self.retry_counts = {}
        
    async def execute_with_retry(
        self,
        operation: Callable,
        context: ErrorContext,
        classifier: ErrorClassifier,
        *args,
        **kwargs
    ) -> Tuple[Any, Optional[ValidationError]]:
        """Execute operation with intelligent retry logic"""
        last_error = None
        
        while context.retry_count <= 10:  # Global retry limit
            try:
                async with self.retry_semaphore:
                    result = await self._execute_operation(operation, *args, **kwargs)
                    
                    # Reset retry count on success
                    if context.job_id in self.retry_counts:
                        del self.retry_counts[context.job_id]
                    
                    return result, None
                    
            except Exception as e:
                # Classify error
                validation_error = classifier.classify_error(e, context)
                last_error = validation_error
                
                # Check if we should retry
                if validation_error.recovery_strategy != RecoveryStrategy.RETRY:
                    break
                
                if context.retry_count >= validation_error.max_retries:
                    break
                
                # Calculate retry delay with jitter
                delay = validation_error.retry_after_seconds or 1.0
                jitter = delay * 0.1 * (0.5 - asyncio.get_event_loop().time() % 1)
                final_delay = delay + jitter
                
                logger.warning(
                    "Operation failed, retrying",
                    error_id=validation_error.error_id,
                    category=validation_error.category.value,
                    retry_count=context.retry_count,
                    retry_delay=final_delay,
                    job_id=context.job_id
                )
                
                # Wait before retry
                await asyncio.sleep(final_delay)
                
                # Increment retry count
                context.retry_count += 1
                self.retry_counts[context.job_id] = self.retry_counts.get(context.job_id, 0) + 1
        
        return None, last_error
    
    async def _execute_operation(self, operation: Callable, *args, **kwargs) -> Any:
        """Execute operation with proper async handling"""
        if asyncio.iscoroutinefunction(operation):
            return await operation(*args, **kwargs)
        else:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, operation, *args, **kwargs)


class DeadLetterQueue:
    """Dead letter queue for failed items with analysis capabilities"""
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        self.redis_client = redis_client
        if not redis_client:
            try:
                self.redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
            except Exception as e:
                logger.warning(f"Redis not available for DLQ: {e}")
                self.redis_client = None
        
        self.dlq_prefix = "phonelogai:dlq:"
        self.analysis_prefix = "phonelogai:dlq_analysis:"
    
    async def enqueue_failed_item(
        self,
        item: Dict[str, Any],
        error: ValidationError,
        job_id: str
    ) -> bool:
        """Add failed item to dead letter queue"""
        try:
            dlq_entry = {
                'item': item,
                'error': error.to_dict(),
                'job_id': job_id,
                'enqueued_at': datetime.now(timezone.utc).isoformat(),
                'retry_count': error.context.retry_count
            }
            
            # Store in Redis if available
            if self.redis_client:
                key = f"{self.dlq_prefix}{job_id}"
                await self._redis_lpush(key, json.dumps(dlq_entry))
                
                # Set expiration (30 days)
                await self._redis_expire(key, 30 * 24 * 3600)
                
                # Update DLQ analytics
                await self._update_dlq_analytics(error.category, error.severity, job_id)
            
            # Also store in database for persistence
            await db_manager.add_ingestion_error(
                job_id=job_id,
                error_type=error.category.value,
                error_message=error.message,
                raw_data=item,
                severity=error.severity.value
            )
            
            logger.info(
                "Item added to dead letter queue",
                error_id=error.error_id,
                category=error.category.value,
                severity=error.severity.value,
                job_id=job_id
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to enqueue item to DLQ: {e}")
            return False
    
    async def get_failed_items(
        self,
        job_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get failed items from dead letter queue"""
        try:
            if not self.redis_client:
                return []
            
            key = f"{self.dlq_prefix}{job_id}"
            items = await self._redis_lrange(key, 0, limit - 1)
            
            return [json.loads(item) for item in items if item]
            
        except Exception as e:
            logger.error(f"Failed to get DLQ items: {e}")
            return []
    
    async def retry_failed_items(
        self,
        job_id: str,
        processor: Callable,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """Retry processing failed items from DLQ"""
        failed_items = await self.get_failed_items(job_id)
        
        if not failed_items:
            return {'retried': 0, 'succeeded': 0, 'failed': 0}
        
        retried = 0
        succeeded = 0
        still_failed = 0
        
        for dlq_entry in failed_items:
            if dlq_entry.get('retry_count', 0) >= max_retries:
                continue
            
            item = dlq_entry['item']
            error_info = dlq_entry['error']
            
            try:
                # Create new context for retry
                context = ErrorContext(
                    job_id=job_id,
                    user_id=item.get('user_id', 'unknown'),
                    operation='dlq_retry',
                    stage='retry',
                    item_id=item.get('id'),
                    retry_count=dlq_entry.get('retry_count', 0) + 1
                )
                
                # Attempt to process item
                result = await processor(item, context)
                
                if result:
                    # Success - remove from DLQ
                    await self._remove_from_dlq(job_id, dlq_entry)
                    succeeded += 1
                else:
                    still_failed += 1
                
                retried += 1
                
            except Exception as e:
                logger.error(f"DLQ retry failed: {e}")
                still_failed += 1
        
        logger.info(
            "DLQ retry completed",
            job_id=job_id,
            retried=retried,
            succeeded=succeeded,
            still_failed=still_failed
        )
        
        return {
            'retried': retried,
            'succeeded': succeeded,
            'failed': still_failed
        }
    
    async def _update_dlq_analytics(
        self,
        category: ErrorCategory,
        severity: ErrorSeverity,
        job_id: str
    ):
        """Update DLQ analytics for monitoring"""
        if not self.redis_client:
            return
        
        try:
            analytics_key = f"{self.analysis_prefix}daily:{datetime.now().strftime('%Y-%m-%d')}"
            
            # Increment counters
            await self._redis_hincrby(analytics_key, f"category:{category.value}", 1)
            await self._redis_hincrby(analytics_key, f"severity:{severity.value}", 1)
            await self._redis_hincrby(analytics_key, "total", 1)
            
            # Set expiration (90 days)
            await self._redis_expire(analytics_key, 90 * 24 * 3600)
            
        except Exception as e:
            logger.error(f"Failed to update DLQ analytics: {e}")
    
    async def get_dlq_analytics(
        self,
        days: int = 7
    ) -> Dict[str, Any]:
        """Get DLQ analytics for monitoring"""
        if not self.redis_client:
            return {}
        
        analytics = {
            'total_failed': 0,
            'by_category': {},
            'by_severity': {},
            'daily_breakdown': {}
        }
        
        try:
            for i in range(days):
                date = datetime.now() - timedelta(days=i)
                date_str = date.strftime('%Y-%m-%d')
                analytics_key = f"{self.analysis_prefix}daily:{date_str}"
                
                day_data = await self._redis_hgetall(analytics_key)
                if day_data:
                    daily_total = int(day_data.get('total', 0))
                    analytics['daily_breakdown'][date_str] = daily_total
                    analytics['total_failed'] += daily_total
                    
                    # Aggregate by category and severity
                    for key, value in day_data.items():
                        if key.startswith('category:'):
                            category = key.replace('category:', '')
                            analytics['by_category'][category] = analytics['by_category'].get(category, 0) + int(value)
                        elif key.startswith('severity:'):
                            severity = key.replace('severity:', '')
                            analytics['by_severity'][severity] = analytics['by_severity'].get(severity, 0) + int(value)
            
        except Exception as e:
            logger.error(f"Failed to get DLQ analytics: {e}")
        
        return analytics
    
    async def _remove_from_dlq(self, job_id: str, dlq_entry: Dict[str, Any]):
        """Remove item from DLQ after successful retry"""
        if not self.redis_client:
            return
        
        try:
            key = f"{self.dlq_prefix}{job_id}"
            await self._redis_lrem(key, 1, json.dumps(dlq_entry))
        except Exception as e:
            logger.error(f"Failed to remove item from DLQ: {e}")
    
    # Redis async helpers (simplified)
    async def _redis_lpush(self, key: str, value: str):
        """Async Redis LPUSH"""
        return self.redis_client.lpush(key, value)
    
    async def _redis_expire(self, key: str, seconds: int):
        """Async Redis EXPIRE"""
        return self.redis_client.expire(key, seconds)
    
    async def _redis_lrange(self, key: str, start: int, end: int):
        """Async Redis LRANGE"""
        return self.redis_client.lrange(key, start, end)
    
    async def _redis_hincrby(self, key: str, field: str, increment: int):
        """Async Redis HINCRBY"""
        return self.redis_client.hincrby(key, field, increment)
    
    async def _redis_hgetall(self, key: str):
        """Async Redis HGETALL"""
        return self.redis_client.hgetall(key)
    
    async def _redis_lrem(self, key: str, count: int, value: str):
        """Async Redis LREM"""
        return self.redis_client.lrem(key, count, value)


class CircuitBreaker:
    """Circuit breaker for external service calls"""
    
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self.states = {}  # service_name -> CircuitBreakerState
        self.default_failure_threshold = failure_threshold
        self.default_recovery_timeout = recovery_timeout
    
    async def call(
        self,
        service_name: str,
        operation: Callable,
        *args,
        **kwargs
    ) -> Any:
        """Execute operation through circuit breaker"""
        state = self._get_or_create_state(service_name)
        
        # Check circuit breaker state
        if state.state == "open":
            if time.time() - state.last_failure_time > state.recovery_timeout:
                state.state = "half_open"
                state.consecutive_successes = 0
                logger.info(f"Circuit breaker half-open for {service_name}")
            else:
                raise CircuitBreakerOpenError(f"Circuit breaker open for {service_name}")
        
        try:
            result = await self._execute_operation(operation, *args, **kwargs)
            
            # Success
            if state.state == "half_open":
                state.consecutive_successes += 1
                if state.consecutive_successes >= state.success_threshold:
                    state.state = "closed"
                    state.failure_count = 0
                    logger.info(f"Circuit breaker closed for {service_name}")
            else:
                state.failure_count = 0
            
            return result
            
        except Exception as e:
            # Failure
            state.failure_count += 1
            state.last_failure_time = time.time()
            
            if state.failure_count >= state.failure_threshold:
                state.state = "open"
                logger.warning(f"Circuit breaker opened for {service_name}")
            
            raise e
    
    def _get_or_create_state(self, service_name: str) -> CircuitBreakerState:
        """Get or create circuit breaker state"""
        if service_name not in self.states:
            self.states[service_name] = CircuitBreakerState(
                failure_threshold=self.default_failure_threshold,
                recovery_timeout=self.default_recovery_timeout
            )
        return self.states[service_name]
    
    async def _execute_operation(self, operation: Callable, *args, **kwargs) -> Any:
        """Execute operation with proper async handling"""
        if asyncio.iscoroutinefunction(operation):
            return await operation(*args, **kwargs)
        else:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, operation, *args, **kwargs)


class CircuitBreakerOpenError(Exception):
    """Exception raised when circuit breaker is open"""
    pass


class EnhancedErrorHandler:
    """Main enhanced error handler coordinator"""
    
    def __init__(self):
        self.classifier = ErrorClassifier()
        self.retry_manager = RetryManager()
        self.dlq = DeadLetterQueue()
        self.circuit_breaker = CircuitBreaker()
        
        # Error statistics
        self.error_counts = {category: 0 for category in ErrorCategory}
        self.recovery_counts = {strategy: 0 for strategy in RecoveryStrategy}
        self.start_time = time.time()
    
    async def handle_batch_errors(
        self,
        batch: List[Dict[str, Any]],
        processor: Callable,
        context: ErrorContext
    ) -> Tuple[List[Dict[str, Any]], List[ValidationError]]:
        """Handle errors for batch processing with partial recovery"""
        successful_items = []
        errors = []
        
        for i, item in enumerate(batch):
            item_context = ErrorContext(
                job_id=context.job_id,
                user_id=context.user_id,
                operation=context.operation,
                stage=context.stage,
                item_id=item.get('id', f'batch_item_{i}'),
                batch_index=i,
                metadata=context.metadata
            )
            
            try:
                result, error = await self.retry_manager.execute_with_retry(
                    processor,
                    item_context,
                    self.classifier,
                    item
                )
                
                if error is None:
                    successful_items.append(result)
                else:
                    errors.append(error)
                    await self._handle_error_by_strategy(item, error, context.job_id)
                    
            except Exception as e:
                # Fallback error handling
                validation_error = self.classifier.classify_error(e, item_context)
                errors.append(validation_error)
                await self._handle_error_by_strategy(item, validation_error, context.job_id)
        
        return successful_items, errors
    
    async def _handle_error_by_strategy(
        self,
        item: Dict[str, Any],
        error: ValidationError,
        job_id: str
    ):
        """Handle error according to its recovery strategy"""
        self.error_counts[error.category] += 1
        self.recovery_counts[error.recovery_strategy] += 1
        
        if error.recovery_strategy == RecoveryStrategy.DEAD_LETTER:
            await self.dlq.enqueue_failed_item(item, error, job_id)
        
        elif error.recovery_strategy == RecoveryStrategy.ESCALATE:
            await self._escalate_error(error, job_id)
        
        elif error.recovery_strategy == RecoveryStrategy.PARTIAL_RECOVERY:
            await self._attempt_partial_recovery(item, error, job_id)
        
        # Log error for monitoring
        logger.error(
            "Error handled",
            error_id=error.error_id,
            category=error.category.value,
            severity=error.severity.value,
            recovery_strategy=error.recovery_strategy.value,
            job_id=job_id
        )
    
    async def _escalate_error(self, error: ValidationError, job_id: str):
        """Escalate critical errors"""
        # Update job status to failed for critical errors
        if error.severity == ErrorSeverity.CRITICAL:
            await db_manager.update_job_status(
                job_id=job_id,
                status="failed",
                metadata={
                    "critical_error": error.to_dict(),
                    "escalated_at": datetime.now(timezone.utc).isoformat()
                }
            )
    
    async def _attempt_partial_recovery(
        self,
        item: Dict[str, Any],
        error: ValidationError,
        job_id: str
    ):
        """Attempt to recover partial data from failed item"""
        try:
            # Extract recoverable fields
            recoverable_item = {}
            
            # Keep non-problematic fields based on error category
            if error.category == ErrorCategory.DATA_QUALITY_ERROR:
                # Keep structural fields, remove content fields
                safe_fields = ['id', 'user_id', 'ts', 'type', 'direction']
                for field in safe_fields:
                    if field in item:
                        recoverable_item[field] = item[field]
            
            elif error.category == ErrorCategory.VALIDATION_ERROR:
                # Keep valid fields only
                for field, value in item.items():
                    if value is not None and str(value).strip():
                        recoverable_item[field] = value
            
            if recoverable_item and len(recoverable_item) >= 3:
                # Mark as partially recovered
                recoverable_item['metadata'] = {
                    'partial_recovery': True,
                    'original_error': error.error_id,
                    'recovered_at': datetime.now(timezone.utc).isoformat()
                }
                
                logger.info(
                    "Partial recovery successful",
                    error_id=error.error_id,
                    recovered_fields=len(recoverable_item),
                    job_id=job_id
                )
                
                return recoverable_item
        
        except Exception as e:
            logger.error(f"Partial recovery failed: {e}")
        
        return None
    
    def get_error_statistics(self) -> Dict[str, Any]:
        """Get comprehensive error statistics"""
        uptime_hours = (time.time() - self.start_time) / 3600
        
        return {
            'uptime_hours': round(uptime_hours, 2),
            'total_errors': sum(self.error_counts.values()),
            'error_rate_per_hour': sum(self.error_counts.values()) / max(uptime_hours, 0.01),
            'errors_by_category': {cat.value: count for cat, count in self.error_counts.items()},
            'recoveries_by_strategy': {strategy.value: count for strategy, count in self.recovery_counts.items()},
            'circuit_breaker_states': {
                service: state.state for service, state in self.circuit_breaker.states.items()
            },
            'dlq_stats': None  # Will be populated by DLQ analytics
        }
    
    async def get_comprehensive_error_report(self) -> Dict[str, Any]:
        """Get comprehensive error report including DLQ analytics"""
        stats = self.get_error_statistics()
        dlq_analytics = await self.dlq.get_dlq_analytics()
        stats['dlq_stats'] = dlq_analytics
        
        return stats


# Decorators for easy error handling
def with_error_handling(
    operation_name: str,
    stage: str = "processing"
):
    """Decorator to add error handling to functions"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            handler = EnhancedErrorHandler()
            
            # Extract context information
            job_id = kwargs.get('job_id', 'unknown')
            user_id = kwargs.get('user_id', 'unknown')
            
            context = ErrorContext(
                job_id=job_id,
                user_id=user_id,
                operation=operation_name,
                stage=stage
            )
            
            try:
                result, error = await handler.retry_manager.execute_with_retry(
                    func,
                    context,
                    handler.classifier,
                    *args,
                    **kwargs
                )
                
                if error:
                    logger.error(f"Operation {operation_name} failed after retries", error_id=error.error_id)
                    raise error.original_exception or Exception(error.message)
                
                return result
                
            except Exception as e:
                validation_error = handler.classifier.classify_error(e, context)
                await handler._handle_error_by_strategy({}, validation_error, job_id)
                raise e
        
        return wrapper
    return decorator


# Global error handler instance
enhanced_error_handler = EnhancedErrorHandler()