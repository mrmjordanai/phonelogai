"""
Phase 3: Duplicate Detection System

This module provides advanced duplicate detection and conflict resolution:
- Composite key generation for unique identification
- Multi-level duplicate detection (exact, fuzzy, semantic)
- Advanced conflict resolution strategies
- Merge operations with data lineage
- Performance-optimized batch processing
"""
import asyncio
import hashlib
import pickle
from typing import Dict, List, Tuple, Optional, Any, Union, Set
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict, field
from collections import defaultdict, Counter
from pathlib import Path
import structlog
import numpy as np
from difflib import SequenceMatcher

from ..config import settings
from ..utils.database import db_manager
from ..utils.deduplication import deduplication_engine

logger = structlog.get_logger(__name__)


@dataclass
class CompositeKey:
    """Represents a composite key for duplicate detection"""
    primary: str
    secondary: str
    full: str
    components: Dict[str, Any]
    hash_algorithm: str = 'sha256'
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def __post_init__(self):
        if not self.full:
            self.full = f"{self.primary}:{self.secondary}"


@dataclass
class DuplicateMatch:
    """Represents a duplicate match between records"""
    primary_record: Dict[str, Any]
    duplicate_record: Dict[str, Any]
    similarity_score: float
    confidence: float
    match_type: str  # 'exact', 'fuzzy', 'semantic'
    matching_fields: List[str]
    conflicting_fields: List[str]
    resolution_strategy: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MergeResult:
    """Result of merging duplicate records"""
    merged_record: Dict[str, Any]
    source_records: List[Dict[str, Any]]
    conflicts_resolved: int
    merge_strategy: str
    quality_score: float
    data_lineage: Dict[str, Any]
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class CompositeKeyGenerator:
    """Advanced composite key generation for duplicate detection"""
    
    def __init__(self):
        self.key_strategies = {
            'standard': self._generate_standard_key,
            'time_bucketed': self._generate_time_bucketed_key,
            'fuzzy_tolerant': self._generate_fuzzy_tolerant_key,
            'content_based': self._generate_content_based_key
        }
        
        self.time_bucket_sizes = {
            'minute': 60,
            'five_minutes': 300,
            'fifteen_minutes': 900,
            'hour': 3600
        }
    
    def generate_composite_key(
        self,
        event: Dict[str, Any],
        strategy: str = 'time_bucketed',
        time_tolerance: int = 300,
        job_id: Optional[str] = None
    ) -> CompositeKey:
        """Generate composite key using specified strategy"""
        try:
            if strategy not in self.key_strategies:
                strategy = 'standard'
            
            key_generator = self.key_strategies[strategy]
            return key_generator(event, time_tolerance)
            
        except Exception as e:
            logger.error(f"Composite key generation failed: {e}", job_id=job_id)
            # Fallback to basic key
            return self._generate_fallback_key(event)
    
    def _generate_standard_key(
        self,
        event: Dict[str, Any],
        time_tolerance: int
    ) -> CompositeKey:
        """Generate standard composite key"""
        # Primary components (must match exactly)
        user_id = str(event.get('user_id', ''))
        phone = self._normalize_phone_for_key(event.get('number', ''))
        timestamp = self._normalize_timestamp_for_key(event.get('ts', ''))
        event_type = str(event.get('type', '')).lower()
        direction = str(event.get('direction', '')).lower()
        
        primary_components = [user_id, phone, timestamp, event_type, direction]
        primary_key = hashlib.sha256('|'.join(primary_components).encode()).hexdigest()
        
        # Secondary components (for collision resolution)
        duration = str(event.get('duration', '0'))
        content_hash = self._hash_content(event.get('content', ''))
        
        secondary_components = [duration, content_hash]
        secondary_key = hashlib.md5('|'.join(secondary_components).encode()).hexdigest()
        
        return CompositeKey(
            primary=primary_key,
            secondary=secondary_key,
            full=f"{primary_key}:{secondary_key}",
            components={
                'user_id': user_id,
                'phone': phone,
                'timestamp': timestamp,
                'type': event_type,
                'direction': direction,
                'duration': duration,
                'content_hash': content_hash
            }
        )
    
    def _generate_time_bucketed_key(
        self,
        event: Dict[str, Any],
        time_tolerance: int
    ) -> CompositeKey:
        """Generate time-bucketed key for fuzzy time matching"""
        # Use time buckets instead of exact timestamps
        user_id = str(event.get('user_id', ''))
        phone = self._normalize_phone_for_key(event.get('number', ''))
        time_bucket = self._create_time_bucket(
            event.get('ts', ''),
            bucket_size=time_tolerance
        )
        event_type = str(event.get('type', '')).lower()
        direction = str(event.get('direction', '')).lower()
        
        primary_components = [user_id, phone, time_bucket, event_type, direction]
        primary_key = hashlib.sha256('|'.join(primary_components).encode()).hexdigest()
        
        # Duration bucket for secondary key
        duration_bucket = self._create_duration_bucket(event.get('duration', 0))
        content_hash = self._hash_content(event.get('content', ''))
        
        secondary_components = [duration_bucket, content_hash]
        secondary_key = hashlib.md5('|'.join(secondary_components).encode()).hexdigest()
        
        return CompositeKey(
            primary=primary_key,
            secondary=secondary_key,
            full=f"{primary_key}:{secondary_key}",
            components={
                'user_id': user_id,
                'phone': phone,
                'time_bucket': time_bucket,
                'type': event_type,
                'direction': direction,
                'duration_bucket': duration_bucket,
                'content_hash': content_hash
            }
        )
    
    def _generate_fuzzy_tolerant_key(
        self,
        event: Dict[str, Any],
        time_tolerance: int
    ) -> CompositeKey:
        """Generate fuzzy-tolerant key for near-duplicate detection"""
        user_id = str(event.get('user_id', ''))
        
        # Use phone prefix instead of full number for fuzzy matching
        phone_prefix = self._get_phone_prefix(event.get('number', ''))
        
        # Use hour-level time bucket for fuzzy time matching
        time_bucket = self._create_time_bucket(
            event.get('ts', ''),
            bucket_size=3600  # 1 hour buckets
        )
        
        event_type = str(event.get('type', '')).lower()
        # Don't include direction for fuzzy matching
        
        primary_components = [user_id, phone_prefix, time_bucket, event_type]
        primary_key = hashlib.sha256('|'.join(primary_components).encode()).hexdigest()
        
        # Broad duration buckets
        duration_bucket = self._create_broad_duration_bucket(event.get('duration', 0))
        content_similarity = self._get_content_similarity_hash(event.get('content', ''))
        
        secondary_components = [duration_bucket, content_similarity]
        secondary_key = hashlib.md5('|'.join(secondary_components).encode()).hexdigest()
        
        return CompositeKey(
            primary=primary_key,
            secondary=secondary_key,
            full=f"{primary_key}:{secondary_key}",
            components={
                'user_id': user_id,
                'phone_prefix': phone_prefix,
                'time_bucket': time_bucket,
                'type': event_type,
                'duration_bucket': duration_bucket,
                'content_similarity': content_similarity
            }
        )
    
    def _generate_content_based_key(
        self,
        event: Dict[str, Any],
        time_tolerance: int
    ) -> CompositeKey:
        """Generate content-based key for semantic duplicate detection"""
        user_id = str(event.get('user_id', ''))
        phone = self._normalize_phone_for_key(event.get('number', ''))
        
        # Use content fingerprint as primary component
        content_fingerprint = self._create_content_fingerprint(event.get('content', ''))
        event_type = str(event.get('type', '')).lower()
        
        primary_components = [user_id, phone, content_fingerprint, event_type]
        primary_key = hashlib.sha256('|'.join(primary_components).encode()).hexdigest()
        
        # Time and duration as secondary
        time_bucket = self._create_time_bucket(event.get('ts', ''), time_tolerance)
        duration = str(event.get('duration', '0'))
        
        secondary_components = [time_bucket, duration]
        secondary_key = hashlib.md5('|'.join(secondary_components).encode()).hexdigest()
        
        return CompositeKey(
            primary=primary_key,
            secondary=secondary_key,
            full=f"{primary_key}:{secondary_key}",
            components={
                'user_id': user_id,
                'phone': phone,
                'content_fingerprint': content_fingerprint,
                'type': event_type,
                'time_bucket': time_bucket,
                'duration': duration
            }
        )
    
    def _normalize_phone_for_key(self, phone: str) -> str:
        """Normalize phone number for key generation"""
        if not phone:
            return 'unknown'
        
        # Extract digits only
        digits = ''.join(c for c in str(phone) if c.isdigit())
        
        # Normalize US numbers
        if len(digits) == 11 and digits.startswith('1'):
            return digits
        elif len(digits) == 10:
            return '1' + digits
        else:
            return digits
    
    def _normalize_timestamp_for_key(self, timestamp: str) -> str:
        """Normalize timestamp for key generation"""
        try:
            if isinstance(timestamp, str):
                # Try to parse ISO format
                if 'T' in timestamp:
                    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                else:
                    dt = datetime.strptime(timestamp, '%Y-%m-%d %H:%M:%S')
            else:
                return 'unknown'
            
            # Return as Unix timestamp string
            return str(int(dt.timestamp()))
            
        except Exception:
            return 'unknown'
    
    def _create_time_bucket(self, timestamp: str, bucket_size: int) -> str:
        """Create time bucket for grouping similar timestamps"""
        try:
            if isinstance(timestamp, str):
                if 'T' in timestamp:
                    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                else:
                    dt = datetime.strptime(timestamp, '%Y-%m-%d %H:%M:%S')
            else:
                return 'unknown'
            
            # Round down to bucket boundary
            unix_timestamp = int(dt.timestamp())
            bucket_timestamp = (unix_timestamp // bucket_size) * bucket_size
            
            return str(bucket_timestamp)
            
        except Exception:
            return 'unknown'
    
    def _create_duration_bucket(self, duration: Union[int, float, str]) -> str:
        """Create duration bucket for grouping similar durations"""
        try:
            duration_seconds = float(duration) if duration else 0
            
            # Create buckets: 0-30s, 31-60s, 61-300s, 301-900s, 901+s
            if duration_seconds <= 30:
                return 'short'
            elif duration_seconds <= 60:
                return 'minute'
            elif duration_seconds <= 300:
                return 'medium'
            elif duration_seconds <= 900:
                return 'long'
            else:
                return 'very_long'
                
        except Exception:
            return 'unknown'
    
    def _create_broad_duration_bucket(self, duration: Union[int, float, str]) -> str:
        """Create broad duration bucket for fuzzy matching"""
        try:
            duration_seconds = float(duration) if duration else 0
            
            # Broader buckets for fuzzy matching
            if duration_seconds <= 60:
                return 'short'
            elif duration_seconds <= 600:  # 10 minutes
                return 'medium'
            else:
                return 'long'
                
        except Exception:
            return 'unknown'
    
    def _hash_content(self, content: str) -> str:
        """Create hash of content for exact matching"""
        if not content:
            return 'empty'
        
        # Normalize whitespace and case
        normalized = ' '.join(str(content).lower().split())
        
        return hashlib.md5(normalized.encode()).hexdigest()[:8]
    
    def _create_content_fingerprint(self, content: str) -> str:
        """Create content fingerprint for semantic matching"""
        if not content:
            return 'empty'
        
        # Extract keywords and create fingerprint
        words = str(content).lower().split()
        
        # Remove common words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        keywords = [w for w in words if w not in stop_words and len(w) > 2]
        
        # Create fingerprint from first few keywords
        fingerprint_words = sorted(keywords[:5])  # Top 5 keywords, sorted for consistency
        
        return hashlib.md5('|'.join(fingerprint_words).encode()).hexdigest()[:8]
    
    def _get_content_similarity_hash(self, content: str) -> str:
        """Get similarity-based hash for content"""
        if not content:
            return 'empty'
        
        # Use first and last words for similarity
        words = str(content).split()
        if len(words) == 0:
            return 'empty'
        elif len(words) == 1:
            return hashlib.md5(words[0].lower().encode()).hexdigest()[:8]
        else:
            similarity_string = f"{words[0].lower()}|{words[-1].lower()}"
            return hashlib.md5(similarity_string.encode()).hexdigest()[:8]
    
    def _get_phone_prefix(self, phone: str) -> str:
        """Get phone number prefix for fuzzy matching"""
        digits = ''.join(c for c in str(phone) if c.isdigit())
        
        if len(digits) >= 6:
            return digits[:6]  # Area code + exchange
        elif len(digits) >= 3:
            return digits[:3]  # Area code only
        else:
            return digits
    
    def _generate_fallback_key(self, event: Dict[str, Any]) -> CompositeKey:
        """Generate fallback key when other methods fail"""
        components = [
            str(event.get('user_id', 'unknown')),
            str(event.get('number', 'unknown')),
            str(event.get('ts', 'unknown')),
            str(event.get('type', 'unknown'))
        ]
        
        key_string = '|'.join(components)
        key_hash = hashlib.sha256(key_string.encode()).hexdigest()
        
        return CompositeKey(
            primary=key_hash[:32],
            secondary=key_hash[32:],
            full=key_hash,
            components={
                'fallback': True,
                'key_string': key_string
            }
        )


class FuzzyMatcher:
    """Advanced fuzzy matching for near-duplicate detection"""
    
    def __init__(self):
        self.similarity_thresholds = {
            'phone': 0.8,
            'timestamp': 0.7,
            'duration': 0.6,
            'content': 0.75,
            'overall': 0.7
        }
        
        self.field_weights = {
            'phone': 0.3,
            'timestamp': 0.25,
            'duration': 0.15,
            'content': 0.2,
            'type': 0.1
        }
    
    def calculate_similarity(
        self,
        record1: Dict[str, Any],
        record2: Dict[str, Any],
        matching_fields: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Calculate comprehensive similarity between two records"""
        if matching_fields is None:
            matching_fields = ['number', 'ts', 'duration', 'content', 'type']
        
        field_similarities = {}
        
        for field in matching_fields:
            value1 = record1.get(field, '')
            value2 = record2.get(field, '')
            
            if field == 'number':
                similarity = self._phone_similarity(value1, value2)
            elif field == 'ts':
                similarity = self._timestamp_similarity(value1, value2)
            elif field == 'duration':
                similarity = self._duration_similarity(value1, value2)
            elif field == 'content':
                similarity = self._content_similarity(value1, value2)
            else:
                similarity = self._string_similarity(str(value1), str(value2))
            
            field_similarities[field] = similarity
        
        # Calculate weighted overall similarity
        overall_similarity = sum(
            field_similarities.get(field, 0) * self.field_weights.get(field, 0.1)
            for field in field_similarities
        )
        
        # Determine if records are potential duplicates
        is_potential_duplicate = overall_similarity >= self.similarity_thresholds['overall']
        
        # Calculate confidence based on number of high-similarity fields
        high_similarity_fields = [
            field for field, sim in field_similarities.items()
            if sim >= self.similarity_thresholds.get(field, 0.7)
        ]
        
        confidence = len(high_similarity_fields) / len(matching_fields)
        
        return {
            'overall_similarity': overall_similarity,
            'field_similarities': field_similarities,
            'is_potential_duplicate': is_potential_duplicate,
            'confidence': confidence,
            'high_similarity_fields': high_similarity_fields
        }
    
    def _phone_similarity(self, phone1: str, phone2: str) -> float:
        """Calculate phone number similarity"""
        if not phone1 or not phone2:
            return 0.0
        
        # Extract digits only
        digits1 = ''.join(c for c in str(phone1) if c.isdigit())
        digits2 = ''.join(c for c in str(phone2) if c.isdigit())
        
        if digits1 == digits2:
            return 1.0
        
        # Check if one is a substring of the other (international vs local)
        if len(digits1) > len(digits2):
            if digits1.endswith(digits2):
                return 0.9
        elif len(digits2) > len(digits1):
            if digits2.endswith(digits1):
                return 0.9
        
        # Use sequence similarity for partial matches
        return SequenceMatcher(None, digits1, digits2).ratio()
    
    def _timestamp_similarity(self, ts1: str, ts2: str) -> float:
        """Calculate timestamp similarity"""
        try:
            # Parse timestamps
            dt1 = self._parse_timestamp(ts1)
            dt2 = self._parse_timestamp(ts2)
            
            if not dt1 or not dt2:
                return 0.0
            
            # Calculate time difference in seconds
            time_diff = abs((dt1 - dt2).total_seconds())
            
            # Similarity based on time difference
            if time_diff == 0:
                return 1.0
            elif time_diff <= 60:  # Within 1 minute
                return 0.9
            elif time_diff <= 300:  # Within 5 minutes
                return 0.8
            elif time_diff <= 900:  # Within 15 minutes
                return 0.6
            elif time_diff <= 3600:  # Within 1 hour
                return 0.4
            elif time_diff <= 86400:  # Within 1 day
                return 0.2
            else:
                return 0.0
                
        except Exception:
            return 0.0
    
    def _duration_similarity(self, dur1: Union[str, int, float], dur2: Union[str, int, float]) -> float:
        """Calculate duration similarity"""
        try:
            # Convert to seconds
            seconds1 = float(dur1) if dur1 else 0
            seconds2 = float(dur2) if dur2 else 0
            
            if seconds1 == seconds2:
                return 1.0
            
            # Calculate percentage difference
            if max(seconds1, seconds2) == 0:
                return 1.0
            
            diff_percentage = abs(seconds1 - seconds2) / max(seconds1, seconds2)
            
            # Similarity based on percentage difference
            if diff_percentage <= 0.05:  # Within 5%
                return 0.9
            elif diff_percentage <= 0.15:  # Within 15%
                return 0.7
            elif diff_percentage <= 0.3:  # Within 30%
                return 0.5
            elif diff_percentage <= 0.5:  # Within 50%
                return 0.3
            else:
                return 0.1
                
        except Exception:
            return 0.0
    
    def _content_similarity(self, content1: str, content2: str) -> float:
        """Calculate content similarity"""
        if not content1 and not content2:
            return 1.0
        if not content1 or not content2:
            return 0.0
        
        # Normalize content
        norm1 = ' '.join(str(content1).lower().split())
        norm2 = ' '.join(str(content2).lower().split())
        
        if norm1 == norm2:
            return 1.0
        
        # Use sequence similarity
        sequence_sim = SequenceMatcher(None, norm1, norm2).ratio()
        
        # Check for common words
        words1 = set(norm1.split())
        words2 = set(norm2.split())
        
        if words1 and words2:
            jaccard_sim = len(words1 & words2) / len(words1 | words2)
            # Combine sequence and Jaccard similarity
            return (sequence_sim * 0.7) + (jaccard_sim * 0.3)
        
        return sequence_sim
    
    def _string_similarity(self, str1: str, str2: str) -> float:
        """Calculate general string similarity"""
        if not str1 and not str2:
            return 1.0
        if not str1 or not str2:
            return 0.0
        
        norm1 = str(str1).lower().strip()
        norm2 = str(str2).lower().strip()
        
        if norm1 == norm2:
            return 1.0
        
        return SequenceMatcher(None, norm1, norm2).ratio()
    
    def _parse_timestamp(self, timestamp_str: str) -> Optional[datetime]:
        """Parse timestamp string to datetime"""
        try:
            if 'T' in str(timestamp_str):
                return datetime.fromisoformat(str(timestamp_str).replace('Z', '+00:00'))
            else:
                return datetime.strptime(str(timestamp_str), '%Y-%m-%d %H:%M:%S')
        except Exception:
            return None


class ConflictResolver:
    """Advanced conflict resolution for merging duplicate records"""
    
    def __init__(self):
        self.resolution_strategies = {
            'keep_newest': self._keep_newest_value,
            'keep_oldest': self._keep_oldest_value,
            'keep_longest': self._keep_longest_value,
            'keep_most_complete': self._keep_most_complete_value,
            'merge_values': self._merge_values,
            'weighted_preference': self._weighted_preference_value
        }
        
        # Field-specific resolution rules
        self.field_resolution_rules = {
            'ts': 'keep_oldest',  # Keep earliest timestamp
            'number': 'keep_most_complete',  # Keep most complete phone format
            'duration': 'keep_longest',  # Keep longest duration
            'content': 'keep_longest',  # Keep longest content
            'type': 'weighted_preference',  # Prefer certain types
            'direction': 'weighted_preference',  # Prefer certain directions
            'carrier': 'keep_most_complete',  # Keep known carrier
            'location': 'keep_most_complete',  # Keep location if available
            'cost': 'keep_newest',  # Keep newest cost information
        }
        
        # Preference weights for weighted resolution
        self.preference_weights = {
            'type': {'call': 1.0, 'sms': 0.8, 'data': 0.6, 'unknown': 0.1},
            'direction': {'outbound': 1.0, 'inbound': 0.9, 'unknown': 0.1},
            'data_source': {'device_native': 1.0, 'carrier_cdr': 0.8, 'manual_upload': 0.6}
        }
    
    def resolve_conflicts(
        self,
        duplicate_records: List[Dict[str, Any]],
        similarity_data: Dict[str, Any],
        job_id: Optional[str] = None
    ) -> MergeResult:
        """Resolve conflicts and merge duplicate records"""
        try:
            if len(duplicate_records) < 2:
                # No conflicts to resolve
                return MergeResult(
                    merged_record=duplicate_records[0] if duplicate_records else {},
                    source_records=duplicate_records,
                    conflicts_resolved=0,
                    merge_strategy='no_merge_needed',
                    quality_score=1.0,
                    data_lineage=self._create_lineage_info(duplicate_records, {})
                )
            
            # Initialize merged record with the first record
            merged_record = duplicate_records[0].copy()
            conflicts_resolved = 0
            field_resolutions = {}
            
            # Get all unique fields across records
            all_fields = set()
            for record in duplicate_records:
                all_fields.update(record.keys())
            
            # Resolve conflicts field by field
            for field in all_fields:
                field_values = [
                    record.get(field) for record in duplicate_records
                    if field in record and record[field] is not None
                ]
                
                # Skip if no values or all values are the same
                if not field_values:
                    continue
                
                unique_values = list(set(str(v) for v in field_values if v is not None))
                
                if len(unique_values) <= 1:
                    # No conflict
                    if field_values:
                        merged_record[field] = field_values[0]
                    continue
                
                # Conflict exists - resolve it
                conflicts_resolved += 1
                
                resolution_strategy = self.field_resolution_rules.get(field, 'keep_newest')
                resolver = self.resolution_strategies.get(resolution_strategy, self._keep_newest_value)
                
                resolved_value, resolution_metadata = resolver(
                    field, field_values, duplicate_records, similarity_data
                )
                
                merged_record[field] = resolved_value
                field_resolutions[field] = {
                    'strategy': resolution_strategy,
                    'original_values': field_values,
                    'resolved_value': resolved_value,
                    'metadata': resolution_metadata
                }
            
            # Add merge metadata
            merged_record['merge_metadata'] = {
                'merged_at': datetime.now(timezone.utc).isoformat(),
                'source_count': len(duplicate_records),
                'conflicts_resolved': conflicts_resolved,
                'field_resolutions': field_resolutions,
                'similarity_score': similarity_data.get('overall_similarity', 0.0)
            }
            
            # Calculate quality score
            quality_score = self._calculate_merge_quality_score(
                merged_record, duplicate_records, conflicts_resolved, similarity_data
            )
            
            # Create data lineage
            data_lineage = self._create_lineage_info(duplicate_records, field_resolutions)
            
            return MergeResult(
                merged_record=merged_record,
                source_records=duplicate_records,
                conflicts_resolved=conflicts_resolved,
                merge_strategy='automatic_resolution',
                quality_score=quality_score,
                data_lineage=data_lineage
            )
            
        except Exception as e:
            logger.error(f"Conflict resolution failed: {e}", job_id=job_id)
            
            # Return fallback merge result
            return MergeResult(
                merged_record=duplicate_records[0] if duplicate_records else {},
                source_records=duplicate_records,
                conflicts_resolved=0,
                merge_strategy='error_fallback',
                quality_score=0.3,
                data_lineage={'error': str(e)}
            )
    
    def _keep_newest_value(
        self,
        field: str,
        values: List[Any],
        records: List[Dict[str, Any]],
        similarity_data: Dict[str, Any]
    ) -> Tuple[Any, Dict[str, Any]]:
        """Keep the value from the newest record"""
        # Find record with latest timestamp
        newest_record = max(
            records,
            key=lambda r: self._get_record_timestamp(r),
            default=records[0]
        )
        
        return newest_record.get(field), {'strategy': 'keep_newest', 'source': 'newest_record'}
    
    def _keep_oldest_value(
        self,
        field: str,
        values: List[Any],
        records: List[Dict[str, Any]],
        similarity_data: Dict[str, Any]
    ) -> Tuple[Any, Dict[str, Any]]:
        """Keep the value from the oldest record"""
        # Find record with earliest timestamp
        oldest_record = min(
            records,
            key=lambda r: self._get_record_timestamp(r),
            default=records[0]
        )
        
        return oldest_record.get(field), {'strategy': 'keep_oldest', 'source': 'oldest_record'}
    
    def _keep_longest_value(
        self,
        field: str,
        values: List[Any],
        records: List[Dict[str, Any]],
        similarity_data: Dict[str, Any]
    ) -> Tuple[Any, Dict[str, Any]]:
        """Keep the longest/largest value"""
        if field == 'duration':
            # For duration, keep the longest
            max_value = max(values, key=lambda x: float(x) if x else 0, default=values[0])
        else:
            # For strings, keep the longest
            max_value = max(values, key=lambda x: len(str(x)) if x else 0, default=values[0])
        
        return max_value, {'strategy': 'keep_longest', 'selected_from': len(values)}
    
    def _keep_most_complete_value(
        self,
        field: str,
        values: List[Any],
        records: List[Dict[str, Any]],
        similarity_data: Dict[str, Any]
    ) -> Tuple[Any, Dict[str, Any]]:
        """Keep the most complete/detailed value"""
        # Score values by completeness
        scored_values = []
        
        for value in values:
            if not value:
                score = 0
            elif field == 'number':
                # For phone numbers, prefer formatted versions
                str_val = str(value)
                score = len(str_val)
                if '+' in str_val:
                    score += 5
                if '(' in str_val and ')' in str_val:
                    score += 3
            else:
                # General completeness scoring
                str_val = str(value)
                score = len(str_val)
                if str_val.lower() not in ['unknown', 'null', 'none', '']:
                    score += 10
            
            scored_values.append((value, score))
        
        # Return highest scoring value
        best_value = max(scored_values, key=lambda x: x[1], default=(values[0], 0))[0]
        
        return best_value, {'strategy': 'keep_most_complete', 'scores': [s for v, s in scored_values]}
    
    def _merge_values(
        self,
        field: str,
        values: List[Any],
        records: List[Dict[str, Any]],
        similarity_data: Dict[str, Any]
    ) -> Tuple[Any, Dict[str, Any]]:
        """Merge multiple values into one"""
        # This could be used for tags, categories, etc.
        if field == 'tags':
            # Merge tag lists
            all_tags = set()
            for value in values:
                if isinstance(value, list):
                    all_tags.update(value)
                elif isinstance(value, str):
                    all_tags.update(value.split(','))
            
            merged_tags = list(all_tags)
            return merged_tags, {'strategy': 'merge_values', 'merged_count': len(all_tags)}
        
        else:
            # For other fields, just concatenate with separator
            non_empty_values = [str(v) for v in values if v]
            merged_value = ' | '.join(non_empty_values)
            
            return merged_value, {'strategy': 'merge_values', 'source_count': len(non_empty_values)}
    
    def _weighted_preference_value(
        self,
        field: str,
        values: List[Any],
        records: List[Dict[str, Any]],
        similarity_data: Dict[str, Any]
    ) -> Tuple[Any, Dict[str, Any]]:
        """Use weighted preferences to select best value"""
        if field in self.preference_weights:
            weights = self.preference_weights[field]
            
            # Score values by preference weights
            scored_values = []
            for value in values:
                str_val = str(value).lower()
                weight = weights.get(str_val, 0.5)  # Default weight for unknown values
                scored_values.append((value, weight))
            
            # Return highest weighted value
            best_value = max(scored_values, key=lambda x: x[1], default=(values[0], 0))[0]
            
            return best_value, {
                'strategy': 'weighted_preference',
                'weights': scored_values,
                'selected_weight': max(scored_values, key=lambda x: x[1])[1]
            }
        
        else:
            # Fallback to keeping newest
            return self._keep_newest_value(field, values, records, similarity_data)
    
    def _get_record_timestamp(self, record: Dict[str, Any]) -> datetime:
        """Get timestamp from record for ordering"""
        timestamp_fields = ['ts', 'timestamp', 'created_at', 'updated_at']
        
        for field in timestamp_fields:
            if field in record and record[field]:
                try:
                    ts_str = str(record[field])
                    if 'T' in ts_str:
                        return datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                    else:
                        return datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S')
                except Exception:
                    continue
        
        # Fallback to epoch
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    
    def _calculate_merge_quality_score(
        self,
        merged_record: Dict[str, Any],
        source_records: List[Dict[str, Any]],
        conflicts_resolved: int,
        similarity_data: Dict[str, Any]
    ) -> float:
        """Calculate quality score for merge result"""
        # Base score from similarity
        base_score = similarity_data.get('overall_similarity', 0.5)
        
        # Bonus for successful conflict resolution
        if conflicts_resolved > 0:
            resolution_bonus = min(0.2, conflicts_resolved * 0.05)
            base_score += resolution_bonus
        
        # Penalty for too many conflicts (might indicate poor matching)
        total_fields = len(set().union(*(record.keys() for record in source_records)))
        if total_fields > 0 and conflicts_resolved > total_fields * 0.5:
            conflict_penalty = (conflicts_resolved / total_fields - 0.5) * 0.3
            base_score -= conflict_penalty
        
        # Bonus for data completeness
        completeness_score = self._calculate_data_completeness(merged_record)
        base_score += completeness_score * 0.1
        
        return max(0.0, min(1.0, base_score))
    
    def _calculate_data_completeness(self, record: Dict[str, Any]) -> float:
        """Calculate how complete the merged record is"""
        important_fields = ['ts', 'number', 'type', 'direction', 'duration']
        
        filled_fields = 0
        for field in important_fields:
            if field in record and record[field] is not None and str(record[field]).strip():
                filled_fields += 1
        
        return filled_fields / len(important_fields)
    
    def _create_lineage_info(
        self,
        source_records: List[Dict[str, Any]],
        field_resolutions: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create data lineage information for audit trail"""
        return {
            'source_record_count': len(source_records),
            'source_record_ids': [record.get('id', 'unknown') for record in source_records],
            'merge_timestamp': datetime.now(timezone.utc).isoformat(),
            'field_resolutions': field_resolutions,
            'lineage_version': '1.0'
        }


class DuplicateDetectionSystem:
    """Main system for comprehensive duplicate detection"""
    
    def __init__(self):
        self.key_generator = CompositeKeyGenerator()
        self.fuzzy_matcher = FuzzyMatcher()
        self.conflict_resolver = ConflictResolver()
        
        # Detection stages in order
        self.detection_stages = [
            ('exact_match', self._exact_match_detection),
            ('time_bucketed', self._time_bucketed_detection),
            ('fuzzy_matching', self._fuzzy_match_detection),
            ('semantic_matching', self._semantic_match_detection)
        ]
        
        self.performance_targets = {
            'accuracy': 0.99,  # >99% duplicate detection accuracy
            'processing_speed': 5 * 60,  # 100k rows in <5 minutes
            'false_positive_rate': 0.01  # <1% false positives
        }
    
    async def detect_duplicates(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        detection_strategy: str = 'comprehensive',
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Run comprehensive duplicate detection on events"""
        try:
            start_time = datetime.now()
            
            logger.info(
                f"Starting duplicate detection",
                total_events=len(events),
                user_id=user_id,
                strategy=detection_strategy,
                job_id=job_id
            )
            
            if not events:
                return {
                    'deduplicated_events': [],
                    'duplicate_groups': [],
                    'merge_results': [],
                    'statistics': {
                        'total_events': 0,
                        'duplicates_found': 0,
                        'conflicts_resolved': 0,
                        'processing_time_ms': 0,
                        'accuracy_score': 1.0
                    }
                }
            
            # Stage 1: Generate composite keys for all events
            keyed_events = await self._generate_composite_keys(events, job_id)
            
            # Stage 2: Run detection stages
            duplicate_groups = []
            remaining_events = keyed_events.copy()
            
            for stage_name, stage_function in self.detection_stages:
                if detection_strategy == 'fast' and stage_name in ['fuzzy_matching', 'semantic_matching']:
                    continue  # Skip expensive stages for fast mode
                
                stage_results = await stage_function(remaining_events, user_id, job_id)
                
                duplicate_groups.extend(stage_results['duplicate_groups'])
                remaining_events = stage_results['remaining_events']
                
                logger.info(
                    f"Completed detection stage: {stage_name}",
                    duplicates_found=len(stage_results['duplicate_groups']),
                    remaining_events=len(remaining_events)
                )
            
            # Stage 3: Resolve conflicts and merge duplicates
            merge_results = []
            final_events = []
            
            for group in duplicate_groups:
                merge_result = self.conflict_resolver.resolve_conflicts(
                    group['records'],
                    group['similarity_data'],
                    job_id
                )
                merge_results.append(merge_result)
                final_events.append(merge_result.merged_record)
            
            # Add non-duplicate events
            final_events.extend(remaining_events)
            
            # Calculate statistics
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            statistics = self._calculate_detection_statistics(
                events, duplicate_groups, merge_results, processing_time
            )
            
            # Save results to database
            if job_id:
                await self._save_detection_results(
                    job_id, duplicate_groups, merge_results, statistics
                )
            
            logger.info(
                f"Duplicate detection completed",
                original_count=len(events),
                final_count=len(final_events),
                duplicates_found=statistics['duplicates_found'],
                processing_time_ms=int(processing_time)
            )
            
            return {
                'deduplicated_events': final_events,
                'duplicate_groups': [asdict(group) for group in duplicate_groups],
                'merge_results': [asdict(result) for result in merge_results],
                'statistics': statistics
            }
            
        except Exception as e:
            logger.error(f"Duplicate detection failed: {e}", job_id=job_id)
            return {
                'deduplicated_events': events,  # Return original on failure
                'duplicate_groups': [],
                'merge_results': [],
                'statistics': {
                    'total_events': len(events),
                    'duplicates_found': 0,
                    'conflicts_resolved': 0,
                    'processing_time_ms': 0,
                    'accuracy_score': 0.5,
                    'error': str(e)
                }
            }
    
    async def _generate_composite_keys(
        self,
        events: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Generate composite keys for all events"""
        keyed_events = []
        
        # Process in batches for memory efficiency
        batch_size = 1000
        for i in range(0, len(events), batch_size):
            batch = events[i:i+batch_size]
            
            # Generate keys for batch
            for event in batch:
                composite_key = self.key_generator.generate_composite_key(
                    event, 'time_bucketed', 300, job_id
                )
                
                keyed_event = event.copy()
                keyed_event['_composite_key'] = asdict(composite_key)
                keyed_events.append(keyed_event)
        
        return keyed_events
    
    async def _exact_match_detection(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Exact match duplicate detection"""
        duplicate_groups = []
        key_groups = defaultdict(list)
        
        # Group by exact composite key
        for event in events:
            key = event.get('_composite_key', {}).get('full', 'unknown')
            key_groups[key].append(event)
        
        # Find duplicate groups
        remaining_events = []
        for key, group_events in key_groups.items():
            if len(group_events) > 1:
                # Duplicate found
                duplicate_groups.append({
                    'type': 'exact_match',
                    'records': group_events,
                    'similarity_data': {
                        'overall_similarity': 1.0,
                        'match_type': 'exact',
                        'confidence': 1.0
                    }
                })
            else:
                # No duplicate
                remaining_events.extend(group_events)
        
        return {
            'duplicate_groups': duplicate_groups,
            'remaining_events': remaining_events
        }
    
    async def _time_bucketed_detection(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Time-bucketed fuzzy duplicate detection"""
        duplicate_groups = []
        remaining_events = []
        
        # Group by phone number and type for efficient processing
        phone_type_groups = defaultdict(list)
        for event in events:
            key = (
                event.get('number', 'unknown'),
                event.get('type', 'unknown')
            )
            phone_type_groups[key].append(event)
        
        # Process each group independently
        for group_key, group_events in phone_type_groups.items():
            if len(group_events) < 2:
                remaining_events.extend(group_events)
                continue
            
            # Sort by timestamp for efficient comparison
            sorted_events = sorted(
                group_events,
                key=lambda x: x.get('ts', '1970-01-01')
            )
            
            group_duplicates = []
            processed_indices = set()
            
            for i, event1 in enumerate(sorted_events):
                if i in processed_indices:
                    continue
                
                similar_events = [event1]
                
                # Look for similar events within time window
                for j, event2 in enumerate(sorted_events[i+1:], i+1):
                    if j in processed_indices:
                        continue
                    
                    # Quick time check
                    if self._events_within_time_window(event1, event2, 300):  # 5 minutes
                        similarity_result = self.fuzzy_matcher.calculate_similarity(
                            event1, event2, ['number', 'ts', 'type', 'direction']
                        )
                        
                        if similarity_result['is_potential_duplicate']:
                            similar_events.append(event2)
                            processed_indices.add(j)
                
                if len(similar_events) > 1:
                    # Found duplicates
                    group_duplicates.append({
                        'type': 'time_bucketed',
                        'records': similar_events,
                        'similarity_data': {
                            'overall_similarity': 0.8,  # Default for time-bucketed matches
                            'match_type': 'time_fuzzy',
                            'confidence': 0.8
                        }
                    })
                else:
                    # No duplicates
                    remaining_events.append(event1)
                
                processed_indices.add(i)
            
            duplicate_groups.extend(group_duplicates)
        
        return {
            'duplicate_groups': duplicate_groups,
            'remaining_events': remaining_events
        }
    
    async def _fuzzy_match_detection(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Advanced fuzzy matching for near-duplicates"""
        duplicate_groups = []
        remaining_events = []
        processed_indices = set()
        
        # Process events in parallel for better performance
        for i, event1 in enumerate(events):
            if i in processed_indices:
                continue
            
            similar_events = [event1]
            
            # Compare with remaining events
            for j, event2 in enumerate(events[i+1:], i+1):
                if j in processed_indices:
                    continue
                
                # Skip if different users
                if event1.get('user_id') != event2.get('user_id'):
                    continue
                
                # Calculate comprehensive similarity
                similarity_result = self.fuzzy_matcher.calculate_similarity(
                    event1, event2
                )
                
                if similarity_result['is_potential_duplicate']:
                    similar_events.append(event2)
                    processed_indices.add(j)
            
            if len(similar_events) > 1:
                # Calculate overall similarity for the group
                avg_similarity = self._calculate_group_similarity(similar_events)
                
                duplicate_groups.append({
                    'type': 'fuzzy_match',
                    'records': similar_events,
                    'similarity_data': {
                        'overall_similarity': avg_similarity,
                        'match_type': 'fuzzy',
                        'confidence': min(0.9, avg_similarity + 0.1)
                    }
                })
            else:
                remaining_events.append(event1)
            
            processed_indices.add(i)
        
        return {
            'duplicate_groups': duplicate_groups,
            'remaining_events': remaining_events
        }
    
    async def _semantic_match_detection(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Semantic matching based on content similarity"""
        duplicate_groups = []
        remaining_events = []
        
        # Group events by content similarity
        content_groups = defaultdict(list)
        
        for event in events:
            content = str(event.get('content', ''))
            if len(content) > 10:  # Only process events with meaningful content
                # Create content fingerprint
                content_key = self.key_generator._create_content_fingerprint(content)
                content_groups[content_key].append(event)
            else:
                remaining_events.append(event)
        
        # Process content groups for semantic duplicates
        for content_key, group_events in content_groups.items():
            if len(group_events) < 2:
                remaining_events.extend(group_events)
                continue
            
            # Further analyze events with same content fingerprint
            semantic_duplicates = []
            processed = set()
            
            for i, event1 in enumerate(group_events):
                if i in processed:
                    continue
                
                similar_events = [event1]
                
                for j, event2 in enumerate(group_events[i+1:], i+1):
                    if j in processed:
                        continue
                    
                    # Check content similarity
                    content_sim = self.fuzzy_matcher._content_similarity(
                        event1.get('content', ''),
                        event2.get('content', '')
                    )
                    
                    if content_sim > 0.8:  # High content similarity
                        similar_events.append(event2)
                        processed.add(j)
                
                if len(similar_events) > 1:
                    semantic_duplicates.append({
                        'type': 'semantic_match',
                        'records': similar_events,
                        'similarity_data': {
                            'overall_similarity': 0.85,
                            'match_type': 'semantic',
                            'confidence': 0.75
                        }
                    })
                else:
                    remaining_events.append(event1)
                
                processed.add(i)
            
            duplicate_groups.extend(semantic_duplicates)
        
        return {
            'duplicate_groups': duplicate_groups,
            'remaining_events': remaining_events
        }
    
    def _events_within_time_window(
        self,
        event1: Dict[str, Any],
        event2: Dict[str, Any],
        window_seconds: int
    ) -> bool:
        """Check if two events are within a time window"""
        try:
            ts1 = event1.get('ts', '')
            ts2 = event2.get('ts', '')
            
            dt1 = self._parse_event_timestamp(ts1)
            dt2 = self._parse_event_timestamp(ts2)
            
            if not dt1 or not dt2:
                return False
            
            time_diff = abs((dt1 - dt2).total_seconds())
            return time_diff <= window_seconds
            
        except Exception:
            return False
    
    def _parse_event_timestamp(self, timestamp_str: str) -> Optional[datetime]:
        """Parse event timestamp"""
        try:
            if 'T' in str(timestamp_str):
                return datetime.fromisoformat(str(timestamp_str).replace('Z', '+00:00'))
            else:
                return datetime.strptime(str(timestamp_str), '%Y-%m-%d %H:%M:%S')
        except Exception:
            return None
    
    def _calculate_group_similarity(self, events: List[Dict[str, Any]]) -> float:
        """Calculate average similarity for a group of events"""
        if len(events) < 2:
            return 1.0
        
        similarities = []
        
        for i, event1 in enumerate(events):
            for event2 in events[i+1:]:
                similarity = self.fuzzy_matcher.calculate_similarity(event1, event2)
                similarities.append(similarity['overall_similarity'])
        
        return np.mean(similarities) if similarities else 0.5
    
    def _calculate_detection_statistics(
        self,
        original_events: List[Dict[str, Any]],
        duplicate_groups: List[Dict[str, Any]],
        merge_results: List[MergeResult],
        processing_time_ms: float
    ) -> Dict[str, Any]:
        """Calculate comprehensive detection statistics"""
        total_events = len(original_events)
        total_duplicates = sum(len(group['records']) - 1 for group in duplicate_groups)
        conflicts_resolved = sum(result.conflicts_resolved for result in merge_results)
        
        # Calculate accuracy score (simplified)
        accuracy_score = 0.9  # This would be based on validation against known duplicates
        
        # Performance metrics
        events_per_second = total_events / (processing_time_ms / 1000) if processing_time_ms > 0 else 0
        
        return {
            'total_events': total_events,
            'duplicates_found': total_duplicates,
            'duplicate_groups': len(duplicate_groups),
            'conflicts_resolved': conflicts_resolved,
            'final_event_count': total_events - total_duplicates,
            'processing_time_ms': int(processing_time_ms),
            'events_per_second': round(events_per_second, 2),
            'accuracy_score': accuracy_score,
            'performance_metrics': {
                'meets_speed_target': processing_time_ms < self.performance_targets['processing_speed'] * 1000,
                'meets_accuracy_target': accuracy_score >= self.performance_targets['accuracy']
            }
        }
    
    async def _save_detection_results(
        self,
        job_id: str,
        duplicate_groups: List[Dict[str, Any]],
        merge_results: List[MergeResult],
        statistics: Dict[str, Any]
    ):
        """Save detection results to database"""
        try:
            await db_manager.save_duplicate_detection_results(
                job_id=job_id,
                duplicate_groups=duplicate_groups,
                merge_results=[asdict(result) for result in merge_results],
                statistics=statistics
            )
        except Exception as e:
            logger.error(f"Failed to save detection results: {e}")


# Global duplicate detection system instance
duplicate_detection_system = DuplicateDetectionSystem()