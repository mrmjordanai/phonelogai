"""
Celery tasks for file processing pipeline

This module contains all the Celery tasks for the AI-powered file parsing system:
- File upload processing and validation
- ML layout classification
- Multi-format parsing (PDF, CSV, CDR)
- Data validation and normalization
- Deduplication and database insertion
- Error handling and recovery
"""
import time
import uuid
from typing import Dict, List, Optional, Any
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


class BaseParsingTask(Task):
    """Base class for parsing tasks with common error handling"""
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        logger.error(
            "Task failed",
            task_id=task_id,
            task_name=self.name,
            exception=str(exc),
            args=args,
            kwargs=kwargs
        )
        
        # Update job status if job_id provided
        job_id = kwargs.get('job_id') or (args[0] if args else None)
        if job_id:
            try:
                db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="system_error",
                    error_message=f"Task {self.name} failed: {str(exc)}",
                    severity="critical"
                )
                
                db_manager.update_job_status(
                    job_id=job_id,
                    status="failed",
                    metadata={"failure_reason": str(exc), "failed_task": self.name}
                )
            except Exception as e:
                logger.error("Failed to update job status on task failure", error=str(e))
    
    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success"""
        logger.info(
            "Task completed successfully",
            task_id=task_id,
            task_name=self.name
        )


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.process_file_upload")
def process_file_upload(
    self,
    job_id: str,
    file_data: bytes,
    filename: str,
    user_id: str,
    file_size: int,
    processing_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Main orchestration task for file processing pipeline
    
    This task coordinates the entire file processing workflow:
    1. File validation and security checks
    2. Layout classification using ML
    3. Format-specific parsing
    4. Data validation and normalization
    5. Deduplication
    6. Database insertion
    7. Contact extraction and updates
    """
    try:
        start_time = time.time()
        
        logger.info(
            "Starting file processing pipeline",
            job_id=job_id,
            filename=filename,
            file_size=file_size,
            user_id=user_id
        )
        
        # Update job status to processing
        await db_manager.update_job_status(job_id, "processing", 5)
        
        # Step 1: File validation and security checks
        validation_result = await _validate_file(file_data, filename, file_size)
        if not validation_result["valid"]:
            await db_manager.add_ingestion_error(
                job_id=job_id,
                error_type="file_format_error",
                error_message=validation_result["error"],
                severity="critical"
            )
            await db_manager.update_job_status(job_id, "failed")
            return {"status": "failed", "error": validation_result["error"]}
        
        # Step 2: ML layout classification
        logger.info("Starting layout classification", job_id=job_id)
        classification_result = classify_file_layout.delay(
            job_id=job_id,
            file_data=file_data,
            filename=filename
        ).get()
        
        if not classification_result["success"]:
            await db_manager.update_job_status(job_id, "failed")
            return {"status": "failed", "error": "Layout classification failed"}
        
        classification = classification_result["classification"]
        detected_format = classification["detected_format"]
        carrier = classification["carrier"]
        field_mappings = classification["field_mappings"]
        requires_manual_mapping = classification["requires_manual_mapping"]
        
        await db_manager.update_job_status(job_id, "processing", 25)
        
        # Step 3: Format-specific parsing
        logger.info("Starting format-specific parsing", 
                   job_id=job_id, 
                   format=detected_format,
                   carrier=carrier)
        
        if detected_format == "pdf":
            parsing_task = parse_pdf_file.delay(
                job_id=job_id,
                pdf_data=file_data,
                field_mappings=field_mappings
            )
        elif detected_format == "csv":
            parsing_task = parse_csv_file.delay(
                job_id=job_id,
                csv_data=file_data,
                field_mappings=field_mappings
            )
        elif detected_format == "txt":
            parsing_task = parse_cdr_file.delay(
                job_id=job_id,
                cdr_data=file_data,
                field_mappings=field_mappings,
                carrier=carrier
            )
        else:
            error_msg = f"Unsupported file format: {detected_format}"
            await db_manager.add_ingestion_error(
                job_id=job_id,
                error_type="file_format_error",
                error_message=error_msg,
                severity="critical"
            )
            await db_manager.update_job_status(job_id, "failed")
            return {"status": "failed", "error": error_msg}
        
        parsing_result = parsing_task.get()
        
        if not parsing_result["success"]:
            await db_manager.update_job_status(job_id, "failed")
            return {"status": "failed", "error": "File parsing failed"}
        
        parsed_data = parsing_result["data"]
        events = parsed_data["events"]
        contacts = parsed_data["contacts"]
        
        await db_manager.update_job_status(
            job_id, "processing", 60, len(events), parsed_data["metadata"]["total_rows"]
        )
        
        # Step 4: Data validation and normalization
        logger.info("Starting data validation", job_id=job_id, events_count=len(events))
        
        validation_task = validate_parsed_data.delay(
            job_id=job_id,
            events=events,
            contacts=contacts,
            user_id=user_id
        )
        validation_result = validation_task.get()
        
        if not validation_result["success"]:
            await db_manager.update_job_status(job_id, "partial")
            # Continue with available data
        
        validated_events = validation_result["events"]
        validated_contacts = validation_result["contacts"]
        
        await db_manager.update_job_status(job_id, "processing", 75)
        
        # Step 5: Deduplication
        logger.info("Starting deduplication", job_id=job_id)
        
        deduplication_task = deduplicate_data.delay(
            job_id=job_id,
            events=validated_events,
            contacts=validated_contacts,
            user_id=user_id
        )
        dedup_result = deduplication_task.get()
        
        final_events = dedup_result["events"]
        final_contacts = dedup_result["contacts"]
        duplicates_removed = dedup_result["duplicates_removed"]
        
        await db_manager.update_job_status(job_id, "processing", 85)
        
        # Step 6: Database insertion
        logger.info("Starting database insertion", 
                   job_id=job_id, 
                   final_events=len(final_events),
                   final_contacts=len(final_contacts))
        
        db_task = write_to_database.delay(
            job_id=job_id,
            events=final_events,
            contacts=final_contacts,
            user_id=user_id
        )
        db_result = db_task.get()
        
        if not db_result["success"]:
            await db_manager.update_job_status(job_id, "failed")
            return {"status": "failed", "error": "Database insertion failed"}
        
        # Step 7: Record processing metrics
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        await db_manager.save_processing_metrics(
            job_id=job_id,
            file_size_mb=file_size / (1024 * 1024),
            processing_time_ms=processing_time_ms,
            processed_rows=len(final_events),
            duplicates_removed=duplicates_removed,
            quality_score=_calculate_quality_score(parsed_data, validation_result, dedup_result)
        )
        
        # Final status update
        await db_manager.update_job_status(
            job_id, 
            "completed", 
            100, 
            len(final_events),
            parsed_data["metadata"]["total_rows"]
        )
        
        logger.info(
            "File processing pipeline completed successfully",
            job_id=job_id,
            processing_time_ms=processing_time_ms,
            events_processed=len(final_events),
            contacts_created=len(final_contacts),
            duplicates_removed=duplicates_removed
        )
        
        return {
            "status": "completed",
            "events_processed": len(final_events),
            "contacts_created": len(final_contacts),
            "duplicates_removed": duplicates_removed,
            "processing_time_ms": processing_time_ms,
            "requires_manual_mapping": requires_manual_mapping
        }
        
    except Exception as e:
        logger.error("File processing pipeline failed", job_id=job_id, error=str(e))
        
        try:
            await db_manager.add_ingestion_error(
                job_id=job_id,
                error_type="system_error",
                error_message=f"Pipeline failed: {str(e)}",
                severity="critical"
            )
            await db_manager.update_job_status(job_id, "failed")
        except:
            pass  # Don't fail on status update failure
            
        return {"status": "failed", "error": str(e)}


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.classify_file_layout")
def classify_file_layout(
    self,
    job_id: str,
    file_data: bytes,
    filename: str
) -> Dict[str, Any]:
    """
    Classify file layout using ML models
    
    Uses trained models to detect:
    - File format (PDF, CSV, CDR text)
    - Carrier type (AT&T, Verizon, T-Mobile, Sprint, unknown)
    - Field mappings and confidence scores
    """
    try:
        logger.info("Starting layout classification", job_id=job_id, filename=filename)
        
        # Convert bytes to text for analysis (sample first 50KB)
        sample_size = min(len(file_data), 50000)
        
        try:
            # Try UTF-8 first
            file_content = file_data[:sample_size].decode('utf-8', errors='ignore')
        except:
            # Fallback to latin-1
            file_content = file_data[:sample_size].decode('latin-1', errors='ignore')
        
        # Run ML classification
        classification = await layout_classifier.classify_layout(
            file_content=file_content,
            filename=filename,
            job_id=job_id
        )
        
        logger.info(
            "Layout classification completed",
            job_id=job_id,
            detected_format=classification["detected_format"],
            carrier=classification["carrier"],
            confidence=classification["confidence"],
            requires_manual_mapping=classification["requires_manual_mapping"]
        )
        
        return {
            "success": True,
            "classification": classification
        }
        
    except Exception as e:
        logger.error("Layout classification failed", job_id=job_id, error=str(e))
        return {
            "success": False,
            "error": str(e),
            "classification": {
                "detected_format": "csv",  # Safe fallback
                "carrier": "unknown",
                "confidence": 0.1,
                "field_mappings": [],
                "requires_manual_mapping": True
            }
        }


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.parse_pdf_file")
def parse_pdf_file(
    self,
    job_id: str,
    pdf_data: bytes,
    field_mappings: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Parse PDF file and extract structured data"""
    try:
        logger.info("Starting PDF parsing", job_id=job_id, size_bytes=len(pdf_data))
        
        result = await pdf_parser.parse_pdf(pdf_data, field_mappings, job_id)
        
        logger.info(
            "PDF parsing completed",
            job_id=job_id,
            events=len(result["events"]),
            contacts=len(result["contacts"]),
            errors=len(result["errors"])
        )
        
        return {"success": True, "data": result}
        
    except Exception as e:
        logger.error("PDF parsing failed", job_id=job_id, error=str(e))
        return {"success": False, "error": str(e)}


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.parse_csv_file")
def parse_csv_file(
    self,
    job_id: str,
    csv_data: bytes,
    field_mappings: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Parse CSV file and extract structured data"""
    try:
        logger.info("Starting CSV parsing", job_id=job_id, size_bytes=len(csv_data))
        
        result = await csv_parser.parse_csv(csv_data, field_mappings, job_id)
        
        logger.info(
            "CSV parsing completed",
            job_id=job_id,
            events=len(result["events"]),
            contacts=len(result["contacts"]),
            errors=len(result["errors"])
        )
        
        return {"success": True, "data": result}
        
    except Exception as e:
        logger.error("CSV parsing failed", job_id=job_id, error=str(e))
        return {"success": False, "error": str(e)}


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.parse_cdr_file")
def parse_cdr_file(
    self,
    job_id: str,
    cdr_data: bytes,
    field_mappings: List[Dict[str, Any]],
    carrier: str = "unknown"
) -> Dict[str, Any]:
    """Parse CDR text file and extract structured data"""
    try:
        logger.info("Starting CDR parsing", job_id=job_id, size_bytes=len(cdr_data), carrier=carrier)
        
        result = await cdr_parser.parse_cdr(cdr_data, field_mappings, carrier, job_id)
        
        logger.info(
            "CDR parsing completed",
            job_id=job_id,
            events=len(result["events"]),
            contacts=len(result["contacts"]),
            errors=len(result["errors"])
        )
        
        return {"success": True, "data": result}
        
    except Exception as e:
        logger.error("CDR parsing failed", job_id=job_id, error=str(e))
        return {"success": False, "error": str(e)}


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.validate_parsed_data")
def validate_parsed_data(
    self,
    job_id: str,
    events: List[Dict[str, Any]],
    contacts: List[Dict[str, Any]],
    user_id: str
) -> Dict[str, Any]:
    """Validate and normalize parsed data using advanced validation engine"""
    try:
        logger.info("Starting data validation", job_id=job_id, events=len(events), contacts=len(contacts))
        
        validated_events = []
        validated_contacts = []
        validation_errors = []
        critical_errors = 0
        
        # Validate and normalize events using data validator
        for i, event in enumerate(events):
            try:
                # Add user_id to event
                event["user_id"] = user_id
                
                # Use advanced validation
                is_valid, errors, normalized_event = data_validator.validate_event(event)
                
                if is_valid:
                    validated_events.append(normalized_event)
                else:
                    # Log validation errors to database
                    for error_msg in errors:
                        await db_manager.add_ingestion_error(
                            job_id=job_id,
                            error_type="validation_error",
                            error_message=error_msg,
                            row_number=i,
                            raw_data=event,
                            severity="error"
                        )
                        
                        validation_errors.append({
                            "row": i,
                            "error": error_msg,
                            "event": event
                        })
                        
                        if "required" in error_msg.lower() or "invalid" in error_msg.lower():
                            critical_errors += 1
                    
            except Exception as e:
                error_msg = f"Event validation failed: {str(e)}"
                validation_errors.append({
                    "row": i,
                    "error": error_msg,
                    "event": event
                })
                
                await db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="system_error",
                    error_message=error_msg,
                    row_number=i,
                    raw_data=event,
                    severity="critical"
                )
                critical_errors += 1
        
        # Validate and normalize contacts using data validator
        for i, contact in enumerate(contacts):
            try:
                # Add user_id to contact
                contact["user_id"] = user_id
                
                # Use advanced validation
                is_valid, errors, normalized_contact = data_validator.validate_contact(contact)
                
                if is_valid:
                    validated_contacts.append(normalized_contact)
                else:
                    # Log validation errors to database
                    for error_msg in errors:
                        await db_manager.add_ingestion_error(
                            job_id=job_id,
                            error_type="validation_error",
                            error_message=error_msg,
                            row_number=i + len(events),
                            raw_data=contact,
                            severity="warning"
                        )
                        
                        validation_errors.append({
                            "row": i + len(events),
                            "error": error_msg,
                            "contact": contact
                        })
                    
            except Exception as e:
                error_msg = f"Contact validation failed: {str(e)}"
                validation_errors.append({
                    "row": i + len(events),
                    "error": error_msg,
                    "contact": contact
                })
                
                await db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="system_error",
                    error_message=error_msg,
                    row_number=i + len(events),
                    raw_data=contact,
                    severity="error"
                )
        
        # Calculate quality score
        total_records = len(events) + len(contacts)
        valid_records = len(validated_events) + len(validated_contacts)
        quality_score = data_validator.calculate_quality_score(
            total_records, valid_records, len(validation_errors), critical_errors
        )
        
        logger.info(
            "Data validation completed",
            job_id=job_id,
            validated_events=len(validated_events),
            validated_contacts=len(validated_contacts),
            validation_errors=len(validation_errors),
            critical_errors=critical_errors,
            quality_score=quality_score
        )
        
        return {
            "success": True,
            "events": validated_events,
            "contacts": validated_contacts,
            "validation_errors": validation_errors,
            "quality_score": quality_score,
            "critical_errors": critical_errors
        }
        
    except Exception as e:
        logger.error("Data validation failed", job_id=job_id, error=str(e))
        return {
            "success": False,
            "error": str(e),
            "events": events,  # Return original data
            "contacts": contacts,
            "quality_score": 0.0
        }


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.deduplicate_data")
def deduplicate_data(
    self,
    job_id: str,
    events: List[Dict[str, Any]],
    contacts: List[Dict[str, Any]],
    user_id: str
) -> Dict[str, Any]:
    """Deduplicate events and contacts using advanced deduplication engine"""
    try:
        logger.info("Starting deduplication", job_id=job_id, events=len(events), contacts=len(contacts))
        
        # Deduplicate events using advanced engine
        event_result = deduplication_engine.deduplicate_events(
            events=events,
            user_id=user_id,
            strategy='fuzzy_time',  # Use fuzzy time matching for better results
            time_tolerance_seconds=300  # 5 minute tolerance
        )
        
        deduplicated_events = event_result['deduplicated_events']
        event_duplicates = event_result['duplicate_count']
        conflicts_resolved = event_result['conflicts_resolved']
        
        # Deduplicate contacts using advanced engine
        contact_result = deduplication_engine.deduplicate_contacts(
            contacts=contacts,
            user_id=user_id
        )
        
        deduplicated_contacts = contact_result['deduplicated_contacts']
        contact_merges = contact_result['merged_count']
        
        # Total duplicates removed
        total_duplicates_removed = event_duplicates + contact_merges
        
        # Calculate combined quality score
        combined_quality_score = (
            event_result.get('quality_score', 0.5) * 0.7 +  # Events weighted more
            contact_result.get('quality_score', 0.5) * 0.3   # Contacts weighted less
        )
        
        # Log performance metrics
        total_processing_time = (
            event_result.get('processing_time_ms', 0) + 
            contact_result.get('processing_time_ms', 0)
        )
        
        logger.info(
            "Advanced deduplication completed",
            job_id=job_id,
            deduplicated_events=len(deduplicated_events),
            deduplicated_contacts=len(deduplicated_contacts),
            event_duplicates_removed=event_duplicates,
            contact_merges=contact_merges,
            conflicts_resolved=conflicts_resolved,
            total_processing_time_ms=total_processing_time,
            quality_score=combined_quality_score
        )
        
        return {
            "success": True,
            "events": deduplicated_events,
            "contacts": deduplicated_contacts,
            "duplicates_removed": total_duplicates_removed,
            "event_duplicates": event_duplicates,
            "contact_merges": contact_merges,
            "conflicts_resolved": conflicts_resolved,
            "quality_score": combined_quality_score,
            "processing_time_ms": total_processing_time
        }
        
    except Exception as e:
        logger.error("Advanced deduplication failed", job_id=job_id, error=str(e))
        
        # Log error to database
        await db_manager.add_ingestion_error(
            job_id=job_id,
            error_type="system_error",
            error_message=f"Deduplication failed: {str(e)}",
            severity="error"
        )
        
        return {
            "success": False,
            "error": str(e),
            "events": events,  # Return original data
            "contacts": contacts,
            "duplicates_removed": 0,
            "quality_score": 0.0
        }


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.write_to_database")
def write_to_database(
    self,
    job_id: str,
    events: List[Dict[str, Any]],
    contacts: List[Dict[str, Any]],
    user_id: str
) -> Dict[str, Any]:
    """Write validated and deduplicated data to database"""
    try:
        logger.info("Starting database insertion", job_id=job_id, events=len(events), contacts=len(contacts))
        
        # Insert events in batches
        events_inserted = 0
        if events:
            success = await db_manager.bulk_insert_events(events)
            if success:
                events_inserted = len(events)
            else:
                raise Exception("Failed to insert events")
        
        # Insert/update contacts in batches
        contacts_inserted = 0
        if contacts:
            success = await db_manager.bulk_insert_contacts(contacts)
            if success:
                contacts_inserted = len(contacts)
            else:
                raise Exception("Failed to insert contacts")
        
        logger.info(
            "Database insertion completed",
            job_id=job_id,
            events_inserted=events_inserted,
            contacts_inserted=contacts_inserted
        )
        
        return {
            "success": True,
            "events_inserted": events_inserted,
            "contacts_inserted": contacts_inserted
        }
        
    except Exception as e:
        logger.error("Database insertion failed", job_id=job_id, error=str(e))
        
        await db_manager.add_ingestion_error(
            job_id=job_id,
            error_type="database_error",
            error_message=f"Database insertion failed: {str(e)}",
            severity="critical"
        )
        
        return {"success": False, "error": str(e)}


