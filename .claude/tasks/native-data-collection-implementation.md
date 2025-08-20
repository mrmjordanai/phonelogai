# Native Data Collection Implementation Plan

## Overview
Implement both Android native data collection and iOS file import systems for the PhoneLog AI mobile app. This involves creating React Native bridge modules and platform-specific implementations for real-world data collection.

## Current Status Analysis

### ✅ Excellent Foundation Already Exists
- **TypeScript Interfaces**: Complete and well-designed interfaces for Android collectors
- **Service Architecture**: Singleton services with AsyncStorage persistence  
- **Permission Management**: Comprehensive PermissionsManager with Android-specific handling
- **Platform Detection**: PlatformDetector with capability-based feature detection
- **Error Handling**: Robust error boundaries and user feedback systems
- **Offline Queue**: Complete offline-first architecture with sync capabilities

### 🚧 Missing Components (To Be Implemented)
- **Native Bridge Modules**: React Native modules to access Android ContentResolver
- **Expo Config**: Custom development build configuration for native modules
- **Android Native Code**: Java/Kotlin implementation for actual data collection  
- **iOS File Import**: Document picker integration with progress tracking
- **Real Data Integration**: Connect native modules to existing TypeScript services

## PRIORITY A: ANDROID NATIVE DATA COLLECTION

### 1. Expo Configuration Setup

**Files to Modify:**
- `apps/mobile/app.json` → `apps/mobile/app.config.js` (dynamic config)
- `apps/mobile/package.json` (new dependencies)

**Key Changes:**
- Configure for Expo development build with custom native modules
- Add enhanced Android permissions with usage descriptions
- Set up proper plugin configuration for custom modules

**New Dependencies:**
- `expo-modules-core` for native module development
- `expo-dev-client` for development builds
- Enhanced Android permissions in manifest

### 2. React Native Bridge Modules

**New Files to Create:**
- `apps/mobile/modules/CallLogModule/` - Native call log bridge
- `apps/mobile/modules/SmsLogModule/` - Native SMS log bridge  
- `apps/mobile/modules/PermissionsModule/` - Enhanced permissions bridge

**Module Structure:**
```
modules/
├── CallLogModule/
│   ├── android/
│   │   └── src/main/java/expo/modules/calllog/
│   │       ├── CallLogModule.kt
│   │       ├── CallLogRecord.kt
│   │       └── CallLogContentResolver.kt
│   ├── ios/ (placeholder - not implemented)
│   ├── src/
│   │   ├── CallLogModule.ts
│   │   └── CallLogModule.types.ts
│   └── expo-module.config.json
└── SmsLogModule/
    ├── android/
    ├── src/
    └── expo-module.config.json
```

**Features per Module:**
- **CallLogModule**: Access CallLog.Calls ContentProvider with cursor pagination
- **SmsLogModule**: Access Telephony.Sms ContentProvider with thread support
- **PermissionsModule**: Enhanced permission handling with rationale dialogs

### 3. Android Native Implementation (Java/Kotlin)

**CallLogModule.kt Features:**
- Cursor-based pagination for large datasets
- Date range filtering with proper SQL selection
- Phone number normalization and formatting
- Content observer for real-time change detection
- Memory-efficient batch processing
- Error handling with detailed exception reporting

**SmsLogModule.kt Features:**  
- Thread-based SMS organization
- Content vs metadata-only collection (privacy)
- Support for all SMS types (inbox, sent, draft, etc.)
- Real-time change detection for DAR (Deleted Activity Recovery)
- Batch processing with configurable limits

**Security Considerations:**
- Runtime permission checks before data access
- Secure data handling with minimal memory footprint
- Content URI validation and sanitization
- Rate limiting to prevent abuse

### 4. Integration with Existing Services

**Files to Update:**
- `apps/mobile/src/services/android/CallLogCollector.ts` - Replace mock with native calls
- `apps/mobile/src/services/android/SmsLogCollector.ts` - Replace mock with native calls
- `apps/mobile/src/services/PermissionsManager.ts` - Add native permission enhancements
- `apps/mobile/src/services/DataCollectionService.ts` - Enable real Android collection

**Integration Points:**
- Replace `fetchRawCallLog()` placeholder with actual native module calls
- Replace `fetchRawSmsLog()` placeholder with actual native module calls
- Add real-time change listeners for background collection
- Integrate with existing conflict resolution and offline queue systems

## PRIORITY B: iOS FILE IMPORT SYSTEM

### 1. File Picker Integration

