"""
PDF parser implementation for carrier CDR documents

Supports:
- Text extraction from PDF documents
- OCR fallback for scanned documents 
- Table detection and extraction
- Multi-page document processing
- Progress tracking for large files
"""
import io
import re
import time
import gc
import concurrent.futures
from typing import Dict, List, Optional, Any, Tuple, Iterator
from pathlib import Path
import structlog
import pandas as pd
import numpy as np
from PIL import Image
import PyPDF2
import pdfplumber
import pytesseract
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import psutil
from contextlib import contextmanager

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


@dataclass  
class ProcessingProgress:
    """Track processing progress for large PDFs"""
    total_pages: int = 0
    processed_pages: int = 0
    extracted_rows: int = 0
    errors: int = 0
    start_time: float = 0.0
    last_update: float = 0.0
    
    def update_progress(self, pages_done: int = 0, rows_done: int = 0, errors_count: int = 0):
        self.processed_pages += pages_done
        self.extracted_rows += rows_done
        self.errors += errors_count
        self.last_update = time.time()
    
    def get_completion_percentage(self) -> float:
        if self.total_pages == 0:
            return 0.0
        return min(100.0, (self.processed_pages / self.total_pages) * 100.0)
    
    def get_throughput(self) -> float:
        """Get processing throughput in pages per second"""
        elapsed = time.time() - self.start_time
        return self.processed_pages / elapsed if elapsed > 0 else 0.0


