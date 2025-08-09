-- Contact Intelligence System Database Functions
-- Enhanced functions for comprehensive contact profiling, search, and analytics
-- Includes privacy-aware access control and performance optimizations

-- ============================================================================
-- CONTACT INTELLIGENCE FUNCTIONS
-- ============================================================================

-- Enhanced contact intelligence function with comprehensive analytics
CREATE OR REPLACE FUNCTION get_enhanced_contact_intelligence(
    p_requesting_user_id UUID,
    p_target_contact_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    contact_record RECORD;
    contact_metrics JSONB;
    communication_patterns JSONB;
    recent_events JSONB;
    privacy_level TEXT;
    user_role_level user_role;
    can_access BOOLEAN := FALSE;
BEGIN
    -- Get contact details
    SELECT c.*, pr.visibility
    INTO contact_record
    FROM contacts c
    LEFT JOIN privacy_rules pr ON pr.contact_id = c.id
    WHERE c.id = p_target_contact_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contact not found';
    END IF;
    
    -- Get user's role for access control
    user_role_level := get_user_org_role(p_requesting_user_id, contact_record.user_id);
    privacy_level := COALESCE(contact_record.visibility, 'team');
    
    -- Determine access permissions
    can_access := (
        contact_record.user_id = p_requesting_user_id OR  -- Own contact
        (privacy_level = 'public') OR  -- Public contact
        (privacy_level = 'team' AND user_role_level IN ('owner', 'admin', 'analyst', 'member')) OR  -- Team access
        (user_role_level IN ('owner', 'admin'))  -- Admin override
    );
    
    IF NOT can_access THEN
        RAISE EXCEPTION 'Access denied to contact intelligence';
    END IF;
    
    -- Calculate comprehensive contact metrics
    WITH event_stats AS (
        SELECT 
            COUNT(*) as total_interactions,
            COUNT(*) FILTER (WHERE type = 'call') as total_calls,
            COUNT(*) FILTER (WHERE type = 'sms') as total_sms,
            AVG(duration) FILTER (WHERE type = 'call' AND duration IS NOT NULL) as avg_call_duration,
            MAX(ts) as last_contact,
            MIN(ts) as first_contact,
            -- Communication frequency (interactions per day)
            COUNT(*)::float / GREATEST(1, EXTRACT(days FROM (MAX(ts) - MIN(ts)))) as contact_frequency,
            -- Most active hour
            MODE() WITHIN GROUP (ORDER BY EXTRACT(hour FROM ts)) as most_active_hour,
            -- Most active day of week (0=Sunday)
            MODE() WITHIN GROUP (ORDER BY EXTRACT(dow FROM ts)) as most_active_day,
            -- Inbound vs outbound ratio
            COUNT(*) FILTER (WHERE direction = 'inbound')::float / GREATEST(1, COUNT(*)) as inbound_ratio
        FROM events 
        WHERE contact_id = p_target_contact_id
    ),
    hourly_pattern AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'hour', hour_val,
                'count', COALESCE(hourly_counts.count, 0)
            ) ORDER BY hour_val
        ) as hourly_distribution
        FROM generate_series(0, 23) as hour_val
        LEFT JOIN (
            SELECT 
                EXTRACT(hour FROM ts) as hour,
                COUNT(*) as count
            FROM events 
            WHERE contact_id = p_target_contact_id
            GROUP BY EXTRACT(hour FROM ts)
        ) hourly_counts ON hourly_counts.hour = hour_val
    ),
    daily_pattern AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'day', day_name,
                'calls', COALESCE(daily_counts.calls, 0),
                'sms', COALESCE(daily_counts.sms, 0)
            ) ORDER BY day_num
        ) as daily_distribution
        FROM (
            VALUES 
                (0, 'Sunday'), (1, 'Monday'), (2, 'Tuesday'), (3, 'Wednesday'),
                (4, 'Thursday'), (5, 'Friday'), (6, 'Saturday')
        ) as days(day_num, day_name)
        LEFT JOIN (
            SELECT 
                EXTRACT(dow FROM ts) as dow,
                COUNT(*) FILTER (WHERE type = 'call') as calls,
                COUNT(*) FILTER (WHERE type = 'sms') as sms
            FROM events 
            WHERE contact_id = p_target_contact_id
            GROUP BY EXTRACT(dow FROM ts)
        ) daily_counts ON daily_counts.dow = days.day_num
    ),
    monthly_trends AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'month', to_char(month_date, 'YYYY-MM'),
                'total', COALESCE(monthly_counts.total, 0)
            ) ORDER BY month_date DESC
        ) as monthly_trends
        FROM generate_series(
            date_trunc('month', NOW() - interval '12 months'),
            date_trunc('month', NOW()),
            '1 month'::interval
        ) as month_date
        LEFT JOIN (
            SELECT 
                date_trunc('month', ts) as month,
                COUNT(*) as total
            FROM events 
            WHERE contact_id = p_target_contact_id
            AND ts >= NOW() - interval '12 months'
            GROUP BY date_trunc('month', ts)
        ) monthly_counts ON monthly_counts.month = month_date
    )
    SELECT 
        jsonb_build_object(
            'total_interactions', COALESCE(es.total_interactions, 0),
            'total_calls', COALESCE(es.total_calls, 0),
            'total_sms', COALESCE(es.total_sms, 0),
            'avg_call_duration', ROUND(COALESCE(es.avg_call_duration, 0)::numeric, 2),
            'most_active_hour', COALESCE(es.most_active_hour, 12),
            'most_active_day', COALESCE(es.most_active_day, 1),
            'last_contact', es.last_contact,
            'first_contact', es.first_contact,
            'contact_frequency', ROUND(COALESCE(es.contact_frequency, 0)::numeric, 2),
            'inbound_ratio', ROUND(COALESCE(es.inbound_ratio, 0.5)::numeric, 3)
        ) INTO contact_metrics
    FROM event_stats es;
    
    -- Get communication patterns
    SELECT 
        jsonb_build_object(
            'hourly_distribution', hp.hourly_distribution,
            'daily_distribution', dp.daily_distribution,
            'monthly_trends', mt.monthly_trends
        ) INTO communication_patterns
    FROM hourly_pattern hp, daily_pattern dp, monthly_trends mt;
    
    -- Get recent events (last 20, privacy-aware)
    WITH recent_activity AS (
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'id', e.id,
                    'ts', e.ts,
                    'type', e.type,
                    'direction', e.direction,
                    'duration', e.duration,
                    'content', CASE 
                        WHEN privacy_level = 'private' AND contact_record.user_id != p_requesting_user_id 
                        THEN '[PRIVATE]'
                        ELSE e.content 
                    END,
                    'source', e.source
                ) ORDER BY e.ts DESC
            ) as events
        FROM events e
        WHERE e.contact_id = p_target_contact_id
        ORDER BY e.ts DESC
        LIMIT 20
    )
    SELECT COALESCE(ra.events, '[]'::jsonb) INTO recent_events FROM recent_activity ra;
    
    -- Build final response with privacy considerations
    RETURN jsonb_build_object(
        'contact', jsonb_build_object(
            'id', contact_record.id,
            'number', CASE 
                WHEN privacy_level = 'private' AND contact_record.user_id != p_requesting_user_id
                THEN anonymize_phone_number(contact_record.number)
                ELSE contact_record.number
            END,
            'name', contact_record.name,
            'company', contact_record.company,
            'tags', contact_record.tags,
            'first_seen', contact_record.first_seen,
            'last_seen', contact_record.last_seen
        ),
        'metrics', contact_metrics,
        'communication_patterns', communication_patterns,
        'recent_events', recent_events,
        'privacy_level', privacy_level,
        'can_edit', contact_record.user_id = p_requesting_user_id OR user_role_level IN ('owner', 'admin')
    );
