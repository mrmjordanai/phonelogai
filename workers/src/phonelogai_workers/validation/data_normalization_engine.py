"""
Phase 2: Data Normalization Engine

This module provides comprehensive data normalization capabilities:
- Phone number normalization to E.164 format with carrier detection
- Date/time standardization with timezone handling  
- Duration conversion and validation
- Content sanitization and PII detection
- Type inference and validation
"""
import re
import asyncio
import hashlib
from typing import Dict, List, Tuple, Optional, Any, Union
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict
import structlog
import phonenumbers
from phonenumbers import NumberParseException
import pytz
from email.utils import parsedate_to_datetime

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


@dataclass
class NormalizedPhone:
    """Represents a normalized phone number"""
    original: str
    e164: Optional[str] = None
    national: Optional[str] = None
    international: Optional[str] = None
    carrier: Optional[str] = None
    region: Optional[str] = None
    is_valid: bool = False
    validation_errors: List[str] = None
    
    def __post_init__(self):
        if self.validation_errors is None:
            self.validation_errors = []


@dataclass 
class NormalizedDateTime:
    """Represents a normalized date/time"""
    original: str
    iso_format: Optional[str] = None
    unix_timestamp: Optional[float] = None
    timezone: str = 'UTC'
    date_only: Optional[str] = None
    time_only: Optional[str] = None
    is_valid: bool = False
    validation_errors: List[str] = None
    inferred_format: Optional[str] = None
    
    def __post_init__(self):
        if self.validation_errors is None:
            self.validation_errors = []


@dataclass
class NormalizedDuration:
    """Represents a normalized duration"""
    original: str
    seconds: Optional[int] = None
    minutes: Optional[float] = None
    hours: Optional[float] = None
    formatted: Optional[str] = None  # HH:MM:SS format
    is_valid: bool = False
    validation_errors: List[str] = None
    
    def __post_init__(self):
        if self.validation_errors is None:
            self.validation_errors = []


@dataclass
class NormalizedContent:
    """Represents normalized content"""
    original: str
    sanitized: Optional[str] = None
    has_pii: bool = False
    pii_categories: List[str] = None
    content_type: Optional[str] = None  # 'business', 'personal', 'spam', etc.
    language: Optional[str] = None
    is_valid: bool = False
    validation_errors: List[str] = None
    
    def __post_init__(self):
        if self.pii_categories is None:
            self.pii_categories = []
        if self.validation_errors is None:
            self.validation_errors = []


