"""
CDR (Call Detail Record) text file parser implementation

Supports:
- Fixed-width format detection and parsing
- Delimited CDR records (pipe, comma, tab separated)
- Custom carrier CDR format handlers
- Binary format support (if needed)
- Pattern-based field extraction
- Flexible field mapping and validation
"""
import re
import struct
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import structlog

from ..config import settings
from ..utils.database import db_manager
from .enhanced_cdr_parser import enhanced_cdr_parser

logger = structlog.get_logger(__name__)


class CDRParser:
    """Advanced CDR text file parser for carrier data"""
    
    def __init__(self):
        self.chunk_size = settings.chunk_size
        self.carrier_patterns = self._load_carrier_patterns()
        self._enhanced_parser = enhanced_cdr_parser
    
    def _load_carrier_patterns(self) -> Dict[str, Dict[str, Any]]:
        """Load carrier-specific CDR patterns and formats"""
        return {
            "att": {
                "patterns": [
                    r"CDR\|(\d{8})\|(\d{6})\|([^|]+)\|([^|]+)\|(\d+)\|([^|]+)",
                    r"(\d{2}/\d{2}/\d{4}),(\d{2}:\d{2}:\d{2}),([^,]+),([^,]+),(\d+)",
                ],
                "field_order": ["date", "time", "number", "direction", "duration", "type"],
                "delimiters": ["|", ","],
                "fixed_width": False
            },
            "verizon": {
                "patterns": [
                    r"(\d{8})(\d{6})([0-9-+()]+)([IO])(\d{6})([CV])",
                    r"VZW\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2}:\d{2})\|([^|]+)\|([^|]+)\|(\d+)",
                ],
                "field_order": ["date", "time", "number", "direction", "duration", "type"],
                "delimiters": ["|", ","],
                "fixed_width": True,
                "field_widths": [8, 6, 15, 1, 6, 1]  # Date, Time, Number, Direction, Duration, Type
            },
            "tmobile": {
                "patterns": [
                    r"TMO:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2}:\d{2}):([^:]+):([^:]+):(\d+)",
                    r"(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}:\d{2})\s+([0-9-+()]+)\s+([IO])\s+(\d+)",
                ],
                "field_order": ["date", "time", "number", "direction", "duration"],
                "delimiters": [":", " "],
                "fixed_width": False
            },
            "sprint": {
                "patterns": [
                    r"SPR\|(\d{8})\|(\d{6})\|([^|]+)\|([^|]+)\|(\d+)\|([^|]+)",
                    r"(\d{8})(\d{6})([0-9]+)([IO])(\d+)([CV])",
                ],
                "field_order": ["date", "time", "number", "direction", "duration", "type"],
                "delimiters": ["|"],
                "fixed_width": True,
                "field_widths": [8, 6, 10, 1, 5, 1]
            }
        }
    
    async def parse_cdr(
        self,
        cdr_data: bytes,
        field_mappings: List[Dict[str, Any]],
        carrier: str = "unknown",
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Parse CDR text data using enhanced implementation with advanced carrier support
        
        Args:
            cdr_data: Raw CDR file bytes
            field_mappings: ML-generated field mappings
            carrier: Detected carrier type for format-specific parsing
            job_id: Optional job ID for progress tracking
            
        Returns:
            Dict containing extracted events, contacts, and metadata
        """
        logger.info(
            "Delegating to enhanced CDR parser", 
            job_id=job_id, 
            size_bytes=len(cdr_data),
            carrier=carrier
        )
        
        # Delegate to the enhanced implementation for production performance and advanced features
        return await self._enhanced_parser.parse_cdr(cdr_data, field_mappings, carrier, job_id)
    
    # Legacy methods kept for backward compatibility - no longer used in production
    async def _detect_encoding_legacy(self, data: bytes) -> Dict[str, Any]:
        """Legacy encoding detection method"""
        try:
            import chardet
            result = chardet.detect(data[:min(10000, len(data))])
            return {
                "encoding": result.get('encoding', 'utf-8'),
                "confidence": result.get('confidence', 0.5)
            }
        except Exception:
            return {"encoding": "utf-8", "confidence": 0.5}
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 20)
            
            # Detect CDR format
            cdr_format = await self._detect_cdr_format(cdr_text, carrier)
            
            logger.info("Detected CDR format",
                       format_type=cdr_format["format_type"],
                       carrier=carrier,
                       pattern_matched=cdr_format.get("pattern_matched", False),
                       job_id=job_id)
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 30)
            
            # Parse CDR data based on detected format
            parsing_result = await self._parse_cdr_data(
                cdr_text, cdr_format, field_mappings, carrier, job_id
            )
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 90)
            
            # Add processing metadata
            parsing_result["metadata"]["encoding"] = encoding
            parsing_result["metadata"]["cdr_format"] = cdr_format
            parsing_result["metadata"]["carrier"] = carrier
            
            logger.info("CDR parsing completed",
                       job_id=job_id,
                       events=len(parsing_result["events"]),
                       contacts=len(parsing_result["contacts"]),
                       errors=len(parsing_result["errors"]))
            
            return parsing_result
            
        except Exception as e:
            logger.error("CDR parsing failed", job_id=job_id, error=str(e))
            
            if job_id:
                await db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="parsing_error",
                    error_message=f"CDR parsing failed: {str(e)}",
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
                    "encoding": "unknown",
                    "carrier": carrier
                },
                "errors": [{"error_type": "parsing_error", "error_message": str(e), "severity": "critical"}],
                "warnings": []
            }
    
    async def _detect_encoding(self, data: bytes) -> Dict[str, Any]:
        """Detect file encoding"""
        try:
            import chardet
            
            # Sample first 10KB for encoding detection
            sample_size = min(len(data), 10000)
            sample = data[:sample_size]
            
            result = chardet.detect(sample)
            encoding = result.get('encoding', 'utf-8')
            confidence = result.get('confidence', 0.0)
            
            # CDR files are often ASCII or Latin-1
            if confidence < 0.7:
                for test_encoding in ['ascii', 'latin-1', 'utf-8']:
                    try:
                        sample.decode(test_encoding)
                        return {"encoding": test_encoding, "confidence": 0.8}
                    except UnicodeDecodeError:
                        continue
            
            return {"encoding": encoding, "confidence": confidence}
            
        except ImportError:
            # Fallback if chardet not available
            return {"encoding": "utf-8", "confidence": 0.5}
        except Exception as e:
            logger.warning("Encoding detection failed", error=str(e))
            return {"encoding": "utf-8", "confidence": 0.5}
    
    async def _detect_cdr_format(self, cdr_text: str, carrier: str) -> Dict[str, Any]:
        """Detect CDR file format and structure"""
        try:
            lines = cdr_text.split('\n')[:50]  # Sample first 50 lines
            
            # Try carrier-specific patterns first
            if carrier in self.carrier_patterns:
                carrier_config = self.carrier_patterns[carrier]
                
                for pattern in carrier_config["patterns"]:
                    matches = 0
                    for line in lines:
                        if re.search(pattern, line.strip()):
                            matches += 1
                    
                    if matches > len(lines) * 0.3:  # At least 30% match
                        return {
                            "format_type": "carrier_specific",
                            "carrier": carrier,
                            "pattern": pattern,
                            "pattern_matched": True,
                            "field_order": carrier_config["field_order"],
                            "fixed_width": carrier_config.get("fixed_width", False),
                            "field_widths": carrier_config.get("field_widths", []),
                            "delimiters": carrier_config["delimiters"]
                        }
            
            # Try generic format detection
            format_result = self._detect_generic_format(lines)
            
            return {
                "format_type": format_result["format_type"],
                "carrier": carrier,
                "pattern_matched": False,
                "delimiter": format_result.get("delimiter"),
                "fixed_width": format_result.get("fixed_width", False),
                "field_count": format_result.get("field_count", 0),
                "sample_lines": lines[:5]
            }
            
        except Exception as e:
            logger.error("CDR format detection failed", error=str(e))
            return {
                "format_type": "unknown",
                "carrier": carrier,
                "pattern_matched": False,
                "error": str(e)
            }
    
    def _detect_generic_format(self, lines: List[str]) -> Dict[str, Any]:
        """Detect generic CDR format patterns"""
        if not lines:
            return {"format_type": "unknown"}
        
        # Test for common delimiters
        delimiters = ['|', ',', '\t', ';', ':']
        delimiter_scores = {}
        
        for delimiter in delimiters:
            score = 0
            consistent_field_count = True
            field_counts = []
            
            for line in lines[:10]:  # Check first 10 lines
                if delimiter in line:
                    field_count = len(line.split(delimiter))
                    field_counts.append(field_count)
                    score += 1
            
            # Check if field count is consistent
            if field_counts:
                if len(set(field_counts)) == 1:  # All same count
                    score *= 2  # Boost score for consistency
                delimiter_scores[delimiter] = {
                    "score": score,
                    "field_count": field_counts[0] if field_counts else 0,
                    "consistent": consistent_field_count
                }
        
        # Find best delimiter
        if delimiter_scores:
            best_delimiter = max(delimiter_scores, key=lambda k: delimiter_scores[k]["score"])
            best_score = delimiter_scores[best_delimiter]
            
            if best_score["score"] > 0:
                return {
                    "format_type": "delimited",
                    "delimiter": best_delimiter,
                    "field_count": best_score["field_count"],
                    "fixed_width": False
                }
        
        # Check for fixed-width format
        if self._is_fixed_width_format(lines):
            return {
                "format_type": "fixed_width",
                "fixed_width": True,
                "field_widths": self._detect_field_widths(lines)
            }
        
        # Check for pattern-based format
        pattern_result = self._detect_pattern_format(lines)
        if pattern_result["detected"]:
            return {
                "format_type": "pattern_based",
                "patterns": pattern_result["patterns"],
                "fixed_width": False
            }
        
        return {"format_type": "unknown"}
    
    def _is_fixed_width_format(self, lines: List[str]) -> bool:
        """Check if lines appear to be fixed-width format"""
        if len(lines) < 3:
            return False
        
        # Check if all lines have similar length
        lengths = [len(line) for line in lines if line.strip()]
        if not lengths:
            return False
        
        avg_length = sum(lengths) / len(lengths)
        length_variance = sum((l - avg_length) ** 2 for l in lengths) / len(lengths)
        
        # If variance is low and lines don't contain common delimiters, likely fixed-width
        has_delimiters = any(delimiter in ''.join(lines) for delimiter in ['|', ',', '\t'])
        
        return length_variance < 10 and not has_delimiters and avg_length > 20
    
    def _detect_field_widths(self, lines: List[str]) -> List[int]:
        """Detect field widths for fixed-width format"""
        if not lines:
            return []
        
        # Use first line as template
        template_line = lines[0]
        
        # Look for patterns that suggest field boundaries
        # This is a simplified approach - real implementation might be more sophisticated
        potential_widths = []
        
        # Common CDR field patterns and their typical widths
        patterns = [
            (r'\d{8}', 8),     # YYYYMMDD date
            (r'\d{6}', 6),     # HHMMSS time
            (r'\d{10,15}', 15), # Phone number
            (r'[IO]', 1),      # Direction (I/O)
            (r'\d{1,6}', 6),   # Duration
            (r'[CV]', 1),      # Call type (C/V)
        ]
        
        pos = 0
        for pattern, width in patterns:
            match = re.search(pattern, template_line[pos:])
            if match:
                potential_widths.append(width)
                pos += width
            else:
                break
        
        return potential_widths if potential_widths else [10, 10, 15, 5, 5]  # Default widths
    
    def _detect_pattern_format(self, lines: List[str]) -> Dict[str, Any]:
        """Detect pattern-based CDR format"""
        common_patterns = [
            r'(\d{8})(\d{6})([0-9-+()]+)([IO])(\d+)',  # Generic YYYYMMDDHHMMSSNUMBERDIR DURATION
            r'(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([^\\s]+)\s+([IO])\s+(\d+)',  # ISO date format
            r'(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}:\d{2})\s+([0-9-+()]+)\s+([^\\s]+)\s+(\d+)',  # US date format
        ]
        
        detected_patterns = []
        
        for pattern in common_patterns:
            matches = 0
            for line in lines:
                if re.search(pattern, line.strip()):
                    matches += 1
            
            if matches > len(lines) * 0.2:  # At least 20% match
                detected_patterns.append(pattern)
        
        return {
            "detected": len(detected_patterns) > 0,
            "patterns": detected_patterns
        }
    
    async def _parse_cdr_data(
        self,
        cdr_text: str,
        cdr_format: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        carrier: str,
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Parse CDR data based on detected format"""
        try:
            format_type = cdr_format["format_type"]
            
            if format_type == "carrier_specific":
                return await self._parse_carrier_specific(cdr_text, cdr_format, field_mappings, job_id)
            elif format_type == "delimited":
                return await self._parse_delimited(cdr_text, cdr_format, field_mappings, job_id)
            elif format_type == "fixed_width":
                return await self._parse_fixed_width(cdr_text, cdr_format, field_mappings, job_id)
            elif format_type == "pattern_based":
                return await self._parse_pattern_based(cdr_text, cdr_format, field_mappings, job_id)
            else:
                # Fallback: try to parse as generic text
                return await self._parse_generic_text(cdr_text, field_mappings, job_id)
                
        except Exception as e:
            logger.error("CDR data parsing failed", error=str(e))
            return {
                "events": [],
                "contacts": [],
                "metadata": {"total_rows": 0, "parsed_rows": 0, "error_rows": 1, "duplicate_rows": 0, "processing_time_ms": 0},
                "errors": [{"error_type": "parsing_error", "error_message": str(e), "severity": "critical"}],
                "warnings": []
            }
    
    async def _parse_carrier_specific(
        self,
        cdr_text: str,
        cdr_format: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Parse carrier-specific CDR format"""
        all_events = []
        all_contacts = []
        errors = []
        
        lines = cdr_text.split('\n')
        pattern = cdr_format["pattern"]
        field_order = cdr_format["field_order"]
        
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
            
            try:
                match = re.search(pattern, line)
                if match:
                    groups = match.groups()
                    
                    # Map groups to field names based on field order
                    raw_data = {}
                    for i, field_name in enumerate(field_order):
                        if i < len(groups):
                            raw_data[field_name] = groups[i]
                    
                    # Convert to event format using field mappings
                    event_data = self._convert_to_event(raw_data, field_mappings, line_num)
                    
                    if event_data and self._is_valid_event(event_data):
                        event_data["metadata"] = {
                            "source_line": line_num,
                            "extraction_method": "carrier_specific",
                            "raw_text": line
                        }
                        all_events.append(event_data)
                        
            except Exception as e:
                errors.append({
                    "error_type": "parsing_error",
                    "error_message": f"Line {line_num}: {str(e)}",
                    "raw_data": {"raw_line": line},
                    "severity": "warning"
                })
        
        # Extract contacts
        all_contacts = self._extract_contacts_from_events(all_events)
        
        return {
            "events": all_events,
            "contacts": all_contacts,
            "metadata": {
                "total_rows": len(lines),
                "parsed_rows": len(all_events),
                "error_rows": len(errors),
                "duplicate_rows": 0,
                "processing_time_ms": 0,
                "extraction_method": "carrier_specific"
            },
            "errors": errors,
            "warnings": []
        }
    
    async def _parse_delimited(
        self,
        cdr_text: str,
        cdr_format: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Parse delimited CDR format"""
        all_events = []
        all_contacts = []
        errors = []
        
        lines = cdr_text.split('\n')
        delimiter = cdr_format["delimiter"]
        
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
            
            try:
                fields = line.split(delimiter)
                
                # Create raw data dictionary with indexed field names
                raw_data = {}
                for i, field in enumerate(fields):
                    raw_data[f"field_{i}"] = field.strip()
                
                # Convert to event format using field mappings
                event_data = self._convert_to_event(raw_data, field_mappings, line_num)
                
                if event_data and self._is_valid_event(event_data):
                    event_data["metadata"] = {
                        "source_line": line_num,
                        "extraction_method": "delimited",
                        "delimiter": delimiter,
                        "raw_text": line
                    }
                    all_events.append(event_data)
                    
            except Exception as e:
                errors.append({
                    "error_type": "parsing_error",
                    "error_message": f"Line {line_num}: {str(e)}",
                    "raw_data": {"raw_line": line},
                    "severity": "warning"
                })
        
        # Extract contacts
        all_contacts = self._extract_contacts_from_events(all_events)
        
        return {
            "events": all_events,
            "contacts": all_contacts,
            "metadata": {
                "total_rows": len(lines),
                "parsed_rows": len(all_events),
                "error_rows": len(errors),
                "duplicate_rows": 0,
                "processing_time_ms": 0,
                "extraction_method": "delimited"
            },
            "errors": errors,
            "warnings": []
        }
    
    async def _parse_fixed_width(
        self,
        cdr_text: str,
        cdr_format: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Parse fixed-width CDR format"""
        all_events = []
        all_contacts = []
        errors = []
        
        lines = cdr_text.split('\n')
        field_widths = cdr_format.get("field_widths", [])
        
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
            
            try:
                # Extract fields based on fixed widths
                raw_data = {}
                pos = 0
                
                for i, width in enumerate(field_widths):
                    if pos + width <= len(line):
                        field_value = line[pos:pos + width].strip()
                        raw_data[f"field_{i}"] = field_value
                        pos += width
                    else:
                        break
                
                # If we couldn't parse using fixed widths, try to extract known patterns
                if len(raw_data) < 3:  # Not enough fields
                    raw_data = self._extract_patterns_from_line(line)
                
                # Convert to event format using field mappings
                event_data = self._convert_to_event(raw_data, field_mappings, line_num)
                
                if event_data and self._is_valid_event(event_data):
                    event_data["metadata"] = {
                        "source_line": line_num,
                        "extraction_method": "fixed_width",
                        "raw_text": line
                    }
                    all_events.append(event_data)
                    
            except Exception as e:
                errors.append({
                    "error_type": "parsing_error",
                    "error_message": f"Line {line_num}: {str(e)}",
                    "raw_data": {"raw_line": line},
                    "severity": "warning"
                })
        
        # Extract contacts
        all_contacts = self._extract_contacts_from_events(all_events)
        
        return {
            "events": all_events,
            "contacts": all_contacts,
            "metadata": {
                "total_rows": len(lines),
                "parsed_rows": len(all_events),
                "error_rows": len(errors),
                "duplicate_rows": 0,
                "processing_time_ms": 0,
                "extraction_method": "fixed_width"
            },
            "errors": errors,
            "warnings": []
        }
    
    async def _parse_pattern_based(
        self,
        cdr_text: str,
        cdr_format: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Parse pattern-based CDR format"""
        all_events = []
        all_contacts = []
        errors = []
        
        lines = cdr_text.split('\n')
        patterns = cdr_format["patterns"]
        
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
            
            try:
                parsed = False
                
                # Try each pattern until one matches
                for pattern in patterns:
                    match = re.search(pattern, line)
                    if match:
                        groups = match.groups()
                        
                        # Create raw data from groups
                        raw_data = {}
                        for i, group in enumerate(groups):
                            raw_data[f"field_{i}"] = group
                        
                        # Convert to event format using field mappings
                        event_data = self._convert_to_event(raw_data, field_mappings, line_num)
                        
                        if event_data and self._is_valid_event(event_data):
                            event_data["metadata"] = {
                                "source_line": line_num,
                                "extraction_method": "pattern_based",
                                "pattern_used": pattern,
                                "raw_text": line
                            }
                            all_events.append(event_data)
                            parsed = True
                            break
                
                if not parsed:
                    # Try generic pattern extraction as fallback
                    raw_data = self._extract_patterns_from_line(line)
                    if raw_data:
                        event_data = self._convert_to_event(raw_data, field_mappings, line_num)
                        if event_data and self._is_valid_event(event_data):
                            event_data["metadata"] = {
                                "source_line": line_num,
                                "extraction_method": "pattern_fallback",
                                "raw_text": line
                            }
                            all_events.append(event_data)
                            
            except Exception as e:
                errors.append({
                    "error_type": "parsing_error",
                    "error_message": f"Line {line_num}: {str(e)}",
                    "raw_data": {"raw_line": line},
                    "severity": "warning"
                })
        
        # Extract contacts
        all_contacts = self._extract_contacts_from_events(all_events)
        
        return {
            "events": all_events,
            "contacts": all_contacts,
            "metadata": {
                "total_rows": len(lines),
                "parsed_rows": len(all_events),
                "error_rows": len(errors),
                "duplicate_rows": 0,
                "processing_time_ms": 0,
                "extraction_method": "pattern_based"
            },
            "errors": errors,
            "warnings": []
        }
    
    async def _parse_generic_text(
        self,
        cdr_text: str,
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Parse generic text CDR format as fallback"""
        all_events = []
        all_contacts = []
        errors = []
        
        lines = cdr_text.split('\n')
        
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
            
            try:
                # Extract patterns from line
                raw_data = self._extract_patterns_from_line(line)
                
                if raw_data:
                    # Convert to event format using field mappings
                    event_data = self._convert_to_event(raw_data, field_mappings, line_num)
                    
                    if event_data and self._is_valid_event(event_data):
                        event_data["metadata"] = {
                            "source_line": line_num,
                            "extraction_method": "generic_text",
                            "raw_text": line
                        }
                        all_events.append(event_data)
                        
            except Exception as e:
                errors.append({
                    "error_type": "parsing_error",
                    "error_message": f"Line {line_num}: {str(e)}",
                    "raw_data": {"raw_line": line},
                    "severity": "warning"
                })
        
        # Extract contacts
        all_contacts = self._extract_contacts_from_events(all_events)
        
        return {
            "events": all_events,
            "contacts": all_contacts,
            "metadata": {
                "total_rows": len(lines),
                "parsed_rows": len(all_events),
                "error_rows": len(errors),
                "duplicate_rows": 0,
                "processing_time_ms": 0,
                "extraction_method": "generic_text"
            },
            "errors": errors,
            "warnings": []
        }
    
    def _extract_patterns_from_line(self, line: str) -> Dict[str, str]:
        """Extract known patterns from a text line"""
        patterns = {
            "phone": r'\b(?:\+?1[-.]?)?(?:\(?\d{3}\)?[-.]?)\d{3}[-.]?\d{4}\b',
            "date_yyyymmdd": r'\b\d{8}\b',
            "date_slash": r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
            "date_dash": r'\b\d{4}-\d{2}-\d{2}\b',
            "time_hhmmss": r'\b\d{6}\b',
            "time_colon": r'\b\d{1,2}:\d{2}(:\d{2})?\b',
            "duration_seconds": r'\b\d{1,6}\b(?=\s|$)',
            "direction": r'\b[IO]\b',
            "call_type": r'\b[CV]\b',
        }
        
        extracted = {}
        for field_type, pattern in patterns.items():
            matches = re.findall(pattern, line)
            if matches:
                extracted[field_type] = matches[0]  # Take first match
        
        return extracted
    
    def _convert_to_event(
        self,
        raw_data: Dict[str, str],
        field_mappings: List[Dict[str, Any]],
        line_num: int
    ) -> Optional[Dict[str, Any]]:
        """Convert raw parsed data to event format using field mappings"""
        try:
            event_data = {}
            
            # Apply field mappings
            for mapping in field_mappings:
                source_field = mapping["source_field"]
                target_field = mapping["target_field"]
                data_type = mapping.get("data_type", "string")
                
                # Look for source field in raw data (exact match first, then fuzzy)
                value = None
                if source_field in raw_data:
                    value = raw_data[source_field]
                else:
                    # Try fuzzy matching for pattern-based extractions
                    for key, val in raw_data.items():
                        if self._field_similarity(source_field, key) > 0.7:
                            value = val
                            break
                
                if value:
                    transformed_value = self._transform_value(value, data_type)
                    if transformed_value is not None:
                        event_data[target_field] = transformed_value
            
            # Try to infer missing required fields from raw data
            if not event_data.get("number"):
                # Look for phone number pattern
                for key, value in raw_data.items():
                    if "phone" in key or self._is_phone_number(str(value)):
                        event_data["number"] = self._normalize_phone(str(value))
                        break
            
            if not event_data.get("ts"):
                # Try to construct timestamp from date/time fields
                date_val = None
                time_val = None
                
                for key, value in raw_data.items():
                    if "date" in key:
                        date_val = value
                    elif "time" in key:
                        time_val = value
                
                if date_val:
                    event_data["ts"] = self._parse_datetime(date_val, time_val)
            
            # Set defaults for missing fields
            if not event_data.get("type"):
                event_data["type"] = "call"  # Default assumption
            
            if not event_data.get("direction"):
                # Try to infer from raw data
                for key, value in raw_data.items():
                    if "direction" in key or key == "direction":
                        if value in ["I", "IN", "INBOUND"]:
                            event_data["direction"] = "inbound"
                        elif value in ["O", "OUT", "OUTBOUND"]:
                            event_data["direction"] = "outbound"
                        break
                else:
                    event_data["direction"] = "outbound"  # Default assumption
            
            return event_data if self._has_required_fields(event_data) else None
            
        except Exception as e:
            logger.debug(f"Event conversion failed for line {line_num}", error=str(e))
            return None
    
    def _field_similarity(self, field1: str, field2: str) -> float:
        """Calculate similarity between field names"""
        field1 = field1.lower().replace('_', '').replace('-', '')
        field2 = field2.lower().replace('_', '').replace('-', '')
        
        if field1 == field2:
            return 1.0
        
        if field1 in field2 or field2 in field1:
            return 0.8
        
        # Simple character overlap
        common = set(field1) & set(field2)
        total = set(field1) | set(field2)
        
        return len(common) / len(total) if total else 0.0
    
    def _transform_value(self, value: str, data_type: str) -> Any:
        """Transform value to target data type"""
        if not value or value.strip() == '':
            return None
        
        value = value.strip()
        
        try:
            if data_type == "string":
                return value
            
            elif data_type == "number":
                # Handle duration formats
                if len(value) == 6 and value.isdigit():  # HHMMSS format
                    hours = int(value[:2])
                    minutes = int(value[2:4])
                    seconds = int(value[4:6])
                    return hours * 3600 + minutes * 60 + seconds
                elif ':' in value:
                    parts = value.split(':')
                    if len(parts) == 2:
                        return int(parts[0]) * 60 + int(parts[1])
                    elif len(parts) == 3:
                        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                
                return int(value)
            
            elif data_type == "date":
                return self._parse_datetime(value)
            
            elif data_type == "boolean":
                return value.upper() in ['I', 'IN', 'INBOUND', 'TRUE', '1', 'YES']
            
            else:
                return value
        
        except:
            return value  # Return original if transformation fails
    
    def _parse_datetime(self, date_val: str, time_val: str = None) -> str:
        """Parse date and time values to ISO format"""
        try:
            # Handle YYYYMMDD date format
            if len(date_val) == 8 and date_val.isdigit():
                year = date_val[:4]
                month = date_val[4:6]
                day = date_val[6:8]
                date_str = f"{year}-{month}-{day}"
            else:
                date_str = date_val
            
            # Handle HHMMSS time format
            if time_val:
                if len(time_val) == 6 and time_val.isdigit():
                    hour = time_val[:2]
                    minute = time_val[2:4]
                    second = time_val[4:6]
                    time_str = f"{hour}:{minute}:{second}"
                else:
                    time_str = time_val
                
                datetime_str = f"{date_str} {time_str}"
            else:
                datetime_str = date_str
            
            # Try to parse with common formats
            formats = [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%Y-%m-%d",
                "%m/%d/%Y %H:%M:%S",
                "%m/%d/%Y %H:%M",
                "%m/%d/%Y",
            ]
            
            for fmt in formats:
                try:
                    dt = datetime.strptime(datetime_str, fmt)
                    return dt.isoformat()
                except ValueError:
                    continue
            
            return datetime_str  # Return as-is if parsing fails
            
        except:
            return date_val  # Return original date if parsing fails
    
    def _is_phone_number(self, value: str) -> bool:
        """Check if value looks like a phone number"""
        cleaned = re.sub(r'[^0-9+]', '', value)
        return len(cleaned) >= 10 and cleaned.isdigit()
    
    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone number format"""
        cleaned = re.sub(r'[^0-9+]', '', phone)
        
        if cleaned.startswith('1') and len(cleaned) == 11:
            return '+' + cleaned
        elif len(cleaned) == 10:
            return '+1' + cleaned
        else:
            return phone  # Return original if can't normalize
    
    def _has_required_fields(self, event_data: Dict[str, Any]) -> bool:
        """Check if event has minimum required fields"""
        return bool(event_data.get("number") and event_data.get("ts"))
    
    def _is_valid_event(self, event_data: Dict[str, Any]) -> bool:
        """Validate event data"""
        return self._has_required_fields(event_data) and self._is_phone_number(str(event_data["number"]))
    
    def _extract_contacts_from_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract contact information from parsed events"""
        contact_map = {}
        
        for event in events:
            phone = event.get("number")
            if not phone:
                continue
            
            normalized_phone = self._normalize_phone(phone)
            
            if normalized_phone not in contact_map:
                contact_map[normalized_phone] = {
                    "number": normalized_phone,
                    "first_seen": event.get("ts"),
                    "last_seen": event.get("ts"),
                    "total_calls": 0,
                    "total_sms": 0,
                    "metadata": {"source": "cdr_import"}
                }
            
            contact = contact_map[normalized_phone]
            
            # Update statistics
            if event.get("type") == "call":
                contact["total_calls"] += 1
            elif event.get("type") in ["sms", "text"]:
                contact["total_sms"] += 1
            
            # Update date range
            event_ts = event.get("ts")
            if event_ts:
                if not contact["first_seen"] or event_ts < contact["first_seen"]:
                    contact["first_seen"] = event_ts
                if not contact["last_seen"] or event_ts > contact["last_seen"]:
                    contact["last_seen"] = event_ts
        
        return list(contact_map.values())


# Global CDR parser instance
cdr_parser = CDRParser()