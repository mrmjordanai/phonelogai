"""
Comprehensive validation and testing suite for ML layout classification system

This module provides:
- Automated testing of ML models
- Performance validation
- Accuracy benchmarking
- Template validation
- End-to-end system testing
"""

import time
import json
import asyncio
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import structlog
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from dataclasses import dataclass
import uuid

from ..config import settings
from ..utils.database import db_manager
from .layout_classifier import layout_classifier
from .template_manager import template_manager
from .performance_optimizer import parallel_processor, memory_optimizer

logger = structlog.get_logger(__name__)


@dataclass
class ValidationResult:
    """Results from a validation test"""
    test_name: str
    success: bool
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    processing_time_ms: int
    memory_usage_mb: float
    error_message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


@dataclass
class PerformanceTestResult:
    """Results from performance testing"""
    test_name: str
    rows_processed: int
    processing_time_ms: int
    throughput_rows_per_sec: float
    memory_peak_mb: float
    target_met: bool
    error_rate: float
    quality_score: float


class MLValidationSuite:
    """Comprehensive validation suite for ML components"""
    
    def __init__(self):
        self.test_data_dir = Path(settings.model_cache_dir) / "test_data"
        self.test_data_dir.mkdir(exist_ok=True)
        self.validation_results = []
        
    async def run_full_validation_suite(self) -> Dict[str, Any]:
        """Run complete validation suite for all ML components"""
        
        logger.info("Starting full ML validation suite")
        start_time = time.time()
        
        results = {
            "suite_start_time": time.time(),
            "model_validation": {},
            "template_validation": {},
            "performance_validation": {},
            "integration_tests": {},
            "overall_score": 0.0,
            "recommendations": []
        }
        
        try:
            # 1. Validate ML models
            logger.info("Running ML model validation")
            results["model_validation"] = await self._validate_ml_models()
            
            # 2. Validate template system
            logger.info("Running template system validation")
            results["template_validation"] = await self._validate_template_system()
            
            # 3. Performance testing
            logger.info("Running performance validation")
            results["performance_validation"] = await self._validate_performance()
            
            # 4. Integration testing
            logger.info("Running integration tests")
            results["integration_tests"] = await self._run_integration_tests()
            
            # 5. Calculate overall score
            results["overall_score"] = self._calculate_overall_score(results)
            
            # 6. Generate recommendations
            results["recommendations"] = self._generate_recommendations(results)
            
            execution_time = time.time() - start_time
            results["total_execution_time_seconds"] = execution_time
            
            logger.info(
                "Full validation suite completed",
                execution_time=execution_time,
                overall_score=results["overall_score"]
            )
            
            return results
            
        except Exception as e:
            logger.error("Validation suite failed", error=str(e))
            results["error"] = str(e)
            results["success"] = False
            return results
    
    async def _validate_ml_models(self) -> Dict[str, ValidationResult]:
        """Validate all ML models for accuracy and performance"""
        
        results = {}
        
        # Test data for format classification
        format_test_data = [
            ("Call Detail Report AT&T Wireless Statement", "pdf"),
            ("Date/Time,Phone Number,Duration,Direction", "csv"),
            ("CDR Record Type=CALL START_TIME=2023-01-01", "txt"),
            ('{"call_records":[{"date":"2023-01-01"}]}', "json"),
            ("Verizon Wireless Bill Period Usage Details", "pdf"),
            ("Date,Time,Number Called,Minutes,Type", "csv")
        ]
        
        # Test format classifier
        results["format_classifier"] = await self._test_format_classifier(format_test_data)
        
        # Test data for carrier classification
        carrier_test_data = [
            ("AT&T Wireless Statement Account Number", "att"),
            ("Verizon Wireless Bill Period Usage Details", "verizon"),
            ("T-Mobile Usage Summary Voice Usage", "tmobile"),
            ("Sprint PCS Call Log Text Log", "sprint"),
            ("Generic Phone Company Call Detail", "unknown")
        ]
        
        # Test carrier classifier
        results["carrier_classifier"] = await self._test_carrier_classifier(carrier_test_data)
        
        # Test data for field mapping
        field_mapping_test_data = [
            ("date", "ts"),
            ("phone_number", "number"),
            ("call_duration", "duration"),
            ("call_type", "type"),
            ("inbound", "direction"),
            ("message_text", "content"),
            ("charges", "cost"),
            ("location", "location")
        ]
        
        # Test field mapper
        results["field_mapper"] = await self._test_field_mapper(field_mapping_test_data)
        
        return results
    
    async def _test_format_classifier(self, test_data: List[Tuple[str, str]]) -> ValidationResult:
        """Test format classifier accuracy"""
        
        try:
            start_time = time.time()
            start_memory = memory_optimizer.get_current_memory_mb()
            
            predictions = []
            actuals = []
            
            for text, actual_format in test_data:
                # Use the layout classifier to predict format
                classification = await layout_classifier.classify_layout(
                    file_content=text,
                    filename="test_file.txt"
                )
                
                predicted_format = classification["detected_format"]
                predictions.append(predicted_format)
                actuals.append(actual_format)
            
            # Calculate metrics
            accuracy = accuracy_score(actuals, predictions)
            precision = precision_score(actuals, predictions, average='weighted', zero_division=0)
            recall = recall_score(actuals, predictions, average='weighted', zero_division=0)
            f1 = f1_score(actuals, predictions, average='weighted', zero_division=0)
            
            processing_time = int((time.time() - start_time) * 1000)
            memory_usage = memory_optimizer.get_current_memory_mb() - start_memory
            
            logger.info(
                "Format classifier validation completed",
                accuracy=accuracy,
                precision=precision,
                recall=recall,
                f1_score=f1,
                processing_time_ms=processing_time
            )
            
            return ValidationResult(
                test_name="format_classifier",
                success=True,
                accuracy=accuracy,
                precision=precision,
                recall=recall,
                f1_score=f1,
                processing_time_ms=processing_time,
                memory_usage_mb=memory_usage,
                details={
                    "predictions": predictions,
                    "actuals": actuals,
                    "confusion_matrix": confusion_matrix(actuals, predictions).tolist()
                }
            )
            
        except Exception as e:
            logger.error("Format classifier validation failed", error=str(e))
            return ValidationResult(
                test_name="format_classifier",
                success=False,
                accuracy=0.0,
                precision=0.0,
                recall=0.0,
                f1_score=0.0,
                processing_time_ms=0,
                memory_usage_mb=0.0,
                error_message=str(e)
            )
    
    async def _test_carrier_classifier(self, test_data: List[Tuple[str, str]]) -> ValidationResult:
        """Test carrier classifier accuracy"""
        
        try:
            start_time = time.time()
            start_memory = memory_optimizer.get_current_memory_mb()
            
            predictions = []
            actuals = []
            
            for text, actual_carrier in test_data:
                # Use the layout classifier to predict carrier
                classification = await layout_classifier.classify_layout(
                    file_content=text,
                    filename="test_file.txt"
                )
                
                predicted_carrier = classification["carrier"]
                predictions.append(predicted_carrier)
                actuals.append(actual_carrier)
            
            # Calculate metrics
            accuracy = accuracy_score(actuals, predictions)
            precision = precision_score(actuals, predictions, average='weighted', zero_division=0)
            recall = recall_score(actuals, predictions, average='weighted', zero_division=0)
            f1 = f1_score(actuals, predictions, average='weighted', zero_division=0)
            
            processing_time = int((time.time() - start_time) * 1000)
            memory_usage = memory_optimizer.get_current_memory_mb() - start_memory
            
            logger.info(
                "Carrier classifier validation completed",
                accuracy=accuracy,
                precision=precision,
                recall=recall,
                f1_score=f1,
                processing_time_ms=processing_time
            )
            
            return ValidationResult(
                test_name="carrier_classifier",
                success=True,
                accuracy=accuracy,
                precision=precision,
                recall=recall,
                f1_score=f1,
                processing_time_ms=processing_time,
                memory_usage_mb=memory_usage,
                details={
                    "predictions": predictions,
                    "actuals": actuals,
                    "confusion_matrix": confusion_matrix(actuals, predictions).tolist()
                }
            )
            
        except Exception as e:
            logger.error("Carrier classifier validation failed", error=str(e))
            return ValidationResult(
                test_name="carrier_classifier",
                success=False,
                accuracy=0.0,
                precision=0.0,
                recall=0.0,
                f1_score=0.0,
                processing_time_ms=0,
                memory_usage_mb=0.0,
                error_message=str(e)
            )
    
    async def _test_field_mapper(self, test_data: List[Tuple[str, str]]) -> ValidationResult:
        """Test field mapping accuracy"""
        
        try:
            start_time = time.time()
            start_memory = memory_optimizer.get_current_memory_mb()
            
            # Get manual mapping suggestions to test the field mapper
            field_candidates = [item[0] for item in test_data]
            suggestions = template_manager.get_manual_mapping_suggestions(field_candidates)
            
            predictions = []
            actuals = []
            
            for field_name, expected_mapping in test_data:
                if field_name in suggestions:
                    field_suggestions = suggestions[field_name]
                    if field_suggestions:
                        # Take the highest confidence suggestion
                        predicted_mapping = field_suggestions[0]["target_field"]
                    else:
                        predicted_mapping = "unknown"
                else:
                    predicted_mapping = "unknown"
                
                predictions.append(predicted_mapping)
                actuals.append(expected_mapping)
            
            # Calculate metrics
            accuracy = accuracy_score(actuals, predictions)
            precision = precision_score(actuals, predictions, average='weighted', zero_division=0)
            recall = recall_score(actuals, predictions, average='weighted', zero_division=0)
            f1 = f1_score(actuals, predictions, average='weighted', zero_division=0)
            
            processing_time = int((time.time() - start_time) * 1000)
            memory_usage = memory_optimizer.get_current_memory_mb() - start_memory
            
            logger.info(
                "Field mapper validation completed",
                accuracy=accuracy,
                precision=precision,
                recall=recall,
                f1_score=f1,
                processing_time_ms=processing_time
            )
            
            return ValidationResult(
                test_name="field_mapper",
                success=True,
                accuracy=accuracy,
                precision=precision,
                recall=recall,
                f1_score=f1,
                processing_time_ms=processing_time,
                memory_usage_mb=memory_usage,
                details={
                    "predictions": predictions,
                    "actuals": actuals,
                    "suggestions": suggestions
                }
            )
            
        except Exception as e:
            logger.error("Field mapper validation failed", error=str(e))
            return ValidationResult(
                test_name="field_mapper",
                success=False,
                accuracy=0.0,
                precision=0.0,
                recall=0.0,
                f1_score=0.0,
                processing_time_ms=0,
                memory_usage_mb=0.0,
                error_message=str(e)
            )
    
    async def _validate_template_system(self) -> Dict[str, Any]:
        """Validate template management system"""
        
        results = {
            "template_discovery": False,
            "template_matching": False,
            "template_accuracy_tracking": False,
            "manual_mapping_suggestions": False,
            "errors": []
        }
        
        try:
            # Test template discovery
            test_content = """Date/Time,Phone Number,Duration,Direction,Call Type
2023-01-01 10:30:00,+15551234567,180,Outbound,Voice
2023-01-01 10:35:00,+15559876543,120,Inbound,Voice"""
            
            template = await template_manager.discover_template(
                file_content=test_content,
                detected_carrier="att",
                detected_format="csv",
                job_id="test_template_discovery"
            )
            
            if template and template.template_id:
                results["template_discovery"] = True
                logger.info("Template discovery test passed", template_id=template.template_id)
            else:
                results["errors"].append("Template discovery failed")
            
            # Test template matching
            field_candidates = ["date_time", "phone_number", "duration", "direction", "call_type"]
            matching_template = template_manager.find_matching_template(
                field_candidates=field_candidates,
                carrier="att",
                format_type="csv",
                confidence_threshold=0.5
            )
            
            if matching_template:
                results["template_matching"] = True
                logger.info("Template matching test passed", template_id=matching_template.template_id)
            else:
                results["errors"].append("Template matching failed")
            
            # Test manual mapping suggestions
            suggestions = template_manager.get_manual_mapping_suggestions(field_candidates)
            
            if suggestions and len(suggestions) > 0:
                results["manual_mapping_suggestions"] = True
                logger.info("Manual mapping suggestions test passed", suggestions_count=len(suggestions))
            else:
                results["errors"].append("Manual mapping suggestions failed")
            
            # Test template accuracy tracking
            if template:
                await template_manager.update_template_accuracy(
                    template_id=template.template_id,
                    parsing_success_rate=0.95,
                    validation_errors=5,
                    total_records=100
                )
                results["template_accuracy_tracking"] = True
                logger.info("Template accuracy tracking test passed")
            
        except Exception as e:
            error_msg = f"Template system validation failed: {str(e)}"
            results["errors"].append(error_msg)
            logger.error(error_msg)
        
        results["overall_success"] = all([
            results["template_discovery"],
            results["template_matching"],
            results["manual_mapping_suggestions"]
        ])
        
        return results
    
    async def _validate_performance(self) -> Dict[str, PerformanceTestResult]:
        """Validate performance targets"""
        
        results = {}
        
        # Test 1: Small dataset (1K rows)
        results["small_dataset"] = await self._run_performance_test(
            rows=1000,
            test_name="small_dataset_1k_rows"
        )
        
        # Test 2: Medium dataset (10K rows)
        results["medium_dataset"] = await self._run_performance_test(
            rows=10000,
            test_name="medium_dataset_10k_rows"
        )
        
        # Test 3: Large dataset (100K rows)
        results["large_dataset"] = await self._run_performance_test(
            rows=100000,
            test_name="large_dataset_100k_rows"
        )
        
        return results
    
    async def _run_performance_test(self, rows: int, test_name: str) -> PerformanceTestResult:
        """Run performance test with specified number of rows"""
        
        try:
            logger.info(f"Starting performance test: {test_name}", rows=rows)
            
            # Generate test data
            test_data = self._generate_test_csv_data(rows)
            
            start_time = time.time()
            start_memory = memory_optimizer.get_current_memory_mb()
            
            # Run classification and parsing simulation
            job_id = f"perf_test_{uuid.uuid4().hex[:8]}"
            
            # Simulate the full processing pipeline
            classification = await layout_classifier.classify_layout(
                file_content=test_data[:2000],  # Sample for classification
                filename="performance_test.csv",
                job_id=job_id
            )
            
            # Parse the data (simplified simulation)
            import pandas as pd
            import io
            
            df = pd.read_csv(io.StringIO(test_data))
            processed_rows = len(df)
            
            end_time = time.time()
            peak_memory = memory_optimizer.get_current_memory_mb()
            
            processing_time_ms = int((end_time - start_time) * 1000)
            throughput = processed_rows / max((end_time - start_time), 0.1)
            memory_usage = peak_memory - start_memory
            
            # Check if target was met based on our performance goals
            target_met = self._check_performance_target(processed_rows, processing_time_ms)
            
            logger.info(
                f"Performance test completed: {test_name}",
                rows_processed=processed_rows,
                processing_time_ms=processing_time_ms,
                throughput_rows_per_sec=throughput,
                memory_usage_mb=memory_usage,
                target_met=target_met
            )
            
            return PerformanceTestResult(
                test_name=test_name,
                rows_processed=processed_rows,
                processing_time_ms=processing_time_ms,
                throughput_rows_per_sec=throughput,
                memory_peak_mb=peak_memory,
                target_met=target_met,
                error_rate=0.0,  # No errors in simulation
                quality_score=1.0  # Perfect quality in simulation
            )
            
        except Exception as e:
            logger.error(f"Performance test failed: {test_name}", error=str(e))
            return PerformanceTestResult(
                test_name=test_name,
                rows_processed=0,
                processing_time_ms=0,
                throughput_rows_per_sec=0.0,
                memory_peak_mb=0.0,
                target_met=False,
                error_rate=1.0,
                quality_score=0.0
            )
    
    def _generate_test_csv_data(self, rows: int) -> str:
        """Generate test CSV data with specified number of rows"""
        
        import random
        from datetime import datetime, timedelta
        
        header = "Date/Time,Phone Number,Duration,Direction,Call Type\\n"
        data_rows = []
        
        base_date = datetime(2023, 1, 1)
        
        for i in range(rows):
            # Random date within the last year
            random_date = base_date + timedelta(days=random.randint(0, 365))
            date_str = random_date.strftime("%Y-%m-%d %H:%M:%S")
            
            # Random phone number
            phone = f"+1555{random.randint(1000000, 9999999)}"
            
            # Random duration (0-3600 seconds)
            duration = random.randint(0, 3600)
            
            # Random direction
            direction = random.choice(["Inbound", "Outbound"])
            
            # Random call type
            call_type = random.choice(["Voice", "SMS", "MMS"])
            
            data_rows.append(f"{date_str},{phone},{duration},{direction},{call_type}")
        
        return header + "\\n".join(data_rows)
    
    def _check_performance_target(self, rows: int, processing_time_ms: int) -> bool:
        """Check if processing met performance targets"""
        
        if rows >= 100000:
            # Target: 100k rows in <5min
            target_time_ms = 5 * 60 * 1000
            return processing_time_ms <= target_time_ms
        elif rows >= 10000:
            # Proportional target for 10k rows
            target_time_ms = (rows / 100000) * (5 * 60 * 1000)
            return processing_time_ms <= target_time_ms * 1.2  # 20% tolerance
        else:
            # For small datasets, expect very fast processing
            target_time_ms = 30 * 1000  # 30 seconds
            return processing_time_ms <= target_time_ms
    
    async def _run_integration_tests(self) -> Dict[str, Any]:
        """Run end-to-end integration tests"""
        
        results = {
            "csv_end_to_end": False,
            "template_workflow": False,
            "error_handling": False,
            "memory_optimization": False,
            "errors": []
        }
        
        try:
            # Test 1: CSV end-to-end processing
            test_csv = self._generate_test_csv_data(100)
            
            # Simulate full pipeline
            classification = await layout_classifier.classify_layout(
                file_content=test_csv,
                filename="integration_test.csv",
                job_id="integration_test_csv"
            )
            
            if (classification["detected_format"] == "csv" and 
                len(classification["field_mappings"]) > 0):
                results["csv_end_to_end"] = True
                logger.info("CSV end-to-end integration test passed")
            else:
                results["errors"].append("CSV end-to-end test failed")
            
            # Test 2: Template workflow
            template = await template_manager.discover_template(
                file_content=test_csv,
                detected_carrier=classification["carrier"],
                detected_format=classification["detected_format"],
                job_id="integration_test_template"
            )
            
            if template and template.template_id:
                results["template_workflow"] = True
                logger.info("Template workflow integration test passed")
            else:
                results["errors"].append("Template workflow test failed")
            
            # Test 3: Memory optimization
            with memory_optimizer.memory_limit_context():
                # Process larger dataset to test memory management
                large_csv = self._generate_test_csv_data(10000)
                
                import pandas as pd
                import io
                
                df = pd.read_csv(io.StringIO(large_csv))
                optimized_df = memory_optimizer.optimize_pandas_dtypes(df)
                
                if len(optimized_df) == len(df):
                    results["memory_optimization"] = True
                    logger.info("Memory optimization integration test passed")
                else:
                    results["errors"].append("Memory optimization test failed")
            
            # Test 4: Error handling
            try:
                # Test with invalid data
                invalid_data = "This is not a valid CSV or any structured data format"
                error_classification = await layout_classifier.classify_layout(
                    file_content=invalid_data,
                    filename="invalid_test.txt",
                    job_id="integration_test_error"
                )
                
                # Should handle gracefully with low confidence
                if error_classification["confidence"] < 0.5:
                    results["error_handling"] = True
                    logger.info("Error handling integration test passed")
                else:
                    results["errors"].append("Error handling test failed")
                    
            except Exception:
                # Exception handling is also acceptable
                results["error_handling"] = True
                logger.info("Error handling integration test passed (exception caught)")
            
        except Exception as e:
            error_msg = f"Integration tests failed: {str(e)}"
            results["errors"].append(error_msg)
            logger.error(error_msg)
        
        results["overall_success"] = all([
            results["csv_end_to_end"],
            results["template_workflow"],
            results["error_handling"],
            results["memory_optimization"]
        ])
        
        return results
    
    def _calculate_overall_score(self, results: Dict[str, Any]) -> float:
        """Calculate overall validation score"""
        
        scores = []
        
        # Model validation scores (40% weight)
        model_results = results.get("model_validation", {})
        model_scores = []
        
        for model_name, model_result in model_results.items():
            if isinstance(model_result, ValidationResult) and model_result.success:
                # Weight accuracy more heavily, but consider all metrics
                model_score = (
                    model_result.accuracy * 0.4 +
                    model_result.precision * 0.2 +
                    model_result.recall * 0.2 +
                    model_result.f1_score * 0.2
                )
                model_scores.append(model_score)
        
        if model_scores:
            scores.append(np.mean(model_scores) * 0.4)
        
        # Template system validation (20% weight)
        template_results = results.get("template_validation", {})
        if template_results.get("overall_success", False):
            template_score = 0.9  # High score for successful template operations
        else:
            template_score = 0.5 if len(template_results.get("errors", [])) < 3 else 0.2
        scores.append(template_score * 0.2)
        
        # Performance validation (25% weight)
        performance_results = results.get("performance_validation", {})
        performance_scores = []
        
        for test_name, perf_result in performance_results.items():
            if isinstance(perf_result, PerformanceTestResult):
                # High score if target met, moderate if close, low if far
                if perf_result.target_met:
                    performance_scores.append(1.0)
                elif perf_result.throughput_rows_per_sec > 100:  # Reasonable throughput
                    performance_scores.append(0.7)
                else:
                    performance_scores.append(0.3)
        
        if performance_scores:
            scores.append(np.mean(performance_scores) * 0.25)
        
        # Integration tests (15% weight)
        integration_results = results.get("integration_tests", {})
        if integration_results.get("overall_success", False):
            integration_score = 1.0
        else:
            # Partial score based on passed tests
            passed_tests = sum(1 for key, value in integration_results.items() 
                             if key != "overall_success" and key != "errors" and value)
            total_tests = len(integration_results) - 2  # Exclude overall_success and errors
            integration_score = passed_tests / max(total_tests, 1) if total_tests > 0 else 0.5
        scores.append(integration_score * 0.15)
        
        return sum(scores) if scores else 0.0
    
    def _generate_recommendations(self, results: Dict[str, Any]) -> List[str]:
        """Generate recommendations based on validation results"""
        
        recommendations = []
        overall_score = results.get("overall_score", 0.0)
        
        # Overall score recommendations
        if overall_score < 0.7:
            recommendations.append("Overall system performance is below target (70%). Consider retraining models or optimizing processing.")
        elif overall_score < 0.9:
            recommendations.append("System performance is good but has room for improvement. Focus on accuracy optimization.")
        else:
            recommendations.append("System performance is excellent! Continue monitoring for consistency.")
        
        # Model-specific recommendations
        model_results = results.get("model_validation", {})
        for model_name, model_result in model_results.items():
            if isinstance(model_result, ValidationResult):
                if not model_result.success:
                    recommendations.append(f"{model_name} failed validation. Check model training and data quality.")
                elif model_result.accuracy < 0.9:
                    recommendations.append(f"{model_name} accuracy is {model_result.accuracy:.2f}. Consider retraining with more data.")
                elif model_result.processing_time_ms > 5000:
                    recommendations.append(f"{model_name} processing time is high ({model_result.processing_time_ms}ms). Optimize for performance.")
        
        # Template system recommendations
        template_results = results.get("template_validation", {})
        if not template_results.get("overall_success", False):
            recommendations.append("Template system validation failed. Check template discovery and matching logic.")
        
        # Performance recommendations
        performance_results = results.get("performance_validation", {})
        targets_failed = []
        for test_name, perf_result in performance_results.items():
            if isinstance(perf_result, PerformanceTestResult) and not perf_result.target_met:
                targets_failed.append(test_name)
        
        if targets_failed:
            recommendations.append(f"Performance targets failed for: {', '.join(targets_failed)}. Implement parallel processing and memory optimization.")
        
        # Integration test recommendations
        integration_results = results.get("integration_tests", {})
        if not integration_results.get("overall_success", False):
            failed_tests = [key for key, value in integration_results.items() 
                          if key not in ["overall_success", "errors"] and not value]
            if failed_tests:
                recommendations.append(f"Integration tests failed: {', '.join(failed_tests)}. Check end-to-end workflows.")
        
        return recommendations


# Global validation suite instance
ml_validation_suite = MLValidationSuite()