class PhoneNumberNormalizer:
    """Advanced phone number normalization with carrier detection"""
    
    def __init__(self):
        self.carrier_cache = {}  # Cache for carrier lookups
        self.region_patterns = self._load_region_patterns()
        
        # US carrier patterns for detection
        self.carrier_patterns = {
            'att': [
                r'^(\+?1)?[0-9]{10}$',  # Standard US format
            ],
            'verizon': [
                r'^(\+?1)?[0-9]{10}$',
            ],
            'tmobile': [
                r'^(\+?1)?[0-9]{10}$',
            ],
            'sprint': [
                r'^(\+?1)?[0-9]{10}$',
            ]
        }
        
        # Number prefix to carrier mapping (US specific)
        self.prefix_to_carrier = self._load_prefix_mappings()
    
    def _load_region_patterns(self) -> Dict[str, Dict[str, Any]]:
        """Load region-specific phone number patterns"""
        return {
            'US': {
                'country_code': '1',
                'formats': [
                    r'^(\+?1)?([0-9]{10})$',
                    r'^(\+?1)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$',
                    r'^(\+?1)?([0-9]{3})[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$'
                ],
                'validation_rules': {
                    'min_length': 10,
                    'max_length': 11,
                    'invalid_area_codes': ['000', '555', '800', '888', '877', '866', '855']
                }
            },
            'CA': {
                'country_code': '1',
                'formats': [
                    r'^(\+?1)?([0-9]{10})$',
                    r'^(\+?1)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$'
                ],
                'validation_rules': {
                    'min_length': 10,
                    'max_length': 11
                }
            }
        }
    
    def _load_prefix_mappings(self) -> Dict[str, str]:
        """Load prefix to carrier mappings (simplified)"""
        # In production, this would be loaded from a comprehensive database
        return {
            # AT&T prefixes (examples)
            '404': 'att', '470': 'att', '678': 'att', '770': 'att',
            # Verizon prefixes (examples)  
            '201': 'verizon', '551': 'verizon', '732': 'verizon',
            # T-Mobile prefixes (examples)
            '206': 'tmobile', '253': 'tmobile', '360': 'tmobile',
            # Sprint prefixes (examples)
            '210': 'sprint', '214': 'sprint', '469': 'sprint'
        }
    
    async def normalize_phone_number(
        self,
        phone_input: str,
        default_region: str = 'US',
        job_id: Optional[str] = None
    ) -> NormalizedPhone:
        """Normalize phone number to standard formats"""
        try:
            if not phone_input or not isinstance(phone_input, str):
                return NormalizedPhone(
                    original=str(phone_input) if phone_input else '',
                    is_valid=False,
                    validation_errors=['Empty or invalid phone number input']
                )
            
            original = phone_input.strip()
            
            # Step 1: Clean the phone number
            cleaned = self._clean_phone_number(original)
            if not cleaned:
                return NormalizedPhone(
                    original=original,
                    is_valid=False,
                    validation_errors=['Phone number could not be cleaned']
                )
            
            # Step 2: Parse using phonenumbers library
            try:
                parsed_number = phonenumbers.parse(cleaned, default_region)
                
                if not phonenumbers.is_valid_number(parsed_number):
                    return NormalizedPhone(
                        original=original,
                        is_valid=False,
                        validation_errors=['Phone number failed validation check']
                    )
                
                # Extract formatted versions
                e164 = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.E164)
                national = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.NATIONAL)
                international = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
                
                # Get region info
                region = phonenumbers.region_code_for_number(parsed_number)
                
                # Detect carrier (if US number)
                carrier = None
                if region == 'US':
                    carrier = await self._detect_carrier(e164)
                
                return NormalizedPhone(
                    original=original,
                    e164=e164,
                    national=national,
                    international=international,
                    carrier=carrier,
                    region=region,
                    is_valid=True
                )
                
            except NumberParseException as e:
                # Fallback to manual parsing for non-standard formats
                fallback_result = self._fallback_phone_parsing(cleaned, default_region)
                if fallback_result:
                    return fallback_result
                
                return NormalizedPhone(
                    original=original,
                    is_valid=False,
                    validation_errors=[f'Phone parsing failed: {str(e)}']
                )
                
        except Exception as e:
            logger.error(f"Phone normalization failed: {e}", job_id=job_id)
            return NormalizedPhone(
                original=phone_input,
                is_valid=False,
                validation_errors=[f'Normalization error: {str(e)}']
            )
    
    def _clean_phone_number(self, phone: str) -> str:
        """Clean phone number of formatting characters"""
        # Remove common formatting
        cleaned = re.sub(r'[^\d+]', '', phone)
        
        # Handle special cases
        if cleaned.startswith('011'):  # International prefix
            cleaned = '+' + cleaned[3:]
        elif cleaned.startswith('1') and len(cleaned) == 11:  # US number with country code
            cleaned = '+' + cleaned
        elif len(cleaned) == 10:  # US number without country code
            cleaned = '+1' + cleaned
        elif not cleaned.startswith('+') and len(cleaned) > 10:
            # Try to add + for international
            cleaned = '+' + cleaned
        
        return cleaned
    
    def _fallback_phone_parsing(self, cleaned: str, region: str) -> Optional[NormalizedPhone]:
        """Fallback parsing for non-standard phone formats"""
        try:
            # US-specific fallback
            if region == 'US':
                # Remove + and country code for processing
                digits_only = re.sub(r'[^\d]', '', cleaned)
                
                if digits_only.startswith('1') and len(digits_only) == 11:
                    digits_only = digits_only[1:]
                
                if len(digits_only) == 10:
                    # Validate area code
                    area_code = digits_only[:3]
                    if area_code not in self.region_patterns['US']['validation_rules']['invalid_area_codes']:
                        e164 = f"+1{digits_only}"
                        national = f"({digits_only[:3]}) {digits_only[3:6]}-{digits_only[6:]}"
                        
                        return NormalizedPhone(
                            original=cleaned,
                            e164=e164,
                            national=national,
                            international=f"+1 {national}",
                            region='US',
                            is_valid=True
                        )
            
            return None
            
        except Exception:
            return None
    
    async def _detect_carrier(self, e164_number: str) -> Optional[str]:
        """Detect carrier for US phone numbers"""
        try:
            # Check cache first
            if e164_number in self.carrier_cache:
                return self.carrier_cache[e164_number]
            
            # Extract area code + prefix
            if e164_number.startswith('+1') and len(e164_number) == 12:
                area_code = e164_number[2:5]
                prefix = e164_number[5:8]
                
                # Check prefix mappings
                if area_code in self.prefix_to_carrier:
                    carrier = self.prefix_to_carrier[area_code]
                elif prefix in self.prefix_to_carrier:
                    carrier = self.prefix_to_carrier[prefix]
                else:
                    carrier = 'unknown'
                
                # Cache result
                self.carrier_cache[e164_number] = carrier
                return carrier
            
            return 'unknown'
            
        except Exception as e:
            logger.error(f"Carrier detection failed: {e}")
            return 'unknown'
    
    async def normalize_batch(
        self,
        phone_numbers: List[str],
        default_region: str = 'US',
        job_id: Optional[str] = None
    ) -> List[NormalizedPhone]:
        """Normalize a batch of phone numbers efficiently"""
        results = []
        
        # Process in parallel for better performance
        batch_size = 100
        for i in range(0, len(phone_numbers), batch_size):
            batch = phone_numbers[i:i+batch_size]
            
            # Create tasks for parallel processing
            tasks = [
                self.normalize_phone_number(phone, default_region, job_id)
                for phone in batch
            ]
            
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Handle exceptions
            for result in batch_results:
                if isinstance(result, Exception):
                    results.append(NormalizedPhone(
                        original='',
                        is_valid=False,
                        validation_errors=[f'Batch processing error: {str(result)}']
                    ))
                else:
                    results.append(result)
        
        return results


