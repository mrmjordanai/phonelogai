"""
Test runner for ML layout classification system

This script runs comprehensive tests and validation for the ML system:
- Model accuracy validation
- Performance benchmarking
- Template system testing
- Integration testing
- Generate performance reports
"""

import asyncio
import argparse
import json
from pathlib import Path
from datetime import datetime
import structlog

from .validation_suite import ml_validation_suite
from .layout_classifier import layout_classifier
from .template_manager import template_manager
from .performance_optimizer import performance_profiler
from ..config import settings

logger = structlog.get_logger(__name__)


async def main():
    """Main test runner function"""
    
    parser = argparse.ArgumentParser(description="ML Layout Classification System Test Runner")
    parser.add_argument("--test-type", choices=["all", "models", "templates", "performance", "integration"], 
                       default="all", help="Type of tests to run")
    parser.add_argument("--output-file", type=str, default=None, 
                       help="Output file for test results (JSON format)")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    
    args = parser.parse_args()
    
    # Configure logging
    if args.verbose:
        import logging
        logging.basicConfig(level=logging.INFO)
    
    logger.info("Starting ML Layout Classification System Tests")
    logger.info(f"Test type: {args.test_type}")
    
    try:
        # Run specified tests
        if args.test_type == "all":
            results = await ml_validation_suite.run_full_validation_suite()
        elif args.test_type == "models":
            results = {"model_validation": await ml_validation_suite._validate_ml_models()}
        elif args.test_type == "templates":
            results = {"template_validation": await ml_validation_suite._validate_template_system()}
        elif args.test_type == "performance":
            results = {"performance_validation": await ml_validation_suite._validate_performance()}
        elif args.test_type == "integration":
            results = {"integration_tests": await ml_validation_suite._run_integration_tests()}
        
        # Add metadata
        results["test_metadata"] = {
            "test_type": args.test_type,
            "timestamp": datetime.now().isoformat(),
            "settings": {
                "model_cache_dir": str(settings.model_cache_dir),
                "max_memory_usage_mb": settings.max_memory_usage_mb,
                "target_100k_processing_time_seconds": settings.target_100k_processing_time_seconds,
                "target_1m_processing_time_seconds": settings.target_1m_processing_time_seconds
            }
        }
        
        # Print summary
        print_test_summary(results)
        
        # Save results to file if specified
        if args.output_file:
            save_results_to_file(results, args.output_file)
            logger.info(f"Results saved to {args.output_file}")
        
        # Generate recommendations
        if "recommendations" in results:
            print("\\n" + "="*60)
            print("RECOMMENDATIONS")
            print("="*60)
            for i, rec in enumerate(results["recommendations"], 1):
                print(f"{i}. {rec}")
        
        # Return exit code based on overall success
        overall_score = results.get("overall_score", 0.0)
        if overall_score >= 0.8:
            logger.info("All tests passed with good scores!")
            return 0
        elif overall_score >= 0.6:
            logger.warning("Tests passed but with room for improvement")
            return 1
        else:
            logger.error("Tests failed or performed poorly")
            return 2
            
    except Exception as e:
        logger.error(f"Test runner failed: {str(e)}")
        return 3


