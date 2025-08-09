#!/usr/bin/env python3
"""
Python ML Service for Layout Classification
Handles document feature extraction, layout classification, and field mapping
Designed to be called from TypeScript via subprocess or Redis workers
"""

import json
import sys
import os
import re
import logging
import traceback
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
import pandas as pd
import numpy as np
from io import StringIO, BytesIO
import tempfile

# ML and NLP libraries
try:
    import torch
    import transformers
    from transformers import pipeline, AutoTokenizer, AutoModel
    import sklearn
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, confusion_matrix
    import joblib
except ImportError as e:
    print(f"Missing ML dependencies: {e}", file=sys.stderr)
    sys.exit(1)

# PDF processing
try:
    import PyPDF2
    import pdfplumber
    import pytesseract
    from PIL import Image
    import pdf2image
except ImportError as e:
    print(f"Missing PDF processing dependencies: {e}", file=sys.stderr)

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CarrierType(Enum):
    ATT = "att"
    VERIZON = "verizon" 
    TMOBILE = "tmobile"
    SPRINT = "sprint"
    UNKNOWN = "unknown"

class FileFormat(Enum):
    PDF = "pdf"
    CSV = "csv"
    TXT = "txt"
    JSON = "json"
    XLSX = "xlsx"
    XLS = "xls"
    UNKNOWN = "unknown"

@dataclass
class ConfidenceScore:
    format: float
    carrier: float
    overall: float

@dataclass
class FieldMapping:
    source_field: str
    target_field: str
    confidence: float
    data_type: str

@dataclass
class DocumentFeatures:
    """Features extracted from document for ML classification"""
    # File-level features
    file_size: int
    line_count: int
    char_count: int
    
    # Structure features
    has_headers: bool
    column_count: int
    delimiter_type: Optional[str]
    header_row_position: int
    
    # Content features
    phone_number_count: int
    date_count: int
    time_count: int
    duration_patterns: int
    carrier_keywords: List[str]
    
    # Text features (for TF-IDF)
    text_content: str
    header_text: str
    sample_data_rows: List[str]

@dataclass
class ClassificationResult:
    format: FileFormat
    carrier: CarrierType
    confidence: ConfidenceScore
    field_mappings: List[FieldMapping]
    template_id: Optional[str]
    processing_time: float
    metadata: Dict[str, Any]