@celery_app.task(bind=True, base=BaseParsingTask, name="phonelogai_workers.tasks.cleanup_failed_job")
def cleanup_failed_job(self, job_id: str) -> Dict[str, Any]:
    """Clean up resources for failed job"""
    try:
        logger.info("Cleaning up failed job", job_id=job_id)
        
        # This could include:
        # - Removing temporary files
        # - Cleaning up partial database insertions
        # - Sending notifications
        # - Updating job status
        
        return {"success": True}
        
    except Exception as e:
        logger.error("Job cleanup failed", job_id=job_id, error=str(e))
        return {"success": False, "error": str(e)}


# Helper functions

async def _validate_file(file_data: bytes, filename: str, file_size: int) -> Dict[str, Any]:
    """Validate file before processing"""
    try:
        # Check file size
        if file_size > settings.max_file_size_mb * 1024 * 1024:
            return {
                "valid": False,
                "error": f"File size {file_size} bytes exceeds maximum {settings.max_file_size_mb}MB"
            }
        
        # Check if file is empty
        if file_size == 0:
            return {"valid": False, "error": "File is empty"}
        
        # Basic file type validation
        allowed_extensions = ['.pdf', '.csv', '.txt', '.xls', '.xlsx']
        if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
            return {
                "valid": False,
                "error": f"File type not supported. Allowed: {', '.join(allowed_extensions)}"
            }
        
        # Check for minimum content
        if len(file_data) < 100:  # Minimum 100 bytes
            return {"valid": False, "error": "File appears to be too small to contain valid data"}
        
        return {"valid": True}
        
    except Exception as e:
        return {"valid": False, "error": f"File validation failed: {str(e)}"}


