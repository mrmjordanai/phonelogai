"""
Phase 1: Field Mapping System

This module provides comprehensive field mapping capabilities:
- ML-powered layout detection and classification
- Template-based mapping with carrier-specific patterns  
- Manual mapping wizard with smart suggestions
- Confidence scoring and validation
- Learning from user feedback
"""
import asyncio
import hashlib
import pickle
from typing import Dict, List, Tuple, Optional, Any, Union
from datetime import datetime, timezone
from pathlib import Path
import structlog
import numpy as np
import pandas as pd
from dataclasses import dataclass, asdict
from collections import Counter, defaultdict

from ..ml.layout_classifier import layout_classifier
from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


@dataclass
class MappingSuggestion:
    """Represents a field mapping suggestion"""
    source_field: str
    target_field: str
    data_type: str
    confidence: float
    reason: str
    is_required: bool = False
    validation_rules: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.validation_rules is None:
            self.validation_rules = {}


@dataclass
class MappingTemplate:
    """Template for field mappings"""
    name: str
    carrier: str
    format_type: str
    mappings: List[MappingSuggestion]
    metadata: Dict[str, Any]
    created_at: datetime
    usage_count: int = 0
    success_rate: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return {
            **asdict(self),
            'mappings': [asdict(m) for m in self.mappings],
            'created_at': self.created_at.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'MappingTemplate':
        """Create from dictionary"""
        mappings = [MappingSuggestion(**m) for m in data.pop('mappings', [])]
        created_at = datetime.fromisoformat(data.pop('created_at'))
        return cls(mappings=mappings, created_at=created_at, **data)


class ConfidenceScorer:
    """Advanced confidence scoring for field mappings"""
    
    def __init__(self):
        self.weights = {
            'ml_confidence': 0.30,      # ML model confidence
            'pattern_match': 0.25,      # Pattern matching score
            'semantic_similarity': 0.20, # Semantic similarity
            'carrier_template': 0.15,   # Carrier template match
            'user_feedback': 0.10       # Historical user feedback
        }
    
    def calculate_mapping_confidence(
        self,
        mapping: MappingSuggestion,
        context: Dict[str, Any]
    ) -> float:
        """Calculate comprehensive confidence score for a mapping"""
        scores = {}
        
        # ML model confidence (if available)
        scores['ml_confidence'] = context.get('ml_confidence', 0.5)
        
        # Pattern matching score
        scores['pattern_match'] = self._calculate_pattern_match_score(
            mapping.source_field, 
            mapping.target_field,
            context.get('sample_values', [])
        )
        
        # Semantic similarity
        scores['semantic_similarity'] = self._calculate_semantic_similarity(
            mapping.source_field,
            mapping.target_field
        )
        
        # Carrier template match
        scores['carrier_template'] = self._calculate_carrier_template_score(
            mapping,
            context.get('carrier', 'unknown')
        )
        
        # User feedback score
        scores['user_feedback'] = self._get_user_feedback_score(
            mapping.source_field,
            mapping.target_field
        )
        
        # Calculate weighted confidence
        weighted_confidence = sum(
            scores[metric] * self.weights[metric]
            for metric in scores
        )
        
        # Apply confidence penalties for edge cases
        penalties = self._calculate_confidence_penalties(mapping, context)
        final_confidence = max(0.0, min(1.0, weighted_confidence - penalties))
        
        # Store detailed scoring for debugging
        mapping.validation_rules['confidence_breakdown'] = {
            'scores': scores,
            'weights': self.weights,
            'penalties': penalties,
            'final_confidence': final_confidence
        }
        
        return final_confidence
    
    def _calculate_pattern_match_score(
        self,
        source_field: str,
        target_field: str, 
        sample_values: List[str]
    ) -> float:
        """Calculate pattern matching score based on field content"""
        if not sample_values:
            return 0.5
        
        # Define patterns for each target field type
        field_patterns = {
            'ts': [
                r'\d{4}[-/]\d{2}[-/]\d{2}',      # YYYY-MM-DD
                r'\d{2}[-/]\d{2}[-/]\d{4}',      # MM/DD/YYYY
                r'\d{1,2}:\d{2}(:\d{2})?',       # HH:MM(:SS)
                r'\d{10,13}',                     # Unix timestamp
                r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)',  # Month names
            ],
            'number': [
                r'\+?1?\d{10}',                   # Phone numbers
                r'\(\d{3}\)\s?\d{3}-\d{4}',      # (xxx) xxx-xxxx
                r'\d{3}[-\.]\d{3}[-\.]\d{4}',    # xxx-xxx-xxxx
            ],
            'duration': [
                r'\d+:\d{2}(:\d{2})?',           # HH:MM:SS or MM:SS
                r'\d+(\.\d+)?\s*(min|sec|hr|hours?|minutes?|seconds?)', # Duration with units
                r'^\d+$',                        # Pure numbers (seconds)
            ],
            'type': [
                r'(call|sms|text|voice|data|video)',  # Communication types
                r'(incoming|outgoing|inbound|outbound)', # But this should be direction
            ],
            'direction': [
                r'(in|out|incoming|outgoing|inbound|outbound|received|sent)',
                r'[io]',                         # Single letter indicators
            ]
        }
        
        if target_field not in field_patterns:
            return 0.5
        
        patterns = field_patterns[target_field]
        total_matches = 0
        total_samples = len(sample_values)
        
        import re
        for pattern in patterns:
            for value in sample_values[:20]:  # Sample first 20 values
                if value and re.search(pattern, str(value).lower()):
                    total_matches += 1
                    break  # Count each sample only once
        
        return min(1.0, total_matches / total_samples) if total_samples > 0 else 0.5
    
    def _calculate_semantic_similarity(self, source_field: str, target_field: str) -> float:
        """Calculate semantic similarity between field names"""
        source = source_field.lower().replace('_', ' ').replace('-', ' ')
        
        # Target field keywords for similarity matching
        target_keywords = {
            'ts': ['date', 'time', 'timestamp', 'datetime', 'when', 'occurred'],
            'number': ['phone', 'number', 'contact', 'caller', 'recipient'],
            'duration': ['duration', 'length', 'time', 'minutes', 'seconds'],
            'type': ['type', 'kind', 'category', 'service', 'call'],
            'direction': ['direction', 'flow', 'way', 'incoming', 'outgoing'],
            'content': ['message', 'text', 'content', 'body', 'description'],
            'cost': ['cost', 'charge', 'price', 'fee', 'amount', 'bill'],
            'location': ['location', 'area', 'city', 'region', 'place']
        }
        
        if target_field not in target_keywords:
            return 0.3
        
        keywords = target_keywords[target_field]
        
        # Check for exact matches
        if any(keyword in source for keyword in keywords):
            return 0.9
        
        # Check for partial matches
        partial_score = 0
        for keyword in keywords:
            if any(char in source for char in keyword):
                partial_score += 0.1
        
        return min(0.8, partial_score)
    
    def _calculate_carrier_template_score(
        self,
        mapping: MappingSuggestion,
        carrier: str
    ) -> float:
        """Calculate score based on carrier-specific templates"""
        # This would load from the TemplateManager
        # For now, return a baseline score
        if carrier != 'unknown':
            return 0.7
        return 0.3
    
    def _get_user_feedback_score(self, source_field: str, target_field: str) -> float:
        """Get score based on historical user feedback"""
        # This would query the database for historical mappings
        # For now, return neutral score
        return 0.5
    
    def _calculate_confidence_penalties(
        self,
        mapping: MappingSuggestion,
        context: Dict[str, Any]
    ) -> float:
        """Calculate penalties that reduce confidence"""
        penalties = 0.0
        
        # Penalty for very short field names
        if len(mapping.source_field) < 3:
            penalties += 0.1
        
        # Penalty for generic field names
        generic_names = ['field', 'column', 'data', 'value', 'item']
        if any(generic in mapping.source_field.lower() for generic in generic_names):
            penalties += 0.2
        
        # Penalty for conflicting field types
        if mapping.target_field == 'number' and 'date' in mapping.source_field.lower():
            penalties += 0.3
        
        return penalties


