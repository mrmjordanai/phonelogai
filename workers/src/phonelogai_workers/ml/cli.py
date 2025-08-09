#!/usr/bin/env python3
"""
CLI tool for ML Layout Classification System

This provides a command-line interface for:
- Testing file classification
- Managing templates
- Running performance benchmarks
- Model validation and training
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Any

from .layout_classifier import layout_classifier
from .template_manager import template_manager
from .validation_suite import ml_validation_suite
from .performance_optimizer import performance_profiler


async def classify_file(args):
    """Classify a file using the ML system"""
    
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Error: File {file_path} does not exist")
        return 1
    
    # Read file content
    try:
        with open(file_path, 'rb') as f:
            file_data = f.read()
        
        # Convert to text for classification
        file_content = file_data.decode('utf-8', errors='ignore')
        
        print(f"Classifying file: {file_path.name}")
        print(f"File size: {len(file_data)} bytes")
        print("-" * 50)
        
        # Run classification
        classification = await layout_classifier.classify_layout(
            file_content=file_content,
            filename=file_path.name,
            job_id="cli_test"
        )
        
        # Print results
        print(f"Detected Format: {classification['detected_format']}")
        print(f"Carrier: {classification['carrier']}")
        print(f"Confidence: {classification['confidence']:.3f}")
        print(f"Requires Manual Mapping: {classification['requires_manual_mapping']}")
        print(f"Field Mappings: {len(classification['field_mappings'])}")
        
        if args.verbose:
            print("\\nField Mappings:")
            for mapping in classification['field_mappings']:
                print(f"  {mapping['source_field']} → {mapping['target_field']} ({mapping['confidence']:.3f})")
            
            if classification.get('analysis_details'):
                details = classification['analysis_details']
                print(f"\\nAnalysis Details:")
                print(f"  Format Confidence: {details.get('format_confidence', 'N/A'):.3f}")
                print(f"  Carrier Confidence: {details.get('carrier_confidence', 'N/A'):.3f}")
                print(f"  Detected Fields: {details.get('detected_fields', 0)}")
        
        # Save results if requested
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(classification, f, indent=2, default=str)
            print(f"\\nResults saved to: {args.output}")
        
        return 0
        
    except Exception as e:
        print(f"Error classifying file: {str(e)}")
        return 1


async def list_templates(args):
    """List available templates"""
    
    templates = template_manager.templates
    
    if not templates:
        print("No templates found.")
        return 0
    
    print(f"Found {len(templates)} template(s):")
    print("-" * 80)
    
    for template_id, template in templates.items():
        print(f"ID: {template_id}")
        print(f"Carrier: {template.carrier}")
        print(f"Format: {template.format_type}")
        print(f"Version: {template.version}")
        print(f"Confidence: {template.confidence:.3f}")
        print(f"Accuracy: {template.accuracy_score:.3f}")
        print(f"Usage Count: {template.usage_count}")
        print(f"Fields: {len(template.fields)}")
        print(f"Created: {template.created_at}")
        print(f"Updated: {template.last_updated}")
        
        if args.verbose:
            print("Fields:")
            for field in template.fields:
                print(f"  {field.source_name} → {field.target_field} ({field.confidence:.3f})")
        
        print("-" * 80)
    
    return 0


async def benchmark_performance(args):
    """Run performance benchmark"""
    
    print("Running performance benchmark...")
    print(f"Rows: {args.rows}")
    print("-" * 50)
    
    # Run validation suite performance test
    performance_results = await ml_validation_suite._validate_performance()
    
    print("Performance Results:")
    for test_name, result in performance_results.items():
        if hasattr(result, 'target_met'):
            status = "✓" if result.target_met else "✗"
            print(f"{test_name}: {status}")
            print(f"  Rows: {result.rows_processed}")
            print(f"  Time: {result.processing_time_ms}ms")
            print(f"  Throughput: {result.throughput_rows_per_sec:.1f} rows/sec")
            print(f"  Memory: {result.memory_peak_mb:.1f} MB")
            print()
    
    return 0


async def validate_models(args):
    """Validate ML models"""
    
    print("Validating ML models...")
    print("-" * 50)
    
    # Run model validation
    validation_results = await ml_validation_suite._validate_ml_models()
    
    print("Model Validation Results:")
    for model_name, result in validation_results.items():
        if hasattr(result, 'success') and result.success:
            print(f"{model_name}: ✓")
            print(f"  Accuracy: {result.accuracy:.3f}")
            print(f"  Precision: {result.precision:.3f}")
            print(f"  Recall: {result.recall:.3f}")
            print(f"  F1-Score: {result.f1_score:.3f}")
            print(f"  Time: {result.processing_time_ms}ms")
        else:
            error_msg = getattr(result, 'error_message', 'Unknown error')
            print(f"{model_name}: ✗ {error_msg}")
        print()
    
    return 0


async def retrain_models(args):
    """Retrain ML models"""
    
    print("Retraining ML models...")
    print("-" * 50)
    
    models_to_train = args.models if args.models else [
        "format_classifier",
        "carrier_classifier", 
        "field_mapper"
    ]
    
    for model_name in models_to_train:
        print(f"Training {model_name}...")
        try:
            layout_classifier._train_model(model_name)
            print(f"✓ {model_name} trained successfully")
        except Exception as e:
            print(f"✗ {model_name} training failed: {str(e)}")
    
    print("Model retraining completed.")
    return 0


def setup_parser():
    """Setup command line argument parser"""
    
    parser = argparse.ArgumentParser(
        description="ML Layout Classification System CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s classify --file sample.csv --verbose
  %(prog)s templates --list --verbose
  %(prog)s benchmark --rows 10000
  %(prog)s validate --models
  %(prog)s retrain --models format_classifier carrier_classifier
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Classify command
    classify_parser = subparsers.add_parser('classify', help='Classify a file')
    classify_parser.add_argument('--file', '-f', required=True, help='File to classify')
    classify_parser.add_argument('--output', '-o', help='Output file for results (JSON)')
    classify_parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    # Templates command
    templates_parser = subparsers.add_parser('templates', help='Manage templates')
    templates_parser.add_argument('--list', '-l', action='store_true', help='List templates')
    templates_parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    # Benchmark command
    benchmark_parser = subparsers.add_parser('benchmark', help='Run performance benchmark')
    benchmark_parser.add_argument('--rows', '-r', type=int, default=10000, 
                                 help='Number of rows to benchmark (default: 10000)')
    
    # Validate command
    validate_parser = subparsers.add_parser('validate', help='Validate ML models')
    validate_parser.add_argument('--models', '-m', action='store_true', 
                                help='Validate model accuracy')
    
    # Retrain command
    retrain_parser = subparsers.add_parser('retrain', help='Retrain ML models')
    retrain_parser.add_argument('--models', '-m', nargs='+', 
                               choices=['format_classifier', 'carrier_classifier', 'field_mapper'],
                               help='Models to retrain (default: all)')
    
    return parser


async def main():
    """Main CLI function"""
    
    parser = setup_parser()
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    try:
        if args.command == 'classify':
            return await classify_file(args)
        elif args.command == 'templates':
            if args.list:
                return await list_templates(args)
            else:
                print("No template action specified. Use --list to show templates.")
                return 1
        elif args.command == 'benchmark':
            return await benchmark_performance(args)
        elif args.command == 'validate':
            if args.models:
                return await validate_models(args)
            else:
                print("No validation target specified. Use --models to validate models.")
                return 1
        elif args.command == 'retrain':
            return await retrain_models(args)
        else:
            print(f"Unknown command: {args.command}")
            return 1
            
    except KeyboardInterrupt:
        print("\\nOperation cancelled by user")
        return 1
    except Exception as e:
        print(f"Error: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))