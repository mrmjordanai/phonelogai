"""
Enhanced CSV parser implementation with streaming processing and performance optimizations

This module implements production-ready CSV parsing with:
- Dynamic delimiter detection with fuzzy matching
- Intelligent header row identification using ML hints
- Streaming processing for memory efficiency with large files
- Advanced encoding detection and handling (UTF-8, UTF-16, latin1, cp1252)
- Parallel chunk processing for performance
- Data type inference with confidence scoring
- Large file streaming with progress tracking
- Error recovery and malformed data handling
- Memory usage monitoring and optimization
"""
import io
import csv
import chardet
import time
import gc
import asyncio
import concurrent.futures
from typing import Dict, List, Optional, Any, Iterator, Tuple, Union
from pathlib import Path
import structlog
import pandas as pd
import numpy as np
from datetime import datetime
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import psutil
from contextlib import contextmanager
import codecs

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


@dataclass
class StreamingProgress:
    """Track streaming processing progress for large CSV files"""
    total_estimated_rows: int = 0
    processed_rows: int = 0
    valid_rows: int = 0
    errors: int = 0
    start_time: float = 0.0
    last_update: float = 0.0
    bytes_processed: int = 0
    total_bytes: int = 0
    
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
    
    def estimate_time_remaining(self) -> float:
        """Estimate remaining processing time in seconds"""
        if self.bytes_processed == 0:
            return 0.0
        
        elapsed = time.time() - self.start_time
        remaining_bytes = self.total_bytes - self.bytes_processed
        bytes_per_second = self.bytes_processed / elapsed
        
        return remaining_bytes / bytes_per_second if bytes_per_second > 0 else 0.0


