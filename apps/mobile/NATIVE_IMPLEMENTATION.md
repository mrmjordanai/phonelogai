# Native Data Collection Implementation

This document outlines the implementation of native data collection for Android and iOS file import systems in the PhoneLog AI mobile app.

## Overview

The implementation provides two distinct data collection approaches:

- **Android**: Native call/SMS log collection using ContentResolver access
- **iOS**: Manual file import system using DocumentPicker with carrier data files

## Architecture

### Android Native Implementation

#### Native Modules Structure
```
modules/
├── CallLogModule/
│   ├── android/src/main/java/expo/modules/calllog/
│   │   └── CallLogModule.kt
│   ├── src/
│   │   ├── CallLogModule.ts
│   │   └── CallLogModule.types.ts
│   └── expo-module.config.json
└── SmsLogModule/
    ├── android/src/main/java/expo/modules/smslog/
    │   └── SmsLogModule.kt
    ├── src/
    │   ├── SmsLogModule.ts
    │   └── SmsLogModule.types.ts
    └── expo-module.config.json
```

#### Key Features

**CallLogModule**:
- Direct access to Android `CallLog.Calls` ContentProvider
- Cursor-based pagination for efficient memory usage
- Real-time change detection with ContentObserver
- Comprehensive metadata extraction (contacts, duration, type, etc.)
- Configurable date range and phone number filtering

**SmsLogModule**:
- Access to Android `Telephony.Sms` ContentProvider
- Privacy-focused design with optional content inclusion
- Thread-based SMS organization support
- All SMS types supported (inbox, sent, draft, outbox, failed, queued)
- Real-time change detection for Deleted Activity Recovery (DAR)

#### Permission Handling
- Runtime permission checking before data access
- Secure data handling with minimal memory footprint
- Integration with existing `PermissionsManager` service
- User-friendly permission rationale dialogs

### iOS File Import Implementation

#### Service Structure
```
src/services/ios/
└── FileImportService.ts

src/components/FileImport/
├── FileImportButton.tsx
├── UploadProgress.tsx
└── FileImportScreen.tsx
```

#### Key Features

**File Support**:
- CSV, PDF, Excel (.xls/.xlsx), JSON, ZIP formats
- File validation with format detection
- Size limits (100MB default) with user feedback
- Estimated row counting for CSV files

**Upload Management**:
- Real-time progress tracking with cancellation support
- Background upload persistence across app states
- Chunked upload for large files
- Error handling with retry mechanisms

**User Experience**:
- Native DocumentPicker integration
- Progress indicators with time estimates
- Comprehensive error messaging
- File validation warnings and confirmations

## Configuration

### Expo Configuration (app.config.js)

```javascript
export default {
  expo: {
    plugins: [
      "expo-dev-client",        // Required for custom native modules
      "expo-contacts",
      "expo-document-picker",   // iOS file import
      "expo-modules-core"       // Native module support
    ],
    android: {
      permissions: [
        "READ_CALL_LOG",
        "READ_SMS", 
        "READ_CONTACTS",
        "READ_PHONE_STATE"
      ]
    },
    ios: {
      infoPlist: {
        NSDocumentPickerUsageDescription: "Import carrier data files",
        NSPhotoLibraryUsageDescription: "Import files from photo library"
      }
    }
  }
}
```

### Build Configuration (eas.json)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    }
  }
}
```

## Setup Instructions

### Prerequisites

1. **Expo CLI**: `npm install -g @expo/cli`
2. **EAS CLI**: `npm install -g eas-cli`
3. **Android Studio** (for Android development)
4. **Xcode** (for iOS development)

### Development Build Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Create Development Build**:
   ```bash
   eas build --profile development --platform android
   eas build --profile development --platform ios
   ```

3. **Install Development Build** on device/emulator

4. **Start Development Server**:
   ```bash
   npx expo start --dev-client
   ```

### Android Setup

1. **Enable Developer Options** on Android device
2. **Enable USB Debugging**
3. **Connect device** and ensure it's recognized:
   ```bash
   adb devices
   ```
4. **Grant permissions** when app launches

### iOS Setup

1. **Install development build** on iOS device via TestFlight or direct install
2. **Launch app** and test file import functionality
3. **Test with sample carrier files** (CSV, PDF format)

## Usage Examples

### Android Native Data Collection

```typescript
import { CallLogCollector } from './services/android/CallLogCollector';
import { SmsLogCollector } from './services/android/SmsLogCollector';

// Collect recent call logs
const callLogs = await CallLogCollector.collectCallLog({
  limit: 100,
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
});

// Collect SMS metadata (privacy-safe)
const smsMetadata = await SmsLogCollector.collectSmsMetadata({
  limit: 50,
  includeContent: false // Privacy-focused collection
});

