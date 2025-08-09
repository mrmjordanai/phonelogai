-- API Enhancement Database Schema Extensions
-- Phase 1: Upload Sessions and File Management

-- Upload sessions for chunked uploads
CREATE TABLE upload_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    
    -- Session metadata
    filename TEXT NOT NULL,
    total_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    chunk_count INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL DEFAULT 5242880, -- 5MB default
    
    -- Session state
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'expired')),
    uploaded_chunks INTEGER[] DEFAULT '{}',
    bytes_uploaded BIGINT DEFAULT 0,
    
    -- Storage information
    storage_key TEXT,
    storage_bucket TEXT DEFAULT 'file-uploads',
    
    -- Security and validation
    checksum TEXT,
    virus_scan_status TEXT DEFAULT 'pending' CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'error')),
    validation_errors JSONB DEFAULT '[]',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    processing_config JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    
    CONSTRAINT valid_chunk_count CHECK (chunk_count > 0 AND chunk_count <= 10000),
    CONSTRAINT valid_total_size CHECK (total_size > 0 AND total_size <= 107374182400) -- 100GB
);

-- Indexes for upload sessions
CREATE INDEX idx_upload_sessions_user_id ON upload_sessions(user_id);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX idx_upload_sessions_expires_at ON upload_sessions(expires_at);
CREATE INDEX idx_upload_sessions_org_id ON upload_sessions(org_id);

-- Parsing templates for Phase 2
CREATE TABLE parsing_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    
    -- Template metadata
    name TEXT NOT NULL,
    description TEXT,
    carrier TEXT,
    file_format TEXT NOT NULL CHECK (file_format IN ('csv', 'pdf', 'txt', 'xlsx', 'json')),
    
    -- Template configuration
    field_mappings JSONB NOT NULL DEFAULT '{}',
    validation_rules JSONB DEFAULT '{}',
    transformation_rules JSONB DEFAULT '{}',
    
    -- ML and suggestions
    ml_confidence FLOAT DEFAULT 0.0 CHECK (ml_confidence >= 0.0 AND ml_confidence <= 1.0),
    suggested_by_ml BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    success_rate FLOAT DEFAULT 0.0,
    
    -- Versioning
    version INTEGER DEFAULT 1,
    parent_template_id UUID REFERENCES parsing_templates(id),
    is_active BOOLEAN DEFAULT true,
    
    -- Visibility
    is_public BOOLEAN DEFAULT false,
    shared_with_org BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Indexes for parsing templates
CREATE INDEX idx_parsing_templates_user_id ON parsing_templates(user_id);
CREATE INDEX idx_parsing_templates_org_id ON parsing_templates(org_id);
CREATE INDEX idx_parsing_templates_carrier ON parsing_templates(carrier);
CREATE INDEX idx_parsing_templates_format ON parsing_templates(file_format);
CREATE INDEX idx_parsing_templates_active ON parsing_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_parsing_templates_public ON parsing_templates(is_public) WHERE is_public = true;

-- Template usage analytics
CREATE TABLE template_usage_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES parsing_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id UUID, -- Reference to processing job
    
    -- Usage metrics
    processing_time_ms INTEGER,
    rows_processed INTEGER,
    success BOOLEAN,
    error_count INTEGER DEFAULT 0,
    
    -- Context
    file_size BIGINT,
    file_format TEXT,
    carrier_detected TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_template_usage_template_id ON template_usage_analytics(template_id);
CREATE INDEX idx_template_usage_user_id ON template_usage_analytics(user_id);
CREATE INDEX idx_template_usage_created_at ON template_usage_analytics(created_at);

-- Job analytics for Phase 3
CREATE TABLE job_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    
    -- Performance metrics
    queue_time_ms INTEGER, -- Time spent in queue
    processing_time_ms INTEGER, -- Actual processing time
    total_time_ms INTEGER, -- End-to-end time
    
    -- Resource usage
    peak_memory_mb INTEGER,
    cpu_usage_percent FLOAT,
    disk_io_mb INTEGER,
    
    -- Processing metrics
    rows_processed INTEGER DEFAULT 0,
    rows_successful INTEGER DEFAULT 0,
    rows_failed INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    
    -- File information
    file_size_mb FLOAT,
    file_format TEXT,
    carrier_detected TEXT,
    template_used UUID REFERENCES parsing_templates(id),
    
    -- ML performance
    ml_classification_time_ms INTEGER,
    ml_confidence FLOAT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_analytics_job_id ON job_analytics(job_id);
CREATE INDEX idx_job_analytics_user_id ON job_analytics(user_id);
CREATE INDEX idx_job_analytics_created_at ON job_analytics(created_at);
CREATE INDEX idx_job_analytics_org_id ON job_analytics(org_id);

-- Webhooks for Phase 4
CREATE TABLE webhooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    
    -- Webhook configuration
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] DEFAULT '{}', -- Array of event types to subscribe to
    headers JSONB DEFAULT '{}', -- Custom headers to send
    secret TEXT, -- For signature verification
    
    -- State
    is_active BOOLEAN DEFAULT true,
    retry_count INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    
    -- Statistics
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    last_response_status INTEGER,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX idx_webhooks_org_id ON webhooks(org_id);
CREATE INDEX idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;

