"""
Enhanced Celery application configuration for PhoneLog AI workers
Task 5: Enhanced Celery integration with priority queues, progress tracking, 
resource-aware scheduling, and worker health monitoring
"""
import time
import psutil
from typing import Dict, Any, Optional
import structlog
from celery import Celery
from celery.signals import setup_logging, worker_ready, worker_shutdown, task_prerun, task_postrun
from celery.app.control import Control

from ..config import settings

# Configure structured logging
logger = structlog.get_logger(__name__)


@setup_logging.connect
def config_loggers(*args, **kwargs):
    """Configure structured logging for Celery"""
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


# Enhanced Celery configuration with priority queues and resource management
ENHANCED_CELERY_CONFIG = {
    # Basic configuration
    'broker_url': settings.celery_broker_url,
    'result_backend': settings.celery_result_backend,
    
    # Priority queue configuration
    'broker_transport_options': {
        'priority_steps': list(range(10)),  # Priorities 0-9
        'sep': ':',
        'queue_order_strategy': 'priority',
    },
    
    # Task routing with priorities
    'task_routes': {
        # High priority tasks
        'phonelogai_workers.validation.validation_pipeline.validate_data_pipeline_task': {
            'queue': 'validation_high',
            'priority': 9,
        },
        'phonelogai_workers.tasks.enhanced_processing_tasks.process_file_enhanced': {
            'queue': 'processing_high',
            'priority': 8,
        },
        
        # Medium priority tasks
        'phonelogai_workers.tasks.file_processing_tasks.*': {
            'queue': 'processing_medium',
            'priority': 5,
        },
        
        # Low priority tasks
        'phonelogai_workers.queue.celery_app.health_check': {
            'queue': 'monitoring',
            'priority': 1,
        },
        'phonelogai_workers.queue.celery_app.cleanup_task': {
            'queue': 'maintenance',
            'priority': 1,
        }
    },
    
    # Worker configuration
    'worker_prefetch_multiplier': 1,  # Only prefetch one task per worker
    'task_acks_late': True,
    'worker_disable_rate_limits': False,
    'worker_max_tasks_per_child': 100,  # Restart worker after 100 tasks
    'worker_max_memory_per_child': 200000,  # 200MB memory limit per worker
    
    # Task configuration
    'task_serializer': 'json',
    'result_serializer': 'json',
    'accept_content': ['json'],
    'timezone': 'UTC',
    'enable_utc': True,
    
    # Result expiration
    'result_expires': 3600,  # 1 hour
    
    # Task time limits
    'task_soft_time_limit': 1800,  # 30 minutes soft limit
    'task_time_limit': 2400,       # 40 minutes hard limit
    
    # Retry configuration
    'task_reject_on_worker_lost': True,
    'task_acks_on_failure_or_timeout': True,
    
    # Monitoring
    'worker_send_task_events': True,
    'task_send_sent_event': True,
    
    # Resource management
    'worker_concurrency': None,  # Will be set dynamically based on resources
}


