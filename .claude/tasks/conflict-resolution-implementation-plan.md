# Conflict Resolution System - Implementation Plan
**Phase 2: Core Data Features - August 8, 2025**

## Executive Summary
Implement a robust conflict resolution system for duplicate events in the mobile app. This system is critical for maintaining data integrity during multi-source sync operations (carrier, device, manual imports).

## Why This Task Is Next Priority
1. **Data Integrity Foundation**: Required before implementing Contact Intelligence and NLQ systems
2. **Mobile Sync Reliability**: Critical for enterprise-scale data collection
3. **User Experience**: Prevents duplicate events from cluttering dashboards
4. **Performance Impact**: Unresolved conflicts degrade query performance

## Updated Implementation Strategy

### Phase 1: Core Infrastructure (Week 1)
**Target: Production-ready conflict detection and basic resolution**

#### 1.1 TypeScript Types (`packages/types/src/conflicts.ts`)
```typescript
interface ConflictEvent {
  id: string;
  original: Event;
  duplicate: Event;
  conflictType: 'exact' | 'fuzzy' | 'time_variance';
  similarity: number;
  sources: DataSource[];
  resolution_strategy: 'automatic' | 'manual' | 'merge';
  created_at: Date;
  resolved_at?: Date;
}

interface QualityScore {
  completeness: number;    // 0-1 based on null fields
  source_reliability: number; // carrier(0.9) > device(0.7) > manual(0.5)
  freshness: number;       // based on sync timestamp
  overall: number;         // weighted average
}
```

#### 1.2 Database Functions (`packages/database/src/conflicts.sql`)
```sql
-- Detect potential duplicates using composite key matching
CREATE OR REPLACE FUNCTION detect_event_conflicts(
  p_user_id UUID,
  p_batch_size INTEGER DEFAULT 100
) RETURNS TABLE (
  original_id UUID,
  duplicate_id UUID,
  conflict_type TEXT,
  similarity FLOAT
);

-- Resolve conflicts with audit trail
CREATE OR REPLACE FUNCTION resolve_event_conflict(
  p_original_id UUID,
  p_duplicate_id UUID,
  p_resolution_strategy TEXT,
  p_resolved_by UUID
) RETURNS UUID;
```

#### 1.3 ConflictResolver Service (`apps/mobile/src/services/ConflictResolver.ts`)
```typescript
class ConflictResolver {
  // Core composite key matching: (line_id, ts±1s, number, direction, duration)
  async detectConflicts(events: Event[]): Promise<ConflictEvent[]>
  
  // Quality-based automatic resolution (85% target)
  async resolveAutomatically(conflicts: ConflictEvent[]): Promise<ResolvedConflict[]>
  
  // Queue management with priority levels
  async queueForManualReview(conflicts: ConflictEvent[]): Promise<void>
}
```

### Phase 2: Advanced Detection (Week 2)
**Target: Fuzzy matching and quality scoring**

#### 2.1 Enhanced Detection Logic
- **Phone Number Normalization**: E.164 format standardization
- **Time Tolerance Matching**: ±1 second variance for call timing
- **SMS Content Similarity**: Levenshtein distance with 85% threshold
- **Metadata Comparison**: Deep comparison of JSONB fields

#### 2.2 Quality Scoring System
```typescript
function calculateQualityScore(event: Event): QualityScore {
  const completeness = (requiredFields.filter(f => event[f]).length / requiredFields.length);
  const sourceReliability = SOURCE_WEIGHTS[event.source]; // carrier: 0.9, device: 0.7, manual: 0.5
  const freshness = calculateFreshness(event.sync_timestamp);
  
  return {
    completeness,
    source_reliability: sourceReliability,
    freshness,
    overall: (completeness * 0.4) + (sourceReliability * 0.4) + (freshness * 0.2)
  };
}
```

### Phase 3: User Interface (Week 3)
**Target: Manual review interface for edge cases**

#### 3.1 ConflictReview Screen (`apps/mobile/src/screens/ConflictReview.tsx`)
- **Side-by-side comparison** of conflicting events
- **Batch resolution actions** for similar conflict types
- **Smart suggestions** based on quality scores
- **Undo capabilities** for recent resolutions