**New Dependencies:**
- `expo-document-picker` for carrier file selection
- `expo-file-system` for file validation and processing
- `@react-native-async-storage/async-storage` for upload queue

**Supported File Formats:**
- **CSV**: Direct parsing with carrier format detection
- **PDF**: Text extraction for carrier statements  
- **Excel**: .xlsx/.xls file processing
- **ZIP**: Archive extraction for bulk carrier data
- **JSON**: Manual export files

### 2. Upload Progress and Validation System

**New Files:**
- `apps/mobile/src/services/ios/FileImportService.ts` - Main import coordinator
- `apps/mobile/src/services/ios/UploadProgressManager.ts` - Progress tracking
- `apps/mobile/src/components/FileImport/UploadProgress.tsx` - UI components
- `apps/mobile/src/components/FileImport/FileValidation.tsx` - Validation UI

**Features:**
- Real-time upload progress with cancellation support
- File validation with size/format checks  
- Background upload with app state persistence
- Error handling with retry mechanisms
- Integration with existing ETL pipeline

### 3. ETL Pipeline Integration

**Integration Points:**
- Connect to existing `@phonelogai/data-ingestion` package
- Use existing multi-format parsers and ML-powered field mapping
- Integrate with conflict resolution system for imported data
- Connect to sync health monitoring for import status

**Files to Update:**
- `apps/mobile/src/services/SyncEngine.ts` - Add iOS file import sync
- `apps/mobile/src/services/DataCollectionService.ts` - iOS collection methods
- `apps/mobile/src/screens/EventsScreen/` - File import UI integration

## TECHNICAL IMPLEMENTATION DETAILS

### Development Build Requirements

**Expo EAS Configuration:**
- Set up `eas.json` for development builds
- Configure Android build profiles with native modules
- Set up iOS build profiles for file import capabilities
- Environment-specific configurations for testing

### Performance Optimization

**Android Optimization:**
- Cursor-based pagination (1000 records per batch)
- Background thread processing with progress callbacks
- Memory-efficient data structures (avoid loading all at once)
- Content observer debouncing to prevent excessive updates

**iOS Optimization:**
- Streaming file uploads with chunked processing
- Background task management for large file imports
- Progress caching for app state restoration
- Efficient file validation without full load

### Error Handling Strategy

**Comprehensive Error Coverage:**
- Native module initialization failures
- Permission denial scenarios with user guidance
- Network failures during sync operations  
- File format validation with helpful messages
- Memory pressure handling with graceful degradation

### Testing Strategy

**Unit Testing:**
- Mock native modules for TypeScript service testing
- Isolated testing of data transformation functions
- Permission state management testing
- Error handling scenario coverage

**Integration Testing:**
- End-to-end data collection workflows
- File import with various carrier formats
- Sync health monitoring with real data
- Conflict resolution with mixed data sources

## EXPECTED DELIVERABLES

### Phase 1: Android Native Collection (Week 1-2)
1. **Expo configuration** with development build setup
2. **Native modules** (CallLog + SMS) with full Android implementation
3. **Updated TypeScript services** using real native calls
4. **Testing utilities** for Android data collection verification
5. **Permission handling** with enhanced user experience

### Phase 2: iOS File Import System (Week 2-3)  
1. **File picker integration** with multi-format support
2. **Upload progress system** with background processing
3. **ETL pipeline integration** with existing data-ingestion package
4. **UI components** for file import workflows
5. **Error handling** with user-friendly messaging

### Phase 3: Integration & Testing (Week 3-4)
1. **Cross-platform testing** on Android and iOS devices
2. **Performance optimization** for large datasets
3. **Documentation** for setup and usage
4. **Conflict resolution testing** with mixed data sources
5. **Production deployment** configuration

## SUCCESS CRITERIA

### Functional Requirements
- ✅ Android: Collect call/SMS logs with proper permissions
- ✅ iOS: Import carrier files with progress tracking  
- ✅ Both: Integrate with existing offline queue and sync systems
- ✅ Both: Maintain excellent error handling and user experience

### Performance Requirements
- **Android**: Collect 10k+ records in <30 seconds
- **iOS**: Import 100MB files with real-time progress
- **Both**: Memory usage <50MB during data collection
- **Both**: UI responsiveness maintained during background operations

### Quality Requirements  
- **Type Safety**: Full TypeScript coverage with native module types
- **Error Handling**: Comprehensive error boundaries with user guidance
- **Testing**: >85% code coverage for new components
- **Documentation**: Setup guides for development and production

This implementation will enable real-world data collection on both platforms while maintaining the excellent existing architecture and user experience standards.