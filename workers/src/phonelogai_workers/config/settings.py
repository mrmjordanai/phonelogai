"""
Configuration settings for PhoneLog AI workers
"""
import os
from typing import Optional, Dict, Any
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuration settings for the AI workers"""
    
    # Redis/Celery Configuration
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: Optional[str] = None
    celery_result_backend: Optional[str] = None
    
    # Database Configuration
    database_url: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    
    # ML Model Configuration
    model_cache_dir: str = "/tmp/phonelogai_models"
    max_model_cache_size_mb: int = 1000
    
    # Processing Configuration
    max_file_size_mb: int = 100
    max_rows_per_file: int = 1000000
    chunk_size: int = 1000
    max_concurrent_jobs: int = 10
    job_timeout_minutes: int = 30
    
    # Performance Targets
    target_100k_processing_time_seconds: int = 300  # 5 minutes
    target_1m_processing_time_seconds: int = 1800   # 30 minutes
    max_memory_usage_mb: int = 2048
    
    # OCR Configuration
    tesseract_cmd: Optional[str] = None  # Will use system default if None
    ocr_languages: str = "eng"
    
    # Security
    max_upload_attempts: int = 3
    virus_scan_enabled: bool = False
    
    # Logging
    log_level: str = "INFO"
    sentry_dsn: Optional[str] = None
    
    # Environment
    environment: str = "development"
    debug: bool = False
    
    class Config:
        env_file = ".env"
        env_prefix = "PHONELOGAI_"
        
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Set default celery URLs if not provided
        if not self.celery_broker_url:
            self.celery_broker_url = self.redis_url
        if not self.celery_result_backend:
            self.celery_result_backend = self.redis_url
            
        # Create model cache directory
        os.makedirs(self.model_cache_dir, exist_ok=True)
    
    @property
    def celery_config(self) -> Dict[str, Any]:
        """Get Celery configuration dictionary"""
        return {
            "broker_url": self.celery_broker_url,
            "result_backend": self.celery_result_backend,
            "task_serializer": "json",
            "accept_content": ["json"],
            "result_serializer": "json",
            "timezone": "UTC",
            "enable_utc": True,
            "task_track_started": True,
            "task_time_limit": self.job_timeout_minutes * 60,
            "task_soft_time_limit": (self.job_timeout_minutes - 2) * 60,
            "worker_prefetch_multiplier": 1,
            "task_acks_late": True,
            "worker_disable_rate_limits": False,
            "task_compression": "gzip",
            "result_compression": "gzip",
            "task_routes": {
                "phonelogai_workers.tasks.classify_layout": {"queue": "ml_tasks"},
                "phonelogai_workers.tasks.parse_pdf": {"queue": "parsing_tasks"},
                "phonelogai_workers.tasks.parse_csv": {"queue": "parsing_tasks"},
                "phonelogai_workers.tasks.parse_cdr": {"queue": "parsing_tasks"},
                "phonelogai_workers.tasks.validate_data": {"queue": "validation_tasks"},
                "phonelogai_workers.tasks.write_to_database": {"queue": "database_tasks"},
            }
        }
    
    @property 
    def processing_config(self) -> Dict[str, Any]:
        """Get processing configuration dictionary"""
        return {
            "max_file_size_mb": self.max_file_size_mb,
            "max_rows_per_file": self.max_rows_per_file,
            "chunk_size": self.chunk_size,
            "max_concurrent_jobs": self.max_concurrent_jobs,
            "job_timeout_minutes": self.job_timeout_minutes,
            "target_performance": {
                "100k_rows_seconds": self.target_100k_processing_time_seconds,
                "1m_rows_seconds": self.target_1m_processing_time_seconds,
                "max_memory_mb": self.max_memory_usage_mb,
            },
            "ocr": {
                "tesseract_cmd": self.tesseract_cmd,
                "languages": self.ocr_languages,
            },
            "security": {
                "max_upload_attempts": self.max_upload_attempts,
                "virus_scan_enabled": self.virus_scan_enabled,
            }
        }


# Global settings instance
settings = Settings()