class TemplateManager:
    """Manages field mapping templates and learning"""
    
    def __init__(self):
        self.templates: Dict[str, MappingTemplate] = {}
        self.template_cache_path = Path(settings.model_cache_dir) / "mapping_templates.pkl"
        self._load_templates()
    
    def _load_templates(self):
        """Load templates from cache"""
        try:
            if self.template_cache_path.exists():
                with open(self.template_cache_path, 'rb') as f:
                    template_data = pickle.load(f)
                    self.templates = {
                        k: MappingTemplate.from_dict(v) 
                        for k, v in template_data.items()
                    }
                logger.info(f"Loaded {len(self.templates)} mapping templates")
            else:
                self._create_default_templates()
        except Exception as e:
            logger.error(f"Failed to load templates: {e}")
            self._create_default_templates()
    
    def _save_templates(self):
        """Save templates to cache"""
        try:
            template_data = {
                k: v.to_dict() for k, v in self.templates.items()
            }
            with open(self.template_cache_path, 'wb') as f:
                pickle.dump(template_data, f)
        except Exception as e:
            logger.error(f"Failed to save templates: {e}")
    
    def _create_default_templates(self):
        """Create default templates for major carriers"""
        default_templates = {
            'att_standard': MappingTemplate(
                name='AT&T Standard CDR',
                carrier='att',
                format_type='csv',
                mappings=[
                    MappingSuggestion('Date/Time', 'ts', 'datetime', 0.95, 'Standard AT&T field', True),
                    MappingSuggestion('Phone Number', 'number', 'string', 0.95, 'Standard AT&T field', True),
                    MappingSuggestion('Duration', 'duration', 'number', 0.9, 'Standard AT&T field'),
                    MappingSuggestion('Direction', 'direction', 'string', 0.9, 'Standard AT&T field', True),
                    MappingSuggestion('Call Type', 'type', 'string', 0.85, 'Standard AT&T field', True),
                ],
                metadata={'description': 'Standard AT&T CDR format'},
                created_at=datetime.now(timezone.utc)
            ),
            'verizon_standard': MappingTemplate(
                name='Verizon Standard Bill',
                carrier='verizon', 
                format_type='csv',
                mappings=[
                    MappingSuggestion('Date', 'ts', 'date', 0.9, 'Verizon date field', True),
                    MappingSuggestion('Time', 'ts', 'time', 0.8, 'Verizon time field'),
                    MappingSuggestion('Number Called', 'number', 'string', 0.95, 'Verizon number field', True),
                    MappingSuggestion('Minutes', 'duration', 'number', 0.9, 'Verizon duration field'),
                    MappingSuggestion('Type', 'type', 'string', 0.85, 'Verizon call type', True),
                ],
                metadata={'description': 'Standard Verizon bill format'},
                created_at=datetime.now(timezone.utc)
            ),
            'tmobile_standard': MappingTemplate(
                name='T-Mobile Usage Report',
                carrier='tmobile',
                format_type='csv', 
                mappings=[
                    MappingSuggestion('Date', 'ts', 'date', 0.9, 'T-Mobile date field', True),
                    MappingSuggestion('Phone Number', 'number', 'string', 0.95, 'T-Mobile number field', True),
                    MappingSuggestion('Duration', 'duration', 'number', 0.9, 'T-Mobile duration field'),
                    MappingSuggestion('Call Type', 'type', 'string', 0.85, 'T-Mobile call type', True),
                ],
                metadata={'description': 'Standard T-Mobile usage format'},
                created_at=datetime.now(timezone.utc)
            )
        }
        
        self.templates.update(default_templates)
        self._save_templates()
    
    def find_matching_template(
        self,
        carrier: str,
        format_type: str,
        detected_fields: List[str]
    ) -> Optional[MappingTemplate]:
        """Find best matching template for detected fields"""
        candidates = []
        
        for template_id, template in self.templates.items():
            if template.carrier == carrier and template.format_type == format_type:
                # Calculate match score
                template_fields = {m.source_field.lower() for m in template.mappings}
                detected_fields_lower = {f.lower() for f in detected_fields}
                
                intersection = template_fields & detected_fields_lower
                union = template_fields | detected_fields_lower
                
                if union:
                    match_score = len(intersection) / len(union)
                    candidates.append((template, match_score))
        
        if candidates:
            # Return template with highest match score
            best_template, best_score = max(candidates, key=lambda x: x[1])
            if best_score > 0.5:  # Minimum threshold
                return best_template
        
        return None
    
    def save_user_template(
        self,
        name: str,
        carrier: str,
        format_type: str,
        mappings: List[MappingSuggestion],
        user_id: str
    ) -> str:
        """Save user-created template"""
        template_id = f"user_{user_id}_{hashlib.md5(name.encode()).hexdigest()[:8]}"
        
        template = MappingTemplate(
            name=name,
            carrier=carrier,
            format_type=format_type,
            mappings=mappings,
            metadata={
                'created_by': user_id,
                'is_user_template': True
            },
            created_at=datetime.now(timezone.utc)
        )
        
        self.templates[template_id] = template
        self._save_templates()
        
        logger.info(f"Saved user template: {name}")
        return template_id
    
    def update_template_performance(
        self,
        template_id: str,
        success: bool
    ):
        """Update template performance metrics"""
        if template_id in self.templates:
            template = self.templates[template_id]
            template.usage_count += 1
            
            if success:
                # Update success rate with exponential moving average
                alpha = 0.1  # Learning rate
                template.success_rate = (
                    alpha * 1.0 + 
                    (1 - alpha) * template.success_rate
                )
            else:
                template.success_rate = (
                    alpha * 0.0 + 
                    (1 - alpha) * template.success_rate
                )
            
            self._save_templates()


