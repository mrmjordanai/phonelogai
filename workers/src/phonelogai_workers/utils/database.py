"""
Database utilities for PhoneLog AI workers
"""
import asyncio
import json
from typing import Dict, Any, Optional, List, Union
from datetime import datetime, timezone
import structlog
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from supabase import create_client, Client
from contextlib import contextmanager

from ..config import settings

logger = structlog.get_logger(__name__)


class DatabaseManager:
    """Manages database connections and operations for workers"""
    
    def __init__(self):
        self.supabase_client: Optional[Client] = None
        self._connection_pool = None
    
    def get_supabase_client(self) -> Client:
        """Get or create Supabase client"""
        if not self.supabase_client:
            self.supabase_client = create_client(
                settings.supabase_url,
                settings.supabase_service_role_key
            )
        return self.supabase_client
    
    @contextmanager
    def get_connection(self):
        """Get PostgreSQL connection using context manager"""
        conn = None
        try:
            conn = psycopg2.connect(
                settings.database_url,
                cursor_factory=RealDictCursor
            )
            conn.autocommit = False
            yield conn
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error("Database connection error", error=str(e))
            raise
        finally:
            if conn:
                conn.close()
    
    async def update_job_status(
        self,
        job_id: str,
        status: str,
        progress: Optional[float] = None,
        processed_rows: Optional[int] = None,
        total_rows: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update ingestion job status"""
        try:
            supabase = self.get_supabase_client()
            
            update_data = {
                "status": status,
                "progress": progress,
                "processed_rows": processed_rows,
                "total_rows": total_rows,
            }
            
            # Remove None values
            update_data = {k: v for k, v in update_data.items() if v is not None}
            
            # Add timestamps based on status
            if status == "processing" and not await self._job_has_started(job_id):
                update_data["started_at"] = datetime.now(timezone.utc).isoformat()
            elif status in ["completed", "failed", "partial"]:
                update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
            
            # Merge metadata if provided
            if metadata:
                existing_job = supabase.table("ingestion_jobs").select("metadata").eq("id", job_id).execute()
                if existing_job.data:
                    existing_metadata = existing_job.data[0].get("metadata", {})
                    existing_metadata.update(metadata)
                    update_data["metadata"] = existing_metadata
                else:
                    update_data["metadata"] = metadata
            
            result = supabase.table("ingestion_jobs").update(update_data).eq("id", job_id).execute()
            
            logger.info(
                "Job status updated",
                job_id=job_id,
                status=status,
                progress=progress,
                processed_rows=processed_rows
            )
            
            return len(result.data) > 0
            
        except Exception as e:
            logger.error("Failed to update job status", job_id=job_id, error=str(e))
            return False
    
    async def _job_has_started(self, job_id: str) -> bool:
        """Check if job has already been marked as started"""
        try:
            supabase = self.get_supabase_client()
            result = supabase.table("ingestion_jobs").select("started_at").eq("id", job_id).execute()
            return result.data and result.data[0].get("started_at") is not None
        except:
            return False
    
    async def save_layout_classification(
        self,
        job_id: str,
        detected_format: str,
        carrier: str,
        confidence: float,
        field_mappings: List[Dict[str, Any]],
        table_structure: Optional[Dict[str, Any]] = None,
        requires_manual_mapping: bool = False
    ) -> bool:
        """Save ML layout classification results"""
        try:
            supabase = self.get_supabase_client()
            
            classification_data = {
                "job_id": job_id,
                "detected_format": detected_format,
                "carrier": carrier,
                "confidence": confidence,
                "field_mappings": field_mappings,
                "table_structure": table_structure,
                "requires_manual_mapping": requires_manual_mapping,
            }
            
            result = supabase.table("layout_classifications").insert(classification_data).execute()
            
            logger.info(
                "Layout classification saved",
                job_id=job_id,
                carrier=carrier,
                confidence=confidence,
                requires_manual_mapping=requires_manual_mapping
            )
            
            return len(result.data) > 0
            
        except Exception as e:
            logger.error("Failed to save layout classification", job_id=job_id, error=str(e))
            return False
    
    async def add_ingestion_error(
        self,
        job_id: str,
        error_type: str,
        error_message: str,
        row_number: Optional[int] = None,
        raw_data: Optional[Dict[str, Any]] = None,
        severity: str = "error"
    ) -> bool:
        """Add an ingestion error record"""
        try:
            supabase = self.get_supabase_client()
            
            error_data = {
                "job_id": job_id,
                "error_type": error_type,
                "error_message": error_message,
                "row_number": row_number,
                "raw_data": raw_data,
                "severity": severity,
            }
            
            result = supabase.table("ingestion_errors").insert(error_data).execute()
            
            logger.warning(
                "Ingestion error recorded",
                job_id=job_id,
                error_type=error_type,
                severity=severity,
                row_number=row_number
            )
            
            return len(result.data) > 0
            
        except Exception as e:
            logger.error("Failed to add ingestion error", job_id=job_id, error=str(e))
            return False
    
    async def get_job_details(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get ingestion job details"""
        try:
            supabase = self.get_supabase_client()
            result = supabase.table("ingestion_jobs").select("*").eq("id", job_id).execute()
            
            if result.data:
                return result.data[0]
            return None
            
        except Exception as e:
            logger.error("Failed to get job details", job_id=job_id, error=str(e))
            return None
    
    async def get_carrier_template(self, carrier: str, format_type: str) -> Optional[Dict[str, Any]]:
        """Get carrier template for format detection"""
        try:
            supabase = self.get_supabase_client()
            result = (
                supabase.table("carrier_templates")
                .select("*")
                .eq("carrier", carrier)
                .contains("supported_formats", [format_type])
                .eq("is_active", True)
                .execute()
            )
            
            if result.data:
                return result.data[0]
            return None
            
        except Exception as e:
            logger.error("Failed to get carrier template", carrier=carrier, error=str(e))
            return None
    
    async def save_processing_metrics(
        self,
        job_id: str,
        file_size_mb: float,
        processing_time_ms: int,
        processed_rows: int,
        memory_usage_mb: Optional[float] = None,
        cpu_usage_percent: Optional[float] = None,
        errors_per_1000_rows: float = 0,
        quality_score: Optional[float] = None
    ) -> bool:
        """Save processing performance metrics"""
        try:
            supabase = self.get_supabase_client()
            
            metrics_data = {
                "job_id": job_id,
                "file_size_mb": file_size_mb,
                "processing_time_ms": processing_time_ms,
                "processed_rows": processed_rows,
                "memory_usage_mb": memory_usage_mb,
                "cpu_usage_percent": cpu_usage_percent,
                "errors_per_1000_rows": errors_per_1000_rows,
                "quality_score": quality_score,
            }
            
            result = supabase.table("processing_metrics").insert(metrics_data).execute()
            
            logger.info(
                "Processing metrics saved",
                job_id=job_id,
                processing_time_ms=processing_time_ms,
                processed_rows=processed_rows,
                quality_score=quality_score
            )
            
            return len(result.data) > 0
            
        except Exception as e:
            logger.error("Failed to save processing metrics", job_id=job_id, error=str(e))
            return False
    
    async def bulk_insert_events(self, events: List[Dict[str, Any]], batch_size: int = 1000) -> bool:
        """
        Enhanced bulk insert with RLS compliance, schema validation, and performance optimization
        Task 2: Database integration with bulk operations and anonymization
        """
        try:
            if not events:
                return True
                
            total_inserted = 0
            
            # Process in batches for memory efficiency
            for i in range(0, len(events), batch_size):
                batch = events[i:i+batch_size]
                
                # Validate and prepare batch with schema compliance
                validated_batch = await self._validate_and_prepare_events_batch(batch)
                
                if not validated_batch:
                    logger.warning(f"Skipping empty batch {i//batch_size + 1}")
                    continue
                
                # Execute bulk insert with RLS compliance
                success = await self._execute_bulk_insert_events(validated_batch)
                
                if success:
                    total_inserted += len(validated_batch)
                    logger.debug(f"Inserted batch {i//batch_size + 1}: {len(validated_batch)} events")
                else:
                    logger.error(f"Failed to insert batch {i//batch_size + 1}")
                    
                    # Attempt individual inserts for failed batch
                    for event in validated_batch:
                        try:
                            await self._execute_bulk_insert_events([event])
                            total_inserted += 1
                        except Exception as e:
                            await self.add_ingestion_error(
                                job_id=event.get("metadata", {}).get("job_id", "unknown"),
                                error_type="database_insert",
                                error_message=str(e),
                                raw_data=event,
                                severity="error"
                            )
            
            logger.info(f"Bulk events insertion completed", 
                       total_events=len(events),
                       successfully_inserted=total_inserted,
                       success_rate=total_inserted/len(events) if events else 1.0)
            
            return total_inserted > 0
                
        except Exception as e:
            logger.error("Bulk events insertion failed", error=str(e))
            return False
    
    async def _validate_and_prepare_events_batch(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate and prepare events batch with schema compliance and anonymization"""
        validated_events = []
        
        for event in events:
            try:
                # Schema validation
                if not self._validate_event_schema(event):
                    continue
                
                # Apply anonymization based on privacy rules
                anonymized_event = await self._apply_anonymization_rules(event)
                
                # Add audit fields
                anonymized_event.update({
                    'created_at': datetime.now(timezone.utc),
                    'updated_at': datetime.now(timezone.utc)
                })
                
                validated_events.append(anonymized_event)
                
            except Exception as e:
                logger.warning(f"Event validation failed: {e}", event_id=event.get('id'))
                continue
        
        return validated_events
    
    def _validate_event_schema(self, event: Dict[str, Any]) -> bool:
        """Validate event against required schema"""
        required_fields = ['id', 'user_id', 'ts']
        
        for field in required_fields:
            if not event.get(field):
                return False
        
        # Validate data types
        if event.get('duration') is not None:
            try:
                float(event['duration'])
            except (ValueError, TypeError):
                return False
        
        return True
    
    async def _apply_anonymization_rules(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Apply anonymization rules based on privacy settings"""
        try:
            # Get privacy rules for this contact
            user_id = event.get('user_id')
            number = event.get('number')
            
            if user_id and number:
                supabase = self.get_supabase_client()
                
                # Check privacy rules
                privacy_result = supabase.table("privacy_rules").select("*").eq("user_id", user_id).eq("number", number).execute()
                
                if privacy_result.data:
                    privacy_rule = privacy_result.data[0]
                    visibility = privacy_rule.get('visibility', 'team')
                    
                    # Apply anonymization based on visibility
                    if visibility == 'private':
                        # Anonymize sensitive fields
                        event['number'] = self._anonymize_phone_number(number)
                        if event.get('content'):
                            event['content'] = '[PRIVATE]'
                    elif visibility == 'public':
                        # Keep as is - no anonymization needed
                        pass
                    # 'team' visibility - default behavior
            
            return event
            
        except Exception as e:
            logger.error(f"Anonymization failed: {e}")
            return event
    
    def _anonymize_phone_number(self, phone: str) -> str:
        """Anonymize phone number for private contacts"""
        if len(phone) >= 7:
            return phone[:3] + 'XXX' + phone[-4:]
        return 'XXXXXXX'
    
    async def _execute_bulk_insert_events(self, events: List[Dict[str, Any]]) -> bool:
        """Execute the actual bulk insert with optimized query"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Optimized insert query with conflict resolution
                insert_query = """
                INSERT INTO events (
                    id, user_id, number, ts, type, direction, duration, 
                    content, metadata, created_at, updated_at
                ) VALUES %s
                ON CONFLICT (id) DO UPDATE SET
                    duration = COALESCE(EXCLUDED.duration, events.duration),
                    content = COALESCE(EXCLUDED.content, events.content),
                    metadata = events.metadata || EXCLUDED.metadata,
                    updated_at = NOW()
                """
                
                # Prepare data tuples with proper handling
                values = []
                for event in events:
                    values.append((
                        event.get("id"),
                        event.get("user_id"),
                        event.get("number"),
                        event.get("ts"),
                        event.get("type"),
                        event.get("direction"),
                        event.get("duration"),
                        event.get("content"),
                        Json(event.get("metadata", {})),
                        event.get("created_at", datetime.now(timezone.utc)),
                        event.get("updated_at", datetime.now(timezone.utc))
                    ))
                
                # Execute optimized bulk insert
                psycopg2.extras.execute_values(
                    cursor, insert_query, values, 
                    template=None, page_size=min(1000, len(values))
                )
                
                conn.commit()
                return True
                
        except Exception as e:
            logger.error("Bulk insert execution failed", error=str(e))
            return False
    
    async def bulk_insert_contacts(self, contacts: List[Dict[str, Any]]) -> bool:
        """Bulk insert/update contacts from parsed data with enhanced performance"""
        try:
            if not contacts:
                return True
                
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Prepare optimized upsert query
                upsert_query = """
                INSERT INTO contacts (
                    id, user_id, number, display_name, first_seen, last_seen,
                    total_calls, total_sms, metadata, created_at, updated_at
                ) VALUES %s
                ON CONFLICT (user_id, number) DO UPDATE SET
                    display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
                    first_seen = LEAST(contacts.first_seen, EXCLUDED.first_seen),
                    last_seen = GREATEST(contacts.last_seen, EXCLUDED.last_seen),
                    total_calls = contacts.total_calls + EXCLUDED.total_calls,
                    total_sms = contacts.total_sms + EXCLUDED.total_sms,
                    metadata = contacts.metadata || EXCLUDED.metadata,
                    updated_at = NOW()
                """
                
                # Prepare data tuples
                values = []
                for contact in contacts:
                    values.append((
                        contact.get("id"),
                        contact.get("user_id"),
                        contact.get("number"),
                        contact.get("display_name"),
                        contact.get("first_seen"),
                        contact.get("last_seen"),
                        contact.get("total_calls", 0),
                        contact.get("total_sms", 0),
                        Json(contact.get("metadata", {})),
                        datetime.now(timezone.utc),
                        datetime.now(timezone.utc)
                    ))
                
                # Execute bulk upsert in batches
                batch_size = 1000
                for i in range(0, len(values), batch_size):
                    batch = values[i:i+batch_size]
                    psycopg2.extras.execute_values(
                        cursor, upsert_query, batch, template=None, page_size=len(batch)
                    )
                
                conn.commit()
                logger.info("Bulk contacts upserted", count=len(contacts))
                return True
                
        except Exception as e:
            logger.error("Failed to bulk insert contacts", error=str(e))
            return False
    
    async def save_duplicate_detection_results(
        self,
        job_id: str,
        duplicate_groups: List[Dict[str, Any]],
        merge_results: List[Dict[str, Any]],
        statistics: Dict[str, Any]
    ) -> bool:
        """Save duplicate detection results for audit and analysis"""
        try:
            supabase = self.get_supabase_client()
            
            # Save duplicate detection metadata
            detection_data = {
                "job_id": job_id,
                "duplicate_groups_count": len(duplicate_groups),
                "merge_results_count": len(merge_results),
                "statistics": statistics,
                "duplicate_groups": duplicate_groups[:100],  # Store first 100 for analysis
                "merge_results": merge_results[:100],        # Store first 100 for analysis
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            result = supabase.table("duplicate_detection_results").insert(detection_data).execute()
            
            logger.info(
                "Duplicate detection results saved",
                job_id=job_id,
                duplicate_groups=len(duplicate_groups),
                merge_results=len(merge_results),
                accuracy_score=statistics.get('accuracy_score', 0)
            )
            
            return len(result.data) > 0
            
        except Exception as e:
            logger.error("Failed to save duplicate detection results", job_id=job_id, error=str(e))
            return False
    
    async def save_mapping_suggestions(
        self,
        job_id: str,
        suggestions: List[Dict[str, Any]],
        quality_metrics: Dict[str, Any]
    ) -> bool:
        """Save field mapping suggestions for learning and improvement"""
        try:
            supabase = self.get_supabase_client()
            
            # Save mapping suggestions
            suggestion_data = {
                "job_id": job_id,
                "suggestions": suggestions,
                "quality_metrics": quality_metrics,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            result = supabase.table("mapping_suggestions").insert(suggestion_data).execute()
            
            logger.info(
                "Mapping suggestions saved",
                job_id=job_id,
                suggestions_count=len(suggestions),
                quality_score=quality_metrics.get('quality_score', 0)
            )
            
            return len(result.data) > 0
            
        except Exception as e:
            logger.error("Failed to save mapping suggestions", job_id=job_id, error=str(e))
            return False
    
    async def save_validation_pipeline_results(
        self,
        job_id: str,
        result: Dict[str, Any]
    ) -> bool:
        """Save comprehensive validation pipeline results"""
        try:
            supabase = self.get_supabase_client()
            
            # Prepare pipeline results data
            pipeline_data = {
                "job_id": job_id,
                "stage": result.get('stage'),
                "success": result.get('success', False),
                "processed_events_count": len(result.get('processed_events', [])),
                "field_mappings": result.get('field_mappings', []),
                "normalization_stats": result.get('normalization_stats', {}),
                "duplicate_stats": result.get('duplicate_stats', {}),
                "performance_metrics": result.get('performance_metrics', {}),
                "quality_metrics": result.get('quality_metrics', {}),
                "errors": result.get('errors', []),
                "warnings": result.get('warnings', []),
                "processing_time_ms": result.get('processing_time_ms', 0),
                "memory_usage_mb": result.get('memory_usage_mb', 0),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            result_insert = supabase.table("validation_pipeline_results").insert(pipeline_data).execute()
            
            logger.info(
                "Validation pipeline results saved",
                job_id=job_id,
                success=result.get('success', False),
                stage=result.get('stage'),
                processing_time_ms=result.get('processing_time_ms', 0)
            )
            
            return len(result_insert.data) > 0
            
        except Exception as e:
            logger.error("Failed to save validation pipeline results", job_id=job_id, error=str(e))
            return False
    
    async def get_user_privacy_rules(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all privacy rules for a user"""
        try:
            supabase = self.get_supabase_client()
            result = supabase.table("privacy_rules").select("*").eq("user_id", user_id).execute()
            
            return result.data if result.data else []
            
        except Exception as e:
            logger.error("Failed to get user privacy rules", user_id=user_id, error=str(e))
            return []
    
    async def get_performance_metrics_history(
        self,
        time_range_hours: int = 24,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get recent performance metrics for monitoring and optimization"""
        try:
            supabase = self.get_supabase_client()
            
            # Calculate time threshold
            threshold_time = datetime.now(timezone.utc) - timedelta(hours=time_range_hours)
            
            result = (
                supabase.table("processing_metrics")
                .select("*")
                .gte("created_at", threshold_time.isoformat())
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            
            return result.data if result.data else []
            
        except Exception as e:
            logger.error("Failed to get performance metrics history", error=str(e))
            return []


# Global database manager instance
db_manager = DatabaseManager()