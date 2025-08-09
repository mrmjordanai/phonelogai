-- Enhanced RBAC Database Functions
-- High-performance functions for comprehensive role-based access control

-- Function to check if user has role or higher
CREATE OR REPLACE FUNCTION has_role_or_higher(
    p_user_id UUID,
    p_minimum_role user_role,
    p_org_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    user_role_power INTEGER;
    min_role_power INTEGER;
    target_org_id UUID;
BEGIN
    -- Get role power levels
    SELECT 
        CASE role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
            ELSE 0
        END INTO user_role_power
    FROM org_roles 
    WHERE user_id = p_user_id 
    AND (p_org_id IS NULL OR org_id = p_org_id)
    ORDER BY created_at DESC 
    LIMIT 1;

    -- Get minimum role power level
    SELECT 
        CASE p_minimum_role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
            ELSE 0
        END INTO min_role_power;

    RETURN COALESCE(user_role_power, 0) >= min_role_power;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user role in specific organization
CREATE OR REPLACE FUNCTION get_user_role_in_org(
    p_user_id UUID,
    p_org_id UUID DEFAULT NULL
)
RETURNS user_role AS $$
DECLARE
    user_role_result user_role;
BEGIN
    SELECT role INTO user_role_result
    FROM org_roles
    WHERE user_id = p_user_id 
    AND (p_org_id IS NULL OR org_id = p_org_id)
    ORDER BY created_at DESC
    LIMIT 1;
    
    RETURN COALESCE(user_role_result, 'viewer'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access specific resource
CREATE OR REPLACE FUNCTION can_access_resource(
    p_user_id UUID,
    p_resource TEXT,
    p_resource_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    resource_owner_id UUID;
    user_role_val user_role;
    same_org BOOLEAN;
BEGIN
    -- Handle different resource types
    CASE p_resource
        WHEN 'events' THEN
            SELECT user_id INTO resource_owner_id FROM events WHERE id = p_resource_id;
        WHEN 'contacts' THEN
            SELECT user_id INTO resource_owner_id FROM contacts WHERE id = p_resource_id;
        WHEN 'privacy_rules' THEN
            SELECT user_id INTO resource_owner_id FROM privacy_rules WHERE id = p_resource_id;
        WHEN 'uploads' THEN
            SELECT user_id INTO resource_owner_id FROM file_uploads WHERE id = p_resource_id;
        WHEN 'nlq_queries' THEN
            SELECT user_id INTO resource_owner_id FROM nlq_queries WHERE id = p_resource_id;
        WHEN 'sync_health' THEN
            SELECT user_id INTO resource_owner_id FROM sync_health WHERE id = p_resource_id;
        WHEN 'webhooks' THEN
            SELECT user_id INTO resource_owner_id FROM webhook_endpoints WHERE id = p_resource_id;
        WHEN 'tickets' THEN
            SELECT user_id INTO resource_owner_id FROM tickets WHERE id = p_resource_id;
        WHEN 'incidents' THEN
            SELECT reporter_id INTO resource_owner_id FROM incidents WHERE id = p_resource_id;
        ELSE
            RETURN FALSE;
    END CASE;

    -- Resource not found
    IF resource_owner_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Owner can always access
    IF resource_owner_id = p_user_id THEN
        RETURN TRUE;
    END IF;

    -- Check if users are in same organization
    SELECT same_organization(p_user_id, resource_owner_id) INTO same_org;
    IF NOT same_org THEN
        RETURN FALSE;
    END IF;

    -- Get user role
    SELECT get_user_role_in_org(p_user_id) INTO user_role_val;

    -- Apply role-based access rules
    CASE p_resource
        WHEN 'events', 'contacts' THEN
            -- Check privacy rules for contacts/events
            IF p_resource = 'events' THEN
                RETURN can_access_contact((SELECT contact_id FROM events WHERE id = p_resource_id));
            ELSE
                RETURN can_access_contact(p_resource_id);
            END IF;
        WHEN 'privacy_rules' THEN
            RETURN user_role_val IN ('owner', 'admin', 'analyst');
        WHEN 'uploads', 'nlq_queries', 'webhooks', 'tickets' THEN
            RETURN user_role_val IN ('owner', 'admin', 'analyst', 'member');
        WHEN 'sync_health' THEN
            RETURN user_role_val IN ('owner', 'admin', 'analyst');
        WHEN 'incidents' THEN
            RETURN TRUE; -- All org members can view incidents
        ELSE
            RETURN user_role_val IN ('owner', 'admin');
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get organization users with RBAC filtering
CREATE OR REPLACE FUNCTION get_org_users(p_requesting_user_id UUID)
RETURNS TABLE(
    user_id UUID,
    role user_role,
    org_id UUID,
    can_manage BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    requesting_role user_role;
    requesting_org_id UUID;
BEGIN
    -- Get requesting user's role and org
    SELECT r.role, r.org_id INTO requesting_role, requesting_org_id
    FROM org_roles r
    WHERE r.user_id = p_requesting_user_id
    ORDER BY r.created_at DESC
    LIMIT 1;

    -- Return empty if no role found
    IF requesting_role IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        o.user_id,
        o.role,
        o.org_id,
        CASE 
            WHEN requesting_role = 'owner' THEN TRUE
            WHEN requesting_role = 'admin' AND o.role IN ('analyst', 'member', 'viewer') THEN TRUE
            ELSE FALSE
        END as can_manage,
        o.created_at
    FROM org_roles o
    WHERE o.org_id = requesting_org_id
    ORDER BY 
        CASE o.role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
        END DESC,
        o.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can modify organization role
CREATE OR REPLACE FUNCTION can_modify_org_role(
    p_requesting_user_id UUID,
    p_target_user_id UUID,
    p_new_role user_role
)
RETURNS BOOLEAN AS $$
DECLARE
    requesting_role user_role;
    target_role user_role;
    same_org BOOLEAN;
    requesting_power INTEGER;
    target_power INTEGER;
    new_role_power INTEGER;
BEGIN
    -- Check if users are in same organization
    SELECT same_organization(p_requesting_user_id, p_target_user_id) INTO same_org;
    IF NOT same_org THEN
        RETURN FALSE;
    END IF;

    -- Get roles
    SELECT get_user_role_in_org(p_requesting_user_id) INTO requesting_role;
    SELECT get_user_role_in_org(p_target_user_id) INTO target_role;

    -- Get power levels
    SELECT 
        CASE requesting_role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
        END INTO requesting_power;

    SELECT 
        CASE target_role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
        END INTO target_power;

    SELECT 
        CASE p_new_role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
        END INTO new_role_power;

    -- Only owners can create other owners
    IF p_new_role = 'owner' AND requesting_role != 'owner' THEN
        RETURN FALSE;
    END IF;

    -- Can only modify roles at or below your level (except owners can do anything)
    IF requesting_role != 'owner' THEN
        IF target_power >= requesting_power OR new_role_power >= requesting_power THEN
            RETURN FALSE;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user permissions based on role
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE(
    resource TEXT,
    actions TEXT[],
    conditions JSONB
) AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT get_user_role_in_org(p_user_id) INTO user_role_val;

    -- Return permissions based on role
    CASE user_role_val
        WHEN 'owner' THEN
            RETURN QUERY VALUES
                ('events', ARRAY['read', 'write', 'delete', 'manage', 'export', 'bulk'], NULL::JSONB),
                ('contacts', ARRAY['read', 'write', 'delete', 'manage', 'export', 'bulk'], NULL::JSONB),
                ('privacy_rules', ARRAY['read', 'write', 'delete', 'manage', 'bulk'], NULL::JSONB),
                ('organizations', ARRAY['read', 'write', 'delete', 'manage'], NULL::JSONB),
                ('users', ARRAY['read', 'write', 'delete', 'manage'], NULL::JSONB),
                ('dashboards', ARRAY['read', 'write', 'manage'], NULL::JSONB),
                ('integrations', ARRAY['read', 'write', 'delete', 'manage'], NULL::JSONB),
                ('billing', ARRAY['read', 'write', 'manage'], NULL::JSONB),
                ('audit', ARRAY['read', 'export'], NULL::JSONB),
                ('uploads', ARRAY['read', 'write', 'delete', 'manage'], NULL::JSONB);

        WHEN 'admin' THEN
            RETURN QUERY VALUES
                ('events', ARRAY['read', 'write', 'delete', 'manage', 'export', 'bulk'], NULL::JSONB),
                ('contacts', ARRAY['read', 'write', 'delete', 'manage', 'export', 'bulk'], NULL::JSONB),
                ('privacy_rules', ARRAY['read', 'write', 'delete', 'manage', 'bulk'], NULL::JSONB),
                ('organizations', ARRAY['read', 'write'], NULL::JSONB),
                ('users', ARRAY['read', 'write', 'manage'], NULL::JSONB),
                ('dashboards', ARRAY['read', 'write', 'manage'], NULL::JSONB),
                ('integrations', ARRAY['read', 'write', 'delete', 'manage'], NULL::JSONB),
                ('billing', ARRAY['read'], NULL::JSONB),
                ('audit', ARRAY['read', 'export'], NULL::JSONB),
                ('uploads', ARRAY['read', 'write', 'delete', 'manage'], NULL::JSONB);

        WHEN 'analyst' THEN
            RETURN QUERY VALUES
                ('events', ARRAY['read', 'export'], '{"privacy": ["team", "public"]}'::JSONB),
                ('contacts', ARRAY['read', 'export'], '{"privacy": ["team", "public"]}'::JSONB),
                ('privacy_rules', ARRAY['read'], NULL::JSONB),
                ('organizations', ARRAY['read'], NULL::JSONB),
                ('users', ARRAY['read'], '{"same_org": true}'::JSONB),
                ('dashboards', ARRAY['read', 'write'], NULL::JSONB),
                ('integrations', ARRAY['read'], NULL::JSONB),
                ('audit', ARRAY['read'], '{"same_org": true}'::JSONB),
                ('uploads', ARRAY['read', 'write'], NULL::JSONB);

        WHEN 'member' THEN
            RETURN QUERY VALUES
                ('events', ARRAY['read', 'write'], '{"user_owned_or_team": true}'::JSONB),
                ('contacts', ARRAY['read', 'write'], '{"user_owned_or_team": true}'::JSONB),
                ('privacy_rules', ARRAY['read', 'write'], '{"user_owned": true}'::JSONB),
                ('organizations', ARRAY['read'], NULL::JSONB),
                ('users', ARRAY['read'], '{"user_owned": true}'::JSONB),
                ('dashboards', ARRAY['read'], NULL::JSONB),
                ('uploads', ARRAY['read', 'write'], '{"user_owned": true}'::JSONB);

        WHEN 'viewer' THEN
            RETURN QUERY VALUES
                ('events', ARRAY['read'], '{"privacy": ["public"]}'::JSONB),
                ('contacts', ARRAY['read'], '{"privacy": ["public"]}'::JSONB),
                ('privacy_rules', ARRAY['read'], '{"user_owned": true}'::JSONB),
                ('organizations', ARRAY['read'], NULL::JSONB),
                ('users', ARRAY['read'], '{"user_owned": true}'::JSONB),
                ('dashboards', ARRAY['read'], NULL::JSONB);

        ELSE
            RETURN;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check bulk permissions
CREATE OR REPLACE FUNCTION check_bulk_permissions(
    p_user_id UUID,
    p_resource_ids UUID[],
    p_resource TEXT,
    p_action TEXT
)
RETURNS TABLE(
    resource_id UUID,
    allowed BOOLEAN,
    reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        resource_id,
        can_access_resource(p_user_id, p_resource, resource_id) as allowed,
        CASE 
            WHEN can_access_resource(p_user_id, p_resource, resource_id) THEN 'Access granted'
            ELSE 'Access denied - insufficient permissions'
        END as reason
    FROM unnest(p_resource_ids) as resource_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get audit trail with RBAC filtering
CREATE OR REPLACE FUNCTION get_audit_trail(
    p_requesting_user_id UUID,
    p_resource TEXT DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    actor_id UUID,
    action TEXT,
    resource TEXT,
    resource_id UUID,
    metadata JSONB,
    ts TIMESTAMPTZ
) AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT get_user_role_in_org(p_requesting_user_id) INTO user_role_val;

    RETURN QUERY
    SELECT 
        a.id,
        a.actor_id,
        a.action,
        a.resource,
        a.resource_id,
        a.metadata,
        a.ts
    FROM audit_log a
    WHERE 
        -- Role-based filtering
        (
            user_role_val IN ('owner', 'admin') OR 
            (user_role_val = 'analyst' AND same_organization(p_requesting_user_id, a.actor_id)) OR
            (user_role_val IN ('member', 'viewer') AND a.actor_id = p_requesting_user_id)
        )
        -- Optional filters
        AND (p_resource IS NULL OR a.resource = p_resource)
        AND (p_action IS NULL OR a.action = p_action)
        AND (p_start_date IS NULL OR a.ts >= p_start_date)
        AND (p_end_date IS NULL OR a.ts <= p_end_date)
    ORDER BY a.ts DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get RBAC dashboard metrics
CREATE OR REPLACE FUNCTION get_rbac_dashboard_metrics(p_user_id UUID)
RETURNS TABLE(
    total_events BIGINT,
    total_contacts BIGINT,
    accessible_events BIGINT,
    accessible_contacts BIGINT,
    user_role user_role,
    org_member_count BIGINT
) AS $$
DECLARE
    user_role_val user_role;
    user_org_id UUID;
BEGIN
    -- Get user role and org
    SELECT r.role, r.org_id INTO user_role_val, user_org_id
    FROM org_roles r
    WHERE r.user_id = p_user_id
    ORDER BY r.created_at DESC
    LIMIT 1;

    RETURN QUERY
    SELECT 
        -- Total counts (what user could potentially see)
        (SELECT COUNT(*) FROM events WHERE user_id IN (
            SELECT user_id FROM org_roles WHERE org_id = user_org_id
        ))::BIGINT as total_events,
        (SELECT COUNT(*) FROM contacts WHERE user_id IN (
            SELECT user_id FROM org_roles WHERE org_id = user_org_id  
        ))::BIGINT as total_contacts,
        
        -- Accessible counts (respecting privacy rules)
        (SELECT COUNT(*) FROM events e 
         WHERE e.contact_id IS NULL OR can_access_contact(e.contact_id))::BIGINT as accessible_events,
        (SELECT COUNT(*) FROM contacts c 
         WHERE can_access_contact(c.id))::BIGINT as accessible_contacts,
         
        user_role_val as user_role,
        (SELECT COUNT(*) FROM org_roles WHERE org_id = user_org_id)::BIGINT as org_member_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can export data
CREATE OR REPLACE FUNCTION can_export_data(
    p_user_id UUID,
    p_data_type TEXT,
    p_filters TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT get_user_role_in_org(p_user_id) INTO user_role_val;
    
    -- Only analyst and above can export
    RETURN user_role_val IN ('owner', 'admin', 'analyst');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get organization hierarchy
CREATE OR REPLACE FUNCTION get_org_hierarchy(p_user_id UUID)
RETURNS TABLE(
    org_id UUID,
    user_role user_role,
    member_count BIGINT,
    owner_count BIGINT,
    admin_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.org_id,
        o.role as user_role,
        COUNT(*) FILTER (WHERE TRUE)::BIGINT as member_count,
        COUNT(*) FILTER (WHERE o.role = 'owner')::BIGINT as owner_count,
        COUNT(*) FILTER (WHERE o.role = 'admin')::BIGINT as admin_count
    FROM org_roles o
    WHERE o.org_id IN (
        SELECT org_id FROM org_roles WHERE user_id = p_user_id
    )
    GROUP BY o.org_id, o.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate role transitions
CREATE OR REPLACE FUNCTION validate_role_transition(
    p_current_role user_role,
    p_new_role user_role,
    p_requesting_user_id UUID
)
RETURNS TABLE(
    valid BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    requesting_role user_role;
BEGIN
    SELECT get_user_role_in_org(p_requesting_user_id) INTO requesting_role;

    -- Check if transition is valid
    IF p_new_role = 'owner' AND requesting_role != 'owner' THEN
        RETURN QUERY SELECT FALSE, 'Only owners can assign owner role';
    ELSIF requesting_role = 'admin' AND p_new_role IN ('owner', 'admin') THEN
        RETURN QUERY SELECT FALSE, 'Admins cannot assign owner or admin roles';
    ELSIF requesting_role IN ('analyst', 'member', 'viewer') THEN
        RETURN QUERY SELECT FALSE, 'Insufficient privileges to assign roles';
    ELSE
        RETURN QUERY SELECT TRUE, 'Role transition valid';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get cache warmup data
CREATE OR REPLACE FUNCTION get_cache_warmup_data(p_org_id UUID)
RETURNS TABLE(
    user_id UUID,
    role user_role,
    common_resources TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.user_id,
        o.role,
        CASE o.role
            WHEN 'owner', 'admin' THEN 
                ARRAY['events', 'contacts', 'dashboards', 'users', 'audit']
            WHEN 'analyst' THEN 
                ARRAY['events', 'contacts', 'dashboards', 'uploads']
            WHEN 'member' THEN 
                ARRAY['events', 'contacts', 'dashboards']
            ELSE 
                ARRAY['dashboards']
        END as common_resources
    FROM org_roles o
    WHERE o.org_id = p_org_id
    ORDER BY 
        CASE o.role
            WHEN 'owner' THEN 5
            WHEN 'admin' THEN 4
            WHEN 'analyst' THEN 3
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 1
        END DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get RBAC performance metrics
CREATE OR REPLACE FUNCTION get_rbac_performance_metrics()
RETURNS TABLE(
    total_permission_checks BIGINT,
    avg_check_duration_ms NUMERIC,
    cache_hit_ratio NUMERIC,
    failed_checks BIGINT,
    privilege_escalation_attempts BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) FILTER (WHERE action = 'permission_check')::BIGINT as total_permission_checks,
        AVG((metadata->>'execution_time_ms')::NUMERIC) as avg_check_duration_ms,
        AVG(CASE WHEN (metadata->>'cache_hit')::BOOLEAN THEN 1.0 ELSE 0.0 END) as cache_hit_ratio,
        COUNT(*) FILTER (WHERE action = 'permission_check' AND (metadata->>'allowed')::BOOLEAN = false)::BIGINT as failed_checks,
        COUNT(*) FILTER (WHERE action = 'privilege_escalation')::BIGINT as privilege_escalation_attempts
    FROM audit_log
    WHERE ts >= NOW() - INTERVAL '1 hour'
    AND resource = 'rbac';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for RBAC performance
CREATE INDEX IF NOT EXISTS idx_org_roles_user_role ON org_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_org_roles_org_role ON org_roles(org_id, role);
CREATE INDEX IF NOT EXISTS idx_audit_log_rbac ON audit_log(action, resource, ts DESC) WHERE resource = 'rbac';
CREATE INDEX IF NOT EXISTS idx_audit_log_permission_checks ON audit_log(actor_id, ts DESC) WHERE action = 'permission_check';

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION has_role_or_higher(UUID, user_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role_in_org(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_resource(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_users(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_modify_org_role(UUID, UUID, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_bulk_permissions(UUID, UUID[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_trail(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_rbac_dashboard_metrics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_export_data(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_hierarchy(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_role_transition(user_role, user_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cache_warmup_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_rbac_performance_metrics() TO authenticated;