// Batch processing for large datasets
for await (const batch of CallLogCollector.collectCallLogBatches({ 
  batchSize: 100 
})) {
  // Process batch
  console.log(`Processing ${batch.length} call log entries`);
}
```

### iOS File Import

```typescript
import { FileImportService } from './services/ios/FileImportService';

// Pick carrier data files
const files = await FileImportService.pickFiles({
  allowMultipleSelection: true,
  maxFileSize: 100 * 1024 * 1024 // 100MB
});

// Validate selected files
for (const file of files) {
  const validation = await FileImportService.validateFile(file);
  if (validation.isValid) {
    // Upload with progress tracking
    await FileImportService.uploadFile(file, (progress) => {
      console.log(`Upload progress: ${progress.progress}%`);
    });
  }
}
```

## Testing

### Automated Testing

Run the comprehensive test suite:

```typescript
import { DataCollectionTester } from './utils/DataCollectionTester';

// Run all tests
const results = await DataCollectionTester.runAllTests();

// Quick development test
await DataCollectionTester.runQuickTest();
```

### Manual Testing

1. **Use TestScreen** component for interactive testing
2. **Verify permissions** are properly requested and granted
3. **Test data collection** with various filters and options
4. **Test file import** with different file types and sizes
5. **Verify error handling** with invalid files and network issues

### Test Coverage

- ✅ Platform detection and capability checking
- ✅ Permission management and user flow
- ✅ Android call log collection with filtering
- ✅ Android SMS collection with privacy controls
- ✅ iOS file import with validation
- ✅ Error handling and edge cases
- ✅ Performance with large datasets

## Performance Considerations

### Android Optimization

- **Cursor Pagination**: Process data in batches of 100-1000 records
- **Background Processing**: Use AsyncStorage queue for large operations
- **Memory Management**: Cursor-based iteration to avoid loading all data
- **Content Observer Debouncing**: Prevent excessive change notifications

### iOS Optimization

- **Streaming Uploads**: Chunked file processing for large files
- **Background Tasks**: Maintain uploads during app backgrounding
- **Progress Caching**: Persist upload state across app restarts
- **File Validation**: Quick format detection without full file reads

### Target Performance Metrics

- **Android Collection**: 10k+ records in <30 seconds
- **iOS Upload**: 100MB files with real-time progress
- **Memory Usage**: <50MB during data collection operations
- **UI Responsiveness**: 60fps maintained during background operations

## Security & Privacy

### Data Protection

- **Minimal Permissions**: Request only necessary permissions with clear rationale
- **Local Encryption**: Sensitive data encrypted before storage/transmission
- **Privacy Controls**: Per-contact privacy rules integrated
- **Secure Transmission**: HTTPS with certificate pinning for uploads

### Privacy Features

- **Content-Optional SMS**: Collect metadata without message content
- **Contact Anonymization**: Privacy rules applied at collection time
- **Audit Logging**: Track all data access for compliance
- **User Consent**: Clear disclosure and opt-in for data collection

## Troubleshooting

### Common Issues

1. **"Module not found" errors**: Ensure development build includes native modules
2. **Permission denied**: Check Android permissions are properly requested
3. **File upload failures**: Verify network connectivity and file size limits
4. **iOS simulator limitations**: File import testing requires physical device

### Debug Tools

- **TestScreen**: Interactive testing interface
- **DataCollectionTester**: Automated test runner
- **Console Logging**: Comprehensive error reporting
- **Network Inspector**: Monitor file upload requests

### Build Issues

- **Clean and Rebuild**: `expo prebuild --clean` for module changes
- **Native Module Changes**: Require new development build
- **Permission Changes**: Update app.config.js and rebuild
- **Dependency Conflicts**: Verify Expo SDK compatibility

## Production Deployment

### Pre-deployment Checklist

- [ ] All tests passing on target devices
- [ ] Permission flows tested with real users
- [ ] File upload tested with various carrier formats
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Privacy compliance verified

### Monitoring

- **Error Tracking**: Comprehensive error reporting for native modules
- **Performance Metrics**: Upload success rates and collection times
- **User Feedback**: Permission denial rates and user flow completion
- **System Health**: Memory usage and crash reporting

## Future Enhancements

### Planned Features

- **Enhanced iOS Native Access**: Future iOS API changes
- **Background Sync Optimization**: Improved battery efficiency
- **ML-Powered File Parsing**: Carrier format auto-detection
- **Real-time Conflict Resolution**: Immediate duplicate handling
- **Advanced Privacy Controls**: Granular data sharing options

### Architecture Improvements

- **Stream Processing**: Real-time data processing pipelines
- **Edge Computing**: Local ML for sensitive data processing
- **Progressive Web App**: Web-based file import fallback
- **Multi-platform Sync**: Cross-device data synchronization

This implementation provides a robust foundation for cross-platform data collection while respecting platform limitations and user privacy preferences.