# Create enhanced Celery app instance
celery_app = Celery(
    "phonelogai_workers",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

# Apply enhanced configuration
celery_app.config_from_object(ENHANCED_CELERY_CONFIG)

# Auto-discover tasks
celery_app.autodiscover_tasks([
    "phonelogai_workers.tasks",
    "phonelogai_workers.validation",
])


class WorkerHealthMonitor:
    """Monitor worker health and resource usage"""
    
    def __init__(self):
        self.start_time = time.time()
        self.task_count = 0
        self.error_count = 0
        self.last_health_check = time.time()
        self.resource_history = []
    
    def get_system_resources(self) -> Dict[str, Any]:
        """Get current system resource usage"""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_mb = memory.used / 1024 / 1024
            memory_percent = memory.percent
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            
            # Load average (Unix-like systems)
            try:
                load_avg = psutil.getloadavg()[0]  # 1-minute load average
            except:
                load_avg = 0.0
            
            resources = {
                'cpu_percent': cpu_percent,
                'memory_mb': memory_mb,
                'memory_percent': memory_percent,
                'disk_percent': disk_percent,
                'load_average': load_avg,
                'timestamp': time.time()
            }
            
            # Keep history (last 100 measurements)
            self.resource_history.append(resources)
            if len(self.resource_history) > 100:
                self.resource_history.pop(0)
            
            return resources
            
        except Exception as e:
            logger.error(f"Failed to get system resources: {e}")
            return {}
    
    def get_optimal_concurrency(self) -> int:
        """Calculate optimal worker concurrency based on resources"""
        try:
            resources = self.get_system_resources()
            cpu_count = psutil.cpu_count()
            
            # Base concurrency on CPU count
            base_concurrency = cpu_count
            
            # Adjust based on CPU usage
            cpu_usage = resources.get('cpu_percent', 50)
            if cpu_usage > 80:
                base_concurrency = max(1, base_concurrency // 2)
            elif cpu_usage < 30:
                base_concurrency = min(cpu_count * 2, base_concurrency + 2)
            
            # Adjust based on memory usage
            memory_usage = resources.get('memory_percent', 50)
            if memory_usage > 85:
                base_concurrency = max(1, base_concurrency // 2)
            
            # Cap at reasonable limits
            return max(1, min(base_concurrency, 16))
            
        except Exception as e:
            logger.error(f"Failed to calculate optimal concurrency: {e}")
            return 4  # Default fallback
    
    def is_healthy(self) -> bool:
        """Check if worker is healthy"""
        try:
            resources = self.get_system_resources()
            
            # Check resource thresholds
            cpu_ok = resources.get('cpu_percent', 0) < 95
            memory_ok = resources.get('memory_percent', 0) < 90
            disk_ok = resources.get('disk_percent', 0) < 95
            
            # Check error rate
            uptime_hours = (time.time() - self.start_time) / 3600
            error_rate = self.error_count / max(uptime_hours, 0.01)
            error_ok = error_rate < 10  # Less than 10 errors per hour
            
            return cpu_ok and memory_ok and disk_ok and error_ok
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive health status"""
        resources = self.get_system_resources()
        uptime_hours = (time.time() - self.start_time) / 3600
        
        return {
            'healthy': self.is_healthy(),
            'uptime_hours': round(uptime_hours, 2),
            'task_count': self.task_count,
            'error_count': self.error_count,
            'error_rate_per_hour': self.error_count / max(uptime_hours, 0.01),
            'resources': resources,
            'optimal_concurrency': self.get_optimal_concurrency()
        }


# Global worker health monitor
worker_health_monitor = WorkerHealthMonitor()


# Enhanced health check task with resource monitoring
@celery_app.task(bind=True, name='health_check')
def health_check(self):
    """Enhanced health check task with resource monitoring"""
    health_status = worker_health_monitor.get_health_status()
    
    return {
        "status": "healthy" if health_status['healthy'] else "unhealthy",
        "worker_id": self.request.id,
        "timestamp": time.time(),
        "health_details": health_status
    }


# Resource-aware task for dynamic worker adjustment
@celery_app.task(bind=True, name='adjust_worker_resources')
def adjust_worker_resources(self):
    """Adjust worker resources based on current load"""
    try:
        health_status = worker_health_monitor.get_health_status()
        optimal_concurrency = health_status['optimal_concurrency']
        
        # Get current worker pool size (this would require celery management commands)
        # For now, just log the recommendation
        logger.info(
            "Resource adjustment recommendation",
            current_concurrency="unknown",  # Would need to query actual worker pool
            optimal_concurrency=optimal_concurrency,
            cpu_percent=health_status['resources'].get('cpu_percent', 0),
            memory_percent=health_status['resources'].get('memory_percent', 0)
        )
        
        return {
            "optimal_concurrency": optimal_concurrency,
            "resources": health_status['resources'],
            "adjusted": False  # Would be True if we actually adjusted
        }
        
    except Exception as e:
        logger.error(f"Resource adjustment failed: {e}")
        return {"error": str(e)}


# Cleanup task for maintenance
@celery_app.task(bind=True, name='cleanup_task')
def cleanup_task(self):
    """Cleanup task for maintenance operations"""
    try:
        import gc
        
        # Force garbage collection
        collected = gc.collect()
        
        # Clear any temporary files or caches
        # (Implementation would depend on specific cleanup needs)
        
        logger.info(
            "Cleanup task completed",
            objects_collected=collected,
            worker_id=self.request.id
        )
        
        return {
            "status": "completed",
            "objects_collected": collected,
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Cleanup task failed: {e}")
        return {"status": "failed", "error": str(e)}


# Progress tracking task
@celery_app.task(bind=True, name='track_progress')
def track_progress(self, job_id: str, current: int, total: int, stage: str):
    """Track and report task progress"""
    try:
        progress = (current / total * 100) if total > 0 else 0
        
        # Update task state with progress
        self.update_state(
            state='PROGRESS',
            meta={
                'current': current,
                'total': total,
                'stage': stage,
                'progress': progress
            }
        )
        
        logger.info(
            "Progress updated",
            job_id=job_id,
            current=current,
            total=total,
            progress=progress,
            stage=stage
        )
        
        return {
            'job_id': job_id,
            'progress': progress,
            'stage': stage,
            'timestamp': time.time()
        }
        
    except Exception as e:
        logger.error(f"Progress tracking failed: {e}")
        return {"error": str(e)}


# Celery signal handlers for enhanced monitoring

@worker_ready.connect
def worker_ready_handler(sender=None, **kwargs):
    """Handle worker ready signal"""
    logger.info(
        "Worker ready",
        worker_name=sender,
        optimal_concurrency=worker_health_monitor.get_optimal_concurrency()
    )


@worker_shutdown.connect
def worker_shutdown_handler(sender=None, **kwargs):
    """Handle worker shutdown signal"""
    health_status = worker_health_monitor.get_health_status()
    logger.info(
        "Worker shutting down",
        worker_name=sender,
        uptime_hours=health_status['uptime_hours'],
        tasks_processed=health_status['task_count'],
        errors=health_status['error_count']
    )


@task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **kwds):
    """Handle task pre-run for resource monitoring"""
    worker_health_monitor.task_count += 1
    
    # Log task start with resource info
    resources = worker_health_monitor.get_system_resources()
    logger.info(
        "Task starting",
        task_id=task_id,
        task_name=task.name if task else "unknown",
        memory_mb=resources.get('memory_mb', 0),
        cpu_percent=resources.get('cpu_percent', 0)
    )


@task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, 
                         retval=None, state=None, **kwds):
    """Handle task post-run for monitoring"""
    # Track errors
    if state in ['FAILURE', 'RETRY']:
        worker_health_monitor.error_count += 1
    
    # Log task completion with resource info
    resources = worker_health_monitor.get_system_resources()
    logger.info(
        "Task completed",
        task_id=task_id,
        task_name=task.name if task else "unknown",
        state=state,
        memory_mb=resources.get('memory_mb', 0),
        cpu_percent=resources.get('cpu_percent', 0)
    )


# Queue management functions
def get_queue_lengths() -> Dict[str, int]:
    """Get lengths of all queues"""
    try:
        inspect = celery_app.control.inspect()
        active = inspect.active()
        scheduled = inspect.scheduled()
        reserved = inspect.reserved()
        
        # Calculate queue lengths (simplified)
        queue_lengths = {}
        
        if active:
            for worker, tasks in active.items():
                for task in tasks:
                    queue = task.get('delivery_info', {}).get('routing_key', 'default')
                    queue_lengths[queue] = queue_lengths.get(queue, 0) + 1
        
        return queue_lengths
        
    except Exception as e:
        logger.error(f"Failed to get queue lengths: {e}")
        return {}


def get_worker_statistics() -> Dict[str, Any]:
    """Get comprehensive worker statistics"""
    try:
        inspect = celery_app.control.inspect()
        stats = inspect.stats()
        active = inspect.active()
        
        worker_stats = {}
        
        if stats:
            for worker_name, worker_data in stats.items():
                worker_stats[worker_name] = {
                    'pool': worker_data.get('pool', {}),
                    'total_tasks': worker_data.get('total', {}),
                    'active_tasks': len(active.get(worker_name, [])) if active else 0
                }
        
        return worker_stats
        
    except Exception as e:
        logger.error(f"Failed to get worker statistics: {e}")
        return {}


# Task priority utilities
class TaskPriority:
    """Task priority constants"""
    CRITICAL = 9
    HIGH = 7
    MEDIUM = 5
    LOW = 3
    MAINTENANCE = 1


def queue_task_with_priority(
    task_name: str,
    priority: int,
    queue: str,
    args: tuple = (),
    kwargs: dict = None,
    eta: Optional[float] = None,
    countdown: Optional[int] = None
):
    """Queue task with specific priority"""
    kwargs = kwargs or {}
    
    return celery_app.send_task(
        task_name,
        args=args,
        kwargs=kwargs,
        queue=queue,
        priority=priority,
        eta=eta,
        countdown=countdown
    )


if __name__ == "__main__":
    celery_app.start()