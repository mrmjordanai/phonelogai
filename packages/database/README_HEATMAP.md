# Heatmap Database Function Implementation

## Overview

The `get_heatmap_data` database function has been successfully implemented and is ready for integration with React components. This function provides optimized time-bucketed aggregation of call and SMS events for heat-map visualizations.

## Database Function

**Location**: `/packages/database/migrations/005_heatmap_functions.sql`

### `get_heatmap_data()` Function

**Signature:**
```sql
get_heatmap_data(
    p_user_id UUID,
    p_view_mode TEXT DEFAULT 'weekly',
    p_event_types TEXT[] DEFAULT ARRAY['call', 'sms'],
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
```

**Returns:**
```sql
TABLE (
    time_bucket TEXT,
    day_of_week INTEGER,
    hour_of_day INTEGER,
    call_count INTEGER,
    sms_count INTEGER,
    total_duration INTEGER,
    unique_contacts INTEGER,
    intensity DECIMAL(3,2)
)
```

**Features:**
✅ Multi-tenant data isolation through RLS policies  
✅ Privacy rule enforcement with field-level anonymization  
✅ Performance optimization with composite indexes  
✅ Time bucketing (daily/weekly/monthly views)  
✅ Proper parameter validation and error handling  
✅ Support for large datasets (1M+ events)  

### `get_heatmap_summary()` Function

Provides summary statistics including peak hours, daily averages, and intensity metrics.

## TypeScript Integration

**Location**: `/packages/database/src/types.ts`

### New Types Added:
- `HeatmapDataPoint` - Individual data point structure
- `HeatmapViewMode` - View mode type ('daily' | 'weekly' | 'monthly')
- `HeatmapParams` - Function parameters interface
- `HeatmapSummary` - Summary statistics structure

### Database Function Types:
```typescript
get_heatmap_data: {
  Args: {
    p_user_id: string;
    p_view_mode?: string;
    p_event_types?: string[];
    p_start_date?: string;
    p_end_date?: string;
  };
  Returns: HeatmapDataPoint[];
};
```

## Client Utilities

**Location**: `/packages/database/src/heatmap.ts`

### Key Functions:

**`getHeatmapData(params)`**
- Convenient wrapper for database function calls
- Parameter validation and default handling
- Proper error handling

**`getHeatmapSummary(user_id, start_date?, end_date?)`**
- Retrieves summary statistics
- Default date range handling

**`processHeatmapForVisualization(data, viewMode)`**
- Transforms raw data into grid structure
- Calculates intensity colors
- Fills empty cells for complete visualization

### Utility Functions:
- `formatTimeBucket()` - Format time buckets for display
- `getDayName()` - Convert day numbers to names
- `formatHour()` - Convert 24-hour to 12-hour format
- `formatDuration()` - Human-readable duration formatting
- `getIntensityColor()` - Generate CSS colors for intensity

## Performance Optimizations

### Database Indexes:
```sql
-- Composite index for heatmap queries
CREATE INDEX idx_events_heatmap 
ON events (user_id, ts, type) 
WHERE ts IS NOT NULL;

-- Index for time extraction operations
CREATE INDEX idx_events_time_components 
ON events (user_id, (EXTRACT(dow FROM ts)), (EXTRACT(hour FROM ts)));
```

### Query Performance:
- Two-pass intensity calculation for proper normalization
- Proper use of WHERE clauses for index utilization
- Efficient time bucketing with date_trunc()
- Privacy filtering at the database level

## Usage Example

```typescript
import { getProcessedHeatmapData, HeatmapParams } from '@phonelogai/database';

const params: HeatmapParams = {
  user_id: 'user-uuid',
  view_mode: 'weekly',
  event_types: ['call', 'sms'],
  start_date: '2024-01-01T00:00:00Z',
  end_date: '2024-01-31T23:59:59Z'
};

const { data, error } = await getProcessedHeatmapData(params);

if (data) {
  // data.raw: Raw database results
  // data.processed: Grid structure ready for React components
}
```

## Security Features

✅ **Row-Level Security (RLS)**: Only authorized users can access data  
✅ **Privacy Rules**: Respects per-contact visibility settings  
✅ **RBAC Integration**: Admin/owner roles can access team data  
✅ **Parameter Validation**: Prevents SQL injection and invalid inputs  
✅ **Audit Trail**: Function calls are logged for security monitoring  

## Integration Ready

The heatmap function is fully implemented and ready for integration with:
- React dashboard components
- Data visualization libraries (D3.js, Chart.js, etc.)
- Mobile React Native components
- Real-time updates via Supabase subscriptions

All necessary TypeScript types, utility functions, and database optimizations are in place for seamless frontend integration.