END;
$$;

-- Advanced contact search with privacy awareness and relevance scoring
CREATE OR REPLACE FUNCTION search_contacts(
    p_user_id UUID,
    p_search_term TEXT DEFAULT '',
    p_tag_filter TEXT[] DEFAULT '{}',
    p_sort_by TEXT DEFAULT 'relevance', -- relevance, alphabetical, recent, most_active
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    contact_id UUID,
    number TEXT,
    name TEXT,
    company TEXT,
    tags TEXT[],
    total_interactions INTEGER,
    last_contact TIMESTAMPTZ,
    contact_score FLOAT,
    match_score FLOAT,
    privacy_level TEXT,
    can_access BOOLEAN
) 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    user_role_level user_role;
    search_query tsquery;
BEGIN
    -- Get user's role for access control across organization
    SELECT COALESCE(
        (SELECT role FROM org_roles WHERE user_id = p_user_id ORDER BY 
         CASE role WHEN 'owner' THEN 5 WHEN 'admin' THEN 4 WHEN 'analyst' THEN 3 WHEN 'member' THEN 2 ELSE 1 END DESC
         LIMIT 1), 
        'viewer'::user_role
    ) INTO user_role_level;
    
    -- Prepare full-text search query if search term provided
    IF p_search_term != '' THEN
        search_query := websearch_to_tsquery('english', p_search_term);
    END IF;
    
    RETURN QUERY
    WITH accessible_contacts AS (
        SELECT 
            c.*,
            pr.visibility,
            -- Calculate access permissions
            CASE 
                WHEN c.user_id = p_user_id THEN TRUE  -- Own contacts
                WHEN COALESCE(pr.visibility, 'team') = 'public' THEN TRUE  -- Public contacts
                WHEN COALESCE(pr.visibility, 'team') = 'team' AND user_role_level IN ('owner', 'admin', 'analyst', 'member') THEN TRUE  -- Team access
                WHEN user_role_level IN ('owner', 'admin') THEN TRUE  -- Admin override
                ELSE FALSE
            END as can_access,
            -- Calculate relevance score
            CASE 
                WHEN p_search_term = '' THEN 0.5
                ELSE (
                    ts_rank_cd(
                        to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.company, '') || ' ' || COALESCE(c.number, '')),
                        search_query
                    ) * 
                    -- Boost score based on interaction frequency
                    (1 + (c.total_calls + c.total_sms)::float / 1000)
                )
            END as relevance_score
        FROM contacts c
        LEFT JOIN privacy_rules pr ON pr.contact_id = c.id
        WHERE 
            -- Apply search filter if provided
            (p_search_term = '' OR 
             to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.company, '') || ' ' || COALESCE(c.number, '')) @@ search_query)
            -- Apply tag filter if provided
            AND (array_length(p_tag_filter, 1) IS NULL OR c.tags && p_tag_filter)
    ),
    contact_metrics AS (
        SELECT 
            ac.*,
            -- Calculate total interactions from events (more accurate than stored values)
            COALESCE(ev.total_events, 0) as actual_interactions,
            COALESCE(ev.last_event, ac.last_seen) as actual_last_contact,
            -- Calculate contact score (combination of frequency and recency)
            (
                COALESCE(ev.total_events, 0)::float * 0.7 +  -- 70% weight on total interactions
                CASE 
                    WHEN COALESCE(ev.last_event, ac.last_seen) > NOW() - interval '7 days' THEN 30
                    WHEN COALESCE(ev.last_event, ac.last_seen) > NOW() - interval '30 days' THEN 20
                    WHEN COALESCE(ev.last_event, ac.last_seen) > NOW() - interval '90 days' THEN 10
                    ELSE 0
                END  -- 30% weight on recency
            ) as contact_score
        FROM accessible_contacts ac
        LEFT JOIN (
            SELECT 
                contact_id,
                COUNT(*) as total_events,
                MAX(ts) as last_event
            FROM events
            GROUP BY contact_id
        ) ev ON ev.contact_id = ac.id
        WHERE ac.can_access = TRUE
    )
    SELECT 
        cm.id,
        CASE 
            WHEN cm.visibility = 'private' AND cm.user_id != p_user_id
            THEN anonymize_phone_number(cm.number)
            ELSE cm.number
        END,
        cm.name,
        cm.company,
        cm.tags,
        cm.actual_interactions::INTEGER,
        cm.actual_last_contact,
        cm.contact_score,
        cm.relevance_score,
        COALESCE(cm.visibility, 'team'),
        cm.can_access
    FROM contact_metrics cm
    ORDER BY 
        CASE p_sort_by
            WHEN 'relevance' THEN cm.relevance_score
            WHEN 'recent' THEN EXTRACT(epoch FROM cm.actual_last_contact)
            WHEN 'most_active' THEN cm.contact_score
            ELSE 0  -- alphabetical will be handled separately
        END DESC,
        -- Secondary sort for alphabetical or ties
        CASE 
            WHEN p_sort_by = 'alphabetical' THEN LOWER(COALESCE(cm.name, cm.number))
            ELSE LOWER(COALESCE(cm.name, cm.number))
        END ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Get contact communication patterns for analytics
