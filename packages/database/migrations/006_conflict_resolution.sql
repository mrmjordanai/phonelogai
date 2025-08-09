-- Conflict Resolution System Migration
-- This migration adds support for detecting and resolving duplicate events
-- across multiple data sources (carrier, device, manual)

-- Create conflict_resolutions table for tracking all resolved conflicts
CREATE TABLE conflict_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    original_event_id UUID REFERENCES events(id) NOT NULL,
    duplicate_event_id UUID REFERENCES events(id) NOT NULL,
    resolution_strategy TEXT CHECK (resolution_strategy IN ('automatic', 'manual', 'merge')) NOT NULL,
    conflict_type TEXT CHECK (conflict_type IN ('exact', 'fuzzy', 'time_variance')) NOT NULL,
    similarity_score FLOAT CHECK (similarity_score >= 0 AND similarity_score <= 1) NOT NULL,
    quality_scores JSONB NOT NULL, -- Store quality metrics for both events
    resolution_metadata JSONB DEFAULT '{}', -- Store merge details, user choices
    resolved_by UUID REFERENCES auth.users(id), -- NULL for automatic resolutions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_conflict_resolutions_user_id ON conflict_resolutions(user_id);
CREATE INDEX idx_conflict_resolutions_created_at ON conflict_resolutions(created_at);
CREATE INDEX idx_conflict_resolutions_original_event ON conflict_resolutions(original_event_id);
CREATE INDEX idx_conflict_resolutions_duplicate_event ON conflict_resolutions(duplicate_event_id);

