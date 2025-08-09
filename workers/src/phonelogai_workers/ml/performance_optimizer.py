"""
Performance optimization system for high-volume data processing

Implements advanced techniques to achieve:
- 100k rows in <5min target
- 1M rows in <30min target  
- Memory-efficient processing
- Parallel processing with smart batching
- Adaptive performance tuning
"""

import time
import psutil
import threading
from typing import Dict, List, Optional, Any, Callable, Iterator, Tuple
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from multiprocessing import cpu_count
from pathlib import Path
import structlog
import numpy as np
import pandas as pd
from dataclasses import dataclass
from queue import Queue, Empty
import gc
import pickle
from contextlib import contextmanager

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


@dataclass
class ProcessingMetrics:
    """Metrics for monitoring processing performance"""
    start_time: float
    end_time: Optional[float] = None
    rows_processed: int = 0
    memory_peak_mb: float = 0.0
    cpu_avg_percent: float = 0.0
    errors_count: int = 0
    throughput_rows_per_sec: float = 0.0
    efficiency_score: float = 0.0
    
    def calculate_throughput(self):
        """Calculate processing throughput"""
        if self.end_time and self.start_time:
            duration = self.end_time - self.start_time
            if duration > 0:
                self.throughput_rows_per_sec = self.rows_processed / duration
    
    def calculate_efficiency(self):
        """Calculate efficiency score based on resource utilization"""
        if self.throughput_rows_per_sec > 0:
            # Efficiency = throughput / (memory_usage * cpu_usage)
            resource_usage = max(self.memory_peak_mb * self.cpu_avg_percent, 1)
            self.efficiency_score = (self.throughput_rows_per_sec * 100) / resource_usage


