-- Data Ingestion Pipeline Tables
-- This migration creates tables for the AI-powered file parsing and data ingestion system

-- Job tracking table for file processing
CREATE TABLE ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    filename TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    format TEXT CHECK (format IN ('pdf', 'csv', 'xlsx', 'xls', 'json', 'txt')) NOT NULL,
    carrier TEXT CHECK (carrier IN ('att', 'verizon', 'tmobile', 'sprint', 'unknown')),
    status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')) NOT NULL DEFAULT 'pending',
    progress DECIMAL(5,2) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    total_rows INTEGER,
    processed_rows INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    
    -- Add constraints
    CONSTRAINT ingestion_jobs_progress_valid CHECK (progress >= 0 AND progress <= 100),
    CONSTRAINT ingestion_jobs_rows_valid CHECK (processed_rows >= 0 AND (total_rows IS NULL OR processed_rows <= total_rows)),
    CONSTRAINT ingestion_jobs_timestamps_valid CHECK (
        (started_at IS NULL OR started_at >= created_at) AND
        (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at))
    )
);

-- Layout classification results from ML models
CREATE TABLE layout_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES ingestion_jobs(id) ON DELETE CASCADE NOT NULL,
    detected_format TEXT CHECK (detected_format IN ('pdf', 'csv', 'xlsx', 'xls', 'json', 'txt')) NOT NULL,
    carrier TEXT CHECK (carrier IN ('att', 'verizon', 'tmobile', 'sprint', 'unknown')) NOT NULL,
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1) NOT NULL,
    field_mappings JSONB NOT NULL DEFAULT '[]',
    table_structure JSONB,
    requires_manual_mapping BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one classification per job
    UNIQUE(job_id)
);

-- Error tracking for ingestion process
CREATE TABLE ingestion_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES ingestion_jobs(id) ON DELETE CASCADE NOT NULL,
    row_number INTEGER,
    error_type TEXT CHECK (error_type IN (
        'file_format_error',
        'parsing_error', 
        'validation_error',
        'database_error',
        'system_error',
        'duplicate_data',
        'missing_required_field',
        'invalid_data_type',
        'constraint_violation'
    )) NOT NULL,
    error_message TEXT NOT NULL,
    raw_data JSONB,
    severity TEXT CHECK (severity IN ('warning', 'error', 'critical')) NOT NULL DEFAULT 'error',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Index for efficient querying
    INDEX idx_ingestion_errors_job_severity ON ingestion_errors(job_id, severity)
);

-- Carrier templates for known file formats
CREATE TABLE carrier_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier TEXT CHECK (carrier IN ('att', 'verizon', 'tmobile', 'sprint', 'unknown')) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    supported_formats TEXT[] NOT NULL DEFAULT '{}',
    field_mappings JSONB NOT NULL DEFAULT '[]',
    validation_rules JSONB NOT NULL DEFAULT '[]',
    sample_files TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique template names per carrier
    UNIQUE(carrier, name)
);

-- Processing metrics for performance monitoring
CREATE TABLE processing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES ingestion_jobs(id) ON DELETE CASCADE NOT NULL,
    file_size_mb DECIMAL(10,2) NOT NULL,
    processing_time_ms BIGINT NOT NULL,
    rows_per_second DECIMAL(10,2) GENERATED ALWAYS AS (
        CASE 
            WHEN processing_time_ms > 0 
            THEN (processed_rows * 1000.0) / processing_time_ms 
            ELSE 0 
        END
    ) STORED,
    processed_rows INTEGER NOT NULL DEFAULT 0,
    memory_usage_mb DECIMAL(8,2),
    cpu_usage_percent DECIMAL(5,2),
    errors_per_1000_rows DECIMAL(8,2) DEFAULT 0,
    quality_score DECIMAL(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one metrics record per job
    UNIQUE(job_id)
);