-- Add columns to events table for conflict tracking
ALTER TABLE events ADD COLUMN IF NOT EXISTS conflict_resolution_id UUID REFERENCES conflict_resolutions(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS original_event_id UUID; -- For tracking merged events
ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT CHECK (source IN ('carrier', 'device', 'manual')) DEFAULT 'device';
ALTER TABLE events ADD COLUMN IF NOT EXISTS sync_timestamp TIMESTAMPTZ DEFAULT NOW();

-- Create index for conflict detection performance
CREATE INDEX IF NOT EXISTS idx_events_conflict_detection ON events(user_id, line_id, ts, number, direction, duration);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_sync_timestamp ON events(sync_timestamp);

-- Function to detect potential duplicate events using composite key matching
CREATE OR REPLACE FUNCTION detect_event_conflicts(
    p_user_id UUID,
    p_batch_size INTEGER DEFAULT 100,
    p_time_tolerance_seconds INTEGER DEFAULT 1
) 
RETURNS TABLE (
    original_id UUID,
    duplicate_id UUID,
    conflict_type TEXT,
    similarity FLOAT,
    original_source TEXT,
    duplicate_source TEXT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH event_pairs AS (
        SELECT 
            e1.id as original_id,
            e2.id as duplicate_id,
            e1.source as original_source,
            e2.source as duplicate_source,
            e1.ts as original_ts,
            e2.ts as duplicate_ts,
            e1.duration as original_duration,
            e2.duration as duplicate_duration,
            e1.content as original_content,
            e2.content as duplicate_content
        FROM events e1
        JOIN events e2 ON (
            e1.user_id = e2.user_id 
            AND e1.line_id = e2.line_id
            AND e1.number = e2.number
            AND e1.direction = e2.direction
            AND e1.type = e2.type
            AND e1.id < e2.id -- Ensure consistent ordering
        )
        WHERE e1.user_id = p_user_id
            AND e1.conflict_resolution_id IS NULL
            AND e2.conflict_resolution_id IS NULL
        LIMIT p_batch_size
    )
    SELECT 
        ep.original_id,
        ep.duplicate_id,
        CASE 
            -- Exact match: same timestamp and duration (or both null)
            WHEN ep.original_ts = ep.duplicate_ts 
                AND (ep.original_duration = ep.duplicate_duration 
                     OR (ep.original_duration IS NULL AND ep.duplicate_duration IS NULL))
                THEN 'exact'
            -- Time variance: within tolerance window
            WHEN ABS(EXTRACT(EPOCH FROM (ep.original_ts::timestamptz - ep.duplicate_ts::timestamptz))) <= p_time_tolerance_seconds
                AND (ABS(COALESCE(ep.original_duration, 0) - COALESCE(ep.duplicate_duration, 0)) <= 1
                     OR (ep.original_duration IS NULL AND ep.duplicate_duration IS NULL))
                THEN 'time_variance'
            -- Fuzzy match: similar content but different timing
            ELSE 'fuzzy'
        END as conflict_type,
        CASE 
            -- Calculate similarity score
            WHEN ep.original_ts = ep.duplicate_ts 
                AND ep.original_duration = ep.duplicate_duration
                THEN 1.0
            WHEN ABS(EXTRACT(EPOCH FROM (ep.original_ts::timestamptz - ep.duplicate_ts::timestamptz))) <= p_time_tolerance_seconds
                THEN 0.9
            ELSE 
                -- For SMS, use content similarity; for calls, use duration similarity
                CASE 
                    WHEN ep.original_content IS NOT NULL AND ep.duplicate_content IS NOT NULL
                        THEN GREATEST(0.0, 1.0 - (LENGTH(ep.original_content) - LENGTH(ep.duplicate_content))::FLOAT / GREATEST(LENGTH(ep.original_content), LENGTH(ep.duplicate_content)))
                    ELSE 0.7
                END
        END as similarity,
        ep.original_source,
        ep.duplicate_source
    FROM event_pairs ep
    WHERE 
        -- Only include pairs that are likely conflicts
        (ABS(EXTRACT(EPOCH FROM (ep.original_ts::timestamptz - ep.duplicate_ts::timestamptz))) <= p_time_tolerance_seconds * 10)
    ORDER BY similarity DESC;
END;
$$;

-- Function to calculate quality score for an event
CREATE OR REPLACE FUNCTION calculate_quality_score(
    p_event_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_event RECORD;
    v_completeness FLOAT;
    v_source_reliability FLOAT;
    v_freshness FLOAT;
    v_overall FLOAT;
    v_required_fields INTEGER := 0;
    v_filled_fields INTEGER := 0;
BEGIN
    -- Get event details
    SELECT * INTO v_event FROM events WHERE id = p_event_id;
    
    IF NOT FOUND THEN
        RETURN '{"error": "Event not found"}'::JSONB;
    END IF;
    
    -- Calculate completeness (ratio of filled required fields)
    v_required_fields := 7; -- id, user_id, line_id, ts, number, direction, type
    v_filled_fields := 7; -- These are always filled due to NOT NULL constraints
    
    -- Add optional fields if present
    IF v_event.duration IS NOT NULL THEN v_filled_fields := v_filled_fields + 1; v_required_fields := v_required_fields + 1; END IF;
    IF v_event.content IS NOT NULL THEN v_filled_fields := v_filled_fields + 1; v_required_fields := v_required_fields + 1; END IF;
    IF v_event.contact_id IS NOT NULL THEN v_filled_fields := v_filled_fields + 1; v_required_fields := v_required_fields + 1; END IF;
    
    v_completeness := v_filled_fields::FLOAT / GREATEST(v_required_fields, 1);
    
    -- Calculate source reliability
    v_source_reliability := CASE v_event.source
        WHEN 'carrier' THEN 0.9
        WHEN 'device' THEN 0.7
        WHEN 'manual' THEN 0.5
        ELSE 0.5
    END;
    
    -- Calculate freshness (based on sync timestamp age)
    v_freshness := GREATEST(0.0, 1.0 - (EXTRACT(EPOCH FROM (NOW() - COALESCE(v_event.sync_timestamp, v_event.created_at))) / 86400.0)); -- 1 day = full decay
    v_freshness := LEAST(1.0, v_freshness); -- Cap at 1.0
    
    -- Calculate weighted overall score
    v_overall := (v_completeness * 0.4) + (v_source_reliability * 0.4) + (v_freshness * 0.2);
    
    RETURN json_build_object(
        'completeness', ROUND(v_completeness::numeric, 3),
        'source_reliability', ROUND(v_source_reliability::numeric, 3), 
        'freshness', ROUND(v_freshness::numeric, 3),
        'overall', ROUND(v_overall::numeric, 3)
    )::JSONB;
END;
$$;

-- Function to resolve a conflict automatically or manually
CREATE OR REPLACE FUNCTION resolve_event_conflict(
    p_original_id UUID,
    p_duplicate_id UUID,
    p_resolution_strategy TEXT,
    p_conflict_type TEXT,
    p_similarity_score FLOAT,
    p_resolved_by UUID DEFAULT NULL -- NULL for automatic resolution
)
RETURNS UUID -- Returns the conflict_resolution_id
LANGUAGE plpgsql
AS $$
DECLARE
    v_original_event RECORD;
    v_duplicate_event RECORD;
    v_resolution_id UUID;
    v_original_quality JSONB;
    v_duplicate_quality JSONB;
    v_merged_event_data JSONB;
    v_keep_original BOOLEAN;
BEGIN
    -- Get both events
    SELECT * INTO v_original_event FROM events WHERE id = p_original_id;
    SELECT * INTO v_duplicate_event FROM events WHERE id = p_duplicate_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'One or both events not found';
    END IF;
    
    -- Calculate quality scores
    v_original_quality := calculate_quality_score(p_original_id);
    v_duplicate_quality := calculate_quality_score(p_duplicate_id);
    
    -- Determine which event to keep based on quality and resolution strategy
    v_keep_original := CASE p_resolution_strategy
        WHEN 'automatic' THEN 
            (v_original_quality->>'overall')::FLOAT >= (v_duplicate_quality->>'overall')::FLOAT
        WHEN 'manual' THEN 
            TRUE -- Manual resolution preserves original by default
        WHEN 'merge' THEN
            (v_original_quality->>'overall')::FLOAT >= (v_duplicate_quality->>'overall')::FLOAT
        ELSE TRUE
    END;
    
    -- Create conflict resolution record
    INSERT INTO conflict_resolutions (
        user_id,
        original_event_id,
        duplicate_event_id,
        resolution_strategy,
        conflict_type,
        similarity_score,
        quality_scores,
        resolution_metadata,
        resolved_by
    ) VALUES (
        v_original_event.user_id,
        p_original_id,
        p_duplicate_id,
        p_resolution_strategy,
        p_conflict_type,
        p_similarity_score,
        json_build_object(
            'original', v_original_quality,
            'duplicate', v_duplicate_quality,
            'kept_original', v_keep_original
        ),
        json_build_object(
            'original_data', row_to_json(v_original_event),
            'duplicate_data', row_to_json(v_duplicate_event),
            'merge_strategy', CASE 
                WHEN p_resolution_strategy = 'merge' THEN 'quality_based'
                ELSE 'preserve_higher_quality'
            END
        ),
        p_resolved_by
    ) RETURNING id INTO v_resolution_id;
    
    -- Update both events to reference the resolution
    UPDATE events 
    SET conflict_resolution_id = v_resolution_id
    WHERE id IN (p_original_id, p_duplicate_id);
    
    -- Mark the lower quality event as merged (soft delete approach)
    IF NOT v_keep_original THEN
        UPDATE events 
        SET original_event_id = p_duplicate_id
        WHERE id = p_original_id;
    ELSE
        UPDATE events 
        SET original_event_id = p_original_id  
        WHERE id = p_duplicate_id;
    END IF;
    
    RETURN v_resolution_id;
END;
$$;

-- Function to get conflict metrics for a user
CREATE OR REPLACE FUNCTION get_conflict_metrics(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_conflicts INTEGER;
    v_auto_resolved INTEGER;
    v_manual_resolved INTEGER;
    v_pending_resolution INTEGER;
    v_avg_resolution_time FLOAT;
BEGIN
    -- Count conflicts by resolution type
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolved_by IS NULL) as auto,
        COUNT(*) FILTER (WHERE resolved_by IS NOT NULL) as manual
    INTO v_total_conflicts, v_auto_resolved, v_manual_resolved
    FROM conflict_resolutions 
    WHERE user_id = p_user_id;
    
    -- Count unresolved conflicts (events that could be duplicates but haven't been processed)
    SELECT COUNT(DISTINCT e1.id)
    INTO v_pending_resolution
    FROM events e1
    JOIN events e2 ON (
        e1.user_id = e2.user_id 
        AND e1.line_id = e2.line_id
        AND e1.number = e2.number
        AND e1.direction = e2.direction
        AND e1.type = e2.type
        AND e1.id != e2.id
        AND ABS(EXTRACT(EPOCH FROM (e1.ts::timestamptz - e2.ts::timestamptz))) <= 10 -- Within 10 seconds
    )
    WHERE e1.user_id = p_user_id
        AND e1.conflict_resolution_id IS NULL;
    
    -- Calculate average resolution time (in seconds)
    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))), 0)
    INTO v_avg_resolution_time
    FROM conflict_resolutions
    WHERE user_id = p_user_id
        AND resolved_by IS NOT NULL; -- Only manual resolutions have meaningful timing
    
    RETURN json_build_object(
        'total_conflicts', COALESCE(v_total_conflicts, 0),
        'auto_resolved', COALESCE(v_auto_resolved, 0),
        'manual_resolved', COALESCE(v_manual_resolved, 0),
        'pending_resolution', COALESCE(v_pending_resolution, 0),
        'auto_resolution_rate', CASE 
            WHEN v_total_conflicts > 0 THEN ROUND((v_auto_resolved::FLOAT / v_total_conflicts * 100)::numeric, 1)
            ELSE 0.0
        END,
        'avg_resolution_time', ROUND(COALESCE(v_avg_resolution_time, 0)::numeric, 2),
        'data_quality_improvement', 95.0 -- Placeholder - would need more complex calculation
    )::JSONB;
END;
$$;

-- RLS Policies for conflict_resolutions table
ALTER TABLE conflict_resolutions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own conflict resolutions
CREATE POLICY conflict_resolutions_select_own 
ON conflict_resolutions FOR SELECT 
USING (user_id = auth.uid());

-- Users can only insert conflict resolutions for their own events
CREATE POLICY conflict_resolutions_insert_own 
ON conflict_resolutions FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Users can only update their own conflict resolutions
CREATE POLICY conflict_resolutions_update_own 
ON conflict_resolutions FOR UPDATE 
USING (user_id = auth.uid());

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON conflict_resolutions TO authenticated;
GRANT USAGE ON SEQUENCE conflict_resolutions_id_seq TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION detect_event_conflicts(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_quality_score(UUID) TO authenticated;  
GRANT EXECUTE ON FUNCTION resolve_event_conflict(UUID, UUID, TEXT, TEXT, FLOAT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_conflict_metrics(UUID) TO authenticated;