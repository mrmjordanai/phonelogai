-- Heat-Map Data Aggregation Functions
-- Provides optimized functions for heat-map visualization with time-based aggregation

-- ============================================================================
-- HEAT-MAP AGGREGATION FUNCTION
-- ============================================================================

-- Get heat-map data with time bucket aggregation for visualization
CREATE OR REPLACE FUNCTION get_heatmap_data(
    p_user_id UUID,
    p_view_mode TEXT DEFAULT 'weekly', -- 'daily', 'weekly', 'monthly'
    p_event_types TEXT[] DEFAULT ARRAY['call', 'sms'],
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    time_bucket TEXT,
    day_of_week INTEGER,
    hour_of_day INTEGER,
    call_count INTEGER,
    sms_count INTEGER,
    total_duration INTEGER,
    unique_contacts INTEGER,
    intensity DECIMAL(3,2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    requesting_user_id UUID;
    max_activity INTEGER;
BEGIN
    -- Get the authenticated user ID
    requesting_user_id := auth.uid();
    
    -- Check access permissions - user can access own data or admins can access team data
    IF NOT (
        p_user_id = requesting_user_id OR 
        get_user_org_role(requesting_user_id, p_user_id) IN ('admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied to user data';
    END IF;

    -- Validate view mode
    IF p_view_mode NOT IN ('daily', 'weekly', 'monthly') THEN
        RAISE EXCEPTION 'Invalid view mode. Must be daily, weekly, or monthly';
    END IF;

    -- Validate date range
    IF p_start_date >= p_end_date THEN
        RAISE EXCEPTION 'Start date must be before end date';
    END IF;

    -- First pass: get max activity for intensity calculation
    SELECT MAX(activity_count)::INTEGER
    INTO max_activity
    FROM (
        SELECT COUNT(*) as activity_count
        FROM events e
        LEFT JOIN privacy_rules pr ON e.contact_id = pr.contact_id AND pr.user_id = requesting_user_id
        WHERE e.user_id = p_user_id
        AND e.ts >= p_start_date
        AND e.ts <= p_end_date
        AND e.type = ANY(p_event_types::event_type[])
        AND (pr.visibility IS NULL OR pr.visibility IN ('team', 'public') OR p_user_id = requesting_user_id)
        GROUP BY 
            CASE p_view_mode
                WHEN 'daily' THEN date_trunc('hour', e.ts AT TIME ZONE 'UTC')
                WHEN 'weekly' THEN date_trunc('hour', e.ts AT TIME ZONE 'UTC')
                WHEN 'monthly' THEN date_trunc('day', e.ts AT TIME ZONE 'UTC')
            END,
            EXTRACT(dow FROM e.ts AT TIME ZONE 'UTC'),
            EXTRACT(hour FROM e.ts AT TIME ZONE 'UTC')
    ) sub;

    -- Set minimum max_activity to avoid division by zero
    max_activity := GREATEST(max_activity, 1);

    -- Main query: aggregate events into time buckets
    RETURN QUERY
    SELECT 
        -- Time bucket for grouping
        CASE p_view_mode
            WHEN 'daily' THEN to_char(date_trunc('hour', e.ts AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:00')
            WHEN 'weekly' THEN to_char(date_trunc('hour', e.ts AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:00')
            WHEN 'monthly' THEN to_char(date_trunc('day', e.ts AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
        END as time_bucket,
        
        -- Day of week (0 = Sunday, 6 = Saturday)
        EXTRACT(dow FROM e.ts AT TIME ZONE 'UTC')::INTEGER as day_of_week,
        
        -- Hour of day (0-23)
        EXTRACT(hour FROM e.ts AT TIME ZONE 'UTC')::INTEGER as hour_of_day,
        
        -- Event counts by type
        COUNT(*) FILTER (WHERE e.type = 'call')::INTEGER as call_count,
        COUNT(*) FILTER (WHERE e.type = 'sms')::INTEGER as sms_count,
        
        -- Total call duration in seconds
        COALESCE(SUM(e.duration) FILTER (WHERE e.type = 'call'), 0)::INTEGER as total_duration,
        
        -- Unique contacts in this time bucket
        COUNT(DISTINCT e.contact_id) FILTER (WHERE e.contact_id IS NOT NULL)::INTEGER as unique_contacts,
        
        -- Normalized intensity (0.0 to 1.0)
        ROUND((COUNT(*)::DECIMAL / max_activity), 2) as intensity

    FROM events e
    LEFT JOIN privacy_rules pr ON e.contact_id = pr.contact_id AND pr.user_id = requesting_user_id
    WHERE e.user_id = p_user_id
    AND e.ts >= p_start_date
    AND e.ts <= p_end_date
    AND e.type = ANY(p_event_types::event_type[])
    AND (pr.visibility IS NULL OR pr.visibility IN ('team', 'public') OR p_user_id = requesting_user_id)
    GROUP BY 
        CASE p_view_mode
            WHEN 'daily' THEN date_trunc('hour', e.ts AT TIME ZONE 'UTC')
            WHEN 'weekly' THEN date_trunc('hour', e.ts AT TIME ZONE 'UTC')
            WHEN 'monthly' THEN date_trunc('day', e.ts AT TIME ZONE 'UTC')
        END,
        EXTRACT(dow FROM e.ts AT TIME ZONE 'UTC'),
        EXTRACT(hour FROM e.ts AT TIME ZONE 'UTC')
    ORDER BY 
        CASE p_view_mode
            WHEN 'daily' THEN date_trunc('hour', e.ts AT TIME ZONE 'UTC')
            WHEN 'weekly' THEN date_trunc('hour', e.ts AT TIME ZONE 'UTC')
            WHEN 'monthly' THEN date_trunc('day', e.ts AT TIME ZONE 'UTC')
        END,
        EXTRACT(dow FROM e.ts AT TIME ZONE 'UTC'),
        EXTRACT(hour FROM e.ts AT TIME ZONE 'UTC');
END;
$$;

-- ============================================================================
-- HEAT-MAP SUMMARY STATISTICS FUNCTION
-- ============================================================================

-- Get summary statistics for heat-map data
CREATE OR REPLACE FUNCTION get_heatmap_summary(
    p_user_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    requesting_user_id UUID;
    summary JSONB;
    total_events INTEGER;
    avg_daily_activity DECIMAL;
    peak_hour INTEGER;
    peak_day INTEGER;
    peak_intensity DECIMAL;
BEGIN
    requesting_user_id := auth.uid();
    
    -- Check access permissions
    IF NOT (
        p_user_id = requesting_user_id OR 
        get_user_org_role(requesting_user_id, p_user_id) IN ('admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied to user data';
    END IF;

    -- Calculate summary statistics
    SELECT 
        COUNT(*),
        ROUND(COUNT(*)::DECIMAL / GREATEST(EXTRACT(days FROM p_end_date - p_start_date), 1), 1),
        mode() WITHIN GROUP (ORDER BY EXTRACT(hour FROM ts)),
        mode() WITHIN GROUP (ORDER BY EXTRACT(dow FROM ts))
    INTO total_events, avg_daily_activity, peak_hour, peak_day
    FROM events e
    LEFT JOIN privacy_rules pr ON e.contact_id = pr.contact_id AND pr.user_id = requesting_user_id
    WHERE e.user_id = p_user_id
    AND e.ts >= p_start_date
    AND e.ts <= p_end_date
    AND (pr.visibility IS NULL OR pr.visibility IN ('team', 'public') OR p_user_id = requesting_user_id);

    -- Get peak intensity from hourly aggregation
    SELECT MAX(hourly_count)::DECIMAL / NULLIF(total_events, 0)
    INTO peak_intensity
    FROM (
        SELECT COUNT(*) as hourly_count
        FROM events e
        LEFT JOIN privacy_rules pr ON e.contact_id = pr.contact_id AND pr.user_id = requesting_user_id
        WHERE e.user_id = p_user_id
        AND e.ts >= p_start_date
        AND e.ts <= p_end_date
        AND (pr.visibility IS NULL OR pr.visibility IN ('team', 'public') OR p_user_id = requesting_user_id)
        GROUP BY date_trunc('hour', e.ts)
    ) hourly_stats;

    -- Build summary JSON
    summary := jsonb_build_object(
        'total_events', COALESCE(total_events, 0),
        'avg_daily_activity', COALESCE(avg_daily_activity, 0),
        'peak_hour', COALESCE(peak_hour, 12),
        'peak_day', COALESCE(peak_day, 1), -- Monday default
        'peak_intensity', COALESCE(peak_intensity, 0),
        'date_range', jsonb_build_object(
            'start', p_start_date,
            'end', p_end_date,
            'days', EXTRACT(days FROM p_end_date - p_start_date)
        )
    );

    RETURN summary;
END;
$$;

-- ============================================================================
-- INDEXES FOR HEAT-MAP PERFORMANCE
-- ============================================================================

-- Composite index for heat-map queries (if not already exists)
CREATE INDEX IF NOT EXISTS idx_events_heatmap 
ON events (user_id, ts, type) 
WHERE ts IS NOT NULL;

-- Index for time extraction operations
CREATE INDEX IF NOT EXISTS idx_events_time_components 
ON events (user_id, (EXTRACT(dow FROM ts)), (EXTRACT(hour FROM ts)));

-- Comments for documentation
COMMENT ON FUNCTION get_heatmap_data IS 'Aggregates event data into time buckets for heat-map visualization with privacy filtering';
COMMENT ON FUNCTION get_heatmap_summary IS 'Provides summary statistics for heat-map displays including peak hours and activity patterns';