-- Queue jobs for background workers
CREATE TABLE queue_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT CHECK (type IN ('parse_file', 'validate_data', 'write_database')) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    priority INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    error_message TEXT,
    
    -- Index for efficient queue processing
    INDEX idx_queue_jobs_priority_scheduled ON queue_jobs(priority DESC, scheduled_at ASC) WHERE status = 'pending'
);

-- Indexes for performance
CREATE INDEX idx_ingestion_jobs_user_status ON ingestion_jobs(user_id, status);
CREATE INDEX idx_ingestion_jobs_created_at ON ingestion_jobs(created_at DESC);
CREATE INDEX idx_ingestion_jobs_carrier_format ON ingestion_jobs(carrier, format) WHERE status = 'completed';

CREATE INDEX idx_layout_classifications_confidence ON layout_classifications(confidence DESC);
CREATE INDEX idx_layout_classifications_carrier ON layout_classifications(carrier, detected_format);

CREATE INDEX idx_ingestion_errors_job_type ON ingestion_errors(job_id, error_type);
CREATE INDEX idx_ingestion_errors_severity_created ON ingestion_errors(severity, created_at DESC);

CREATE INDEX idx_carrier_templates_carrier_active ON carrier_templates(carrier) WHERE is_active = TRUE;

CREATE INDEX idx_processing_metrics_performance ON processing_metrics(rows_per_second DESC, processing_time_ms ASC);

-- Row Level Security (RLS) Policies

-- Ingestion jobs - users can only see their own jobs, admins can see all
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ingestion jobs" ON ingestion_jobs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ingestion jobs" ON ingestion_jobs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ingestion jobs" ON ingestion_jobs
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all ingestion jobs" ON ingestion_jobs
    FOR ALL
    USING (auth.role() = 'service_role');

-- Layout classifications - follow job permissions
ALTER TABLE layout_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view classifications for their jobs" ON layout_classifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM ingestion_jobs j 
            WHERE j.id = layout_classifications.job_id 
            AND j.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all classifications" ON layout_classifications
    FOR ALL
    USING (auth.role() = 'service_role');

-- Ingestion errors - follow job permissions
ALTER TABLE ingestion_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view errors for their jobs" ON ingestion_errors
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM ingestion_jobs j 
            WHERE j.id = ingestion_errors.job_id 
            AND j.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all errors" ON ingestion_errors
    FOR ALL
    USING (auth.role() = 'service_role');

-- Carrier templates - read-only for users, admin-only for modifications
ALTER TABLE carrier_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view active carrier templates" ON carrier_templates
    FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Service role can manage carrier templates" ON carrier_templates
    FOR ALL
    USING (auth.role() = 'service_role');

-- Processing metrics - follow job permissions
ALTER TABLE processing_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view metrics for their jobs" ON processing_metrics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM ingestion_jobs j 
            WHERE j.id = processing_metrics.job_id 
            AND j.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all metrics" ON processing_metrics
    FOR ALL
    USING (auth.role() = 'service_role');

-- Queue jobs - service role only
ALTER TABLE queue_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can access queue jobs" ON queue_jobs
    FOR ALL
    USING (auth.role() = 'service_role');

-- Functions for common operations

-- Function to get job progress with classification info
CREATE OR REPLACE FUNCTION get_job_progress(target_job_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'job', to_json(j),
        'classification', to_json(lc),
        'metrics', to_json(pm),
        'error_count', (
            SELECT COUNT(*) FROM ingestion_errors ie 
            WHERE ie.job_id = j.id
        ),
        'warning_count', (
            SELECT COUNT(*) FROM ingestion_errors ie 
            WHERE ie.job_id = j.id AND ie.severity = 'warning'
        )
    )
    INTO result
    FROM ingestion_jobs j
    LEFT JOIN layout_classifications lc ON lc.job_id = j.id
    LEFT JOIN processing_metrics pm ON pm.job_id = j.id
    WHERE j.id = target_job_id
    AND (j.user_id = auth.uid() OR auth.role() = 'service_role');
    
    RETURN result;