class MappingWizard:
    """Interactive mapping wizard with smart suggestions"""
    
    def __init__(self):
        self.confidence_scorer = ConfidenceScorer()
        self.template_manager = TemplateManager()
    
    async def generate_mapping_suggestions(
        self,
        detected_fields: List[str],
        sample_data: List[Dict[str, Any]],
        carrier: str = 'unknown',
        format_type: str = 'csv',
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate intelligent mapping suggestions"""
        try:
            suggestions = []
            unmapped_fields = []
            
            # Try to find matching template first
            matching_template = self.template_manager.find_matching_template(
                carrier, format_type, detected_fields
            )
            
            if matching_template:
                logger.info(f"Found matching template: {matching_template.name}")
                
                # Use template mappings as base
                template_mappings = {m.source_field: m for m in matching_template.mappings}
                
                for field in detected_fields:
                    if field in template_mappings:
                        suggestion = template_mappings[field]
                        suggestion.confidence = min(0.95, suggestion.confidence + 0.1)  # Boost template confidence
                        suggestions.append(suggestion)
                    else:
                        unmapped_fields.append(field)
            else:
                unmapped_fields = detected_fields
            
            # Generate ML-based suggestions for unmapped fields
            for field in unmapped_fields:
                ml_suggestions = await self._generate_ml_suggestions(
                    field, sample_data, carrier
                )
                suggestions.extend(ml_suggestions)
            
            # Calculate confidence scores
            for suggestion in suggestions:
                sample_values = self._extract_sample_values(field, sample_data)
                context = {
                    'carrier': carrier,
                    'format_type': format_type,
                    'sample_values': sample_values,
                    'ml_confidence': suggestion.confidence
                }
                
                suggestion.confidence = self.confidence_scorer.calculate_mapping_confidence(
                    suggestion, context
                )
            
            # Sort by confidence and requirement
            suggestions.sort(key=lambda x: (x.is_required, x.confidence), reverse=True)
            
            # Calculate overall mapping quality
            required_fields = {'ts', 'number', 'type', 'direction'}
            mapped_required = {s.target_field for s in suggestions if s.is_required}
            completeness_score = len(mapped_required & required_fields) / len(required_fields)
            
            avg_confidence = np.mean([s.confidence for s in suggestions]) if suggestions else 0.0
            
            quality_score = (completeness_score * 0.6) + (avg_confidence * 0.4)
            
            result = {
                'suggestions': [asdict(s) for s in suggestions],
                'quality_metrics': {
                    'completeness_score': completeness_score,
                    'average_confidence': avg_confidence, 
                    'quality_score': quality_score,
                    'required_fields_mapped': len(mapped_required & required_fields),
                    'total_fields_mapped': len(suggestions),
                    'template_used': matching_template.name if matching_template else None
                },
                'validation_issues': self._identify_validation_issues(suggestions),
                'recommendations': self._generate_recommendations(suggestions, quality_score)
            }
            
            # Save to database for tracking
            if job_id:
                await db_manager.save_mapping_suggestions(
                    job_id=job_id,
                    suggestions=result['suggestions'],
                    quality_metrics=result['quality_metrics']
                )
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to generate mapping suggestions: {e}")
            return {
                'suggestions': [],
                'quality_metrics': {'quality_score': 0.0},
                'validation_issues': [f"Error generating suggestions: {e}"],
                'recommendations': ['Manual mapping required due to error']
            }
    
    async def _generate_ml_suggestions(
        self,
        field: str,
        sample_data: List[Dict[str, Any]],
        carrier: str
    ) -> List[MappingSuggestion]:
        """Generate ML-based field mapping suggestions"""
        suggestions = []
        
        # Use the existing ML layout classifier
        try:
            # Create context for ML prediction
            sample_values = self._extract_sample_values(field, sample_data)
            
            # Use the field mapper model from layout_classifier
            if hasattr(layout_classifier, 'models') and 'field_mapper' in layout_classifier.models:
                model = layout_classifier.models['field_mapper']
                
                # Get prediction
                prediction = model.predict([field.lower()])[0]
                proba = model.predict_proba([field.lower()])[0]
                confidence = float(np.max(proba))
                
                if confidence > 0.4:  # Minimum threshold for suggestions
                    suggestion = MappingSuggestion(
                        source_field=field,
                        target_field=prediction,
                        data_type=self._infer_data_type(prediction),
                        confidence=confidence,
                        reason=f"ML model prediction (confidence: {confidence:.2f})",
                        is_required=prediction in ['ts', 'number', 'type', 'direction']
                    )
                    suggestions.append(suggestion)
        except Exception as e:
            logger.error(f"ML suggestion failed for field {field}: {e}")
        
        # Fallback: pattern-based suggestions
        if not suggestions:
            pattern_suggestion = self._generate_pattern_based_suggestion(field, sample_data)
            if pattern_suggestion:
                suggestions.append(pattern_suggestion)
        
        return suggestions
    
    def _extract_sample_values(self, field: str, sample_data: List[Dict[str, Any]]) -> List[str]:
        """Extract sample values for a field from sample data"""
        values = []
        for row in sample_data[:20]:  # First 20 rows
            if field in row and row[field] is not None:
                values.append(str(row[field]))
        return values
    
    def _generate_pattern_based_suggestion(
        self,
        field: str,
        sample_data: List[Dict[str, Any]]
    ) -> Optional[MappingSuggestion]:
        """Generate suggestion based on field name patterns"""
        field_lower = field.lower().replace(' ', '').replace('_', '').replace('-', '')
        
        # Pattern matching rules
        patterns = {
            'ts': ['date', 'time', 'timestamp', 'datetime', 'when', 'ts'],
            'number': ['phone', 'number', 'contact', 'caller', 'recipient', 'num'],
            'duration': ['duration', 'length', 'minutes', 'seconds', 'time'],
            'type': ['type', 'kind', 'category', 'service'],
            'direction': ['direction', 'flow', 'way', 'in', 'out'],
            'content': ['message', 'text', 'content', 'body', 'description'],
            'cost': ['cost', 'charge', 'price', 'fee', 'amount'],
            'location': ['location', 'area', 'city', 'region', 'place']
        }
        
        best_match = None
        best_score = 0
        
        for target_field, keywords in patterns.items():
            for keyword in keywords:
                if keyword in field_lower:
                    score = len(keyword) / len(field_lower)  # Longer matches score higher
                    if score > best_score:
                        best_score = score
                        best_match = target_field
        
        if best_match and best_score > 0.3:
            return MappingSuggestion(
                source_field=field,
                target_field=best_match,
                data_type=self._infer_data_type(best_match),
                confidence=min(0.8, best_score + 0.2),
                reason=f"Pattern matching (score: {best_score:.2f})",
                is_required=best_match in ['ts', 'number', 'type', 'direction']
            )
        
        return None
    
    def _infer_data_type(self, target_field: str) -> str:
        """Infer data type from target field"""
        type_mapping = {
            'ts': 'datetime',
            'number': 'string',
            'duration': 'number', 
            'type': 'string',
            'direction': 'string',
            'content': 'string',
            'cost': 'number',
            'location': 'string'
        }
        return type_mapping.get(target_field, 'string')
    
    def _identify_validation_issues(
        self,
        suggestions: List[MappingSuggestion]
    ) -> List[str]:
        """Identify potential validation issues"""
        issues = []
        
        # Check for required fields
        required_fields = {'ts', 'number', 'type', 'direction'}
        mapped_fields = {s.target_field for s in suggestions}
        missing_required = required_fields - mapped_fields
        
        if missing_required:
            issues.append(f"Missing required fields: {', '.join(missing_required)}")
        
        # Check for duplicate mappings
        target_counts = Counter(s.target_field for s in suggestions)
        duplicates = [field for field, count in target_counts.items() if count > 1]
        if duplicates:
            issues.append(f"Duplicate field mappings: {', '.join(duplicates)}")
        
        # Check for low confidence mappings
        low_confidence = [s for s in suggestions if s.confidence < 0.5]
        if low_confidence:
            issues.append(f"{len(low_confidence)} mappings have low confidence")
        
        return issues
    
    def _generate_recommendations(
        self,
        suggestions: List[MappingSuggestion],
        quality_score: float
    ) -> List[str]:
        """Generate recommendations for improving mapping quality"""
        recommendations = []
        
        if quality_score < 0.6:
            recommendations.append("Manual review recommended due to low quality score")
        
        if not any(s.target_field == 'ts' for s in suggestions):
            recommendations.append("Add timestamp field mapping for proper chronological ordering")
        
        if not any(s.target_field == 'number' for s in suggestions):
            recommendations.append("Add phone number field mapping for contact correlation")
        
        low_confidence_count = sum(1 for s in suggestions if s.confidence < 0.6)
        if low_confidence_count > len(suggestions) * 0.3:
            recommendations.append("Review low-confidence mappings manually")
        
        if len(suggestions) < 4:
            recommendations.append("Consider adding more field mappings for richer data analysis")
        
        return recommendations


class FieldMappingSystem:
    """Main field mapping system coordinator"""
    
    def __init__(self):
        self.wizard = MappingWizard()
        self.template_manager = TemplateManager()
        self.confidence_scorer = ConfidenceScorer()
    
    async def process_file_mapping(
        self,
        file_content: Union[str, bytes],
        filename: str,
        user_id: str,
        job_id: str,
        manual_mappings: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Process complete file mapping workflow"""
        try:
            # Step 1: ML-powered layout detection
            layout_result = await layout_classifier.classify_layout(
                file_content, filename, job_id
            )
            
            # Step 2: Extract sample data for analysis
            sample_data = self._extract_sample_data(file_content, layout_result)
            
            # Step 3: Generate intelligent mapping suggestions
            if not layout_result.get('requires_manual_mapping', True):
                # Use ML suggestions
                suggestions_result = await self.wizard.generate_mapping_suggestions(
                    detected_fields=list(sample_data[0].keys()) if sample_data else [],
                    sample_data=sample_data,
                    carrier=layout_result.get('carrier', 'unknown'),
                    format_type=layout_result.get('detected_format', 'csv'),
                    job_id=job_id
                )
            else:
                # Require manual mapping
                suggestions_result = {
                    'suggestions': [],
                    'quality_metrics': {'quality_score': 0.0},
                    'validation_issues': ['Manual mapping required'],
                    'recommendations': ['Please map fields manually using the wizard']
                }
            
            # Step 4: Apply manual mappings if provided
            final_mappings = suggestions_result['suggestions']
            if manual_mappings:
                final_mappings = self._apply_manual_mappings(
                    suggestions_result['suggestions'],
                    manual_mappings,
                    sample_data
                )
            
            # Step 5: Validate final mappings
            validation_result = self._validate_final_mappings(final_mappings, sample_data)
            
            # Step 6: Save successful template for future use
            if validation_result['is_valid'] and len(final_mappings) >= 3:
                await self._save_successful_mapping_template(
                    final_mappings,
                    layout_result.get('carrier', 'unknown'),
                    layout_result.get('detected_format', 'csv'),
                    user_id,
                    job_id
                )
            
            return {
                'layout_classification': layout_result,
                'mapping_suggestions': suggestions_result,
                'final_mappings': final_mappings,
                'validation_result': validation_result,
                'sample_data': sample_data[:5],  # Return first 5 rows for preview
                'processing_metadata': {
                    'processed_at': datetime.now(timezone.utc).isoformat(),
                    'user_id': user_id,
                    'job_id': job_id,
                    'filename': filename
                }
            }
            
        except Exception as e:
            logger.error(f"Field mapping failed: {e}", job_id=job_id)
            return {
                'layout_classification': {'error': str(e)},
                'mapping_suggestions': {'suggestions': []},
                'final_mappings': [],
                'validation_result': {'is_valid': False, 'errors': [str(e)]},
                'sample_data': [],
                'processing_metadata': {'error': str(e)}
            }
    
    def _extract_sample_data(
        self,
        file_content: Union[str, bytes], 
        layout_result: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Extract sample data from file for analysis"""
        try:
            if isinstance(file_content, bytes):
                file_content = file_content.decode('utf-8', errors='ignore')
            
            lines = file_content.split('\n')
            table_structure = layout_result.get('table_structure', {})
            
            if table_structure:
                delimiter = table_structure.get('delimiter', ',')
                header_row = table_structure.get('header_row', 0)
                data_start_row = table_structure.get('data_start_row', 1)
                
                if header_row < len(lines) and data_start_row < len(lines):
                    headers = [h.strip(' "\'') for h in lines[header_row].split(delimiter)]
                    sample_rows = []
                    
                    for i in range(data_start_row, min(data_start_row + 20, len(lines))):
                        if i < len(lines) and lines[i].strip():
                            values = [v.strip(' "\'') for v in lines[i].split(delimiter)]
                            if len(values) == len(headers):
                                row_data = dict(zip(headers, values))
                                sample_rows.append(row_data)
                    
                    return sample_rows
            
            # Fallback: try to parse as CSV
            try:
                import io
                import csv
                sample_rows = []
                reader = csv.DictReader(io.StringIO(file_content))
                for i, row in enumerate(reader):
                    if i >= 20:  # Limit to 20 samples
                        break
                    sample_rows.append(dict(row))
                return sample_rows
            except:
                pass
            
            return []
            
        except Exception as e:
            logger.error(f"Failed to extract sample data: {e}")
            return []
    
    def _apply_manual_mappings(
        self,
        suggested_mappings: List[Dict[str, Any]],
        manual_mappings: Dict[str, str],
        sample_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Apply user's manual field mappings"""
        final_mappings = []
        
        # Convert suggestions to lookup dict
        suggestion_lookup = {m['source_field']: m for m in suggested_mappings}
        
        for source_field, target_field in manual_mappings.items():
            if source_field in suggestion_lookup:
                # Update existing suggestion
                mapping = suggestion_lookup[source_field].copy()
                mapping['target_field'] = target_field
                mapping['data_type'] = self.wizard._infer_data_type(target_field)
                mapping['confidence'] = min(0.95, mapping['confidence'] + 0.2)  # Boost user-confirmed mappings
                mapping['reason'] = 'User manual mapping'
                mapping['is_required'] = target_field in ['ts', 'number', 'type', 'direction']
            else:
                # Create new mapping
                sample_values = self.wizard._extract_sample_values(source_field, sample_data)
                mapping = {
                    'source_field': source_field,
                    'target_field': target_field,
                    'data_type': self.wizard._infer_data_type(target_field),
                    'confidence': 0.9,  # High confidence for manual mappings
                    'reason': 'User manual mapping',
                    'is_required': target_field in ['ts', 'number', 'type', 'direction'],
                    'validation_rules': {}
                }
            
            final_mappings.append(mapping)
        
        return final_mappings
    
    def _validate_final_mappings(
        self,
        mappings: List[Dict[str, Any]],
        sample_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Validate final field mappings"""
        errors = []
        warnings = []
        
        # Check required fields
        required_fields = {'ts', 'number', 'type', 'direction'}
        mapped_fields = {m['target_field'] for m in mappings}
        missing_required = required_fields - mapped_fields
        
        if missing_required:
            errors.append(f"Missing required fields: {', '.join(missing_required)}")
        
        # Check for duplicate target mappings
        target_counts = Counter(m['target_field'] for m in mappings)
        duplicates = [field for field, count in target_counts.items() if count > 1]
        if duplicates:
            errors.append(f"Duplicate target field mappings: {', '.join(duplicates)}")
        
        # Validate field content against expected types
        for mapping in mappings:
            source_field = mapping['source_field']
            target_field = mapping['target_field']
            
            if sample_data:
                sample_values = [
                    row.get(source_field) for row in sample_data[:10]
                    if source_field in row and row[source_field] is not None
                ]
                
                if sample_values:
                    content_issues = self._validate_field_content(
                        target_field, sample_values
                    )
                    if content_issues:
                        warnings.extend(content_issues)
        
        return {
            'is_valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'quality_score': self._calculate_mapping_quality_score(mappings, errors, warnings)
        }
    
    def _validate_field_content(
        self,
        target_field: str,
        sample_values: List[Any]
    ) -> List[str]:
        """Validate field content matches expected type"""
        issues = []
        
        if target_field == 'ts':
            # Check for valid date/time patterns
            import re
            date_patterns = [
                r'\d{4}[-/]\d{2}[-/]\d{2}',
                r'\d{2}[-/]\d{2}[-/]\d{4}',
                r'\d{1,2}:\d{2}(:\d{2})?',
                r'\d{10,13}'  # Unix timestamp
            ]
            
            valid_count = 0
            for value in sample_values:
                str_value = str(value).strip()
                if any(re.search(pattern, str_value) for pattern in date_patterns):
                    valid_count += 1
            
            if valid_count < len(sample_values) * 0.7:
                issues.append(f"Timestamp field may have invalid format (only {valid_count}/{len(sample_values)} valid)")
        
        elif target_field == 'number':
            # Check for phone number patterns
            import re
            phone_patterns = [
                r'\+?1?\d{10}',
                r'\(\d{3}\)\s?\d{3}-\d{4}',
                r'\d{3}[-\.]\d{3}[-\.]\d{4}'
            ]
            
            valid_count = 0
            for value in sample_values:
                str_value = str(value).strip()
                if any(re.search(pattern, str_value) for pattern in phone_patterns):
                    valid_count += 1
            
            if valid_count < len(sample_values) * 0.8:
                issues.append(f"Phone number field may have invalid format (only {valid_count}/{len(sample_values)} valid)")
        
        elif target_field == 'duration':
            # Check for numeric or time format
            numeric_count = 0
            for value in sample_values:
                try:
                    float(str(value))
                    numeric_count += 1
                except ValueError:
                    # Check for time format
                    if ':' in str(value):
                        numeric_count += 1
            
            if numeric_count < len(sample_values) * 0.8:
                issues.append(f"Duration field may have invalid format (only {numeric_count}/{len(sample_values)} valid)")
        
        return issues
    
    def _calculate_mapping_quality_score(
        self,
        mappings: List[Dict[str, Any]],
        errors: List[str],
        warnings: List[str]
    ) -> float:
        """Calculate overall quality score for field mappings"""
        if errors:
            return 0.0
        
        # Base score from number of mappings
        base_score = min(1.0, len(mappings) / 6)  # 6 is ideal number of fields
        
        # Average confidence score
        if mappings:
            avg_confidence = np.mean([m['confidence'] for m in mappings])
        else:
            avg_confidence = 0.0
        
        # Penalty for warnings
        warning_penalty = min(0.3, len(warnings) * 0.1)
        
        # Check required field coverage
        required_fields = {'ts', 'number', 'type', 'direction'}
        mapped_required = {m['target_field'] for m in mappings if m['is_required']}
        required_coverage = len(mapped_required & required_fields) / len(required_fields)
        
        final_score = (
            base_score * 0.3 + 
            avg_confidence * 0.4 + 
            required_coverage * 0.3 - 
            warning_penalty
        )
        
        return max(0.0, min(1.0, final_score))
    
    async def _save_successful_mapping_template(
        self,
        mappings: List[Dict[str, Any]],
        carrier: str,
        format_type: str,
        user_id: str,
        job_id: str
    ):
        """Save successful mapping as template for future use"""
        try:
            # Convert to MappingSuggestion objects
            mapping_suggestions = []
            for mapping_dict in mappings:
                suggestion = MappingSuggestion(
                    source_field=mapping_dict['source_field'],
                    target_field=mapping_dict['target_field'],
                    data_type=mapping_dict['data_type'],
                    confidence=mapping_dict['confidence'],
                    reason=mapping_dict['reason'],
                    is_required=mapping_dict.get('is_required', False),
                    validation_rules=mapping_dict.get('validation_rules', {})
                )
                mapping_suggestions.append(suggestion)
            
            # Generate template name
            template_name = f"Auto_{carrier}_{format_type}_{job_id[:8]}"
            
            # Save template
            template_id = self.template_manager.save_user_template(
                name=template_name,
                carrier=carrier,
                format_type=format_type,
                mappings=mapping_suggestions,
                user_id=user_id
            )
            
            logger.info(f"Saved successful mapping template: {template_id}")
            
        except Exception as e:
            logger.error(f"Failed to save mapping template: {e}")


# Global field mapping system instance
field_mapping_system = FieldMappingSystem()