class AdaptiveBatchProcessor:
    """Adaptive batch processor that optimizes batch size based on system performance"""
    
    def __init__(self):
        self.initial_batch_size = 1000
        self.min_batch_size = 100
        self.max_batch_size = 50000
        self.current_batch_size = self.initial_batch_size
        self.performance_history = []
        self.memory_threshold_mb = 1500  # 1.5GB threshold
        self.cpu_threshold_percent = 85
        
    def get_optimal_batch_size(self, estimated_rows: int, available_memory_mb: float) -> int:
        """Calculate optimal batch size based on system resources and data size"""
        
        # Base calculation on available memory
        estimated_mb_per_1k_rows = 10  # Rough estimate
        memory_based_batch = min(
            int((available_memory_mb * 0.7) / estimated_mb_per_1k_rows * 1000),
            self.max_batch_size
        )
        
        # Adjust based on total data size
        if estimated_rows < 10000:
            # Small datasets: use larger batches
            size_adjusted = min(estimated_rows // 2, 5000)
        elif estimated_rows < 100000:
            # Medium datasets: balanced approach
            size_adjusted = min(estimated_rows // 10, 10000)
        else:
            # Large datasets: smaller batches for better progress tracking
            size_adjusted = min(estimated_rows // 50, 20000)
        
        # Take minimum of memory and size constraints
        optimal_size = min(memory_based_batch, size_adjusted)
        optimal_size = max(optimal_size, self.min_batch_size)
        
        logger.info(
            "Calculated optimal batch size",
            estimated_rows=estimated_rows,
            available_memory_mb=available_memory_mb,
            optimal_batch_size=optimal_size
        )
        
        return optimal_size
    
    def adjust_batch_size(self, performance_metrics: ProcessingMetrics):
        """Dynamically adjust batch size based on performance metrics"""
        
        self.performance_history.append(performance_metrics)
        
        # Keep only recent history
        if len(self.performance_history) > 5:
            self.performance_history = self.performance_history[-5:]
        
        # Don't adjust until we have some history
        if len(self.performance_history) < 2:
            return
        
        recent_metrics = self.performance_history[-1]
        previous_metrics = self.performance_history[-2]
        
        # Check if we're hitting resource limits
        if recent_metrics.memory_peak_mb > self.memory_threshold_mb:
            # Reduce batch size due to memory pressure
            self.current_batch_size = max(
                int(self.current_batch_size * 0.8),
                self.min_batch_size
            )
            logger.info(
                "Reducing batch size due to memory pressure",
                new_size=self.current_batch_size,
                memory_usage=recent_metrics.memory_peak_mb
            )
            
        elif recent_metrics.cpu_avg_percent > self.cpu_threshold_percent:
            # Reduce batch size due to CPU pressure
            self.current_batch_size = max(
                int(self.current_batch_size * 0.9),
                self.min_batch_size
            )
            logger.info(
                "Reducing batch size due to CPU pressure",
                new_size=self.current_batch_size,
                cpu_usage=recent_metrics.cpu_avg_percent
            )
            
        else:
            # Try to increase batch size if performance is good
            if (recent_metrics.throughput_rows_per_sec > previous_metrics.throughput_rows_per_sec
                and recent_metrics.memory_peak_mb < self.memory_threshold_mb * 0.8):
                
                self.current_batch_size = min(
                    int(self.current_batch_size * 1.1),
                    self.max_batch_size
                )
                logger.info(
                    "Increasing batch size due to good performance",
                    new_size=self.current_batch_size,
                    throughput=recent_metrics.throughput_rows_per_sec
                )


class PerformanceMonitor:
    """Monitor system performance during processing"""
    
    def __init__(self):
        self.monitoring = False
        self.metrics_queue = Queue()
        self.monitor_thread = None
        self.process = psutil.Process()
        
    def start_monitoring(self) -> ProcessingMetrics:
        """Start performance monitoring"""
        metrics = ProcessingMetrics(start_time=time.time())
        self.monitoring = True
        
        self.monitor_thread = threading.Thread(
            target=self._monitor_resources,
            args=(metrics,),
            daemon=True
        )
        self.monitor_thread.start()
        
        return metrics
    
    def stop_monitoring(self, metrics: ProcessingMetrics):
        """Stop monitoring and finalize metrics"""
        self.monitoring = False
        
        if self.monitor_thread:
            self.monitor_thread.join(timeout=1.0)
        
        metrics.end_time = time.time()
        metrics.calculate_throughput()
        metrics.calculate_efficiency()
        
        # Collect final resource usage
        try:
            memory_info = self.process.memory_info()
            metrics.memory_peak_mb = max(
                metrics.memory_peak_mb,
                memory_info.rss / 1024 / 1024
            )
        except:
            pass
    
    def _monitor_resources(self, metrics: ProcessingMetrics):
        """Monitor system resources in background thread"""
        cpu_samples = []
        
        while self.monitoring:
            try:
                # Monitor memory
                memory_info = self.process.memory_info()
                memory_mb = memory_info.rss / 1024 / 1024
                metrics.memory_peak_mb = max(metrics.memory_peak_mb, memory_mb)
                
                # Monitor CPU
                cpu_percent = self.process.cpu_percent(interval=0.1)
                cpu_samples.append(cpu_percent)
                
                # Keep only recent samples
                if len(cpu_samples) > 50:
                    cpu_samples = cpu_samples[-50:]
                
                metrics.cpu_avg_percent = np.mean(cpu_samples)
                
                time.sleep(0.5)
                
            except Exception as e:
                logger.warning("Error monitoring resources", error=str(e))
                break


class ParallelProcessor:
    """High-performance parallel processor for large datasets"""
    
    def __init__(self, max_workers: Optional[int] = None):
        self.max_workers = max_workers or min(cpu_count(), 8)
        self.batch_processor = AdaptiveBatchProcessor()
        self.performance_monitor = PerformanceMonitor()
        
    def process_in_parallel(
        self,
        data_iterator: Iterator[Any],
        processing_function: Callable,
        total_rows: Optional[int] = None,
        job_id: Optional[str] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> Tuple[List[Any], ProcessingMetrics]:
        """
        Process data in parallel with adaptive batching
        
        Args:
            data_iterator: Iterator over data items to process
            processing_function: Function to process each batch
            total_rows: Estimated total number of rows
            job_id: Optional job ID for progress tracking
            progress_callback: Optional callback for progress updates
            
        Returns:
            Tuple of (results, performance_metrics)
        """
        
        # Start performance monitoring
        metrics = self.performance_monitor.start_monitoring()
        
        try:
            # Determine optimal batch size
            available_memory = psutil.virtual_memory().available / 1024 / 1024  # MB
            batch_size = self.batch_processor.get_optimal_batch_size(
                total_rows or 100000,
                available_memory
            )
            
            results = []
            processed_count = 0
            batch_count = 0
            
            logger.info(
                "Starting parallel processing",
                max_workers=self.max_workers,
                initial_batch_size=batch_size,
                estimated_rows=total_rows,
                job_id=job_id
            )
            
            # Process data in batches
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                batch_futures = {}
                
                # Create batches and submit for processing
                current_batch = []
                
                for item in data_iterator:
                    current_batch.append(item)
                    
                    if len(current_batch) >= batch_size:
                        # Submit batch for processing
                        future = executor.submit(
                            self._process_batch_with_monitoring,
                            current_batch.copy(),
                            processing_function,
                            batch_count
                        )
                        batch_futures[future] = len(current_batch)
                        current_batch = []
                        batch_count += 1
                
                # Submit final batch if not empty
                if current_batch:
                    future = executor.submit(
                        self._process_batch_with_monitoring,
                        current_batch,
                        processing_function,
                        batch_count
                    )
                    batch_futures[future] = len(current_batch)
                
                # Collect results as batches complete
                for future in as_completed(batch_futures):
                    try:
                        batch_results, batch_metrics = future.result()
                        results.extend(batch_results)
                        
                        batch_size_used = batch_futures[future]
                        processed_count += batch_size_used
                        metrics.rows_processed = processed_count
                        
                        # Update batch processor with performance feedback
                        self.batch_processor.adjust_batch_size(batch_metrics)
                        batch_size = self.batch_processor.current_batch_size
                        
                        # Progress reporting
                        if progress_callback and total_rows:
                            progress_callback(processed_count, total_rows)
                        
                        # Update job status
                        if job_id:
                            progress = processed_count / total_rows if total_rows else 0
                            await db_manager.update_job_status(
                                job_id=job_id,
                                status="processing",
                                progress=progress,
                                processed_rows=processed_count,
                                total_rows=total_rows
                            )
                        
                        logger.debug(
                            "Batch completed",
                            batch_size=batch_size_used,
                            processed_total=processed_count,
                            throughput=batch_metrics.throughput_rows_per_sec
                        )
                        
                    except Exception as e:
                        logger.error("Batch processing failed", error=str(e))
                        metrics.errors_count += 1
            
            metrics.rows_processed = processed_count
            
            logger.info(
                "Parallel processing completed",
                total_processed=processed_count,
                total_batches=batch_count,
                errors=metrics.errors_count
            )
            
            return results, metrics
            
        except Exception as e:
            logger.error("Parallel processing failed", error=str(e))
            metrics.errors_count += 1
            raise
            
        finally:
            # Stop monitoring and calculate final metrics
            self.performance_monitor.stop_monitoring(metrics)
            
            # Force garbage collection
            gc.collect()
    
    def _process_batch_with_monitoring(
        self,
        batch: List[Any],
        processing_function: Callable,
        batch_id: int
    ) -> Tuple[List[Any], ProcessingMetrics]:
        """Process a single batch with performance monitoring"""
        
        batch_metrics = ProcessingMetrics(start_time=time.time())
        batch_metrics.rows_processed = len(batch)
        
        try:
            # Monitor memory before processing
            process = psutil.Process()
            memory_before = process.memory_info().rss / 1024 / 1024
            
            # Process the batch
            batch_results = processing_function(batch)
            
            # Monitor memory after processing
            memory_after = process.memory_info().rss / 1024 / 1024
            batch_metrics.memory_peak_mb = max(memory_before, memory_after)
            
            batch_metrics.end_time = time.time()
            batch_metrics.calculate_throughput()
            
            return batch_results, batch_metrics
            
        except Exception as e:
            batch_metrics.errors_count += 1
            batch_metrics.end_time = time.time()
            logger.error(f"Batch {batch_id} processing failed", error=str(e))
            raise


class MemoryOptimizer:
    """Memory optimization utilities for large dataset processing"""
    
    def __init__(self):
        self.memory_threshold_mb = settings.max_memory_usage_mb
        self.gc_threshold = 0.8  # Trigger GC at 80% of threshold
        
    @contextmanager
    def memory_limit_context(self):
        """Context manager to monitor and limit memory usage"""
        initial_memory = self.get_current_memory_mb()
        
        try:
            yield
        finally:
            current_memory = self.get_current_memory_mb()
            
            if current_memory > self.memory_threshold_mb * self.gc_threshold:
                logger.info(
                    "Triggering garbage collection",
                    current_memory=current_memory,
                    threshold=self.memory_threshold_mb
                )
                gc.collect()
                
                # Check memory again after GC
                after_gc_memory = self.get_current_memory_mb()
                logger.info(
                    "Memory after GC",
                    before_gc=current_memory,
                    after_gc=after_gc_memory,
                    freed_mb=current_memory - after_gc_memory
                )
    
    def get_current_memory_mb(self) -> float:
        """Get current memory usage in MB"""
        try:
            process = psutil.Process()
            return process.memory_info().rss / 1024 / 1024
        except:
            return 0.0
    
    def optimize_pandas_dtypes(self, df: pd.DataFrame) -> pd.DataFrame:
        """Optimize pandas DataFrame dtypes to reduce memory usage"""
        
        original_memory = df.memory_usage(deep=True).sum() / 1024 / 1024
        
        # Optimize numeric columns
        for col in df.select_dtypes(include=['int64']).columns:
            col_min = df[col].min()
            col_max = df[col].max()
            
            if col_min >= np.iinfo(np.int8).min and col_max <= np.iinfo(np.int8).max:
                df[col] = df[col].astype(np.int8)
            elif col_min >= np.iinfo(np.int16).min and col_max <= np.iinfo(np.int16).max:
                df[col] = df[col].astype(np.int16)
            elif col_min >= np.iinfo(np.int32).min and col_max <= np.iinfo(np.int32).max:
                df[col] = df[col].astype(np.int32)
        
        # Optimize float columns
        for col in df.select_dtypes(include=['float64']).columns:
            df[col] = pd.to_numeric(df[col], downcast='float')
        
        # Optimize object columns to category where beneficial
        for col in df.select_dtypes(include=['object']).columns:
            if df[col].nunique() / len(df) < 0.5:  # Less than 50% unique values
                df[col] = df[col].astype('category')
        
        optimized_memory = df.memory_usage(deep=True).sum() / 1024 / 1024
        memory_reduction = ((original_memory - optimized_memory) / original_memory) * 100
        
        logger.info(
            "DataFrame memory optimization",
            original_mb=original_memory,
            optimized_mb=optimized_memory,
            reduction_percent=memory_reduction
        )
        
        return df
    
    def chunked_processing(
        self,
        data_source: Any,
        chunk_size: int,
        processing_function: Callable[[pd.DataFrame], Any]
    ) -> Iterator[Any]:
        """Process large datasets in chunks to manage memory"""
        
        if isinstance(data_source, pd.DataFrame):
            # Process DataFrame in chunks
            for i in range(0, len(data_source), chunk_size):
                chunk = data_source.iloc[i:i + chunk_size].copy()
                
                with self.memory_limit_context():
                    result = processing_function(chunk)
                    yield result
                
                # Clear chunk from memory
                del chunk
                
        elif hasattr(data_source, 'read'):  # File-like object
            # Process file in chunks
            chunk_count = 0
            
            for chunk in pd.read_csv(data_source, chunksize=chunk_size):
                with self.memory_limit_context():
                    result = processing_function(chunk)
                    yield result
                
                chunk_count += 1
                
                if chunk_count % 10 == 0:  # Every 10 chunks
                    gc.collect()


class PerformanceProfiler:
    """Performance profiling and optimization recommendations"""
    
    def __init__(self):
        self.profiles = {}
        
    def profile_processing_step(
        self,
        step_name: str,
        processing_function: Callable,
        *args,
        **kwargs
    ) -> Tuple[Any, Dict[str, Any]]:
        """Profile a processing step and collect performance data"""
        
        start_time = time.time()
        start_memory = psutil.Process().memory_info().rss / 1024 / 1024
        
        try:
            result = processing_function(*args, **kwargs)
            
            end_time = time.time()
            end_memory = psutil.Process().memory_info().rss / 1024 / 1024
            
            profile_data = {
                "duration_seconds": end_time - start_time,
                "memory_delta_mb": end_memory - start_memory,
                "peak_memory_mb": end_memory,
                "success": True,
                "timestamp": time.time()
            }
            
            self.profiles[step_name] = self.profiles.get(step_name, []) + [profile_data]
            
            logger.info(
                f"Step '{step_name}' profiled",
                duration=profile_data["duration_seconds"],
                memory_delta=profile_data["memory_delta_mb"]
            )
            
            return result, profile_data
            
        except Exception as e:
            end_time = time.time()
            
            profile_data = {
                "duration_seconds": end_time - start_time,
                "memory_delta_mb": 0,
                "peak_memory_mb": start_memory,
                "success": False,
                "error": str(e),
                "timestamp": time.time()
            }
            
            self.profiles[step_name] = self.profiles.get(step_name, []) + [profile_data]
            raise
    
    def get_performance_recommendations(self) -> List[Dict[str, str]]:
        """Generate performance optimization recommendations based on profiling data"""
        
        recommendations = []
        
        for step_name, step_profiles in self.profiles.items():
            if not step_profiles:
                continue
            
            avg_duration = np.mean([p["duration_seconds"] for p in step_profiles])
            avg_memory = np.mean([p["memory_delta_mb"] for p in step_profiles])
            success_rate = np.mean([p["success"] for p in step_profiles])
            
            # Duration-based recommendations
            if avg_duration > 30:  # Steps taking more than 30 seconds
                recommendations.append({
                    "step": step_name,
                    "type": "performance",
                    "issue": "Slow processing",
                    "recommendation": "Consider parallel processing or batch size optimization",
                    "impact": "high"
                })
            
            # Memory-based recommendations
            if avg_memory > 500:  # Steps using more than 500MB
                recommendations.append({
                    "step": step_name,
                    "type": "memory",
                    "issue": "High memory usage",
                    "recommendation": "Implement chunked processing or memory optimization",
                    "impact": "medium"
                })
            
            # Success rate recommendations
            if success_rate < 0.9:  # Less than 90% success rate
                recommendations.append({
                    "step": step_name,
                    "type": "reliability",
                    "issue": "Low success rate",
                    "recommendation": "Review error handling and add validation",
                    "impact": "high"
                })
        
        return recommendations


# Global instances
parallel_processor = ParallelProcessor()
memory_optimizer = MemoryOptimizer()
performance_profiler = PerformanceProfiler()