class DateTimeNormalizer:
    """Advanced date/time normalization with timezone handling"""
    
    def __init__(self):
        # Common date/time formats in order of preference
        self.datetime_formats = [
            # ISO formats
            '%Y-%m-%dT%H:%M:%S.%fZ',
            '%Y-%m-%dT%H:%M:%SZ', 
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S',
            
            # US formats
            '%m/%d/%Y %H:%M:%S',
            '%m/%d/%Y %I:%M:%S %p',
            '%m/%d/%Y %H:%M',
            '%m/%d/%Y %I:%M %p',
            '%m/%d/%Y',
            
            # European formats
            '%d/%m/%Y %H:%M:%S',
            '%d/%m/%Y %H:%M',
            '%d/%m/%Y',
            '%d-%m-%Y %H:%M:%S',
            '%d-%m-%Y %H:%M',
            '%d-%m-%Y',
            
            # Other common formats
            '%Y-%m-%d',
            '%d %b %Y %H:%M:%S',
            '%d %B %Y %H:%M:%S',
            '%b %d, %Y %I:%M %p',
            '%B %d, %Y %I:%M %p',
            '%d %b %Y',
            '%d %B %Y',
            '%b %d, %Y',
            '%B %d, %Y',
            
            # Unix timestamp (as string)
            '%s',  # Special handling for unix timestamps
            
            # Time only formats
            '%H:%M:%S.%f',
            '%H:%M:%S',
            '%I:%M:%S %p',
            '%H:%M',
            '%I:%M %p',
        ]
        
        # Common timezone abbreviations
        self.timezone_mappings = {
            'EST': 'US/Eastern',
            'EDT': 'US/Eastern', 
            'CST': 'US/Central',
            'CDT': 'US/Central',
            'MST': 'US/Mountain',
            'MDT': 'US/Mountain',
            'PST': 'US/Pacific',
            'PDT': 'US/Pacific',
            'UTC': 'UTC',
            'GMT': 'GMT'
        }
    
    async def normalize_datetime(
        self,
        datetime_input: str,
        default_timezone: str = 'UTC',
        prefer_future: bool = False,
        job_id: Optional[str] = None
    ) -> NormalizedDateTime:
        """Normalize date/time to ISO format with timezone"""
        try:
            if not datetime_input or not isinstance(datetime_input, str):
                return NormalizedDateTime(
                    original=str(datetime_input) if datetime_input else '',
                    is_valid=False,
                    validation_errors=['Empty or invalid datetime input']
                )
            
            original = datetime_input.strip()
            
            # Step 1: Handle unix timestamps
            if self._is_unix_timestamp(original):
                return self._parse_unix_timestamp(original)
            
            # Step 2: Extract timezone info if present
            extracted_tz = self._extract_timezone_info(original)
            cleaned_datetime = extracted_tz['cleaned_datetime']
            detected_tz = extracted_tz['timezone'] or default_timezone
            
            # Step 3: Try parsing with various formats
            parsed_dt = None
            matched_format = None
            
            for fmt in self.datetime_formats:
                try:
                    if fmt == '%s':  # Skip unix timestamp format in regular parsing
                        continue
                    
                    parsed_dt = datetime.strptime(cleaned_datetime, fmt)
                    matched_format = fmt
                    break
                    
                except ValueError:
                    continue
            
            # Step 4: Fallback to advanced parsing
            if not parsed_dt:
                advanced_result = self._advanced_datetime_parsing(cleaned_datetime)
                if advanced_result:
                    parsed_dt = advanced_result['datetime']
                    matched_format = advanced_result['format']
            
            if not parsed_dt:
                return NormalizedDateTime(
                    original=original,
                    is_valid=False,
                    validation_errors=['Could not parse datetime format']
                )
            
            # Step 5: Apply timezone
            if parsed_dt.tzinfo is None:
                try:
                    tz = pytz.timezone(detected_tz)
                    parsed_dt = tz.localize(parsed_dt)
                except Exception:
                    parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
            
            # Step 6: Convert to UTC for storage
            utc_dt = parsed_dt.astimezone(timezone.utc)
            
            # Step 7: Generate additional formats
            iso_format = utc_dt.isoformat()
            unix_timestamp = utc_dt.timestamp()
            date_only = utc_dt.date().isoformat()
            time_only = utc_dt.time().isoformat()
            
            return NormalizedDateTime(
                original=original,
                iso_format=iso_format,
                unix_timestamp=unix_timestamp,
                timezone=detected_tz,
                date_only=date_only,
                time_only=time_only,
                is_valid=True,
                inferred_format=matched_format
            )
            
        except Exception as e:
            logger.error(f"DateTime normalization failed: {e}", job_id=job_id)
            return NormalizedDateTime(
                original=datetime_input,
                is_valid=False,
                validation_errors=[f'Normalization error: {str(e)}']
            )
    
    def _is_unix_timestamp(self, value: str) -> bool:
        """Check if value is a unix timestamp"""
        try:
            num_value = float(value)
            # Check if it's in reasonable timestamp range (1970-2050)
            return 0 <= num_value <= 2524608000
        except (ValueError, TypeError):
            return False
    
    def _parse_unix_timestamp(self, timestamp_str: str) -> NormalizedDateTime:
        """Parse unix timestamp"""
        try:
            timestamp = float(timestamp_str)
            
            # Handle millisecond timestamps
            if timestamp > 10**10:  # Likely milliseconds
                timestamp = timestamp / 1000
            
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            
            return NormalizedDateTime(
                original=timestamp_str,
                iso_format=dt.isoformat(),
                unix_timestamp=timestamp,
                timezone='UTC',
                date_only=dt.date().isoformat(),
                time_only=dt.time().isoformat(),
                is_valid=True,
                inferred_format='unix_timestamp'
            )
            
        except Exception as e:
            return NormalizedDateTime(
                original=timestamp_str,
                is_valid=False,
                validation_errors=[f'Invalid unix timestamp: {str(e)}']
            )
    
    def _extract_timezone_info(self, datetime_str: str) -> Dict[str, Any]:
        """Extract timezone information from datetime string"""
        # Common timezone patterns
        tz_patterns = [
            r'(.+)\s+([A-Z]{3,4})$',  # "2023-01-01 12:00:00 EST"
            r'(.+)\s*([+-]\d{4})$',   # "2023-01-01 12:00:00 -0500"
            r'(.+)\s*([+-]\d{2}:\d{2})$',  # "2023-01-01 12:00:00 -05:00"
            r'(.+)Z$',                # "2023-01-01T12:00:00Z"
        ]
        
        for pattern in tz_patterns:
            match = re.match(pattern, datetime_str)
            if match:
                cleaned = match.group(1).strip()
                
                if pattern == r'(.+)Z$':
                    return {'cleaned_datetime': cleaned, 'timezone': 'UTC'}
                else:
                    tz_part = match.group(2)
                    
                    # Map timezone abbreviation
                    if tz_part in self.timezone_mappings:
                        return {
                            'cleaned_datetime': cleaned,
                            'timezone': self.timezone_mappings[tz_part]
                        }
                    
                    # Handle offset formats
                    if re.match(r'[+-]\d{4}', tz_part):
                        return {'cleaned_datetime': cleaned, 'timezone': 'UTC'}
                    
                    return {'cleaned_datetime': cleaned, 'timezone': None}
        
        return {'cleaned_datetime': datetime_str, 'timezone': None}
    
    def _advanced_datetime_parsing(self, datetime_str: str) -> Optional[Dict[str, Any]]:
        """Advanced parsing for non-standard datetime formats"""
        try:
            # Try dateutil parser as fallback
            try:
                from dateutil import parser as dateutil_parser
                parsed_dt = dateutil_parser.parse(datetime_str, fuzzy=True)
                return {
                    'datetime': parsed_dt,
                    'format': 'dateutil_fuzzy'
                }
            except ImportError:
                pass
            except Exception:
                pass
            
            # Try custom pattern matching
            # Handle formats like "Jan 1, 2023 at 2:30 PM"
            casual_patterns = [
                r'(\w+)\s+(\d+),?\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)',
                r'(\w+)\s+(\d+),?\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})',
                r'(\d{1,2})/(\d{1,2})/(\d{2,4}),?\s+(\d{1,2}):(\d{2})',
            ]
            
            for pattern in casual_patterns:
                match = re.match(pattern, datetime_str, re.IGNORECASE)
                if match:
                    # This would require more sophisticated parsing
                    # For now, return None to fall back to error
                    pass
            
            return None
            
        except Exception:
            return None
    
    async def normalize_batch(
        self,
        datetimes: List[str],
        default_timezone: str = 'UTC',
        job_id: Optional[str] = None
    ) -> List[NormalizedDateTime]:
        """Normalize a batch of datetimes efficiently"""
        results = []
        
        # Process in parallel
        tasks = [
            self.normalize_datetime(dt_str, default_timezone, False, job_id)
            for dt_str in datetimes
        ]
        
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in batch_results:
            if isinstance(result, Exception):
                results.append(NormalizedDateTime(
                    original='',
                    is_valid=False,
                    validation_errors=[f'Batch processing error: {str(result)}']
                ))
            else:
                results.append(result)
        
        return results


