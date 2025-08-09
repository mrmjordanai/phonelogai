# Conflict Resolution System Implementation Plan

## Overview
This plan outlines the implementation of a robust conflict resolution system for duplicate events in the Call/SMS Intelligence Platform mobile app. The system will handle data integrity during multi-source sync operations.

## Architecture Analysis

### Current Database Schema Insights
From the database schema analysis:
- **Composite unique constraint**: `UNIQUE(user_id, line_id, ts, number, direction, duration)` in events table
- **Source tracking**: `source` field supports 'carrier', 'device', 'manual'
- **Metadata storage**: JSONB fields for extensible data storage
- **Time-series indexing**: Optimized for ts-based queries

### Key Technical Constraints
1. **Mobile memory limits**: Must handle large datasets efficiently
2. **Offline-first**: Conflicts may arise during offline/online sync
3. **Real-time processing**: Conflicts detected during active data collection
4. **Composite key deduplication**: Based on (line_id, ts, number, direction, duration±1s)
5. **Multi-source priority**: carrier > device > manual

## Implementation Strategy

### Phase 1: Core Infrastructure (High Priority)

#### 1.1 TypeScript Types & Interfaces (`apps/mobile/src/sync/types.ts`)
```typescript
// Core conflict types
interface ConflictEvent {
  original: Event;
  duplicate: Event;
  conflictType: 'exact' | 'fuzzy' | 'time_variance';
  similarity: number;
  sources: DataSource[];
}

interface ResolutionStrategy {
  type: 'automatic' | 'manual' | 'merge';
  priority: number;
  rules: ResolutionRule[];
}

// Data quality metrics
interface QualityScore {
  completeness: number; // 0-1
  accuracy: number; // 0-1
  freshness: number; // 0-1
  source_reliability: number; // 0-1
  overall: number; // weighted average
}
```

#### 1.2 ConflictResolver.ts - Main Engine
**Core responsibilities:**
- Composite key-based duplicate detection
- Multi-source conflict resolution with priority rules
- Data quality scoring system
- Audit trail generation
- Batch processing optimization

**Key algorithms:**
- **Composite Key Matching**: Exact match on (line_id, ts, number, direction, duration)
- **Time Tolerance**: ±1 second variance for call duration matching
- **Quality Scoring**: Weighted algorithm considering completeness, source reliability, freshness
- **Priority Resolution**: carrier (0.9) > device (0.7) > manual (0.5)

#### 1.3 DuplicateDetector.ts - Advanced Detection
**Core responsibilities:**
- Fuzzy matching for near-duplicates
- Phone number normalization (E.164 format)
- Content similarity for SMS (Levenshtein distance)
- Performance-optimized detection with indexing

**Algorithms:**
- **Phone Number Normalization**: Strip formatting, handle country codes
- **Fuzzy Time Matching**: ±1 second tolerance with configurable thresholds
- **Content Similarity**: 85% threshold for SMS content matching
- **Batch Processing**: Process in chunks of 100 events for memory efficiency

### Phase 2: Data Processing (High Priority)

#### 2.1 MergeStrategies.ts - Data Merging
**Merge Rules:**
1. **Source Priority**: carrier > device > manual
2. **Field-Level Resolution**: 
   - `duration`: Take longer duration if within 10% variance
   - `content`: Prefer non-null, longer content
   - `contact_id`: Prefer linked contact over null
   - `metadata`: Deep merge with source tracking

**Version History:**
- Store original data in metadata before merge
- Track resolution timestamp and strategy used
- Maintain chain of custody for audit compliance

#### 2.2 ConflictQueue.ts - Queue Management
**Queue Architecture:**
- **Priority Levels**: Critical (exact duplicates) > High (fuzzy matches) > Low (manual review)
- **Batch Processing**: Process in groups of 50 for efficiency
- **Retry Logic**: Exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Integration**: Hook into main sync queue with conflict bypass

### Phase 3: User Interface (Medium Priority)

#### 3.1 ConflictReporter.tsx - User Interface
**Components:**
- **ConflictCard**: Side-by-side comparison of conflicting events
- **BatchReview**: Multi-select interface for bulk resolution
- **ResolutionPreview**: Show merge result before confirmation
- **HistoryView**: Audit trail of past resolutions

**User Experience:**
- **Smart Grouping**: Group similar conflicts for batch resolution
- **Quick Actions**: Common resolution patterns as one-tap actions
- **Learning System**: Remember user preferences for similar conflicts
- **Confidence Indicators**: Visual cues for system confidence levels

### Phase 4: Advanced Features (Medium Priority)

#### 4.1 Machine Learning Integration
- **Pattern Recognition**: Learn from user resolution decisions
- **Confidence Scoring**: ML-based quality assessment
- **Anomaly Detection**: Identify suspicious duplicate patterns
- **Auto-Resolution**: Gradually increase automatic resolution rate

