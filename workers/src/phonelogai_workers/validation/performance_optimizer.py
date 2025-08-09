"""
Production Performance Optimization Module
Task 3: Performance optimizations with streaming, parallel processing, caching, and memory management

This module implements production-grade performance optimizations to meet targets:
- 100k rows in <5min, 1M rows in <30min 
- <2GB memory usage
- Streaming processing for large datasets
- Parallel processing with resource-aware scheduling
- Intelligent caching with Redis
- Memory management and garbage collection
"""
import asyncio
import gc
import time
import hashlib
import pickle
from typing import Dict, List, Tuple, Optional, Any, AsyncGenerator, Callable, Union
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
from multiprocessing import Pool, cpu_count
import structlog
import numpy as np
import psutil
import redis
from contextlib import asynccontextmanager
import weakref

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


@dataclass
class PerformanceMetrics:
    """Performance metrics tracking"""
    start_time: float = 0.0
    end_time: float = 0.0
    processed_items: int = 0
    memory_usage_mb: float = 0.0
    peak_memory_mb: float = 0.0
    cpu_usage_percent: float = 0.0
    cache_hits: int = 0
    cache_misses: int = 0
    parallel_tasks: int = 0
    streaming_batches: int = 0
    gc_collections: int = 0
    
    @property
    def processing_time_ms(self) -> int:
        return int((self.end_time - self.start_time) * 1000)
    
    @property
    def items_per_second(self) -> float:
        duration = self.end_time - self.start_time
        return self.processed_items / duration if duration > 0 else 0.0
    
    @property
    def cache_hit_rate(self) -> float:
        total = self.cache_hits + self.cache_misses
        return self.cache_hits / total if total > 0 else 0.0


@dataclass
class StreamingConfig:
    """Configuration for streaming processing"""
    batch_size: int = 1000
    max_concurrent_batches: int = 4
    memory_threshold_mb: float = 1500.0
    enable_prefetch: bool = True
    prefetch_batches: int = 2
    enable_compression: bool = True


@dataclass
class CacheConfig:
    """Configuration for caching system"""
    enable_redis: bool = True
    enable_memory_cache: bool = True
    ttl_seconds: int = 3600
    max_memory_cache_size: int = 10000
    compression_threshold: int = 1024
    key_prefix: str = "phonelogai:validation:"


class MemoryManager:
    """Advanced memory management and monitoring"""
    
    def __init__(self, max_memory_mb: float = 2000.0):
        self.max_memory_mb = max_memory_mb
        self.process = psutil.Process()
        self.initial_memory_mb = self.get_current_memory_mb()
        self.peak_memory_mb = self.initial_memory_mb
        self.gc_threshold = max_memory_mb * 0.8  # Trigger GC at 80% of limit
        self.emergency_threshold = max_memory_mb * 0.95  # Emergency cleanup at 95%
        self.memory_history = []
        
    def get_current_memory_mb(self) -> float:
        """Get current memory usage in MB"""
        return self.process.memory_info().rss / 1024 / 1024
    
    def check_memory_usage(self) -> Dict[str, Any]:
        """Check current memory usage and take action if needed"""
        current_memory = self.get_current_memory_mb()
        self.peak_memory_mb = max(self.peak_memory_mb, current_memory)
        self.memory_history.append((time.time(), current_memory))
        
        # Keep only last 100 measurements
        if len(self.memory_history) > 100:
            self.memory_history = self.memory_history[-100:]
        
        memory_status = {
            'current_mb': current_memory,
            'peak_mb': self.peak_memory_mb,
            'usage_percent': current_memory / self.max_memory_mb * 100,
            'needs_gc': current_memory > self.gc_threshold,
            'emergency': current_memory > self.emergency_threshold
        }
        
        # Automatic cleanup if needed
        if memory_status['emergency']:
            self.emergency_cleanup()
        elif memory_status['needs_gc']:
            self.trigger_gc()
        
        return memory_status
    
    def trigger_gc(self) -> int:
        """Trigger garbage collection"""
        before_memory = self.get_current_memory_mb()
        collected = gc.collect()
        after_memory = self.get_current_memory_mb()
        
        logger.info(
            "Garbage collection triggered",
            before_memory_mb=before_memory,
            after_memory_mb=after_memory,
            freed_mb=before_memory - after_memory,
            objects_collected=collected
        )
        
        return collected
    
    def emergency_cleanup(self):
        """Emergency memory cleanup"""
        logger.warning("Emergency memory cleanup triggered", current_memory_mb=self.get_current_memory_mb())
        
        # Aggressive garbage collection
        for generation in range(3):
            gc.collect(generation)
        
        # Clear weak references
        gc.collect()
        
        after_memory = self.get_current_memory_mb()
        logger.info("Emergency cleanup completed", memory_mb=after_memory)


