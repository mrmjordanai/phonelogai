"""
Advanced deduplication utilities for phone log data

This module provides comprehensive deduplication strategies:
- Composite key deduplication for events
- Fuzzy matching for similar records
- Contact merging and consolidation
- Conflict resolution strategies
- Performance-optimized batch processing
"""
import hashlib
from typing import Dict, List, Optional, Any, Tuple, Set
from datetime import datetime, timedelta
import structlog
from collections import defaultdict

from ..config import settings

logger = structlog.get_logger(__name__)


class DeduplicationEngine:
    """Advanced deduplication engine for phone log data"""
    
    def __init__(self):
        self.chunk_size = settings.chunk_size
        
        # Deduplication strategies
        self.strategies = {
            'exact_match': self._exact_match_strategy,
            'fuzzy_time': self._fuzzy_time_strategy,
            'content_similarity': self._content_similarity_strategy,
        }
        
        # Conflict resolution rules
        self.conflict_resolution = {
            'duration': 'keep_longest',  # Keep the longest duration
            'content': 'keep_non_empty', # Keep non-empty content
            'metadata': 'merge',         # Merge metadata objects
            'timestamps': 'keep_earliest', # Keep earliest timestamp for created_at
        }
    
    def deduplicate_events(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        strategy: str = 'exact_match',
        time_tolerance_seconds: int = 300  # 5 minutes
    ) -> Dict[str, Any]:
        """
        Deduplicate events using specified strategy
        
        Args:
            events: List of event records
            user_id: User ID for scoped deduplication
            strategy: Deduplication strategy to use
            time_tolerance_seconds: Time tolerance for fuzzy matching
            
        Returns:
            Dict containing deduplicated events and statistics
        """
        try:
            logger.info("Starting event deduplication", 
                       total_events=len(events),
                       user_id=user_id,
                       strategy=strategy)
            
            if not events:
                return {
                    'deduplicated_events': [],
                    'duplicate_count': 0,
                    'conflicts_resolved': 0,
                    'processing_time_ms': 0,
                    'quality_score': 1.0
                }
            
            start_time = datetime.now()
            
            # Apply selected deduplication strategy
            if strategy in self.strategies:
                result = self.strategies[strategy](events, user_id, time_tolerance_seconds)
            else:
                logger.warning(f"Unknown strategy {strategy}, falling back to exact_match")
                result = self._exact_match_strategy(events, user_id, time_tolerance_seconds)
            
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            result['processing_time_ms'] = int(processing_time)
            
            # Calculate quality score
            result['quality_score'] = self._calculate_dedup_quality_score(
                len(events), len(result['deduplicated_events']), result['duplicate_count']
            )
            
            logger.info("Event deduplication completed",
                       original_count=len(events),
                       deduplicated_count=len(result['deduplicated_events']),
                       duplicates_removed=result['duplicate_count'],
                       processing_time_ms=result['processing_time_ms'])
            
            return result
            
        except Exception as e:
            logger.error("Event deduplication failed", error=str(e))
            return {
                'deduplicated_events': events,  # Return original on failure
                'duplicate_count': 0,
                'conflicts_resolved': 0,
                'processing_time_ms': 0,
                'quality_score': 0.5,
                'error': str(e)
            }
    
    def deduplicate_contacts(
        self,
        contacts: List[Dict[str, Any]],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Deduplicate and merge contact records
        
        Args:
            contacts: List of contact records
            user_id: User ID for scoped deduplication
            
        Returns:
            Dict containing deduplicated contacts and merge statistics
        """
        try:
            logger.info("Starting contact deduplication", 
                       total_contacts=len(contacts),
                       user_id=user_id)
            
            if not contacts:
                return {
                    'deduplicated_contacts': [],
                    'merged_count': 0,
                    'processing_time_ms': 0,
                    'quality_score': 1.0
                }
            
            start_time = datetime.now()
            
            # Group contacts by normalized phone number
            contact_groups = defaultdict(list)
            
            for contact in contacts:
                phone = contact.get('number')
                if phone:
                    # Use normalized phone number as key
                    normalized_phone = self._normalize_phone_key(phone)
                    contact_groups[normalized_phone].append(contact)
            
            # Merge contacts in each group
            deduplicated_contacts = []
            merged_count = 0
            
            for phone, contact_list in contact_groups.items():
                if len(contact_list) == 1:
                    # No duplicates for this phone number
                    deduplicated_contacts.append(contact_list[0])
                else:
                    # Merge multiple contacts for same phone number
                    merged_contact = self._merge_contacts(contact_list)
                    deduplicated_contacts.append(merged_contact)
                    merged_count += len(contact_list) - 1
            
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            
            logger.info("Contact deduplication completed",
                       original_count=len(contacts),
                       deduplicated_count=len(deduplicated_contacts),
                       merged_count=merged_count,
                       processing_time_ms=int(processing_time))
            
            return {
                'deduplicated_contacts': deduplicated_contacts,
                'merged_count': merged_count,
                'processing_time_ms': int(processing_time),
                'quality_score': self._calculate_dedup_quality_score(
                    len(contacts), len(deduplicated_contacts), merged_count
                )
            }
            
        except Exception as e:
            logger.error("Contact deduplication failed", error=str(e))
            return {
                'deduplicated_contacts': contacts,  # Return original on failure
                'merged_count': 0,
                'processing_time_ms': 0,
                'quality_score': 0.5,
                'error': str(e)
            }
    
    def _exact_match_strategy(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        time_tolerance_seconds: int
    ) -> Dict[str, Any]:
        """Exact match deduplication using composite key"""
        seen_keys = set()
        deduplicated_events = []
        duplicate_count = 0
        conflicts_resolved = 0
        
        for event in events:
            # Create composite key (user_id, number, timestamp, type, direction)
            composite_key = self._create_composite_key(event, user_id)
            
            if composite_key not in seen_keys:
                seen_keys.add(composite_key)
                deduplicated_events.append(event)
            else:
                duplicate_count += 1
        
        return {
            'deduplicated_events': deduplicated_events,
            'duplicate_count': duplicate_count,
            'conflicts_resolved': conflicts_resolved
        }
    
    def _fuzzy_time_strategy(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        time_tolerance_seconds: int
    ) -> Dict[str, Any]:
        """Fuzzy time matching for near-duplicate events"""
        # Group events by phone number and type for processing
        event_groups = defaultdict(list)
        
        for event in events:
            key = (
                user_id,
                event.get('number', ''),
                event.get('type', ''),
                event.get('direction', '')
            )
            event_groups[key].append(event)
        
        deduplicated_events = []
        duplicate_count = 0
        conflicts_resolved = 0
        
        # Process each group independently
        for group_key, group_events in event_groups.items():
            # Sort by timestamp
            sorted_events = sorted(
                group_events, 
                key=lambda x: self._parse_timestamp(x.get('ts', ''))
            )
            
            group_deduped = []
            used_indices = set()
            
            for i, event in enumerate(sorted_events):
                if i in used_indices:
                    continue
                
                # Find similar events within time tolerance
                similar_events = [event]
                event_time = self._parse_timestamp(event.get('ts', ''))
                
                for j, other_event in enumerate(sorted_events[i+1:], i+1):
                    if j in used_indices:
                        continue
                    
                    other_time = self._parse_timestamp(other_event.get('ts', ''))
                    time_diff = abs((event_time - other_time).total_seconds())
                    
                    if time_diff <= time_tolerance_seconds:
                        similar_events.append(other_event)
                        used_indices.add(j)
                
                # Merge similar events
                if len(similar_events) > 1:
                    merged_event = self._merge_similar_events(similar_events)
                    group_deduped.append(merged_event)
                    duplicate_count += len(similar_events) - 1
                    conflicts_resolved += 1
                else:
                    group_deduped.append(event)
                
                used_indices.add(i)
            
            deduplicated_events.extend(group_deduped)
        
        return {
            'deduplicated_events': deduplicated_events,
            'duplicate_count': duplicate_count,
            'conflicts_resolved': conflicts_resolved
        }
    
    def _content_similarity_strategy(
        self,
        events: List[Dict[str, Any]],
        user_id: str,
        time_tolerance_seconds: int
    ) -> Dict[str, Any]:
        """Content-based similarity matching"""
        # First apply fuzzy time strategy
        fuzzy_result = self._fuzzy_time_strategy(events, user_id, time_tolerance_seconds)
        
        # Then apply content similarity within remaining events
        events_to_check = fuzzy_result['deduplicated_events']
        
        # Group by content hash for quick comparison
        content_groups = defaultdict(list)
        
        for event in events_to_check:
            content_hash = self._calculate_content_hash(event)
            content_groups[content_hash].append(event)
        
        final_events = []
        additional_duplicates = 0
        
        for content_hash, content_events in content_groups.items():
            if len(content_events) == 1:
                final_events.append(content_events[0])
            else:
                # Merge events with same content
                merged_event = self._merge_similar_events(content_events)
                final_events.append(merged_event)
                additional_duplicates += len(content_events) - 1
        
        return {
            'deduplicated_events': final_events,
            'duplicate_count': fuzzy_result['duplicate_count'] + additional_duplicates,
            'conflicts_resolved': fuzzy_result['conflicts_resolved'] + (additional_duplicates > 0)
        }
    
    def _create_composite_key(self, event: Dict[str, Any], user_id: str) -> str:
        """Create composite key for exact matching"""
        components = [
            str(user_id),
            str(event.get('number', '')),
            str(event.get('ts', '')),
            str(event.get('type', '')),
            str(event.get('direction', ''))
        ]
        
        # Create hash of combined components
        key_string = '|'.join(components)
        return hashlib.sha256(key_string.encode()).hexdigest()
    
    def _normalize_phone_key(self, phone: str) -> str:
        """Normalize phone number for grouping"""
        import re
        
        # Remove all non-digit characters except +
        cleaned = re.sub(r'[^\d+]', '', phone)
        
        # Normalize to +1XXXXXXXXXX format for US numbers
        if cleaned.startswith('1') and len(cleaned) == 11:
            return '+' + cleaned
        elif len(cleaned) == 10:
            return '+1' + cleaned
        elif cleaned.startswith('+1') and len(cleaned) == 12:
            return cleaned
        else:
            return phone  # Return original if can't normalize
    
    def _merge_contacts(self, contacts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Merge multiple contact records into one"""
        if len(contacts) == 1:
            return contacts[0]
        
        # Start with the first contact as base
        merged = contacts[0].copy()
        
        # Merge data from other contacts
        for contact in contacts[1:]:
            # Merge display names (prefer non-empty, longer names)
            if not merged.get('display_name') and contact.get('display_name'):
                merged['display_name'] = contact['display_name']
            elif (contact.get('display_name') and 
                  len(str(contact['display_name'])) > len(str(merged.get('display_name', '')))):
                merged['display_name'] = contact['display_name']
            
            # Merge date ranges
            if contact.get('first_seen'):
                if not merged.get('first_seen') or contact['first_seen'] < merged['first_seen']:
                    merged['first_seen'] = contact['first_seen']
            
            if contact.get('last_seen'):
                if not merged.get('last_seen') or contact['last_seen'] > merged['last_seen']:
                    merged['last_seen'] = contact['last_seen']
            
            # Sum counters
            merged['total_calls'] = merged.get('total_calls', 0) + contact.get('total_calls', 0)
            merged['total_sms'] = merged.get('total_sms', 0) + contact.get('total_sms', 0)
            
            # Merge tags
            merged_tags = set(merged.get('tags', []))
            merged_tags.update(contact.get('tags', []))
            merged['tags'] = list(merged_tags)
            
            # Merge metadata
            if 'metadata' not in merged:
                merged['metadata'] = {}
            if contact.get('metadata'):
                merged['metadata'].update(contact['metadata'])
        
        # Add merge information to metadata
        merged['metadata']['merged_from'] = len(contacts)
        merged['metadata']['merge_timestamp'] = datetime.now().isoformat()
        merged['updated_at'] = datetime.now().isoformat()
        
        return merged
    
    def _merge_similar_events(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Merge similar events using conflict resolution rules"""
        if len(events) == 1:
            return events[0]
        
        # Start with the first event as base
        merged = events[0].copy()
        
        # Apply conflict resolution rules
        for event in events[1:]:
            # Duration: keep longest
            if event.get('duration'):
                if not merged.get('duration') or event['duration'] > merged.get('duration', 0):
                    merged['duration'] = event['duration']
            
            # Content: keep non-empty, prefer longer content
            if event.get('content'):
                if not merged.get('content'):
                    merged['content'] = event['content']
                elif len(str(event['content'])) > len(str(merged.get('content', ''))):
                    merged['content'] = event['content']
            
            # Metadata: merge
            if 'metadata' not in merged:
                merged['metadata'] = {}
            if event.get('metadata'):
                merged['metadata'].update(event['metadata'])
            
            # Timestamps: keep earliest created_at, latest updated_at
            if event.get('created_at'):
                if not merged.get('created_at') or event['created_at'] < merged.get('created_at', ''):
                    merged['created_at'] = event['created_at']
            
            if event.get('updated_at'):
                if not merged.get('updated_at') or event['updated_at'] > merged.get('updated_at', ''):
                    merged['updated_at'] = event['updated_at']
        
        # Add merge information
        if 'metadata' not in merged:
            merged['metadata'] = {}
        
        merged['metadata']['merged_from'] = len(events)
        merged['metadata']['merge_timestamp'] = datetime.now().isoformat()
        merged['updated_at'] = datetime.now().isoformat()
        
        return merged
    
    def _parse_timestamp(self, timestamp_str: str) -> datetime:
        """Parse timestamp string to datetime object"""
        try:
            # Handle ISO format
            if 'T' in timestamp_str:
                return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            else:
                # Try common formats
                formats = [
                    '%Y-%m-%d %H:%M:%S',
                    '%m/%d/%Y %H:%M:%S',
                    '%Y-%m-%d',
                    '%m/%d/%Y'
                ]
                
                for fmt in formats:
                    try:
                        return datetime.strptime(timestamp_str, fmt)
                    except ValueError:
                        continue
            
            # Fallback: return epoch
            return datetime(1970, 1, 1)
            
        except Exception:
            return datetime(1970, 1, 1)
    
    def _calculate_content_hash(self, event: Dict[str, Any]) -> str:
        """Calculate content hash for similarity comparison"""
        # Include key fields that indicate content similarity
        content_fields = [
            str(event.get('number', '')),
            str(event.get('type', '')),
            str(event.get('direction', '')),
            str(event.get('content', ''))[:100],  # First 100 chars of content
            str(event.get('duration', '') or 0)
        ]
        
        content_string = '|'.join(content_fields)
        return hashlib.md5(content_string.encode()).hexdigest()
    
    def _calculate_dedup_quality_score(
        self,
        original_count: int,
        final_count: int,
        duplicates_removed: int
    ) -> float:
        """Calculate deduplication quality score"""
        if original_count == 0:
            return 1.0
        
        # Base score from deduplication efficiency
        dedup_efficiency = duplicates_removed / original_count if original_count > 0 else 0
        
        # Penalty if too many records were removed (might indicate over-aggressive deduplication)
        over_dedup_penalty = 0
        removal_rate = duplicates_removed / original_count if original_count > 0 else 0
        
        if removal_rate > 0.5:  # More than 50% removed is suspicious
            over_dedup_penalty = (removal_rate - 0.5) * 0.4
        
        # Quality score balances efficiency with accuracy
        quality_score = min(1.0, max(0.0, 0.8 + dedup_efficiency * 0.3 - over_dedup_penalty))
        
        return quality_score


# Global deduplication engine instance
deduplication_engine = DeduplicationEngine()