END;
$$;

-- Function to update job progress
CREATE OR REPLACE FUNCTION update_job_progress(
    target_job_id UUID,
    new_status TEXT DEFAULT NULL,
    new_progress DECIMAL DEFAULT NULL,
    processed_rows_count INTEGER DEFAULT NULL,
    total_rows_count INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE ingestion_jobs 
    SET 
        status = COALESCE(new_status, status),
        progress = COALESCE(new_progress, progress),
        processed_rows = COALESCE(processed_rows_count, processed_rows),
        total_rows = COALESCE(total_rows_count, total_rows),
        started_at = CASE 
            WHEN new_status = 'processing' AND started_at IS NULL 
            THEN NOW() 
            ELSE started_at 
        END,
        completed_at = CASE 
            WHEN new_status IN ('completed', 'failed', 'partial') 
            THEN NOW() 
            ELSE completed_at 
        END
    WHERE id = target_job_id
    AND (user_id = auth.uid() OR auth.role() = 'service_role');
    
    RETURN FOUND;
END;
$$;

-- Function to clean up old completed jobs (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_ingestion_jobs(
    retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Only allow service role to run cleanup
    IF auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Access denied: cleanup function requires service role';
    END IF;
    
    DELETE FROM ingestion_jobs 
    WHERE status IN ('completed', 'failed') 
    AND completed_at < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Insert some default carrier templates
INSERT INTO carrier_templates (carrier, name, description, supported_formats, field_mappings, validation_rules) VALUES 
(
    'att',
    'AT&T Call Detail Record',
    'Standard AT&T CDR format with call logs and SMS data',
    ARRAY['csv', 'pdf'],
    '[
        {"source_field": "Date/Time", "target_field": "ts", "data_type": "date", "is_required": true, "confidence": 0.95},
        {"source_field": "Phone Number", "target_field": "number", "data_type": "string", "is_required": true, "confidence": 0.98},
        {"source_field": "Direction", "target_field": "direction", "data_type": "string", "is_required": true, "confidence": 0.92},
        {"source_field": "Duration", "target_field": "duration", "data_type": "number", "is_required": false, "confidence": 0.88}
    ]'::jsonb,
    '[
        {"field": "number", "type": "format", "parameters": {"pattern": "^\\+?1?[0-9]{10}$"}, "error_message": "Invalid phone number format"},
        {"field": "duration", "type": "range", "parameters": {"min": 0, "max": 86400}, "error_message": "Duration must be between 0 and 24 hours"}
    ]'::jsonb
),
(
    'verizon',
    'Verizon Wireless Statement',
    'Standard Verizon billing statement format',
    ARRAY['pdf', 'csv'],
    '[
        {"source_field": "Date", "target_field": "ts", "data_type": "date", "is_required": true, "confidence": 0.93},
        {"source_field": "Number Called", "target_field": "number", "data_type": "string", "is_required": true, "confidence": 0.96},
        {"source_field": "Type", "target_field": "type", "data_type": "string", "is_required": true, "confidence": 0.90},
        {"source_field": "Minutes", "target_field": "duration", "data_type": "number", "is_required": false, "confidence": 0.85}
    ]'::jsonb,
    '[
        {"field": "number", "type": "required", "error_message": "Phone number is required"},
        {"field": "type", "type": "format", "parameters": {"allowed": ["Call", "Text", "SMS"]}, "error_message": "Invalid communication type"}
    ]'::jsonb
);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ingestion_jobs TO authenticated;
GRANT SELECT ON layout_classifications TO authenticated;
GRANT SELECT ON ingestion_errors TO authenticated;
GRANT SELECT ON carrier_templates TO authenticated;
GRANT SELECT ON processing_metrics TO authenticated;

-- Service role gets full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;