class IntelligentCache:
    """Intelligent caching system with Redis and memory fallback"""
    
    def __init__(self, config: CacheConfig):
        self.config = config
        self.redis_client = None
        self.memory_cache = {}
        self.memory_cache_access_times = {}
        self.cache_hits = 0
        self.cache_misses = 0
        
        # Initialize Redis if enabled
        if config.enable_redis:
            try:
                self.redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=False)
                self.redis_client.ping()
                logger.info("Redis cache initialized successfully")
            except Exception as e:
                logger.warning(f"Redis not available, using memory cache only: {e}")
                self.redis_client = None
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache with intelligent fallback"""
        full_key = self.config.key_prefix + key
        
        try:
            # Try Redis first
            if self.redis_client:
                value = self.redis_client.get(full_key)
                if value is not None:
                    self.cache_hits += 1
                    
                    # Decompress if needed
                    if len(value) > self.config.compression_threshold:
                        import zlib
                        value = zlib.decompress(value)
                    
                    return pickle.loads(value)
            
            # Fallback to memory cache
            if self.config.enable_memory_cache and key in self.memory_cache:
                self.cache_hits += 1
                self.memory_cache_access_times[key] = time.time()
                return self.memory_cache[key]
            
            self.cache_misses += 1
            return None
            
        except Exception as e:
            logger.error(f"Cache get failed: {e}")
            self.cache_misses += 1
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache with compression and expiration"""
        full_key = self.config.key_prefix + key
        ttl = ttl or self.config.ttl_seconds
        
        try:
            # Serialize value
            serialized = pickle.dumps(value)
            
            # Compress if large
            if len(serialized) > self.config.compression_threshold and self.config.enable_compression:
                import zlib
                serialized = zlib.compress(serialized)
            
            # Store in Redis
            if self.redis_client:
                self.redis_client.setex(full_key, ttl, serialized)
            
            # Store in memory cache
            if self.config.enable_memory_cache:
                self._manage_memory_cache_size()
                self.memory_cache[key] = value
                self.memory_cache_access_times[key] = time.time()
            
            return True
            
        except Exception as e:
            logger.error(f"Cache set failed: {e}")
            return False
    
    def _manage_memory_cache_size(self):
        """Manage memory cache size using LRU eviction"""
        if len(self.memory_cache) >= self.config.max_memory_cache_size:
            # Remove 20% of least recently used items
            items_to_remove = int(self.config.max_memory_cache_size * 0.2)
            
            # Sort by access time
            sorted_items = sorted(
                self.memory_cache_access_times.items(),
                key=lambda x: x[1]
            )
            
            for key, _ in sorted_items[:items_to_remove]:
                self.memory_cache.pop(key, None)
                self.memory_cache_access_times.pop(key, None)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            'cache_hits': self.cache_hits,
            'cache_misses': self.cache_misses,
            'hit_rate': self.cache_hits / max(self.cache_hits + self.cache_misses, 1),
            'memory_cache_size': len(self.memory_cache),
            'redis_available': self.redis_client is not None
        }


