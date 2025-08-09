"""
Advanced template management system for carrier file formats

This module manages:
- Dynamic template discovery and learning
- Template versioning and validation
- Field mapping intelligence
- Template confidence scoring
- Fallback manual mapping workflows
"""

import json
import hashlib
from typing import Dict, List, Optional, Any, Tuple, Union
from pathlib import Path
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
import structlog
import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


@dataclass
class TemplateField:
    """Represents a field in a carrier template"""
    source_name: str
    target_field: str
    data_type: str
    is_required: bool
    confidence: float
    validation_pattern: Optional[str] = None
    sample_values: List[str] = None
    
    def __post_init__(self):
        if self.sample_values is None:
            self.sample_values = []


@dataclass
class CarrierTemplate:
    """Represents a complete carrier template"""
    template_id: str
    carrier: str
    format_type: str
    version: str
    confidence: float
    fields: List[TemplateField]
    table_structure: Dict[str, Any]
    validation_rules: List[Dict[str, Any]]
    sample_headers: List[str]
    created_at: str
    last_updated: str
    usage_count: int = 0
    accuracy_score: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert template to dictionary for storage"""
        return {
            **asdict(self),
            'fields': [asdict(field) for field in self.fields]
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CarrierTemplate':
        """Create template from dictionary"""
        fields = [TemplateField(**field) for field in data.get('fields', [])]
        return cls(
            template_id=data['template_id'],
            carrier=data['carrier'],
            format_type=data['format_type'],
            version=data['version'],
            confidence=data['confidence'],
            fields=fields,
            table_structure=data['table_structure'],
            validation_rules=data['validation_rules'],
            sample_headers=data['sample_headers'],
            created_at=data['created_at'],
            last_updated=data['last_updated'],
            usage_count=data.get('usage_count', 0),
            accuracy_score=data.get('accuracy_score', 0.0)
        )


class TemplateManager:
    """Manages carrier templates with intelligent learning capabilities"""
    
    def __init__(self):
        self.templates: Dict[str, CarrierTemplate] = {}
        self.template_cache_path = Path(settings.model_cache_dir) / "carrier_templates.json"
        self.field_similarity_threshold = 0.75
        self.clustering_eps = 0.3
        self.min_samples = 2
        self._load_templates()
    
    def _load_templates(self):
        """Load existing templates from cache and database"""
        try:
            # Load from file cache first
            if self.template_cache_path.exists():
                with open(self.template_cache_path, 'r') as f:
                    template_data = json.load(f)
                    
                for template_dict in template_data:
                    template = CarrierTemplate.from_dict(template_dict)
                    self.templates[template.template_id] = template
                    
                logger.info(f"Loaded {len(self.templates)} templates from cache")
            
        except Exception as e:
            logger.error("Failed to load templates from cache", error=str(e))
    
    def _save_templates(self):
        """Save templates to cache file"""
        try:
            template_data = [template.to_dict() for template in self.templates.values()]
            
            with open(self.template_cache_path, 'w') as f:
                json.dump(template_data, f, indent=2, default=str)
                
            logger.info(f"Saved {len(self.templates)} templates to cache")
            
        except Exception as e:
            logger.error("Failed to save templates to cache", error=str(e))
    
    async def discover_template(
        self,
        file_content: str,
        detected_carrier: str,
        detected_format: str,
        job_id: Optional[str] = None
    ) -> Optional[CarrierTemplate]:
        """
        Discover and create a new template from file content
        
        Args:
            file_content: Raw file content for analysis
            detected_carrier: ML-detected carrier type
            detected_format: ML-detected file format
            job_id: Optional job ID for tracking
            
        Returns:
            Newly discovered template or None if discovery fails
        """
        try:
            logger.info(
                "Starting template discovery",
                carrier=detected_carrier,
                format=detected_format,
                job_id=job_id
            )
            
            # Extract structural information
            structure_info = self._analyze_file_structure(file_content, detected_format)
            if not structure_info:
                return None
            
            # Extract field candidates
            field_candidates = self._extract_field_candidates(file_content, structure_info)
            if not field_candidates:
                return None
            
            # Generate field mappings using ML and heuristics
            template_fields = await self._generate_template_fields(
                field_candidates, 
                detected_carrier,
                file_content
            )
            
            # Create template ID
            template_id = self._generate_template_id(
                detected_carrier,
                detected_format,
                field_candidates
            )
            
            # Calculate template confidence
            template_confidence = self._calculate_template_confidence(
                template_fields,
                structure_info,
                detected_carrier
            )
            
            # Create new template
            new_template = CarrierTemplate(
                template_id=template_id,
                carrier=detected_carrier,
                format_type=detected_format,
                version="1.0",
                confidence=template_confidence,
                fields=template_fields,
                table_structure=structure_info,
                validation_rules=self._generate_validation_rules(template_fields),
                sample_headers=field_candidates,
                created_at=datetime.now(timezone.utc).isoformat(),
                last_updated=datetime.now(timezone.utc).isoformat(),
                usage_count=1
            )
            
            # Store template
            self.templates[template_id] = new_template
            self._save_templates()
            
            # Save to database
            await self._save_template_to_db(new_template, job_id)
            
            logger.info(
                "Template discovery completed",
                template_id=template_id,
                confidence=template_confidence,
                field_count=len(template_fields),
                job_id=job_id
            )
            
            return new_template
            
        except Exception as e:
            logger.error(
                "Template discovery failed",
                error=str(e),
                carrier=detected_carrier,
                job_id=job_id
            )
            return None
    
    def find_matching_template(
        self,
        field_candidates: List[str],
        carrier: str,
        format_type: str,
        confidence_threshold: float = 0.7
    ) -> Optional[CarrierTemplate]:
        """
        Find existing template that matches the given criteria
        
        Args:
            field_candidates: Detected field names
            carrier: Carrier type
            format_type: File format
            confidence_threshold: Minimum confidence required
            
        Returns:
            Best matching template or None
        """
        try:
            matching_templates = []
            
            for template in self.templates.values():
                if template.carrier != carrier or template.format_type != format_type:
                    continue
                
                # Calculate field similarity
                template_fields = [field.source_name for field in template.fields]
                similarity = self._calculate_field_similarity(field_candidates, template_fields)
                
                if similarity >= confidence_threshold:
                    matching_templates.append((template, similarity))
            
            if matching_templates:
                # Return template with highest similarity
                best_template, best_similarity = max(matching_templates, key=lambda x: x[1])
                
                # Update usage statistics
                best_template.usage_count += 1
                best_template.last_updated = datetime.now(timezone.utc).isoformat()
                self._save_templates()
                
                logger.info(
                    "Found matching template",
                    template_id=best_template.template_id,
                    similarity=best_similarity,
                    usage_count=best_template.usage_count
                )
                
                return best_template
            
            return None
            
        except Exception as e:
            logger.error("Failed to find matching template", error=str(e))
            return None
    
    def _analyze_file_structure(self, content: str, format_type: str) -> Optional[Dict[str, Any]]:
        """Analyze file structure to detect table layout"""
        try:
            lines = content.split('\n')
            structure = {
                "format_type": format_type,
                "line_count": len(lines),
                "encoding": "utf-8",  # Assume UTF-8
                "has_header": False,
                "header_row": None,
                "data_start_row": 0,
                "delimiter": None,
                "columns": []
            }
            
            if format_type == "csv":
                # Detect CSV structure
                delimiter = self._detect_csv_delimiter(lines[:5])
                if delimiter:
                    structure["delimiter"] = delimiter
                    structure["has_header"] = True
                    structure["header_row"] = 0
                    structure["data_start_row"] = 1
                    
                    # Analyze columns
                    if lines:
                        headers = lines[0].split(delimiter)
                        structure["columns"] = [
                            {
                                "index": i,
                                "name": header.strip(' "\''),
                                "data_type": "string",
                                "sample_values": []
                            }
                            for i, header in enumerate(headers)
                        ]
            
            elif format_type == "txt":
                # Detect text CDR structure
                if '|' in content:
                    structure["delimiter"] = '|'
                elif ',' in content and not format_type == "csv":
                    structure["delimiter"] = ','
                else:
                    # Fixed-width or key-value format
                    structure["format_subtype"] = "fixed_width"
            
            elif format_type == "json":
                # JSON structure analysis would go here
                structure["format_subtype"] = "json"
            
            return structure
            
        except Exception as e:
            logger.error("Failed to analyze file structure", error=str(e))
            return None
    
    def _detect_csv_delimiter(self, sample_lines: List[str]) -> Optional[str]:
        """Detect CSV delimiter from sample lines"""
        delimiters = [',', '|', '\t', ';']
        delimiter_scores = {}
        
        for delimiter in delimiters:
            score = 0
            field_counts = []
            
            for line in sample_lines:
                if line.strip():
                    field_count = len(line.split(delimiter))
                    field_counts.append(field_count)
                    
                    if field_count > 1:
                        score += 1
            
            # Consistent field count across lines is good
            if field_counts:
                consistency = 1.0 - (np.std(field_counts) / np.mean(field_counts) if np.mean(field_counts) > 0 else 1.0)
                delimiter_scores[delimiter] = score * consistency
        
        if delimiter_scores:
            best_delimiter = max(delimiter_scores, key=delimiter_scores.get)
            if delimiter_scores[best_delimiter] > 0.5:
                return best_delimiter
        
        return None
    
    def _extract_field_candidates(
        self,
        content: str,
        structure_info: Dict[str, Any]
    ) -> List[str]:
        """Extract potential field names from file content"""
        candidates = []
        
        try:
            lines = content.split('\n')
            
            if structure_info.get("has_header") and structure_info.get("delimiter"):
                # Extract from header row
                delimiter = structure_info["delimiter"]
                header_row = structure_info.get("header_row", 0)
                
                if header_row < len(lines):
                    headers = lines[header_row].split(delimiter)
                    candidates = [
                        header.strip(' "\'()[]{}')
                        for header in headers
                        if header.strip() and len(header.strip()) > 1
                    ]
            
            else:
                # Try to extract from first few lines
                for line in lines[:5]:
                    if '=' in line:
                        # Key-value format
                        parts = line.split('=')
                        if len(parts) >= 2:
                            key = parts[0].strip().split()[-1]  # Get last word before =
                            if len(key) > 1 and len(key) < 50:
                                candidates.append(key)
                    
                    elif ':' in line and '|' in line:
                        # Structured text format
                        parts = line.split('|')
                        for part in parts:
                            if ':' in part:
                                key = part.split(':')[0].strip()
                                if len(key) > 1 and len(key) < 50:
                                    candidates.append(key)
            
            # Clean and deduplicate
            candidates = list(set([
                candidate.lower().replace('-', '_').replace(' ', '_')
                for candidate in candidates
                if candidate and len(candidate.strip()) > 1
            ]))
            
            return candidates
            
        except Exception as e:
            logger.error("Failed to extract field candidates", error=str(e))
            return []
    
    async def _generate_template_fields(
        self,
        field_candidates: List[str],
        carrier: str,
        content: str
    ) -> List[TemplateField]:
        """Generate template fields with ML-powered mapping"""
        template_fields = []
        
        try:
            # Load field mapping model from layout classifier
            from .layout_classifier import layout_classifier
            field_mapper = layout_classifier.models.get("field_mapper")
            
            for candidate in field_candidates:
                # Use ML model to predict target field
                if field_mapper:
                    try:
                        predictions = field_mapper.predict_proba([candidate.lower()])
                        if len(predictions) > 0:
                            class_probabilities = predictions[0]
                            predicted_class = field_mapper.predict([candidate.lower()])[0]
                            confidence = float(np.max(class_probabilities))
                        else:
                            predicted_class = "unknown"
                            confidence = 0.1
                    except:
                        predicted_class = "unknown"
                        confidence = 0.1
                else:
                    # Fallback to rule-based mapping
                    predicted_class, confidence = self._rule_based_field_mapping(candidate)
                
                # Infer data type
                data_type = self._infer_data_type_from_content(candidate, content)
                
                # Determine if field is required
                is_required = predicted_class in ["ts", "number", "type", "direction"]
                
                # Generate validation pattern
                validation_pattern = self._generate_validation_pattern(predicted_class, data_type)
                
                # Extract sample values
                sample_values = self._extract_sample_values(candidate, content)
                
                template_field = TemplateField(
                    source_name=candidate,
                    target_field=predicted_class,
                    data_type=data_type,
                    is_required=is_required,
                    confidence=confidence,
                    validation_pattern=validation_pattern,
                    sample_values=sample_values
                )
                
                template_fields.append(template_field)
            
            return template_fields
            
        except Exception as e:
            logger.error("Failed to generate template fields", error=str(e))
            return []
    
    def _rule_based_field_mapping(self, field_name: str) -> Tuple[str, float]:
        """Fallback rule-based field mapping"""
        field_lower = field_name.lower()
        
        # Date/time patterns
        if any(keyword in field_lower for keyword in ['date', 'time', 'timestamp', 'ts']):
            return "ts", 0.8
        
        # Phone number patterns  
        if any(keyword in field_lower for keyword in ['phone', 'number', 'caller', 'callee', 'ani', 'dnis']):
            return "number", 0.8
        
        # Duration patterns
        if any(keyword in field_lower for keyword in ['duration', 'minutes', 'seconds', 'length']):
            return "duration", 0.8
        
        # Type patterns
        if any(keyword in field_lower for keyword in ['type', 'category', 'service']):
            return "type", 0.7
        
        # Direction patterns
        if any(keyword in field_lower for keyword in ['direction', 'in', 'out', 'inbound', 'outbound']):
            return "direction", 0.8
        
        # Content patterns
        if any(keyword in field_lower for keyword in ['message', 'text', 'content', 'description']):
            return "content", 0.7
        
        # Cost patterns
        if any(keyword in field_lower for keyword in ['cost', 'charge', 'amount', 'price', 'fee']):
            return "cost", 0.8
        
        # Location patterns
        if any(keyword in field_lower for keyword in ['location', 'city', 'state', 'area', 'region']):
            return "location", 0.7
        
        return "unknown", 0.1
    
    def _infer_data_type_from_content(self, field_name: str, content: str) -> str:
        """Infer data type by analyzing sample values in content"""
        try:
            # Extract sample values for this field
            samples = self._extract_sample_values(field_name, content)
            
            if not samples:
                return "string"
            
            # Check if numeric
            numeric_count = sum(1 for sample in samples if self._is_numeric(sample))
            if numeric_count > len(samples) * 0.8:
                return "number"
            
            # Check if date/time
            date_count = sum(1 for sample in samples if self._is_date_like(sample))
            if date_count > len(samples) * 0.6:
                return "date"
            
            # Check if boolean
            boolean_count = sum(1 for sample in samples if sample.lower() in ['true', 'false', '1', '0', 'yes', 'no'])
            if boolean_count > len(samples) * 0.8:
                return "boolean"
            
            return "string"
            
        except:
            return "string"
    
    def _is_numeric(self, value: str) -> bool:
        """Check if value is numeric"""
        try:
            float(value.replace(',', ''))
            return True
        except:
            return False
    
    def _is_date_like(self, value: str) -> bool:
        """Check if value looks like a date"""
        import re
        date_patterns = [
            r'\d{4}-\d{2}-\d{2}',
            r'\d{2}/\d{2}/\d{4}',
            r'\d{1,2}-\d{1,2}-\d{4}',
            r'\d{1,2}/\d{1,2}/\d{2}',
            r'\d{1,2}:\d{2}(:\d{2})?',
        ]
        
        return any(re.match(pattern, value.strip()) for pattern in date_patterns)
    
    def _generate_validation_pattern(self, target_field: str, data_type: str) -> Optional[str]:
        """Generate regex validation pattern for field"""
        patterns = {
            "ts": {
                "date": r'^\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}$',
                "string": r'^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?)?$'
            },
            "number": {
                "string": r'^[\+]?[\d\s\-\(\)\.]+$'
            },
            "duration": {
                "number": r'^\d+(\.\d+)?$',
                "string": r'^\d{1,2}:\d{2}(:\d{2})?|\d+$'
            },
            "cost": {
                "number": r'^\d+(\.\d{2})?$',
                "string": r'^\$?\d+(\.\d{2})?$'
            }
        }
        
        return patterns.get(target_field, {}).get(data_type)
    
    def _extract_sample_values(self, field_name: str, content: str) -> List[str]:
        """Extract sample values for a specific field"""
        samples = []
        
        try:
            lines = content.split('\n')[:20]  # Sample first 20 lines
            
            for line in lines[1:]:  # Skip header
                if not line.strip():
                    continue
                
                # Try different parsing approaches
                if ',' in line:
                    parts = line.split(',')
                elif '|' in line:
                    parts = line.split('|')
                elif '\t' in line:
                    parts = line.split('\t')
                else:
                    continue
                
                # Try to find the field and extract its value
                for i, part in enumerate(parts):
                    clean_part = part.strip(' "\'')
                    if clean_part and len(clean_part) < 100:
                        samples.append(clean_part)
                        
                        if len(samples) >= 5:  # Limit sample size
                            break
                
                if len(samples) >= 5:
                    break
            
            return samples[:5]
            
        except:
            return []
    
    def _calculate_field_similarity(self, fields1: List[str], fields2: List[str]) -> float:
        """Calculate similarity between two field lists"""
        if not fields1 or not fields2:
            return 0.0
        
        # Use TF-IDF to calculate similarity
        vectorizer = TfidfVectorizer(analyzer='char', ngram_range=(2, 4))
        
        try:
            all_fields = fields1 + fields2
            tfidf_matrix = vectorizer.fit_transform(all_fields)
            
            # Calculate cosine similarity between the two sets
            set1_vectors = tfidf_matrix[:len(fields1)]
            set2_vectors = tfidf_matrix[len(fields1):]
            
            similarity_matrix = cosine_similarity(set1_vectors, set2_vectors)
            
            # Return average maximum similarity for each field
            max_similarities = []
            for i in range(len(fields1)):
                max_sim = np.max(similarity_matrix[i])
                max_similarities.append(max_sim)
            
            return float(np.mean(max_similarities))
            
        except:
            # Fallback to simple string matching
            matches = 0
            for field1 in fields1:
                for field2 in fields2:
                    if field1.lower() == field2.lower():
                        matches += 1
                        break
            
            return matches / max(len(fields1), len(fields2))
    
    def _generate_template_id(
        self,
        carrier: str,
        format_type: str,
        field_candidates: List[str]
    ) -> str:
        """Generate unique template ID"""
        # Create hash from carrier, format, and field names
        content = f"{carrier}_{format_type}_{'_'.join(sorted(field_candidates))}"
        hash_object = hashlib.md5(content.encode())
        return f"{carrier}_{format_type}_{hash_object.hexdigest()[:8]}"
    
    def _calculate_template_confidence(
        self,
        fields: List[TemplateField],
        structure_info: Dict[str, Any],
        carrier: str
    ) -> float:
        """Calculate overall template confidence score"""
        if not fields:
            return 0.0
        
        # Field mapping confidence (40%)
        field_confidences = [field.confidence for field in fields]
        avg_field_confidence = np.mean(field_confidences)
        
        # Required field coverage (30%)
        required_fields = ["ts", "number", "type"]
        found_required = sum(1 for field in fields if field.target_field in required_fields)
        required_coverage = found_required / len(required_fields)
        
        # Structure clarity (20%)
        structure_score = 0.8 if structure_info.get("delimiter") else 0.4
        
        # Carrier match confidence (10%)
        carrier_score = 0.9 if carrier != "unknown" else 0.3
        
        # Calculate weighted average
        total_confidence = (
            avg_field_confidence * 0.4 +
            required_coverage * 0.3 +
            structure_score * 0.2 +
            carrier_score * 0.1
        )
        
        return min(total_confidence, 1.0)  # Cap at 1.0
    
    def _generate_validation_rules(self, fields: List[TemplateField]) -> List[Dict[str, Any]]:
        """Generate validation rules for template fields"""
        rules = []
        
        for field in fields:
            rule = {
                "field": field.source_name,
                "target": field.target_field,
                "required": field.is_required,
                "data_type": field.data_type
            }
            
            if field.validation_pattern:
                rule["pattern"] = field.validation_pattern
            
            if field.target_field == "number":
                rule["min_length"] = 10
                rule["max_length"] = 15
            elif field.target_field == "duration":
                rule["min_value"] = 0
                rule["max_value"] = 86400  # 24 hours in seconds
            
            rules.append(rule)
        
        return rules
    
    async def _save_template_to_db(self, template: CarrierTemplate, job_id: Optional[str]):
        """Save template to database for persistence"""
        try:
            await db_manager.update_job_status(
                job_id=job_id,
                status="processing",
                metadata={
                    "template_discovered": True,
                    "template_id": template.template_id,
                    "template_confidence": template.confidence,
                    "field_count": len(template.fields)
                }
            )
            
        except Exception as e:
            logger.error("Failed to save template to database", error=str(e))
    
    async def update_template_accuracy(
        self,
        template_id: str,
        parsing_success_rate: float,
        validation_errors: int,
        total_records: int
    ):
        """Update template accuracy based on parsing results"""
        try:
            if template_id not in self.templates:
                return
            
            template = self.templates[template_id]
            
            # Calculate accuracy score
            error_rate = validation_errors / max(total_records, 1)
            accuracy = parsing_success_rate * (1.0 - error_rate)
            
            # Update template
            template.accuracy_score = accuracy
            template.usage_count += 1
            template.last_updated = datetime.now(timezone.utc).isoformat()
            
            # Adjust confidence based on accuracy
            if accuracy > 0.9:
                template.confidence = min(template.confidence * 1.1, 1.0)
            elif accuracy < 0.7:
                template.confidence = max(template.confidence * 0.9, 0.1)
            
            self._save_templates()
            
            logger.info(
                "Template accuracy updated",
                template_id=template_id,
                accuracy=accuracy,
                new_confidence=template.confidence
            )
            
        except Exception as e:
            logger.error("Failed to update template accuracy", error=str(e))
    
    def get_manual_mapping_suggestions(
        self,
        field_candidates: List[str],
        carrier: str = "unknown"
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get suggestions for manual field mapping"""
        suggestions = {}
        
        standard_fields = {
            "ts": "Timestamp/Date",
            "number": "Phone Number",
            "duration": "Call Duration", 
            "type": "Call/SMS Type",
            "direction": "Call Direction",
            "content": "Message Content",
            "cost": "Cost/Charges",
            "location": "Location/Area"
        }
        
        for candidate in field_candidates:
            field_suggestions = []
            
            # Get ML predictions if available
            from .layout_classifier import layout_classifier
            field_mapper = layout_classifier.models.get("field_mapper")
            
            if field_mapper:
                try:
                    probabilities = field_mapper.predict_proba([candidate.lower()])[0]
                    classes = field_mapper.classes_
                    
                    # Get top 3 predictions
                    top_indices = np.argsort(probabilities)[-3:][::-1]
                    
                    for idx in top_indices:
                        if probabilities[idx] > 0.1:  # Only show reasonable suggestions
                            field_suggestions.append({
                                "target_field": classes[idx],
                                "display_name": standard_fields.get(classes[idx], classes[idx]),
                                "confidence": float(probabilities[idx]),
                                "source": "ml_model"
                            })
                except:
                    pass
            
            # Add rule-based suggestions
            rule_prediction, rule_confidence = self._rule_based_field_mapping(candidate)
            if rule_prediction != "unknown":
                field_suggestions.append({
                    "target_field": rule_prediction,
                    "display_name": standard_fields.get(rule_prediction, rule_prediction),
                    "confidence": rule_confidence,
                    "source": "rule_based"
                })
            
            # Sort by confidence
            field_suggestions.sort(key=lambda x: x["confidence"], reverse=True)
            suggestions[candidate] = field_suggestions[:3]  # Top 3 suggestions
        
        return suggestions


# Global template manager instance
template_manager = TemplateManager()