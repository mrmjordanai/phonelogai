"""
Data validation and normalization utilities

This module provides comprehensive validation and normalization functions for:
- Phone number standardization and validation
- Date/time parsing and normalization  
- Data type validation and conversion
- Business rule validation
- Data quality scoring
"""
import re
import uuid
from typing import Dict, List, Optional, Any, Tuple, Union
from datetime import datetime, timezone
import structlog
import phonenumbers
from phonenumbers import NumberParseException

from ..config import settings

logger = structlog.get_logger(__name__)


class DataValidator:
    """Comprehensive data validator for phone log events and contacts"""
    
    def __init__(self):
        self.phone_parser = phonenumbers
        
        # Validation rules
        self.validation_rules = {
            'phone_number': {
                'required': True,
                'min_length': 10,
                'max_length': 15,
                'patterns': [
                    r'^\+?1?[0-9]{10,11}$',  # US format
                    r'^\+[0-9]{10,15}$',     # International format
                ]
            },
            'timestamp': {
                'required': True,
                'min_year': 1990,
                'max_year': 2050,
                'formats': [
                    '%Y-%m-%d %H:%M:%S',
                    '%Y-%m-%dT%H:%M:%S',
                    '%Y-%m-%dT%H:%M:%S.%f',
                    '%Y-%m-%dT%H:%M:%SZ',
                    '%m/%d/%Y %H:%M:%S',
                    '%m/%d/%Y %H:%M',
                    '%Y-%m-%d',
                    '%m/%d/%Y',
                ]
            },
            'event_type': {
                'required': True,
                'allowed_values': ['call', 'sms', 'text', 'message', 'voicemail', 'video', 'data']
            },
            'direction': {
                'required': True,
                'allowed_values': ['inbound', 'outbound', 'incoming', 'outgoing', 'in', 'out']
            },
            'duration': {
                'required': False,
                'min_value': 0,
                'max_value': 86400,  # 24 hours in seconds
            }
        }
    
    def validate_event(self, event: Dict[str, Any]) -> Tuple[bool, List[str], Dict[str, Any]]:
        """
        Validate and normalize a single event record
        
        Returns:
            Tuple of (is_valid, errors, normalized_event)
        """
        errors = []
        normalized_event = event.copy()
        
        try:
            # Ensure required fields exist
            if not event.get('user_id'):
                normalized_event['user_id'] = None  # Will be set by caller
            
            if not event.get('id'):
                normalized_event['id'] = str(uuid.uuid4())
            
            # Validate and normalize phone number
            phone_result = self._validate_phone_number(event.get('number'))
            if phone_result['valid']:
                normalized_event['number'] = phone_result['normalized']
            else:
                errors.extend(phone_result['errors'])
            
            # Validate and normalize timestamp
            ts_result = self._validate_timestamp(event.get('ts'))
            if ts_result['valid']:
                normalized_event['ts'] = ts_result['normalized']
            else:
                errors.extend(ts_result['errors'])
            
            # Validate and normalize event type
            type_result = self._validate_event_type(event.get('type'))
            if type_result['valid']:
                normalized_event['type'] = type_result['normalized']
            else:
                errors.extend(type_result['errors'])
            
            # Validate and normalize direction
            direction_result = self._validate_direction(event.get('direction'))
            if direction_result['valid']:
                normalized_event['direction'] = direction_result['normalized']
            else:
                errors.extend(direction_result['errors'])
            
            # Validate and normalize duration (optional)
            if 'duration' in event:
                duration_result = self._validate_duration(event.get('duration'))
                if duration_result['valid']:
                    normalized_event['duration'] = duration_result['normalized']
                else:
                    errors.extend(duration_result['errors'])
            
            # Validate and normalize content (optional)
            if 'content' in event:
                content_result = self._validate_content(event.get('content'))
                if content_result['valid']:
                    normalized_event['content'] = content_result['normalized']
                else:
                    errors.extend(content_result['errors'])
            
            # Add metadata
            if 'metadata' not in normalized_event:
                normalized_event['metadata'] = {}
            
            normalized_event['metadata'].update({
                'validation_timestamp': datetime.now(timezone.utc).isoformat(),
                'validation_version': '1.0',
                'normalized': True
            })
            
            # Add audit timestamps
            now = datetime.now(timezone.utc).isoformat()
            if 'created_at' not in normalized_event:
                normalized_event['created_at'] = now
            normalized_event['updated_at'] = now
            
            is_valid = len(errors) == 0
            
            return is_valid, errors, normalized_event
            
        except Exception as e:
            logger.error("Event validation failed", event_id=event.get('id'), error=str(e))
            errors.append(f"Validation error: {str(e)}")
            return False, errors, normalized_event
    
    def validate_contact(self, contact: Dict[str, Any]) -> Tuple[bool, List[str], Dict[str, Any]]:
        """
        Validate and normalize a contact record
        
        Returns:
            Tuple of (is_valid, errors, normalized_contact)
        """
        errors = []
        normalized_contact = contact.copy()
        
        try:
            # Ensure required fields exist
            if not contact.get('user_id'):
                normalized_contact['user_id'] = None  # Will be set by caller
            
            if not contact.get('id'):
                normalized_contact['id'] = str(uuid.uuid4())
            
            # Validate and normalize phone number
            phone_result = self._validate_phone_number(contact.get('number'))
            if phone_result['valid']:
                normalized_contact['number'] = phone_result['normalized']
            else:
                errors.extend(phone_result['errors'])
            
            # Validate display name (optional)
            if 'display_name' in contact:
                name_result = self._validate_display_name(contact.get('display_name'))
                if name_result['valid']:
                    normalized_contact['display_name'] = name_result['normalized']
                else:
                    errors.extend(name_result['errors'])
            
            # Validate timestamps (optional)
            for ts_field in ['first_seen', 'last_seen']:
                if ts_field in contact:
                    ts_result = self._validate_timestamp(contact.get(ts_field))
                    if ts_result['valid']:
                        normalized_contact[ts_field] = ts_result['normalized']
                    else:
                        errors.append(f"Invalid {ts_field}: {ts_result['errors'][0] if ts_result['errors'] else 'Unknown error'}")
            
            # Validate counts (optional)
            for count_field in ['total_calls', 'total_sms']:
                if count_field in contact:
                    count_result = self._validate_count(contact.get(count_field))
                    if count_result['valid']:
                        normalized_contact[count_field] = count_result['normalized']
                    else:
                        normalized_contact[count_field] = 0  # Default to 0
            
            # Validate tags (optional)
            if 'tags' in contact:
                tags_result = self._validate_tags(contact.get('tags'))
                if tags_result['valid']:
                    normalized_contact['tags'] = tags_result['normalized']
                else:
                    normalized_contact['tags'] = []  # Default to empty array
            
            # Add metadata
            if 'metadata' not in normalized_contact:
                normalized_contact['metadata'] = {}
            
            normalized_contact['metadata'].update({
                'validation_timestamp': datetime.now(timezone.utc).isoformat(),
                'validation_version': '1.0',
                'normalized': True
            })
            
            # Add audit timestamps
            now = datetime.now(timezone.utc).isoformat()
            if 'created_at' not in normalized_contact:
                normalized_contact['created_at'] = now
            normalized_contact['updated_at'] = now
            
            is_valid = len(errors) == 0
            
            return is_valid, errors, normalized_contact
            
        except Exception as e:
            logger.error("Contact validation failed", contact_id=contact.get('id'), error=str(e))
            errors.append(f"Validation error: {str(e)}")
            return False, errors, normalized_contact
    
    def _validate_phone_number(self, phone: Any) -> Dict[str, Any]:
        """Validate and normalize phone number"""
        if not phone:
            return {
                'valid': False,
                'errors': ['Phone number is required'],
                'normalized': None
            }
        
        try:
            phone_str = str(phone).strip()
            
            # Remove common formatting characters
            cleaned = re.sub(r'[^\d+]', '', phone_str)
            
            # Basic length check
            if len(cleaned) < 10:
                return {
                    'valid': False,
                    'errors': ['Phone number too short'],
                    'normalized': None
                }
            
            # Try to parse with phonenumbers library for better validation
            try:
                # Default to US if no country code
                parsed = phonenumbers.parse(phone_str, "US")
                
                if phonenumbers.is_valid_number(parsed):
                    # Format to E.164 standard
                    normalized = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
                    
                    return {
                        'valid': True,
                        'errors': [],
                        'normalized': normalized
                    }
                
            except NumberParseException:
                # Fallback to basic US number handling
                pass
            
            # Fallback normalization for US numbers
            if cleaned.startswith('1') and len(cleaned) == 11:
                normalized = '+' + cleaned
            elif len(cleaned) == 10:
                normalized = '+1' + cleaned
            elif cleaned.startswith('+1') and len(cleaned) == 12:
                normalized = cleaned
            else:
                return {
                    'valid': False,
                    'errors': ['Invalid phone number format'],
                    'normalized': None
                }
            
            return {
                'valid': True,
                'errors': [],
                'normalized': normalized
            }
            
        except Exception as e:
            return {
                'valid': False,
                'errors': [f'Phone number validation error: {str(e)}'],
                'normalized': None
            }
    
    def _validate_timestamp(self, timestamp: Any) -> Dict[str, Any]:
        """Validate and normalize timestamp"""
        if not timestamp:
            return {
                'valid': False,
                'errors': ['Timestamp is required'],
                'normalized': None
            }
        
        try:
            ts_str = str(timestamp).strip()
            
            # Try to parse with various formats
            for fmt in self.validation_rules['timestamp']['formats']:
                try:
                    dt = datetime.strptime(ts_str, fmt)
                    
                    # Add timezone if not present
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    
                    # Validate year range
                    min_year = self.validation_rules['timestamp']['min_year']
                    max_year = self.validation_rules['timestamp']['max_year']
                    
                    if not (min_year <= dt.year <= max_year):
                        return {
                            'valid': False,
                            'errors': [f'Year {dt.year} outside valid range {min_year}-{max_year}'],
                            'normalized': None
                        }
                    
                    # Normalize to ISO format
                    normalized = dt.isoformat()
                    
                    return {
                        'valid': True,
                        'errors': [],
                        'normalized': normalized
                    }
                    
                except ValueError:
                    continue
            
            # If all formats failed, try ISO parsing
            try:
                dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                
                return {
                    'valid': True,
                    'errors': [],
                    'normalized': dt.isoformat()
                }
                
            except ValueError:
                pass
            
            return {
                'valid': False,
                'errors': ['Invalid timestamp format'],
                'normalized': None
            }
            
        except Exception as e:
            return {
                'valid': False,
                'errors': [f'Timestamp validation error: {str(e)}'],
                'normalized': None
            }
    
    def _validate_event_type(self, event_type: Any) -> Dict[str, Any]:
        """Validate and normalize event type"""
        if not event_type:
            return {
                'valid': False,
                'errors': ['Event type is required'],
                'normalized': None
            }
        
        try:
            type_str = str(event_type).lower().strip()
            
            # Normalize common variations
            type_mapping = {
                'call': 'call',
                'calls': 'call',
                'voice': 'call',
                'phone': 'call',
                'sms': 'sms',
                'text': 'sms',
                'message': 'sms',
                'txt': 'sms',
                'mms': 'sms',
                'voicemail': 'voicemail',
                'vm': 'voicemail',
                'video': 'video',
                'videocall': 'video',
                'data': 'data',
            }
            
            if type_str in type_mapping:
                normalized = type_mapping[type_str]
                
                return {
                    'valid': True,
                    'errors': [],
                    'normalized': normalized
                }
            
            return {
                'valid': False,
                'errors': [f'Unknown event type: {event_type}'],
                'normalized': None
            }
            
        except Exception as e:
            return {
                'valid': False,
                'errors': [f'Event type validation error: {str(e)}'],
                'normalized': None
            }
    
    def _validate_direction(self, direction: Any) -> Dict[str, Any]:
        """Validate and normalize direction"""
        if not direction:
            return {
                'valid': False,
                'errors': ['Direction is required'],
                'normalized': None
            }
        
        try:
            dir_str = str(direction).lower().strip()
            
            # Normalize common variations
            direction_mapping = {
                'inbound': 'inbound',
                'incoming': 'inbound',
                'in': 'inbound',
                'i': 'inbound',
                'received': 'inbound',
                'outbound': 'outbound',
                'outgoing': 'outbound',
                'out': 'outbound',
                'o': 'outbound',
                'sent': 'outbound',
                'dialed': 'outbound',
                'called': 'outbound',
            }
            
            if dir_str in direction_mapping:
                normalized = direction_mapping[dir_str]
                
                return {
                    'valid': True,
                    'errors': [],
                    'normalized': normalized
                }
            
            return {
                'valid': False,
                'errors': [f'Unknown direction: {direction}'],
                'normalized': None
            }
            
        except Exception as e:
            return {
                'valid': False,
                'errors': [f'Direction validation error: {str(e)}'],
                'normalized': None
            }
    
    def _validate_duration(self, duration: Any) -> Dict[str, Any]:
        """Validate and normalize duration (in seconds)"""
        if duration is None:
            return {
                'valid': True,
                'errors': [],
                'normalized': None
            }
        
        try:
            # Handle string durations (HH:MM:SS, MM:SS, seconds)
            if isinstance(duration, str):
                duration_str = duration.strip()
                
                # Parse HH:MM:SS or MM:SS format
                if ':' in duration_str:
                    parts = duration_str.split(':')
                    
                    if len(parts) == 2:  # MM:SS
                        minutes, seconds = map(int, parts)
                        total_seconds = minutes * 60 + seconds
                    elif len(parts) == 3:  # HH:MM:SS
                        hours, minutes, seconds = map(int, parts)
                        total_seconds = hours * 3600 + minutes * 60 + seconds
                    else:
                        return {
                            'valid': False,
                            'errors': ['Invalid duration format'],
                            'normalized': None
                        }
                else:
                    # Parse as seconds
                    total_seconds = int(float(duration_str))
            else:
                # Numeric duration
                total_seconds = int(float(duration))
            
            # Validate range
            min_val = self.validation_rules['duration']['min_value']
            max_val = self.validation_rules['duration']['max_value']
            
            if not (min_val <= total_seconds <= max_val):
                return {
                    'valid': False,
                    'errors': [f'Duration {total_seconds}s outside valid range {min_val}-{max_val}s'],
                    'normalized': None
                }
            
            return {
                'valid': True,
                'errors': [],
                'normalized': total_seconds
            }
            
        except (ValueError, TypeError) as e:
            return {
                'valid': False,
                'errors': [f'Invalid duration value: {str(e)}'],
                'normalized': None
            }
    
    def _validate_content(self, content: Any) -> Dict[str, Any]:
        """Validate and normalize content"""
        if content is None:
            return {
                'valid': True,
                'errors': [],
                'normalized': None
            }
        
        try:
            content_str = str(content).strip()
            
            # Check for maximum length
            max_length = 10000  # 10KB limit for content
            if len(content_str) > max_length:
                content_str = content_str[:max_length] + '...'
            
            # Basic sanitization (remove null bytes, control characters)
            sanitized = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', content_str)
            
            return {
                'valid': True,
                'errors': [],
                'normalized': sanitized if sanitized else None
            }
            
        except Exception as e:
            return {
                'valid': False,
                'errors': [f'Content validation error: {str(e)}'],
                'normalized': None
            }
    
    def _validate_display_name(self, name: Any) -> Dict[str, Any]:
        """Validate and normalize display name"""
        if name is None:
            return {
                'valid': True,
                'errors': [],
                'normalized': None
            }
        
        try:
            name_str = str(name).strip()
            
            # Check length
            if len(name_str) > 255:
                return {
                    'valid': False,
                    'errors': ['Display name too long (max 255 characters)'],
                    'normalized': None
                }
            
            # Basic sanitization
            sanitized = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', name_str)
            
            return {
                'valid': True,
                'errors': [],
                'normalized': sanitized if sanitized else None
            }
            
        except Exception as e:
            return {
                'valid': False,
                'errors': [f'Display name validation error: {str(e)}'],
                'normalized': None
            }
    
    def _validate_count(self, count: Any) -> Dict[str, Any]:
        """Validate count fields"""
        if count is None:
            return {
                'valid': True,
                'errors': [],
                'normalized': 0
            }
        
        try:
            count_int = int(float(count))
            
            if count_int < 0:
                return {
                    'valid': False,
                    'errors': ['Count cannot be negative'],
                    'normalized': None
                }
            
            return {
                'valid': True,
                'errors': [],
                'normalized': count_int
            }
            
        except (ValueError, TypeError):
            return {
                'valid': False,
                'errors': ['Invalid count value'],
                'normalized': None
            }
    
    def _validate_tags(self, tags: Any) -> Dict[str, Any]:
        """Validate tags array"""
        if tags is None:
            return {
                'valid': True,
                'errors': [],
                'normalized': []
            }
        
        try:
            if isinstance(tags, str):
                # Parse comma-separated string
                tag_list = [tag.strip() for tag in tags.split(',') if tag.strip()]
            elif isinstance(tags, list):
                tag_list = [str(tag).strip() for tag in tags if str(tag).strip()]
            else:
                return {
                    'valid': False,
                    'errors': ['Tags must be an array or comma-separated string'],
                    'normalized': None
                }
            
            # Remove duplicates and validate length
            unique_tags = list(set(tag_list))
            
            if len(unique_tags) > 20:
                return {
                    'valid': False,
                    'errors': ['Too many tags (max 20)'],
                    'normalized': None
                }
            
            # Validate individual tags
            validated_tags = []
            for tag in unique_tags:
                if len(tag) <= 50 and re.match(r'^[a-zA-Z0-9_-]+$', tag):
                    validated_tags.append(tag.lower())
            
            return {
                'valid': True,
                'errors': [],
                'normalized': validated_tags
            }
            
        except Exception as e:
            return {
                'valid': False,
                'errors': [f'Tags validation error: {str(e)}'],
                'normalized': None
            }
    
    def calculate_quality_score(
        self,
        total_records: int,
        valid_records: int,
        validation_errors: int,
        critical_errors: int
    ) -> float:
        """Calculate data quality score (0-1)"""
        if total_records == 0:
            return 0.0
        
        # Base score from validation success rate
        validation_score = valid_records / total_records if total_records > 0 else 0
        
        # Penalty for errors
        error_penalty = min(0.5, (validation_errors / total_records) * 2) if total_records > 0 else 0
        critical_penalty = min(0.3, (critical_errors / total_records) * 5) if total_records > 0 else 0
        
        # Final score
        quality_score = validation_score - error_penalty - critical_penalty
        
        return max(0.0, min(1.0, quality_score))


# Global validator instance
data_validator = DataValidator()