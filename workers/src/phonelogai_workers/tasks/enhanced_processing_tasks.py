"""
Enhanced processing tasks with ML template management and performance optimization

These tasks implement the advanced ML layout classification system with:
- Template discovery and management
- High-performance parallel processing
- Memory optimization for large datasets
- Performance profiling and metrics
"""

import time
import asyncio
from typing import Dict, List, Optional, Any, Tuple
import structlog
from celery import Task
from celery.exceptions import Retry

from ..queue.celery_app import celery_app
from ..config import settings
from ..utils.database import db_manager
from ..utils.validation import data_validator
from ..utils.deduplication import deduplication_engine
from ..ml.layout_classifier import layout_classifier
from ..ml.template_manager import template_manager
from ..ml.performance_optimizer import parallel_processor, memory_optimizer, performance_profiler
from ..parsers.pdf_parser import pdf_parser
from ..parsers.csv_parser import csv_parser  
from ..parsers.cdr_parser import cdr_parser

logger = structlog.get_logger(__name__)


class EnhancedParsingTask(Task):
    """Enhanced base class for parsing tasks with performance monitoring"""
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure with enhanced logging"""
        logger.error(
            "Enhanced task failed",
            task_id=task_id,
            task_name=self.name,
            exception=str(exc),
            args=args,
            kwargs=kwargs
        )
        
        # Update job status with detailed failure info
        job_id = kwargs.get('job_id') or (args[0] if args else None)
        if job_id:
            try:
                asyncio.create_task(db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="enhanced_system_error",
                    error_message=f"Enhanced task {self.name} failed: {str(exc)}",
                    severity="critical"
                ))
                
                asyncio.create_task(db_manager.update_job_status(
                    job_id=job_id,
                    status="failed",
                    metadata={"failure_reason": str(exc), "failed_task": self.name}
                ))
            except Exception as e:
                logger.error("Failed to update job status on enhanced task failure", error=str(e))


@celery_app.task(bind=True, base=EnhancedParsingTask, name="phonelogai_workers.tasks.classify_file_layout_enhanced")
def classify_file_layout_enhanced(
    self,
    job_id: str,
    file_data: bytes,
    filename: str,
    file_size: int
) -> Dict[str, Any]:
    """
    Enhanced file layout classification with template management
    
    Features:
    - Template discovery and matching
    - Confidence-based fallback strategies  
    - Performance optimization for large files
    - Advanced error handling and recovery
    """
    try:
        logger.info(
            "Starting enhanced layout classification",
            job_id=job_id,
            filename=filename,
            file_size=file_size
        )
        
        # Profile the classification step
        def run_classification():
            return _run_enhanced_classification(file_data, filename, file_size, job_id)
        
        classification, profile_data = performance_profiler.profile_processing_step(
            "enhanced_layout_classification",
            run_classification
        )
        
        logger.info(
            "Enhanced layout classification completed",
            job_id=job_id,
            detected_format=classification["detected_format"],
            carrier=classification["carrier"],
            confidence=classification["confidence"],
            template_id=classification.get("template_id"),
            requires_manual_mapping=classification["requires_manual_mapping"],
            processing_time=profile_data["duration_seconds"]
        )
        
        return {
            "success": True,
            "classification": classification,
            "performance_metrics": profile_data
        }
        
    except Exception as e:
        logger.error("Enhanced layout classification failed", job_id=job_id, error=str(e))
        return {
            "success": False,
            "error": str(e),
            "classification": {
                "detected_format": "csv",  # Safe fallback
                "carrier": "unknown",
                "confidence": 0.1,
                "field_mappings": [],
                "requires_manual_mapping": True,
                "template_id": None,
                "template_confidence": 0.0
            }
        }


def _run_enhanced_classification(
    file_data: bytes,
    filename: str,
    file_size: int,
    job_id: str
) -> Dict[str, Any]:
    """Run enhanced classification with template management"""
    
    # Convert bytes to text for analysis (adaptive sample size based on file size)
    if file_size < 100000:  # <100KB - use all content
        sample_size = len(file_data)
    elif file_size < 1000000:  # <1MB - use first 100KB
        sample_size = 100000
    else:  # >1MB - use first 200KB for better accuracy
        sample_size = 200000
    
    try:
        # Try UTF-8 first, then fallback encodings
        encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
        file_content = None
        
        for encoding in encodings:
            try:
                file_content = file_data[:sample_size].decode(encoding, errors='ignore')
                break
            except:
                continue
        
        if not file_content:
            file_content = str(file_data[:sample_size], errors='ignore')
    
    except Exception:
        file_content = str(file_data[:sample_size], errors='ignore')
    
    # Step 1: Run ML classification
    classification = asyncio.run(layout_classifier.classify_layout(
        file_content=file_content,
        filename=filename,
        job_id=job_id
    ))
    
    detected_format = classification["detected_format"]
    carrier = classification["carrier"]
    field_candidates = classification.get("analysis_details", {}).get("detected_fields", [])
    
    # Step 2: Try to find existing template
    template = None
    if field_candidates and carrier != "unknown":
        template = template_manager.find_matching_template(
            field_candidates=field_candidates,
            carrier=carrier,
            format_type=detected_format,
            confidence_threshold=0.7
        )
    
    # Step 3: If no template found and confidence is high, discover new template
    if not template and classification["confidence"] > 0.8:
        template = asyncio.run(template_manager.discover_template(
            file_content=file_content,
            detected_carrier=carrier,
            detected_format=detected_format,
            job_id=job_id
        ))
    
    # Step 4: Use template if available
    if template:
        # Override field mappings with template mappings
        classification["field_mappings"] = [
            {
                "source_field": field.source_name,
                "target_field": field.target_field,
                "data_type": field.data_type,
                "confidence": field.confidence,
                "is_required": field.is_required
            }
            for field in template.fields
        ]
        
        # Add template information
        classification["template_id"] = template.template_id
        classification["template_confidence"] = template.confidence
        classification["template_version"] = template.version
        
        # Boost overall confidence if using a proven template
        if template.accuracy_score > 0.9:
            classification["confidence"] = min(classification["confidence"] * 1.2, 1.0)
        
        # May not need manual mapping if template is confident
        if template.confidence > 0.85 and len(template.fields) >= 4:
            classification["requires_manual_mapping"] = False
    
    # Step 5: Generate manual mapping suggestions if needed
    if classification["requires_manual_mapping"] and field_candidates:
        suggestions = template_manager.get_manual_mapping_suggestions(
            field_candidates=field_candidates,
            carrier=carrier
        )
        classification["manual_mapping_suggestions"] = suggestions
    
    return classification


@celery_app.task(bind=True, base=EnhancedParsingTask, name="phonelogai_workers.tasks.parse_csv_file_optimized")
def parse_csv_file_optimized(
    self,
    job_id: str,
    csv_data: bytes,
    field_mappings: List[Dict[str, Any]],
    template_id: Optional[str] = None,
    file_size: Optional[int] = None
) -> Dict[str, Any]:
    """Parse CSV file with performance optimization and memory management"""
    try:
        logger.info(
            "Starting optimized CSV parsing",
            job_id=job_id,
            size_bytes=len(csv_data),
            template_id=template_id,
            file_size=file_size
        )
        
        # Use memory optimization context
        with memory_optimizer.memory_limit_context():
            # Profile the parsing step
            def run_parsing():
                return _parse_csv_optimized(csv_data, field_mappings, job_id, file_size)
            
            result, profile_data = performance_profiler.profile_processing_step(
                "optimized_csv_parsing",
                run_parsing
            )
        
        logger.info(
            "Optimized CSV parsing completed",
            job_id=job_id,
            events=len(result["events"]),
            contacts=len(result["contacts"]),
            errors=len(result["errors"]),
            processing_time=profile_data["duration_seconds"],
            memory_used=profile_data["memory_delta_mb"]
        )
        
        return {
            "success": True, 
            "data": result,
            "performance_metrics": profile_data
        }
        
    except Exception as e:
        logger.error("Optimized CSV parsing failed", job_id=job_id, error=str(e))
        return {"success": False, "error": str(e)}


def _parse_csv_optimized(
    csv_data: bytes,
    field_mappings: List[Dict[str, Any]],
    job_id: str,
    file_size: Optional[int] = None
) -> Dict[str, Any]:
    """Optimized CSV parsing with adaptive strategies"""
    
    import pandas as pd
    import io
    
    # Estimate number of rows for optimization
    estimated_rows = _estimate_csv_rows(csv_data)
    logger.info(f"Estimated CSV rows: {estimated_rows}", job_id=job_id)
    
    # Choose parsing strategy based on file size
    if estimated_rows < 10000:
        # Small files: parse all at once
        return _parse_csv_single_pass(csv_data, field_mappings, job_id)
    else:
        # Large files: use chunked processing
        return _parse_csv_chunked(csv_data, field_mappings, job_id, estimated_rows)


def _parse_csv_single_pass(
    csv_data: bytes,
    field_mappings: List[Dict[str, Any]],
    job_id: str
) -> Dict[str, Any]:
    """Parse small CSV files in a single pass"""
    
    import pandas as pd
    import io
    
    # Parse CSV
    df = pd.read_csv(io.BytesIO(csv_data), encoding='utf-8', low_memory=False)
    
    # Optimize DataFrame memory usage
    df = memory_optimizer.optimize_pandas_dtypes(df)
    
    # Apply field mappings
    mapped_df = _apply_field_mappings(df, field_mappings)
    
    # Convert to events and contacts
    events, contacts = _convert_dataframe_to_events_contacts(mapped_df, job_id)
    
    return {
        "events": events,
        "contacts": contacts,
        "errors": [],
        "metadata": {
            "total_rows": len(df),
            "parsed_rows": len(events),
            "error_rows": 0,
            "processing_method": "single_pass"
        }
    }


def _parse_csv_chunked(
    csv_data: bytes,
    field_mappings: List[Dict[str, Any]],
    job_id: str,
    estimated_rows: int
) -> Dict[str, Any]:
    """Parse large CSV files using chunked processing"""
    
    import pandas as pd
    import io
    
    # Calculate optimal chunk size
    chunk_size = min(10000, max(1000, estimated_rows // 100))
    
    all_events = []
    all_contacts = []
    all_errors = []
    total_rows = 0
    parsed_rows = 0
    
    # Process file in chunks
    chunk_reader = pd.read_csv(
        io.BytesIO(csv_data),
        encoding='utf-8',
        chunksize=chunk_size,
        low_memory=False
    )
    
    for chunk_idx, chunk in enumerate(chunk_reader):
        logger.debug(f"Processing chunk {chunk_idx}", job_id=job_id, rows=len(chunk))
        
        with memory_optimizer.memory_limit_context():
            # Optimize chunk memory
            chunk = memory_optimizer.optimize_pandas_dtypes(chunk)
            
            # Apply field mappings
            mapped_chunk = _apply_field_mappings(chunk, field_mappings)
            
            # Convert chunk to events and contacts
            chunk_events, chunk_contacts = _convert_dataframe_to_events_contacts(mapped_chunk, job_id)
            
            all_events.extend(chunk_events)
            all_contacts.extend(chunk_contacts)
            total_rows += len(chunk)
            parsed_rows += len(chunk_events)
        
        # Update progress
        progress = min(95, (chunk_idx + 1) * chunk_size / estimated_rows * 100)
        asyncio.create_task(db_manager.update_job_status(
            job_id=job_id,
            status="processing",
            progress=progress,
            processed_rows=parsed_rows,
            total_rows=total_rows
        ))
    
    return {
        "events": all_events,
        "contacts": all_contacts,
        "errors": all_errors,
        "metadata": {
            "total_rows": total_rows,
            "parsed_rows": parsed_rows,
            "error_rows": len(all_errors),
            "processing_method": "chunked",
            "chunk_size": chunk_size
        }
    }


@celery_app.task(bind=True, base=EnhancedParsingTask, name="phonelogai_workers.tasks.parse_pdf_file_optimized")
def parse_pdf_file_optimized(
    self,
    job_id: str,
    pdf_data: bytes,
    field_mappings: List[Dict[str, Any]],
    template_id: Optional[str] = None,
    file_size: Optional[int] = None
) -> Dict[str, Any]:
    """Parse PDF file with optimization for large documents"""
    try:
        logger.info(
            "Starting optimized PDF parsing",
            job_id=job_id,
            size_bytes=len(pdf_data),
            template_id=template_id,
            file_size=file_size
        )
        
        with memory_optimizer.memory_limit_context():
            def run_parsing():
                return asyncio.run(pdf_parser.parse_pdf(pdf_data, field_mappings, job_id))
            
            result, profile_data = performance_profiler.profile_processing_step(
                "optimized_pdf_parsing",
                run_parsing
            )
        
        logger.info(
            "Optimized PDF parsing completed",
            job_id=job_id,
            events=len(result["events"]),
            contacts=len(result["contacts"]),
            errors=len(result["errors"]),
            processing_time=profile_data["duration_seconds"]
        )
        
        return {
            "success": True,
            "data": result,
            "performance_metrics": profile_data
        }
        
    except Exception as e:
        logger.error("Optimized PDF parsing failed", job_id=job_id, error=str(e))
        return {"success": False, "error": str(e)}


@celery_app.task(bind=True, base=EnhancedParsingTask, name="phonelogai_workers.tasks.parse_cdr_file_optimized")
def parse_cdr_file_optimized(
    self,
    job_id: str,
    cdr_data: bytes,
    field_mappings: List[Dict[str, Any]],
    carrier: str = "unknown",
    template_id: Optional[str] = None,
    file_size: Optional[int] = None
) -> Dict[str, Any]:
    """Parse CDR text file with performance optimization"""
    try:
        logger.info(
            "Starting optimized CDR parsing",
            job_id=job_id,
            size_bytes=len(cdr_data),
            carrier=carrier,
            template_id=template_id,
            file_size=file_size
        )
        
        with memory_optimizer.memory_limit_context():
            def run_parsing():
                return asyncio.run(cdr_parser.parse_cdr(cdr_data, field_mappings, carrier, job_id))
            
            result, profile_data = performance_profiler.profile_processing_step(
                "optimized_cdr_parsing",
                run_parsing
            )
        
        logger.info(
            "Optimized CDR parsing completed",
            job_id=job_id,
            events=len(result["events"]),
            contacts=len(result["contacts"]),
            errors=len(result["errors"]),
            processing_time=profile_data["duration_seconds"]
        )
        
        return {
            "success": True,
            "data": result,
            "performance_metrics": profile_data
        }
        
    except Exception as e:
        logger.error("Optimized CDR parsing failed", job_id=job_id, error=str(e))
        return {"success": False, "error": str(e)}


# Helper functions

def _estimate_csv_rows(csv_data: bytes) -> int:
    """Estimate number of rows in CSV data"""
    try:
        # Sample first 10KB to estimate average line length
        sample_size = min(10000, len(csv_data))
        sample = csv_data[:sample_size].decode('utf-8', errors='ignore')
        
        lines_in_sample = sample.count('\n')
        if lines_in_sample == 0:
            return 1
        
        avg_line_length = sample_size / lines_in_sample
        estimated_rows = len(csv_data) / avg_line_length
        
        return max(1, int(estimated_rows))
        
    except:
        # Fallback estimate
        return max(1, len(csv_data) // 100)  # Assume ~100 bytes per row


def _apply_field_mappings(df: 'pd.DataFrame', field_mappings: List[Dict[str, Any]]) -> 'pd.DataFrame':
    """Apply field mappings to DataFrame"""
    import pandas as pd
    
    mapped_df = df.copy()
    
    # Create mapping dictionary
    mapping_dict = {}
    for mapping in field_mappings:
        source_field = mapping.get("source_field")
        target_field = mapping.get("target_field")
        
        if source_field in df.columns and target_field:
            mapping_dict[source_field] = target_field
    
    # Rename columns
    if mapping_dict:
        mapped_df = mapped_df.rename(columns=mapping_dict)
    
    return mapped_df


def _convert_dataframe_to_events_contacts(df: 'pd.DataFrame', job_id: str) -> Tuple[List[Dict], List[Dict]]:
    """Convert DataFrame to events and contacts lists"""
    import uuid
    from datetime import datetime, timezone
    
    events = []
    contacts = set()  # Use set to avoid duplicate contacts
    
    for _, row in df.iterrows():
        try:
            # Create event record
            event = {
                "id": str(uuid.uuid4()),
                "ts": row.get("ts", row.get("date", row.get("timestamp"))),
                "number": str(row.get("number", row.get("phone", row.get("phone_number", "")))),
                "type": str(row.get("type", row.get("call_type", "unknown"))).lower(),
                "direction": str(row.get("direction", "unknown")).lower(),
                "duration": _safe_int(row.get("duration", 0)),
                "content": str(row.get("content", row.get("message", ""))),
                "metadata": {
                    "source": "file_upload",
                    "job_id": job_id,
                    "original_row": dict(row)
                },
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Validate required fields
            if event["number"] and event["ts"]:
                events.append(event)
                
                # Add contact
                contacts.add(event["number"])
        
        except Exception as e:
            logger.warning(f"Failed to convert row to event: {str(e)}", job_id=job_id)
            continue
    
    # Convert contacts set to list of contact dictionaries
    contact_list = []
    for number in contacts:
        contact_list.append({
            "id": str(uuid.uuid4()),
            "number": number,
            "display_name": None,
            "first_seen": datetime.now(timezone.utc).isoformat(),
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "total_calls": 0,  # Will be calculated later
            "total_sms": 0,    # Will be calculated later
            "metadata": {
                "source": "file_upload",
                "job_id": job_id
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
    
    return events, contact_list


def _safe_int(value, default=0):
    """Safely convert value to integer"""
    try:
        if value is None or value == '':
            return default
        return int(float(value))
    except (ValueError, TypeError):
        return default


def _check_performance_targets(rows_processed: int, processing_time_ms: int, file_size: int) -> bool:
    """Check if processing met performance targets"""
    
    # Check 100k rows in <5min target
    if rows_processed >= 100000:
        target_time_ms = 5 * 60 * 1000  # 5 minutes in ms
        if processing_time_ms <= target_time_ms:
            return True
    
    # Check 1M rows in <30min target  
    elif rows_processed >= 1000000:
        target_time_ms = 30 * 60 * 1000  # 30 minutes in ms
        if processing_time_ms <= target_time_ms:
            return True
    
    # For smaller datasets, check proportional performance
    else:
        rows_per_second = rows_processed / max(processing_time_ms / 1000, 0.1)
        target_rows_per_second = 100000 / (5 * 60)  # From 100k in 5min target
        
        if rows_per_second >= target_rows_per_second * 0.8:  # 80% of target is acceptable
            return True
    
    return False