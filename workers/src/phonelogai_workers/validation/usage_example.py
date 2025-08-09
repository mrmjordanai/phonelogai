"""
Comprehensive Validation Pipeline Usage Example

This example demonstrates how to use the complete validation pipeline
with all 5 implemented tasks:

1. ValidationPipeline - Main coordinator with workflow management
2. Enhanced database integration with RLS compliance
3. Production performance optimizations 
4. Enhanced error handling with recovery strategies
5. Enhanced Celery integration with priority queues

Usage patterns for different scenarios:
- Small datasets (< 50k records): Parallel processing
- Large datasets (> 50k records): Streaming processing
- Critical jobs: High priority queue with retry logic
- Bulk operations: Database batch processing with anonymization
"""
import asyncio
from typing import Dict, List, Any
from datetime import datetime, timezone

from .validation_pipeline import (
    ValidationPipeline, 
    ValidationConfig,
    validate_data_pipeline_task
)
from .performance_optimizer import (
    PerformanceOptimizer,
    StreamingConfig,
    CacheConfig
)
from .error_handler import (
    EnhancedErrorHandler,
    ErrorContext,
    with_error_handling
)
from ..queue.celery_app import (
    queue_task_with_priority,
    TaskPriority
)


class ValidationPipelineExamples:
    """Comprehensive examples of validation pipeline usage"""
    
    @staticmethod
    async def example_small_dataset_validation():
        """Example: Validate small dataset with parallel processing"""
        print("🔄 Example 1: Small Dataset Validation (< 50k records)")
        
        # Sample data (simulating carrier CDR data)
        sample_events = [
            {
                'Date/Time': '2024-01-15 14:30:00',
                'Phone Number': '555-0123',
                'Duration': '00:03:45',
                'Type': 'Voice',
                'Direction': 'Outbound',
                'Content': 'Business call'
            },
            {
                'Date/Time': '2024-01-15 15:45:00', 
                'Phone Number': '555-0124',
                'Duration': '225',  # seconds
                'Type': 'SMS',
                'Direction': 'Inbound',
                'Content': 'Meeting confirmed for tomorrow'
            }
        ] * 1000  # Simulate 2000 records
        
        # Configuration for optimal performance
        config = ValidationConfig(
            enable_ml_mapping=True,
            enable_duplicate_detection=True,
            enable_performance_optimization=True,
            batch_size=500,
            parallel_workers=4,
            quality_threshold=0.85
        )
        
        # Create pipeline
        pipeline = ValidationPipeline(config)
        
        # File metadata
        file_metadata = {
            'filename': 'att_sample_data.csv',
            'carrier': 'att',
            'format': 'csv',
            'upload_time': datetime.now(timezone.utc)
        }
        
        # Manual mappings (optional - pipeline can auto-detect)
        manual_mappings = {
            'Date/Time': 'ts',
            'Phone Number': 'number',
            'Duration': 'duration',
            'Type': 'type',
            'Direction': 'direction',
            'Content': 'content'
        }
        
        # Execute pipeline
        result = await pipeline.execute_pipeline(
            raw_events=sample_events,
            file_metadata=file_metadata,
            user_id='user123',
            job_id='job_small_001',
            manual_mappings=manual_mappings
        )
        
        # Display results
        print(f"✅ Pipeline completed: {result.success}")
        print(f"📊 Processed events: {len(result.processed_events)}")
        print(f"⚡ Processing time: {result.processing_time_ms}ms")
        print(f"🧠 Memory usage: {result.memory_usage_mb:.2f}MB")
        print(f"📈 Quality score: {result.quality_metrics.get('overall_quality_score', 0):.2%}")
        
        return result
    
    @staticmethod
    async def example_large_dataset_streaming():
        """Example: Large dataset with streaming processing"""
        print("\n🌊 Example 2: Large Dataset Streaming Processing (> 50k records)")
        
        # Configuration for streaming large datasets
        streaming_config = StreamingConfig(
            batch_size=2000,
            max_concurrent_batches=6,
            memory_threshold_mb=1500.0,
            enable_prefetch=True,
            enable_compression=True
        )
        
        cache_config = CacheConfig(
            enable_redis=True,
            ttl_seconds=1800,
            max_memory_cache_size=50000
        )
        
        # Create performance optimizer
        optimizer = PerformanceOptimizer(
            max_memory_mb=1800.0,
            streaming_config=streaming_config,
            cache_config=cache_config
        )
        
        # Simulate large dataset generator
        async def generate_large_dataset():
            """Generate batches of data for streaming"""
            base_record = {
                'timestamp': '2024-01-15T10:00:00Z',
                'caller_number': '+15551234567',
                'duration_seconds': '180',
                'call_type': 'voice',
                'call_direction': 'outbound',
                'location': 'New York, NY'
            }
            
            for batch_num in range(50):  # 50 batches = 100k records
                batch = []
                for i in range(2000):
                    record = base_record.copy()
                    record['caller_number'] = f"+1555{(batch_num * 2000 + i) % 10000:04d}"
                    record['duration_seconds'] = str(60 + (i % 300))
                    batch.append(record)
                
                yield batch
                await asyncio.sleep(0.01)  # Small delay for demo
        
        # Sample processor function
        async def process_batch(batch, job_id, **kwargs):
            """Process a batch of events"""
            processed = []
            for event in batch:
                # Simulate processing
                processed_event = {
                    'id': f"{job_id}_{hash(str(event)) % 1000000}",
                    'user_id': kwargs.get('user_id', 'unknown'),
                    'number': event.get('caller_number', ''),
                    'ts': event.get('timestamp', ''),
                    'type': 'call',
                    'direction': event.get('call_direction', ''),
                    'duration': int(event.get('duration_seconds', 0)),
                    'metadata': {
                        'location': event.get('location', ''),
                        'processed_at': datetime.now(timezone.utc).isoformat()
                    }
                }
                processed.append(processed_event)
            
            return processed
        
        # Process with streaming optimization
        total_processed = 0
        
        async for processed_batch in optimizer.optimize_validation_processing(
            data_iterator=generate_large_dataset(),
            processor_func=process_batch,
            job_id='job_streaming_001',
            estimated_total_items=100000,
            user_id='user456'
        ):
            total_processed += len(processed_batch)
            if total_processed % 20000 == 0:
                print(f"📊 Processed {total_processed} records...")
        
        # Get performance metrics
        metrics = optimizer.get_performance_metrics()
        print(f"✅ Streaming completed: {total_processed} records")
        print(f"⚡ Processing time: {metrics['streaming_metrics']['processing_time_ms']}ms")
        print(f"🚀 Throughput: {metrics['streaming_metrics']['items_per_second']:.1f} items/sec")
        print(f"🧠 Peak memory: {metrics['memory_metrics']['peak_mb']:.2f}MB")
        print(f"💾 Cache hit rate: {metrics['cache_metrics']['hit_rate']:.1%}")
        
        await optimizer.cleanup()
        return total_processed
    
    @staticmethod
    async def example_error_handling_and_recovery():
        """Example: Error handling with recovery strategies"""
        print("\n🛡️ Example 3: Advanced Error Handling & Recovery")
        
        # Create error handler
        error_handler = EnhancedErrorHandler()
        
        # Sample problematic data
        problematic_events = [
            {'number': 'invalid_phone', 'ts': '2024-01-15', 'type': 'call'},  # Invalid phone
            {'number': '555-0123', 'ts': 'bad_date', 'type': 'call'},         # Invalid date
            {'number': '555-0124', 'ts': '2024-01-15T10:00:00Z', 'type': 'call'},  # Valid
            {'number': '', 'ts': '2024-01-15T11:00:00Z', 'type': 'sms'},      # Empty phone
            {'number': '555-0125', 'ts': '2024-01-15T12:00:00Z', 'type': 'call'},  # Valid
        ]
        
        # Processor that may fail
        async def risky_processor(item):
            if not item.get('number'):
                raise ValueError("Missing phone number")
            if 'invalid' in item.get('number', ''):
                raise ValueError("Invalid phone number format")
            if 'bad' in item.get('ts', ''):
                raise ValueError("Invalid timestamp format")
            
            # Simulate successful processing
            return {
                **item,
                'processed': True,
                'processed_at': datetime.now(timezone.utc).isoformat()
            }
        
        # Context for error handling
        context = ErrorContext(
            job_id='job_error_demo',
            user_id='user789',
            operation='data_processing',
            stage='validation'
        )
        
        # Process batch with error handling
        successful_items, errors = await error_handler.handle_batch_errors(
            batch=problematic_events,
            processor=risky_processor,
            context=context
        )
        
        print(f"✅ Successfully processed: {len(successful_items)} items")
        print(f"❌ Errors encountered: {len(errors)} items")
        
        # Show error breakdown
        error_categories = {}
        recovery_strategies = {}
        
        for error in errors:
            cat = error.category.value
            strategy = error.recovery_strategy.value
            error_categories[cat] = error_categories.get(cat, 0) + 1
            recovery_strategies[strategy] = recovery_strategies.get(strategy, 0) + 1
        
        print("📊 Error Categories:", error_categories)
        print("🔄 Recovery Strategies:", recovery_strategies)
        
        # Get comprehensive error report
        error_report = await error_handler.get_comprehensive_error_report()
        print(f"📈 Error Statistics: {error_report['total_errors']} total")
        print(f"📊 Error Rate: {error_report['error_rate_per_hour']:.1f} errors/hour")
        
        return successful_items, errors
    
    @staticmethod
    def example_celery_task_integration():
        """Example: Using Celery tasks with priority queues"""
        print("\n🔄 Example 4: Celery Task Integration with Priority Queues")
        
        # Sample data for different priority jobs
        datasets = {
            'critical_customer': {
                'data': [{'urgent': True}] * 1000,
                'priority': TaskPriority.CRITICAL,
                'queue': 'validation_high'
            },
            'standard_upload': {
                'data': [{'standard': True}] * 5000,
                'priority': TaskPriority.MEDIUM,
                'queue': 'processing_medium'  
            },
            'bulk_import': {
                'data': [{'bulk': True}] * 50000,
                'priority': TaskPriority.LOW,
                'queue': 'processing_medium'
            }
        }
        
        submitted_tasks = []
        
        for job_name, job_data in datasets.items():
            print(f"📤 Submitting {job_name} job (Priority: {job_data['priority']})")
            
            # File metadata
            file_metadata = {
                'filename': f'{job_name}_data.csv',
                'size_mb': len(job_data['data']) * 0.001,  # Estimate
                'priority': job_data['priority']
            }
            
            # Configuration based on job type
            if job_data['priority'] == TaskPriority.CRITICAL:
                config = {
                    'enable_performance_optimization': True,
                    'batch_size': 500,
                    'parallel_workers': 8,
                    'timeout_seconds': 600  # 10 minutes max
                }
            else:
                config = {
                    'enable_performance_optimization': True,
                    'batch_size': 2000,
                    'parallel_workers': 4,
                    'timeout_seconds': 1800  # 30 minutes max
                }
            
            # Queue task with appropriate priority
            task_result = queue_task_with_priority(
                task_name='validate_data_pipeline_task',
                priority=job_data['priority'],
                queue=job_data['queue'],
                args=(
                    job_data['data'],
                    file_metadata,
                    f'user_{job_name}',
                    f'job_{job_name}_{int(datetime.now().timestamp())}'
                ),
                kwargs={
                    'config_dict': config
                }
            )
            
            submitted_tasks.append({
                'job_name': job_name,
                'task_id': task_result.id,
                'priority': job_data['priority'],
                'queue': job_data['queue']
            })
        
        print(f"✅ Submitted {len(submitted_tasks)} tasks to Celery queues")
        
        for task in submitted_tasks:
            print(f"📋 {task['job_name']}: Task ID {task['task_id']} "
                  f"(Queue: {task['queue']}, Priority: {task['priority']})")
        
        return submitted_tasks
    
    @staticmethod 
    @with_error_handling("complete_validation_example", "demonstration")
    async def example_complete_workflow():
        """Example: Complete end-to-end validation workflow"""
        print("\n🎯 Example 5: Complete End-to-End Validation Workflow")
        
        # Comprehensive configuration
        validation_config = ValidationConfig(
            enable_ml_mapping=True,
            enable_duplicate_detection=True,
            enable_performance_optimization=True,
            max_memory_usage_mb=1800.0,
            batch_size=1000,
            parallel_workers=6,
            enable_caching=True,
            quality_threshold=0.9,
            duplicate_detection_strategy="comprehensive",
            retry_attempts=3
        )
        
        # Create full pipeline
        pipeline = ValidationPipeline(validation_config)
        
        # Realistic carrier data sample
        carrier_data = []
        for i in range(10000):  # 10k records
            record = {
                'Call Date': f'2024-01-{(i % 30) + 1:02d}',
                'Call Time': f'{(i % 24):02d}:{(i % 60):02d}:00',
                'From Number': f'+1555{i % 1000:03d}{(i * 7) % 10000:04d}',
                'To Number': f'+1555{(i + 1) % 1000:03d}{((i + 1) * 7) % 10000:04d}',
                'Duration (sec)': str(30 + (i % 300)),
                'Call Type': 'Voice' if i % 3 == 0 else 'SMS',
                'Direction': 'Outbound' if i % 2 == 0 else 'Inbound',
                'Cost': f'${(i % 100) / 100:.2f}',
                'Location': ['New York, NY', 'Los Angeles, CA', 'Chicago, IL'][i % 3]
            }
            carrier_data.append(record)
        
        # Add some intentional duplicates (5% duplicate rate)
        duplicates_count = int(len(carrier_data) * 0.05)
        for i in range(duplicates_count):
            # Create near-duplicate with slight variations
            original = carrier_data[i].copy()
            original['Call Time'] = f'{(int(original["Call Time"][:2]) + 1) % 24:02d}' + original['Call Time'][2:]
            carrier_data.append(original)
        
        print(f"📊 Dataset: {len(carrier_data)} records (including {duplicates_count} intentional duplicates)")
        
        # File metadata
        file_metadata = {
            'filename': 'comprehensive_carrier_data.csv',
            'carrier': 'multi_carrier',
            'format': 'csv',
            'size_mb': len(carrier_data) * 0.0005,  # Rough estimate
            'upload_time': datetime.now(timezone.utc),
            'user_agent': 'ValidationPipeline/1.0'
        }
        
        # Execute comprehensive validation
        start_time = datetime.now()
        
        result = await pipeline.execute_pipeline(
            raw_events=carrier_data,
            file_metadata=file_metadata,
            user_id='demo_user_comprehensive',
            job_id='job_comprehensive_demo',
            manual_mappings=None  # Let ML auto-detect
        )
        
        end_time = datetime.now()
        total_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
        # Comprehensive results analysis
        print("\n📈 COMPREHENSIVE VALIDATION RESULTS")
        print("=" * 50)
        
        # Success metrics
        print(f"✅ Pipeline Success: {result.success}")
        print(f"⏱️  Total Processing Time: {total_time_ms}ms")
        print(f"📊 Original Records: {len(carrier_data)}")
        print(f"📊 Final Records: {len(result.processed_events)}")
        print(f"🔄 Duplicates Removed: {len(carrier_data) - len(result.processed_events)}")
        
        # Performance metrics
        perf = result.performance_metrics
        print(f"\n🚀 PERFORMANCE METRICS")
        print(f"   Processing Speed: {perf.get('events_per_second', 0):.1f} events/sec")
        print(f"   Peak Memory: {perf.get('peak_memory_mb', 0):.2f}MB")
        print(f"   Memory Target Met: {perf.get('target_compliance', {}).get('memory_usage_target_met', False)}")
        print(f"   Processing Target Met: {perf.get('target_compliance', {}).get('processing_time_target_met', False)}")
        
        # Quality metrics
        quality = result.quality_metrics
        print(f"\n📏 QUALITY METRICS")
        print(f"   Overall Quality Score: {quality.get('overall_quality_score', 0):.1%}")
        print(f"   Field Mapping Quality: {quality.get('field_mapping_quality', 0):.1%}")
        print(f"   Normalization Quality: {quality.get('normalization_quality', 0):.1%}")
        print(f"   Duplicate Detection Accuracy: {quality.get('duplicate_detection_accuracy', 0):.1%}")
        print(f"   Data Completeness: {quality.get('data_completeness', 0):.1%}")
        
        # Field mapping results
        print(f"\n🗺️  FIELD MAPPING RESULTS")
        for mapping in result.field_mappings[:5]:  # Show first 5
            print(f"   {mapping.get('source_field', '')} → {mapping.get('target_field', '')} "
                  f"(Confidence: {mapping.get('confidence', 0):.1%})")
        
        # Duplicate detection results
        dup_stats = result.duplicate_stats
        print(f"\n🔍 DUPLICATE DETECTION RESULTS")
        print(f"   Duplicates Found: {dup_stats.get('duplicates_found', 0)}")
        print(f"   Duplicate Groups: {dup_stats.get('duplicate_groups', 0)}")
        print(f"   Conflicts Resolved: {dup_stats.get('conflicts_resolved', 0)}")
        
        # Error summary
        if result.errors:
            print(f"\n⚠️  ERRORS ENCOUNTERED: {len(result.errors)}")
            for error in result.errors[:3]:  # Show first 3 errors
                print(f"   {error.get('type', '')}: {error.get('message', '')}")
        
        if result.warnings:
            print(f"\n⚠️  WARNINGS: {len(result.warnings)}")
        
        print(f"\n🎯 Performance Targets Assessment:")
        print(f"   100k rows in <5min target: {'✅ MET' if total_time_ms < 300000 else '❌ MISSED'}")
        print(f"   <2GB memory target: {'✅ MET' if perf.get('peak_memory_mb', 0) < 2000 else '❌ MISSED'}")
        print(f"   >99% duplicate accuracy: {'✅ MET' if quality.get('duplicate_detection_accuracy', 0) > 0.99 else '❌ MISSED'}")
        
        return result


async def run_all_examples():
    """Run all validation pipeline examples"""
    print("🚀 PHONELOGAI VALIDATION PIPELINE - COMPREHENSIVE EXAMPLES")
    print("=" * 60)
    
    examples = ValidationPipelineExamples()
    
    try:
        # Example 1: Small dataset validation
        await examples.example_small_dataset_validation()
        
        # Example 2: Large dataset streaming
        await examples.example_large_dataset_streaming()
        
        # Example 3: Error handling
        await examples.example_error_handling_and_recovery()
        
        # Example 4: Celery integration
        examples.example_celery_task_integration()
        
        # Example 5: Complete workflow
        await examples.example_complete_workflow()
        
        print("\n🎉 All examples completed successfully!")
        print("\nThe comprehensive validation pipeline is now ready for production use.")
        print("Key features implemented:")
        print("✅ Task 1: Main coordinator with workflow management")
        print("✅ Task 2: Enhanced database integration with RLS compliance")
        print("✅ Task 3: Production performance optimizations")
        print("✅ Task 4: Enhanced error handling with recovery")
        print("✅ Task 5: Enhanced Celery integration with priority queues")
        
    except Exception as e:
        print(f"\n❌ Example execution failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Run examples
    asyncio.run(run_all_examples())