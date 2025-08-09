-- Database Functions for Call/SMS Intelligence Platform
-- Provides optimized functions for dashboard metrics, data access, and analytics

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Phone number anonymization utility
CREATE OR REPLACE FUNCTION anonymize_phone_number(number TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF number IS NULL OR length(number) < 4 THEN
        RETURN '***-***-****';
    END IF;
    
    -- Keep first 3 and last 4 digits, mask the middle
    RETURN substring(number FROM 1 FOR 3) || '-***-' || right(number, 4);
END;
$$;

-- Get user's role in organization (helper for functions)
CREATE OR REPLACE FUNCTION get_user_org_role(requesting_user_id UUID, target_user_id UUID)
RETURNS user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    user_role_result user_role;
    target_org_id UUID;
BEGIN
    -- Get target user's organization
    SELECT org_id INTO target_org_id
    FROM org_roles 
    WHERE user_id = target_user_id 
    LIMIT 1;
    
    IF target_org_id IS NULL THEN
        RETURN 'viewer'::user_role;
    END IF;
    
    -- Get requesting user's role in that organization
    SELECT role INTO user_role_result
    FROM org_roles
    WHERE user_id = requesting_user_id AND org_id = target_org_id
    ORDER BY 
        CASE role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4  
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
        END DESC
    LIMIT 1;
    
    RETURN COALESCE(user_role_result, 'viewer'::user_role);
END;
$$;

-- ============================================================================
-- DASHBOARD METRICS FUNCTIONS
-- ============================================================================

-- Get comprehensive dashboard metrics for a user
CREATE OR REPLACE FUNCTION get_dashboard_metrics(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    metrics JSONB;
    total_events INTEGER;
    total_calls INTEGER;
    total_sms INTEGER;
    unique_contacts INTEGER;
    avg_call_duration DECIMAL;
    last_30_days_events INTEGER;
    busiest_hour INTEGER;
    top_contact JSONB;
BEGIN
    -- Check access permissions
    IF NOT (
        target_user_id = auth.uid() OR 
        get_user_org_role(auth.uid(), target_user_id) IN ('admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Basic event counts
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE type = 'call'),
        COUNT(*) FILTER (WHERE type = 'sms')
    INTO total_events, total_calls, total_sms
    FROM events 
    WHERE user_id = target_user_id;

    -- Unique contacts count
    SELECT COUNT(DISTINCT contact_id) 
    INTO unique_contacts
    FROM events 
    WHERE user_id = target_user_id AND contact_id IS NOT NULL;

    -- Average call duration (in minutes)
    SELECT ROUND(AVG(duration) / 60.0, 1)
    INTO avg_call_duration
    FROM events 
    WHERE user_id = target_user_id AND type = 'call' AND duration IS NOT NULL;

    -- Last 30 days activity
    SELECT COUNT(*)
    INTO last_30_days_events
    FROM events 
    WHERE user_id = target_user_id 
    AND ts >= NOW() - INTERVAL '30 days';

    -- Busiest hour of day
    SELECT EXTRACT(hour FROM ts)::INTEGER
    INTO busiest_hour
    FROM events 
    WHERE user_id = target_user_id
    GROUP BY EXTRACT(hour FROM ts)
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- Top contact (most interactions)
    SELECT jsonb_build_object(
        'contact_id', contact_id,
        'name', c.name,
        'number', CASE 
            WHEN pr.anonymize_number = true THEN anonymize_phone_number(c.number)
            ELSE c.number 
        END,
        'interaction_count', COUNT(*)
    )
    INTO top_contact
    FROM events e
    LEFT JOIN contacts c ON e.contact_id = c.id
    LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
    WHERE e.user_id = target_user_id AND e.contact_id IS NOT NULL
    GROUP BY e.contact_id, c.name, c.number, pr.anonymize_number
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- Build final metrics object
    metrics := jsonb_build_object(
        'total_events', COALESCE(total_events, 0),
        'total_calls', COALESCE(total_calls, 0),
        'total_sms', COALESCE(total_sms, 0),
        'unique_contacts', COALESCE(unique_contacts, 0),
        'avg_call_duration_minutes', COALESCE(avg_call_duration, 0),
        'last_30_days_events', COALESCE(last_30_days_events, 0),
        'busiest_hour', busiest_hour,
        'top_contact', COALESCE(top_contact, '{}'::jsonb),
        'generated_at', extract(epoch from now())
    );

    RETURN metrics;
END;
$$;

-- Get team dashboard metrics (aggregated across team members)
CREATE OR REPLACE FUNCTION get_team_dashboard_metrics(requesting_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    metrics JSONB;
    team_org_id UUID;
    user_role_level user_role;
BEGIN
    -- Get requesting user's organization and role
    SELECT org_id, role INTO team_org_id, user_role_level
    FROM org_roles 
    WHERE user_id = requesting_user_id 
    ORDER BY 
        CASE role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4  
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
        END DESC
    LIMIT 1;
    
    -- Check permissions (analyst+ can view team metrics)
    IF user_role_level NOT IN ('analyst', 'admin', 'owner') THEN
        RAISE EXCEPTION 'Insufficient permissions for team metrics';
    END IF;

    -- Build team metrics
    WITH team_users AS (
        SELECT user_id 
        FROM org_roles 
        WHERE org_id = team_org_id
    ),
    team_events AS (
        SELECT e.*, c.id as contact_id_check, pr.visibility
        FROM events e
        LEFT JOIN contacts c ON e.contact_id = c.id
        LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
        WHERE e.user_id IN (SELECT user_id FROM team_users)
        AND (
            e.user_id = requesting_user_id OR  -- Own data
            pr.visibility IN ('team', 'public') OR  -- Team visible
            pr.visibility IS NULL OR  -- No privacy rule (default team)
            user_role_level IN ('admin', 'owner')  -- Admin override
        )
    ),
    leaderboard AS (
        SELECT 
            u.user_id,
            u.email,
            COUNT(te.*) as total_events,
            COUNT(*) FILTER (WHERE te.type = 'call') as total_calls,
            COUNT(*) FILTER (WHERE te.type = 'sms') as total_sms,
            RANK() OVER (ORDER BY COUNT(te.*) DESC) as rank
        FROM team_users tu
        LEFT JOIN auth.users u ON tu.user_id = u.id
        LEFT JOIN team_events te ON tu.user_id = te.user_id
        GROUP BY u.user_id, u.email
        ORDER BY total_events DESC
        LIMIT 10
    )
    SELECT jsonb_build_object(
        'total_team_events', (SELECT COUNT(*) FROM team_events),
        'total_team_calls', (SELECT COUNT(*) FROM team_events WHERE type = 'call'),
        'total_team_sms', (SELECT COUNT(*) FROM team_events WHERE type = 'sms'),
        'team_size', (SELECT COUNT(*) FROM team_users),
        'leaderboard', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'user_id', user_id,
                    'email', email,
                    'total_events', total_events,
                    'total_calls', total_calls,
                    'total_sms', total_sms,
                    'rank', rank
                )
            ) FROM leaderboard
        ),
        'generated_at', extract(epoch from now())
    ) INTO metrics;

    RETURN metrics;
END;
$$;

-- ============================================================================
-- DATA ACCESS FUNCTIONS
-- ============================================================================

-- Get filtered events with privacy rules and anonymization
CREATE OR REPLACE FUNCTION get_filtered_events(
    requesting_user_id UUID,
    target_user_id UUID,
    event_limit INTEGER DEFAULT 1000,
    event_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    line_id TEXT,
    ts TIMESTAMPTZ,   
    number TEXT,
    direction event_direction,
    type event_type,
    duration INTEGER,
    content TEXT,
    contact_id UUID,
    contact_name TEXT,
    source TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    requesting_role user_role;
BEGIN
    -- Check basic access
    requesting_role := get_user_org_role(requesting_user_id, target_user_id);
    
    IF NOT (
        target_user_id = requesting_user_id OR 
        requesting_role IN ('member', 'analyst', 'admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Return filtered events with privacy applied
    RETURN QUERY
    SELECT 
        e.id,
        e.user_id,
        e.line_id,
        e.ts,
        CASE 
            WHEN pr.anonymize_number = true AND e.user_id != requesting_user_id
            THEN anonymize_phone_number(e.number)
            ELSE e.number 
        END as number,
        e.direction,
        e.type,
        e.duration,
        CASE 
            WHEN pr.anonymize_content = true AND e.user_id != requesting_user_id
            THEN '[Content Hidden]'
            ELSE e.content 
        END as content,
        e.contact_id,
        c.name as contact_name,
        e.source,
        e.created_at
    FROM events e
    LEFT JOIN contacts c ON e.contact_id = c.id
    LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
    WHERE e.user_id = target_user_id
    AND (
        e.user_id = requesting_user_id OR  -- Own data
        pr.visibility IN ('team', 'public') OR  -- Team/public visible
        pr.visibility IS NULL OR  -- Default team visibility
        requesting_role IN ('admin', 'owner')  -- Admin override
    )
    ORDER BY e.ts DESC
    LIMIT event_limit OFFSET event_offset;
END;
$$;

-- Get contact intelligence profile
CREATE OR REPLACE FUNCTION get_contact_intelligence(
    requesting_user_id UUID, 
    target_contact_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    contact_info JSONB;
    contact_owner_id UUID;
    requesting_role user_role;
BEGIN
    -- Get contact owner
    SELECT user_id INTO contact_owner_id
    FROM contacts WHERE id = target_contact_id;
    
    IF contact_owner_id IS NULL THEN
        RAISE EXCEPTION 'Contact not found';
    END IF;
    
    -- Check access permissions
    requesting_role := get_user_org_role(requesting_user_id, contact_owner_id);
    
    IF NOT (
        contact_owner_id = requesting_user_id OR
        requesting_role IN ('member', 'analyst', 'admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Build contact intelligence
    SELECT jsonb_build_object(
        'contact_id', c.id,
        'name', c.name,
        'number', CASE 
            WHEN pr.anonymize_number = true AND c.user_id != requesting_user_id
            THEN anonymize_phone_number(c.number)
            ELSE c.number 
        END,
        'company', c.company,
        'tags', c.tags,
        'first_seen', c.first_seen,
        'last_seen', c.last_seen,
        'total_calls', c.total_calls,
        'total_sms', c.total_sms,
        'avg_call_duration', (
            SELECT ROUND(AVG(duration) / 60.0, 1)
            FROM events 
            WHERE contact_id = target_contact_id AND type = 'call'
        ),
        'last_7_days_activity', (
            SELECT COUNT(*)
            FROM events 
            WHERE contact_id = target_contact_id 
            AND ts >= NOW() - INTERVAL '7 days'
        ),
        'communication_pattern', (
            SELECT jsonb_object_agg(
                EXTRACT(hour FROM ts)::TEXT,
                COUNT(*)
            )
            FROM events 
            WHERE contact_id = target_contact_id
            GROUP BY EXTRACT(hour FROM ts)
        ),
        'recent_activity', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'ts', ts,
                    'type', type,
                    'direction', direction,
                    'duration', duration
                )
                ORDER BY ts DESC
            )
            FROM events 
            WHERE contact_id = target_contact_id
            ORDER BY ts DESC 
            LIMIT 10
        )
    )
    INTO contact_info
    FROM contacts c
    LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
    WHERE c.id = target_contact_id;

    RETURN contact_info;
END;
$$;

-- ============================================================================
-- DATA QUALITY FUNCTIONS
-- ============================================================================

-- Detect data gaps and potential missing periods
CREATE OR REPLACE FUNCTION detect_data_gaps(
    target_user_id UUID,
    threshold_hours INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    gaps JSONB;
BEGIN
    -- Check access
    IF NOT (
        target_user_id = auth.uid() OR 
        get_user_org_role(auth.uid(), target_user_id) IN ('admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Find significant gaps in event timeline
    WITH event_timeline AS (
        SELECT 
            ts,
            LAG(ts) OVER (ORDER BY ts) as prev_ts
        FROM events 
        WHERE user_id = target_user_id
        ORDER BY ts
    ),
    significant_gaps AS (
        SELECT 
            prev_ts as gap_start,
            ts as gap_end,
            EXTRACT(epoch FROM (ts - prev_ts))/3600 as gap_hours
        FROM event_timeline
        WHERE prev_ts IS NOT NULL
        AND EXTRACT(epoch FROM (ts - prev_ts))/3600 > threshold_hours
        ORDER BY gap_hours DESC
        LIMIT 20
    )
    SELECT jsonb_build_object(
        'threshold_hours', threshold_hours,
        'gaps_found', (SELECT COUNT(*) FROM significant_gaps),
        'largest_gap_hours', (SELECT MAX(gap_hours) FROM significant_gaps),
        'gaps', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'start', gap_start,
                    'end', gap_end,
                    'duration_hours', ROUND(gap_hours, 1)
                )
                ORDER BY gap_hours DESC
            )
            FROM significant_gaps
        ),
        'analysis_date', NOW()
    ) INTO gaps;

    RETURN gaps;
END;
$$;

-- Analyze sync health and drift
CREATE OR REPLACE FUNCTION analyze_sync_health(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    health_report JSONB;
BEGIN
    -- Check access
    IF NOT (
        target_user_id = auth.uid() OR 
        get_user_org_role(auth.uid(), target_user_id) IN ('admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Analyze sync health across sources
    SELECT jsonb_build_object(
        'sources', (
            SELECT jsonb_object_agg(
                source,
                jsonb_build_object(
                    'last_sync', sh.last_sync,
                    'queue_depth', sh.queue_depth,
                    'drift_percentage', sh.drift_percentage,
                    'status', sh.status,
                    'error_message', sh.error_message,
                    'recent_events', (
                        SELECT COUNT(*)
                        FROM events e
                        WHERE e.user_id = target_user_id 
                        AND e.source = sh.source
                        AND e.created_at >= NOW() - INTERVAL '24 hours'
                    )
                )
            )
            FROM sync_health sh
            WHERE sh.user_id = target_user_id
        ),
        'overall_health', (
            CASE 
                WHEN EXISTS(SELECT 1 FROM sync_health WHERE user_id = target_user_id AND status = 'error') THEN 'error'
                WHEN EXISTS(SELECT 1 FROM sync_health WHERE user_id = target_user_id AND status = 'warning') THEN 'warning'
                ELSE 'healthy'
            END
        ),
        'total_queue_depth', (
            SELECT COALESCE(SUM(queue_depth), 0) 
            FROM sync_health 
            WHERE user_id = target_user_id
        ),
        'analysis_date', NOW()
    ) INTO health_report;

    RETURN health_report;
END;
$$;

-- ============================================================================
-- TREND ANALYSIS FUNCTIONS
-- ============================================================================

-- Get communication trends for forecasting
CREATE OR REPLACE FUNCTION get_communication_trends(
    target_user_id UUID,
    days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    trends JSONB;
BEGIN
    -- Check access
    IF NOT (
        target_user_id = auth.uid() OR 
        get_user_org_role(auth.uid(), target_user_id) IN ('analyst', 'admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Calculate trends over specified period
    WITH daily_stats AS (
        SELECT 
            DATE(ts) as event_date,
            COUNT(*) as total_events,
            COUNT(*) FILTER (WHERE type = 'call') as calls,
            COUNT(*) FILTER (WHERE type = 'sms') as sms,
            COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
            COUNT(*) FILTER (WHERE direction = 'outbound') as outbound
        FROM events 
        WHERE user_id = target_user_id 
        AND ts >= NOW() - (days || ' days')::INTERVAL
        GROUP BY DATE(ts)
        ORDER BY event_date
    )
    SELECT jsonb_build_object(
        'period_days', days,
        'total_events', (SELECT SUM(total_events) FROM daily_stats),
        'avg_daily_events', (SELECT ROUND(AVG(total_events), 1) FROM daily_stats),
        'trend_slope', (
            -- Simple linear regression slope
            SELECT ROUND(
                (COUNT(*) * SUM(date_num * total_events) - SUM(date_num) * SUM(total_events)) /
                (COUNT(*) * SUM(date_num * date_num) - SUM(date_num) * SUM(date_num))
            , 2)
            FROM (
                SELECT 
                    total_events,
                    ROW_NUMBER() OVER (ORDER BY event_date) as date_num
                FROM daily_stats
            ) t
        ),
        'daily_breakdown', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'date', event_date,
                    'total_events', total_events,
                    'calls', calls,
                    'sms', sms,
                    'inbound', inbound,
                    'outbound', outbound
                )
                ORDER BY event_date
            )
            FROM daily_stats
        ),
        'generated_at', NOW()
    ) INTO trends;

    RETURN trends;
END;
$$;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Additional indexes for function performance
CREATE INDEX IF NOT EXISTS idx_events_user_type_ts ON events(user_id, type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_contact_ts ON events(contact_id, ts DESC) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_source_created ON events(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_user_first_seen ON contacts(user_id, first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_sync_health_user_status ON sync_health(user_id, status);

-- Function usage examples and documentation
COMMENT ON FUNCTION get_dashboard_metrics(UUID) IS 'Returns comprehensive dashboard metrics for a user. Respects RLS and privacy rules.';
COMMENT ON FUNCTION get_filtered_events(UUID, UUID, INTEGER, INTEGER) IS 'Returns events with privacy filtering and anonymization applied based on requesting user permissions.';
COMMENT ON FUNCTION detect_data_gaps(UUID, INTEGER) IS 'Identifies significant gaps in event timeline that may indicate missing data or sync issues.';
-- ============================================================================
-- TIME-SERIES AND DATE RANGE FUNCTIONS
-- ============================================================================

-- Get time-series data for dashboard charts (hourly/daily/weekly aggregations)
CREATE OR REPLACE FUNCTION get_time_series_data(
    target_user_id UUID,
    date_from TIMESTAMPTZ,
    date_to TIMESTAMPTZ,
    granularity TEXT DEFAULT 'daily'  -- 'hourly', 'daily', 'weekly'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    time_series JSONB;
    interval_format TEXT;
    date_trunc_unit TEXT;
BEGIN
    -- Check access
    IF NOT (
        target_user_id = auth.uid() OR 
        get_user_org_role(auth.uid(), target_user_id) IN ('analyst', 'admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    -- Set format based on granularity
    CASE granularity
        WHEN 'hourly' THEN 
            date_trunc_unit := 'hour';
            interval_format := 'YYYY-MM-DD HH24:00';
        WHEN 'weekly' THEN 
            date_trunc_unit := 'week';
            interval_format := 'YYYY-"W"WW';
        ELSE 
            date_trunc_unit := 'day';
            interval_format := 'YYYY-MM-DD';
    END CASE;

    -- Generate time series with privacy filtering
    WITH time_buckets AS (
        SELECT 
            date_trunc(date_trunc_unit, e.ts) as time_bucket,
            COUNT(*) as total_events,
            COUNT(*) FILTER (WHERE e.type = 'call') as calls,
            COUNT(*) FILTER (WHERE e.type = 'sms') as sms,
            COUNT(*) FILTER (WHERE e.direction = 'inbound') as inbound,
            COUNT(*) FILTER (WHERE e.direction = 'outbound') as outbound,
            COUNT(DISTINCT e.contact_id) FILTER (WHERE e.contact_id IS NOT NULL) as unique_contacts,
            ROUND(AVG(e.duration) FILTER (WHERE e.type = 'call' AND e.duration IS NOT NULL), 1) as avg_duration
        FROM events e
        LEFT JOIN contacts c ON e.contact_id = c.id
        LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
        WHERE e.user_id = target_user_id
        AND e.ts >= date_from 
        AND e.ts <= date_to
        AND (
            e.user_id = auth.uid() OR
            pr.visibility IN ('team', 'public') OR
            pr.visibility IS NULL OR
            get_user_org_role(auth.uid(), target_user_id) IN ('admin', 'owner')
        )
        GROUP BY date_trunc(date_trunc_unit, e.ts)
        ORDER BY time_bucket
    )
    SELECT jsonb_build_object(
        'granularity', granularity,
        'date_from', date_from,
        'date_to', date_to,
        'total_periods', (SELECT COUNT(*) FROM time_buckets),
        'summary', jsonb_build_object(
            'total_events', (SELECT SUM(total_events) FROM time_buckets),
            'total_calls', (SELECT SUM(calls) FROM time_buckets),
            'total_sms', (SELECT SUM(sms) FROM time_buckets),
            'avg_events_per_period', (SELECT ROUND(AVG(total_events), 1) FROM time_buckets),
            'peak_period', (SELECT time_bucket FROM time_buckets ORDER BY total_events DESC LIMIT 1)
        ),
        'data', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'time_bucket', to_char(time_bucket, interval_format),
                    'timestamp', time_bucket,
                    'total_events', total_events,
                    'calls', calls,
                    'sms', sms,
                    'inbound', inbound,
                    'outbound', outbound,
                    'unique_contacts', unique_contacts,
                    'avg_duration', avg_duration
                )
                ORDER BY time_bucket
            )
            FROM time_buckets
        ),
        'generated_at', NOW()
    ) INTO time_series;

    RETURN time_series;
END;
$$;

-- Get heat-map data for activity visualization (hour vs day of week)
CREATE OR REPLACE FUNCTION get_activity_heatmap(
    target_user_id UUID,
    days_back INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    heatmap_data JSONB;
BEGIN
    -- Check access
    IF NOT (
        target_user_id = auth.uid() OR 
        get_user_org_role(auth.uid(), target_user_id) IN ('analyst', 'admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Generate heat-map data (hour vs day of week)
    WITH activity_matrix AS (
        SELECT 
            EXTRACT(dow FROM e.ts)::INTEGER as day_of_week, -- 0=Sunday, 6=Saturday
            EXTRACT(hour FROM e.ts)::INTEGER as hour_of_day,
            COUNT(*) as activity_count
        FROM events e
        LEFT JOIN contacts c ON e.contact_id = c.id
        LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
        WHERE e.user_id = target_user_id
        AND e.ts >= NOW() - (days_back || ' days')::INTERVAL
        AND (
            e.user_id = auth.uid() OR
            pr.visibility IN ('team', 'public') OR
            pr.visibility IS NULL OR
            get_user_org_role(auth.uid(), target_user_id) IN ('admin', 'owner')
        )
        GROUP BY EXTRACT(dow FROM e.ts), EXTRACT(hour FROM e.ts)
    ),
    max_activity AS (
        SELECT MAX(activity_count) as max_count 
        FROM activity_matrix
    )
    SELECT jsonb_build_object(
        'days_analyzed', days_back,
        'max_activity', (SELECT max_count FROM max_activity),
        'data', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'day_of_week', day_of_week,
                    'hour', hour_of_day,
                    'count', activity_count,
                    'intensity', ROUND((activity_count::DECIMAL / NULLIF((SELECT max_count FROM max_activity), 0)) * 100, 1)
                )
            )
            FROM activity_matrix
        ),
        'day_labels', jsonb_build_array('Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'),
        'generated_at', NOW()
    ) INTO heatmap_data;

    RETURN heatmap_data;
END;
$$;

-- ============================================================================
-- SEARCH AND FILTERING FUNCTIONS
-- ============================================================================

-- Advanced contact search with full-text and fuzzy matching
CREATE OR REPLACE FUNCTION search_contacts(
    requesting_user_id UUID,
    search_query TEXT,
    search_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    number TEXT,
    name TEXT,
    company TEXT,
    tags TEXT[],
    total_calls INTEGER,
    total_sms INTEGER,
    last_seen TIMESTAMPTZ,
    search_rank REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    -- Return contacts with search ranking
    RETURN QUERY
    SELECT 
        c.id,
        c.user_id,
        CASE 
            WHEN pr.anonymize_number = true AND c.user_id != requesting_user_id
            THEN anonymize_phone_number(c.number)
            ELSE c.number 
        END as number,
        c.name,
        c.company,
        c.tags,
        c.total_calls,
        c.total_sms,
        c.last_seen,
        (
            ts_rank(to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.company, '')), 
                    plainto_tsquery('english', search_query)) +
            CASE WHEN c.number ILIKE '%' || search_query || '%' THEN 1.0 ELSE 0.0 END +
            CASE WHEN search_query = ANY(c.tags) THEN 0.5 ELSE 0.0 END
        )::REAL as search_rank
    FROM contacts c
    LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
    WHERE (
        -- Text search in name and company
        to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.company, '')) @@ plainto_tsquery('english', search_query) OR
        -- Phone number search
        c.number ILIKE '%' || search_query || '%' OR
        -- Tag search
        search_query = ANY(c.tags)
    )
    AND (
        c.user_id = requesting_user_id OR
        (
            same_organization(requesting_user_id, c.user_id) AND
            can_access_contact(c.id) AND
            requesting_user_id = auth.uid()
        )
    )
    ORDER BY search_rank DESC, c.last_seen DESC
    LIMIT search_limit;
END;
$$;

-- Advanced event filtering with date ranges and criteria
CREATE OR REPLACE FUNCTION filter_events(
    requesting_user_id UUID,
    target_user_id UUID DEFAULT NULL,
    event_types event_type[] DEFAULT NULL,
    directions event_direction[] DEFAULT NULL,
    date_from TIMESTAMPTZ DEFAULT NULL,
    date_to TIMESTAMPTZ DEFAULT NULL,
    contact_ids UUID[] DEFAULT NULL,
    sources TEXT[] DEFAULT NULL,
    content_search TEXT DEFAULT NULL,
    min_duration INTEGER DEFAULT NULL,
    max_duration INTEGER DEFAULT NULL,
    event_limit INTEGER DEFAULT 1000,
    event_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    line_id TEXT,
    ts TIMESTAMPTZ,
    number TEXT,
    direction event_direction,
    type event_type,
    duration INTEGER,
    content TEXT,
    contact_id UUID,
    contact_name TEXT,
    source TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    effective_target_user_id UUID;
    requesting_role user_role;
BEGIN
    -- Default to requesting user if no target specified
    effective_target_user_id := COALESCE(target_user_id, requesting_user_id);
    
    -- Check access permissions
    requesting_role := get_user_org_role(requesting_user_id, effective_target_user_id);
    
    IF NOT (
        effective_target_user_id = requesting_user_id OR 
        requesting_role IN ('member', 'analyst', 'admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Return filtered events with all criteria applied
    RETURN QUERY
    SELECT 
        e.id,
        e.user_id,
        e.line_id,
        e.ts,
        CASE 
            WHEN pr.anonymize_number = true AND e.user_id != requesting_user_id
            THEN anonymize_phone_number(e.number)
            ELSE e.number 
        END as number,
        e.direction,
        e.type,
        e.duration,
        CASE 
            WHEN pr.anonymize_content = true AND e.user_id != requesting_user_id
            THEN '[Content Hidden]'
            ELSE e.content 
        END as content,
        e.contact_id,
        c.name as contact_name,
        e.source,
        e.created_at
    FROM events e
    LEFT JOIN contacts c ON e.contact_id = c.id
    LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
    WHERE e.user_id = effective_target_user_id
    AND (
        e.user_id = requesting_user_id OR
        pr.visibility IN ('team', 'public') OR
        pr.visibility IS NULL OR
        requesting_role IN ('admin', 'owner')
    )
    AND (event_types IS NULL OR e.type = ANY(event_types))
    AND (directions IS NULL OR e.direction = ANY(directions))
    AND (date_from IS NULL OR e.ts >= date_from)
    AND (date_to IS NULL OR e.ts <= date_to)
    AND (contact_ids IS NULL OR e.contact_id = ANY(contact_ids))
    AND (sources IS NULL OR e.source = ANY(sources))
    AND (content_search IS NULL OR e.content ILIKE '%' || content_search || '%')
    AND (min_duration IS NULL OR e.duration >= min_duration)
    AND (max_duration IS NULL OR e.duration <= max_duration)
    ORDER BY e.ts DESC
    LIMIT event_limit OFFSET event_offset;
END;
$$;

-- ============================================================================
-- ADVANCED ANALYTICS FUNCTIONS
-- ============================================================================

-- Analyze call patterns and communication behavior
CREATE OR REPLACE FUNCTION analyze_call_patterns(
    target_user_id UUID,
    analysis_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    patterns JSONB;
BEGIN
    -- Check access
    IF NOT (
        target_user_id = auth.uid() OR 
        get_user_org_role(auth.uid(), target_user_id) IN ('analyst', 'admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Analyze comprehensive call patterns
    WITH call_analysis AS (
        SELECT 
            COUNT(*) FILTER (WHERE type = 'call') as total_calls,
            COUNT(*) FILTER (WHERE type = 'sms') as total_sms,
            COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
            COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_count,
            ROUND(AVG(duration) FILTER (WHERE type = 'call' AND duration IS NOT NULL), 1) as avg_call_duration,
            ROUND(STDDEV(duration) FILTER (WHERE type = 'call' AND duration IS NOT NULL), 1) as duration_stddev,
            MAX(duration) FILTER (WHERE type = 'call') as max_call_duration,
            MIN(duration) FILTER (WHERE type = 'call' AND duration > 0) as min_call_duration
        FROM events e
        LEFT JOIN contacts c ON e.contact_id = c.id
        LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
        WHERE e.user_id = target_user_id
        AND e.ts >= NOW() - (analysis_days || ' days')::INTERVAL
        AND (
            e.user_id = auth.uid() OR
            pr.visibility IN ('team', 'public') OR
            pr.visibility IS NULL OR
            get_user_org_role(auth.uid(), target_user_id) IN ('admin', 'owner')
        )
    ),
    hourly_patterns AS (
        SELECT 
            EXTRACT(hour FROM ts)::INTEGER as hour,
            COUNT(*) as event_count,
            COUNT(*) FILTER (WHERE type = 'call') as call_count,
            ROUND(AVG(duration) FILTER (WHERE type = 'call' AND duration IS NOT NULL), 1) as avg_duration
        FROM events e
        LEFT JOIN contacts c ON e.contact_id = c.id
        LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
        WHERE e.user_id = target_user_id
        AND e.ts >= NOW() - (analysis_days || ' days')::INTERVAL
        AND (
            e.user_id = auth.uid() OR
            pr.visibility IN ('team', 'public') OR
            pr.visibility IS NULL OR
            get_user_org_role(auth.uid(), target_user_id) IN ('admin', 'owner')
        )
        GROUP BY EXTRACT(hour FROM ts)
        ORDER BY event_count DESC
    ),
    duration_buckets AS (
        SELECT 
            CASE 
                WHEN duration <= 30 THEN '0-30s'
                WHEN duration <= 60 THEN '31-60s'
                WHEN duration <= 180 THEN '1-3min'
                WHEN duration <= 600 THEN '3-10min'
                WHEN duration <= 1800 THEN '10-30min'
                ELSE '30min+'
            END as duration_bucket,
            COUNT(*) as call_count
        FROM events 
        WHERE user_id = target_user_id 
        AND type = 'call' 
        AND duration IS NOT NULL
        AND ts >= NOW() - (analysis_days || ' days')::INTERVAL
        GROUP BY duration_bucket
        ORDER BY MIN(duration)
    )
    SELECT jsonb_build_object(
        'analysis_period_days', analysis_days,
        'summary', (SELECT to_jsonb(ca) FROM call_analysis ca),
        'peak_hours', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'hour', hour,
                    'event_count', event_count,
                    'call_count', call_count,
                    'avg_duration', avg_duration
                )
                ORDER BY event_count DESC
            )
            FROM (SELECT * FROM hourly_patterns LIMIT 5) top_hours
        ),
        'duration_distribution', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'bucket', duration_bucket,
                    'count', call_count,
                    'percentage', ROUND((call_count * 100.0 / SUM(call_count) OVER()), 1)
                )
                ORDER BY MIN(CASE 
                    WHEN duration_bucket = '0-30s' THEN 1
                    WHEN duration_bucket = '31-60s' THEN 2
                    WHEN duration_bucket = '1-3min' THEN 3
                    WHEN duration_bucket = '3-10min' THEN 4
                    WHEN duration_bucket = '10-30min' THEN 5
                    ELSE 6
                END)
            )
            FROM duration_buckets
        ),
        'generated_at', NOW()
    ) INTO patterns;

    RETURN patterns;
END;
$$;

-- Get comprehensive contact communication summary
CREATE OR REPLACE FUNCTION get_contact_communication_summary(
    requesting_user_id UUID,
    target_contact_id UUID,
    days_back INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    summary JSONB;
    contact_owner_id UUID;
BEGIN
    -- Get contact owner and check access
    SELECT user_id INTO contact_owner_id
    FROM contacts WHERE id = target_contact_id;
    
    IF contact_owner_id IS NULL THEN
        RAISE EXCEPTION 'Contact not found';
    END IF;
    
    IF NOT (
        contact_owner_id = requesting_user_id OR
        get_user_org_role(requesting_user_id, contact_owner_id) IN ('member', 'analyst', 'admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Build comprehensive communication summary
    WITH communication_stats AS (
        SELECT 
            COUNT(*) as total_interactions,
            COUNT(*) FILTER (WHERE type = 'call') as total_calls,
            COUNT(*) FILTER (WHERE type = 'sms') as total_sms,
            COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
            COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_count,
            ROUND(AVG(duration) FILTER (WHERE type = 'call' AND duration IS NOT NULL), 1) as avg_call_duration,
            SUM(duration) FILTER (WHERE type = 'call' AND duration IS NOT NULL) as total_call_time,
            MAX(ts) as last_interaction,
            MIN(ts) as first_interaction
        FROM events 
        WHERE contact_id = target_contact_id
        AND ts >= NOW() - (days_back || ' days')::INTERVAL
    ),
    daily_activity AS (
        SELECT 
            DATE(ts) as activity_date,
            COUNT(*) as interactions,
            COUNT(*) FILTER (WHERE type = 'call') as calls,
            COUNT(*) FILTER (WHERE type = 'sms') as sms
        FROM events 
        WHERE contact_id = target_contact_id
        AND ts >= NOW() - (days_back || ' days')::INTERVAL
        GROUP BY DATE(ts)
        ORDER BY activity_date DESC
        LIMIT 30
    )
    SELECT jsonb_build_object(
        'contact_id', target_contact_id,
        'analysis_period_days', days_back,
        'summary', (SELECT to_jsonb(cs) FROM communication_stats cs),
        'recent_daily_activity', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'date', activity_date,
                    'interactions', interactions,
                    'calls', calls,
                    'sms', sms
                )
                ORDER BY activity_date DESC
            )
            FROM daily_activity
        ),
        'generated_at', NOW()
    ) INTO summary;

    RETURN summary;
END;
$$;

-- ============================================================================
-- FUNCTION COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION get_dashboard_metrics(UUID) IS 'Returns comprehensive dashboard metrics for a user. Respects RLS and privacy rules.';
COMMENT ON FUNCTION get_filtered_events(UUID, UUID, INTEGER, INTEGER) IS 'Returns events with privacy filtering and anonymization applied based on requesting user permissions.';
COMMENT ON FUNCTION detect_data_gaps(UUID, INTEGER) IS 'Identifies significant gaps in event timeline that may indicate missing data or sync issues.';
COMMENT ON FUNCTION get_contact_intelligence(UUID, UUID) IS 'Returns detailed contact profile with communication patterns and recent activity.';
COMMENT ON FUNCTION anonymize_phone_number(TEXT) IS 'Utility function for consistent phone number anonymization across the platform.';
COMMENT ON FUNCTION get_time_series_data(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) IS 'Returns time-series data for dashboard charts with configurable granularity (hourly/daily/weekly).';
COMMENT ON FUNCTION get_activity_heatmap(UUID, INTEGER) IS 'Returns heat-map data showing activity patterns by hour and day of week.';
COMMENT ON FUNCTION search_contacts(UUID, TEXT, INTEGER) IS 'Advanced contact search with full-text search, fuzzy matching, and privacy filtering.';
COMMENT ON FUNCTION filter_events(UUID, UUID, event_type[], event_direction[], TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[], TEXT, INTEGER, INTEGER, INTEGER, INTEGER) IS 'Comprehensive event filtering with multiple criteria and privacy controls.';
COMMENT ON FUNCTION analyze_call_patterns(UUID, INTEGER) IS 'Analyzes call patterns including duration distribution, peak hours, and communication behavior.';
COMMENT ON FUNCTION get_contact_communication_summary(UUID, UUID, INTEGER) IS 'Returns comprehensive communication summary for a specific contact including trends and activity patterns.';