class DocumentFeatureExtractor:
    """Extract features from documents for ML classification"""
    
    def __init__(self):
        # Carrier-specific keywords for detection
        self.carrier_keywords = {
            CarrierType.ATT: ['at&t', 'att', 'wireless', 'mobility', 'sbc'],
            CarrierType.VERIZON: ['verizon', 'vzw', 'bell atlantic', 'airtouch'],
            CarrierType.TMOBILE: ['t-mobile', 'tmobile', 'deutsche telekom', 'voicestream'],
            CarrierType.SPRINT: ['sprint', 'nextel', 'clearwire']
        }
        
        # Common field patterns for phone records
        self.field_patterns = {
            'phone_number': [r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', r'\b\+?1?[-.]?\d{10}\b'],
            'date': [r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', r'\d{4}-\d{2}-\d{2}'],
            'time': [r'\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?'],
            'duration': [r'\d+:\d{2}(?::\d{2})?', r'\d+\s?(?:min|sec|hour)s?'],
            'call_type': [r'\b(?:incoming|outgoing|missed|voice|sms|text|data)\b', re.IGNORECASE]
        }
    
    def extract_features(self, content: str, filename: str) -> DocumentFeatures:
        """Extract features from document content"""
        try:
            lines = content.split('\n')
            line_count = len(lines)
            char_count = len(content)
            
            # Analyze structure
            headers_detected, header_position = self._detect_headers(lines)
            column_count = self._estimate_column_count(lines)
            delimiter = self._detect_delimiter(lines)
            
            # Extract content patterns
            phone_count = self._count_pattern_matches(content, 'phone_number')
            date_count = self._count_pattern_matches(content, 'date')
            time_count = self._count_pattern_matches(content, 'time')
            duration_count = self._count_pattern_matches(content, 'duration')
            
            # Detect carrier keywords
            carrier_keywords = self._detect_carrier_keywords(content.lower())
            
            # Get sample data for analysis
            sample_rows = lines[header_position+1:header_position+6] if header_position >= 0 else lines[:5]
            header_text = lines[header_position] if header_position >= 0 else ""
            
            return DocumentFeatures(
                file_size=char_count,
                line_count=line_count,
                char_count=char_count,
                has_headers=headers_detected,
                column_count=column_count,
                delimiter_type=delimiter,
                header_row_position=header_position,
                phone_number_count=phone_count,
                date_count=date_count,
                time_count=time_count,
                duration_patterns=duration_count,
                carrier_keywords=carrier_keywords,
                text_content=content,
                header_text=header_text,
                sample_data_rows=sample_rows
            )
            
        except Exception as e:
            logger.error(f"Feature extraction failed: {e}")
            # Return minimal features on error
            return DocumentFeatures(
                file_size=len(content),
                line_count=len(content.split('\n')),
                char_count=len(content),
                has_headers=False,
                column_count=1,
                delimiter_type=None,
                header_row_position=-1,
                phone_number_count=0,
                date_count=0,
                time_count=0,
                duration_patterns=0,
                carrier_keywords=[],
                text_content=content,
                header_text="",
                sample_data_rows=[]
            )
    
    def _detect_headers(self, lines: List[str]) -> Tuple[bool, int]:
        """Detect if document has headers and their position"""
        if not lines:
            return False, -1
            
        # Look for common header patterns in first 5 lines
        header_keywords = [
            'phone', 'number', 'date', 'time', 'duration', 'type', 'direction',
            'contact', 'name', 'caller', 'recipient', 'call', 'sms', 'text',
            'timestamp', 'start', 'end', 'from', 'to'
        ]
        
        for i, line in enumerate(lines[:5]):
            if not line.strip():
                continue
                
            # Check if line contains multiple header-like terms
            line_lower = line.lower()
            keyword_count = sum(1 for keyword in header_keywords if keyword in line_lower)
            
            # Must have at least 2 header keywords and reasonable column count
            if keyword_count >= 2 and len(line.split(',')) >= 3:
                return True, i
                
        return False, -1
    
    def _estimate_column_count(self, lines: List[str]) -> int:
        """Estimate number of columns in the document"""
        if not lines:
            return 1
            
        # Sample first few non-empty lines
        sample_lines = [line for line in lines[:10] if line.strip()]
        if not sample_lines:
            return 1
            
        # Try different delimiters
        delimiters = [',', '\t', '|', ';']
        max_columns = 1
        
        for delimiter in delimiters:
            column_counts = [len(line.split(delimiter)) for line in sample_lines]
            avg_columns = sum(column_counts) / len(column_counts)
            if avg_columns > max_columns:
                max_columns = int(avg_columns)
                
        return max(1, min(max_columns, 50))  # Cap at reasonable limit
    
    def _detect_delimiter(self, lines: List[str]) -> Optional[str]:
        """Detect the most likely delimiter"""
        if not lines:
            return None
            
        sample_lines = [line for line in lines[:10] if line.strip()]
        if not sample_lines:
            return None
            
        delimiters = [',', '\t', '|', ';']
        delimiter_scores = {}
        
        for delimiter in delimiters:
            # Count consistency of splits across lines
            split_counts = [len(line.split(delimiter)) for line in sample_lines]
            if len(set(split_counts)) <= 2 and max(split_counts) > 1:  # Consistent splits
                delimiter_scores[delimiter] = max(split_counts)
                
        if delimiter_scores:
            return max(delimiter_scores.items(), key=lambda x: x[1])[0]
            
        return None
    
    def _count_pattern_matches(self, text: str, pattern_name: str) -> int:
        """Count matches for a specific pattern type"""
        patterns = self.field_patterns.get(pattern_name, [])
        total_matches = 0
        
        for pattern in patterns:
            if isinstance(pattern, tuple) and len(pattern) == 2:
                pattern, flags = pattern
                matches = re.findall(pattern, text, flags)
            else:
                matches = re.findall(pattern, text)
            total_matches += len(matches)
            
        return total_matches
    
    def _detect_carrier_keywords(self, text: str) -> List[str]:
        """Detect carrier-specific keywords in text"""
        found_keywords = []
        
        for carrier, keywords in self.carrier_keywords.items():
            for keyword in keywords:
                if keyword in text:
                    found_keywords.append(f"{carrier.value}:{keyword}")
                    
        return found_keywords

class LayoutClassifier:
    """ML-based layout classifier using traditional ML and transformers"""
    
    def __init__(self):
        self.feature_extractor = DocumentFeatureExtractor()
        self.format_classifier = None
        self.carrier_classifier = None
        self.tfidf_vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.is_trained = False
        
        # Try to load pre-trained models
        self._load_models()
    
    def _load_models(self):
        """Load pre-trained models if available"""
        try:
            model_dir = os.path.join(os.path.dirname(__file__), 'models')
            if os.path.exists(model_dir):
                format_model_path = os.path.join(model_dir, 'format_classifier.joblib')
                carrier_model_path = os.path.join(model_dir, 'carrier_classifier.joblib')
                tfidf_path = os.path.join(model_dir, 'tfidf_vectorizer.joblib')
                
                if all(os.path.exists(p) for p in [format_model_path, carrier_model_path, tfidf_path]):
                    self.format_classifier = joblib.load(format_model_path)
                    self.carrier_classifier = joblib.load(carrier_model_path)
                    self.tfidf_vectorizer = joblib.load(tfidf_path)
                    self.is_trained = True
                    logger.info("Pre-trained models loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load pre-trained models: {e}")
    
    def classify_document(self, content: str, filename: str) -> ClassificationResult:
        """Classify document layout and extract field mappings"""
        start_time = pd.Timestamp.now()
        
        try:
            # Extract features
            features = self.feature_extractor.extract_features(content, filename)
            
            # Classify format and carrier
            if self.is_trained:
                format_pred, format_conf = self._predict_format(features)
                carrier_pred, carrier_conf = self._predict_carrier(features)
            else:
                # Fallback to rule-based classification
                format_pred, format_conf = self._rule_based_format_classification(features, filename)
                carrier_pred, carrier_conf = self._rule_based_carrier_classification(features)
            
            # Generate field mappings
            field_mappings = self._generate_field_mappings(features)
            
            # Calculate overall confidence
            overall_conf = (format_conf + carrier_conf) / 2.0
            
            # Processing time
            processing_time = (pd.Timestamp.now() - start_time).total_seconds()
            
            return ClassificationResult(
                format=format_pred,
                carrier=carrier_pred,
                confidence=ConfidenceScore(
                    format=format_conf,
                    carrier=carrier_conf,
                    overall=overall_conf
                ),
                field_mappings=field_mappings,
                template_id=f"{carrier_pred.value}_{format_pred.value}" if overall_conf > 0.7 else None,
                processing_time=processing_time,
                metadata={
                    'feature_count': len(asdict(features)),
                    'has_headers': features.has_headers,
                    'column_count': features.column_count,
                    'phone_patterns': features.phone_number_count
                }
            )
            
        except Exception as e:
            logger.error(f"Classification failed: {e}")
            logger.error(traceback.format_exc())
            
            # Return fallback result
            processing_time = (pd.Timestamp.now() - start_time).total_seconds()
            return ClassificationResult(
                format=FileFormat.UNKNOWN,
                carrier=CarrierType.UNKNOWN,
                confidence=ConfidenceScore(format=0.0, carrier=0.0, overall=0.0),
                field_mappings=[],
                template_id=None,
                processing_time=processing_time,
                metadata={'error': str(e)}
            )
    
    def _predict_format(self, features: DocumentFeatures) -> Tuple[FileFormat, float]:
        """Predict file format using ML model"""
        if not self.format_classifier:
            return self._rule_based_format_classification(features, "")
        
        # Create feature vector
        feature_vector = self._create_feature_vector(features)
        
        # Predict
        probabilities = self.format_classifier.predict_proba([feature_vector])[0]
        predicted_class = self.format_classifier.predict([feature_vector])[0]
        confidence = max(probabilities)
        
        # Map to enum
        try:
            format_enum = FileFormat(predicted_class)
        except ValueError:
            format_enum = FileFormat.UNKNOWN
            confidence = 0.0
            
        return format_enum, confidence
    
    def _predict_carrier(self, features: DocumentFeatures) -> Tuple[CarrierType, float]:
        """Predict carrier using ML model"""
        if not self.carrier_classifier:
            return self._rule_based_carrier_classification(features)
        
        # Create feature vector
        feature_vector = self._create_feature_vector(features)
        
        # Predict
        probabilities = self.carrier_classifier.predict_proba([feature_vector])[0]
        predicted_class = self.carrier_classifier.predict([feature_vector])[0]
        confidence = max(probabilities)
        
        # Map to enum
        try:
            carrier_enum = CarrierType(predicted_class)
        except ValueError:
            carrier_enum = CarrierType.UNKNOWN
            confidence = 0.0
            
        return carrier_enum, confidence
    
    def _create_feature_vector(self, features: DocumentFeatures) -> List[float]:
        """Create numerical feature vector for ML models"""
        # Basic features
        vector = [
            features.file_size,
            features.line_count,
            features.char_count,
            float(features.has_headers),
            features.column_count,
            features.phone_number_count,
            features.date_count,
            features.time_count,
            features.duration_patterns,
        ]
        
        # Delimiter type (one-hot encoded)
        delimiters = [',', '\t', '|', ';']
        for delimiter in delimiters:
            vector.append(float(features.delimiter_type == delimiter))
        
        # Carrier keywords (binary features)
        all_carriers = [c.value for c in CarrierType]
        for carrier in all_carriers:
            has_carrier = any(carrier in kw for kw in features.carrier_keywords)
            vector.append(float(has_carrier))
        
        # TF-IDF features (if available)
        if hasattr(self, 'tfidf_vectorizer') and features.text_content:
            try:
                tfidf_features = self.tfidf_vectorizer.transform([features.text_content]).toarray()[0]
                vector.extend(tfidf_features[:50])  # Take first 50 features
            except:
                vector.extend([0.0] * 50)  # Pad with zeros if TF-IDF fails
        else:
            vector.extend([0.0] * 50)
            
        return vector
    
    def _rule_based_format_classification(self, features: DocumentFeatures, filename: str) -> Tuple[FileFormat, float]:
        """Rule-based format classification as fallback"""
        filename_lower = filename.lower()
        
        # File extension-based classification
        if filename_lower.endswith('.pdf'):
            return FileFormat.PDF, 0.95
        elif filename_lower.endswith('.csv'):
            return FileFormat.CSV, 0.95
        elif filename_lower.endswith(('.xlsx', '.xls')):
            return FileFormat.XLSX if filename_lower.endswith('.xlsx') else FileFormat.XLS, 0.95
        elif filename_lower.endswith('.json'):
            return FileFormat.JSON, 0.95
        elif filename_lower.endswith('.txt'):
            return FileFormat.TXT, 0.85
        
        # Content-based classification
        if features.delimiter_type == ',':
            return FileFormat.CSV, 0.8
        elif features.has_headers and features.column_count > 3:
            return FileFormat.CSV, 0.7
        elif features.char_count > 1000 and features.line_count < 100:
            return FileFormat.TXT, 0.6
        
        return FileFormat.UNKNOWN, 0.0
    
    def _rule_based_carrier_classification(self, features: DocumentFeatures) -> Tuple[CarrierType, float]:
        """Rule-based carrier classification as fallback"""
        if not features.carrier_keywords:
            return CarrierType.UNKNOWN, 0.0
        
        # Count carrier mentions
        carrier_counts = {}
        for carrier in CarrierType:
            if carrier == CarrierType.UNKNOWN:
                continue
            carrier_counts[carrier] = sum(1 for kw in features.carrier_keywords if carrier.value in kw)
        
        if not any(carrier_counts.values()):
            return CarrierType.UNKNOWN, 0.0
        
        # Return carrier with most mentions
        best_carrier = max(carrier_counts.items(), key=lambda x: x[1])
        confidence = min(0.9, best_carrier[1] / 10.0 + 0.5)  # Scale confidence
        
        return best_carrier[0], confidence
    
    def _generate_field_mappings(self, features: DocumentFeatures) -> List[FieldMapping]:
        """Generate field mappings based on detected patterns"""
        mappings = []
        
        if not features.has_headers or not features.header_text:
            return mappings
        
        # Parse header fields
        delimiter = features.delimiter_type or ','
        header_fields = [field.strip().lower() for field in features.header_text.split(delimiter)]
        
        # Common field mapping rules
        field_map_rules = {
            'phone_number': ['phone', 'number', 'caller', 'recipient', 'from', 'to'],
            'contact_name': ['name', 'contact', 'person'],
            'event_type': ['type', 'direction', 'call_type'],
            'start_time': ['date', 'time', 'timestamp', 'start', 'begin'],
            'duration_seconds': ['duration', 'length', 'time'],
            'end_time': ['end', 'finish', 'stop']
        }
        
        for target_field, keywords in field_map_rules.items():
            best_match = None
            best_score = 0.0
            
            for i, header_field in enumerate(header_fields):
                # Calculate similarity score
                score = sum(1 for keyword in keywords if keyword in header_field)
                if score > best_score:
                    best_score = score
                    best_match = i
            
            if best_match is not None and best_score > 0:
                confidence = min(0.95, best_score / len(keywords) + 0.5)
                mappings.append(FieldMapping(
                    source_field=header_fields[best_match],
                    target_field=target_field,
                    confidence=confidence,
                    data_type=self._infer_data_type(target_field)
                ))
        
        return mappings
    
    def _infer_data_type(self, field_name: str) -> str:
        """Infer data type from field name"""
        if 'time' in field_name or 'date' in field_name:
            return 'date'
        elif 'duration' in field_name or 'count' in field_name:
            return 'number'
        elif 'phone' in field_name:
            return 'string'
        else:
            return 'string'

def main():
    """Main entry point for command-line usage"""
    if len(sys.argv) != 2:
        print("Usage: python PythonMLService.py <json_request>", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Parse request
        request_json = sys.argv[1]
        request = json.loads(request_json)
        
        # Validate required fields
        required_fields = ['jobId', 'filename', 'fileContent']
        for field in required_fields:
            if field not in request:
                raise ValueError(f"Missing required field: {field}")
        
        # Initialize classifier
        classifier = LayoutClassifier()
        
        # Classify document
        result = classifier.classify_document(
            content=request['fileContent'],
            filename=request['filename']
        )
        
        # Convert result to JSON
        result_dict = {
            'success': True,
            'result': {
                'format': result.format.value,
                'carrier': result.carrier.value,
                'confidence': asdict(result.confidence),
                'fieldMappings': {mapping.source_field: mapping.target_field for mapping in result.field_mappings},
                'templateId': result.template_id,
                'processingTime': result.processing_time,
                'metadata': result.metadata
            },
            'metrics': {
                'processingTime': result.processing_time,
                'memoryUsage': 0,  # Would need psutil for actual memory tracking
                'cpuUsage': 0
            }
        }
        
        # Output result
        print(json.dumps(result_dict))
        
    except Exception as e:
        logger.error(f"ML service error: {e}")
        logger.error(traceback.format_exc())
        
        error_result = {
            'success': False,
            'error': {
                'code': 'CLASSIFICATION_ERROR',
                'message': str(e),
                'details': traceback.format_exc()
            },
            'metrics': {
                'processingTime': 0,
                'memoryUsage': 0
            }
        }
        
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == '__main__':
    main()