CREATE OR REPLACE FUNCTION get_contact_patterns(
    p_requesting_user_id UUID,
    p_contact_id UUID,
    p_days_back INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    contact_owner UUID;
    user_role_level user_role;
    can_access BOOLEAN := FALSE;
BEGIN
    -- Get contact owner
    SELECT user_id INTO contact_owner FROM contacts WHERE id = p_contact_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contact not found';
    END IF;
    
    -- Check access permissions
    user_role_level := get_user_org_role(p_requesting_user_id, contact_owner);
    
    SELECT visibility = 'public' OR 
           (visibility = 'team' AND user_role_level IN ('owner', 'admin', 'analyst', 'member')) OR
           contact_owner = p_requesting_user_id OR
           user_role_level IN ('owner', 'admin')
    INTO can_access
    FROM privacy_rules pr
    RIGHT JOIN contacts c ON c.id = pr.contact_id
    WHERE c.id = p_contact_id;
    
    IF NOT COALESCE(can_access, FALSE) THEN
        RAISE EXCEPTION 'Access denied to contact patterns';
    END IF;
    
    -- Generate comprehensive communication patterns
    WITH pattern_data AS (
        SELECT 
            -- Time-based patterns
            jsonb_agg(DISTINCT jsonb_build_object(
                'date', date_trunc('day', ts)::date,
                'calls', COUNT(*) FILTER (WHERE type = 'call'),
                'sms', COUNT(*) FILTER (WHERE type = 'sms'),
                'total_duration', SUM(COALESCE(duration, 0))
            )) FILTER (WHERE ts >= NOW() - (p_days_back || ' days')::interval) as daily_activity,
            
            -- Hourly distribution
            jsonb_object_agg(
                EXTRACT(hour FROM ts)::text,
                COUNT(*)
            ) as hourly_distribution,
            
            -- Day of week distribution
            jsonb_object_agg(
                CASE EXTRACT(dow FROM ts)
                    WHEN 0 THEN 'Sunday' WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
                    WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' 
                    WHEN 5 THEN 'Friday' WHEN 6 THEN 'Saturday'
                END,
                COUNT(*)
            ) as dow_distribution,
            
            -- Communication type breakdown
            jsonb_build_object(
                'total_calls', COUNT(*) FILTER (WHERE type = 'call'),
                'total_sms', COUNT(*) FILTER (WHERE type = 'sms'),
                'inbound_calls', COUNT(*) FILTER (WHERE type = 'call' AND direction = 'inbound'),
                'outbound_calls', COUNT(*) FILTER (WHERE type = 'call' AND direction = 'outbound'),
                'inbound_sms', COUNT(*) FILTER (WHERE type = 'sms' AND direction = 'inbound'),
                'outbound_sms', COUNT(*) FILTER (WHERE type = 'sms' AND direction = 'outbound'),
                'avg_call_duration', ROUND(AVG(duration) FILTER (WHERE type = 'call')::numeric, 2),
                'total_call_time', SUM(duration) FILTER (WHERE type = 'call')
            ) as communication_breakdown
            
        FROM events
        WHERE contact_id = p_contact_id
        AND ts >= NOW() - (p_days_back || ' days')::interval
    )
    SELECT jsonb_build_object(
        'daily_activity', COALESCE(pd.daily_activity, '[]'::jsonb),
        'hourly_distribution', COALESCE(pd.hourly_distribution, '{}'::jsonb),
        'dow_distribution', COALESCE(pd.dow_distribution, '{}'::jsonb),
        'communication_breakdown', COALESCE(pd.communication_breakdown, '{}'::jsonb),
        'analysis_period_days', p_days_back,
        'generated_at', NOW()
    ) INTO result
    FROM pattern_data pd;
    
    RETURN result;
END;
$$;

-- ============================================================================
-- PERFORMANCE OPTIMIZATIONS
-- ============================================================================

-- Create indexes for contact intelligence queries
CREATE INDEX IF NOT EXISTS idx_contacts_search_text ON contacts 
    USING gin(to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(company, '') || ' ' || COALESCE(number, '')));

CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_events_contact_ts ON events(contact_id, ts DESC) 
    WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_contact_patterns ON events(contact_id, ts, type, direction) 
    WHERE contact_id IS NOT NULL;

-- Materialized view for contact metrics (refreshed hourly for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS contact_metrics_mv AS
SELECT 
    c.id as contact_id,
    c.user_id,
    c.number,
    c.name,
    c.company,
    c.tags,
    COUNT(e.*) as total_interactions,
    COUNT(e.*) FILTER (WHERE e.type = 'call') as total_calls,
    COUNT(e.*) FILTER (WHERE e.type = 'sms') as total_sms,
    AVG(e.duration) FILTER (WHERE e.type = 'call' AND e.duration IS NOT NULL) as avg_call_duration,
    MAX(e.ts) as last_interaction,
    MIN(e.ts) as first_interaction,
    -- Contact score calculation
    (
        COUNT(e.*)::float * 0.7 +  -- Interaction frequency weight
        CASE 
            WHEN MAX(e.ts) > NOW() - interval '7 days' THEN 30
            WHEN MAX(e.ts) > NOW() - interval '30 days' THEN 20
            WHEN MAX(e.ts) > NOW() - interval '90 days' THEN 10
            ELSE 0
        END
    ) as contact_score,
    -- Communication ratio
    COUNT(e.*) FILTER (WHERE e.direction = 'inbound')::float / GREATEST(1, COUNT(e.*)) as inbound_ratio,
    COALESCE(pr.visibility, 'team') as privacy_level
FROM contacts c
LEFT JOIN events e ON e.contact_id = c.id
LEFT JOIN privacy_rules pr ON pr.contact_id = c.id
GROUP BY c.id, c.user_id, c.number, c.name, c.company, c.tags, pr.visibility;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_contact_metrics_mv_user_score ON contact_metrics_mv(user_id, contact_score DESC);
CREATE INDEX IF NOT EXISTS idx_contact_metrics_mv_search ON contact_metrics_mv 
    USING gin(to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(company, '') || ' ' || number));

-- Grant permissions
GRANT SELECT ON contact_metrics_mv TO authenticated;

-- Function to refresh contact metrics (called by scheduled job)
CREATE OR REPLACE FUNCTION refresh_contact_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY contact_metrics_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_contact_metrics() TO authenticated;