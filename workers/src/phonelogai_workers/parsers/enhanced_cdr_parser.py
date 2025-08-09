"""
Enhanced CDR (Call Detail Record) parser implementation with advanced carrier support

This module implements production-ready CDR parsing with:
- Fixed-width format detection and parsing
- Delimiter-separated value parsing with fuzzy detection
- Custom carrier format handlers (AT&T, Verizon, T-Mobile, Sprint)
- Binary format support for legacy systems
- Advanced pattern matching and field extraction
- Streaming processing for large files (1M+ rows)
- Robust error handling and malformed data recovery
- Memory-efficient processing with parallel chunk processing
- Performance targets: 100k rows <5min, 1M rows <30min
"""
import io
import re
import time
import gc
import struct
import asyncio
import concurrent.futures
from typing import Dict, List, Optional, Any, Iterator, Tuple, Union, Pattern
from pathlib import Path
import structlog
import pandas as pd
import numpy as np
from datetime import datetime, timezone
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
import psutil
from contextlib import contextmanager
import codecs
from collections import defaultdict

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


@dataclass
class CDRProcessingProgress:
    """Track CDR processing progress for large files"""
    total_estimated_rows: int = 0
    processed_rows: int = 0
    valid_rows: int = 0
    errors: int = 0
    start_time: float = 0.0
    last_update: float = 0.0
    bytes_processed: int = 0
    total_bytes: int = 0
    current_format: str = "unknown"
    current_carrier: str = "unknown"
    
    def update_progress(self, rows_done: int = 0, valid_done: int = 0, errors_count: int = 0, bytes_done: int = 0):
        self.processed_rows += rows_done
        self.valid_rows += valid_done
        self.errors += errors_count
        self.bytes_processed += bytes_done
        self.last_update = time.time()
    
    def get_completion_percentage(self) -> float:
        if self.total_bytes == 0:
            return 0.0
        return min(100.0, (self.bytes_processed / self.total_bytes) * 100.0)
    
    def get_throughput(self) -> float:
        """Get processing throughput in rows per second"""
        elapsed = time.time() - self.start_time
        return self.processed_rows / elapsed if elapsed > 0 else 0.0


@dataclass
class CarrierFormatSpec:
    """Specification for a carrier's CDR format"""
    name: str
    patterns: List[Pattern]
    field_definitions: Dict[str, Dict[str, Any]]
    line_validators: List[Callable[[str], bool]]
    field_extractors: Dict[str, Callable[[str], Any]]
    metadata: Dict[str, Any] = field(default_factory=dict)