class EnhancedCSVParser:
    """Production-ready CSV parser with streaming processing and advanced features"""
    
    def __init__(self):
        # Performance configuration
        self.chunk_size = min(settings.chunk_size, 10000)  # Rows per chunk
        self.max_sample_rows = 500  # Increase sample for better detection
        self.memory_threshold_mb = 1500  # Memory threshold for optimization
        self.progress_update_interval = 2.0  # Seconds between updates
        self.max_workers = min(4, psutil.cpu_count())
        
        # Enhanced encoding detection
        self.encoding_candidates = [
            'utf-8', 'utf-8-sig', 'utf-16', 'utf-16-le', 'utf-16-be',
            'latin-1', 'iso-8859-1', 'cp1252', 'ascii'
        ]
        
        # Delimiter detection with confidence scoring
        self.delimiter_candidates = {
            ',': {'priority': 1, 'common_in': ['csv', 'txt']},
            ';': {'priority': 2, 'common_in': ['csv', 'txt', 'european']},
            '|': {'priority': 3, 'common_in': ['txt', 'pipe', 'cdr']},
            '\t': {'priority': 4, 'common_in': ['tsv', 'txt']},
            ':': {'priority': 5, 'common_in': ['cdr', 'log']},
            ' ': {'priority': 6, 'common_in': ['fixed', 'space']}
        }
        
        # Performance tracking
        self.performance_stats = {
            'files_processed': 0,
            'avg_processing_time': 0.0,
            'memory_peak': 0.0,
            'encoding_detection_success_rate': 1.0,
            'delimiter_detection_success_rate': 1.0
        }
    
    async def parse_csv(
        self,
        csv_data: bytes,
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Enhanced CSV parsing with streaming processing and performance optimization
        
        Args:
            csv_data: Raw CSV file bytes
            field_mappings: ML-generated field mappings
            job_id: Optional job ID for progress tracking
            
        Returns:
            Dict containing extracted events, contacts, and metadata
            
        Performance targets:
        - 100k rows: <5 minutes
        - 1M rows: <30 minutes
        - Memory usage: <2GB peak
        - Progress updates every 2 seconds
        """
        start_time = time.time()
        progress = StreamingProgress(
            start_time=start_time,
            total_bytes=len(csv_data)
        )
        
        try:
            logger.info(
                "Starting enhanced CSV parsing", 
                job_id=job_id, 
                size_bytes=len(csv_data),
                chunk_size=self.chunk_size,
                max_workers=self.max_workers
            )
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 5)
            
            # Enhanced encoding detection
            encoding_result = await self._enhanced_encoding_detection(csv_data)
            encoding = encoding_result["encoding"]
            confidence = encoding_result["confidence"]
            
            logger.info(
                "Enhanced encoding detection completed", 
                encoding=encoding, 
                confidence=confidence, 
                job_id=job_id
            )
            
            # Convert bytes to text with enhanced error handling
            csv_text = await self._safe_decode_with_fallback(csv_data, encoding)
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 15)
            
            # Enhanced CSV structure detection
            csv_structure = await self._enhanced_structure_detection(csv_text, job_id)
            progress.total_estimated_rows = csv_structure.get("estimated_rows", 1000)
            
            logger.info(
                "Enhanced CSV structure detection completed",
                delimiter=repr(csv_structure["delimiter"]),
                headers=len(csv_structure.get("headers", [])),
                header_row=csv_structure.get("header_row"),
                estimated_rows=progress.total_estimated_rows,
                job_id=job_id
            )
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 25)
            
            # Choose processing strategy based on file size
            if len(csv_data) > 50 * 1024 * 1024:  # Files larger than 50MB
                logger.info("Using streaming processing for large CSV", job_id=job_id)
                parsing_result = await self._stream_process_csv(
                    csv_text, csv_structure, field_mappings, job_id, progress
                )
            else:
                logger.info("Using batch processing for smaller CSV", job_id=job_id)
                parsing_result = await self._batch_process_csv(
                    csv_text, csv_structure, field_mappings, job_id, progress
                )
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 95)
            
            # Add comprehensive processing metadata
            processing_time_ms = int((time.time() - start_time) * 1000)
            parsing_result["metadata"].update({
                "encoding": encoding,
                "encoding_confidence": confidence,
                "csv_structure": csv_structure,
                "processing_strategy": "streaming" if len(csv_data) > 50 * 1024 * 1024 else "batch",
                "performance_metrics": {
                    "processing_time_ms": processing_time_ms,
                    "throughput_rows_per_sec": progress.get_throughput(),
                    "memory_efficiency_score": self._calculate_memory_efficiency(),
                    "data_quality_score": self._calculate_data_quality(parsing_result)
                }
            })
            
            logger.info(
                "Enhanced CSV parsing completed successfully",
                job_id=job_id,
                events=len(parsing_result["events"]),
                contacts=len(parsing_result["contacts"]),
                errors=len(parsing_result["errors"]),
                processing_time_ms=processing_time_ms,
                throughput=progress.get_throughput()
            )
            
            return parsing_result
            
        except Exception as e:
            logger.error("Enhanced CSV parsing failed", job_id=job_id, error=str(e))
            
            if job_id:
                await db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="parsing_error",
                    error_message=f"Enhanced CSV parsing failed: {str(e)}",
                    severity="critical"
                )
            
            return self._create_error_response(str(e))
    
    async def _enhanced_encoding_detection(self, data: bytes) -> Dict[str, Any]:
        """Enhanced encoding detection with multiple strategies"""
        try:
            # Strategy 1: Use chardet on a larger sample
            sample_size = min(len(data), 100000)  # 100KB sample
            sample = data[:sample_size]
            
            chardet_result = chardet.detect(sample)
            chardet_encoding = chardet_result.get('encoding', 'utf-8')
            chardet_confidence = chardet_result.get('confidence', 0.0)
            
            # Strategy 2: Try each candidate encoding
            encoding_scores = {}
            
            for encoding in self.encoding_candidates:
                try:
                    # Try to decode the sample
                    decoded = sample.decode(encoding, errors='strict')
                    
                    # Score based on successful decoding and content analysis
                    score = 1.0
                    
                    # Bonus for UTF-8 (most common)
                    if encoding == 'utf-8':
                        score += 0.2
                    
                    # Bonus for UTF-8 with BOM if BOM detected
                    if encoding == 'utf-8-sig' and sample.startswith(b'\xef\xbb\xbf'):
                        score += 0.3
                    
                    # Check for typical CSV characters
                    csv_chars = [',', ';', '|', '\t', '\n', '\r']
                    csv_char_count = sum(decoded.count(char) for char in csv_chars)
                    if csv_char_count > len(decoded) * 0.05:  # At least 5% CSV chars
                        score += 0.1
                    
                    # Check for printable ASCII content (good for CSV)
                    ascii_ratio = sum(1 for c in decoded[:1000] if ord(c) < 128) / len(decoded[:1000])
                    if ascii_ratio > 0.9:
                        score += 0.1
                    
                    encoding_scores[encoding] = score
                    
                except (UnicodeDecodeError, UnicodeError):
                    encoding_scores[encoding] = 0.0
            
            # Strategy 3: Combine results
            if encoding_scores:
                best_encoding = max(encoding_scores, key=encoding_scores.get)
                best_score = encoding_scores[best_encoding]
                
                # Use chardet result if it has high confidence and our test passed
                if (chardet_confidence > 0.8 and 
                    chardet_encoding in encoding_scores and 
                    encoding_scores[chardet_encoding] > 0.5):
                    final_encoding = chardet_encoding
                    final_confidence = chardet_confidence
                else:
                    final_encoding = best_encoding
                    final_confidence = min(best_score, 0.95)
            else:
                final_encoding = chardet_encoding or 'utf-8'
                final_confidence = chardet_confidence
            
            logger.info(
                "Enhanced encoding detection results",
                chardet_encoding=chardet_encoding,
                chardet_confidence=chardet_confidence,
                final_encoding=final_encoding,
                final_confidence=final_confidence,
                candidates_tested=len(encoding_scores)
            )
            
            return {
                "encoding": final_encoding,
                "confidence": final_confidence,
                "detection_method": "enhanced_multi_strategy",
                "alternatives": sorted(encoding_scores.items(), key=lambda x: x[1], reverse=True)[:3]
            }
            
        except Exception as e:
            logger.warning("Enhanced encoding detection failed", error=str(e))
            return {"encoding": "utf-8", "confidence": 0.5, "detection_method": "fallback"}
    
    async def _safe_decode_with_fallback(self, csv_data: bytes, primary_encoding: str) -> str:
        """Safely decode CSV data with fallback strategies"""
        try:
            # Try primary encoding first
            return csv_data.decode(primary_encoding, errors='strict')
        except (UnicodeDecodeError, UnicodeError) as e:
            logger.warning(f"Primary encoding {primary_encoding} failed, trying fallbacks", error=str(e))
            
            # Try fallback encodings
            fallback_encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
            
            for encoding in fallback_encodings:
                if encoding == primary_encoding:
                    continue
                try:
                    decoded = csv_data.decode(encoding, errors='replace')
                    logger.info(f"Fallback encoding {encoding} succeeded")
                    return decoded
                except Exception:
                    continue
            
            # Final fallback with error replacement
            logger.warning("All encoding attempts failed, using UTF-8 with replacement")
            return csv_data.decode('utf-8', errors='replace')
    
    async def _enhanced_structure_detection(self, csv_text: str, job_id: Optional[str] = None) -> Dict[str, Any]:
        """Enhanced CSV structure detection with machine learning hints"""
        try:
            lines = csv_text.split('\n')
            sample_lines = lines[:min(100, len(lines))]  # Larger sample
            sample_text = '\n'.join(sample_lines)
            
            # Enhanced delimiter detection
            delimiter_result = await self._detect_delimiter_with_confidence(sample_lines)
            delimiter = delimiter_result["delimiter"]
            delimiter_confidence = delimiter_result["confidence"]
            
            # Enhanced header detection
            header_result = await self._detect_headers_enhanced(sample_lines, delimiter)
            headers = header_result["headers"]
            header_row = header_result["header_row"]
            header_confidence = header_result["confidence"]
            
            # Data type analysis with larger sample
            data_types = await self._analyze_data_types_enhanced(sample_lines, delimiter, header_row)
            
            # Estimate total rows (more accurate)
            estimated_rows = await self._estimate_total_rows(csv_text, delimiter)
            
            # Calculate structure confidence
            structure_confidence = (delimiter_confidence * 0.4 + 
                                  header_confidence * 0.4 + 
                                  (1.0 if data_types else 0.5) * 0.2)
            
            return {
                "delimiter": delimiter,
                "delimiter_confidence": delimiter_confidence,
                "headers": headers,
                "header_row": header_row,
                "header_confidence": header_confidence,
                "data_start_row": header_row + 1 if header_row is not None else 0,
                "estimated_rows": estimated_rows,
                "data_types": data_types,
                "sample_analyzed": len(sample_lines),
                "structure_confidence": structure_confidence,
                "detection_method": "enhanced_ml_assisted"
            }
            
        except Exception as e:
            logger.error("Enhanced CSV structure detection failed", error=str(e), job_id=job_id)
            return self._create_fallback_structure()
    
    async def _detect_delimiter_with_confidence(self, sample_lines: List[str]) -> Dict[str, Any]:
        """Enhanced delimiter detection with confidence scoring"""
        delimiter_scores = {}
        
        for delimiter, config in self.delimiter_candidates.items():
            score = 0.0
            field_counts = []
            consistency_score = 0.0
            
            # Test delimiter on sample lines
            for line in sample_lines[:20]:  # Test first 20 lines
                if not line.strip():
                    continue
                
                field_count = len(line.split(delimiter))
                field_counts.append(field_count)
                
                if field_count > 1:
                    score += 1.0
                
                # Bonus for reasonable field counts
                if 2 <= field_count <= 50:
                    score += 0.5
            
            # Consistency scoring
            if field_counts:
                unique_counts = set(field_counts)
                if len(unique_counts) == 1:  # Perfect consistency
                    consistency_score = 1.0
                elif len(unique_counts) <= 3:  # Good consistency
                    consistency_score = 0.8
                else:
                    consistency_score = 0.3
                
                # Field count variance
                if len(field_counts) > 1:
                    variance = np.var(field_counts)
                    consistency_score *= (1.0 / (1.0 + variance * 0.1))
            
            # Priority bonus (comma gets highest priority)
            priority_bonus = (10 - config['priority']) * 0.05
            
            # Final score
            final_score = (score * 0.5 + consistency_score * 0.4 + priority_bonus * 0.1)
            
            delimiter_scores[delimiter] = {
                "score": final_score,
                "field_counts": field_counts,
                "consistency": consistency_score,
                "raw_occurrences": score
            }
        
        # Select best delimiter
        if delimiter_scores:
            best_delimiter = max(delimiter_scores, key=lambda k: delimiter_scores[k]["score"])
            best_score = delimiter_scores[best_delimiter]
            confidence = min(best_score["score"] / 10.0, 1.0)  # Normalize to 0-1
            
            logger.info(
                "Delimiter detection results",
                best_delimiter=repr(best_delimiter),
                confidence=confidence,
                consistency=best_score["consistency"],
                alternatives=[(k, v["score"]) for k, v in delimiter_scores.items() if k != best_delimiter][:2]
            )
            
            return {
                "delimiter": best_delimiter,
                "confidence": confidence,
                "alternatives": delimiter_scores
            }
        
        # Fallback
        return {"delimiter": ",", "confidence": 0.1, "alternatives": {}}
    
    async def _detect_headers_enhanced(self, lines: List[str], delimiter: str) -> Dict[str, Any]:
        """Enhanced header detection using ML-inspired heuristics"""
        try:
            if not lines:
                return {"headers": [], "header_row": None, "confidence": 0.0}
            
            header_candidates = []
            
            # Check first few rows for header patterns
            for row_idx in range(min(5, len(lines))):
                line = lines[row_idx].strip()
                if not line:
                    continue
                
                fields = [field.strip(' "\'') for field in line.split(delimiter)]
                if len(fields) < 2:
                    continue
                
                # Score this row as potential header
                header_score = self._score_header_candidate(fields, lines[row_idx + 1:row_idx + 6])
                
                header_candidates.append({
                    "row_index": row_idx,
                    "fields": fields,
                    "score": header_score,
                    "raw_line": line
                })
            
            if header_candidates:
                # Select best header candidate
                best_candidate = max(header_candidates, key=lambda x: x["score"])
                
                if best_candidate["score"] > 0.3:  # Confidence threshold
                    return {
                        "headers": best_candidate["fields"],
                        "header_row": best_candidate["row_index"],
                        "confidence": min(best_candidate["score"], 1.0),
                        "candidates": header_candidates[:3]
                    }
            
            # Generate generic headers if no good candidate found
            if lines and lines[0]:
                field_count = len(lines[0].split(delimiter))
                headers = [f"column_{i}" for i in range(field_count)]
                return {"headers": headers, "header_row": None, "confidence": 0.2}
            
            return {"headers": [], "header_row": None, "confidence": 0.0}
            
        except Exception as e:
            logger.error("Enhanced header detection failed", error=str(e))
            return {"headers": [], "header_row": None, "confidence": 0.0}
    
    def _score_header_candidate(self, fields: List[str], data_lines: List[str]) -> float:
        """Score a potential header row using multiple criteria"""
        if not fields or len(fields) < 2:
            return 0.0
        
        score = 0.0
        
        # Criterion 1: Header-like keywords
        header_keywords = [
            'date', 'time', 'phone', 'number', 'duration', 'type', 'direction',
            'call', 'sms', 'text', 'message', 'contact', 'name', 'cost', 'charge',
            'timestamp', 'caller', 'callee', 'from', 'to', 'start', 'end'
        ]
        
        keyword_matches = 0
        for field in fields:
            field_lower = str(field).lower().replace('_', ' ').replace('-', ' ')
            if any(keyword in field_lower for keyword in header_keywords):
                keyword_matches += 1
        
        score += (keyword_matches / len(fields)) * 2.0
        
        # Criterion 2: Non-numeric content (headers usually aren't pure numbers)
        non_numeric_fields = 0
        for field in fields:
            field_str = str(field).strip()
            if field_str and not field_str.replace('.', '').replace('-', '').isdigit():
                non_numeric_fields += 1
        
        score += (non_numeric_fields / len(fields)) * 1.0
        
        # Criterion 3: Descriptive length (headers are usually 3-30 characters)
        good_length_fields = 0
        for field in fields:
            field_len = len(str(field).strip())
            if 3 <= field_len <= 30:
                good_length_fields += 1
        
        score += (good_length_fields / len(fields)) * 0.5
        
        # Criterion 4: No repeated values (headers should be unique)
        unique_fields = len(set(str(f).strip().lower() for f in fields))
        uniqueness_ratio = unique_fields / len(fields)
        score += uniqueness_ratio * 0.5
        
        # Criterion 5: Contrast with data rows (headers should differ from data)
        if data_lines:
            data_contrast = self._calculate_header_data_contrast(fields, data_lines[:3])
            score += data_contrast * 1.0
        
        return score
    
    def _calculate_header_data_contrast(self, header_fields: List[str], data_lines: List[str]) -> float:
        """Calculate how different the header is from data rows"""
        if not data_lines:
            return 0.0
        
        contrast_score = 0.0
        valid_comparisons = 0
        
        for data_line in data_lines:
            if not data_line.strip():
                continue
            
            # Simple heuristic: headers should have more alphabetic content than data
            header_alpha_ratio = sum(1 for field in header_fields 
                                   for char in str(field) if char.isalpha()) / max(1, sum(len(str(f)) for f in header_fields))
            
            data_alpha_ratio = sum(1 for char in data_line if char.isalpha()) / max(1, len(data_line))
            
            if header_alpha_ratio > data_alpha_ratio:
                contrast_score += 1.0
            
            valid_comparisons += 1
        
        return contrast_score / max(1, valid_comparisons)
    
    async def _analyze_data_types_enhanced(
        self, 
        lines: List[str], 
        delimiter: str, 
        header_row: Optional[int]
    ) -> Dict[str, Dict[str, Any]]:
        """Enhanced data type analysis with confidence scoring"""
        try:
            data_types = {}
            
            # Get data start row
            data_start = (header_row + 1) if header_row is not None else 0
            data_lines = [line for line in lines[data_start:] if line.strip()][:50]  # Larger sample
            
            if not data_lines:
                return data_types
            
            # Determine column count
            first_row = data_lines[0].split(delimiter)
            column_count = len(first_row)
            
            # Initialize analysis for each column
            for col_idx in range(column_count):
                column_samples = []
                
                # Collect samples for this column
                for row_text in data_lines:
                    fields = row_text.split(delimiter)
                    if col_idx < len(fields):
                        field_value = fields[col_idx].strip(' "\'')
                        if field_value:  # Only non-empty values
                            column_samples.append(field_value)
                
                if column_samples:
                    type_analysis = self._analyze_column_type_enhanced(column_samples)
                    data_types[f"column_{col_idx}"] = type_analysis
            
            return data_types
            
        except Exception as e:
            logger.error("Enhanced data type analysis failed", error=str(e))
            return {}
    
    def _analyze_column_type_enhanced(self, samples: List[str]) -> Dict[str, Any]:
        """Enhanced column type analysis with confidence scoring"""
        if not samples:
            return {"type": "string", "confidence": 0.0}
        
        type_scores = {
            'integer': 0.0,
            'float': 0.0,
            'date': 0.0,
            'time': 0.0,
            'phone': 0.0,
            'boolean': 0.0,
            'string': 0.0
        }
        
        sample_size = len(samples)
        
        for sample in samples:
            # Integer check
            try:
                int(sample.replace(',', '').replace('$', ''))
                type_scores['integer'] += 1.0
                continue
            except ValueError:
                pass
            
            # Float check  
            try:
                float(sample.replace(',', '').replace('$', ''))
                type_scores['float'] += 1.0
                continue
            except ValueError:
                pass
            
            # Phone number check
            if self._is_phone_number_enhanced(sample):
                type_scores['phone'] += 1.0
                continue
            
            # Date check
            if self._is_date_enhanced(sample):
                type_scores['date'] += 1.0
                continue
            
            # Time check
            if self._is_time_enhanced(sample):
                type_scores['time'] += 1.0
                continue
            
            # Boolean check
            if sample.lower() in ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n']:
                type_scores['boolean'] += 1.0
                continue
            
            # Default to string
            type_scores['string'] += 1.0
        
        # Calculate confidence scores (normalize to 0-1)
        for type_name in type_scores:
            type_scores[type_name] /= sample_size
        
        # Determine best type
        best_type = max(type_scores, key=type_scores.get)
        confidence = type_scores[best_type]
        
        # Additional metadata
        metadata = {
            "samples_analyzed": sample_size,
            "type_distribution": type_scores,
            "sample_values": samples[:5]  # First 5 samples
        }
        
        return {
            "type": best_type,
            "confidence": confidence,
            "metadata": metadata
        }
    
    def _is_phone_number_enhanced(self, value: str) -> bool:
        """Enhanced phone number detection"""
        import re
        
        # Clean the value
        cleaned = re.sub(r'[^\d+]', '', value)
        
        # Multiple phone number patterns
        patterns = [
            r'^\+?1?[0-9]{10}$',          # US format
            r'^\+?[1-9][0-9]{9,14}$',     # International format
            r'^\+?[0-9]{10,15}$',         # General international
        ]
        
        # Original length check (with formatting)
        if len(value) < 10 or len(value) > 20:
            return False
        
        # Must have enough digits
        if len(cleaned) < 10 or len(cleaned) > 15:
            return False
        
        # Check patterns
        for pattern in patterns:
            if re.match(pattern, cleaned):
                return True
        
        return False
    
    def _is_date_enhanced(self, value: str) -> bool:
        """Enhanced date detection with multiple formats"""
        import re
        
        date_patterns = [
            r'\d{4}-\d{2}-\d{2}',                    # YYYY-MM-DD
            r'\d{2}-\d{2}-\d{4}',                    # MM-DD-YYYY or DD-MM-YYYY
            r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',       # M/D/YY or MM/DD/YYYY
            r'\d{4}[/-]\d{2}[/-]\d{2}',             # YYYY/MM/DD
            r'\d{2}[/-]\d{2}[/-]\d{2}',             # MM/DD/YY
            r'\d{8}',                                # YYYYMMDD
            r'\d{6}',                                # YYMMDD
        ]
        
        value_stripped = value.strip()
        
        for pattern in patterns:
            if re.match(pattern, value_stripped):
                # Additional validation - check reasonable ranges
                try:
                    # Try parsing common formats
                    from datetime import datetime
                    formats = ['%Y-%m-%d', '%m/%d/%Y', '%m-%d-%Y', '%Y/%m/%d', '%Y%m%d']
                    
                    for fmt in formats:
                        try:
                            dt = datetime.strptime(value_stripped, fmt)
                            # Check reasonable year range
                            if 1900 <= dt.year <= 2050:
                                return True
                        except ValueError:
                            continue
                except:
                    pass
                
                return True
        
        return False
    
    def _is_time_enhanced(self, value: str) -> bool:
        """Enhanced time detection"""
        import re
        
        time_patterns = [
            r'\d{1,2}:\d{2}(:\d{2})?(\s?[AaPp][Mm])?',   # HH:MM[:SS] [AM/PM]
            r'\d{4,6}',                                   # HHMM or HHMMSS
            r'\d{1,2}:\d{2}:\d{2}',                      # HH:MM:SS
        ]
        
        value_stripped = value.strip()
        
        for pattern in time_patterns:
            if re.match(pattern, value_stripped):
                return True
        
        return False
    
    async def _estimate_total_rows(self, csv_text: str, delimiter: str) -> int:
        """Estimate total number of rows in the CSV"""
        try:
            # Quick line count
            line_count = csv_text.count('\n')
            
            # Sample-based estimation for more accuracy
            sample_size = min(len(csv_text), 10000)  # 10KB sample
            sample = csv_text[:sample_size]
            sample_lines = sample.count('\n')
            
            if sample_lines > 0:
                ratio = len(csv_text) / sample_size
                estimated_total = int(sample_lines * ratio * 1.1)  # 10% buffer
            else:
                estimated_total = line_count
            
            return max(estimated_total, line_count)
            
        except Exception:
            return len(csv_text.split('\n'))
    
    async def _stream_process_csv(
        self,
        csv_text: str,
        structure: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None,
        progress: Optional[StreamingProgress] = None
    ) -> Dict[str, Any]:
        """Stream process large CSV files with memory optimization"""
        try:
            start_time = time.time()
            
            all_events = []
            all_contacts = []
            errors = []
            warnings = []
            
            delimiter = structure["delimiter"]
            headers = structure.get("headers", [])
            data_start_row = structure.get("data_start_row", 0)
            
            logger.info(
                "Starting streaming CSV processing",
                delimiter=repr(delimiter),
                headers_count=len(headers),
                data_start_row=data_start_row,
                job_id=job_id
            )
            
            # Create streaming CSV reader
            csv_io = io.StringIO(csv_text)
            csv_reader = csv.DictReader(
                csv_io,
                fieldnames=headers if headers else None,
                delimiter=delimiter
            )
            
            # Skip to data start row
            for _ in range(data_start_row):
                try:
                    next(csv_reader)
                except StopIteration:
                    break
            
            # Process in chunks with parallel processing
            chunk_events = []
            processed_rows = 0
            last_progress_update = time.time()
            
            for row_num, row in enumerate(csv_reader, start=data_start_row + 1):
                try:
                    # Apply field mappings to convert row to event
                    event_data = self._apply_field_mappings_enhanced(
                        row, field_mappings, row_num
                    )
                    
                    if event_data and self._is_valid_event_enhanced(event_data):
                        # Add metadata
                        event_data["metadata"] = {
                            "source_row": row_num,
                            "extraction_method": "streaming_csv"
                        }
                        chunk_events.append(event_data)
                    
                    processed_rows += 1
                    
                    # Update progress tracking
                    if progress:
                        progress.update_progress(rows_done=1, valid_done=1 if event_data else 0)
                    
                    # Process chunk when it reaches target size
                    if len(chunk_events) >= self.chunk_size:
                        all_events.extend(chunk_events)
                        chunk_events = []
                        
                        # Memory management
                        if processed_rows % (self.chunk_size * 5) == 0:
                            gc.collect()
                            
                            # Check memory usage
                            current_memory = psutil.Process().memory_info().rss / 1024 / 1024
                            if current_memory > self.memory_threshold_mb:
                                logger.warning(
                                    "Memory usage high during CSV streaming",
                                    current_mb=current_memory,
                                    threshold_mb=self.memory_threshold_mb,
                                    processed_rows=processed_rows
                                )
                        
                        # Update job progress
                        if (job_id and progress and 
                            time.time() - last_progress_update > self.progress_update_interval):
                            
                            completion = min(90, progress.get_completion_percentage() * 0.6 + 25)
                            await db_manager.update_job_status(
                                job_id, "processing", completion, len(all_events), processed_rows
                            )
                            last_progress_update = time.time()
                    
                except Exception as e:
                    errors.append({
                        "error_type": "parsing_error",
                        "error_message": f"Row {row_num}: {str(e)}",
                        "raw_data": dict(row) if row else {},
                        "severity": "warning"
                    })
                    
                    if progress:
                        progress.update_progress(errors_count=1)
                    
                    # Stop processing if error rate is too high
                    if len(errors) > processed_rows * 0.1:  # More than 10% error rate
                        warnings.append(
                            f"Stopping processing due to high error rate: {len(errors)} errors in {processed_rows} rows"
                        )
                        logger.warning("High error rate detected, stopping processing")
                        break
            
            # Process remaining events in last chunk
            if chunk_events:
                all_events.extend(chunk_events)
            
            # Extract contacts from events using parallel processing
            all_contacts = await self._extract_contacts_parallel(all_events)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            logger.info(
                "Streaming CSV processing completed",
                processed_rows=processed_rows,
                events=len(all_events),
                contacts=len(all_contacts),
                errors=len(errors),
                processing_time_ms=processing_time_ms,
                throughput=processed_rows / (processing_time_ms / 1000) if processing_time_ms > 0 else 0
            )
            
            return {
                "events": all_events,
                "contacts": all_contacts,
                "metadata": {
                    "total_rows": processed_rows,
                    "parsed_rows": len(all_events),
                    "error_rows": len(errors),
                    "duplicate_rows": 0,  # Will be calculated during deduplication
                    "processing_time_ms": processing_time_ms,
                    "extraction_method": "streaming_csv",
                    "throughput_rows_per_sec": processed_rows / (processing_time_ms / 1000) if processing_time_ms > 0 else 0
                },
                "errors": errors,
                "warnings": warnings
            }
            
        except Exception as e:
            logger.error("Streaming CSV processing failed", error=str(e), job_id=job_id)
            return self._create_error_response(str(e))
    
    async def _batch_process_csv(
        self,
        csv_text: str,
        structure: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None,
        progress: Optional[StreamingProgress] = None
    ) -> Dict[str, Any]:
        """Batch process smaller CSV files with the original enhanced method"""
        try:
            # Use pandas for efficient processing of smaller files
            import pandas as pd
            
            delimiter = structure["delimiter"]
            header_row = structure.get("header_row")
            
            # Read CSV with pandas for efficiency
            csv_df = pd.read_csv(
                io.StringIO(csv_text),
                delimiter=delimiter,
                header=header_row,
                low_memory=False,
                dtype=str  # Keep all as string to avoid type issues
            )
            
            all_events = []
            all_contacts = []
            errors = []
            
            logger.info(
                "Processing CSV with pandas",
                rows=len(csv_df),
                columns=len(csv_df.columns),
                job_id=job_id
            )
            
            # Process rows in parallel batches
            batch_size = min(1000, len(csv_df))
            
            for batch_start in range(0, len(csv_df), batch_size):
                batch_end = min(batch_start + batch_size, len(csv_df))
                batch_df = csv_df.iloc[batch_start:batch_end]
                
                # Process batch
                batch_results = await self._process_dataframe_batch(
                    batch_df, field_mappings, batch_start
                )
                
                all_events.extend(batch_results["events"])
                errors.extend(batch_results["errors"])
                
                # Update progress
                if progress:
                    progress.update_progress(
                        rows_done=len(batch_df),
                        valid_done=len(batch_results["events"]),
                        errors_count=len(batch_results["errors"])
                    )
                
                # Update job status
                if job_id:
                    completion = min(90, (batch_end / len(csv_df)) * 60 + 25)
                    await db_manager.update_job_status(
                        job_id, "processing", completion, len(all_events), batch_end
                    )
            
            # Extract contacts
            all_contacts = await self._extract_contacts_parallel(all_events)
            
            return {
                "events": all_events,
                "contacts": all_contacts,
                "metadata": {
                    "total_rows": len(csv_df),
                    "parsed_rows": len(all_events),
                    "error_rows": len(errors),
                    "duplicate_rows": 0,
                    "processing_time_ms": 0,  # Will be set by caller
                    "extraction_method": "batch_pandas"
                },
                "errors": errors,
                "warnings": []
            }
            
        except Exception as e:
            logger.error("Batch CSV processing failed", error=str(e), job_id=job_id)
            return self._create_error_response(str(e))
    
    async def _process_dataframe_batch(
        self,
        batch_df: pd.DataFrame,
        field_mappings: List[Dict[str, Any]],
        batch_start: int
    ) -> Dict[str, Any]:
        """Process a pandas DataFrame batch in parallel"""
        events = []
        errors = []
        
        def process_single_row(args):
            row_idx, row_data = args
            try:
                row_dict = row_data.to_dict()
                event_data = self._apply_field_mappings_enhanced(
                    row_dict, field_mappings, batch_start + row_idx
                )
                
                if event_data and self._is_valid_event_enhanced(event_data):
                    event_data["metadata"] = {
                        "source_row": batch_start + row_idx,
                        "extraction_method": "batch_pandas"
                    }
                    return {"success": True, "event": event_data}
                else:
                    return {"success": False, "error": "Validation failed"}
                    
            except Exception as e:
                return {"success": False, "error": str(e)}
        
        # Process rows in parallel
        with ThreadPoolExecutor(max_workers=min(4, len(batch_df))) as executor:
            row_args = [(idx, row) for idx, row in batch_df.iterrows()]
            future_to_row = {
                executor.submit(process_single_row, args): args[0] 
                for args in row_args
            }
            
            for future in as_completed(future_to_row):
                row_idx = future_to_row[future]
                try:
                    result = future.result()
                    if result["success"]:
                        events.append(result["event"])
                    else:
                        errors.append({
                            "error_type": "validation_error",
                            "error_message": f"Row {row_idx}: {result['error']}",
                            "severity": "warning"
                        })
                except Exception as e:
                    errors.append({
                        "error_type": "processing_error",
                        "error_message": f"Row {row_idx}: {str(e)}",
                        "severity": "error"
                    })
        
        return {"events": events, "errors": errors}
    
    def _apply_field_mappings_enhanced(
        self,
        row: Dict[str, Any],
        field_mappings: List[Dict[str, Any]],
        row_num: int
    ) -> Optional[Dict[str, Any]]:
        """Enhanced field mapping with better validation and transformation"""
        try:
            event_data = {}
            
            # Apply each field mapping with enhanced transformation
            for mapping in field_mappings:
                source_field = mapping["source_field"]
                target_field = mapping["target_field"]
                data_type = mapping.get("data_type", "string")
                
                if source_field in row:
                    raw_value = row[source_field]
                    
                    # Enhanced value transformation
                    transformed_value = self._transform_value_enhanced(raw_value, data_type, target_field)
                    
                    if transformed_value is not None:
                        event_data[target_field] = transformed_value
            
            # Enhanced requirement checking and defaults
            if not self._ensure_required_fields_enhanced(event_data, row):
                return None
            
            return event_data
            
        except Exception as e:
            logger.debug(f"Enhanced field mapping failed for row {row_num}", error=str(e))
            return None
    
    def _transform_value_enhanced(self, value: Any, data_type: str, target_field: str) -> Any:
        """Enhanced value transformation with field-specific logic"""
        if value is None or (isinstance(value, str) and value.strip() == ''):
            return None
        
        try:
            value_str = str(value).strip()
            
            if data_type == "string":
                return value_str
            
            elif data_type == "number":
                # Enhanced numeric handling
                cleaned = value_str.replace(',', '').replace('$', '').replace('€', '').replace('£', '')
                
                # Handle duration formats specifically
                if target_field == "duration" and ':' in cleaned:
                    return self._parse_duration_enhanced(cleaned)
                
                # Regular numeric conversion
                try:
                    if '.' in cleaned:
                        return float(cleaned)
                    else:
                        return int(float(cleaned))
                except ValueError:
                    # Try to extract numeric part
                    import re
                    numeric_match = re.search(r'-?\d+\.?\d*', cleaned)
                    if numeric_match:
                        num_str = numeric_match.group()
                        return float(num_str) if '.' in num_str else int(float(num_str))
                    return None
            
            elif data_type == "date":
                return self._parse_date_enhanced(value_str)
            
            elif data_type == "boolean":
                return self._parse_boolean_enhanced(value_str)
            
            else:
                return value_str
        
        except Exception as e:
            logger.debug(f"Value transformation failed for {value} -> {data_type}", error=str(e))
            return str(value).strip() if value else None
    
    def _parse_duration_enhanced(self, duration_str: str) -> int:
        """Enhanced duration parsing"""
        try:
            parts = duration_str.split(':')
            
            if len(parts) == 2:  # MM:SS
                minutes, seconds = int(parts[0]), int(parts[1])
                return minutes * 60 + seconds
            elif len(parts) == 3:  # HH:MM:SS
                hours, minutes, seconds = int(parts[0]), int(parts[1]), int(parts[2])
                return hours * 3600 + minutes * 60 + seconds
            else:
                # Try as plain number
                return int(float(duration_str))
                
        except Exception:
            return 0
    
    def _parse_date_enhanced(self, date_str: str) -> str:
        """Enhanced date parsing with more formats"""
        from datetime import datetime
        
        # Extended format list
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
            "%Y%m%d",
            "%m%d%Y",
            "%d.%m.%Y",
            "%Y.%m.%d",
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
    
    def _parse_boolean_enhanced(self, bool_str: str) -> bool:
        """Enhanced boolean parsing"""
        bool_lower = bool_str.lower().strip()
        
        true_values = ['true', '1', 'yes', 'y', 'on', 'enabled', 'active', 'incoming', 'inbound']
        false_values = ['false', '0', 'no', 'n', 'off', 'disabled', 'inactive', 'outgoing', 'outbound']
        
        if bool_lower in true_values:
            return True
        elif bool_lower in false_values:
            return False
        else:
            # Default based on first character
            return bool_lower.startswith(('t', 'y', '1'))
    
    def _ensure_required_fields_enhanced(self, event_data: Dict[str, Any], raw_row: Dict[str, Any]) -> bool:
        """Enhanced requirement checking with intelligent defaults"""
        required_fields = ["number", "ts"]
        
        # Check basic requirements
        for field in required_fields:
            if field not in event_data or not event_data[field]:
                return False
        
        # Add intelligent defaults for optional but important fields
        if "type" not in event_data:
            # Try to infer from other fields or default to "call"
            if any(key.lower() in ['sms', 'text', 'message'] for key in raw_row.keys()):
                event_data["type"] = "sms"
            else:
                event_data["type"] = "call"
        
        if "direction" not in event_data:
            # Try to infer from other fields or default to "outbound"
            direction_indicators = {
                'inbound': ['in', 'incoming', 'received', 'inbound'],
                'outbound': ['out', 'outgoing', 'sent', 'outbound', 'dialed']
            }
            
            for direction, indicators in direction_indicators.items():
                if any(indicator in str(raw_row.get(key, '')).lower() 
                      for key in raw_row.keys() 
                      for indicator in indicators):
                    event_data["direction"] = direction
                    break
            else:
                event_data["direction"] = "outbound"
        
        return True
    
    def _is_valid_event_enhanced(self, event_data: Dict[str, Any]) -> bool:
        """Enhanced event validation with better phone number checking"""
        # Basic field requirements
        if not self._has_required_fields(event_data):
            return False
        
        # Enhanced phone number validation
        phone = str(event_data["number"]).strip()
        if not self._is_phone_number_enhanced(phone):
            return False
        
        # Date validation
        if "ts" in event_data:
            ts = event_data["ts"]
            if isinstance(ts, str) and len(ts) < 8:  # Too short to be a valid date
                return False
        
        return True
    
    def _has_required_fields(self, event_data: Dict[str, Any]) -> bool:
        """Check if event has minimum required fields"""
        required_fields = ["number", "ts"]
        
        for field in required_fields:
            if field not in event_data or not event_data[field]:
                return False
        
        return True
    
    async def _extract_contacts_parallel(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract contacts from events using parallel processing"""
        if not events:
            return []
        
        def process_event_batch(event_batch):
            contact_map = {}
            
            for event in event_batch:
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
                        "metadata": {"source": "enhanced_csv_import"}
                    }
                
                contact = contact_map[normalized_phone]
                
                # Update statistics
                event_type = event.get("type", "call")
                if event_type == "call":
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
        
        # Process events in parallel batches
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
                    logger.error("Contact extraction batch failed", error=str(e))
        
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
    
    def _calculate_data_quality(self, parsing_result: Dict[str, Any]) -> float:
        """Calculate data quality score"""
        try:
            total_rows = parsing_result["metadata"]["total_rows"]
            parsed_rows = parsing_result["metadata"]["parsed_rows"]
            error_rows = parsing_result["metadata"]["error_rows"]
            
            if total_rows == 0:
                return 0.0
            
            success_rate = parsed_rows / total_rows
            error_rate = error_rows / total_rows
            
            quality_score = success_rate * (1.0 - error_rate * 0.5)
            return min(1.0, quality_score)
        except:
            return 0.5
    
    def _create_error_response(self, error_message: str) -> Dict[str, Any]:
        """Create standardized error response"""
        return {
            "events": [],
            "contacts": [],
            "metadata": {
                "total_rows": 0,
                "parsed_rows": 0,
                "error_rows": 1,
                "duplicate_rows": 0,
                "processing_time_ms": 0,
                "extraction_method": "enhanced_csv_failed"
            },
            "errors": [{"error_type": "parsing_error", "error_message": error_message, "severity": "critical"}],
            "warnings": []
        }
    
    def _create_fallback_structure(self) -> Dict[str, Any]:
        """Create fallback CSV structure when detection fails"""
        return {
            "delimiter": ",",
            "headers": [],
            "header_row": None,
            "data_start_row": 0,
            "estimated_rows": 1000,
            "data_types": {},
            "sample_analyzed": 0,
            "structure_confidence": 0.1,
            "detection_method": "fallback"
        }


# Global enhanced CSV parser instance
enhanced_csv_parser = EnhancedCSVParser()