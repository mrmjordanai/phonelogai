# @phonelogai/data-ingestion

AI-powered data ingestion and file parsing system for PhoneLog AI platform.

## Overview

This package provides comprehensive file parsing, AI-powered layout classification, and ETL capabilities for processing carrier CDR files, billing statements, and other telecommunications data formats.

## Features

### Phase 1 - Core Infrastructure ✅
- **File Upload Handling**: Supports PDF, CSV, XLSX, XLS, JSON, TXT formats
- **Format Detection**: Intelligent MIME type and extension-based detection
- **Carrier Detection**: Automatic carrier identification from filename patterns
- **Job Tracking**: Real-time progress monitoring with WebSocket support
- **Database Integration**: Comprehensive job, error, and metrics tracking
- **Validation System**: Multi-level data validation with error reporting

### Phase 2 - AI/ML Components (Planned)
- **Layout Classification**: ML-based document structure detection
- **Feature Extraction**: Automated field mapping generation
- **OCR Integration**: Fallback text extraction for scanned documents
- **Confidence Scoring**: Reliability metrics for parsed data

### Phase 3 - Advanced Processing (Planned)
- **Multi-format Parsers**: Specialized parsers for each file type
- **Deduplication Engine**: Intelligent duplicate detection and merging
- **Data Normalization**: Phone number formatting, timezone handling
- **Privacy Application**: Automatic anonymization rule application

## Architecture

```
packages/data-ingestion/
├── src/
│   ├── types/           # TypeScript interfaces
│   ├── utils/           # File detection utilities
│   ├── parsers/         # File format parsers
│   ├── workers/         # Background job processing
│   ├── ml/              # ML models and inference (planned)
│   └── validation/      # Data validation rules (planned)
```

## Usage

### Basic File Upload

```typescript
import { FileUploadHandler } from '@phonelogai/data-ingestion';

const handler = new FileUploadHandler();

const response = await handler.handleFileUpload({
  file: fileBuffer,
  filename: 'carrier_statement.csv',
  mimetype: 'text/csv',
  size: fileBuffer.length,
  user_id: 'user-123',
  processing_config: {
    chunk_size: 1000,
    max_errors: 100,
    deduplication_enabled: true
  }
});

console.log(`Job created: ${response.job_id}`);
```

### Job Progress Tracking

```typescript
import { jobTracker } from '@phonelogai/data-ingestion';

// Monitor job progress
jobTracker.on('progressUpdated', (progress) => {
  console.log(`Job ${progress.job_id}: ${progress.progress}%`);
});

// Get current status
const status = await handler.getJobStatus(jobId, userId);
```

### CSV Parsing

```typescript
import { CsvParser } from '@phonelogai/data-ingestion';

const parser = new CsvParser(jobId, config, fieldMappings);
const result = await parser.parseFile(fileBuffer);

console.log(`Parsed ${result.events.length} events`);
console.log(`Extracted ${result.contacts.length} contacts`);
```

## Database Schema

The system creates several tables for comprehensive tracking:

- `ingestion_jobs` - Job status and metadata
- `layout_classifications` - ML model results
- `ingestion_errors` - Error tracking and debugging
- `processing_metrics` - Performance monitoring
- `carrier_templates` - Predefined format mappings
- `queue_jobs` - Background worker coordination

## Performance Targets

- **100k rows**: ≤5 minutes processing time
- **1M rows**: ≤30 minutes processing time  
- **File size**: Support up to 100MB files
- **Memory**: ≤2GB peak usage per worker
- **Throughput**: 1000 rows/second sustained

## Error Handling

The system provides comprehensive error handling:

- **File Format Errors**: Unsupported or corrupted files
- **Parsing Errors**: Invalid data structure or content
- **Validation Errors**: Data quality issues
- **Database Errors**: Constraint violations
- **System Errors**: Memory, timeout, or resource issues

## Supported Carriers

Currently supports automatic detection for:

- **AT&T**: Call detail records and billing statements
- **Verizon**: Wireless statements and usage reports
- **T-Mobile**: Billing data and call logs
- **Sprint**: Legacy format support (now T-Mobile)

## Configuration

```typescript
interface ProcessingConfig {
  chunk_size: number;          // Rows per processing batch
  max_errors: number;          // Maximum errors before failure
  skip_validation: boolean;    // Skip data validation
  deduplication_enabled: boolean;
  anonymization_enabled: boolean;
  batch_size: number;          // Database batch size
  timeout_minutes: number;     // Processing timeout
}
```

## API Integration

### REST Endpoints

```
POST /api/ingestion/upload        # Upload file for processing
GET  /api/ingestion/jobs/:id      # Get job status
POST /api/ingestion/jobs/:id/retry # Retry failed job
DELETE /api/ingestion/jobs/:id    # Delete job
```

### WebSocket Events

```
jobStarted       # Job processing begun
progressUpdated  # Progress percentage updated  
stepUpdated      # Processing step changed
errorAdded       # Error occurred during processing
jobCompleted     # Job finished (success/failure)
```

## Development

### Building

```bash
npm run build     # TypeScript compilation
npm run dev       # Watch mode development
npm run test      # Run test suite
npm run lint      # ESLint checking
```

### Testing

```bash
npm run test                    # All tests
npm run test -- --watch        # Watch mode
npm run test -- parser.test.ts # Specific test
```

## Roadmap

### Phase 2 (Weeks 2-3)
- [ ] ML layout classification model
- [ ] PDF text extraction with OCR
- [ ] Excel file parser
- [ ] Advanced field mapping

### Phase 3 (Weeks 3-4)  
- [ ] Deduplication engine
- [ ] Data quality scoring
- [ ] Privacy rule application
- [ ] Gap detection algorithms

### Phase 4 (Weeks 4-5)
- [ ] Performance optimization
- [ ] Horizontal scaling
- [ ] Monitoring and alerting
- [ ] Production deployment

## Contributing

1. Follow TypeScript best practices
2. Add comprehensive error handling
3. Include unit tests for new features
4. Update documentation
5. Performance test with large datasets

## License

Proprietary - PhoneLog AI Platform