-- Webhook delivery attempts
CREATE TABLE webhook_deliveries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    
    -- Delivery details
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    url TEXT NOT NULL,
    
    -- Response information
    http_status INTEGER,
    response_body TEXT,
    response_headers JSONB,
    error_message TEXT,
    
    -- Timing
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    response_time_ms INTEGER,
    
    -- Retry information
    attempt_number INTEGER DEFAULT 1,
    is_final_attempt BOOLEAN DEFAULT false,
    next_retry_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_sent_at ON webhook_deliveries(sent_at);
CREATE INDEX idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);

-- System metrics for monitoring
CREATE TABLE system_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Metric identification
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'timer')),
    tags JSONB DEFAULT '{}',
    
    -- Values
    value FLOAT NOT NULL,
    count INTEGER DEFAULT 1, -- For counters and histograms
    
    -- Timing (for histograms and timers)
    min_value FLOAT,
    max_value FLOAT,
    avg_value FLOAT,
    p95_value FLOAT,
    p99_value FLOAT,
    
    -- Metadata
    source TEXT DEFAULT 'api',
    environment TEXT DEFAULT 'production',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX idx_system_metrics_type ON system_metrics(metric_type);
CREATE INDEX idx_system_metrics_created_at ON system_metrics(created_at);
CREATE INDEX idx_system_metrics_tags ON system_metrics USING GIN(tags);

-- Row Level Security Policies

-- Upload sessions - users can only access their own sessions
ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY upload_sessions_user_policy ON upload_sessions
    FOR ALL
    USING (user_id = auth.uid());

-- Parsing templates - users can access their own and public/org templates
ALTER TABLE parsing_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY parsing_templates_user_policy ON parsing_templates
    FOR ALL
    USING (
        user_id = auth.uid() OR
        is_public = true OR
        (shared_with_org = true AND org_id = (
            SELECT org_id FROM org_roles WHERE user_id = auth.uid() LIMIT 1
        ))
    );

-- Template usage analytics - users can only see their own usage
ALTER TABLE template_usage_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_usage_analytics_user_policy ON template_usage_analytics
    FOR ALL
    USING (user_id = auth.uid());

-- Job analytics - users can only see their own job analytics
ALTER TABLE job_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_analytics_user_policy ON job_analytics
    FOR ALL
    USING (user_id = auth.uid());

-- Webhooks - users can only access their own webhooks
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhooks_user_policy ON webhooks
    FOR ALL
    USING (user_id = auth.uid());

-- Webhook deliveries - users can only see deliveries for their webhooks
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_user_policy ON webhook_deliveries
    FOR SELECT
    USING (
        webhook_id IN (
            SELECT id FROM webhooks WHERE user_id = auth.uid()
        )
    );

-- System metrics - read-only for authenticated users, write for service role
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_metrics_read_policy ON system_metrics
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Helper functions

-- Function to clean up expired upload sessions
CREATE OR REPLACE FUNCTION cleanup_expired_upload_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM upload_sessions 
    WHERE expires_at < NOW() AND status != 'completed';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup
    INSERT INTO system_metrics (metric_name, metric_type, value, source)
    VALUES ('upload_sessions_cleaned', 'counter', deleted_count, 'cleanup_job');
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update template success rates
CREATE OR REPLACE FUNCTION update_template_success_rates()
RETURNS VOID AS $$
BEGIN
    UPDATE parsing_templates 
    SET success_rate = (
        SELECT COALESCE(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END), 0.0)
        FROM template_usage_analytics 
        WHERE template_id = parsing_templates.id
    ),
    usage_count = (
        SELECT COUNT(*)
        FROM template_usage_analytics
        WHERE template_id = parsing_templates.id
    ),
    updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT template_id 
        FROM template_usage_analytics 
        WHERE created_at > NOW() - INTERVAL '1 hour'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get system health metrics
CREATE OR REPLACE FUNCTION get_system_health()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    active_uploads INTEGER;
    pending_jobs INTEGER;
    avg_processing_time FLOAT;
    error_rate FLOAT;
BEGIN
    -- Count active uploads
    SELECT COUNT(*) INTO active_uploads
    FROM upload_sessions
    WHERE status = 'active' AND expires_at > NOW();
    
    -- Get average processing time from last 24 hours
    SELECT COALESCE(AVG(total_time_ms), 0) INTO avg_processing_time
    FROM job_analytics
    WHERE created_at > NOW() - INTERVAL '24 hours';
    
    -- Calculate error rate from last hour
    SELECT COALESCE(
        AVG(CASE WHEN rows_failed > 0 THEN 1.0 ELSE 0.0 END), 0.0
    ) INTO error_rate
    FROM job_analytics
    WHERE created_at > NOW() - INTERVAL '1 hour';
    
    result := jsonb_build_object(
        'timestamp', NOW(),
        'active_uploads', active_uploads,
        'avg_processing_time_ms', avg_processing_time,
        'error_rate', error_rate,
        'status', CASE 
            WHEN error_rate > 0.1 THEN 'degraded'
            WHEN avg_processing_time > 600000 THEN 'slow'
            ELSE 'healthy'
        END
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_upload_sessions_updated_at
    BEFORE UPDATE ON upload_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parsing_templates_updated_at
    BEFORE UPDATE ON parsing_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();