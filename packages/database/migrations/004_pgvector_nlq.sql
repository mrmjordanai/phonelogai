-- pgvector Configuration for Natural Language Query (NLQ) System
-- Enables embedding storage and vector similarity search for intelligent query processing

-- ============================================================================
-- PGVECTOR SETUP AND EMBEDDINGS TABLES
-- ============================================================================

-- Ensure pgvector extension is enabled (already done in 001_initial_schema.sql)
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- Embeddings table for storing query embeddings and cached results
CREATE TABLE IF NOT EXISTS nlq_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    embedding vector(1536), -- OpenAI embedding dimension
    sql_query TEXT,
    result_schema JSONB,
    execution_count INTEGER DEFAULT 1,
    avg_execution_time_ms INTEGER,
    last_executed TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Query templates for common patterns
CREATE TABLE IF NOT EXISTS nlq_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name TEXT NOT NULL,
    pattern_description TEXT NOT NULL,
    sql_template TEXT NOT NULL,
    parameters JSONB DEFAULT '{}',
    embedding vector(1536),
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Query feedback for improving NLQ accuracy
CREATE TABLE IF NOT EXISTS nlq_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nlq_query_id UUID REFERENCES nlq_queries(id) ON DELETE CASCADE,
    original_query TEXT NOT NULL,
    generated_sql TEXT NOT NULL,
    was_helpful BOOLEAN,
    corrected_sql TEXT,
    feedback_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on new tables
ALTER TABLE nlq_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE nlq_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE nlq_feedback ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES FOR NLQ TABLES
-- ============================================================================

-- NLQ embeddings policies
CREATE POLICY "Users can manage their own embeddings" ON nlq_embeddings
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Team leads can view team embeddings" ON nlq_embeddings
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            get_current_user_role() IN ('owner', 'admin', 'analyst')
        )
    );

-- Template policies (shared across organization)
CREATE POLICY "Anyone can read active templates" ON nlq_templates
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Admins can manage templates" ON nlq_templates
    FOR ALL USING (get_current_user_role() IN ('owner', 'admin'));

-- Feedback policies
CREATE POLICY "Users can manage their own feedback" ON nlq_feedback
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all feedback" ON nlq_feedback
    FOR SELECT USING (get_current_user_role() IN ('owner', 'admin'));

-- ============================================================================
-- PGVECTOR INDEXES FOR PERFORMANCE
-- ============================================================================