class DurationNormalizer:
    """Duration normalization and conversion"""
    
    def __init__(self):
        # Duration format patterns
        self.duration_patterns = [
            # HH:MM:SS formats
            (r'^(\d+):(\d{2}):(\d{2})$', 'hms'),
            (r'^(\d+):(\d{2})$', 'hm'),
            (r'^(\d+)h\s*(\d+)m\s*(\d+)s?$', 'hms_text'),
            (r'^(\d+)h\s*(\d+)m$', 'hm_text'),
            (r'^(\d+)m\s*(\d+)s$', 'ms_text'),
            
            # Single unit formats
            (r'^(\d+(?:\.\d+)?)\s*h(?:ours?)?$', 'hours'),
            (r'^(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?$', 'minutes'),
            (r'^(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?$', 'seconds'),
            
            # Raw numbers (assume seconds)
            (r'^(\d+(?:\.\d+)?)$', 'seconds'),
        ]
    
    async def normalize_duration(
        self,
        duration_input: str,
        job_id: Optional[str] = None
    ) -> NormalizedDuration:
        """Normalize duration to standard formats"""
        try:
            if not duration_input or not isinstance(duration_input, str):
                return NormalizedDuration(
                    original=str(duration_input) if duration_input else '',
                    is_valid=False,
                    validation_errors=['Empty or invalid duration input']
                )
            
            original = duration_input.strip().lower()
            
            # Try each pattern
            for pattern, format_type in self.duration_patterns:
                match = re.match(pattern, original)
                if match:
                    try:
                        total_seconds = self._calculate_seconds(match, format_type)
                        
                        if total_seconds < 0:
                            continue
                        
                        # Convert to other formats
                        minutes = total_seconds / 60.0
                        hours = total_seconds / 3600.0
                        formatted = self._format_duration(total_seconds)
                        
                        return NormalizedDuration(
                            original=duration_input,
                            seconds=int(total_seconds),
                            minutes=round(minutes, 2),
                            hours=round(hours, 3),
                            formatted=formatted,
                            is_valid=True
                        )
                        
                    except ValueError:
                        continue
            
            # No pattern matched
            return NormalizedDuration(
                original=duration_input,
                is_valid=False,
                validation_errors=['Duration format not recognized']
            )
            
        except Exception as e:
            logger.error(f"Duration normalization failed: {e}", job_id=job_id)
            return NormalizedDuration(
                original=duration_input,
                is_valid=False,
                validation_errors=[f'Normalization error: {str(e)}']
            )
    
    def _calculate_seconds(self, match, format_type: str) -> float:
        """Calculate total seconds from regex match"""
        if format_type == 'hms':
            hours, minutes, seconds = map(int, match.groups())
            return hours * 3600 + minutes * 60 + seconds
        
        elif format_type == 'hm':
            hours, minutes = map(int, match.groups())
            return hours * 3600 + minutes * 60
        
        elif format_type == 'hms_text':
            hours, minutes, seconds = map(int, match.groups())
            return hours * 3600 + minutes * 60 + seconds
        
        elif format_type == 'hm_text':
            hours, minutes = map(int, match.groups())
            return hours * 3600 + minutes * 60
        
        elif format_type == 'ms_text':
            minutes, seconds = map(int, match.groups())
            return minutes * 60 + seconds
        
        elif format_type == 'hours':
            hours = float(match.group(1))
            return hours * 3600
        
        elif format_type == 'minutes':
            minutes = float(match.group(1))
            return minutes * 60
        
        elif format_type == 'seconds':
            return float(match.group(1))
        
        return -1  # Invalid format
    
    def _format_duration(self, total_seconds: float) -> str:
        """Format duration as HH:MM:SS"""
        hours = int(total_seconds // 3600)
        minutes = int((total_seconds % 3600) // 60)
        seconds = int(total_seconds % 60)
        
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    
    async def normalize_batch(
        self,
        durations: List[str],
        job_id: Optional[str] = None
    ) -> List[NormalizedDuration]:
        """Normalize a batch of durations"""
        tasks = [
            self.normalize_duration(duration, job_id)
            for duration in durations
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        final_results = []
        for result in results:
            if isinstance(result, Exception):
                final_results.append(NormalizedDuration(
                    original='',
                    is_valid=False,
                    validation_errors=[f'Batch processing error: {str(result)}']
                ))
            else:
                final_results.append(result)
        
        return final_results


class ContentSanitizer:
    """Content sanitization and PII detection"""
    
    def __init__(self):
        # PII detection patterns
        self.pii_patterns = {
            'phone': [
                r'\b(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b',
                r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'
            ],
            'email': [
                r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
            ],
            'ssn': [
                r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b'
            ],
            'credit_card': [
                r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b'
            ],
            'address': [
                r'\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b'
            ]
        }
        
        # Content classification patterns
        self.content_classifiers = {
            'spam': [
                r'(?i)\b(?:free|winner|congratulations|urgent|act now|limited time|call now)\b',
                r'(?i)\b(?:lottery|prize|cash|money|$\d+)\b',
                r'(?i)\b(?:click here|visit now|download now)\b'
            ],
            'business': [
                r'(?i)\b(?:meeting|appointment|conference|schedule|proposal|contract)\b',
                r'(?i)\b(?:invoice|payment|order|delivery|service)\b',
                r'(?i)\b(?:office|company|business|corporate|professional)\b'
            ],
            'personal': [
                r'(?i)\b(?:family|friend|love|birthday|party|dinner|lunch)\b',
                r'(?i)\b(?:home|house|vacation|holiday|weekend)\b',
                r'(?i)\b(?:mom|dad|son|daughter|husband|wife)\b'
            ]
        }
    
    async def sanitize_content(
        self,
        content_input: str,
        preserve_length: bool = True,
        job_id: Optional[str] = None
    ) -> NormalizedContent:
        """Sanitize content and detect PII"""
        try:
            if not content_input or not isinstance(content_input, str):
                return NormalizedContent(
                    original=str(content_input) if content_input else '',
                    is_valid=False,
                    validation_errors=['Empty or invalid content input']
                )
            
            original = content_input
            
            # Step 1: Detect PII
            pii_detection = self._detect_pii(original)
            has_pii = len(pii_detection['categories']) > 0
            
            # Step 2: Sanitize content
            sanitized = self._sanitize_text(original, preserve_length)
            
            # Step 3: Classify content type
            content_type = self._classify_content(original)
            
            # Step 4: Detect language (simplified)
            language = self._detect_language(original)
            
            return NormalizedContent(
                original=original,
                sanitized=sanitized,
                has_pii=has_pii,
                pii_categories=pii_detection['categories'],
                content_type=content_type,
                language=language,
                is_valid=True
            )
            
        except Exception as e:
            logger.error(f"Content sanitization failed: {e}", job_id=job_id)
            return NormalizedContent(
                original=content_input,
                is_valid=False,
                validation_errors=[f'Sanitization error: {str(e)}']
            )
    
    def _detect_pii(self, content: str) -> Dict[str, Any]:
        """Detect PII in content"""
        detected_categories = []
        pii_matches = {}
        
        for category, patterns in self.pii_patterns.items():
            category_matches = []
            for pattern in patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                if matches:
                    category_matches.extend(matches)
            
            if category_matches:
                detected_categories.append(category)
                pii_matches[category] = category_matches
        
        return {
            'categories': detected_categories,
            'matches': pii_matches
        }
    
    def _sanitize_text(self, content: str, preserve_length: bool) -> str:
        """Sanitize text content"""
        sanitized = content
        
        # Remove control characters
        sanitized = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', sanitized)
        
        # Replace PII with placeholders
        for category, patterns in self.pii_patterns.items():
            for pattern in patterns:
                if preserve_length:
                    # Replace with X's of same length
                    def replace_with_x(match):
                        return 'X' * len(match.group(0))
                    sanitized = re.sub(pattern, replace_with_x, sanitized, flags=re.IGNORECASE)
                else:
                    # Replace with category placeholder
                    placeholder = f'[{category.upper()}]'
                    sanitized = re.sub(pattern, placeholder, sanitized, flags=re.IGNORECASE)
        
        # Trim excessive whitespace
        sanitized = re.sub(r'\s+', ' ', sanitized).strip()
        
        return sanitized
    
    def _classify_content(self, content: str) -> str:
        """Classify content type"""
        content_lower = content.lower()
        
        # Score each category
        scores = {}
        for category, patterns in self.content_classifiers.items():
            score = 0
            for pattern in patterns:
                matches = len(re.findall(pattern, content_lower))
                score += matches
            scores[category] = score
        
        # Return category with highest score
        if scores and max(scores.values()) > 0:
            return max(scores, key=scores.get)
        
        return 'general'
    
    def _detect_language(self, content: str) -> str:
        """Simple language detection (English by default)"""
        # This is a simplified implementation
        # In production, you would use a proper language detection library
        
        english_words = ['the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'you', 'that']
        spanish_words = ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se']
        
        content_lower = content.lower()
        
        english_score = sum(1 for word in english_words if word in content_lower)
        spanish_score = sum(1 for word in spanish_words if word in content_lower)
        
        if english_score > spanish_score:
            return 'en'
        elif spanish_score > 0:
            return 'es'
        else:
            return 'unknown'
    
    async def sanitize_batch(
        self,
        contents: List[str],
        preserve_length: bool = True,
        job_id: Optional[str] = None
    ) -> List[NormalizedContent]:
        """Sanitize a batch of content"""
        tasks = [
            self.sanitize_content(content, preserve_length, job_id)
            for content in contents
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        final_results = []
        for result in results:
            if isinstance(result, Exception):
                final_results.append(NormalizedContent(
                    original='',
                    is_valid=False,
                    validation_errors=[f'Batch processing error: {str(result)}']
                ))
            else:
                final_results.append(result)
        
        return final_results


class DataNormalizationEngine:
    """Main coordination class for data normalization"""
    
    def __init__(self):
        self.phone_normalizer = PhoneNumberNormalizer()
        self.datetime_normalizer = DateTimeNormalizer()
        self.duration_normalizer = DurationNormalizer()
        self.content_sanitizer = ContentSanitizer()
    
    async def normalize_event_data(
        self,
        event_data: Dict[str, Any],
        field_mappings: List[Dict[str, str]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Normalize a complete event record"""
        try:
            normalized_event = event_data.copy()
            normalization_metadata = {
                'normalized_fields': [],
                'failed_fields': [],
                'quality_score': 0.0
            }
            
            # Create field mapping lookup
            mapping_lookup = {m['source_field']: m['target_field'] for m in field_mappings}
            
            # Normalize each mapped field
            for source_field, target_field in mapping_lookup.items():
                if source_field not in event_data:
                    continue
                
                source_value = event_data[source_field]
                
                try:
                    if target_field == 'number':
                        result = await self.phone_normalizer.normalize_phone_number(
                            str(source_value), job_id=job_id
                        )
                        if result.is_valid:
                            normalized_event['number'] = result.e164
                            normalized_event['number_national'] = result.national
                            normalized_event['carrier'] = result.carrier
                            normalization_metadata['normalized_fields'].append(source_field)
                        else:
                            normalization_metadata['failed_fields'].append({
                                'field': source_field,
                                'errors': result.validation_errors
                            })
                    
                    elif target_field == 'ts':
                        result = await self.datetime_normalizer.normalize_datetime(
                            str(source_value), job_id=job_id
                        )
                        if result.is_valid:
                            normalized_event['ts'] = result.iso_format
                            normalized_event['ts_unix'] = result.unix_timestamp
                            normalization_metadata['normalized_fields'].append(source_field)
                        else:
                            normalization_metadata['failed_fields'].append({
                                'field': source_field,
                                'errors': result.validation_errors
                            })
                    
                    elif target_field == 'duration':
                        result = await self.duration_normalizer.normalize_duration(
                            str(source_value), job_id=job_id
                        )
                        if result.is_valid:
                            normalized_event['duration'] = result.seconds
                            normalized_event['duration_formatted'] = result.formatted
                            normalization_metadata['normalized_fields'].append(source_field)
                        else:
                            normalization_metadata['failed_fields'].append({
                                'field': source_field,
                                'errors': result.validation_errors
                            })
                    
                    elif target_field == 'content':
                        result = await self.content_sanitizer.sanitize_content(
                            str(source_value), job_id=job_id
                        )
                        if result.is_valid:
                            normalized_event['content'] = result.sanitized
                            normalized_event['content_has_pii'] = result.has_pii
                            normalized_event['content_type'] = result.content_type
                            normalization_metadata['normalized_fields'].append(source_field)
                        else:
                            normalization_metadata['failed_fields'].append({
                                'field': source_field,
                                'errors': result.validation_errors
                            })
                    
                    else:
                        # Direct mapping for other fields (type, direction, etc.)
                        normalized_event[target_field] = str(source_value).strip().lower()
                        normalization_metadata['normalized_fields'].append(source_field)
                
                except Exception as e:
                    normalization_metadata['failed_fields'].append({
                        'field': source_field,
                        'errors': [f'Normalization error: {str(e)}']
                    })
            
            # Calculate quality score
            total_fields = len(mapping_lookup)
            successful_fields = len(normalization_metadata['normalized_fields'])
            normalization_metadata['quality_score'] = (
                successful_fields / total_fields if total_fields > 0 else 0.0
            )
            
            # Add metadata to event
            normalized_event['normalization_metadata'] = normalization_metadata
            
            return normalized_event
            
        except Exception as e:
            logger.error(f"Event normalization failed: {e}", job_id=job_id)
            return {
                **event_data,
                'normalization_metadata': {
                    'normalized_fields': [],
                    'failed_fields': [f'Engine error: {str(e)}'],
                    'quality_score': 0.0
                }
            }
    
    async def normalize_batch(
        self,
        events: List[Dict[str, Any]],
        field_mappings: List[Dict[str, str]],
        job_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Normalize a batch of events efficiently"""
        tasks = [
            self.normalize_event_data(event, field_mappings, job_id)
            for event in events
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                final_results.append({
                    **events[i],
                    'normalization_metadata': {
                        'normalized_fields': [],
                        'failed_fields': [f'Batch error: {str(result)}'],
                        'quality_score': 0.0
                    }
                })
            else:
                final_results.append(result)
        
        return final_results


# Global normalization engine instance
data_normalization_engine = DataNormalizationEngine()