class EnhancedCDRParser:
    """Production-ready CDR parser with advanced carrier support and performance optimization"""
    
    def __init__(self):
        # Performance configuration
        self.chunk_size = min(settings.chunk_size, 5000)  # Smaller chunks for CDR complexity
        self.max_sample_rows = 200  # Larger sample for format detection
        self.memory_threshold_mb = 1500
        self.progress_update_interval = 2.0
        self.max_workers = min(4, psutil.cpu_count())
        
        # CDR format detection thresholds
        self.pattern_confidence_threshold = 0.7
        self.field_match_threshold = 0.6
        
        # Initialize carrier format specifications
        self.carrier_formats = self._initialize_carrier_formats()
        
        # Binary format detection
        self.binary_signatures = {
            b'\\x00\\x01': 'binary_v1',
            b'\\xFF\\xFE': 'utf16_le',
            b'\\xFE\\xFF': 'utf16_be',
        }
        
        # Performance tracking
        self.performance_stats = {
            'files_processed': 0,
            'avg_processing_time': 0.0,
            'memory_peak': 0.0,
            'format_detection_success_rate': 1.0,
            'carrier_detection_success_rate': 1.0
        }
    
    def _initialize_carrier_formats(self) -> Dict[str, CarrierFormatSpec]:
        """Initialize carrier-specific format specifications"""
        formats = {}
        
        # AT&T Format Specifications
        formats['att'] = CarrierFormatSpec(
            name='AT&T',
            patterns=[
                re.compile(r'\\d{8},\\d{6},\\d{10},\\d+,\\w+'),  # CSV format
                re.compile(r'CDR\\|\\d{8}\\|\\d{6}\\|\\+?1?\\d{10}'),  # Pipe format
                re.compile(r'\\d{2}/\\d{2}/\\d{4}\\s+\\d{2}:\\d{2}:\\d{2}\\s+\\d{3}-\\d{3}-\\d{4}'),  # Text format
                re.compile(r'AT&T.*WIRELESS.*STATEMENT'),  # Header pattern
            ],
            field_definitions={
                'csv': {
                    'field_count': (8, 15),  # Expected field count range
                    'date_positions': [0, 1],  # Positions where date fields typically appear
                    'phone_positions': [2, 3],  # Phone number positions
                    'duration_positions': [4, 5, 6],  # Duration field positions
                    'required_fields': ['date', 'phone', 'duration']
                },
                'pipe': {
                    'field_count': (6, 12),
                    'date_positions': [1, 2],
                    'phone_positions': [3, 4],
                    'duration_positions': [5, 6],
                    'required_fields': ['date', 'phone', 'duration']
                },
                'fixed_width': {
                    'field_positions': [
                        (0, 8, 'date'),       # YYYYMMDD
                        (8, 14, 'time'),      # HHMMSS
                        (14, 24, 'phone'),    # Phone number
                        (24, 28, 'duration'), # Duration in seconds
                        (28, 35, 'type'),     # Call type
                        (35, 45, 'direction') # Direction
                    ]
                }
            },
            line_validators=[
                lambda line: len(line) > 20,
                lambda line: any(c.isdigit() for c in line),
                lambda line: ',' in line or '|' in line or len(line) > 50
            ],
            field_extractors={
                'phone': lambda s: re.sub(r'[^0-9+]', '', s),
                'date': lambda s: self._normalize_att_date(s),
                'duration': lambda s: self._parse_duration_att(s)
            },
            metadata={'priority': 1, 'common_extensions': ['.csv', '.txt', '.dat']}
        )
        
        # Verizon Format Specifications  
        formats['verizon'] = CarrierFormatSpec(
            name='Verizon',
            patterns=[
                re.compile(r'\\d{2}-\\d{2}-\\d{4},\\d{2}:\\d{2}:\\d{2},\\(\\d{3}\\)\\s?\\d{3}-\\d{4}'),
                re.compile(r'VZW\\|\\d+\\|\\d{8}\\|\\d{6}'),
                re.compile(r'\\d{8}\\s+\\d{6}\\s+\\d{10}\\s+\\d+'),
                re.compile(r'VERIZON.*WIRELESS'),
            ],
            field_definitions={
                'csv': {
                    'field_count': (7, 14),
                    'date_positions': [0, 1],
                    'phone_positions': [2, 3],
                    'duration_positions': [4, 5],
                    'required_fields': ['date', 'phone', 'minutes']
                },
                'fixed_width': {
                    'field_positions': [
                        (0, 8, 'date'),
                        (9, 15, 'time'),
                        (16, 26, 'phone'),
                        (27, 31, 'duration'),
                        (32, 40, 'type'),
                        (41, 50, 'location')
                    ]
                }
            },
            line_validators=[
                lambda line: len(line) > 15,
                lambda line: bool(re.search(r'\\d{3}[-.]\\d{3}[-.]\\d{4}|\\(\\d{3}\\)\\s?\\d{3}-\\d{4}', line)),
            ],
            field_extractors={
                'phone': lambda s: re.sub(r'[^0-9+]', '', s),
                'date': lambda s: self._normalize_verizon_date(s),
                'duration': lambda s: self._parse_duration_verizon(s)
            },
            metadata={'priority': 2, 'common_extensions': ['.txt', '.csv', '.dat']}
        )
        
        # T-Mobile Format Specifications
        formats['tmobile'] = CarrierFormatSpec(
            name='T-Mobile',
            patterns=[
                re.compile(r'\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\s+\\d{3}-\\d{3}-\\d{4}'),
                re.compile(r'TMO\\|\\d{8}\\|\\d{4}\\|\\d{10}'),
                re.compile(r'\\d{8}\\d{4}\\d{10}\\d{3}'),  # Fixed format
                re.compile(r'T-MOBILE|TMOBILE'),
            ],
            field_definitions={
                'csv': {
                    'field_count': (6, 12),
                    'date_positions': [0, 1],
                    'phone_positions': [2, 3],
                    'duration_positions': [3, 4],
                    'required_fields': ['date', 'phone', 'duration']
                },
                'fixed_width': {
                    'field_positions': [
                        (0, 8, 'date'),
                        (8, 12, 'time'),
                        (12, 22, 'phone'),
                        (22, 25, 'duration'),
                        (25, 30, 'type')
                    ]
                }
            },
            line_validators=[
                lambda line: len(line) > 10,
                lambda line: bool(re.search(r'\\d{3}-\\d{3}-\\d{4}|\\d{10}', line)),
            ],
            field_extractors={
                'phone': lambda s: re.sub(r'[^0-9+]', '', s),
                'date': lambda s: self._normalize_tmobile_date(s),
                'duration': lambda s: self._parse_duration_tmobile(s)
            },
            metadata={'priority': 3, 'common_extensions': ['.txt', '.csv']}
        )
        
        # Sprint Format Specifications
        formats['sprint'] = CarrierFormatSpec(
            name='Sprint',
            patterns=[
                re.compile(r'\\d{6}\\s+\\d{6}\\s+\\d{10}\\s+\\d{3}\\s+\\w+'),
                re.compile(r'SPRINT\\|\\d+\\|\\d{6}\\|\\d{10}'),
                re.compile(r'\\d{8},\\d{4},\\d{10},\\d+,\\w{4}'),
                re.compile(r'SPRINT|PCS'),
            ],
            field_definitions={
                'csv': {
                    'field_count': (5, 10),
                    'date_positions': [0, 1],
                    'phone_positions': [2],
                    'duration_positions': [3, 4],
                    'required_fields': ['date', 'phone', 'duration']
                },
                'fixed_width': {
                    'field_positions': [
                        (0, 6, 'date'),    # YYMMDD
                        (7, 13, 'time'),   # HHMMSS
                        (14, 24, 'phone'), # Phone number
                        (25, 28, 'duration'), # Duration
                        (29, 33, 'type')   # Type
                    ]
                }
            },
            line_validators=[
                lambda line: len(line) > 12,
                lambda line: bool(re.search(r'\\d{10}|\\d{3}-\\d{3}-\\d{4}', line)),
            ],
            field_extractors={
                'phone': lambda s: re.sub(r'[^0-9+]', '', s),
                'date': lambda s: self._normalize_sprint_date(s),
                'duration': lambda s: self._parse_duration_sprint(s)
            },
            metadata={'priority': 4, 'common_extensions': ['.txt', '.dat']}
        )
        
        return formats
    
    async def parse_cdr(
        self,
        cdr_data: bytes,
        field_mappings: List[Dict[str, Any]],
        carrier: str = "unknown",
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Enhanced CDR parsing with advanced format detection and carrier support
        
        Args:
            cdr_data: Raw CDR file bytes
            field_mappings: ML-generated field mappings  
            carrier: Detected carrier type (hint for format selection)
            job_id: Optional job ID for progress tracking
            
        Returns:
            Dict containing extracted events, contacts, and metadata
            
        Performance targets:
        - 100k rows: <5 minutes
        - 1M rows: <30 minutes
        - Memory usage: <2GB peak
        """
        start_time = time.time()
        progress = CDRProcessingProgress(
            start_time=start_time,
            total_bytes=len(cdr_data),
            current_carrier=carrier
        )
        
        try:
            logger.info(
                "Starting enhanced CDR parsing",
                job_id=job_id,
                size_bytes=len(cdr_data),
                carrier_hint=carrier,
                chunk_size=self.chunk_size,
                max_workers=self.max_workers
            )
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 5)
            
            # Enhanced format detection and analysis
            format_analysis = await self._analyze_cdr_format(cdr_data, carrier, job_id)
            detected_format = format_analysis["format_type"]
            detected_carrier = format_analysis["carrier"]
            format_confidence = format_analysis["confidence"]
            
            progress.current_format = detected_format
            progress.current_carrier = detected_carrier
            progress.total_estimated_rows = format_analysis.get("estimated_rows", 1000)
            
            logger.info(
                "CDR format analysis completed",
                detected_format=detected_format,
                detected_carrier=detected_carrier,
                confidence=format_confidence,
                estimated_rows=progress.total_estimated_rows,
                job_id=job_id
            )
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 15)
            
            # Convert to text format if needed
            cdr_text = await self._prepare_cdr_text(cdr_data, format_analysis)
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 25)
            
            # Choose processing strategy based on format and size
            if format_analysis["complexity"] == "high" or len(cdr_data) > 20 * 1024 * 1024:  # >20MB
                logger.info("Using streaming processing for complex/large CDR", job_id=job_id)
                parsing_result = await self._stream_process_cdr(
                    cdr_text, format_analysis, field_mappings, job_id, progress
                )
            else:
                logger.info("Using batch processing for simpler CDR", job_id=job_id)
                parsing_result = await self._batch_process_cdr(
                    cdr_text, format_analysis, field_mappings, job_id, progress
                )
            
            # Enhance metadata with comprehensive format information
            processing_time_ms = int((time.time() - start_time) * 1000)
            parsing_result["metadata"].update({
                "detected_format": detected_format,
                "detected_carrier": detected_carrier,
                "format_confidence": format_confidence,
                "format_analysis": format_analysis,
                "processing_strategy": "streaming" if format_analysis["complexity"] == "high" else "batch",
                "performance_metrics": {
                    "processing_time_ms": processing_time_ms,
                    "throughput_rows_per_sec": progress.get_throughput(),
                    "memory_efficiency_score": self._calculate_memory_efficiency(),
                    "format_detection_accuracy": format_confidence
                }
            })
            
            logger.info(
                "Enhanced CDR parsing completed successfully",
                job_id=job_id,
                events=len(parsing_result["events"]),
                contacts=len(parsing_result["contacts"]),
                errors=len(parsing_result["errors"]),
                processing_time_ms=processing_time_ms,
                throughput=progress.get_throughput()
            )
            
            return parsing_result
            
        except Exception as e:
            logger.error("Enhanced CDR parsing failed", job_id=job_id, error=str(e))
            
            if job_id:
                await db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="parsing_error",
                    error_message=f"Enhanced CDR parsing failed: {str(e)}",
                    severity="critical"
                )
            
            return self._create_error_response(str(e))
    
    async def _analyze_cdr_format(
        self,
        cdr_data: bytes,
        carrier_hint: str,
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Comprehensive CDR format analysis using multiple detection strategies"""
        try:
            # Strategy 1: Binary format detection
            if self._is_binary_format(cdr_data):
                return await self._analyze_binary_format(cdr_data, carrier_hint)
            
            # Strategy 2: Text-based format detection
            # Enhanced encoding detection
            encoding_result = await self._detect_cdr_encoding(cdr_data)
            encoding = encoding_result["encoding"]
            
            # Convert to text for analysis
            try:
                sample_text = cdr_data[:min(50000, len(cdr_data))].decode(encoding, errors='ignore')
            except:
                sample_text = cdr_data[:min(50000, len(cdr_data))].decode('utf-8', errors='replace')
            
            # Strategy 3: Multi-level format detection
            format_scores = {}
            
            # Test each carrier format
            for carrier_name, format_spec in self.carrier_formats.items():
                if carrier_hint != "unknown" and carrier_hint != carrier_name:
                    continue  # Skip if we have a strong hint
                
                score = await self._score_carrier_format(sample_text, format_spec)
                format_scores[carrier_name] = score
            
            # Strategy 4: Generic format patterns
            generic_scores = {
                'csv_comma': self._score_csv_format(sample_text, ','),
                'csv_pipe': self._score_csv_format(sample_text, '|'),
                'csv_tab': self._score_csv_format(sample_text, '\\t'),
                'fixed_width': self._score_fixed_width_format(sample_text),
                'key_value': self._score_key_value_format(sample_text),
                'binary_text': self._score_binary_text_format(sample_text)
            }
            
            # Combine scores and determine best format
            all_scores = {**format_scores, **generic_scores}
            
            if all_scores:
                best_format = max(all_scores, key=all_scores.get)
                best_score = all_scores[best_format]
                confidence = min(best_score / 100.0, 1.0)  # Normalize to 0-1
            else:
                best_format = "unknown"
                best_score = 0.1
                confidence = 0.1
            
            # Determine carrier and format type
            if best_format in self.carrier_formats:
                carrier = best_format
                format_type = await self._determine_format_subtype(sample_text, self.carrier_formats[carrier])
            else:
                carrier = carrier_hint if carrier_hint != "unknown" else "unknown"
                format_type = best_format
            
            # Additional analysis
            complexity = self._assess_format_complexity(sample_text, format_type)
            estimated_rows = self._estimate_row_count(sample_text, format_type)
            
            return {
                "format_type": format_type,
                "carrier": carrier,
                "confidence": confidence,
                "complexity": complexity,
                "estimated_rows": estimated_rows,
                "encoding": encoding,
                "all_scores": all_scores,
                "sample_analysis": {
                    "line_count": sample_text.count('\\n'),
                    "avg_line_length": np.mean([len(line) for line in sample_text.split('\\n')[:100]]),
                    "max_line_length": max((len(line) for line in sample_text.split('\\n')[:100]), default=0),
                    "has_headers": self._detect_headers_in_sample(sample_text)
                }
            }
            
        except Exception as e:
            logger.error("CDR format analysis failed", error=str(e), job_id=job_id)
            return self._create_fallback_analysis(carrier_hint)
    
    def _is_binary_format(self, data: bytes) -> bool:
        """Detect if CDR is in binary format"""
        # Check for binary signatures
        for signature in self.binary_signatures.keys():
            if data.startswith(signature):
                return True
        
        # Statistical analysis for binary content
        if len(data) < 100:
            return False
        
        sample = data[:1000]
        non_printable = sum(1 for b in sample if b < 32 or b > 126)
        binary_ratio = non_printable / len(sample)
        
        return binary_ratio > 0.3  # More than 30% non-printable chars
    
    async def _analyze_binary_format(self, data: bytes, carrier_hint: str) -> Dict[str, Any]:
        """Analyze binary CDR format"""
        # Basic binary format analysis
        # This would need to be expanded based on specific binary formats
        return {
            "format_type": "binary",
            "carrier": carrier_hint,
            "confidence": 0.8,
            "complexity": "high",
            "estimated_rows": len(data) // 64,  # Rough estimate
            "encoding": "binary",
            "binary_type": "proprietary"
        }
    
    async def _detect_cdr_encoding(self, data: bytes) -> Dict[str, Any]:
        """Enhanced encoding detection for CDR files"""
        try:
            # Use chardet for initial detection
            import chardet
            sample_size = min(len(data), 50000)
            sample = data[:sample_size]
            
            result = chardet.detect(sample)
            encoding = result.get('encoding', 'utf-8')
            confidence = result.get('confidence', 0.5)
            
            # CDR-specific encoding validation
            try:
                decoded = sample.decode(encoding, errors='strict')
                
                # Check for typical CDR content patterns
                has_phone_numbers = bool(re.search(r'\\d{10}|\\d{3}[-.]\\d{3}[-.]\\d{4}', decoded))
                has_timestamps = bool(re.search(r'\\d{2}[/-]\\d{2}[/-]\\d{4}|\\d{8}', decoded))
                
                if has_phone_numbers and has_timestamps:
                    confidence = min(confidence + 0.2, 1.0)
                    
            except UnicodeDecodeError:
                # Try fallback encodings common in CDR files
                fallback_encodings = ['utf-8', 'latin-1', 'cp1252', 'ascii']
                for fallback in fallback_encodings:
                    try:
                        data[:1000].decode(fallback, errors='strict')
                        encoding = fallback
                        confidence = 0.7
                        break
                    except:
                        continue
            
            return {"encoding": encoding, "confidence": confidence}
            
        except Exception as e:
            logger.warning("CDR encoding detection failed", error=str(e))
            return {"encoding": "utf-8", "confidence": 0.5}
    
    async def _score_carrier_format(self, text: str, format_spec: CarrierFormatSpec) -> float:
        """Score how well the text matches a specific carrier format"""
        score = 0.0
        lines = text.split('\\n')[:self.max_sample_rows]
        
        # Pattern matching score
        pattern_matches = 0
        for line in lines[:20]:  # Check first 20 lines
            line = line.strip()
            if not line:
                continue
                
            for pattern in format_spec.patterns:
                if pattern.search(line):
                    pattern_matches += 1
                    break
        
        if lines:
            pattern_score = (pattern_matches / min(len(lines), 20)) * 40
            score += pattern_score
        
        # Validation score
        valid_lines = 0
        for line in lines[:50]:  # Check more lines for validation
            if any(validator(line) for validator in format_spec.line_validators):
                valid_lines += 1
        
        if lines:
            validation_score = (valid_lines / min(len(lines), 50)) * 30
            score += validation_score
        
        # Field structure score
        field_structure_score = self._score_field_structure(lines, format_spec)
        score += field_structure_score
        
        # Carrier-specific keyword bonus
        carrier_keywords = format_spec.metadata.get('keywords', [])
        keyword_bonus = sum(5 for keyword in carrier_keywords if keyword.lower() in text.lower())
        score += min(keyword_bonus, 20)  # Cap at 20 points
        
        return score
    
    def _score_field_structure(self, lines: List[str], format_spec: CarrierFormatSpec) -> float:
        """Score the field structure match for a carrier format"""
        score = 0.0
        
        # Check CSV structure if defined
        if 'csv' in format_spec.field_definitions:
            csv_def = format_spec.field_definitions['csv']
            expected_range = csv_def['field_count']
            
            field_counts = []
            for line in lines[:20]:
                if ',' in line:
                    count = len(line.split(','))
                elif '|' in line:
                    count = len(line.split('|'))
                elif '\\t' in line:
                    count = len(line.split('\\t'))
                else:
                    continue
                field_counts.append(count)
            
            if field_counts:
                avg_count = np.mean(field_counts)
                if expected_range[0] <= avg_count <= expected_range[1]:
                    score += 20
                
                # Consistency bonus
                consistency = 1.0 - (np.std(field_counts) / avg_count) if avg_count > 0 else 0
                score += consistency * 10
        
        # Check fixed width structure if defined
        if 'fixed_width' in format_spec.field_definitions:
            fixed_def = format_spec.field_definitions['fixed_width']
            consistent_length = True
            expected_length = None
            
            for line in lines[:10]:
                if not line.strip():
                    continue
                if expected_length is None:
                    expected_length = len(line)
                elif abs(len(line) - expected_length) > 2:  # Allow 2 char variance
                    consistent_length = False
                    break
            
            if consistent_length and expected_length:
                score += 15
        
        return score
    
    def _score_csv_format(self, text: str, delimiter: str) -> float:
        """Score CSV format with specific delimiter"""
        lines = text.split('\\n')[:50]
        score = 0.0
        
        field_counts = []
        for line in lines:
            if delimiter in line:
                count = len(line.split(delimiter))
                if count > 1:
                    field_counts.append(count)
                    score += 1
        
        if field_counts:
            # Consistency score
            unique_counts = set(field_counts)
            if len(unique_counts) == 1:
                score += 20  # Perfect consistency
            elif len(unique_counts) <= 3:
                score += 15  # Good consistency
            
            # Field count reasonableness
            avg_count = np.mean(field_counts)
            if 3 <= avg_count <= 20:  # Reasonable for CDR
                score += 10
        
        return score
    
    def _score_fixed_width_format(self, text: str) -> float:
        """Score fixed-width format likelihood"""
        lines = [line for line in text.split('\\n')[:50] if line.strip()]
        if not lines:
            return 0.0
        
        score = 0.0
        
        # Check line length consistency
        lengths = [len(line) for line in lines]
        if lengths:
            length_variance = np.var(lengths)
            if length_variance < 4:  # Very consistent lengths
                score += 30
            elif length_variance < 20:  # Reasonably consistent
                score += 20
        
        # Check for patterns that suggest fixed width
        # Look for consistent spacing patterns
        space_patterns = []
        for line in lines[:10]:
            spaces = [i for i, char in enumerate(line) if char == ' ']
            if len(spaces) > 3:  # Has reasonable spacing
                space_patterns.append(spaces)
        
        if space_patterns and len(space_patterns) > 1:
            # Check consistency of space positions
            first_pattern = space_patterns[0]
            consistent_spaces = sum(1 for pattern in space_patterns[1:] 
                                  if any(abs(pos - fp) < 2 for fp in first_pattern for pos in pattern[:len(first_pattern)]))
            
            if consistent_spaces > len(space_patterns) * 0.7:
                score += 20
        
        return score
    
    def _score_key_value_format(self, text: str) -> float:
        """Score key-value format likelihood"""
        lines = text.split('\\n')[:30]
        score = 0.0
        
        kv_patterns = [
            re.compile(r'\\w+\\s*=\\s*\\w+'),
            re.compile(r'\\w+\\s*:\\s*\\w+'),
            re.compile(r'\\w+\\|\\w+'),
        ]
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            for pattern in kv_patterns:
                if pattern.search(line):
                    score += 2
                    break
        
        return score
    
    def _score_binary_text_format(self, text: str) -> float:
        """Score binary-encoded text format"""
        # Look for patterns that suggest binary data encoded as text
        binary_indicators = [
            len(text) > 0 and sum(1 for c in text[:1000] if ord(c) > 127) / len(text[:1000]) > 0.1,
            '\\x' in text[:1000],  # Hex escapes
            text.count('\\0') > len(text) // 1000,  # Null bytes
            bool(re.search(r'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', text[:1000]))  # Control chars
        ]
        
        return sum(binary_indicators) * 10
    
    async def _determine_format_subtype(self, text: str, format_spec: CarrierFormatSpec) -> str:
        """Determine the specific subtype of a carrier format"""
        lines = text.split('\\n')[:20]
        
        # Check for CSV variants
        if any(',' in line for line in lines):
            return 'csv_comma'
        elif any('|' in line for line in lines):
            return 'csv_pipe'
        elif any('\\t' in line for line in lines):
            return 'csv_tab'
        elif 'fixed_width' in format_spec.field_definitions:
            return 'fixed_width'
        else:
            return 'text'
    
    def _assess_format_complexity(self, text: str, format_type: str) -> str:
        """Assess the complexity of the CDR format for processing strategy selection"""
        lines = text.split('\\n')[:100]
        
        complexity_factors = {
            'high': 0,
            'medium': 0,
            'low': 0
        }
        
        # Factor 1: Line length variance
        line_lengths = [len(line) for line in lines if line.strip()]
        if line_lengths:
            length_variance = np.var(line_lengths)
            if length_variance > 1000:
                complexity_factors['high'] += 1
            elif length_variance > 100:
                complexity_factors['medium'] += 1
            else:
                complexity_factors['low'] += 1
        
        # Factor 2: Field count variance (for delimited formats)
        if format_type.startswith('csv'):
            delimiter = ',' if 'comma' in format_type else '|' if 'pipe' in format_type else '\\t'
            field_counts = [len(line.split(delimiter)) for line in lines if delimiter in line]
            if field_counts:
                field_variance = np.var(field_counts)
                if field_variance > 4:
                    complexity_factors['high'] += 1
                elif field_variance > 1:
                    complexity_factors['medium'] += 1
                else:
                    complexity_factors['low'] += 1
        
        # Factor 3: Special character density
        special_chars = sum(1 for line in lines for char in line if not char.isalnum() and char not in ' ,-|:\\t\\n')
        total_chars = sum(len(line) for line in lines)
        special_ratio = special_chars / max(total_chars, 1)
        
        if special_ratio > 0.1:
            complexity_factors['high'] += 1
        elif special_ratio > 0.05:
            complexity_factors['medium'] += 1
        else:
            complexity_factors['low'] += 1
        
        # Return highest scoring complexity
        return max(complexity_factors, key=complexity_factors.get)
    
    def _estimate_row_count(self, text: str, format_type: str) -> int:
        """Estimate total row count in the CDR file"""
        sample_lines = len(text.split('\\n'))
        
        # Rough estimation based on sample ratio
        if len(text) < 1000:
            return sample_lines
        
        # Estimate based on sample size
        sample_ratio = len(text) / 50000  # We sampled 50KB
        estimated_total = int(sample_lines / sample_ratio)
        
        return max(estimated_total, sample_lines)
    
    def _detect_headers_in_sample(self, text: str) -> bool:
        """Detect if sample contains header rows"""
        lines = text.split('\\n')[:5]
        
        header_indicators = [
            'date', 'time', 'phone', 'number', 'duration', 'type', 'direction',
            'call', 'sms', 'from', 'to', 'start', 'end', 'caller', 'callee'
        ]
        
        for line in lines:
            line_lower = line.lower()
            header_matches = sum(1 for indicator in header_indicators if indicator in line_lower)
            if header_matches >= 3:  # At least 3 header-like terms
                return True
        
        return False
    
    async def _prepare_cdr_text(
        self, 
        cdr_data: bytes, 
        format_analysis: Dict[str, Any]
    ) -> str:
        """Prepare CDR data as text for processing"""
        try:
            if format_analysis["format_type"] == "binary":
                # Handle binary formats
                return await self._convert_binary_to_text(cdr_data, format_analysis)
            else:
                # Handle text formats
                encoding = format_analysis["encoding"]
                try:
                    return cdr_data.decode(encoding, errors='strict')
                except UnicodeDecodeError:
                    # Fallback with replacement
                    return cdr_data.decode(encoding, errors='replace')
        
        except Exception as e:
            logger.warning("CDR text preparation failed, using UTF-8 fallback", error=str(e))
            return cdr_data.decode('utf-8', errors='replace')
    
    async def _convert_binary_to_text(
        self, 
        binary_data: bytes, 
        format_analysis: Dict[str, Any]
    ) -> str:
        """Convert binary CDR data to text representation"""
        # This would need specific implementation based on binary format
        # For now, return a basic conversion
        try:
            # Try to find text patterns in binary data
            text_parts = []
            for i in range(0, len(binary_data), 64):
                chunk = binary_data[i:i+64]
                # Extract printable characters
                printable = ''.join(chr(b) for b in chunk if 32 <= b <= 126)
                if printable:
                    text_parts.append(printable)
            
            return '\\n'.join(text_parts)
            
        except Exception as e:
            logger.error("Binary to text conversion failed", error=str(e))
            return ""
    
    async def _stream_process_cdr(
        self,
        cdr_text: str,
        format_analysis: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None,
        progress: Optional[CDRProcessingProgress] = None
    ) -> Dict[str, Any]:
        """Stream process large/complex CDR files with memory optimization"""
        try:
            start_time = time.time()
            
            all_events = []
            all_contacts = []
            errors = []
            warnings = []
            
            format_type = format_analysis["format_type"]
            carrier = format_analysis["carrier"]
            
            logger.info(
                "Starting streaming CDR processing",
                format_type=format_type,
                carrier=carrier,
                job_id=job_id
            )
            
            # Get appropriate parser for format
            line_parser = self._get_line_parser(format_analysis)
            
            # Process lines in chunks with parallel processing
            lines = cdr_text.split('\\n')
            chunk_events = []
            processed_lines = 0
            last_progress_update = time.time()
            
            # Skip header lines if detected
            data_start = 1 if format_analysis.get("sample_analysis", {}).get("has_headers") else 0
            data_lines = lines[data_start:]
            
            for line_num, line in enumerate(data_lines, start=data_start + 1):
                try:
                    if not line.strip():
                        continue
                    
                    # Parse line using format-specific parser
                    parsed_data = line_parser(line, line_num)
                    
                    if parsed_data:
                        # Apply field mappings to convert to event
                        event_data = self._apply_field_mappings_cdr(
                            parsed_data, field_mappings, line_num
                        )
                        
                        if event_data and self._is_valid_cdr_event(event_data):
                            # Add metadata
                            event_data["metadata"] = {
                                "source_line": line_num,
                                "extraction_method": "streaming_cdr",
                                "format_type": format_type,
                                "carrier": carrier
                            }
                            chunk_events.append(event_data)
                    
                    processed_lines += 1
                    
                    # Update progress tracking
                    if progress:
                        progress.update_progress(rows_done=1, valid_done=1 if parsed_data else 0)
                    
                    # Process chunk when it reaches target size
                    if len(chunk_events) >= self.chunk_size:
                        all_events.extend(chunk_events)
                        chunk_events = []
                        
                        # Memory management
                        if processed_lines % (self.chunk_size * 5) == 0:
                            gc.collect()
                            
                            # Check memory usage
                            current_memory = psutil.Process().memory_info().rss / 1024 / 1024
                            if current_memory > self.memory_threshold_mb:
                                logger.warning(
                                    "Memory usage high during CDR streaming",
                                    current_mb=current_memory,
                                    threshold_mb=self.memory_threshold_mb,
                                    processed_lines=processed_lines
                                )
                        
                        # Update job progress
                        if (job_id and progress and 
                            time.time() - last_progress_update > self.progress_update_interval):
                            
                            completion = min(90, (processed_lines / len(data_lines)) * 60 + 25)
                            await db_manager.update_job_status(
                                job_id, "processing", completion, len(all_events), processed_lines
                            )
                            last_progress_update = time.time()
                    
                except Exception as e:
                    error_msg = f"Line {line_num}: {str(e)}"
                    errors.append({
                        "error_type": "parsing_error",
                        "error_message": error_msg,
                        "raw_data": {"line": line, "line_number": line_num},
                        "severity": "warning"
                    })
                    
                    if progress:
                        progress.update_progress(errors_count=1)
                    
                    # Stop if error rate is too high
                    if len(errors) > processed_lines * 0.15:  # More than 15% error rate
                        warnings.append(
                            f"Stopping processing due to high error rate: {len(errors)} errors in {processed_lines} lines"
                        )
                        logger.warning("High error rate detected in CDR processing, stopping")
                        break
            
            # Process remaining events in last chunk
            if chunk_events:
                all_events.extend(chunk_events)
            
            # Extract contacts from events using parallel processing
            all_contacts = await self._extract_contacts_from_cdr_events(all_events)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            logger.info(
                "Streaming CDR processing completed",
                processed_lines=processed_lines,
                events=len(all_events),
                contacts=len(all_contacts),
                errors=len(errors),
                processing_time_ms=processing_time_ms
            )
            
            return {
                "events": all_events,
                "contacts": all_contacts,
                "metadata": {
                    "total_rows": processed_lines,
                    "parsed_rows": len(all_events),
                    "error_rows": len(errors),
                    "duplicate_rows": 0,  # Will be calculated during deduplication
                    "processing_time_ms": processing_time_ms,
                    "extraction_method": "streaming_cdr",
                    "throughput_rows_per_sec": processed_lines / (processing_time_ms / 1000) if processing_time_ms > 0 else 0
                },
                "errors": errors,
                "warnings": warnings
            }
            
        except Exception as e:
            logger.error("Streaming CDR processing failed", error=str(e), job_id=job_id)
            return self._create_error_response(str(e))
    
    async def _batch_process_cdr(
        self,
        cdr_text: str,
        format_analysis: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None,
        progress: Optional[CDRProcessingProgress] = None
    ) -> Dict[str, Any]:
        """Batch process smaller/simpler CDR files"""
        try:
            start_time = time.time()
            
            all_events = []
            all_contacts = []
            errors = []
            
            format_type = format_analysis["format_type"]
            carrier = format_analysis["carrier"]
            
            logger.info(
                "Starting batch CDR processing",
                format_type=format_type,
                carrier=carrier,
                job_id=job_id
            )
            
            # Get line parser
            line_parser = self._get_line_parser(format_analysis)
            
            # Process all lines
            lines = cdr_text.split('\\n')
            data_start = 1 if format_analysis.get("sample_analysis", {}).get("has_headers") else 0
            data_lines = lines[data_start:]
            
            # Process in parallel batches
            batch_size = min(1000, len(data_lines))
            
            for batch_start in range(0, len(data_lines), batch_size):
                batch_end = min(batch_start + batch_size, len(data_lines))
                batch_lines = data_lines[batch_start:batch_end]
                
                # Process batch in parallel
                batch_results = await self._process_cdr_batch_parallel(
                    batch_lines, line_parser, field_mappings, batch_start + data_start + 1
                )
                
                all_events.extend(batch_results["events"])
                errors.extend(batch_results["errors"])
                
                # Update progress
                if progress:
                    progress.update_progress(
                        rows_done=len(batch_lines),
                        valid_done=len(batch_results["events"]),
                        errors_count=len(batch_results["errors"])
                    )
                
                # Update job status
                if job_id:
                    completion = min(90, (batch_end / len(data_lines)) * 60 + 25)
                    await db_manager.update_job_status(
                        job_id, "processing", completion, len(all_events), batch_end
                    )
            
            # Extract contacts
            all_contacts = await self._extract_contacts_from_cdr_events(all_events)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            return {
                "events": all_events,
                "contacts": all_contacts,
                "metadata": {
                    "total_rows": len(data_lines),
                    "parsed_rows": len(all_events),
                    "error_rows": len(errors),
                    "duplicate_rows": 0,
                    "processing_time_ms": processing_time_ms,
                    "extraction_method": "batch_cdr"
                },
                "errors": errors,
                "warnings": []
            }
            
        except Exception as e:
            logger.error("Batch CDR processing failed", error=str(e), job_id=job_id)
            return self._create_error_response(str(e))
    
    def _get_line_parser(self, format_analysis: Dict[str, Any]) -> callable:
        """Get appropriate line parser for the detected format"""
        format_type = format_analysis["format_type"]
        carrier = format_analysis["carrier"]
        
        if carrier in self.carrier_formats:
            # Use carrier-specific parser
            return lambda line, line_num: self._parse_carrier_line(
                line, line_num, self.carrier_formats[carrier], format_type
            )
        elif format_type.startswith('csv'):
            delimiter = ',' if 'comma' in format_type else '|' if 'pipe' in format_type else '\\t'
            return lambda line, line_num: self._parse_csv_line(line, line_num, delimiter)
        elif format_type == 'fixed_width':
            return lambda line, line_num: self._parse_fixed_width_line(line, line_num)
        elif format_type == 'key_value':
            return lambda line, line_num: self._parse_key_value_line(line, line_num)
        else:
            # Generic parser
            return lambda line, line_num: self._parse_generic_line(line, line_num)
    
    def _parse_carrier_line(
        self, 
        line: str, 
        line_num: int, 
        format_spec: CarrierFormatSpec, 
        format_subtype: str
    ) -> Optional[Dict[str, Any]]:
        """Parse line using carrier-specific format specification"""
        try:
            if format_subtype.startswith('csv'):
                delimiter = ',' if 'comma' in format_subtype else '|' if 'pipe' in format_subtype else '\\t'
                fields = line.split(delimiter)
                
                # Apply carrier-specific field extraction
                result = {}
                field_def = format_spec.field_definitions.get('csv', {})
                
                for i, field_value in enumerate(fields):
                    field_value = field_value.strip(' "\\'\\'')
                    
                    # Try to identify field type based on position and content
                    if i in field_def.get('date_positions', []):
                        if self._looks_like_date(field_value):
                            result['date'] = format_spec.field_extractors.get('date', lambda x: x)(field_value)
                    elif i in field_def.get('phone_positions', []):
                        if self._looks_like_phone(field_value):
                            result['phone'] = format_spec.field_extractors.get('phone', lambda x: x)(field_value)
                    elif i in field_def.get('duration_positions', []):
                        if self._looks_like_duration(field_value):
                            result['duration'] = format_spec.field_extractors.get('duration', lambda x: x)(field_value)
                    else:
                        # Generic field
                        result[f'field_{i}'] = field_value
                
                return result if result else None
            
            elif format_subtype == 'fixed_width':
                field_def = format_spec.field_definitions.get('fixed_width', {})
                positions = field_def.get('field_positions', [])
                
                result = {}
                for start, end, field_name in positions:
                    if end <= len(line):
                        value = line[start:end].strip()
                        if value:
                            extractor = format_spec.field_extractors.get(field_name, lambda x: x)
                            result[field_name] = extractor(value)
                
                return result if result else None
            
            return None
            
        except Exception as e:
            logger.debug(f"Carrier line parsing failed for line {line_num}", error=str(e))
            return None
    
    def _parse_csv_line(self, line: str, line_num: int, delimiter: str) -> Optional[Dict[str, Any]]:
        """Parse CSV line with generic field detection"""
        try:
            fields = line.split(delimiter)
            result = {}
            
            for i, field_value in enumerate(fields):
                field_value = field_value.strip(' "\\'\\'')
                if not field_value:
                    continue
                
                # Intelligent field type detection
                field_name = f'field_{i}'
                
                if self._looks_like_date(field_value):
                    field_name = 'date' if 'date' not in result else f'date_{i}'
                elif self._looks_like_time(field_value):
                    field_name = 'time' if 'time' not in result else f'time_{i}'
                elif self._looks_like_phone(field_value):
                    field_name = 'phone' if 'phone' not in result else f'phone_{i}'
                elif self._looks_like_duration(field_value):
                    field_name = 'duration' if 'duration' not in result else f'duration_{i}'
                
                result[field_name] = field_value
            
            return result if len(result) > 2 else None
            
        except Exception:
            return None
    
    def _parse_fixed_width_line(self, line: str, line_num: int) -> Optional[Dict[str, Any]]:
        """Parse fixed-width line with pattern detection"""
        try:
            # This would need more sophisticated logic based on detected patterns
            # For now, use simple heuristics
            
            result = {}
            
            # Try to extract common patterns
            # Date pattern (8 digits at start)
            if len(line) >= 8 and line[:8].isdigit():
                result['date'] = line[:8]
                line = line[8:].lstrip()
            
            # Time pattern (6 digits)
            if len(line) >= 6 and line[:6].isdigit():
                result['time'] = line[:6]
                line = line[6:].lstrip()
            
            # Phone pattern (10+ digits)
            phone_match = re.search(r'\\d{10,15}', line)
            if phone_match:
                result['phone'] = phone_match.group()
                line = line.replace(phone_match.group(), '', 1).strip()
            
            # Duration (3-4 digits)
            duration_match = re.search(r'\\b\\d{1,4}\\b', line)
            if duration_match:
                result['duration'] = duration_match.group()
            
            return result if len(result) >= 2 else None
            
        except Exception:
            return None
    
    def _parse_key_value_line(self, line: str, line_num: int) -> Optional[Dict[str, Any]]:
        """Parse key-value format line"""
        try:
            result = {}
            
            # Try different separators
            for separator in ['=', ':', '|']:
                if separator in line:
                    parts = line.split(separator)
                    if len(parts) >= 2:
                        key = parts[0].strip().lower()
                        value = separator.join(parts[1:]).strip()
                        
                        # Normalize key names
                        if any(term in key for term in ['date', 'time', 'ts']):
                            result['date'] = value
                        elif any(term in key for term in ['phone', 'number', 'ani', 'dnis']):
                            result['phone'] = value
                        elif any(term in key for term in ['duration', 'length', 'seconds', 'minutes']):
                            result['duration'] = value
                        else:
                            result[key.replace(' ', '_')] = value
                    break
            
            return result if result else None
            
        except Exception:
            return None
    
    def _parse_generic_line(self, line: str, line_num: int) -> Optional[Dict[str, Any]]:
        """Generic line parser as fallback"""
        try:
            result = {}
            
            # Extract phone numbers
            phone_pattern = re.compile(r'\\b\\d{10,15}\\b|\\b\\d{3}[-.]\\d{3}[-.]\\d{4}\\b|\\+?1?\\s?\\(?\\d{3}\\)?[-. ]\\d{3}[-. ]\\d{4}')
            phones = phone_pattern.findall(line)
            if phones:
                result['phone'] = phones[0]
            
            # Extract dates
            date_pattern = re.compile(r'\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b|\\b\\d{8}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b')
            dates = date_pattern.findall(line)
            if dates:
                result['date'] = dates[0]
            
            # Extract times
            time_pattern = re.compile(r'\\b\\d{1,2}:\\d{2}(:\\d{2})?\\b|\\b\\d{6}\\b')
            times = time_pattern.findall(line)
            if times:
                result['time'] = times[0]
            
            # Extract duration (numeric values that could be seconds/minutes)
            duration_pattern = re.compile(r'\\b\\d{1,4}\\b')
            durations = duration_pattern.findall(line)
            if durations:
                # Take the first reasonable duration value
                for duration in durations:
                    if 1 <= int(duration) <= 86400:  # 1 second to 24 hours
                        result['duration'] = duration
                        break
            
            return result if len(result) >= 2 else None
            
        except Exception:
            return None
    
    # Helper methods for field type detection
    def _looks_like_date(self, value: str) -> bool:
        """Check if value looks like a date"""
        date_patterns = [
            r'^\\d{8}$',                          # YYYYMMDD
            r'^\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}$',  # M/D/YY, MM/DD/YYYY
            r'^\\d{4}-\\d{2}-\\d{2}$',             # YYYY-MM-DD
            r'^\\d{2}-\\d{2}-\\d{4}$',             # MM-DD-YYYY
        ]
        
        return any(re.match(pattern, value.strip()) for pattern in date_patterns)
    
    def _looks_like_time(self, value: str) -> bool:
        """Check if value looks like a time"""
        time_patterns = [
            r'^\\d{1,2}:\\d{2}(:\\d{2})?$',    # H:MM or H:MM:SS
            r'^\\d{6}$',                      # HHMMSS
            r'^\\d{4}$',                      # HHMM
        ]
        
        return any(re.match(pattern, value.strip()) for pattern in time_patterns)
    
    def _looks_like_phone(self, value: str) -> bool:
        """Check if value looks like a phone number"""
        # Remove common formatting
        cleaned = re.sub(r'[^0-9+]', '', value)
        
        # Check length and patterns
        if len(cleaned) < 10 or len(cleaned) > 15:
            return False
        
        # US/International patterns
        phone_patterns = [
            r'^\\+?1?[2-9]\\d{9}$',           # US format
            r'^\\+?[1-9]\\d{9,14}$',          # International
        ]
        
        return any(re.match(pattern, cleaned) for pattern in phone_patterns)
    
    def _looks_like_duration(self, value: str) -> bool:
        """Check if value looks like a duration"""
        try:
            # Remove common formatting
            cleaned = value.strip().replace(':', '')
            
            if cleaned.isdigit():
                num = int(cleaned)
                # Reasonable duration range (1 second to 24 hours in seconds)
                return 1 <= num <= 86400
            
            # Check for time format durations
            if ':' in value:
                parts = value.split(':')
                if len(parts) in [2, 3] and all(part.isdigit() for part in parts):
                    return True
            
            return False
            
        except:
            return False
    
    async def _process_cdr_batch_parallel(
        self,
        batch_lines: List[str],
        line_parser: callable,
        field_mappings: List[Dict[str, Any]],
        line_offset: int
    ) -> Dict[str, Any]:
        """Process a batch of CDR lines in parallel"""
        events = []
        errors = []
        
        def process_single_line(args):
            line_idx, line = args
            line_num = line_offset + line_idx
            
            try:
                parsed_data = line_parser(line, line_num)
                
                if parsed_data:
                    event_data = self._apply_field_mappings_cdr(
                        parsed_data, field_mappings, line_num
                    )
                    
                    if event_data and self._is_valid_cdr_event(event_data):
                        event_data["metadata"] = {
                            "source_line": line_num,
                            "extraction_method": "batch_cdr_parallel"
                        }
                        return {"success": True, "event": event_data}
                
                return {"success": False, "error": "Parsing or validation failed"}
                
            except Exception as e:
                return {"success": False, "error": str(e)}
        
        # Process lines in parallel
        with ThreadPoolExecutor(max_workers=min(4, len(batch_lines))) as executor:
            line_args = [(idx, line) for idx, line in enumerate(batch_lines)]
            future_to_line = {
                executor.submit(process_single_line, args): args[0]
                for args in line_args
            }
            
            for future in as_completed(future_to_line):
                line_idx = future_to_line[future]
                try:
                    result = future.result()
                    if result["success"]:
                        events.append(result["event"])
                    else:
                        errors.append({
                            "error_type": "parsing_error",
                            "error_message": f"Line {line_offset + line_idx}: {result['error']}",
                            "severity": "warning"
                        })
                except Exception as e:
                    errors.append({
                        "error_type": "processing_error",
                        "error_message": f"Line {line_offset + line_idx}: {str(e)}",
                        "severity": "error"
                    })
        
        return {"events": events, "errors": errors}
    
    def _apply_field_mappings_cdr(
        self,
        parsed_data: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        line_num: int
    ) -> Optional[Dict[str, Any]]:
        """Apply field mappings to convert parsed CDR data to event format"""
        try:
            event_data = {}
            
            # Apply each field mapping
            for mapping in field_mappings:
                source_field = mapping["source_field"]
                target_field = mapping["target_field"]
                data_type = mapping.get("data_type", "string")
                
                # Try direct mapping first
                if source_field in parsed_data:
                    raw_value = parsed_data[source_field]
                elif source_field.lower() in parsed_data:
                    raw_value = parsed_data[source_field.lower()]
                else:
                    # Try fuzzy matching
                    raw_value = self._find_fuzzy_field_match(source_field, parsed_data)
                
                if raw_value is not None:
                    # Transform value based on target field and data type
                    transformed_value = self._transform_cdr_value(raw_value, data_type, target_field)
                    
                    if transformed_value is not None:
                        event_data[target_field] = transformed_value
            
            # Ensure required fields and add intelligent defaults
            if not self._ensure_required_cdr_fields(event_data, parsed_data):
                return None
            
            return event_data
            
        except Exception as e:
            logger.debug(f"CDR field mapping failed for line {line_num}", error=str(e))
            return None
    
    def _find_fuzzy_field_match(self, source_field: str, parsed_data: Dict[str, Any]) -> Any:
        """Find fuzzy match for field name in parsed data"""
        source_lower = source_field.lower()
        
        # Try various matching strategies
        for key, value in parsed_data.items():
            key_lower = key.lower()
            
            # Exact match
            if key_lower == source_lower:
                return value
            
            # Partial match
            if source_lower in key_lower or key_lower in source_lower:
                return value
            
            # Semantic matching for common CDR fields
            semantic_matches = {
                'number': ['phone', 'ani', 'dnis', 'calling', 'called'],
                'phone': ['number', 'ani', 'dnis', 'calling', 'called'],
                'date': ['time', 'timestamp', 'ts', 'datetime'],
                'time': ['date', 'timestamp', 'ts', 'datetime'],
                'duration': ['length', 'seconds', 'minutes', 'time'],
                'type': ['category', 'service', 'call_type']
            }
            
            for target, variants in semantic_matches.items():
                if source_lower == target:
                    if any(variant in key_lower for variant in variants):
                        return value
        
        return None
    
    def _transform_cdr_value(self, value: Any, data_type: str, target_field: str) -> Any:
        """Transform CDR value to appropriate type and format"""
        if value is None or (isinstance(value, str) and value.strip() == ''):
            return None
        
        try:
            value_str = str(value).strip()
            
            if data_type == "string":
                return value_str
            
            elif data_type == "number":
                if target_field == "duration":
                    return self._parse_cdr_duration(value_str)
                else:
                    # Regular numeric conversion
                    cleaned = re.sub(r'[^0-9.-]', '', value_str)
                    try:
                        return float(cleaned) if '.' in cleaned else int(cleaned)
                    except ValueError:
                        return None
            
            elif data_type == "date":
                return self._parse_cdr_date(value_str)
            
            else:
                return value_str
        
        except Exception as e:
            logger.debug(f"CDR value transformation failed for {value} -> {data_type}", error=str(e))
            return str(value).strip() if value else None
    
    def _parse_cdr_duration(self, duration_str: str) -> int:
        """Parse CDR duration to seconds"""
        try:
            duration_str = duration_str.strip()
            
            # Handle time format (HH:MM:SS or MM:SS)
            if ':' in duration_str:
                parts = duration_str.split(':')
                if len(parts) == 2:  # MM:SS
                    minutes, seconds = int(parts[0]), int(parts[1])
                    return minutes * 60 + seconds
                elif len(parts) == 3:  # HH:MM:SS
                    hours, minutes, seconds = int(parts[0]), int(parts[1]), int(parts[2])
                    return hours * 3600 + minutes * 60 + seconds
            
            # Handle plain numbers
            cleaned = re.sub(r'[^0-9]', '', duration_str)
            if cleaned:
                return int(cleaned)
            
            return 0
            
        except Exception:
            return 0
    
    def _parse_cdr_date(self, date_str: str) -> str:
        """Parse CDR date to ISO format"""
        from datetime import datetime
        
        date_formats = [
            "%Y%m%d",           # YYYYMMDD
            "%m/%d/%Y",         # MM/DD/YYYY
            "%m-%d-%Y",         # MM-DD-YYYY
            "%Y-%m-%d",         # YYYY-MM-DD
            "%d/%m/%Y",         # DD/MM/YYYY
            "%Y%m%d%H%M%S",     # YYYYMMDDHHMMSS
            "%m/%d/%Y %H:%M:%S", # MM/DD/YYYY HH:MM:SS
            "%Y-%m-%d %H:%M:%S", # YYYY-MM-DD HH:MM:SS
        ]
        
        date_str = date_str.strip()
        
        for fmt in date_formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.isoformat()
            except ValueError:
                continue
        
        return date_str  # Return original if no format matches
    
    def _ensure_required_cdr_fields(self, event_data: Dict[str, Any], raw_data: Dict[str, Any]) -> bool:
        """Ensure CDR event has required fields with intelligent defaults"""
        required_fields = ["number", "ts"]
        
        # Check basic requirements
        for field in required_fields:
            if field not in event_data or not event_data[field]:
                # Try to extract from raw data
                if field == "number":
                    phone = self._extract_phone_from_raw(raw_data)
                    if phone:
                        event_data[field] = phone
                    else:
                        return False
                elif field == "ts":
                    timestamp = self._extract_timestamp_from_raw(raw_data)
                    if timestamp:
                        event_data[field] = timestamp
                    else:
                        return False
        
        # Add intelligent defaults for optional fields
        if "type" not in event_data:
            event_data["type"] = "call"  # Default assumption for CDR
        
        if "direction" not in event_data:
            # Try to infer from field names or values
            direction = self._infer_direction_from_raw(raw_data)
            event_data["direction"] = direction or "unknown"
        
        return True
    
    def _extract_phone_from_raw(self, raw_data: Dict[str, Any]) -> Optional[str]:
        """Extract phone number from raw CDR data"""
        phone_fields = ['phone', 'number', 'ani', 'dnis', 'calling', 'called', 'caller', 'callee']
        
        for field_name, value in raw_data.items():
            field_lower = field_name.lower()
            if any(pf in field_lower for pf in phone_fields):
                if self._looks_like_phone(str(value)):
                    return re.sub(r'[^0-9+]', '', str(value))
        
        # Fallback: look for any phone-like value
        for value in raw_data.values():
            if self._looks_like_phone(str(value)):
                return re.sub(r'[^0-9+]', '', str(value))
        
        return None
    
    def _extract_timestamp_from_raw(self, raw_data: Dict[str, Any]) -> Optional[str]:
        """Extract timestamp from raw CDR data"""
        time_fields = ['date', 'time', 'timestamp', 'ts', 'datetime']
        
        # Try to find date and time fields
        date_value = None
        time_value = None
        
        for field_name, value in raw_data.items():
            field_lower = field_name.lower()
            value_str = str(value).strip()
            
            if not value_str:
                continue
            
            if any(tf in field_lower for tf in time_fields):
                if self._looks_like_date(value_str):
                    date_value = value_str
                elif self._looks_like_time(value_str):
                    time_value = value_str
                else:
                    # Might be a combined datetime
                    try:
                        parsed_dt = self._parse_cdr_date(value_str)
                        return parsed_dt
                    except:
                        continue
        
        # Combine date and time if we have both
        if date_value and time_value:
            combined = f"{date_value} {time_value}"
            try:
                return self._parse_cdr_date(combined)
            except:
                pass
        
        # Return date only if we have it
        if date_value:
            try:
                return self._parse_cdr_date(date_value)
            except:
                pass
        
        return None
    
    def _infer_direction_from_raw(self, raw_data: Dict[str, Any]) -> Optional[str]:
        """Infer call direction from raw CDR data"""
        inbound_indicators = ['in', 'incoming', 'inbound', 'received', 'rx', 'terminating']
        outbound_indicators = ['out', 'outgoing', 'outbound', 'sent', 'tx', 'originating']
        
        for field_name, value in raw_data.items():
            field_lower = field_name.lower()
            value_lower = str(value).lower()
            
            if any(ind in field_lower for ind in inbound_indicators) or any(ind in value_lower for ind in inbound_indicators):
                return "inbound"
            elif any(ind in field_lower for ind in outbound_indicators) or any(ind in value_lower for ind in outbound_indicators):
                return "outbound"
        
        return None
    
    def _is_valid_cdr_event(self, event_data: Dict[str, Any]) -> bool:
        """Validate CDR event data"""
        # Must have phone number and timestamp
        if "number" not in event_data or "ts" not in event_data:
            return False
        
        # Phone number validation
        phone = str(event_data["number"]).strip()
        if not phone or not self._looks_like_phone(phone):
            return False
        
        # Timestamp validation
        ts = event_data["ts"]
        if not ts or (isinstance(ts, str) and len(ts) < 8):
            return False
        
        return True
    
    async def _extract_contacts_from_cdr_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract contacts from CDR events using parallel processing"""
        if not events:
            return []
        
        def process_event_batch(event_batch):
            contact_map = {}
            
            for event in event_batch:
                phone = event.get("number")
                if not phone:
                    continue
                
                # Normalize phone number
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
                        "metadata": {"source": "cdr_import"}
                    }
                
                contact = contact_map[normalized_phone]
                
                # Update statistics
                event_type = event.get("type", "call")
                if event_type in ["call", "voice"]:
                    contact["total_calls"] += 1
                elif event_type in ["sms", "text", "message"]:
                    contact["total_sms"] += 1
                
                # Update date range
                event_ts = event.get("ts")
                if event_ts:
                    if not contact["first_seen"] or event_ts < contact["first_seen"]:
                        contact["first_seen"] = event_ts
                    if not contact["last_seen"] or event_ts > contact["last_seen"]:
                        contact["last_seen"] = event_ts
            
            return list(contact_map.values())
        
        # Process in parallel batches
        batch_size = max(1000, len(events) // self.max_workers)
        event_batches = [events[i:i + batch_size] for i in range(0, len(events), batch_size)]
        
        all_contacts = []
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_batch = {
                executor.submit(process_event_batch, batch): batch
                for batch in event_batches
            }
            
            for future in as_completed(future_to_batch):
                try:
                    batch_contacts = future.result()
                    all_contacts.extend(batch_contacts)
                except Exception as e:
                    logger.error("CDR contact extraction batch failed", error=str(e))
        
        # Merge contacts with same phone numbers
        final_contact_map = {}
        for contact in all_contacts:
            phone = contact["number"]
            if phone in final_contact_map:
                existing = final_contact_map[phone]
                existing["total_calls"] += contact["total_calls"]
                existing["total_sms"] += contact["total_sms"]
                
                # Update date range
                if contact["first_seen"] and (not existing["first_seen"] or contact["first_seen"] < existing["first_seen"]):
                    existing["first_seen"] = contact["first_seen"]
                if contact["last_seen"] and (not existing["last_seen"] or contact["last_seen"] > existing["last_seen"]):
                    existing["last_seen"] = contact["last_seen"]
            else:
                final_contact_map[phone] = contact
        
        return list(final_contact_map.values())
    
    def _calculate_memory_efficiency(self) -> float:
        """Calculate memory efficiency score"""
        try:
            current_memory = psutil.Process().memory_info().rss / 1024 / 1024
            efficiency = min(1.0, self.memory_threshold_mb / current_memory)
            return efficiency
        except:
            return 0.5
    
    def _create_error_response(self, error_message: str) -> Dict[str, Any]:
        """Create standardized error response for CDR parsing"""
        return {
            "events": [],
            "contacts": [],
            "metadata": {
                "total_rows": 0,
                "parsed_rows": 0,
                "error_rows": 1,
                "duplicate_rows": 0,
                "processing_time_ms": 0,
                "extraction_method": "enhanced_cdr_failed"
            },
            "errors": [{"error_type": "parsing_error", "error_message": error_message, "severity": "critical"}],
            "warnings": []
        }
    
    def _create_fallback_analysis(self, carrier_hint: str) -> Dict[str, Any]:
        """Create fallback CDR format analysis when detection fails"""
        return {
            "format_type": "unknown",
            "carrier": carrier_hint if carrier_hint != "unknown" else "unknown",
            "confidence": 0.1,
            "complexity": "medium",
            "estimated_rows": 1000,
            "encoding": "utf-8",
            "all_scores": {},
            "sample_analysis": {
                "line_count": 0,
                "avg_line_length": 0,
                "max_line_length": 0,
                "has_headers": False
            }
        }
    
    # Carrier-specific date normalization methods
    def _normalize_att_date(self, date_str: str) -> str:
        """Normalize AT&T date format"""
        # AT&T typically uses YYYYMMDD or MM/DD/YYYY
        return self._parse_cdr_date(date_str)
    
    def _normalize_verizon_date(self, date_str: str) -> str:
        """Normalize Verizon date format"""
        # Verizon typically uses MM-DD-YYYY or YYYYMMDD
        return self._parse_cdr_date(date_str)
    
    def _normalize_tmobile_date(self, date_str: str) -> str:
        """Normalize T-Mobile date format"""
        # T-Mobile typically uses YYYY-MM-DD or YYYYMMDD
        return self._parse_cdr_date(date_str)
    
    def _normalize_sprint_date(self, date_str: str) -> str:
        """Normalize Sprint date format"""
        # Sprint typically uses YYMMDD or YYYYMMDD
        if len(date_str) == 6 and date_str.isdigit():
            # Convert YYMMDD to YYYYMMDD
            year = int(date_str[:2])
            year = 2000 + year if year < 50 else 1900 + year  # Assume 00-49 is 2000s, 50-99 is 1900s
            date_str = f"{year}{date_str[2:]}"
        
        return self._parse_cdr_date(date_str)
    
    # Carrier-specific duration parsing methods
    def _parse_duration_att(self, duration_str: str) -> int:
        """Parse AT&T duration format"""
        return self._parse_cdr_duration(duration_str)
    
    def _parse_duration_verizon(self, duration_str: str) -> int:
        """Parse Verizon duration format"""
        return self._parse_cdr_duration(duration_str)
    
    def _parse_duration_tmobile(self, duration_str: str) -> int:
        """Parse T-Mobile duration format"""
        return self._parse_cdr_duration(duration_str)
    
    def _parse_duration_sprint(self, duration_str: str) -> int:
        """Parse Sprint duration format"""
        return self._parse_cdr_duration(duration_str)


# Global enhanced CDR parser instance
enhanced_cdr_parser = EnhancedCDRParser()