#!/usr/bin/env python3
"""
PDF Processing Service - Handles PDF text extraction and table detection
Supports multiple extraction methods with intelligent fallback
"""

import json
import sys
import os
import logging
import traceback
import tempfile
from typing import Dict, List, Tuple, Optional, Any
from io import BytesIO
import time

# PDF processing libraries
try:
    import PyPDF2
    import pdfplumber
    import pytesseract
    from PIL import Image
    import pdf2image
    import fitz  # PyMuPDF
except ImportError as e:
    print(f"Missing PDF dependencies: {e}", file=sys.stderr)
    sys.exit(1)

# Data processing
import pandas as pd
import numpy as np
import re

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PDFProcessor:
    """Handles PDF processing with multiple extraction strategies"""
    
    def __init__(self):
        self.tesseract_config = '--oem 3 --psm 6'  # OCR Engine Mode 3, Page Segmentation Mode 6
        self.supported_languages = ['eng', 'spa', 'fra']  # Extend as needed
    
    def extract_text(self, file_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """Extract text using multiple methods, return best result"""
        start_time = time.time()
        
        try:
            # Try different extraction methods
            methods = []
            
            # Method 1: pdfplumber (best for structured text)
            try:
                result = self._extract_with_pdfplumber(file_path, options)
                methods.append(('pdfplumber', result))
            except Exception as e:
                logger.warning(f"pdfplumber extraction failed: {e}")
            
            # Method 2: PyMuPDF (good for text and layout)
            try:
                result = self._extract_with_pymupdf(file_path, options)
                methods.append(('pymupdf', result))
            except Exception as e:
                logger.warning(f"PyMuPDF extraction failed: {e}")
            
            # Method 3: PyPDF2 (fallback for basic text)
            try:
                result = self._extract_with_pypdf2(file_path, options)
                methods.append(('pypdf2', result))
            except Exception as e:
                logger.warning(f"PyPDF2 extraction failed: {e}")
            
            if not methods:
                raise Exception("All text extraction methods failed")
            
            # Choose best method based on text length and quality
            best_method, best_result = self._choose_best_extraction(methods)
            
            processing_time = time.time() - start_time
            
            return {
                'success': True,
                'text': best_result['text'],
                'pageCount': best_result['page_count'],
                'method': best_method,
                'confidence': best_result['confidence'],
                'hasText': len(best_result['text'].strip()) > 50,
                'isScanned': best_result['confidence'] < 0.5,
                'quality': self._assess_text_quality(best_result['text']),
                'processingTime': processing_time
            }
            
        except Exception as e:
            logger.error(f"Text extraction failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'text': '',
                'pageCount': 0,
                'method': 'none',
                'confidence': 0.0
            }
    
    def extract_ocr(self, file_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """Extract text using OCR (Tesseract)"""
        start_time = time.time()
        
        try:
            language = options.get('language', 'eng')
            max_pages = options.get('maxPages', 50)  # Limit for OCR
            quality = options.get('quality', 'balanced')
            
            # Convert PDF to images
            try:
                if quality == 'high':
                    dpi = 300
                elif quality == 'fast':
                    dpi = 150
                else:  # balanced
                    dpi = 200
                
                images = pdf2image.convert_from_path(
                    file_path,
                    dpi=dpi,
                    first_page=1,
                    last_page=min(max_pages, 100),
                    fmt='JPEG'
                )
            except Exception as e:
                raise Exception(f"PDF to image conversion failed: {e}")
            
            # OCR each page
            all_text = []
            successful_pages = 0
            
            for i, image in enumerate(images):
                try:
                    # Apply some preprocessing if needed
                    if quality == 'high':
                        # Enhance image for better OCR
                        image = self._enhance_image_for_ocr(image)
                    
                    # Perform OCR
                    page_text = pytesseract.image_to_string(
                        image,
                        lang=language,
                        config=self.tesseract_config
                    )
                    
                    if page_text.strip():
                        all_text.append(page_text)
                        successful_pages += 1
                    
                except Exception as e:
                    logger.warning(f"OCR failed for page {i+1}: {e}")
                    continue
            
            combined_text = '\n\n--- PAGE BREAK ---\n\n'.join(all_text)
            confidence = successful_pages / len(images) if images else 0
            
            processing_time = time.time() - start_time
            
            return {
                'success': True,
                'text': combined_text,
                'pageCount': len(images),
                'method': 'ocr',
                'confidence': confidence,
                'hasText': False,  # OCR indicates no native text
                'isScanned': True,
                'quality': quality,
                'processingTime': processing_time,
                'ocrStats': {
                    'totalPages': len(images),
                    'successfulPages': successful_pages,
                    'language': language
                }
            }
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'text': '',
                'pageCount': 0,
                'confidence': 0.0
            }
    
    def extract_tables(self, file_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """Extract tables from PDF"""
        try:
            max_pages = options.get('maxPages', 20)
            tables = []
            
            # Use pdfplumber for table extraction
            with pdfplumber.open(file_path) as pdf:
                for page_num, page in enumerate(pdf.pages[:max_pages]):
                    try:
                        # Extract tables from page
                        page_tables = page.extract_tables()
                        
                        for table_idx, table in enumerate(page_tables):
                            if table and len(table) > 1:  # Must have header + at least 1 data row
                                # Clean table data
                                cleaned_table = self._clean_table_data(table)
                                confidence = self._assess_table_quality(cleaned_table)
                                
                                if confidence > 0.3:  # Only include reasonable quality tables
                                    tables.append({
                                        'page': page_num + 1,
                                        'data': cleaned_table,
                                        'confidence': confidence
                                    })
                    
                    except Exception as e:
                        logger.warning(f"Table extraction failed for page {page_num + 1}: {e}")
                        continue
            
            # Find best table
            best_table = None
            if tables:
                best_table = max(tables, key=lambda t: t['confidence'])
            
            return {
                'success': True,
                'tables': tables,
                'totalTables': len(tables),
                'bestTable': best_table
            }
            
        except Exception as e:
            logger.error(f"Table extraction failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'tables': []
            }
    
    # Private helper methods
    
    def _extract_with_pdfplumber(self, file_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """Extract text using pdfplumber"""
        with pdfplumber.open(file_path) as pdf:
            text_parts = []
            max_pages = min(options.get('maxPages', 100), len(pdf.pages))
            
            for page in pdf.pages[:max_pages]:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            
            combined_text = '\n\n'.join(text_parts)
            
            return {
                'text': combined_text,
                'page_count': len(pdf.pages),
                'confidence': 0.9 if combined_text.strip() else 0.1
            }
    
    def _extract_with_pymupdf(self, file_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """Extract text using PyMuPDF"""
        doc = fitz.open(file_path)
        text_parts = []
        max_pages = min(options.get('maxPages', 100), doc.page_count)
        
        for page_num in range(max_pages):
            page = doc[page_num]
            page_text = page.get_text()
            if page_text:
                text_parts.append(page_text)
        
        doc.close()
        combined_text = '\n\n'.join(text_parts)
        
        return {
            'text': combined_text,
            'page_count': doc.page_count,
            'confidence': 0.8 if combined_text.strip() else 0.1
        }
    
    def _extract_with_pypdf2(self, file_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """Extract text using PyPDF2"""
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text_parts = []
            max_pages = min(options.get('maxPages', 100), len(pdf_reader.pages))
            
            for page_num in range(max_pages):
                page = pdf_reader.pages[page_num]
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            
            combined_text = '\n\n'.join(text_parts)
            
            return {
                'text': combined_text,
                'page_count': len(pdf_reader.pages),
                'confidence': 0.7 if combined_text.strip() else 0.1
            }
    
    def _choose_best_extraction(self, methods: List[Tuple[str, Dict]]) -> Tuple[str, Dict]:
        """Choose the best extraction method based on quality metrics"""
        if not methods:
            raise Exception("No extraction methods succeeded")
        
        # Score each method
        scored_methods = []
        for method_name, result in methods:
            score = self._calculate_extraction_score(result)
            scored_methods.append((score, method_name, result))
        
        # Return highest scoring method
        scored_methods.sort(key=lambda x: x[0], reverse=True)
        _, best_method, best_result = scored_methods[0]
        
        return best_method, best_result
    
    def _calculate_extraction_score(self, result: Dict[str, Any]) -> float:
        """Calculate quality score for extraction result"""
        text = result.get('text', '')
        confidence = result.get('confidence', 0)
        
        # Base score from confidence
        score = confidence
        
        # Bonus for text length (more text usually better)
        text_length_bonus = min(len(text) / 10000.0, 0.3)  # Up to 0.3 bonus
        score += text_length_bonus
        
        # Bonus for structured content indicators
        if self._has_structured_content(text):
            score += 0.2
        
        # Penalty for too much whitespace (indicates poor extraction)
        whitespace_ratio = len(re.findall(r'\s', text)) / max(len(text), 1)
        if whitespace_ratio > 0.7:
            score -= 0.3
        
        return max(0, min(1, score))
    
    def _has_structured_content(self, text: str) -> bool:
        """Check if text has indicators of structured content"""
        indicators = [
            r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',  # Phone numbers
            r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',  # Dates
            r'\d+:\d{2}(?::\d{2})?',  # Times
            r'\b(?:incoming|outgoing|missed)\b',  # Call types
        ]
        
        matches = sum(1 for pattern in indicators if re.search(pattern, text, re.IGNORECASE))
        return matches >= 2
    
    def _assess_text_quality(self, text: str) -> str:
        """Assess the quality of extracted text"""
        if len(text) < 50:
            return 'poor'
        
        # Check for garbled text (too many special characters)
        special_char_ratio = len(re.findall(r'[^\w\s]', text)) / max(len(text), 1)
        if special_char_ratio > 0.3:
            return 'poor'
        
        # Check for structured content
        if self._has_structured_content(text):
            return 'good'
        
        return 'fair'
    
    def _enhance_image_for_ocr(self, image: Image.Image) -> Image.Image:
        """Apply image enhancements for better OCR results"""
        try:
            from PIL import ImageEnhance, ImageFilter
            
            # Convert to grayscale
            if image.mode != 'L':
                image = image.convert('L')
            
            # Enhance contrast
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(1.5)
            
            # Sharpen
            image = image.filter(ImageFilter.SHARPEN)
            
            return image
        except Exception as e:
            logger.warning(f"Image enhancement failed: {e}")
            return image
    
    def _clean_table_data(self, table: List[List[str]]) -> List[List[str]]:
        """Clean extracted table data"""
        cleaned = []
        
        for row in table:
            if not row:
                continue
                
            cleaned_row = []
            for cell in row:
                if cell is None:
                    cleaned_row.append('')
                else:
                    # Clean cell content
                    cleaned_cell = str(cell).strip()
                    # Remove excessive whitespace
                    cleaned_cell = re.sub(r'\s+', ' ', cleaned_cell)
                    cleaned_row.append(cleaned_cell)
            
            # Only include rows with some content
            if any(cell for cell in cleaned_row):
                cleaned.append(cleaned_row)
        
        return cleaned
    
    def _assess_table_quality(self, table: List[List[str]]) -> float:
        """Assess quality of extracted table"""
        if not table or len(table) < 2:
            return 0.0
        
        # Check for consistent column count
        column_counts = [len(row) for row in table]
        if len(set(column_counts)) > 2:  # Too much variation
            return 0.3
        
        # Check for data content
        data_cells = sum(1 for row in table for cell in row if cell.strip())
        total_cells = sum(len(row) for row in table)
        
        if total_cells == 0:
            return 0.0
        
        fill_ratio = data_cells / total_cells
        
        # Bonus for phone/date patterns
        content = ' '.join(cell for row in table for cell in row)
        structure_bonus = 0.2 if self._has_structured_content(content) else 0
        
        return min(1.0, fill_ratio + structure_bonus)

def main():
    """Main entry point"""
    if len(sys.argv) != 2:
        print("Usage: python PdfProcessor.py <json_request>", file=sys.stderr)
        sys.exit(1)
    
    try:
        request = json.loads(sys.argv[1])
        processor = PDFProcessor()
        
        action = request.get('action')
        file_path = request.get('filePath')
        options = request.get('options', {})
        
        if not action or not file_path:
            raise ValueError("Missing required fields: action, filePath")
        
        if not os.path.exists(file_path):
            raise ValueError(f"File not found: {file_path}")
        
        if action == 'extract_text':
            result = processor.extract_text(file_path, options)
        elif action == 'extract_ocr':
            result = processor.extract_ocr(file_path, options)
        elif action == 'extract_tables':
            result = processor.extract_tables(file_path, options)
        else:
            raise ValueError(f"Unknown action: {action}")
        
        print(json.dumps(result))
        
    except Exception as e:
        logger.error(f"PDF processor error: {e}")
        logger.error(traceback.format_exc())
        
        error_result = {
            'success': False,
            'error': str(e),
            'details': traceback.format_exc()
        }
        
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == '__main__':
    main()