class PDFParser:
    """Enhanced production-ready PDF parser for carrier CDR documents with streaming processing"""
    
    def __init__(self):
        self.ocr_enabled = True
        self.tesseract_cmd = settings.tesseract_cmd
        if self.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = self.tesseract_cmd
        
        # Enhanced configuration for performance
        self.max_concurrent_pages = min(4, psutil.cpu_count())  # Limit CPU usage
        self.memory_threshold_mb = 1500  # Memory usage threshold
        self.batch_size = 5  # Pages to process in each batch
        self.progress_update_interval = 2.0  # Seconds between progress updates
        self.ocr_timeout_seconds = 30  # OCR timeout per page
        
        # Performance tracking
        self.processing_stats = {
            'total_processed': 0,
            'avg_processing_time': 0.0,
            'memory_peak': 0.0,
            'ocr_success_rate': 1.0
        }
    
    async def parse_pdf(
        self, 
        pdf_data: bytes, 
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Parse PDF document and extract structured data
        
        Args:
            pdf_data: Raw PDF file bytes
            field_mappings: ML-generated field mappings
            job_id: Optional job ID for progress tracking
            
        Returns:
            Dict containing extracted events, contacts, and metadata
        """
        start_time = time.time()
        progress = ProcessingProgress(start_time=start_time)
        
        try:
            logger.info(
                "Starting enhanced PDF parsing", 
                job_id=job_id, 
                size_bytes=len(pdf_data),
                max_concurrent_pages=self.max_concurrent_pages
            )
            
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 10)
            
            # Quick PDF analysis to determine processing strategy
            pdf_info = self._analyze_pdf_structure(pdf_data)
            progress.total_pages = pdf_info["page_count"]
            
            logger.info(
                "PDF analysis completed",
                job_id=job_id,
                pages=pdf_info["page_count"],
                has_text=pdf_info["has_extractable_text"],
                estimated_tables=pdf_info["estimated_table_count"],
                complexity=pdf_info["processing_complexity"]
            )
            
            # Choose optimal extraction strategy based on analysis
            if pdf_info["has_extractable_text"] and pdf_info["text_extraction_confidence"] > 0.7:
                logger.info("Using text-based extraction strategy", job_id=job_id)
                extracted_data = await self._extract_text_data_enhanced(
                    pdf_data, field_mappings, job_id, progress, pdf_info
                )
            else:
                logger.info("Using OCR extraction strategy", job_id=job_id)
                extracted_data = await self._extract_ocr_data_enhanced(
                    pdf_data, field_mappings, job_id, progress, pdf_info
                )
            
            if extracted_data["success"] and extracted_data["rows_extracted"] > 0:
                logger.info(
                    "PDF extraction successful", 
                    job_id=job_id, 
                    rows=extracted_data["rows_extracted"],
                    method=extracted_data["method"],
                    processing_time_ms=int((time.time() - start_time) * 1000)
                )
                return extracted_data["result"]
            
            # Fallback to hybrid extraction if primary method failed
            logger.info("Attempting hybrid extraction as fallback", job_id=job_id)
            fallback_data = await self._hybrid_extraction_fallback(
                pdf_data, field_mappings, job_id, progress
            )
            
            if fallback_data["success"]:
                logger.info(
                    "Hybrid extraction successful", 
                    job_id=job_id, 
                    rows=fallback_data["rows_extracted"]
                )
                return fallback_data["result"]
            
            # If both methods failed, return empty result with error
            logger.warning("PDF parsing failed for both text and OCR methods", job_id=job_id)
            
            return {
                "events": [],
                "contacts": [],
                "metadata": {
                    "total_rows": 0,
                    "parsed_rows": 0,
                    "error_rows": 0,
                    "duplicate_rows": 0,
                    "processing_time_ms": 0,
                    "extraction_method": "failed"
                },
                "errors": [{
                    "error_type": "parsing_error",
                    "error_message": "Failed to extract data from PDF using both text and OCR methods",
                    "severity": "error"
                }],
                "warnings": []
            }
            
        except Exception as e:
            logger.error("PDF parsing failed", job_id=job_id, error=str(e))
            
            if job_id:
                await db_manager.add_ingestion_error(
                    job_id=job_id,
                    error_type="parsing_error",
                    error_message=f"PDF parsing failed: {str(e)}",
                    severity="critical"
                )
            
            return {
                "events": [],
                "contacts": [],
                "metadata": {"total_rows": 0, "parsed_rows": 0, "error_rows": 1, "duplicate_rows": 0, "processing_time_ms": 0},
                "errors": [{"error_type": "parsing_error", "error_message": str(e), "severity": "critical"}],
                "warnings": []
            }
    
    async def _extract_text_data(
        self, 
        pdf_data: bytes, 
        field_mappings: List[Dict[str, Any]], 
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extract data using text-based PDF parsing"""
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_data))
            total_pages = len(pdf_reader.pages)
            
            logger.info("Extracting text from PDF", pages=total_pages, job_id=job_id)
            
            all_text = ""
            extracted_tables = []
            
            # Extract text from each page
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    all_text += page_text + "\n\n"
                    
                    # Try to extract tables using pdfplumber for better table detection
                    with pdfplumber.open(io.BytesIO(pdf_data)) as pdf:
                        if page_num < len(pdf.pages):
                            plumber_page = pdf.pages[page_num]
                            tables = plumber_page.extract_tables()
                            
                            for table in tables:
                                if table and len(table) > 1:  # Must have header + data
                                    extracted_tables.append({
                                        "page": page_num + 1,
                                        "data": table
                                    })
                    
                    # Update progress
                    if job_id and total_pages > 1:
                        progress = 20 + (page_num / total_pages) * 50
                        await db_manager.update_job_status(job_id, "processing", progress)
                        
                except Exception as e:
                    logger.warning(f"Failed to extract text from page {page_num + 1}", error=str(e))
                    continue
            
            # Process extracted content
            if extracted_tables:
                # Use table data (more structured)
                result = await self._process_table_data(extracted_tables, field_mappings, job_id)
            else:
                # Use text data (less structured)
                result = await self._process_text_data(all_text, field_mappings, job_id)
            
            return {
                "success": True,
                "rows_extracted": result["metadata"]["parsed_rows"],
                "result": result
            }
            
        except Exception as e:
            logger.error("Text extraction failed", error=str(e), job_id=job_id)
            return {"success": False, "error": str(e)}
    
    async def _extract_ocr_data(
        self, 
        pdf_data: bytes, 
        field_mappings: List[Dict[str, Any]], 
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extract data using OCR for scanned PDFs"""
        try:
            from pdf2image import convert_from_bytes
            
            logger.info("Converting PDF to images for OCR", job_id=job_id)
            
            # Convert PDF pages to images
            images = convert_from_bytes(pdf_data, dpi=200)
            total_pages = len(images)
            
            all_text = ""
            
            for page_num, image in enumerate(images):
                try:
                    # Configure OCR options
                    ocr_config = f'--oem 3 --psm 6 -l {settings.ocr_languages}'
                    
                    # Extract text using OCR
                    page_text = pytesseract.image_to_string(image, config=ocr_config)
                    all_text += page_text + "\n\n"
                    
                    # Update progress
                    if job_id and total_pages > 1:
                        progress = 30 + (page_num / total_pages) * 40
                        await db_manager.update_job_status(job_id, "processing", progress)
                    
                    logger.debug(f"OCR completed for page {page_num + 1}", 
                               chars_extracted=len(page_text))
                    
                except Exception as e:
                    logger.warning(f"OCR failed for page {page_num + 1}", error=str(e))
                    continue
            
            # Process OCR text
            result = await self._process_text_data(all_text, field_mappings, job_id)
            
            return {
                "success": True,
                "rows_extracted": result["metadata"]["parsed_rows"],
                "result": result
            }
            
        except ImportError:
            logger.error("pdf2image not available for OCR processing")
            return {"success": False, "error": "OCR dependencies not available"}
        except Exception as e:
            logger.error("OCR extraction failed", error=str(e), job_id=job_id)
            return {"success": False, "error": str(e)}
    
    async def _process_table_data(
        self, 
        tables: List[Dict[str, Any]], 
        field_mappings: List[Dict[str, Any]], 
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Process structured table data from PDF"""
        try:
            all_events = []
            all_contacts = []
            errors = []
            total_rows_processed = 0
            
            for table_info in tables:
                table_data = table_info["data"]
                page_num = table_info["page"]
                
                if not table_data or len(table_data) < 2:
                    continue
                
                # Assume first row is headers
                headers = [str(cell).strip() if cell else "" for cell in table_data[0]]
                data_rows = table_data[1:]
                
                # Create DataFrame for easier processing
                df = pd.DataFrame(data_rows, columns=headers)
                
                # Clean the DataFrame
                df = df.dropna(how='all')  # Remove completely empty rows
                df = df.fillna('')  # Fill NaN with empty strings
                
                logger.info(f"Processing table from page {page_num}", 
                          rows=len(df), 
                          columns=len(headers))
                
                # Apply field mappings to convert to events
                for idx, row in df.iterrows():
                    try:
                        event_data = self._apply_field_mappings(
                            dict(row), field_mappings, page_num, idx + 1
                        )
                        
                        if event_data and self._is_valid_event(event_data):
                            # Add metadata
                            event_data["metadata"] = {
                                "source_page": page_num,
                                "source_row": idx + 1,
                                "extraction_method": "table"
                            }
                            all_events.append(event_data)
                        
                        total_rows_processed += 1
                        
                    except Exception as e:
                        errors.append({
                            "error_type": "validation_error",
                            "error_message": f"Row {idx + 1} on page {page_num}: {str(e)}",
                            "raw_data": dict(row),
                            "severity": "warning"
                        })
            
            # Extract contacts from events
            all_contacts = self._extract_contacts_from_events(all_events)
            
            # Update progress
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 80)
            
            return {
                "events": all_events,
                "contacts": all_contacts,
                "metadata": {
                    "total_rows": total_rows_processed,
                    "parsed_rows": len(all_events),
                    "error_rows": len(errors),
                    "duplicate_rows": 0,  # Will be calculated during deduplication
                    "processing_time_ms": 0,  # Will be set by caller
                    "extraction_method": "table",
                    "pages_processed": len(tables)
                },
                "errors": errors,
                "warnings": []
            }
            
        except Exception as e:
            logger.error("Table data processing failed", error=str(e), job_id=job_id)
            return {
                "events": [],
                "contacts": [],
                "metadata": {"total_rows": 0, "parsed_rows": 0, "error_rows": 1, "duplicate_rows": 0, "processing_time_ms": 0},
                "errors": [{"error_type": "parsing_error", "error_message": str(e), "severity": "critical"}],
                "warnings": []
            }
    
    async def _process_text_data(
        self, 
        text: str, 
        field_mappings: List[Dict[str, Any]], 
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Process unstructured text data from PDF"""
        try:
            all_events = []
            all_contacts = []
            errors = []
            
            # Try to detect patterns in the text
            lines = text.split('\n')
            lines = [line.strip() for line in lines if line.strip()]
            
            logger.info("Processing text data", total_lines=len(lines), job_id=job_id)
            
            # Look for structured data patterns
            data_lines = []
            
            for line_num, line in enumerate(lines):
                # Skip header-like lines
                if self._is_header_line(line):
                    continue
                
                # Try to extract structured data from line
                line_data = self._parse_text_line(line, field_mappings)
                
                if line_data:
                    data_lines.append({
                        "line_number": line_num + 1,
                        "raw_line": line,
                        "parsed_data": line_data
                    })
            
            logger.info(f"Found {len(data_lines)} structured data lines")
            
            # Process parsed data lines
            for data_line in data_lines:
                try:
                    event_data = self._apply_field_mappings(
                        data_line["parsed_data"], 
                        field_mappings, 
                        1,  # PDF text extraction doesn't have page concept
                        data_line["line_number"]
                    )
                    
                    if event_data and self._is_valid_event(event_data):
                        # Add metadata
                        event_data["metadata"] = {
                            "source_line": data_line["line_number"],
                            "extraction_method": "text",
                            "raw_text": data_line["raw_line"]
                        }
                        all_events.append(event_data)
                        
                except Exception as e:
                    errors.append({
                        "error_type": "validation_error",
                        "error_message": f"Line {data_line['line_number']}: {str(e)}",
                        "raw_data": {"raw_line": data_line["raw_line"]},
                        "severity": "warning"
                    })
            
            # Extract contacts from events
            all_contacts = self._extract_contacts_from_events(all_events)
            
            # Update progress
            if job_id:
                await db_manager.update_job_status(job_id, "processing", 80)
            
            return {
                "events": all_events,
                "contacts": all_contacts,
                "metadata": {
                    "total_rows": len(data_lines),
                    "parsed_rows": len(all_events),
                    "error_rows": len(errors),
                    "duplicate_rows": 0,
                    "processing_time_ms": 0,
                    "extraction_method": "text",
                    "text_lines_processed": len(lines)
                },
                "errors": errors,
                "warnings": []
            }
            
        except Exception as e:
            logger.error("Text data processing failed", error=str(e), job_id=job_id)
            return {
                "events": [],
                "contacts": [],
                "metadata": {"total_rows": 0, "parsed_rows": 0, "error_rows": 1, "duplicate_rows": 0, "processing_time_ms": 0},
                "errors": [{"error_type": "parsing_error", "error_message": str(e), "severity": "critical"}],
                "warnings": []
            }
    
    def _apply_field_mappings(
        self, 
        raw_data: Dict[str, Any], 
        field_mappings: List[Dict[str, Any]], 
        page_num: int, 
        row_num: int
    ) -> Optional[Dict[str, Any]]:
        """Apply field mappings to convert raw data to event format"""
        try:
            event_data = {}
            
            # Apply each field mapping
            for mapping in field_mappings:
                source_field = mapping["source_field"]
                target_field = mapping["target_field"]
                data_type = mapping.get("data_type", "string")
                
                if source_field in raw_data:
                    raw_value = raw_data[source_field]
                    
                    # Transform value based on data type
                    transformed_value = self._transform_value(raw_value, data_type)
                    
                    if transformed_value is not None:
                        event_data[target_field] = transformed_value
            
            # Ensure required fields are present
            required_fields = ["number", "ts", "type", "direction"]
            for field in required_fields:
                if field not in event_data:
                    # Try to infer missing required fields
                    if field == "type":
                        event_data["type"] = "call"  # Default assumption
                    elif field == "direction":
                        event_data["direction"] = "outbound"  # Default assumption
                    else:
                        return None  # Cannot proceed without number or timestamp
            
            return event_data
            
        except Exception as e:
            logger.error(f"Field mapping failed for row {row_num}", error=str(e))
            return None
    
    def _transform_value(self, value: Any, data_type: str) -> Any:
        """Transform value to the specified data type"""
        if value is None or value == '':
            return None
        
        try:
            if data_type == "string":
                return str(value).strip()
            
            elif data_type == "number":
                # Handle duration formats like "00:05:30" or "5:30"
                if isinstance(value, str) and ':' in value:
                    parts = value.split(':')
                    if len(parts) == 2:  # MM:SS
                        return int(parts[0]) * 60 + int(parts[1])
                    elif len(parts) == 3:  # HH:MM:SS
                        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                
                # Regular numeric conversion
                num_str = str(value).replace(',', '').replace('$', '').strip()
                return float(num_str) if '.' in num_str else int(float(num_str))
            
            elif data_type == "date":
                from datetime import datetime
                
                # Try common date formats
                date_formats = [
                    "%m/%d/%Y %H:%M:%S",
                    "%m/%d/%Y %H:%M",
                    "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d %H:%M",
                    "%m/%d/%Y",
                    "%Y-%m-%d",
                    "%m-%d-%Y",
                    "%d/%m/%Y",
                ]
                
                value_str = str(value).strip()
                
                for fmt in date_formats:
                    try:
                        dt = datetime.strptime(value_str, fmt)
                        return dt.isoformat()
                    except ValueError:
                        continue
                
                # If no format matches, return the original value
                return value_str
            
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
    
    def _is_valid_event(self, event_data: Dict[str, Any]) -> bool:
        """Check if event data is valid and complete"""
        required_fields = ["number", "ts", "type", "direction"]
        
        for field in required_fields:
            if field not in event_data or not event_data[field]:
                return False
        
        # Validate phone number format
        phone = str(event_data["number"]).strip()
        if not re.match(r'^\+?1?[0-9]{10,11}$', re.sub(r'[^0-9+]', '', phone)):
            return False
        
        return True
    
    def _extract_contacts_from_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract contact information from parsed events"""
        contact_map = {}
        
        for event in events:
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
                    "metadata": {"source": "pdf_import"}
                }
            
            contact = contact_map[normalized_phone]
            
            # Update statistics
            if event.get("type") == "call":
                contact["total_calls"] += 1
            elif event.get("type") == "sms":
                contact["total_sms"] += 1
            
            # Update date range
            event_ts = event.get("ts")
            if event_ts:
                if not contact["first_seen"] or event_ts < contact["first_seen"]:
                    contact["first_seen"] = event_ts
                if not contact["last_seen"] or event_ts > contact["last_seen"]:
                    contact["last_seen"] = event_ts
        
        return list(contact_map.values())
    
    def _analyze_pdf_structure(self, pdf_data: bytes) -> Dict[str, Any]:
        """Quick analysis of PDF structure to determine optimal processing strategy"""
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_data))
            page_count = len(pdf_reader.pages)
            
            # Sample first few pages to determine text extractability
            sample_pages = min(3, page_count)
            total_text_length = 0
            extractable_pages = 0
            estimated_tables = 0
            
            for i in range(sample_pages):
                try:
                    page = pdf_reader.pages[i]
                    text = page.extract_text()
                    text_length = len(text.strip())
                    total_text_length += text_length
                    
                    if text_length > 50:  # Page has meaningful text
                        extractable_pages += 1
                    
                    # Quick table detection - look for alignment patterns
                    lines = text.split('\n')
                    aligned_lines = sum(1 for line in lines if len(line.split()) > 3 and any(c.isdigit() for c in line))
                    if aligned_lines > 3:
                        estimated_tables += 1
                        
                except Exception:
                    continue
            
            # Calculate confidence scores
            has_extractable_text = extractable_pages > 0
            text_extraction_confidence = extractable_pages / sample_pages if sample_pages > 0 else 0
            avg_text_per_page = total_text_length / sample_pages if sample_pages > 0 else 0
            
            return {
                "page_count": page_count,
                "has_extractable_text": has_extractable_text,
                "text_extraction_confidence": text_extraction_confidence,
                "avg_text_per_page": avg_text_per_page,
                "estimated_table_count": estimated_tables,
                "processing_complexity": "high" if page_count > 50 else "medium" if page_count > 10 else "low"
            }
            
        except Exception as e:
            logger.error("PDF structure analysis failed", error=str(e))
            return {
                "page_count": 1,
                "has_extractable_text": False,
                "text_extraction_confidence": 0.1,
                "avg_text_per_page": 0,
                "estimated_table_count": 0,
                "processing_complexity": "unknown"
            }
    
    async def _extract_text_data_enhanced(
        self, 
        pdf_data: bytes, 
        field_mappings: List[Dict[str, Any]], 
        job_id: Optional[str] = None,
        progress: Optional[ProcessingProgress] = None,
        pdf_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Enhanced text extraction with parallel processing and streaming"""
        try:
            start_time = time.time()
            
            # Use streaming PDF processing for large documents
            if pdf_info and pdf_info["page_count"] > 20:
                return await self._stream_process_pdf_text(pdf_data, field_mappings, job_id, progress)
            else:
                return await self._batch_process_pdf_text(pdf_data, field_mappings, job_id, progress)
                
        except Exception as e:
            logger.error("Enhanced text extraction failed", error=str(e))
            return {"success": False, "error": str(e)}
    
    async def _batch_process_pdf_text(
        self,
        pdf_data: bytes,
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None,
        progress: Optional[ProcessingProgress] = None
    ) -> Dict[str, Any]:
        """Batch process smaller PDFs using the original method with enhancements"""
        try:
            # Use the original extract_text_data method but with progress tracking
            result = await self._extract_text_data(pdf_data, field_mappings, job_id)
            
            if progress:
                progress.update_progress(pages_done=1, rows_done=result["metadata"]["parsed_rows"])
            
            # Enhance metadata
            result["metadata"]["extraction_method"] = "batch_text"
            
            return {
                "success": True,
                "rows_extracted": result["metadata"]["parsed_rows"],
                "method": "batch_text",
                "result": result
            }
            
        except Exception as e:
            logger.error("Batch PDF text processing failed", error=str(e))
            return {"success": False, "error": str(e)}
    
    async def _stream_process_pdf_text(
        self,
        pdf_data: bytes,
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None,
        progress: Optional[ProcessingProgress] = None
    ) -> Dict[str, Any]:
        """Stream process large PDFs page by page to minimize memory usage"""
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_data))
            total_pages = len(pdf_reader.pages)
            
            all_events = []
            all_contacts = []
            errors = []
            processed_pages = 0
            
            logger.info("Starting streaming PDF text processing", total_pages=total_pages, job_id=job_id)
            
            # Process pages in batches with memory management
            for batch_start in range(0, total_pages, self.batch_size):
                batch_end = min(batch_start + self.batch_size, total_pages)
                batch_pages = list(range(batch_start, batch_end))
                
                # Process batch with parallel execution
                batch_results = await self._process_page_batch_parallel(
                    pdf_reader, batch_pages, field_mappings, job_id
                )
                
                # Aggregate results
                for result in batch_results:
                    if result["success"]:
                        all_events.extend(result["events"])
                        all_contacts.extend(result["contacts"])
                    else:
                        errors.extend(result["errors"])
                
                processed_pages += len(batch_pages)
                
                # Update progress
                if progress:
                    progress.update_progress(pages_done=len(batch_pages), rows_done=len(all_events))
                
                if job_id and time.time() - progress.last_update > self.progress_update_interval:
                    completion = min(95, (processed_pages / total_pages) * 80 + 15)
                    await db_manager.update_job_status(
                        job_id, "processing", completion, len(all_events)
                    )
                
                # Memory management - force garbage collection
                if processed_pages % 20 == 0:
                    gc.collect()
                
                # Check memory usage
                current_memory = psutil.Process().memory_info().rss / 1024 / 1024
                if current_memory > self.memory_threshold_mb:
                    logger.warning(
                        "Memory usage high during PDF processing",
                        current_mb=current_memory,
                        threshold_mb=self.memory_threshold_mb
                    )
                    # Trigger more aggressive garbage collection
                    gc.collect()
            
            # Extract contacts from all events
            if all_events:
                final_contacts = self._extract_contacts_from_events(all_events)
                all_contacts.extend(final_contacts)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            logger.info(
                "Streaming PDF text processing completed",
                job_id=job_id,
                pages_processed=processed_pages,
                events_extracted=len(all_events),
                contacts_extracted=len(all_contacts),
                errors=len(errors),
                processing_time_ms=processing_time_ms
            )
            
            return {
                "success": True,
                "rows_extracted": len(all_events),
                "method": "streaming_text",
                "result": {
                    "events": all_events,
                    "contacts": all_contacts,
                    "metadata": {
                        "total_rows": processed_pages,
                        "parsed_rows": len(all_events),
                        "error_rows": len(errors),
                        "duplicate_rows": 0,
                        "processing_time_ms": processing_time_ms,
                        "extraction_method": "streaming_text",
                        "pages_processed": processed_pages
                    },
                    "errors": errors,
                    "warnings": []
                }
            }
            
        except Exception as e:
            logger.error("Streaming PDF text processing failed", error=str(e))
            return {"success": False, "error": str(e)}
    
    async def _process_page_batch_parallel(
        self,
        pdf_reader: PyPDF2.PdfReader,
        page_indices: List[int],
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Process a batch of PDF pages in parallel"""
        results = []
        
        def process_single_page(page_index: int) -> Dict[str, Any]:
            """Process a single PDF page"""
            try:
                page = pdf_reader.pages[page_index]
                page_text = page.extract_text()
                
                if not page_text or len(page_text.strip()) < 10:
                    return {"success": False, "events": [], "contacts": [], "errors": []}
                
                # Try to extract tables from page using pdfplumber
                page_events = []
                page_errors = []
                
                # Process with pdfplumber for better table detection
                with pdfplumber.open(io.BytesIO(pdf_reader.stream.getvalue())) as pdf:
                    if page_index < len(pdf.pages):
                        plumber_page = pdf.pages[page_index]
                        tables = plumber_page.extract_tables()
                        
                        for table_idx, table in enumerate(tables):
                            if table and len(table) > 1:  # Has header + data
                                table_events = self._process_table_data_sync(
                                    [{"page": page_index + 1, "data": table}], 
                                    field_mappings
                                )
                                page_events.extend(table_events)
                        
                        # If no tables found, process as text
                        if not page_events:
                            text_events = self._process_text_data_sync(page_text, field_mappings)
                            page_events.extend(text_events)
                
                return {
                    "success": True,
                    "events": page_events,
                    "contacts": [],
                    "errors": page_errors
                }
                
            except Exception as e:
                return {
                    "success": False,
                    "events": [],
                    "contacts": [],
                    "errors": [{"error": f"Page {page_index + 1}: {str(e)}", "page": page_index + 1}]
                }
        
        # Process pages in parallel with limited concurrency
        with ThreadPoolExecutor(max_workers=min(self.max_concurrent_pages, len(page_indices))) as executor:
            future_to_page = {
                executor.submit(process_single_page, page_idx): page_idx 
                for page_idx in page_indices
            }
            
            for future in as_completed(future_to_page):
                page_idx = future_to_page[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    results.append({
                        "success": False,
                        "events": [],
                        "contacts": [],
                        "errors": [{"error": f"Page {page_idx + 1} processing failed: {str(e)}"}]
                    })
        
        return results
    
    def _process_table_data_sync(
        self, 
        tables: List[Dict[str, Any]], 
        field_mappings: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Synchronous version of table processing for parallel execution"""
        events = []
        
        for table_info in tables:
            table_data = table_info["data"]
            page_num = table_info["page"]
            
            if not table_data or len(table_data) < 2:
                continue
            
            # Process table rows
            headers = [str(cell).strip() if cell else "" for cell in table_data[0]]
            data_rows = table_data[1:]
            
            for idx, row in enumerate(data_rows):
                try:
                    row_dict = {}
                    for i, cell in enumerate(row):
                        if i < len(headers) and headers[i]:
                            row_dict[headers[i]] = str(cell).strip() if cell else ""
                    
                    event_data = self._apply_field_mappings(row_dict, field_mappings, page_num, idx + 1)
                    
                    if event_data and self._is_valid_event(event_data):
                        event_data["metadata"] = {
                            "source_page": page_num,
                            "source_row": idx + 1,
                            "extraction_method": "table_parallel"
                        }
                        events.append(event_data)
                        
                except Exception:
                    continue
        
        return events
    
    def _process_text_data_sync(
        self, 
        text: str, 
        field_mappings: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Synchronous version of text processing for parallel execution"""
        events = []
        
        try:
            lines = text.split('\n')
            lines = [line.strip() for line in lines if line.strip()]
            
            for line_num, line in enumerate(lines):
                if self._is_header_line(line):
                    continue
                
                line_data = self._parse_text_line(line, field_mappings)
                if line_data:
                    event_data = self._apply_field_mappings(line_data, field_mappings, 1, line_num + 1)
                    
                    if event_data and self._is_valid_event(event_data):
                        event_data["metadata"] = {
                            "source_line": line_num + 1,
                            "extraction_method": "text_parallel",
                            "raw_text": line
                        }
                        events.append(event_data)
        
        except Exception:
            pass
        
        return events
    
    async def _extract_ocr_data_enhanced(
        self, 
        pdf_data: bytes, 
        field_mappings: List[Dict[str, Any]], 
        job_id: Optional[str] = None,
        progress: Optional[ProcessingProgress] = None,
        pdf_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Enhanced OCR extraction with timeout and parallel processing"""
        try:
            from pdf2image import convert_from_bytes
            
            logger.info("Starting enhanced OCR processing", job_id=job_id)
            
            # Convert PDF to images with optimized settings
            dpi = 200 if pdf_info and pdf_info["processing_complexity"] == "high" else 300
            images = convert_from_bytes(pdf_data, dpi=dpi, thread_count=2)
            total_pages = len(images)
            
            if progress:
                progress.total_pages = total_pages
            
            all_text = ""
            processed_pages = 0
            ocr_errors = []
            
            # Process images in batches to manage memory
            for batch_start in range(0, total_pages, self.batch_size):
                batch_end = min(batch_start + self.batch_size, total_pages)
                batch_images = images[batch_start:batch_end]
                
                # Process batch with timeout
                batch_text = await self._process_ocr_batch(batch_images, batch_start)
                all_text += batch_text["text"]
                ocr_errors.extend(batch_text["errors"])
                
                processed_pages += len(batch_images)
                
                # Update progress
                if progress:
                    progress.update_progress(pages_done=len(batch_images))
                
                if job_id:
                    completion = min(95, (processed_pages / total_pages) * 60 + 30)
                    await db_manager.update_job_status(
                        job_id, "processing", completion, progress.extracted_rows if progress else 0
                    )
                
                # Memory cleanup
                if processed_pages % 10 == 0:
                    gc.collect()
            
            # Process extracted text
            result = await self._process_text_data(all_text, field_mappings, job_id)
            
            # Update result with OCR-specific metadata
            result["metadata"]["extraction_method"] = "enhanced_ocr"
            result["metadata"]["ocr_pages_processed"] = processed_pages
            result["metadata"]["ocr_errors"] = len(ocr_errors)
            result["errors"].extend(ocr_errors)
            
            return {
                "success": True,
                "rows_extracted": result["metadata"]["parsed_rows"],
                "method": "enhanced_ocr",
                "result": result
            }
            
        except ImportError:
            logger.error("pdf2image not available for OCR processing")
            return {"success": False, "error": "OCR dependencies not available"}
        except Exception as e:
            logger.error("Enhanced OCR extraction failed", error=str(e))
            return {"success": False, "error": str(e)}
    
    async def _process_ocr_batch(self, batch_images: List[Any], batch_start: int) -> Dict[str, Any]:
        """Process a batch of images with OCR using parallel processing and timeouts"""
        batch_text = ""
        errors = []
        
        def ocr_single_image(args):
            image, page_num = args
            try:
                # Configure OCR with timeout
                ocr_config = f'--oem 3 --psm 6 -l {settings.ocr_languages}'
                
                # Use threading timeout for OCR
                import signal
                
                def timeout_handler(signum, frame):
                    raise TimeoutError("OCR timeout")
                
                # Set timeout
                signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(self.ocr_timeout_seconds)
                
                try:
                    text = pytesseract.image_to_string(image, config=ocr_config)
                    signal.alarm(0)  # Cancel timeout
                    return {"success": True, "text": text, "page": page_num}
                except TimeoutError:
                    return {
                        "success": False, 
                        "text": "", 
                        "page": page_num,
                        "error": f"OCR timeout on page {page_num}"
                    }
                finally:
                    signal.alarm(0)
                    
            except Exception as e:
                return {
                    "success": False, 
                    "text": "", 
                    "page": page_num,
                    "error": f"OCR failed on page {page_num}: {str(e)}"
                }
        
        # Process images in parallel with limited workers
        with ThreadPoolExecutor(max_workers=min(2, len(batch_images))) as executor:
            image_args = [(image, batch_start + i) for i, image in enumerate(batch_images)]
            future_to_page = {
                executor.submit(ocr_single_image, args): args[1] 
                for args in image_args
            }
            
            for future in as_completed(future_to_page):
                page_num = future_to_page[future]
                try:
                    result = future.result()
                    if result["success"]:
                        batch_text += result["text"] + "\n\n"
                    else:
                        errors.append({
                            "error_type": "ocr_error",
                            "error_message": result.get("error", "OCR failed"),
                            "page": result["page"],
                            "severity": "warning"
                        })
                except Exception as e:
                    errors.append({
                        "error_type": "ocr_error",
                        "error_message": f"Page {page_num} processing failed: {str(e)}",
                        "page": page_num,
                        "severity": "error"
                    })
        
        return {"text": batch_text, "errors": errors}
    
    async def _hybrid_extraction_fallback(
        self,
        pdf_data: bytes,
        field_mappings: List[Dict[str, Any]],
        job_id: Optional[str] = None,
        progress: Optional[ProcessingProgress] = None
    ) -> Dict[str, Any]:
        """Hybrid extraction strategy combining text and OCR for maximum data recovery"""
        try:
            logger.info("Starting hybrid extraction fallback", job_id=job_id)
            
            # Try text extraction on all pages first
            text_result = await self._extract_text_data(pdf_data, field_mappings, job_id)
            
            # If text extraction yielded some results, use it
            if text_result and len(text_result.get("events", [])) > 0:
                text_result["metadata"]["extraction_method"] = "hybrid_text_primary"
                return {
                    "success": True,
                    "rows_extracted": len(text_result["events"]),
                    "method": "hybrid_text",
                    "result": text_result
                }
            
            # Fall back to OCR for specific pages that might be scanned
            if self.ocr_enabled:
                ocr_result = await self._extract_ocr_data(pdf_data, field_mappings, job_id)
                if ocr_result and ocr_result.get("success"):
                    ocr_result["result"]["metadata"]["extraction_method"] = "hybrid_ocr_fallback"
                    return {
                        "success": True,
                        "rows_extracted": ocr_result["result"]["metadata"]["parsed_rows"],
                        "method": "hybrid_ocr",
                        "result": ocr_result["result"]
                    }
            
            # Final fallback - return empty but valid structure
            return {
                "success": False,
                "rows_extracted": 0,
                "method": "hybrid_failed",
                "result": {
                    "events": [],
                    "contacts": [],
                    "metadata": {
                        "total_rows": 0,
                        "parsed_rows": 0,
                        "error_rows": 0,
                        "duplicate_rows": 0,
                        "processing_time_ms": 0,
                        "extraction_method": "hybrid_failed"
                    },
                    "errors": [{"error_type": "extraction_error", "error_message": "All extraction methods failed", "severity": "critical"}],
                    "warnings": []
                }
            }
            
        except Exception as e:
            logger.error("Hybrid extraction failed", error=str(e))
            return {"success": False, "error": str(e)}
    
    @contextmanager
    def _memory_management(self):
        """Context manager for memory management during processing"""
        initial_memory = psutil.Process().memory_info().rss / 1024 / 1024
        try:
            yield
        finally:
            current_memory = psutil.Process().memory_info().rss / 1024 / 1024
            if current_memory > self.memory_threshold_mb:
                logger.warning(
                    "High memory usage detected",
                    initial_mb=initial_memory,
                    current_mb=current_memory,
                    threshold_mb=self.memory_threshold_mb
                )
                gc.collect()
    
    def _is_header_line(self, line: str) -> bool:
        """Check if a line appears to be a header/title rather than data"""
        header_indicators = [
            "call detail", "statement", "billing", "account", "summary",
            "usage", "details", "report", "period", "total", "charges"
        ]
        
        line_lower = line.lower()
        
        # Check for header indicators
        if any(indicator in line_lower for indicator in header_indicators):
            return True
        
        # Check if line has very few numbers (likely a header)
        numbers = re.findall(r'\d+', line)
        if len(numbers) < 2:
            return True
        
        return False
    
    def _parse_text_line(self, line: str, field_mappings: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Parse a single text line to extract structured data"""
        try:
            # Try different parsing strategies
            
            # Strategy 1: Delimited data
            for delimiter in [',', '|', '\t', ';']:
                if delimiter in line:
                    parts = line.split(delimiter)
                    if len(parts) >= 3:  # Must have at least 3 fields
                        data = {}
                        for i, part in enumerate(parts):
                            data[f"field_{i}"] = part.strip()
                        return data
            
            # Strategy 2: Pattern-based extraction
            patterns = {
                "phone": r'\b(?:\+?1[-.]?)?(?:\(?\d{3}\)?[-.]?)\d{3}[-.]?\d{4}\b',
                "date": r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
                "time": r'\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AaPp][Mm])?\b',
                "duration": r'\b\d{1,2}:\d{2}(?::\d{2})?\b',
                "amount": r'\$?\d+\.?\d*',
            }
            
            extracted = {}
            for field_type, pattern in patterns.items():
                matches = re.findall(pattern, line)
                if matches:
                    extracted[field_type] = matches[0]
            
            # Only return if we found meaningful data
            if len(extracted) >= 2:
                return extracted
            
            return None
            
        except Exception as e:
            logger.debug(f"Line parsing failed: {str(e)}")
            return None


# Global PDF parser instance
pdf_parser = PDFParser()