#### 3.2 Integration with Sync Health
- **Conflict metrics** in SyncHealth dashboard
- **Resolution success rates** tracking
- **User notification** for high-priority conflicts

### Phase 4: Performance & Testing (Week 4)
**Target: Production optimization and validation**

#### 4.1 Performance Optimization
- **Batch processing**: 100 events per chunk for memory efficiency
- **Lazy conflict detection**: Only during sync operations
- **Background resolution**: Non-blocking UI processing
- **Memory limits**: <50MB for conflict processing

#### 4.2 Comprehensive Testing
- **Unit tests**: Detection accuracy, scoring algorithms
- **Integration tests**: Full resolution workflows
- **Performance tests**: 1000+ event batches
- **User acceptance**: Manual review workflow testing

## Technical Architecture

### Database Integration
```sql
-- Add conflict tracking to events table
ALTER TABLE events ADD COLUMN conflict_resolution_id UUID REFERENCES conflict_resolutions(id);
ALTER TABLE events ADD COLUMN original_event_id UUID; -- For tracking merged events

-- New conflict_resolutions table
CREATE TABLE conflict_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  original_event_id UUID REFERENCES events(id),
  duplicate_event_id UUID REFERENCES events(id),
  resolution_strategy TEXT CHECK (resolution_strategy IN ('automatic', 'manual', 'merge')),
  conflict_type TEXT CHECK (conflict_type IN ('exact', 'fuzzy', 'time_variance')),
  similarity_score FLOAT,
  quality_scores JSONB, -- Store quality metrics for both events
  resolution_metadata JSONB, -- Store merge details, user choices
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
```

### Mobile Architecture
```
ConflictResolver (main service)
├── DuplicateDetector (detection logic)
├── QualityScorer (scoring algorithms) 
├── MergeStrategy (data merging rules)
├── ConflictQueue (priority management)
└── ConflictReporter (UI components)
```

## Success Metrics

### Automatic Resolution Targets
- **85% automatic resolution rate** for duplicate conflicts
- **<5 seconds processing time** per 1000 events
- **<50MB memory usage** during conflict processing
- **95% data accuracy** after resolution

### User Experience Targets
- **<30 seconds average** for manual conflict resolution
- **Zero data loss** through comprehensive backup strategy
- **<2% battery impact** during sync operations

## Risk Mitigation

### Data Protection
- **Immutable original data**: Store in metadata before any merge
- **Audit trail**: Complete history of all resolution decisions  
- **Recovery mechanism**: Ability to undo conflict resolutions
- **Validation layers**: Multiple checks before permanent changes

### Performance Safeguards
- **Memory monitoring**: Real-time usage tracking with alerts
- **Batch size tuning**: Dynamic adjustment based on device capabilities
- **Graceful degradation**: Continue processing on individual failures
- **Background processing**: Prevent UI blocking during large operations

## Integration Requirements

### Existing Systems
- **SyncService**: Hook conflict detection into sync pipeline
- **OfflineQueue**: Extend queue with conflict resolution jobs
- **SyncHealth**: Add conflict metrics to monitoring dashboard
- **Database**: Utilize existing indexes and RLS policies

### New Dependencies
- **Phone number parsing**: libphonenumber for E.164 normalization
- **String similarity**: Fast Levenshtein distance calculation
- **Batch processing**: Queue management with priority levels

## Timeline Summary

**Week 1**: Core infrastructure, basic detection, automatic resolution
**Week 2**: Advanced fuzzy matching, quality scoring system
**Week 3**: User interface for manual review, batch operations
**Week 4**: Performance optimization, comprehensive testing, documentation

**Total Effort**: 4 weeks to production-ready conflict resolution system

## Next Steps After Completion

1. **Contact Intelligence Implementation**: Can now rely on clean, deduplicated event data
2. **Advanced Analytics**: Improved data quality enables better insights
3. **NLQ System**: Clean data foundation for natural language queries

This conflict resolution system provides the data integrity foundation required for the remaining advanced features while ensuring enterprise-scale reliability for mobile data collection.