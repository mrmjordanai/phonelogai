# Android Call/SMS Log Collection Implementation Plan

## Overview
Implementing a comprehensive Android call/SMS log collection system with proper permissions, offline-first architecture, and secure data synchronization for the PhoneLog AI mobile app.

## Current State Analysis

### Existing Mobile Architecture
- **React Native/Expo app** in `apps/mobile/`
- **Dependencies**: AsyncStorage, Supabase client, navigation, expo-permissions
- **Structure**: Basic screens, auth provider, navigation setup
- **Missing**: Native data collection, permissions management, offline sync

### Database Schema (from packages/types)
- **events**: Primary data table (id, user_id, line_id, ts, number, direction, type, duration, content, contact_id)
- **contacts**: Normalized contact information with aggregated statistics
- **sync_health**: Monitors synchronization status (source, last_sync, queue_depth, drift_percentage, status)
- **privacy_rules**: Controls visibility and anonymization per contact

## Implementation Strategy

### Phase 1: Foundation & Permissions (High Priority)
1. **Android Permissions Manager**
   - Create `src/services/PermissionsManager.ts`
   - Handle READ_CALL_LOG and READ_SMS permissions
   - Implement permission rationale explanations
   - Graceful handling of permission denials
   - Support for Android API level variations

2. **Platform Detection & Configuration**
   - Create `src/utils/PlatformDetector.ts`
   - Android vs iOS feature detection
   - Configuration constants for data collection
   - User messaging for platform differences

### Phase 2: Native Data Collection (High Priority)
1. **Android Native Modules**
   - Create `src/services/android/CallLogCollector.ts`
   - Create `src/services/android/SmsLogCollector.ts`
   - Use React Native's native module bridge if needed
   - Efficient data extraction from ContentResolver
   - Handle large datasets with pagination

2. **Data Normalization**
   - Create `src/services/DataNormalizer.ts`
   - Transform native Android data to Event schema
   - Handle contact resolution and deduplication
   - Privacy-aware data processing

### Phase 3: Offline-First Architecture (High Priority)
1. **AsyncStorage Queue System**
   - Create `src/services/OfflineQueue.ts`
   - UUID-based queue management
   - Batch operations for efficiency
   - Persistent queue across app restarts
   - Queue size limits and cleanup

2. **Conflict Resolution Engine**
   - Create `src/services/ConflictResolver.ts`
   - Composite key strategy: `(line_id, ts, number, direction, duration±1s)`
   - Server-side conflict detection
   - Merge strategies for duplicate events

### Phase 4: Sync Service (High Priority)
1. **Network-Aware Sync Service**
   - Create `src/services/SyncService.ts`
   - Wi-Fi preferred, cellular fallback
   - Exponential backoff for failures
   - Batch upload optimization
   - Background sync capabilities

2. **Data Encryption & Security**
   - Create `src/services/CryptoService.ts`
   - Local encryption before storage
   - Secure key management with Expo SecureStore
   - Privacy-compliant data handling

### Phase 5: Monitoring & User Experience (Medium Priority)
1. **Sync Health Dashboard**
   - Create `src/screens/SyncHealthScreen.tsx`
   - Real-time sync status display
   - Queue depth monitoring
   - Data gap detection visualization
   - Manual sync triggers

2. **Settings & Preferences**
   - Enhance `src/screens/SettingsScreen.tsx`
   - Sync frequency preferences
   - Data usage controls
   - Privacy settings per contact
   - Battery optimization settings

### Phase 6: Performance & Polish (Medium Priority)
1. **Performance Optimization**
   - Background processing for large datasets
   - UI responsiveness during data collection
   - Memory usage optimization
   - Battery usage monitoring

2. **Error Handling & User Feedback**
   - Comprehensive error handling
   - User-friendly error messages
   - Retry mechanisms
   - Progress indicators

## Technical Architecture

### Core Services Architecture
```
src/services/
├── PermissionsManager.ts      # Android permissions handling
├── DataCollectionService.ts   # Main orchestrator service
├── OfflineQueue.ts           # AsyncStorage queue management
├── SyncService.ts            # Network synchronization
├── ConflictResolver.ts       # Data conflict resolution
├── CryptoService.ts          # Encryption and security
└── android/
    ├── CallLogCollector.ts   # Android call log access
    └── SmsLogCollector.ts    # Android SMS log access
```

