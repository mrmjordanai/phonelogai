"""
ML-powered layout classification for carrier CDR/PDF/CSV files

This module implements machine learning models to automatically detect:
- File format (PDF, CSV, text CDR)  
- Carrier type (AT&T, Verizon, T-Mobile, Sprint, unknown)
- Field mappings and table structure
- Confidence scoring for classification accuracy
"""
import os
import pickle
import re
import hashlib
from typing import Dict, List, Tuple, Optional, Any, Union
from pathlib import Path
import structlog
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.preprocessing import StandardScaler
import joblib
from collections import Counter

from ..config import settings
from ..utils.database import db_manager

logger = structlog.get_logger(__name__)


class LayoutClassifier:
    """ML-powered document layout classifier for carrier files"""
    
    def __init__(self):
        self.models = {}
        self.vectorizers = {}
        self.carrier_patterns = self._load_carrier_patterns()
        self.field_mappings = self._load_field_mappings()
        self._ensure_models_loaded()
    
    def _load_carrier_patterns(self) -> Dict[str, Dict[str, Any]]:
        """Load carrier-specific patterns for detection"""
        return {
            "att": {
                "headers": [
                    "Date/Time", "Phone Number", "Duration", "Direction", 
                    "Call Type", "Location", "Number Dialed", "Time"
                ],
                "patterns": [
                    r"AT&T",
                    r"Wireless Statement", 
                    r"\d{3}-\d{3}-\d{4}",
                    r"Call Detail",
                    r"Incoming|Outgoing",
                    r"\d{2}:\d{2}:\d{2}",
                ],
                "keywords": ["att", "at&t", "wireless", "cingular", "mobility"]
            },
            "verizon": {
                "headers": [
                    "Date", "Time", "Number Called", "Minutes", "Type",
                    "Location", "Charges", "Phone Number"
                ],
                "patterns": [
                    r"Verizon Wireless",
                    r"Account Number",
                    r"Bill Period",
                    r"Call Details",
                    r"Text Details",
                    r"\(\d{3}\)\s?\d{3}-\d{4}",
                ],
                "keywords": ["verizon", "vzw", "wireless", "bell atlantic"]
            },
            "tmobile": {
                "headers": [
                    "Date", "Time", "Phone Number", "Duration", "Call Type",
                    "Description", "Usage", "Charges"
                ],
                "patterns": [
                    r"T-Mobile",
                    r"Usage Details",
                    r"Voice Usage",
                    r"Message Usage", 
                    r"Data Usage",
                    r"\d{3}-\d{3}-\d{4}",
                ],
                "keywords": ["t-mobile", "tmobile", "voicestream", "metropcs"]
            },
            "sprint": {
                "headers": [
                    "Date/Time", "Number", "Duration", "Type", "Description",
                    "Minutes Used", "Messages", "Location"
                ],
                "patterns": [
                    r"Sprint",
                    r"PCS",
                    r"Usage Summary", 
                    r"Call Log",
                    r"Text Log",
                    r"\d{10}",
                ],
                "keywords": ["sprint", "pcs", "nextel", "boost"]
            }
        }
    
    def _load_field_mappings(self) -> Dict[str, Dict[str, str]]:
        """Load standard field mappings for each carrier"""
        return {
            "att": {
                "Date/Time": "ts",
                "Phone Number": "number", 
                "Number Dialed": "number",
                "Duration": "duration",
                "Direction": "direction",
                "Call Type": "type",
                "Location": "location",
                "Time": "ts"
            },
            "verizon": {
                "Date": "ts",
                "Time": "ts", 
                "Number Called": "number",
                "Phone Number": "number",
                "Minutes": "duration",
                "Type": "type",
                "Location": "location",
                "Charges": "cost"
            },
            "tmobile": {
                "Date": "ts",
                "Time": "ts",
                "Phone Number": "number", 
                "Duration": "duration",
                "Call Type": "type",
                "Description": "content",
                "Usage": "type",
                "Charges": "cost"
            },
            "sprint": {
                "Date/Time": "ts",
                "Number": "number",
                "Duration": "duration", 
                "Type": "type",
                "Description": "content",
                "Minutes Used": "duration",
                "Messages": "content",
                "Location": "location"
            }
        }
    
    def _ensure_models_loaded(self):
        """Load or train ML models if they don't exist"""
        model_files = {
            "format_classifier": "format_classifier.joblib",
            "carrier_classifier": "carrier_classifier.joblib",
            "field_mapper": "field_mapper.joblib"
        }
        
        for model_name, filename in model_files.items():
            model_path = Path(settings.model_cache_dir) / filename
            
            if model_path.exists():
                try:
                    self.models[model_name] = joblib.load(model_path)
                    logger.info(f"Loaded model: {model_name}")
                except Exception as e:
                    logger.warning(f"Failed to load {model_name}, will retrain", error=str(e))
                    self._train_model(model_name)
            else:
                logger.info(f"Model {model_name} not found, training...")
                self._train_model(model_name)
    
    def _train_model(self, model_name: str):
        """Train ML model with synthetic and template data"""
        try:
            if model_name == "format_classifier":
                self._train_format_classifier()
            elif model_name == "carrier_classifier":
                self._train_carrier_classifier()
            elif model_name == "field_mapper":
                self._train_field_mapper()
                
            logger.info(f"Successfully trained {model_name}")
            
        except Exception as e:
            logger.error(f"Failed to train {model_name}", error=str(e))
            # Fall back to rule-based classification
            self._create_fallback_model(model_name)
    
    def _train_format_classifier(self):
        """Train enhanced file format classifier with ensemble methods"""
        # Generate comprehensive synthetic training data
        training_data = []
        labels = []
        
        # Enhanced PDF format samples with more variation
        pdf_samples = [
            "Call Detail Report AT&T Wireless Statement Account Number",
            "Verizon Wireless Bill Period Usage Details Call Details",
            "T-Mobile Usage Summary Voice Usage Message Usage Data Usage",
            "Sprint PCS Call Log Text Log Usage Summary",
            "Statement Period from to Account Number Wireless Number",
            "Call Detail Records PDF Format Account Summary",
            "Monthly Statement Wireless Services Usage Details",
            "Wireless Bill PDF Document Account Information",
            "Call Log Report Generated from Billing System PDF",
            "Usage Report Telecommunications Provider Statement",
        ]
        
        # Enhanced CSV format samples with various delimiters
        csv_samples = [
            "Date/Time,Phone Number,Duration,Direction,Call Type",
            "Date,Time,Number Called,Minutes,Type,Location",
            "Date,Phone Number,Duration,Call Type,Description,Charges",
            "Date/Time,Number,Duration,Type,Description,Minutes Used",
            "CallDate|CallTime|CalledNumber|CallDuration|CallType",
            "Date;Time;Phone;Duration;Direction;Type;Location",
            "timestamp\tphone_number\tduration\tcall_type\tdirection",
            "date,caller,callee,start_time,end_time,call_length,type",
            "Date/Time;Number Dialed;Duration (Min);Call Type;Charges",
            "call_date|call_time|number|minutes|direction|location",
        ]
        
        # Enhanced text CDR samples with different formats
        cdr_samples = [
            "CDR Record Type=CALL START_TIME=2023-01-01 DURATION=120",
            "CALL_DETAIL_RECORD|2023-01-01|10:30:00|+15551234567|OUTBOUND|180", 
            "REC_TYPE:VOICE|DATE:2023-01-01|TIME:10:30|NUMBER:5551234567|DIR:OUT",
            "01012023,103000,5551234567,OUT,VOICE,180,COMPLETED",
            "VOICE_CALL 20230101 103000 5551234567 OUTBOUND 180 ANSWERED",
            "CDR_TYPE=SMS DATE=2023-01-01 TIME=10:30 FROM=5551234567 TO=5559876543",
            "CALL START 2023-01-01 10:30:00 CALLER 5551234567 CALLEE 5559876543 DURATION 180",
            "REC:CALL|TS:1672574400|FROM:5551234567|TO:5559876543|DUR:180|TYPE:OUT",
            "Event=CALL_START;Timestamp=20230101103000;ANI=5551234567;DNIS=5559876543",
            "CDR_VOICE 2023/01/01 10:30:00 +15551234567 +15559876543 00:03:00 OUTBOUND",
        ]
        
        # JSON format samples for modern APIs
        json_samples = [
            '{"call_records":[{"date":"2023-01-01","number":"+15551234567"}]}',
            '{"events":[{"timestamp":1672574400,"type":"call","duration":180}]}',
            '{"data":{"calls":[{"from":"+15551234567","to":"+15559876543"}]}}',
            '{"call_detail_records":[{"event_time":"2023-01-01T10:30:00Z"}]}',
        ]
        
        # Add samples to training data with more diversity
        sample_sets = [
            (pdf_samples, "pdf"),
            (csv_samples, "csv"), 
            (cdr_samples, "txt"),
            (json_samples, "json")
        ]
        
        for samples, label in sample_sets:
            for sample in samples:
                training_data.append(sample)
                labels.append(label)
                
                # Add variations with noise and formatting differences
                noisy_sample = sample.lower()
                training_data.append(noisy_sample)
                labels.append(label)
                
                # Add partial samples
                if len(sample) > 50:
                    partial_sample = sample[:len(sample)//2]
                    training_data.append(partial_sample)
                    labels.append(label)
        
        # Create ensemble classifier for better accuracy
        base_classifiers = [
            ('rf', RandomForestClassifier(
                n_estimators=200,
                max_depth=10,
                random_state=42,
                class_weight='balanced'
            )),
            ('gb', GradientBoostingClassifier(
                n_estimators=100,
                learning_rate=0.1,
                max_depth=8,
                random_state=42
            )),
            ('svc', SVC(
                kernel='linear',
                probability=True,
                random_state=42,
                class_weight='balanced'
            ))
        ]
        
        # Create enhanced feature pipeline
        feature_pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(
                max_features=2000,
                ngram_range=(1, 3),
                stop_words='english',
                sublinear_tf=True
            ))
        ])
        
        # Fit features
        X_features = feature_pipeline.fit_transform(training_data)
        
        # Train ensemble classifier
        ensemble = VotingClassifier(
            estimators=base_classifiers,
            voting='soft',
            n_jobs=-1
        )
        
        ensemble.fit(X_features, labels)
        
        # Create final pipeline
        pipeline = Pipeline([
            ('features', feature_pipeline),
            ('classifier', ensemble)
        ])
        
        # Save model
        model_path = Path(settings.model_cache_dir) / "format_classifier.joblib"
        joblib.dump(pipeline, model_path)
        self.models["format_classifier"] = pipeline
        
        # Enhanced evaluation with multiple metrics
        scores = cross_val_score(pipeline, training_data, labels, cv=5, scoring='accuracy')
        precision_scores = cross_val_score(pipeline, training_data, labels, cv=5, scoring='precision_macro')
        recall_scores = cross_val_score(pipeline, training_data, labels, cv=5, scoring='recall_macro')
        
        logger.info(
            f"Enhanced format classifier performance:"
            f" Accuracy: {scores.mean():.3f} (+/- {scores.std() * 2:.3f})"
            f" Precision: {precision_scores.mean():.3f}"
            f" Recall: {recall_scores.mean():.3f}"
        )
    
    def _train_carrier_classifier(self):
        """Train enhanced carrier type classifier with advanced pattern recognition"""
        training_data = []
        labels = []
        
        # Enhanced carrier patterns with more comprehensive signatures
        enhanced_patterns = {
            "att": {
                "document_signatures": [
                    "AT&T Wireless Statement Account Number",
                    "Cingular Wireless Call Detail",
                    "AT&T Mobility Usage Details", 
                    "Statement Period Wireless Number Account",
                    "AT&T Call Detail Report Monthly Statement",
                ],
                "header_patterns": [
                    "Date/Time,Phone Number,Duration,Direction,Call Type",
                    "Call Date,Call Time,Number Dialed,Minutes,Type",
                    "Date Time Called Number Duration Direction",
                ],
                "content_indicators": [
                    "AT&T wireless customer", "cingular mobility",
                    "wireless statement period", "account number",
                    "monthly recurring charges", "usage charges"
                ],
                "phone_formats": [r"\d{3}-\d{3}-\d{4}", r"\(\d{3}\)\s?\d{3}-\d{4}"],
                "time_formats": [r"\d{1,2}:\d{2}:\d{2}\s?(AM|PM)?"],
            },
            "verizon": {
                "document_signatures": [
                    "Verizon Wireless Account Summary",
                    "Bell Atlantic Mobile Usage Report", 
                    "Verizon Call Detail Records",
                    "VZW Account Statement Bill Period",
                    "Verizon Wireless Monthly Statement",
                ],
                "header_patterns": [
                    "Date,Time,Number Called,Minutes,Type,Location",
                    "Call Date,Time,Called Number,Duration,Charges",
                    "Date Time Phone Number Minutes Type Location",
                ],
                "content_indicators": [
                    "verizon wireless", "vzw account", "bell atlantic", 
                    "bill period", "usage summary", "account charges"
                ],
                "phone_formats": [r"\(\d{3}\)\s?\d{3}-\d{4}", r"\d{3}\.\d{3}\.\d{4}"],
                "time_formats": [r"\d{1,2}:\d{2}\s?(AM|PM)", r"\d{4}"],
            },
            "tmobile": {
                "document_signatures": [
                    "T-Mobile Usage Summary Report",
                    "T-Mobile USA Account Statement",
                    "VoiceStream Wireless Call Log",
                    "MetroPCS Usage Details",
                    "T-Mobile Monthly Bill Statement",
                ],
                "header_patterns": [
                    "Date,Time,Phone Number,Duration,Call Type",
                    "Usage Date,Time,Number,Minutes,Type,Charges",
                    "Date Time Phone Duration Type Description",
                ],
                "content_indicators": [
                    "t-mobile", "tmobile usa", "voicestream", "metropcs",
                    "magenta", "usage details", "un-carrier"
                ],
                "phone_formats": [r"\d{3}-\d{3}-\d{4}", r"\+1\d{10}"],
                "time_formats": [r"\d{1,2}:\d{2}(:\d{2})?"],
            },
            "sprint": {
                "document_signatures": [
                    "Sprint PCS Call Detail Record",
                    "Sprint Nextel Usage Report", 
                    "Boost Mobile Call Log",
                    "Sprint Wireless Statement",
                    "PCS Vision Usage Summary",
                ],
                "header_patterns": [
                    "Date/Time,Number,Duration,Type,Description",
                    "Call Date,Time,Called Number,Minutes,Type",
                    "Date Time Number Duration Type Location",
                ],
                "content_indicators": [
                    "sprint pcs", "nextel", "boost mobile", "virgin mobile",
                    "pcs vision", "sprint wireless", "sprint nextel"
                ],
                "phone_formats": [r"\d{10}", r"\d{3}\.\d{3}\.\d{4}"],
                "time_formats": [r"\d{6}", r"\d{1,2}:\d{2}:\d{2}"],
            }
        }
        
        # Generate comprehensive training data
        for carrier, patterns in enhanced_patterns.items():
            # Document signatures
            for signature in patterns["document_signatures"]:
                training_data.append(signature)
                labels.append(carrier)
                
                # Add variations
                training_data.append(signature.upper())
                labels.append(carrier)
                training_data.append(signature.lower())
                labels.append(carrier)
            
            # Header patterns
            for header in patterns["header_patterns"]:
                training_data.append(header)
                labels.append(carrier)
            
            # Content indicators
            for indicator in patterns["content_indicators"]:
                context_sample = f"Statement from {indicator} showing call details and usage summary"
                training_data.append(context_sample)
                labels.append(carrier)
            
            # Phone and time format combinations
            for phone_pattern in patterns["phone_formats"]:
                for time_pattern in patterns["time_formats"]:
                    sample = f"Call log format: phone {phone_pattern} time {time_pattern} duration minutes"
                    training_data.append(sample)
                    labels.append(carrier)
        
        # Add comprehensive unknown carrier samples
        unknown_samples = [
            "Generic Phone Company Call Detail Record",
            "Unknown Carrier Statement Usage Details", 
            "Telecommunications Provider Call Log Summary",
            "Mobile Service Provider Usage Report",
            "Wireless Company Monthly Statement",
            "Regional Carrier Usage Summary",
            "MVNO Virtual Network Operator Statement",
            "International Carrier Call Records",
            "Prepaid Service Call Log Report",
            "Enterprise Phone System CDR Export",
            "VoIP Provider Call Detail Records",
            "Telecom Service Usage Report",
        ]
        
        for sample in unknown_samples:
            training_data.append(sample)
            labels.append("unknown")
            
            # Add variations
            training_data.append(sample.upper())
            labels.append("unknown")
            training_data.append(sample.lower()) 
            labels.append("unknown")
        
        # Create enhanced feature extraction pipeline
        feature_extractors = [
            ('tfidf_words', TfidfVectorizer(
                max_features=2000,
                ngram_range=(1, 3),
                stop_words='english',
                analyzer='word',
                sublinear_tf=True
            )),
            ('tfidf_chars', TfidfVectorizer(
                max_features=1000,
                ngram_range=(2, 6),
                analyzer='char',
                sublinear_tf=True
            ))
        ]
        
        # Create ensemble of specialized classifiers
        base_classifiers = [
            ('gb', GradientBoostingClassifier(
                n_estimators=150,
                learning_rate=0.08,
                max_depth=8,
                random_state=42,
                subsample=0.8
            )),
            ('rf', RandomForestClassifier(
                n_estimators=200,
                max_depth=12,
                random_state=42,
                class_weight='balanced',
                min_samples_split=3
            )),
            ('lr', LogisticRegression(
                random_state=42,
                class_weight='balanced',
                max_iter=1000
            ))
        ]
        
        # Train ensemble with hyperparameter tuning
        from sklearn.feature_extraction.text import FeatureUnion
        
        feature_union = FeatureUnion(feature_extractors)
        
        ensemble = VotingClassifier(
            estimators=base_classifiers,
            voting='soft',
            n_jobs=-1
        )
        
        # Create final pipeline
        pipeline = Pipeline([
            ('features', feature_union),
            ('classifier', ensemble)
        ])
        
        # Train with grid search for optimization
        param_grid = {
            'classifier__gb__n_estimators': [100, 150],
            'classifier__rf__n_estimators': [150, 200],
        }
        
        grid_search = GridSearchCV(
            pipeline,
            param_grid,
            cv=5,
            scoring='accuracy',
            n_jobs=-1,
            verbose=1
        )
        
        grid_search.fit(training_data, labels)
        best_pipeline = grid_search.best_estimator_
        
        # Save optimized model
        model_path = Path(settings.model_cache_dir) / "carrier_classifier.joblib"
        joblib.dump(best_pipeline, model_path)
        self.models["carrier_classifier"] = best_pipeline
        
        # Comprehensive evaluation
        scores = cross_val_score(best_pipeline, training_data, labels, cv=5, scoring='accuracy')
        precision_scores = cross_val_score(best_pipeline, training_data, labels, cv=5, scoring='precision_macro')
        recall_scores = cross_val_score(best_pipeline, training_data, labels, cv=5, scoring='recall_macro')
        
        logger.info(
            f"Enhanced carrier classifier performance:"
            f" Accuracy: {scores.mean():.3f} (+/- {scores.std() * 2:.3f})"
            f" Precision: {precision_scores.mean():.3f}"
            f" Recall: {recall_scores.mean():.3f}"
            f" Best params: {grid_search.best_params_}"
        )
    
    def _train_field_mapper(self):
        """Train enhanced field mapping classifier with intelligent pattern recognition"""
        training_data = []
        labels = []
        
        # Comprehensive field mappings with carrier-specific variations
        enhanced_field_mappings = {
            "ts": [
                # Standard date/time fields
                "date", "time", "datetime", "timestamp", "date/time", "call_date", "usage_date",
                "event_time", "start_time", "end_time", "call_start", "call_end",
                # Carrier-specific variations
                "date_time", "call_datetime", "event_timestamp", "usage_datetime",
                "date_of_call", "time_of_call", "call_time_stamp", "activity_date",
                "call_start_time", "session_start", "transaction_time", "record_time",
                # Format variations
                "dt", "ts", "event_ts", "call_ts", "usage_ts", "activity_ts",
                "date_created", "created_at", "occurred_at", "logged_at"
            ],
            "number": [
                # Phone number variations
                "phone", "number", "phone_number", "called_number", "contact", "recipient",
                "caller", "callee", "calling_number", "called_party", "destination",
                "from_number", "to_number", "ani", "dnis", "source_number", "target_number",
                # Carrier-specific terms
                "wireless_number", "mobile_number", "telephone_number", "phone_no",
                "number_called", "number_dialed", "dialed_number", "originating_number",
                "terminating_number", "calling_party", "called_party_number",
                # Short forms
                "num", "ph", "tel", "mob", "cell", "line", "tn", "msisdn"
            ],
            "duration": [
                # Duration and time measurements
                "duration", "minutes", "seconds", "length", "call_duration", "talk_time",
                "call_length", "elapsed_time", "total_time", "connection_time",
                "billable_duration", "rounded_duration", "actual_duration",
                # Carrier-specific terms
                "call_time", "usage_time", "airtime", "billed_time", "chargeable_time",
                "session_duration", "connection_length", "hold_time", "active_time",
                # Units and formats
                "min", "sec", "mins", "secs", "time_used", "elapsed", "total_duration",
                "duration_seconds", "duration_minutes", "call_minutes", "usage_minutes"
            ],
            "type": [
                # Call/message types
                "type", "call_type", "usage_type", "service_type", "category", "event_type",
                "record_type", "transaction_type", "activity_type", "communication_type",
                # Specific types
                "voice", "sms", "mms", "data", "call", "text", "message", "email",
                "voicemail", "conference", "transfer", "forward", "international",
                # Service classifications
                "service", "feature", "plan_type", "rate_plan", "billing_type",
                "charge_type", "usage_category", "traffic_type", "connection_type"
            ],
            "direction": [
                # Call directions
                "direction", "call_direction", "in_out", "inbound_outbound", "flow",
                "incoming", "outgoing", "inbound", "outbound", "originating", "terminating",
                # Short forms
                "dir", "in", "out", "inc", "og", "term", "orig", "i", "o",
                "from", "to", "sent", "received", "rx", "tx", "mo", "mt",
                # Descriptions
                "call_flow", "traffic_direction", "message_direction", "data_flow"
            ],
            "content": [
                # Message and content fields
                "message", "text", "content", "description", "details", "body",
                "message_text", "sms_text", "message_body", "text_content",
                "message_content", "note", "notes", "comment", "comments",
                # Additional info
                "subject", "title", "summary", "memo", "remark", "annotation",
                "additional_info", "extra_info", "custom_field", "user_data"
            ],
            "cost": [
                # Cost and billing fields
                "cost", "charge", "charges", "amount", "price", "fee", "rate",
                "billing_amount", "billed_amount", "total_charges", "usage_charges",
                "airtime_charges", "service_charges", "additional_charges",
                # Currency and financial
                "bill", "invoice", "payment", "balance", "credit", "debit",
                "revenue", "tariff", "rate_amount", "unit_cost", "line_charge",
                # Short forms
                "amt", "chg", "$", "usd", "eur", "gbp", "total", "subtotal"
            ],
            "location": [
                # Geographic information
                "location", "city", "state", "area", "region", "zone", "country",
                "area_code", "npa", "nxx", "lata", "msa", "geography",
                "originating_location", "terminating_location", "call_location",
                # Network locations
                "cell_site", "tower", "base_station", "cell_id", "lac", "cgi",
                "serving_cell", "coverage_area", "network_location", "roaming_location",
                # Address components
                "address", "street", "zip", "postal_code", "coordinates", "lat", "lon",
                "latitude", "longitude", "gps", "geocode", "place", "venue"
            ]
        }
        
        # Generate comprehensive training data with context
        for target_field, variations in enhanced_field_mappings.items():
            for variation in variations:
                # Base field name
                training_data.append(variation.lower())
                labels.append(target_field)
                
                # Add variations with common prefixes/suffixes
                prefixes = ["", "call_", "sms_", "usage_", "billing_", "customer_", "account_"]
                suffixes = ["", "_id", "_code", "_value", "_data", "_info", "_field"]
                
                for prefix in prefixes[:3]:  # Limit to avoid explosion
                    for suffix in suffixes[:3]:
                        if prefix or suffix:  # Don't duplicate base case
                            variant = f"{prefix}{variation}{suffix}".lower()
                            training_data.append(variant)
                            labels.append(target_field)
                
                # Add common formatting variations
                formatted_variations = [
                    variation.replace("_", " "),
                    variation.replace(" ", "_"),
                    variation.replace("-", "_"),
                    variation.replace("_", "-"),
                    variation.upper(),
                    variation.title(),
                ]
                
                for formatted in formatted_variations:
                    training_data.append(formatted.lower())
                    labels.append(target_field)
        
        # Create advanced feature extraction pipeline
        feature_union = FeatureUnion([
            ('char_tfidf', TfidfVectorizer(
                analyzer='char_wb',
                ngram_range=(2, 6),
                max_features=800,
                sublinear_tf=True
            )),
            ('word_tfidf', TfidfVectorizer(
                analyzer='word',
                ngram_range=(1, 2),
                max_features=500,
                sublinear_tf=True
            )),
            ('count_vec', CountVectorizer(
                analyzer='char',
                ngram_range=(2, 4),
                max_features=300
            ))
        ])
        
        # Create ensemble classifier
        base_classifiers = [
            ('nb', MultinomialNB(alpha=0.05)),
            ('lr', LogisticRegression(
                random_state=42,
                class_weight='balanced',
                max_iter=2000
            )),
            ('rf', RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                class_weight='balanced'
            ))
        ]
        
        ensemble = VotingClassifier(
            estimators=base_classifiers,
            voting='soft',
            n_jobs=-1
        )
        
        # Create optimized pipeline
        pipeline = Pipeline([
            ('features', feature_union),
            ('scaler', StandardScaler(with_mean=False)),  # For sparse matrices
            ('classifier', ensemble)
        ])
        
        # Train with hyperparameter optimization
        param_grid = {
            'classifier__nb__alpha': [0.01, 0.05, 0.1],
            'classifier__lr__C': [0.1, 1.0, 10.0],
        }
        
        grid_search = GridSearchCV(
            pipeline,
            param_grid,
            cv=5,
            scoring='accuracy',
            n_jobs=-1
        )
        
        grid_search.fit(training_data, labels)
        best_pipeline = grid_search.best_estimator_
        
        # Save optimized model
        model_path = Path(settings.model_cache_dir) / "field_mapper.joblib"
        joblib.dump(best_pipeline, model_path)
        self.models["field_mapper"] = best_pipeline
        
        # Comprehensive evaluation
        scores = cross_val_score(best_pipeline, training_data, labels, cv=5, scoring='accuracy')
        precision_scores = cross_val_score(best_pipeline, training_data, labels, cv=5, scoring='precision_macro')
        recall_scores = cross_val_score(best_pipeline, training_data, labels, cv=5, scoring='recall_macro')
        
        logger.info(
            f"Enhanced field mapper performance:"
            f" Accuracy: {scores.mean():.3f} (+/- {scores.std() * 2:.3f})"
            f" Precision: {precision_scores.mean():.3f}"
            f" Recall: {recall_scores.mean():.3f}"
            f" Best params: {grid_search.best_params_}"
        )
    
    def _create_fallback_model(self, model_name: str):
        """Create rule-based fallback model if ML training fails"""
        class RuleBasedClassifier:
            def __init__(self, classifier_type: str):
                self.type = classifier_type
            
            def predict_proba(self, X):
                # Return uniform probabilities as fallback
                n_samples = len(X) if hasattr(X, '__len__') else 1
                if self.type == "format":
                    return np.array([[0.33, 0.33, 0.34]] * n_samples)  # pdf, csv, txt
                elif self.type == "carrier": 
                    return np.array([[0.2, 0.2, 0.2, 0.2, 0.2]] * n_samples)  # att, verizon, tmobile, sprint, unknown
                else:
                    return np.array([[0.1] * 10] * n_samples)  # field mapping
            
            def predict(self, X):
                if self.type == "format":
                    return ["csv"] * len(X)
                elif self.type == "carrier":
                    return ["unknown"] * len(X) 
                else:
                    return ["unknown"] * len(X)
        
        self.models[model_name] = RuleBasedClassifier(model_name.split('_')[0])
        logger.warning(f"Using rule-based fallback for {model_name}")
    
    async def classify_layout(
        self, 
        file_content: Union[str, bytes], 
        filename: str, 
        job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Classify document layout and extract field mappings
        
        Args:
            file_content: Raw file content (text for analysis)
            filename: Original filename for additional context
            job_id: Optional job ID for progress tracking
            
        Returns:
            Dict containing classification results
        """
        try:
            # Convert bytes to string if needed
            if isinstance(file_content, bytes):
                try:
                    file_content = file_content.decode('utf-8', errors='ignore')
                except:
                    file_content = str(file_content, errors='ignore')
            
            # Extract features for classification
            features = self._extract_features(file_content, filename)
            
            # Classify file format
            format_result = self._classify_format(features)
            
            # Classify carrier
            carrier_result = self._classify_carrier(features)
            
            # Generate field mappings
            field_mappings = self._generate_field_mappings(features, carrier_result["carrier"])
            
            # Detect table structure
            table_structure = self._detect_table_structure(file_content, format_result["format"])
            
            # Calculate overall confidence
            overall_confidence = (
                format_result["confidence"] * 0.3 + 
                carrier_result["confidence"] * 0.4 +
                field_mappings["confidence"] * 0.3
            )
            
            # Determine if manual mapping is required
            requires_manual_mapping = (
                overall_confidence < 0.75 or 
                carrier_result["carrier"] == "unknown" or
                len(field_mappings["mappings"]) < 3
            )
            
            classification_result = {
                "detected_format": format_result["format"],
                "carrier": carrier_result["carrier"],
                "confidence": overall_confidence,
                "field_mappings": field_mappings["mappings"],
                "table_structure": table_structure,
                "requires_manual_mapping": requires_manual_mapping,
                "analysis_details": {
                    "format_confidence": format_result["confidence"],
                    "carrier_confidence": carrier_result["confidence"],
                    "mapping_confidence": field_mappings["confidence"],
                    "detected_fields": len(field_mappings["mappings"]),
                    "file_characteristics": features
                }
            }
            
            # Save to database if job_id provided
            if job_id:
                await db_manager.save_layout_classification(
                    job_id=job_id,
                    detected_format=classification_result["detected_format"],
                    carrier=classification_result["carrier"], 
                    confidence=classification_result["confidence"],
                    field_mappings=classification_result["field_mappings"],
                    table_structure=classification_result["table_structure"],
                    requires_manual_mapping=classification_result["requires_manual_mapping"]
                )
            
            logger.info(
                "Layout classification completed",
                job_id=job_id,
                format=format_result["format"],
                carrier=carrier_result["carrier"],
                confidence=overall_confidence,
                requires_manual_mapping=requires_manual_mapping
            )
            
            return classification_result
            
        except Exception as e:
            logger.error("Layout classification failed", job_id=job_id, error=str(e))
            
            # Return fallback classification
            return {
                "detected_format": "csv",  # Most common format
                "carrier": "unknown",
                "confidence": 0.1,  # Very low confidence
                "field_mappings": [],
                "table_structure": None,
                "requires_manual_mapping": True,
                "error": str(e)
            }
    
    def _extract_features(self, content: str, filename: str) -> Dict[str, Any]:
        """Extract features from file content for ML classification"""
        features = {
            "filename": filename.lower(),
            "content_sample": content[:2000],  # First 2KB for analysis
            "line_count": len(content.split('\n')),
            "avg_line_length": np.mean([len(line) for line in content.split('\n')[:100]]),
            "has_headers": self._detect_headers(content),
            "delimiter_candidates": self._detect_delimiters(content),
            "phone_patterns": len(re.findall(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', content)),
            "date_patterns": len(re.findall(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b', content)),
            "time_patterns": len(re.findall(r'\b\d{1,2}:\d{2}(:\d{2})?\b', content)),
            "carrier_keywords": self._count_carrier_keywords(content),
            "numeric_fields": len(re.findall(r'\b\d+\.?\d*\b', content)),
        }
        
        return features
    
    def _classify_format(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Classify file format using ML model"""
        try:
            model = self.models.get("format_classifier")
            if not model:
                return {"format": "csv", "confidence": 0.1}
            
            # Prepare feature text for classification
            feature_text = f"""
            filename: {features['filename']}
            content: {features['content_sample']}
            lines: {features['line_count']}
            delimiters: {features['delimiter_candidates']}
            phone_patterns: {features['phone_patterns']}
            """
            
            # Get prediction probabilities
            proba = model.predict_proba([feature_text])[0]
            prediction = model.predict([feature_text])[0]
            confidence = float(np.max(proba))
            
            return {
                "format": prediction,
                "confidence": confidence,
                "probabilities": dict(zip(model.classes_, proba))
            }
            
        except Exception as e:
            logger.error("Format classification failed", error=str(e))
            return {"format": "csv", "confidence": 0.1}
    
    def _classify_carrier(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Classify carrier type using ML model"""
        try:
            model = self.models.get("carrier_classifier")
            if not model:
                return {"carrier": "unknown", "confidence": 0.1}
            
            # Prepare feature text for classification
            feature_text = f"""
            filename: {features['filename']}
            content: {features['content_sample']}
            carrier_keywords: {features['carrier_keywords']}
            """
            
            # Get prediction probabilities  
            proba = model.predict_proba([feature_text])[0]
            prediction = model.predict([feature_text])[0]
            confidence = float(np.max(proba))
            
            return {
                "carrier": prediction,
                "confidence": confidence,
                "probabilities": dict(zip(model.classes_, proba))
            }
            
        except Exception as e:
            logger.error("Carrier classification failed", error=str(e))
            return {"carrier": "unknown", "confidence": 0.1}
    
    def _generate_field_mappings(self, features: Dict[str, Any], carrier: str) -> Dict[str, Any]:
        """Generate field mappings using ML model and carrier templates"""
        try:
            mappings = []
            confidence_scores = []
            
            # Extract potential field names from content
            field_candidates = self._extract_field_candidates(features["content_sample"])
            
            # Use carrier-specific mappings if available
            if carrier in self.field_mappings:
                carrier_mappings = self.field_mappings[carrier]
                for source_field, target_field in carrier_mappings.items():
                    # Check if source field exists in candidates
                    matching_candidates = [
                        candidate for candidate in field_candidates 
                        if self._field_similarity(source_field, candidate) > 0.7
                    ]
                    
                    if matching_candidates:
                        best_match = max(matching_candidates, key=lambda x: self._field_similarity(source_field, x))
                        mappings.append({
                            "source_field": best_match,
                            "target_field": target_field,
                            "data_type": self._infer_data_type(target_field),
                            "confidence": self._field_similarity(source_field, best_match),
                            "is_required": target_field in ["ts", "number", "type", "direction"]
                        })
                        confidence_scores.append(self._field_similarity(source_field, best_match))
            
            # Use ML model for additional mappings
            model = self.models.get("field_mapper")
            if model and field_candidates:
                for candidate in field_candidates:
                    if not any(m["source_field"] == candidate for m in mappings):
                        try:
                            prediction = model.predict([candidate.lower()])[0]
                            proba = model.predict_proba([candidate.lower()])[0]
                            confidence = float(np.max(proba))
                            
                            if confidence > 0.5:  # Only include high-confidence predictions
                                mappings.append({
                                    "source_field": candidate,
                                    "target_field": prediction,
                                    "data_type": self._infer_data_type(prediction),
                                    "confidence": confidence,
                                    "is_required": prediction in ["ts", "number", "type", "direction"]
                                })
                                confidence_scores.append(confidence)
                        except:
                            continue
            
            overall_confidence = np.mean(confidence_scores) if confidence_scores else 0.1
            
            return {
                "mappings": mappings,
                "confidence": overall_confidence,
                "detected_fields": field_candidates
            }
            
        except Exception as e:
            logger.error("Field mapping generation failed", error=str(e))
            return {"mappings": [], "confidence": 0.1, "detected_fields": []}
    
    def _detect_headers(self, content: str) -> List[str]:
        """Detect header row in content"""
        lines = content.split('\n')[:5]  # Check first 5 lines
        
        for line in lines:
            if ',' in line or '|' in line or '\t' in line:
                # Likely a header row with delimited fields
                delimiters = [',', '|', '\t', ';']
                for delimiter in delimiters:
                    if delimiter in line:
                        headers = [h.strip('"\'') for h in line.split(delimiter)]
                        if len(headers) > 2:  # Must have at least 3 columns
                            return headers
        
        return []
    
    def _detect_delimiters(self, content: str) -> List[str]:
        """Detect possible delimiters in content"""
        candidates = [',', '|', '\t', ';', ':', ' ']
        detected = []
        
        lines = content.split('\n')[:10]  # Sample first 10 lines
        
        for delimiter in candidates:
            delimiter_count = sum(line.count(delimiter) for line in lines)
            if delimiter_count > len(lines):  # More delimiters than lines
                detected.append(delimiter)
        
        return detected
    
    def _count_carrier_keywords(self, content: str) -> Dict[str, int]:
        """Count carrier-specific keywords in content"""
        content_lower = content.lower()
        keyword_counts = {}
        
        for carrier, patterns in self.carrier_patterns.items():
            count = 0
            for keyword in patterns["keywords"]:
                count += content_lower.count(keyword.lower())
            keyword_counts[carrier] = count
        
        return keyword_counts
    
    def _extract_field_candidates(self, content: str) -> List[str]:
        """Extract potential field names from content"""
        candidates = set()
        
        # Extract from first few lines (likely headers)
        lines = content.split('\n')[:10]
        
        for line in lines:
            # Try different delimiters
            for delimiter in [',', '|', '\t', ';']:
                if delimiter in line:
                    fields = line.split(delimiter)
                    for field in fields:
                        clean_field = field.strip(' "\'()[]{}')
                        if len(clean_field) > 2 and len(clean_field) < 50:
                            candidates.add(clean_field)
        
        return list(candidates)
    
    def _field_similarity(self, field1: str, field2: str) -> float:
        """Calculate similarity between two field names"""
        field1 = field1.lower().replace(' ', '').replace('_', '').replace('-', '')
        field2 = field2.lower().replace(' ', '').replace('_', '').replace('-', '')
        
        if field1 == field2:
            return 1.0
        
        # Check if one contains the other
        if field1 in field2 or field2 in field1:
            return 0.8
        
        # Simple character overlap
        common_chars = set(field1) & set(field2)
        total_chars = set(field1) | set(field2)
        
        if total_chars:
            return len(common_chars) / len(total_chars)
        
        return 0.0
    
    def _infer_data_type(self, target_field: str) -> str:
        """Infer data type from target field name"""
        type_mapping = {
            "ts": "date",
            "number": "string", 
            "duration": "number",
            "type": "string",
            "direction": "string",
            "content": "string",
            "cost": "number",
            "location": "string"
        }
        
        return type_mapping.get(target_field, "string")
    
    def _detect_table_structure(self, content: str, file_format: str) -> Optional[Dict[str, Any]]:
        """Detect table structure in the content"""
        try:
            lines = content.split('\n')
            
            if file_format == "csv":
                # Detect CSV structure
                delimiter = None
                header_row = 0
                
                # Find most common delimiter
                for candidate in [',', '|', '\t', ';']:
                    if candidate in lines[0]:
                        delimiter = candidate
                        break
                
                if delimiter:
                    # Analyze first few rows to detect structure
                    sample_rows = lines[:5]
                    columns = []
                    
                    header_fields = lines[0].split(delimiter)
                    for i, field in enumerate(header_fields):
                        column_info = {
                            "index": i,
                            "name": field.strip(' "\''),
                            "data_type": "string",  # Default
                            "sample_values": [],
                            "null_percentage": 0.0
                        }
                        
                        # Collect sample values
                        for row in sample_rows[1:]:
                            if delimiter in row:
                                values = row.split(delimiter)
                                if i < len(values):
                                    column_info["sample_values"].append(values[i].strip(' "\''))
                        
                        # Infer data type from samples
                        if column_info["sample_values"]:
                            column_info["data_type"] = self._infer_column_type(column_info["sample_values"])
                        
                        columns.append(column_info)
                    
                    return {
                        "header_row": header_row,
                        "data_start_row": 1,
                        "columns": columns,
                        "delimiter": delimiter,
                        "encoding": "utf-8"
                    }
            
            elif file_format == "txt":
                # Detect fixed-width or delimited text structure
                if '|' in content or ',' in content:
                    # Delimited text
                    delimiter = '|' if '|' in lines[0] else ','
                    return {
                        "header_row": 0,
                        "data_start_row": 1, 
                        "delimiter": delimiter,
                        "encoding": "utf-8"
                    }
                else:
                    # Fixed-width text
                    return {
                        "header_row": None,
                        "data_start_row": 0,
                        "encoding": "utf-8",
                        "format_type": "fixed_width"
                    }
            
            return None
            
        except Exception as e:
            logger.error("Table structure detection failed", error=str(e))
            return None
    
    def _infer_column_type(self, sample_values: List[str]) -> str:
        """Infer column data type from sample values"""
        if not sample_values:
            return "string"
        
        # Check for numbers
        numeric_count = 0
        date_count = 0
        
        for value in sample_values:
            value = value.strip()
            if not value:
                continue
                
            # Check if numeric
            try:
                float(value)
                numeric_count += 1
                continue
            except ValueError:
                pass
            
            # Check if date/time
            date_patterns = [
                r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',
                r'\d{4}-\d{2}-\d{2}',
                r'\d{1,2}:\d{2}(:\d{2})?'
            ]
            
            for pattern in date_patterns:
                if re.match(pattern, value):
                    date_count += 1
                    break
        
        total_samples = len([v for v in sample_values if v.strip()])
        
        if numeric_count > total_samples * 0.8:
            return "number"
        elif date_count > total_samples * 0.6:
            return "date"
        else:
            return "string"


# Global classifier instance
layout_classifier = LayoutClassifier()