#### 4.2 Performance Optimization
- **Lazy Loading**: Load conflict details on demand
- **Memory Management**: Efficient cleanup of resolved conflicts
- **Background Processing**: Handle large datasets without UI blocking
- **Caching**: Cache frequently accessed conflict patterns

## Implementation Details

### Data Quality Scoring Algorithm
```typescript
function calculateQualityScore(event: Event): QualityScore {
  const completeness = calculateCompleteness(event);
  const accuracy = calculateAccuracy(event);
  const freshness = calculateFreshness(event);
  const sourceReliability = getSourceReliability(event.source);
  
  const overall = (
    completeness * 0.3 +
    accuracy * 0.3 +
    freshness * 0.2 +
    sourceReliability * 0.2
  );
  
  return { completeness, accuracy, freshness, sourceReliability, overall };
}
```

### Conflict Resolution Priority Matrix
| Conflict Type | Source 1 | Source 2 | Resolution Strategy |
|---------------|----------|----------|-------------------|
| Exact Match | Any | Any | Keep higher quality score |
| Time Variance | carrier | device | Merge with carrier metadata |
| Content Diff | device | manual | User review required |
| Duration Diff | Any | Any | Keep longer duration if <10% variance |

### Memory Efficiency Targets
- **Batch Size**: 100 events per processing chunk
- **Memory Limit**: <50MB for conflict processing
- **Processing Time**: <5 seconds for 1000 event batch
- **Storage**: Compressed conflict cache using AsyncStorage

### Error Handling Strategy
1. **Graceful Degradation**: Continue processing on individual failures
2. **Retry Logic**: 3 attempts with exponential backoff
3. **Fallback**: Manual resolution queue for unresolvable conflicts
4. **Monitoring**: Track resolution success rates and failure patterns

## Integration Points

### Existing Sync System Integration
- **Hook Points**: Pre-insert validation, post-sync cleanup
- **Queue Management**: Extend existing AsyncStorage queue
- **Error Handling**: Integrate with existing retry mechanisms
- **Status Reporting**: Extend SyncHealth monitoring

### Database Integration
- **Audit Trail**: Use existing audit_log table
- **Metadata Storage**: Leverage JSONB fields for conflict history
- **Performance**: Utilize existing indexes for fast lookups

## Testing Strategy

### Unit Tests
- Duplicate detection accuracy
- Merge strategy correctness
- Quality scoring algorithms
- Edge case handling

### Integration Tests
- Full conflict resolution workflows
- Queue management scenarios
- Error recovery testing
- Performance benchmarks

### User Testing
- Conflict presentation clarity
- Resolution workflow efficiency
- Learning system effectiveness
- Batch processing usability

## Success Metrics

### Automatic Resolution Rate
- **Target**: 85% of conflicts resolved automatically
- **Measurement**: (Auto-resolved / Total conflicts) * 100

### User Intervention Time
- **Target**: <30 seconds average per manual conflict
- **Measurement**: Time from conflict presentation to resolution

### Data Quality Improvement
- **Target**: 95% accuracy after conflict resolution
- **Measurement**: Manual audit of resolved conflicts

### Performance Targets
- **Memory Usage**: <50MB during conflict processing
- **Processing Speed**: <5 seconds per 1000 events
- **Battery Impact**: <2% additional drain during sync

## Risk Mitigation

### Data Loss Prevention
- **Backup Strategy**: Store original data in metadata before merge
- **Recovery Mechanism**: Ability to undo conflict resolutions
- **Validation**: Multiple validation layers before permanent merge

### Performance Risks
- **Memory Monitoring**: Real-time memory usage tracking
- **Batch Size Tuning**: Dynamic adjustment based on device capabilities
- **Background Processing**: Prevent UI blocking during large operations

### User Experience Risks
- **Complexity Management**: Progressive disclosure of advanced features
- **Error Communication**: Clear, actionable error messages
- **Learning Curve**: Contextual help and onboarding flow

## Timeline Estimate

### Week 1-2: Core Infrastructure
- TypeScript types and interfaces
- ConflictResolver.ts basic implementation
- DuplicateDetector.ts core algorithms

### Week 3: Data Processing
- MergeStrategies.ts implementation
- ConflictQueue.ts integration
- Basic testing and validation

### Week 4: User Interface
- ConflictReporter.tsx basic UI
- Integration with existing screens
- User testing and feedback

### Week 5: Polish & Performance
- Performance optimization
- Advanced features implementation
- Comprehensive testing
- Documentation

## Conclusion

This implementation plan provides a comprehensive approach to building a robust conflict resolution system. The focus on intelligent automation, user experience, and data integrity ensures the system can handle enterprise-scale scenarios while maintaining mobile performance constraints.

The phased approach allows for iterative development and early feedback, while the detailed technical specifications ensure consistent implementation across the team.