-- HNSW index for fast similarity search on embeddings
CREATE INDEX IF NOT EXISTS idx_nlq_embeddings_vector 
ON nlq_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- IVFFlat index for template embeddings
CREATE INDEX IF NOT EXISTS idx_nlq_templates_vector 
ON nlq_templates USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_nlq_embeddings_user_created ON nlq_embeddings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nlq_embeddings_query_text ON nlq_embeddings USING gin(to_tsvector('english', query_text));
CREATE INDEX IF NOT EXISTS idx_nlq_templates_active ON nlq_templates(is_active, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_nlq_feedback_query_id ON nlq_feedback(nlq_query_id);

-- ============================================================================
-- NLQ PROCESSING FUNCTIONS
-- ============================================================================

-- Find similar queries using vector similarity
CREATE OR REPLACE FUNCTION find_similar_nlq_queries(
    requesting_user_id UUID,
    query_embedding vector(1536),
    similarity_threshold REAL DEFAULT 0.8,
    max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    query_text TEXT,
    sql_query TEXT,
    similarity REAL,
    execution_count INTEGER,
    avg_execution_time_ms INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    -- Return similar queries with privacy controls
    RETURN QUERY
    SELECT 
        e.id,
        e.query_text,
        e.sql_query,
        (1 - (e.embedding <=> query_embedding))::REAL as similarity,
        e.execution_count,
        e.avg_execution_time_ms
    FROM nlq_embeddings e
    WHERE (
        e.user_id = requesting_user_id OR
        (
            same_organization(requesting_user_id, e.user_id) AND
            get_current_user_role() IN ('owner', 'admin', 'analyst')
        )
    )
    AND (1 - (e.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY (e.embedding <=> query_embedding) ASC
    LIMIT max_results;
END;
$$;

-- Find matching query templates
CREATE OR REPLACE FUNCTION find_nlq_templates(
    query_embedding vector(1536),
    similarity_threshold REAL DEFAULT 0.7,
    max_results INTEGER DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    template_name TEXT,
    pattern_description TEXT,
    sql_template TEXT,
    parameters JSONB,
    similarity REAL,
    usage_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.template_name,
        t.pattern_description,
        t.sql_template,
        t.parameters,
        (1 - (t.embedding <=> query_embedding))::REAL as similarity,
        t.usage_count
    FROM nlq_templates t
    WHERE t.is_active = TRUE
    AND (1 - (t.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY (t.embedding <=> query_embedding) ASC
    LIMIT max_results;
END;
$$;

-- Store NLQ query with embedding for future similarity search
CREATE OR REPLACE FUNCTION store_nlq_query_embedding(
    p_user_id UUID,
    p_query_text TEXT,
    p_embedding vector(1536),
    p_sql_query TEXT DEFAULT NULL,
    p_result_schema JSONB DEFAULT NULL,
    p_execution_time_ms INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_id UUID;
    result_id UUID;
BEGIN
    -- Check if similar query already exists for this user
    SELECT id INTO existing_id
    FROM nlq_embeddings
    WHERE user_id = p_user_id
    AND query_text = p_query_text
    AND (1 - (embedding <=> p_embedding)) > 0.95  -- Very high similarity
    LIMIT 1;
    
    IF existing_id IS NOT NULL THEN
        -- Update existing query
        UPDATE nlq_embeddings 
        SET 
            execution_count = execution_count + 1,
            avg_execution_time_ms = CASE 
                WHEN p_execution_time_ms IS NOT NULL THEN
                    (COALESCE(avg_execution_time_ms, 0) * execution_count + p_execution_time_ms) / (execution_count + 1)
                ELSE avg_execution_time_ms
            END,
            last_executed = NOW(),
            updated_at = NOW()
        WHERE id = existing_id;
        
        result_id := existing_id;
    ELSE
        -- Insert new query
        INSERT INTO nlq_embeddings (
            user_id, 
            query_text, 
            embedding, 
            sql_query, 
            result_schema, 
            avg_execution_time_ms
        )
        VALUES (
            p_user_id, 
            p_query_text, 
            p_embedding, 
            p_sql_query, 
            p_result_schema, 
            p_execution_time_ms
        )
        RETURNING id INTO result_id;
    END IF;
    
    RETURN result_id;
END;
$$;

-- Get query suggestions based on user history and patterns
CREATE OR REPLACE FUNCTION get_nlq_query_suggestions(
    requesting_user_id UUID,
    limit_count INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    suggestions JSONB;
BEGIN
    -- Get popular queries and templates as suggestions
    WITH popular_queries AS (
        SELECT 
            'recent_query' as suggestion_type,
            query_text as suggestion,
            execution_count,
            last_executed
        FROM nlq_embeddings
        WHERE user_id = requesting_user_id
        ORDER BY execution_count DESC, last_executed DESC
        LIMIT limit_count
    ),
    popular_templates AS (
        SELECT 
            'template' as suggestion_type,
            pattern_description as suggestion,
            usage_count as execution_count,
            updated_at as last_executed
        FROM nlq_templates
        WHERE is_active = TRUE
        ORDER BY usage_count DESC
        LIMIT limit_count
    ),
    combined_suggestions AS (
        SELECT * FROM popular_queries
        UNION ALL
        SELECT * FROM popular_templates
    )
    SELECT jsonb_build_object(
        'user_id', requesting_user_id,
        'suggestions', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'type', suggestion_type,
                    'text', suggestion,
                    'popularity', execution_count,
                    'last_used', last_executed
                )
                ORDER BY execution_count DESC
            )
            FROM combined_suggestions
        ),
        'generated_at', NOW()
    ) INTO suggestions;
    
    RETURN suggestions;
END;
$$;

-- Update template usage statistics
CREATE OR REPLACE FUNCTION update_template_usage(template_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE nlq_templates
    SET 
        usage_count = usage_count + 1,
        updated_at = NOW()
    WHERE id = template_id AND is_active = TRUE;
END;
$$;

-- ============================================================================
-- NLQ QUERY EXECUTION WITH SAFETY CHECKS
-- ============================================================================

-- Execute NLQ-generated SQL with safety restrictions
CREATE OR REPLACE FUNCTION execute_nlq_query(
    requesting_user_id UUID,
    sql_query TEXT,
    max_rows INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    execution_start TIMESTAMPTZ;
    execution_time INTEGER;
    row_count INTEGER;
BEGIN
    -- Safety checks for SQL query
    IF sql_query IS NULL OR length(trim(sql_query)) = 0 THEN
        RAISE EXCEPTION 'Empty SQL query';
    END IF;
    
    -- Prevent dangerous operations
    IF UPPER(sql_query) ~ '.*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|GRANT|REVOKE).*' THEN
        RAISE EXCEPTION 'Query contains forbidden operations';
    END IF;
    
    -- Ensure query is SELECT only
    IF NOT UPPER(trim(sql_query)) LIKE 'SELECT%' THEN
        RAISE EXCEPTION 'Only SELECT queries are allowed';
    END IF;
    
    -- Record execution start time
    execution_start := NOW();
    
    -- Execute the query with row limit
    EXECUTE format('
        WITH limited_results AS (
            %s
            LIMIT %s
        )
        SELECT jsonb_build_object(
            ''data'', jsonb_agg(row_to_json(limited_results)),
            ''row_count'', (SELECT COUNT(*) FROM limited_results)
        )
        FROM limited_results
    ', sql_query, max_rows) INTO result;
    
    -- Calculate execution time
    execution_time := EXTRACT(EPOCH FROM (NOW() - execution_start)) * 1000;
    
    -- Add metadata to result
    result := result || jsonb_build_object(
        'execution_time_ms', execution_time,
        'max_rows', max_rows,
        'executed_at', NOW(),
        'executed_by', requesting_user_id
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'error', SQLERRM,
            'sql_query', sql_query,
            'executed_at', NOW(),
            'executed_by', requesting_user_id
        );
END;
$$;

-- ============================================================================
-- PREDEFINED NLQ TEMPLATES
-- ============================================================================

-- Insert common query templates (will be populated with embeddings via API)
INSERT INTO nlq_templates (template_name, pattern_description, sql_template, parameters) VALUES
(
    'total_events_timeframe',
    'Get total events (calls and SMS) for a specific time period',
    'SELECT COUNT(*) as total_events, COUNT(*) FILTER (WHERE type = ''call'') as calls, COUNT(*) FILTER (WHERE type = ''sms'') as sms FROM events WHERE user_id = $user_id AND ts >= $start_date AND ts <= $end_date',
    '{"required": ["user_id", "start_date", "end_date"], "optional": []}'
),
(
    'top_contacts_by_activity',
    'Find most active contacts by interaction count',
    'SELECT c.name, c.number, COUNT(e.*) as interaction_count FROM events e LEFT JOIN contacts c ON e.contact_id = c.id WHERE e.user_id = $user_id GROUP BY c.id, c.name, c.number ORDER BY interaction_count DESC LIMIT $limit',
    '{"required": ["user_id"], "optional": ["limit"]}'
),
(
    'call_duration_analysis',
    'Analyze call duration patterns and statistics',
    'SELECT AVG(duration) as avg_duration, MIN(duration) as min_duration, MAX(duration) as max_duration, COUNT(*) as total_calls FROM events WHERE user_id = $user_id AND type = ''call'' AND duration IS NOT NULL',
    '{"required": ["user_id"], "optional": []}'
),
(
    'daily_activity_pattern',
    'Show daily activity patterns over time',
    'SELECT DATE(ts) as date, COUNT(*) as events, COUNT(*) FILTER (WHERE type = ''call'') as calls, COUNT(*) FILTER (WHERE type = ''sms'') as sms FROM events WHERE user_id = $user_id AND ts >= $start_date GROUP BY DATE(ts) ORDER BY date',
    '{"required": ["user_id", "start_date"], "optional": []}'
),
(
    'busiest_hours',
    'Find the busiest hours of the day',
    'SELECT EXTRACT(hour FROM ts) as hour, COUNT(*) as activity_count FROM events WHERE user_id = $user_id GROUP BY EXTRACT(hour FROM ts) ORDER BY activity_count DESC',
    '{"required": ["user_id"], "optional": []}'
);

-- ============================================================================
-- TRIGGERS AND MAINTENANCE
-- ============================================================================

-- Update timestamp trigger for nlq_embeddings
CREATE TRIGGER update_nlq_embeddings_updated_at 
    BEFORE UPDATE ON nlq_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for nlq_templates
CREATE TRIGGER update_nlq_templates_updated_at 
    BEFORE UPDATE ON nlq_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTION DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION find_similar_nlq_queries(UUID, vector, REAL, INTEGER) IS 'Finds similar NLQ queries using vector similarity search with privacy controls';
COMMENT ON FUNCTION find_nlq_templates(vector, REAL, INTEGER) IS 'Finds matching query templates based on embedding similarity';
COMMENT ON FUNCTION store_nlq_query_embedding(UUID, TEXT, vector, TEXT, JSONB, INTEGER) IS 'Stores or updates NLQ query embeddings for future similarity matching';
COMMENT ON FUNCTION get_nlq_query_suggestions(UUID, INTEGER) IS 'Returns query suggestions based on user history and popular templates';
COMMENT ON FUNCTION execute_nlq_query(UUID, TEXT, INTEGER) IS 'Safely executes NLQ-generated SQL queries with restrictions and monitoring';
COMMENT ON FUNCTION update_template_usage(UUID) IS 'Updates usage statistics for NLQ templates';

COMMENT ON TABLE nlq_embeddings IS 'Stores query embeddings for vector similarity search and caching';
COMMENT ON TABLE nlq_templates IS 'Predefined query templates for common NLQ patterns';
COMMENT ON TABLE nlq_feedback IS 'User feedback for improving NLQ accuracy and performance';