class StreamingProcessor:
    """High-performance streaming processor for large datasets"""
    
    def __init__(
        self,
        config: StreamingConfig,
        memory_manager: MemoryManager,
        cache: IntelligentCache
    ):
        self.config = config
        self.memory_manager = memory_manager
        self.cache = cache
        self.metrics = PerformanceMetrics()
        self.active_batches = 0
        self.semaphore = asyncio.Semaphore(config.max_concurrent_batches)
        
    async def stream_process(
        self,
        data_iterator: AsyncGenerator[List[Dict[str, Any]], None],
        processor_func: Callable,
        job_id: str,
        **kwargs
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """Stream process data with memory management and parallel processing"""
        self.metrics.start_time = time.time()
        
        try:
            # Prefetch batches if enabled
            batch_queue = asyncio.Queue(maxsize=self.config.prefetch_batches if self.config.enable_prefetch else 1)
            
            # Start prefetch task
            prefetch_task = asyncio.create_task(
                self._prefetch_batches(data_iterator, batch_queue)
            )
            
            # Process batches concurrently
            tasks = []
            
            while True:
                try:
                    # Get next batch
                    batch = await asyncio.wait_for(batch_queue.get(), timeout=30.0)
                    
                    if batch is None:  # End of data
                        break
                    
                    # Check memory before processing
                    memory_status = self.memory_manager.check_memory_usage()
                    if memory_status['emergency']:
                        logger.warning("Emergency memory condition - reducing parallelism")
                        # Process remaining tasks before continuing
                        if tasks:
                            await asyncio.gather(*tasks, return_exceptions=True)
                            tasks = []
                    
                    # Create processing task
                    task = asyncio.create_task(
                        self._process_batch_with_semaphore(
                            batch, processor_func, job_id, **kwargs
                        )
                    )
                    tasks.append(task)
                    
                    # Yield completed batches as they finish
                    if len(tasks) >= self.config.max_concurrent_batches:
                        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                        
                        for completed_task in done:
                            try:
                                result = await completed_task
                                if result:
                                    yield result
                                    self.metrics.processed_items += len(result)
                            except Exception as e:
                                logger.error(f"Batch processing failed: {e}")
                        
                        tasks = list(pending)
                
                except asyncio.TimeoutError:
                    logger.warning("Batch queue timeout - ending processing")
                    break
            
            # Process remaining tasks
            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for result in results:
                    if isinstance(result, Exception):
                        logger.error(f"Batch processing error: {result}")
                    elif result:
                        yield result
                        self.metrics.processed_items += len(result)
            
            # Wait for prefetch task to complete
            prefetch_task.cancel()
            try:
                await prefetch_task
            except asyncio.CancelledError:
                pass
            
        finally:
            self.metrics.end_time = time.time()
            final_memory = self.memory_manager.check_memory_usage()
            self.metrics.memory_usage_mb = final_memory['current_mb']
            self.metrics.peak_memory_mb = self.memory_manager.peak_memory_mb
            
            logger.info(
                "Streaming processing completed",
                job_id=job_id,
                processing_time_ms=self.metrics.processing_time_ms,
                processed_items=self.metrics.processed_items,
                items_per_second=self.metrics.items_per_second,
                peak_memory_mb=self.metrics.peak_memory_mb,
                cache_hit_rate=self.cache.get_stats()['hit_rate']
            )
    
    async def _prefetch_batches(
        self,
        data_iterator: AsyncGenerator[List[Dict[str, Any]], None],
        batch_queue: asyncio.Queue
    ):
        """Prefetch batches for smooth streaming"""
        try:
            async for batch in data_iterator:
                await batch_queue.put(batch)
                self.metrics.streaming_batches += 1
            
            # Signal end of data
            await batch_queue.put(None)
            
        except Exception as e:
            logger.error(f"Prefetch failed: {e}")
            await batch_queue.put(None)
    
    async def _process_batch_with_semaphore(
        self,
        batch: List[Dict[str, Any]],
        processor_func: Callable,
        job_id: str,
        **kwargs
    ) -> Optional[List[Dict[str, Any]]]:
        """Process batch with concurrency control"""
        async with self.semaphore:
            self.active_batches += 1
            try:
                # Check cache for batch results
                batch_key = self._generate_batch_cache_key(batch, processor_func.__name__)
                cached_result = await self.cache.get(batch_key)
                
                if cached_result is not None:
                    logger.debug(f"Cache hit for batch of {len(batch)} items")
                    return cached_result
                
                # Process batch
                if asyncio.iscoroutinefunction(processor_func):
                    result = await processor_func(batch, job_id, **kwargs)
                else:
                    # Run CPU-intensive function in thread pool
                    loop = asyncio.get_event_loop()
                    with ThreadPoolExecutor(max_workers=2) as executor:
                        result = await loop.run_in_executor(
                            executor, processor_func, batch, job_id, **kwargs
                        )
                
                # Cache successful results
                if result:
                    await self.cache.set(batch_key, result, ttl=1800)  # 30 minutes
                
                return result
                
            except Exception as e:
                logger.error(f"Batch processing error: {e}", job_id=job_id)
                return None
            finally:
                self.active_batches -= 1
    
    def _generate_batch_cache_key(self, batch: List[Dict[str, Any]], func_name: str) -> str:
        """Generate cache key for batch"""
        # Create hash from first and last items + batch size
        if not batch:
            return f"{func_name}:empty"
        
        key_data = f"{func_name}:{len(batch)}:{batch[0]}:{batch[-1]}"
        return hashlib.md5(key_data.encode()).hexdigest()


class ParallelProcessor:
    """Parallel processing with resource-aware scheduling"""
    
    def __init__(self, memory_manager: MemoryManager):
        self.memory_manager = memory_manager
        self.cpu_count = cpu_count()
        self.optimal_workers = min(self.cpu_count, 8)  # Cap at 8 workers
        self.metrics = PerformanceMetrics()
    
    async def parallel_process_batches(
        self,
        batches: List[List[Dict[str, Any]]],
        processor_func: Callable,
        job_id: str,
        max_workers: Optional[int] = None,
        **kwargs
    ) -> List[List[Dict[str, Any]]]:
        """Process batches in parallel with resource awareness"""
        max_workers = max_workers or self.optimal_workers
        
        # Adjust workers based on memory usage
        memory_status = self.memory_manager.check_memory_usage()
        if memory_status['usage_percent'] > 80:
            max_workers = max(1, max_workers // 2)
            logger.info(f"Reducing parallelism due to memory usage: {max_workers} workers")
        
        self.metrics.start_time = time.time()
        self.metrics.parallel_tasks = max_workers
        
        results = []
        
        try:
            # Use ThreadPoolExecutor for CPU-bound tasks
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit all batches
                future_to_batch = {}
                
                for i, batch in enumerate(batches):
                    future = executor.submit(
                        self._safe_process_batch,
                        batch, processor_func, f"{job_id}_batch_{i}", **kwargs
                    )
                    future_to_batch[future] = i
                
                # Collect results as they complete
                batch_results = [None] * len(batches)
                
                for future in as_completed(future_to_batch):
                    batch_index = future_to_batch[future]
                    try:
                        result = future.result(timeout=300)  # 5 minute timeout per batch
                        batch_results[batch_index] = result
                        
                        if result:
                            self.metrics.processed_items += len(result)
                        
                        # Memory check after each completed batch
                        self.memory_manager.check_memory_usage()
                        
                    except Exception as e:
                        logger.error(f"Parallel batch {batch_index} failed: {e}")
                        batch_results[batch_index] = []
                
                # Filter out None results
                results = [r for r in batch_results if r is not None]
        
        finally:
            self.metrics.end_time = time.time()
            memory_status = self.memory_manager.check_memory_usage()
            self.metrics.memory_usage_mb = memory_status['current_mb']
            self.metrics.peak_memory_mb = memory_status['peak_mb']
        
        logger.info(
            "Parallel processing completed",
            job_id=job_id,
            batches_processed=len(results),
            parallel_workers=max_workers,
            processing_time_ms=self.metrics.processing_time_ms,
            items_per_second=self.metrics.items_per_second,
            peak_memory_mb=self.metrics.peak_memory_mb
        )
        
        return results
    
    def _safe_process_batch(
        self,
        batch: List[Dict[str, Any]],
        processor_func: Callable,
        batch_job_id: str,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Safely process batch with error handling"""
        try:
            return processor_func(batch, batch_job_id, **kwargs)
        except Exception as e:
            logger.error(f"Batch processing error in {batch_job_id}: {e}")
            return []


class PerformanceOptimizer:
    """Main performance optimization coordinator"""
    
    def __init__(
        self,
        max_memory_mb: float = 2000.0,
        streaming_config: Optional[StreamingConfig] = None,
        cache_config: Optional[CacheConfig] = None
    ):
        self.memory_manager = MemoryManager(max_memory_mb)
        self.cache = IntelligentCache(cache_config or CacheConfig())
        self.streaming_processor = StreamingProcessor(
            streaming_config or StreamingConfig(),
            self.memory_manager,
            self.cache
        )
        self.parallel_processor = ParallelProcessor(self.memory_manager)
        
        # Performance targets
        self.targets = {
            'max_processing_time_100k': 300,  # 5 minutes
            'max_processing_time_1m': 1800,   # 30 minutes  
            'max_memory_usage_mb': max_memory_mb,
            'min_throughput_per_second': 50
        }
    
    async def optimize_validation_processing(
        self,
        data_iterator: AsyncGenerator[List[Dict[str, Any]], None],
        processor_func: Callable,
        job_id: str,
        estimated_total_items: int = 0,
        **kwargs
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """Optimized validation processing with streaming and caching"""
        
        # Select optimization strategy based on data size
        if estimated_total_items > 50000:  # Use streaming for large datasets
            logger.info(f"Using streaming optimization for {estimated_total_items} items")
            async for batch_result in self.streaming_processor.stream_process(
                data_iterator, processor_func, job_id, **kwargs
            ):
                yield batch_result
        else:
            # Use parallel processing for smaller datasets
            logger.info(f"Using parallel optimization for {estimated_total_items} items")
            
            # Collect all batches
            batches = []
            async for batch in data_iterator:
                batches.append(batch)
            
            # Process in parallel
            results = await self.parallel_processor.parallel_process_batches(
                batches, processor_func, job_id, **kwargs
            )
            
            for result in results:
                if result:
                    yield result
    
    async def batch_data_iterator(
        self,
        data: List[Dict[str, Any]],
        batch_size: int = 1000
    ) -> AsyncGenerator[List[Dict[str, Any]], None]:
        """Create async iterator from data with batching"""
        for i in range(0, len(data), batch_size):
            batch = data[i:i+batch_size]
            yield batch
            
            # Small delay to allow other tasks to run
            await asyncio.sleep(0.01)
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get comprehensive performance metrics"""
        memory_status = self.memory_manager.check_memory_usage()
        cache_stats = self.cache.get_stats()
        
        return {
            'memory_metrics': {
                'current_mb': memory_status['current_mb'],
                'peak_mb': memory_status['peak_mb'],
                'usage_percent': memory_status['usage_percent'],
                'initial_mb': self.memory_manager.initial_memory_mb
            },
            'cache_metrics': cache_stats,
            'streaming_metrics': {
                'processed_items': self.streaming_processor.metrics.processed_items,
                'processing_time_ms': self.streaming_processor.metrics.processing_time_ms,
                'items_per_second': self.streaming_processor.metrics.items_per_second,
                'streaming_batches': self.streaming_processor.metrics.streaming_batches
            },
            'parallel_metrics': {
                'processed_items': self.parallel_processor.metrics.processed_items,
                'processing_time_ms': self.parallel_processor.metrics.processing_time_ms,
                'parallel_tasks': self.parallel_processor.metrics.parallel_tasks,
                'items_per_second': self.parallel_processor.metrics.items_per_second
            },
            'target_compliance': self._check_target_compliance()
        }
    
    def _check_target_compliance(self) -> Dict[str, bool]:
        """Check if performance targets are being met"""
        memory_status = self.memory_manager.check_memory_usage()
        
        return {
            'memory_target_met': memory_status['current_mb'] < self.targets['max_memory_usage_mb'],
            'throughput_target_met': (
                self.streaming_processor.metrics.items_per_second >= self.targets['min_throughput_per_second'] or
                self.parallel_processor.metrics.items_per_second >= self.targets['min_throughput_per_second']
            )
        }
    
    async def cleanup(self):
        """Cleanup resources"""
        if self.cache.redis_client:
            await self.cache.redis_client.aclose()


# Global performance optimizer instance
performance_optimizer = PerformanceOptimizer()