### Data Flow
1. **Collection**: Android native APIs → Data normalization → Local encryption
2. **Storage**: Encrypted data → AsyncStorage queue → Batch processing
3. **Sync**: Network detection → Conflict resolution → Supabase upload
4. **Monitoring**: Queue health → Sync status → User dashboard

### Conflict Resolution Strategy
- **Primary Key**: `(line_id, ts, number, direction, duration±1s)`
- **Resolution**: Server-side deduplication with client confirmation
- **Fallback**: Manual conflict resolution for unresolvable conflicts

## Technical Requirements

## Security & Privacy Considerations

### Data Protection
- **Local encryption** of sensitive data before AsyncStorage
- **Per-contact privacy rules** respected during collection
- **Anonymization** applied based on user preferences
- **Audit logging** for sensitive operations

### Permissions & Compliance
- **Minimal necessary permissions** with clear rationale
- **Graceful degradation** when permissions denied
- **User consent flows** for data collection
- **GDPR/CCPA compliance** considerations

## Performance Targets
- **App startup**: <3s on mid-range devices
- **Data collection**: Non-blocking UI during collection
- **Sync efficiency**: Batch uploads to minimize battery drain
- **Queue processing**: <100ms for queue operations

## Dependencies & Requirements

### New Dependencies Needed
```json
{
  "expo-file-system": "~15.4.0",        // File operations
  "expo-crypto": "~12.4.0",             // Encryption utilities
  "expo-network": "~5.4.0",             // Network status detection
  "expo-device": "~5.4.0",              // Device information
  "react-native-background-job": "^1.2.0" // Background processing
}
```

### Native Module Considerations
- **Expo managed workflow**: Prefer Expo APIs where possible
- **Native modules**: Only if necessary for call/SMS access
- **Platform-specific code**: Use Platform.select() for iOS/Android differences

### Privacy Considerations
- Clear user education about data collection
- Granular opt-out mechanisms per data type
- Local data encryption before sync
- Respect Android system privacy settings
- No collection of sensitive content without explicit consent

### Error Handling Strategy
- Graceful degradation when permissions denied
- Retry logic with exponential backoff
- Comprehensive error reporting without exposing PII
- User-friendly error messages with actionable steps

### Data Validation Rules
- Required fields: timestamp, number, direction, type
- Phone number format validation and normalization
- Duplicate detection using composite key: (line_id, ts, number, direction, duration±1s)
- Content sanitization for privacy compliance

### Android Version Compatibility
- Target Android API 33+ (Android 13)
- Backward compatibility to API 23 (Android 6.0)
- Handle API changes and deprecations
- Runtime permission model compliance

## Integration Points

### Existing Systems
- **AuthProvider**: User authentication state
- **AsyncStorage queue**: Offline data persistence
- **SyncHealth**: Collection status monitoring
- **Event/Contact types**: Data model compliance

### Background Processing
- Use Android WorkManager for scheduled collection
- Respect Android battery optimization settings
- Implement proper lifecycle management
- Handle app backgrounding and foregrounding

### User Experience
- Progressive permission requests with education
- Collection status indicators in settings
- Data privacy controls per contact
- Clear opt-out mechanisms

## iOS Compatibility Strategy
- **Manual file import only** (no on-device log access)
- **File picker integration** for carrier data uploads
- **Shared sync service** for uploaded data
- **Clear platform messaging** about feature differences

## Testing Strategy
- **Unit tests** for core services and utilities
- **Integration tests** for sync workflows
- **Permission testing** on various Android versions
- **Performance testing** with large datasets
- **Privacy compliance testing**

## Rollout Plan
1. **Phase 1-2**: Core permissions and data collection
2. **Phase 3-4**: Offline sync implementation
3. **Phase 5**: User experience and monitoring
4. **Phase 6**: Performance optimization and polish

## Risk Mitigation
- **Permission denials**: Graceful fallback to manual import
- **Network failures**: Robust offline queue with retry logic
- **Data conflicts**: Comprehensive conflict resolution
- **Performance issues**: Background processing and optimization
- **Privacy concerns**: Transparent consent and control mechanisms

## Success Metrics
- **Permission grant rate**: >80% for call/SMS permissions
- **Sync success rate**: >95% for queue processing
- **Performance**: <3s app startup, 60fps UI during collection
- **User satisfaction**: Positive feedback on sync reliability
- **Data quality**: <1% duplicate events after conflict resolution

This plan provides a comprehensive roadmap for implementing Android call/SMS log collection with offline-first architecture while maintaining security, performance, and user experience standards.