def _normalize_phone_number(phone: str) -> str:
    """Normalize phone number to E.164 format"""
    import re
    
    # Remove all non-numeric characters except +
    cleaned = re.sub(r'[^\d+]', '', str(phone))
    
    # Handle US numbers
    if cleaned.startswith('+1'):
        return cleaned  # Already in correct format
    elif cleaned.startswith('1') and len(cleaned) == 11:
        return '+' + cleaned
    elif len(cleaned) == 10:
        return '+1' + cleaned
    else:
        return phone  # Return original if can't normalize


def _validate_timestamp(ts: str) -> str:
    """Validate and normalize timestamp"""
    from datetime import datetime
    
    try:
        # Try parsing as ISO format first
        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        return dt.isoformat()
    except:
        # Try common formats
        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%m/%d/%Y %H:%M:%S",
            "%Y-%m-%d",
            "%m/%d/%Y"
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(ts, fmt)
                return dt.isoformat()
            except ValueError:
                continue
        
        # If all parsing fails, return original
        return ts


def _validate_event(event: Dict[str, Any]) -> bool:
    """Validate that event has required fields"""
    required_fields = ["user_id", "number", "ts", "type", "direction"]
    
    for field in required_fields:
        if field not in event or not event[field]:
            return False
    
    # Validate phone number format
    phone = event["number"]
    if not phone.startswith('+') or len(phone) < 10:
        return False
    
    return True


def _calculate_quality_score(
    parsed_data: Dict[str, Any],
    validation_result: Dict[str, Any],
    dedup_result: Dict[str, Any]
) -> float:
    """Calculate overall data quality score (0-1)"""
    try:
        total_rows = parsed_data["metadata"]["total_rows"]
        parsed_rows = parsed_data["metadata"]["parsed_rows"]
        error_rows = parsed_data["metadata"]["error_rows"]
        validation_errors = len(validation_result.get("validation_errors", []))
        duplicates_removed = dedup_result["duplicates_removed"]
        
        if total_rows == 0:
            return 0.0
        
        # Calculate component scores
        parse_success_rate = parsed_rows / total_rows if total_rows > 0 else 0
        validation_success_rate = (parsed_rows - validation_errors) / parsed_rows if parsed_rows > 0 else 0
        duplicate_rate = duplicates_removed / parsed_rows if parsed_rows > 0 else 0
        
        # Weight the components
        quality_score = (
            parse_success_rate * 0.4 +
            validation_success_rate * 0.4 +
            (1 - duplicate_rate) * 0.2  # Lower duplicate rate is better
        )
        
        return max(0.0, min(1.0, quality_score))
        
    except:
        return 0.5  # Default middle score if calculation fails