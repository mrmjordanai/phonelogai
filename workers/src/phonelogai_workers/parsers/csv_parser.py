"""
Advanced CSV parser implementation for carrier data files

Supports:
- Dynamic delimiter detection
- Encoding detection and handling
- Header row identification
- Data type inference and validation
- Large file streaming processing
- Error handling and recovery
"""
import io
import csv
import chardet
from typing import Dict, List, Optional, Any, Iterator, Tuple
import structlog
import pandas as pd
import numpy as np
from datetime import datetime

from ..config import settings
from ..utils.database import db_manager
from .enhanced_csv_parser import enhanced_csv_parser

logger = structlog.get_logger(__name__)


class CSVParser:
    """Advanced CSV parser for carrier data files"""
    
    def __init__(self):
        self.chunk_size = settings.chunk_size
        self.max_sample_rows = 100
        self._enhanced_parser = enhanced_csv_parser
    
    async def parse_csv(
        self,
        csv_data: bytes,
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Parse CSV data and extract structured events and contacts using enhanced implementation
        
        Args:
            csv_data: Raw CSV file bytes
            field_mappings: ML-generated field mappings
            job_id: Optional job ID for progress tracking
            
        Returns:
            Dict containing extracted events, contacts, and metadata
        """
        logger.info(
            "Delegating to enhanced CSV parser", 
            job_id=job_id, 
            size_bytes=len(csv_data)
        )
        
        # Delegate to the enhanced implementation for production performance
        return await self._enhanced_parser.parse_csv(csv_data, field_mappings, job_id)
            
            # Detect file encoding
            encoding_result = await self._detect_encoding(csv_data)
            encoding = encoding_result["encoding"]
            confidence = encoding_result["confidence"]
            
            logger.info("Detected encoding", 
                       encoding=encoding, 
                       confidence=confidence, 
                       job_id=job_id)
            
            # Convert bytes to string using detected encoding
            try:
                csv_text = csv_data.decode(encoding)
            except UnicodeDecodeError as e:
                logger.warning("Encoding detection failed, trying fallback", 
                             encoding=encoding, error=str(e))
                # Fallback to utf-8 with error handling
                csv_text = csv_data.decode('utf-8', errors='replace')
                encoding = 'utf-8'
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 20)
            
            # Detect CSV structure
            csv_structure = await self._detect_csv_structure(csv_text, job_id)
            
            logger.info("Detected CSV structure",
                       delimiter=repr(csv_structure["delimiter"]),
                       headers=len(csv_structure.get("headers", [])),
                       header_row=csv_structure.get("header_row"),
                       job_id=job_id)
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 30)
            
            # Parse CSV data in chunks for memory efficiency
            parsing_result = await self._parse_csv_data(
                csv_text, csv_structure, field_mappings, job_id
            )
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 90)
            
            # Add processing metadata
            parsing_result["metadata"]["encoding"] = encoding
            parsing_result["metadata"]["encoding_confidence"] = confidence
            parsing_result["metadata"]["csv_structure"] = csv_structure
            
            logger.info("CSV parsing completed",
                       job_id=job_id,
                       events=len(parsing_result["events"]),
                       contacts=len(parsing_result["contacts"]),
                       errors=len(parsing_result["errors"]))
            
            return parsing_result
            
        except Exception as e:
            logger.error("CSV parsing failed", job_id=job_id, error=str(e))
            
            if job_id:
                await db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="parsing_error",
                    error_message=f"CSV parsing failed: {str(e)}",
                    severity="critical"
                )
            
            return {
                "events": [],
                "contacts": [],
                "metadata": {
                    "total_rows": 0,
                    "parsed_rows": 0,
                    "error_rows": 1,
                    "duplicate_rows": 0,
                    "processing_time_ms": 0,
                    "encoding": "unknown"
                },
                "errors": [{"error_type": "parsing_error", "error_message": str(e), "severity": "critical"}],
                "warnings": []
            }
    
    async def _detect_encoding(self, data: bytes) -> Dict[str, Any]:
        """Detect file encoding using chardet"""
        try:
            # Sample first 50KB for encoding detection
            sample_size = min(len(data), 50000)
            sample = data[:sample_size]
            
            # Use chardet to detect encoding
            result = chardet.detect(sample)
            
            encoding = result.get('encoding', 'utf-8')
            confidence = result.get('confidence', 0.0)
            
            # Fallback to common encodings if confidence is low
            if confidence < 0.7:
                # Try common encodings
                for test_encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                    try:
                        sample.decode(test_encoding)
                        return {"encoding": test_encoding, "confidence": 0.8}
                    except UnicodeDecodeError:
                        continue
            
            return {"encoding": encoding, "confidence": confidence}
            
        except Exception as e:
            logger.warning("Encoding detection failed", error=str(e))
            return {"encoding": "utf-8", "confidence": 0.5}
    
    async def _detect_csv_structure(self, csv_text: str, job_id: Optional[str] = None) -> Dict[str, Any]:
        """Detect CSV delimiter, headers, and structure"""
        try:
            # Get sample lines for analysis
            lines = csv_text.split('\n')
            sample_lines = lines[:min(50, len(lines))]  # First 50 lines
            sample_text = '\n'.join(sample_lines)
            
            # Detect delimiter using csv.Sniffer
            try:
                sniffer = csv.Sniffer()
                delimiter = sniffer.sniff(sample_text, delimiters=',;|\t').delimiter
            except csv.Error:
                # Fallback: count occurrences of potential delimiters
                delimiter_counts = {}
                for candidate in [',', ';', '|', '\t']:
                    count = sum(line.count(candidate) for line in sample_lines[:10])
                    if count > 0:
                        delimiter_counts[candidate] = count
                
                if delimiter_counts:
                    delimiter = max(delimiter_counts, key=delimiter_counts.get)
                else:
                    delimiter = ','  # Final fallback
            
            # Detect headers
            header_result = self._detect_headers(sample_lines, delimiter)
            headers = header_result["headers"]
            header_row = header_result["header_row"]
            
            # Analyze data types in sample rows
            data_types = self._analyze_data_types(sample_lines, delimiter, header_row)
            
            return {
                "delimiter": delimiter,
                "headers": headers,
                "header_row": header_row,
                "data_start_row": header_row + 1 if header_row is not None else 0,
                "estimated_rows": len(lines),
                "data_types": data_types,
                "sample_analyzed": len(sample_lines)
            }
            
        except Exception as e:
            logger.error("CSV structure detection failed", error=str(e), job_id=job_id)
            return {
                "delimiter": ",",
                "headers": [],
                "header_row": None,
                "data_start_row": 0,
                "estimated_rows": 0,
                "data_types": {},
                "error": str(e)
            }
    
    def _detect_headers(self, lines: List[str], delimiter: str) -> Dict[str, Any]:
        """Detect header row and extract column names"""
        try:
            if not lines:
                return {"headers": [], "header_row": None}
            
            # Check first few rows for header patterns
            for row_idx in range(min(3, len(lines))):
                line = lines[row_idx].strip()
                if not line:
                    continue
                
                # Split by delimiter
                fields = [field.strip(' "\'') for field in line.split(delimiter)]
                
                # Check if this looks like a header row
                if self._is_likely_header(fields):
                    return {
                        "headers": fields,
                        "header_row": row_idx
                    }
            
            # If no header detected, generate generic column names
            if lines and lines[0]:
                field_count = len(lines[0].split(delimiter))
                headers = [f"column_{i}" for i in range(field_count)]
                return {"headers": headers, "header_row": None}
            
            return {"headers": [], "header_row": None}
            
        except Exception as e:
            logger.error("Header detection failed", error=str(e))
            return {"headers": [], "header_row": None}
    
    def _is_likely_header(self, fields: List[str]) -> bool:
        """Check if a row appears to be a header row"""
        if not fields or len(fields) < 2:
            return False
        
        # Header indicators
        header_patterns = [
            'date', 'time', 'phone', 'number', 'duration', 'type', 'direction',
            'call', 'sms', 'text', 'message', 'contact', 'name', 'cost', 'charge'
        ]
        
        # Check for header-like words
        header_score = 0
        for field in fields:
            field_lower = str(field).lower().replace('_', ' ').replace('-', ' ')
            
            # Check if field contains header keywords
            if any(pattern in field_lower for pattern in header_patterns):
                header_score += 1
            
            # Check if field looks like a descriptive name (letters, no pure numbers)
            if field and not field.isdigit() and any(c.isalpha() for c in field):
                header_score += 0.5
        
        # Consider it a header if more than half the fields look header-like
        return header_score > len(fields) * 0.4
    
    def _analyze_data_types(self, lines: List[str], delimiter: str, header_row: Optional[int]) -> Dict[str, str]:
        """Analyze data types for each column"""
        try:
            data_types = {}
            
            # Skip header row and empty lines
            data_start = (header_row + 1) if header_row is not None else 0
            data_lines = []
            
            for line in lines[data_start:]:
                line = line.strip()
                if line:
                    data_lines.append(line)
            
            if not data_lines:
                return data_types
            
            # Analyze first data row to get column count
            first_row = data_lines[0].split(delimiter)
            column_count = len(first_row)
            
            # Initialize type counters for each column
            type_counters = {}
            for i in range(column_count):
                type_counters[i] = {
                    'string': 0,
                    'integer': 0,
                    'float': 0,
                    'date': 0,
                    'time': 0,
                    'phone': 0,
                    'empty': 0
                }
            
            # Analyze sample of data rows
            sample_rows = data_lines[:min(20, len(data_lines))]
            
            for row_text in sample_rows:
                fields = row_text.split(delimiter)
                
                for i, field in enumerate(fields):
                    if i >= column_count:
                        break
                    
                    field = field.strip(' "\'')
                    field_type = self._classify_field_type(field)
                    
                    if i in type_counters:
                        type_counters[i][field_type] += 1
            
            # Determine predominant type for each column
            for i in range(column_count):
                if i in type_counters:
                    type_counts = type_counters[i]
                    predominant_type = max(type_counts, key=type_counts.get)
                    data_types[f"column_{i}"] = predominant_type
            
            return data_types
            
        except Exception as e:
            logger.error("Data type analysis failed", error=str(e))
            return {}
    
    def _classify_field_type(self, field: str) -> str:
        """Classify the type of a single field value"""
        if not field or field.strip() == '':
            return 'empty'
        
        field = field.strip()
        
        # Check for phone number patterns
        if self._is_phone_number(field):
            return 'phone'
        
        # Check for date patterns
        if self._is_date(field):
            return 'date'
        
        # Check for time patterns
        if self._is_time(field):
            return 'time'
        
        # Check for numeric types
        try:
            if '.' in field:
                float(field)
                return 'float'
            else:
                int(field)
                return 'integer'
        except ValueError:
            pass
        
        return 'string'
    
    def _is_phone_number(self, value: str) -> bool:
        """Check if value looks like a phone number"""
        import re
        # Remove common phone formatting
        cleaned = re.sub(r'[^\d+]', '', value)
        
        # Check for valid phone number patterns
        patterns = [
            r'^\+?1?[0-9]{10}$',  # US format
            r'^\+?[0-9]{10,15}$',  # International format
        ]
        
        for pattern in patterns:
            if re.match(pattern, cleaned):
                return True
        
        return False
    
    def _is_date(self, value: str) -> bool:
        """Check if value looks like a date"""
        import re
        date_patterns = [
            r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',
            r'\d{4}-\d{2}-\d{2}',
            r'\d{2}-\d{2}-\d{4}',
        ]
        
        for pattern in date_patterns:
            if re.match(pattern, value):
                return True
        
        return False
    
    def _is_time(self, value: str) -> bool:
        """Check if value looks like a time"""
        import re
        time_patterns = [
            r'\d{1,2}:\d{2}(:\d{2})?(\s?[AaPp][Mm])?',
            r'\d{2}:\d{2}:\d{2}',
        ]
        
        for pattern in time_patterns:
            if re.match(pattern, value):
                return True
        
        return False
    
    async def _parse_csv_data(
        self,
        csv_text: str,
        structure: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Parse CSV data in chunks to extract events and contacts"""
        try:
            all_events = []
            all_contacts = []
            errors = []
            warnings = []
            
            delimiter = structure["delimiter"]
            headers = structure.get("headers", [])
            data_start_row = structure.get("data_start_row", 0)
            
            # Create CSV reader
            csv_reader = csv.DictReader(
                io.StringIO(csv_text),
                fieldnames=headers if headers else None,
                delimiter=delimiter
            )
            
            # Skip to data start row
            for _ in range(data_start_row):
                try:
                    next(csv_reader)
                except StopIteration:
                    break
            
            # Process data in chunks
            processed_rows = 0
            total_rows = structure.get("estimated_rows", 0) - data_start_row
            chunk_events = []
            
            for row_num, row in enumerate(csv_reader, start=data_start_row + 1):
                try:
                    # Apply field mappings to convert row to event
                    event_data = self._apply_field_mappings(row, field_mappings, row_num)
                    
                    if event_data and self._is_valid_event(event_data):
                        # Add metadata
                        event_data["metadata"] = {
                            "source_row": row_num,
                            "extraction_method": "csv"
                        }
                        chunk_events.append(event_data)
                    
                    processed_rows += 1
                    
                    # Process chunk when it reaches chunk size
                    if len(chunk_events) >= self.chunk_size:
                        all_events.extend(chunk_events)
                        chunk_events = []
                        
                        # Update progress
                        if job_id and total_rows > 0:
                            progress = 30 + (processed_rows / total_rows) * 50
                            await db_manager.update_job_status(
                                job_id, "processing", min(80, progress), processed_rows
                            )
                    
                except Exception as e:
                    errors.append({
                        "error_type": "parsing_error",
                        "error_message": f"Row {row_num}: {str(e)}",
                        "raw_data": dict(row) if row else {},
                        "severity": "warning"
                    })
                    
                    # Stop processing if too many errors
                    if len(errors) > processed_rows * 0.1:  # More than 10% error rate
                        warnings.append(f"Stopping processing due to high error rate: {len(errors)} errors in {processed_rows} rows")
                        break
            
            # Process remaining events in last chunk
            if chunk_events:
                all_events.extend(chunk_events)
            
            # Extract contacts from events
            all_contacts = self._extract_contacts_from_events(all_events)
            
            logger.info("CSV data parsing completed",
                       processed_rows=processed_rows,
                       events=len(all_events),
                       contacts=len(all_contacts),
                       errors=len(errors))
            
            return {
                "events": all_events,
                "contacts": all_contacts,
                "metadata": {
                    "total_rows": processed_rows,
                    "parsed_rows": len(all_events),
                    "error_rows": len(errors),
                    "duplicate_rows": 0,  # Will be calculated during deduplication
                    "processing_time_ms": 0,  # Will be set by caller
                    "extraction_method": "csv"
                },
                "errors": errors,
                "warnings": warnings
            }
            
        except Exception as e:
            logger.error("CSV data parsing failed", error=str(e), job_id=job_id)
            return {
                "events": [],
                "contacts": [],
                "metadata": {"total_rows": 0, "parsed_rows": 0, "error_rows": 1, "duplicate_rows": 0, "processing_time_ms": 0},
                "errors": [{"error_type": "parsing_error", "error_message": str(e), "severity": "critical"}],
                "warnings": []
            }
    
    def _apply_field_mappings(
        self,
        row: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        row_num: int
    ) -> Optional[Dict[str, Any]]:
        """Apply field mappings to convert CSV row to event format"""
        try:
            event_data = {}
            
            # Apply each field mapping
            for mapping in field_mappings:
                source_field = mapping["source_field"]
                target_field = mapping["target_field"]
                data_type = mapping.get("data_type", "string")
                
                if source_field in row:
                    raw_value = row[source_field]
                    
                    # Transform value based on data type
                    transformed_value = self._transform_value(raw_value, data_type)
                    
                    if transformed_value is not None:
                        event_data[target_field] = transformed_value
            
            # Ensure required fields are present
            if not self._has_required_fields(event_data):
                return None
            
            return event_data
            
        except Exception as e:
            logger.debug(f"Field mapping failed for row {row_num}", error=str(e))
            return None
    
    def _transform_value(self, value: Any, data_type: str) -> Any:
        """Transform value to the specified data type"""
        if value is None or (isinstance(value, str) and value.strip() == ''):
            return None
        
        try:
            if data_type == "string":
                return str(value).strip()
            
            elif data_type == "number":
                # Handle various numeric formats
                if isinstance(value, str):
                    # Remove common formatting
                    cleaned = value.replace(',', '').replace('$', '').strip()
                    
                    # Handle duration formats like "00:05:30" or "5:30"
                    if ':' in cleaned:
                        parts = cleaned.split(':')
                        if len(parts) == 2:  # MM:SS
                            return int(parts[0]) * 60 + int(parts[1])
                        elif len(parts) == 3:  # HH:MM:SS
                            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                    
                    # Regular numeric conversion
                    return float(cleaned) if '.' in cleaned else int(float(cleaned))
                
                return float(value)
            
            elif data_type == "date":
                return self._parse_date(str(value))
            
            elif data_type == "boolean":
                if isinstance(value, bool):
                    return value
                
                value_str = str(value).lower().strip()
                return value_str in ['true', '1', 'yes', 'y', 'on', 'incoming', 'inbound']
            
            else:
                return str(value).strip()
        
        except Exception:
            # If transformation fails, return original value as string
            return str(value).strip() if value else None
    
    def _parse_date(self, date_str: str) -> str:
        """Parse date string to ISO format"""
        date_formats = [
            "%m/%d/%Y %H:%M:%S",
            "%m/%d/%Y %H:%M",
            "%Y-%m-%d %H:%M:%S", 
            "%Y-%m-%d %H:%M",
            "%m/%d/%Y",
            "%Y-%m-%d",
            "%m-%d-%Y",
            "%d/%m/%Y",
            "%d-%m-%Y",
        ]
        
        date_str = date_str.strip()
        
        for fmt in date_formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.isoformat()
            except ValueError:
                continue
        
        # If no format matches, return the original value
        return date_str
    
    def _has_required_fields(self, event_data: Dict[str, Any]) -> bool:
        """Check if event has minimum required fields"""
        required_fields = ["number", "ts"]  # Minimum requirements
        
        for field in required_fields:
            if field not in event_data or not event_data[field]:
                return False
        
        return True
    
    def _is_valid_event(self, event_data: Dict[str, Any]) -> bool:
        """Validate event data"""
        # Check required fields
        if not self._has_required_fields(event_data):
            return False
        
        # Validate phone number format
        phone = str(event_data["number"]).strip()
        import re
        cleaned_phone = re.sub(r'[^0-9+]', '', phone)
        
        if not re.match(r'^\+?1?[0-9]{10,11}$', cleaned_phone):
            return False
        
        # Add default values for missing optional fields
        if "type" not in event_data:
            event_data["type"] = "call"  # Default assumption
        if "direction" not in event_data:
            event_data["direction"] = "outbound"  # Default assumption
        
        return True
    
    def _extract_contacts_from_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract contact information from parsed events"""
        contact_map = {}
        
        for event in events:
            phone = event.get("number")
            if not phone:
                continue
            
            # Normalize phone number
            import re
            normalized_phone = re.sub(r'[^0-9+]', '', phone)
            if normalized_phone.startswith('1') and len(normalized_phone) == 11:
                normalized_phone = '+' + normalized_phone
            elif len(normalized_phone) == 10:
                normalized_phone = '+1' + normalized_phone
            
            if normalized_phone not in contact_map:
                contact_map[normalized_phone] = {
                    "number": normalized_phone,
                    "first_seen": event.get("ts"),
                    "last_seen": event.get("ts"),
                    "total_calls": 0,
                    "total_sms": 0,
                    "metadata": {"source": "csv_import"}
                }
            
            contact = contact_map[normalized_phone]
            
            # Update statistics
            if event.get("type") == "call":
                contact["total_calls"] += 1
            elif event.get("type") in ["sms", "text", "message"]:
                contact["total_sms"] += 1
            
            # Update date range
            event_ts = event.get("ts")
            if event_ts:
                if not contact["first_seen"] or event_ts < contact["first_seen"]:
                    contact["first_seen"] = event_ts
                if not contact["last_seen"] or event_ts > contact["last_seen"]:
                    contact["last_seen"] = event_ts
        
        return list(contact_map.values())


# Global CSV parser instance
csv_parser = CSVParser()