def print_test_summary(results: dict):
    """Print formatted test summary"""
    
    print("\\n" + "="*60)
    print("ML LAYOUT CLASSIFICATION SYSTEM - TEST RESULTS")
    print("="*60)
    
    # Overall score
    overall_score = results.get("overall_score", 0.0)
    print(f"Overall Score: {overall_score:.2f}/1.00 ({overall_score*100:.1f}%)")
    
    # Execution time
    exec_time = results.get("total_execution_time_seconds", 0)
    print(f"Total Execution Time: {exec_time:.1f} seconds")
    
    print("\\n" + "-"*60)
    
    # Model validation results
    if "model_validation" in results:
        print("MODEL VALIDATION RESULTS:")
        model_results = results["model_validation"]
        
        for model_name, result in model_results.items():
            if hasattr(result, 'success') and result.success:
                print(f"  {model_name:20}: ✓ Accuracy: {result.accuracy:.3f}, Precision: {result.precision:.3f}, Recall: {result.recall:.3f}")
            else:
                error_msg = getattr(result, 'error_message', 'Unknown error')
                print(f"  {model_name:20}: ✗ Error: {error_msg}")
    
    # Template validation results
    if "template_validation" in results:
        print("\\nTEMPLATE SYSTEM VALIDATION:")
        template_results = results["template_validation"]
        
        for test_name, success in template_results.items():
            if test_name not in ["overall_success", "errors"]:
                status = "✓" if success else "✗"
                print(f"  {test_name.replace('_', ' ').title():25}: {status}")
        
        if template_results.get("errors"):
            print("  Errors:")
            for error in template_results["errors"]:
                print(f"    - {error}")
    
    # Performance validation results
    if "performance_validation" in results:
        print("\\nPERFORMANCE VALIDATION:")
        perf_results = results["performance_validation"]
        
        for test_name, result in perf_results.items():
            if hasattr(result, 'target_met'):
                status = "✓" if result.target_met else "✗"
                throughput = result.throughput_rows_per_sec
                memory = result.memory_peak_mb
                print(f"  {test_name.replace('_', ' ').title():20}: {status} {throughput:.0f} rows/sec, {memory:.1f} MB peak")
    
    # Integration test results
    if "integration_tests" in results:
        print("\\nINTEGRATION TESTS:")
        integration_results = results["integration_tests"]
        
        for test_name, success in integration_results.items():
            if test_name not in ["overall_success", "errors"]:
                status = "✓" if success else "✗"
                print(f"  {test_name.replace('_', ' ').title():25}: {status}")
        
        if integration_results.get("errors"):
            print("  Errors:")
            for error in integration_results["errors"]:
                print(f"    - {error}")


def save_results_to_file(results: dict, filename: str):
    """Save test results to JSON file"""
    
    # Convert any non-serializable objects
    serializable_results = _make_serializable(results)
    
    output_path = Path(filename)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(serializable_results, f, indent=2, default=str)


def _make_serializable(obj):
    """Make object JSON serializable"""
    
    if hasattr(obj, '__dict__'):
        # Convert dataclass or object to dict
        return {key: _make_serializable(value) for key, value in obj.__dict__.items()}
    elif isinstance(obj, dict):
        return {key: _make_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [_make_serializable(item) for item in obj]
    elif isinstance(obj, tuple):
        return [_make_serializable(item) for item in obj]
    else:
        # Try to convert to string if not serializable
        try:
            json.dumps(obj)
            return obj
        except (TypeError, ValueError):
            return str(obj)


def run_quick_smoke_test():
    """Run a quick smoke test to verify basic functionality"""
    
    print("Running quick smoke test...")
    
    try:
        # Test 1: Model loading
        print("1. Testing model loading...", end=" ")
        if hasattr(layout_classifier, 'models') and layout_classifier.models:
            print("✓")
        else:
            print("✗ - Models not loaded")
            return False
        
        # Test 2: Template manager
        print("2. Testing template manager...", end=" ")
        if hasattr(template_manager, 'templates'):
            print("✓")
        else:
            print("✗ - Template manager not initialized")
            return False
        
        # Test 3: Performance optimizer
        print("3. Testing performance optimizer...", end=" ")
        if hasattr(performance_profiler, 'profiles'):
            print("✓")
        else:
            print("✗ - Performance profiler not initialized")
            return False
        
        print("✓ Smoke test passed!")
        return True
        
    except Exception as e:
        print(f"✗ Smoke test failed: {str(e)}")
        return False


if __name__ == "__main__":
    # Run smoke test first
    if not run_quick_smoke_test():
        exit(1)
    
    # Run full tests
    exit(asyncio.run(main()))