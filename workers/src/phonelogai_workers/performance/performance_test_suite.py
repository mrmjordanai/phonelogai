"""
Performance Test Suite - Main testing framework for AI file parser system.

Provides comprehensive performance testing capabilities including:
- System resource monitoring
- Performance metrics collection
- Baseline establishment
- Test data generation
- Results validation
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable
import psutil
import pandas as pd
import numpy as np
from memory_profiler import profile

from .metrics_collector import MetricsCollector
from .resource_monitor import ResourceMonitor
from .test_data_generator import TestDataGenerator


@dataclass
class PerformanceMetrics:
    """Performance metrics data structure"""
    # Processing Performance
    rows_per_second: float = 0.0
    processing_latency_p95: float = 0.0
    memory_usage_peak: int = 0
    memory_usage_avg: int = 0
    
    # ML Performance
    classification_accuracy: float = 0.0
    classification_latency: float = 0.0
    template_match_rate: float = 0.0
    
    # System Performance
    cpu_usage_avg: float = 0.0
    disk_io_rate: float = 0.0
    queue_depth_max: int = 0
    
    # Quality Metrics
    duplicate_detection_accuracy: float = 0.0
    validation_coverage: float = 0.0
    error_rate: float = 0.0
    
    # Test Metadata
    test_name: str = ""
    timestamp: datetime = None
    duration_seconds: float = 0.0


@dataclass
class TestScenario:
    """Test scenario configuration"""
    name: str
    description: str
    target_rows: int
    target_time_seconds: int
    file_type: str
    carrier: Optional[str] = None
    complexity: str = "medium"
    expected_accuracy: float = 0.95


class PerformanceTestSuite:
    """
    Main performance testing framework for AI file parser system.
    
    Provides comprehensive testing capabilities with resource monitoring,
    metrics collection, and validation against performance targets.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize performance test suite.
        
        Args:
            config: Optional configuration dictionary
        """
        self.config = config or self._default_config()
        self.logger = logging.getLogger(__name__)
        
        # Initialize components
        self.metrics_collector = MetricsCollector()
        self.resource_monitor = ResourceMonitor()
        self.test_data_generator = TestDataGenerator()
        
        # Test results storage
        self.test_results: Dict[str, PerformanceMetrics] = {}
        self.baseline_metrics: Dict[str, PerformanceMetrics] = {}
        
        # Performance targets
        self.performance_targets = {
            "100k_rows_processing": {"target": 300, "unit": "seconds"},  # 5 min
            "1m_rows_processing": {"target": 1800, "unit": "seconds"},   # 30 min
            "memory_usage_peak": {"target": 2147483648, "unit": "bytes"}, # 2GB
            "ml_classification_accuracy": {"target": 0.95, "unit": "ratio"},
            "duplicate_detection_accuracy": {"target": 0.99, "unit": "ratio"},
            "validation_coverage": {"target": 0.98, "unit": "ratio"}
        }
    
    def _default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            "test_data_dir": "./test_data",
            "results_dir": "./test_results",
            "enable_profiling": True,
            "memory_limit_gb": 2,
            "timeout_minutes": 60,
            "parallel_workers": psutil.cpu_count(),
            "log_level": "INFO"
        }
    
    async def setup_test_environment(self) -> bool:
        """
        Set up isolated testing environment.
        
        Returns:
            bool: True if setup successful, False otherwise
        """
        try:
            self.logger.info("Setting up performance test environment...")
            
            # Create test directories
            test_data_dir = Path(self.config["test_data_dir"])
            results_dir = Path(self.config["results_dir"])
            
            test_data_dir.mkdir(parents=True, exist_ok=True)
            results_dir.mkdir(parents=True, exist_ok=True)
            
            # Initialize resource monitoring
            await self.resource_monitor.start_monitoring()
            
            # Initialize metrics collection
            await self.metrics_collector.initialize()
            
            # Validate system resources
            system_info = self._get_system_info()
            self.logger.info(f"System info: {system_info}")
            
            # Check memory availability
            available_memory_gb = psutil.virtual_memory().available / (1024**3)
            if available_memory_gb < self.config["memory_limit_gb"]:
                self.logger.warning(f"Limited memory available: {available_memory_gb:.1f}GB")
            
            self.logger.info("Test environment setup completed successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to setup test environment: {e}")
            return False
    
    def _get_system_info(self) -> Dict[str, Any]:
        """Get system information for test context"""
        return {
            "cpu_count": psutil.cpu_count(),
            "cpu_freq": psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None,
            "memory_total_gb": psutil.virtual_memory().total / (1024**3),
            "memory_available_gb": psutil.virtual_memory().available / (1024**3),
            "disk_usage": {
                path: psutil.disk_usage(path)._asdict() 
                for path in ["/", "/tmp"] if Path(path).exists()
            }
        }
    
    async def collect_baseline_metrics(self) -> Dict[str, PerformanceMetrics]:
        """
        Establish baseline performance metrics.
        
        Returns:
            Dict[str, PerformanceMetrics]: Baseline metrics for different scenarios
        """
        self.logger.info("Collecting baseline performance metrics...")
        
        # Define baseline test scenarios
        baseline_scenarios = [
            TestScenario(
                name="small_dataset_baseline",
                description="1K rows CSV baseline",
                target_rows=1000,
                target_time_seconds=5,
                file_type="csv"
            ),
            TestScenario(
                name="medium_dataset_baseline", 
                description="10K rows CSV baseline",
                target_rows=10000,
                target_time_seconds=30,
                file_type="csv"
            ),
            TestScenario(
                name="large_dataset_baseline",
                description="100K rows CSV baseline",
                target_rows=100000,
                target_time_seconds=300,
                file_type="csv"
            ),
            TestScenario(
                name="pdf_processing_baseline",
                description="50-page PDF baseline",
                target_rows=2500,  # ~50 records per page
                target_time_seconds=120,
                file_type="pdf"
            )
        ]
        
        baselines = {}
        
        for scenario in baseline_scenarios:
            self.logger.info(f"Running baseline test: {scenario.name}")
            
            try:
                # Generate test data
                test_data = await self.test_data_generator.generate_test_data(
                    rows=scenario.target_rows,
                    file_type=scenario.file_type,
                    scenario_name=scenario.name
                )
                
                # Run baseline test
                metrics = await self._run_performance_test(
                    test_data=test_data,
                    scenario=scenario
                )
                
                baselines[scenario.name] = metrics
                self.logger.info(
                    f"Baseline {scenario.name}: "
                    f"{metrics.rows_per_second:.1f} rows/sec, "
                    f"{metrics.memory_usage_peak / 1024**2:.1f} MB peak"
                )
                
            except Exception as e:
                self.logger.error(f"Failed to collect baseline for {scenario.name}: {e}")
                baselines[scenario.name] = PerformanceMetrics(
                    test_name=scenario.name,
                    error_rate=1.0
                )
        
        self.baseline_metrics = baselines
        await self._save_results(baselines, "baseline_metrics.json")
        
        return baselines
    
    async def _run_performance_test(
        self, 
        test_data: Any, 
        scenario: TestScenario,
        processing_function: Optional[Callable] = None
    ) -> PerformanceMetrics:
        """
        Run a single performance test.
        
        Args:
            test_data: Test data to process
            scenario: Test scenario configuration
            processing_function: Custom processing function
            
        Returns:
            PerformanceMetrics: Test results
        """
        start_time = time.time()
        start_timestamp = datetime.now()
        
        # Start resource monitoring
        await self.resource_monitor.start_test_monitoring(scenario.name)
        
        # Initialize metrics
        metrics = PerformanceMetrics(
            test_name=scenario.name,
            timestamp=start_timestamp
        )
        
        try:
            # Execute test processing
            if processing_function:
                result = await processing_function(test_data)
            else:
                # Use default processing pipeline
                result = await self._default_processing_pipeline(test_data, scenario)
            
            end_time = time.time()
            processing_duration = end_time - start_time
            
            # Collect resource metrics
            resource_metrics = await self.resource_monitor.get_test_metrics(scenario.name)
            
            # Calculate performance metrics
            metrics.duration_seconds = processing_duration
            metrics.rows_per_second = scenario.target_rows / processing_duration
            metrics.processing_latency_p95 = processing_duration  # Simplified for single test
            
            # Resource metrics
            metrics.memory_usage_peak = resource_metrics.get("memory_peak", 0)
            metrics.memory_usage_avg = resource_metrics.get("memory_avg", 0)
            metrics.cpu_usage_avg = resource_metrics.get("cpu_avg", 0.0)
            metrics.disk_io_rate = resource_metrics.get("disk_io_rate", 0.0)
            
            # Quality metrics (if available in result)
            if hasattr(result, "accuracy"):
                metrics.classification_accuracy = result.accuracy
            if hasattr(result, "duplicate_detection_accuracy"):
                metrics.duplicate_detection_accuracy = result.duplicate_detection_accuracy
            if hasattr(result, "validation_coverage"):
                metrics.validation_coverage = result.validation_coverage
            
            self.logger.info(
                f"Test {scenario.name} completed: "
                f"{metrics.rows_per_second:.1f} rows/sec, "
                f"{processing_duration:.2f}s duration"
            )
            
        except Exception as e:
            end_time = time.time()
            metrics.duration_seconds = end_time - start_time
            metrics.error_rate = 1.0
            self.logger.error(f"Test {scenario.name} failed: {e}")
            
        finally:
            await self.resource_monitor.stop_test_monitoring(scenario.name)
        
        return metrics
    
    async def _default_processing_pipeline(self, test_data: Any, scenario: TestScenario) -> Any:
        """
        Default processing pipeline for performance testing.
        
        Args:
            test_data: Test data to process
            scenario: Test scenario
            
        Returns:
            Any: Processing results
        """
        # This would integrate with the actual ML pipeline
        # For now, simulate processing with realistic delays
        
        processing_time_per_row = 0.001  # 1ms per row base time
        if scenario.file_type == "pdf":
            processing_time_per_row *= 10  # PDFs are slower
        
        # Simulate processing delay
        await asyncio.sleep(scenario.target_rows * processing_time_per_row)
        
        # Return mock results
        return type('MockResult', (), {
            'accuracy': 0.95 + np.random.normal(0, 0.02),  # ~95% with variation
            'duplicate_detection_accuracy': 0.99 + np.random.normal(0, 0.005),
            'validation_coverage': 0.98 + np.random.normal(0, 0.01),
            'processed_rows': scenario.target_rows
        })()
    
    async def run_performance_benchmarks(self, scenarios: Optional[List[TestScenario]] = None) -> Dict[str, PerformanceMetrics]:
        """
        Run comprehensive performance benchmarks.
        
        Args:
            scenarios: Custom test scenarios (optional)
            
        Returns:
            Dict[str, PerformanceMetrics]: Benchmark results
        """
        if scenarios is None:
            scenarios = self._get_default_benchmark_scenarios()
        
        self.logger.info(f"Running {len(scenarios)} performance benchmark scenarios...")
        
        results = {}
        
        for scenario in scenarios:
            self.logger.info(f"Running benchmark: {scenario.name}")
            
            try:
                # Generate test data for scenario
                test_data = await self.test_data_generator.generate_test_data(
                    rows=scenario.target_rows,
                    file_type=scenario.file_type,
                    carrier=scenario.carrier,
                    scenario_name=scenario.name
                )
                
                # Run performance test
                metrics = await self._run_performance_test(test_data, scenario)
                results[scenario.name] = metrics
                
                # Validate against targets
                validation_result = self._validate_against_targets(metrics, scenario)
                if validation_result["meets_targets"]:
                    self.logger.info(f"✅ {scenario.name} meets performance targets")
                else:
                    self.logger.warning(f"⚠️  {scenario.name} failed targets: {validation_result['failures']}")
                
            except Exception as e:
                self.logger.error(f"Benchmark {scenario.name} failed: {e}")
                results[scenario.name] = PerformanceMetrics(
                    test_name=scenario.name,
                    error_rate=1.0,
                    timestamp=datetime.now()
                )
        
        # Save results
        await self._save_results(results, f"benchmark_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        
        return results
    
    def _get_default_benchmark_scenarios(self) -> List[TestScenario]:
        """Get default benchmark scenarios"""
        return [
            TestScenario(
                name="performance_target_100k",
                description="100K rows in 5 minutes target",
                target_rows=100000,
                target_time_seconds=300,
                file_type="csv",
                expected_accuracy=0.95
            ),
            TestScenario(
                name="performance_target_1m",
                description="1M rows in 30 minutes target", 
                target_rows=1000000,
                target_time_seconds=1800,
                file_type="csv",
                expected_accuracy=0.95
            ),
            TestScenario(
                name="pdf_processing_large",
                description="Large PDF processing test",
                target_rows=10000,
                target_time_seconds=600,
                file_type="pdf",
                expected_accuracy=0.90
            ),
            TestScenario(
                name="mixed_format_test",
                description="Mixed format processing",
                target_rows=50000,
                target_time_seconds=400,
                file_type="mixed",
                expected_accuracy=0.93
            )
        ]
    
    def _validate_against_targets(self, metrics: PerformanceMetrics, scenario: TestScenario) -> Dict[str, Any]:
        """
        Validate performance metrics against targets.
        
        Args:
            metrics: Performance metrics to validate
            scenario: Test scenario with targets
            
        Returns:
            Dict[str, Any]: Validation results
        """
        validation_result = {
            "meets_targets": True,
            "failures": [],
            "validations": {}
        }
        
        # Processing time validation
        target_time = scenario.target_time_seconds
        actual_time = metrics.duration_seconds
        time_meets_target = actual_time <= target_time
        validation_result["validations"]["processing_time"] = {
            "target": target_time,
            "actual": actual_time,
            "meets_target": time_meets_target
        }
        if not time_meets_target:
            validation_result["meets_targets"] = False
            validation_result["failures"].append("processing_time")
        
        # Memory usage validation  
        memory_target = self.performance_targets["memory_usage_peak"]["target"]
        memory_meets_target = metrics.memory_usage_peak <= memory_target
        validation_result["validations"]["memory_usage"] = {
            "target": memory_target,
            "actual": metrics.memory_usage_peak,
            "meets_target": memory_meets_target
        }
        if not memory_meets_target:
            validation_result["meets_targets"] = False
            validation_result["failures"].append("memory_usage")
        
        # Accuracy validation
        accuracy_target = scenario.expected_accuracy
        accuracy_meets_target = metrics.classification_accuracy >= accuracy_target
        validation_result["validations"]["accuracy"] = {
            "target": accuracy_target,
            "actual": metrics.classification_accuracy,
            "meets_target": accuracy_meets_target
        }
        if not accuracy_meets_target:
            validation_result["meets_targets"] = False
            validation_result["failures"].append("accuracy")
        
        return validation_result
    
    async def _save_results(self, results: Dict[str, PerformanceMetrics], filename: str):
        """Save test results to file"""
        results_dir = Path(self.config["results_dir"])
        file_path = results_dir / filename
        
        # Convert metrics to serializable format
        serializable_results = {
            name: asdict(metrics) for name, metrics in results.items()
        }
        
        # Handle datetime serialization
        for name, metrics_dict in serializable_results.items():
            if metrics_dict.get("timestamp"):
                metrics_dict["timestamp"] = metrics_dict["timestamp"].isoformat()
        
        with open(file_path, 'w') as f:
            json.dump(serializable_results, f, indent=2)
        
        self.logger.info(f"Results saved to {file_path}")
    
    async def generate_performance_report(self, results: Dict[str, PerformanceMetrics]) -> str:
        """
        Generate comprehensive performance report.
        
        Args:
            results: Performance test results
            
        Returns:
            str: Path to generated report
        """
        report_data = {
            "test_summary": {
                "total_tests": len(results),
                "passed_tests": sum(1 for m in results.values() if m.error_rate == 0.0),
                "failed_tests": sum(1 for m in results.values() if m.error_rate > 0.0),
                "report_timestamp": datetime.now().isoformat()
            },
            "performance_targets": self.performance_targets,
            "test_results": results,
            "system_info": self._get_system_info()
        }
        
        # Generate report file
        report_filename = f"performance_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        await self._save_results(results, report_filename)
        
        return str(Path(self.config["results_dir"]) / report_filename)
    
    async def cleanup_test_environment(self):
        """Clean up test environment"""
        try:
            await self.resource_monitor.stop_monitoring()
            await self.metrics_collector.cleanup()
            self.logger.info("Test environment cleanup completed")
        except Exception as e:
            self.logger.error(f"Error during cleanup: {e}")


# CLI interface for running performance tests
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="AI File Parser Performance Test Suite")
    parser.add_argument("--test-type", choices=["baseline", "benchmark", "all"], 
                       default="benchmark", help="Type of tests to run")
    parser.add_argument("--config-file", type=str, help="Configuration file path")
    parser.add_argument("--output-dir", type=str, default="./test_results", 
                       help="Output directory for results")
    
    args = parser.parse_args()
    
    async def main():
        # Initialize test suite
        config = None
        if args.config_file:
            with open(args.config_file) as f:
                config = json.load(f)
        
        if config is None:
            config = {}
        config["results_dir"] = args.output_dir
        
        suite = PerformanceTestSuite(config)
        
        # Setup test environment
        if not await suite.setup_test_environment():
            print("Failed to setup test environment")
            return
        
        try:
            if args.test_type in ["baseline", "all"]:
                print("Collecting baseline metrics...")
                baselines = await suite.collect_baseline_metrics()
                print(f"Baseline collection completed: {len(baselines)} scenarios")
            
            if args.test_type in ["benchmark", "all"]:
                print("Running performance benchmarks...")
                results = await suite.run_performance_benchmarks()
                report_path = await suite.generate_performance_report(results)
                print(f"Performance benchmarks completed. Report: {report_path}")
                
        finally:
            await suite.cleanup_test_environment()
    
    asyncio.run(main())