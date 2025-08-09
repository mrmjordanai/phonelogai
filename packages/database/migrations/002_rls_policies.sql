-- Enable Row Level Security on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE i18n_strings ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE nlq_queries ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role with organization context
CREATE OR REPLACE FUNCTION get_user_role(target_user_id UUID)
RETURNS user_role AS $$
DECLARE
    user_role_result user_role;
    target_org_id UUID;
BEGIN
    -- Get the target user's organization
    SELECT org_id INTO target_org_id
    FROM org_roles 
    WHERE user_id = target_user_id 
    ORDER BY created_at DESC 
    LIMIT 1;
    
    -- If target user has no org, return lowest permission
    IF target_org_id IS NULL THEN
        RETURN 'viewer'::user_role;
    END IF;
    
    -- Get requesting user's role in the same organization
    SELECT role INTO user_role_result
    FROM org_roles
    WHERE user_id = auth.uid() AND org_id = target_org_id;
    
    RETURN COALESCE(user_role_result, 'viewer'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if users are in same organization
CREATE OR REPLACE FUNCTION same_organization(user1_id UUID, user2_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM org_roles o1
        JOIN org_roles o2 ON o1.org_id = o2.org_id
        WHERE o1.user_id = user1_id AND o2.user_id = user2_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user's organization role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
DECLARE
    current_role user_role;
BEGIN
    SELECT role INTO current_role
    FROM org_roles
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 1;
    
    RETURN COALESCE(current_role, 'viewer'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user can access contact data
CREATE OR REPLACE FUNCTION can_access_contact(target_contact_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    contact_owner_id UUID;
    privacy_rule privacy_rules;
    user_role_val user_role;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();
    
    -- Handle null contact_id (events without contacts)
    IF target_contact_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Get contact owner
    SELECT user_id INTO contact_owner_id
    FROM contacts
    WHERE id = target_contact_id;
    
    -- If contact doesn't exist, deny access
    IF contact_owner_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Owner can always access their own contacts
    IF contact_owner_id = current_user_id THEN
        RETURN TRUE;
    END IF;
    
    -- Check if users are in same organization
    IF NOT same_organization(current_user_id, contact_owner_id) THEN
        RETURN FALSE;
    END IF;
    
    -- Get privacy rule for this contact
    SELECT pr.* INTO privacy_rule
    FROM privacy_rules pr
    WHERE pr.contact_id = target_contact_id;
    
    -- If no privacy rule, default to team visible
    IF privacy_rule IS NULL THEN
        SELECT get_user_role(contact_owner_id) INTO user_role_val;
        RETURN user_role_val IN ('owner', 'admin', 'analyst', 'member');
    END IF;
    
    -- Get user role in context of contact owner's organization
    SELECT get_user_role(contact_owner_id) INTO user_role_val;
    
    -- Check access based on privacy rule
    CASE privacy_rule.visibility
        WHEN 'public' THEN
            RETURN TRUE;
        WHEN 'team' THEN
            RETURN user_role_val IN ('owner', 'admin', 'analyst', 'member');
        WHEN 'private' THEN
            RETURN user_role_val IN ('owner', 'admin');
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Events table RLS policies
CREATE POLICY "Users can manage their own events" ON events
    FOR ALL USING (user_id = auth.uid());

-- Contacts table RLS policies  
CREATE POLICY "Users can manage their own contacts" ON contacts
    FOR ALL USING (user_id = auth.uid());

-- Privacy rules RLS policies
CREATE POLICY "Users can manage their own privacy rules" ON privacy_rules
    FOR ALL USING (user_id = auth.uid());

-- Sync health RLS policies
CREATE POLICY "Users can manage their own sync health" ON sync_health
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all sync health in org" ON sync_health
    FOR SELECT USING (get_user_role(user_id) IN ('owner', 'admin'));

-- Org roles RLS policies
CREATE POLICY "Users can view their own roles" ON org_roles
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Owners and admins can manage roles" ON org_roles
    FOR ALL USING (get_user_role(user_id) IN ('owner', 'admin'));

-- Audit log RLS policies
CREATE POLICY "Users can view their own audit actions" ON audit_log
    FOR SELECT USING (actor_id = auth.uid());

CREATE POLICY "Admins can view organization audit logs" ON audit_log
    FOR SELECT USING (
        get_current_user_role() IN ('owner', 'admin') AND
        same_organization(auth.uid(), actor_id)
    );

CREATE POLICY "Users can view audit logs for their resources" ON audit_log
    FOR SELECT USING (
        resource = 'user' AND resource_id = auth.uid()
    );

CREATE POLICY "System can insert audit logs" ON audit_log
    FOR INSERT WITH CHECK (TRUE);

-- Incidents RLS policies
CREATE POLICY "Users can view their own incidents" ON incidents
    FOR SELECT USING (reporter_id = auth.uid());

CREATE POLICY "Admins can view all incidents in org" ON incidents
    FOR SELECT USING (get_user_role(reporter_id) IN ('owner', 'admin'));

CREATE POLICY "Users can create incidents" ON incidents
    FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- Tickets RLS policies
CREATE POLICY "Users can manage their own tickets" ON tickets
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all tickets in org" ON tickets
    FOR SELECT USING (get_user_role(user_id) IN ('owner', 'admin'));

-- File uploads RLS policies
CREATE POLICY "Users can manage their own uploads" ON file_uploads
    FOR ALL USING (user_id = auth.uid());

-- NLQ queries RLS policies
CREATE POLICY "Users can manage their own queries" ON nlq_queries
    FOR ALL USING (user_id = auth.uid());

-- Webhook endpoints RLS policies
CREATE POLICY "Users can manage their own webhooks" ON webhook_endpoints
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all webhooks in org" ON webhook_endpoints
    FOR SELECT USING (get_user_role(user_id) IN ('owner', 'admin'));

-- Billing subscriptions RLS policies (organization level)
CREATE POLICY "Org members can view billing" ON billing_subscriptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM org_roles 
            WHERE user_id = auth.uid() AND org_id = billing_subscriptions.org_id
        )
    );

CREATE POLICY "Owners can manage billing" ON billing_subscriptions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM org_roles 
            WHERE user_id = auth.uid() 
            AND org_id = billing_subscriptions.org_id 
            AND role = 'owner'
        )
    );

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_privacy_rules_updated_at BEFORE UPDATE ON privacy_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_health_updated_at BEFORE UPDATE ON sync_health
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_org_roles_updated_at BEFORE UPDATE ON org_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_subscriptions_updated_at BEFORE UPDATE ON billing_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_endpoints_updated_at BEFORE UPDATE ON webhook_endpoints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- i18n_strings RLS policies (public read, admin write)
CREATE POLICY "Anyone can read i18n strings" ON i18n_strings
    FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage i18n strings" ON i18n_strings
    FOR ALL USING (get_current_user_role() IN ('owner', 'admin'));

-- Outbox RLS policies (system-level, restrictive access)
CREATE POLICY "System can manage outbox" ON outbox
    FOR ALL USING (auth.uid() IS NULL OR get_current_user_role() IN ('owner', 'admin'));

-- Additional performance indexes for RLS queries
CREATE INDEX IF NOT EXISTS idx_org_roles_user_id_org_id ON org_roles(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_org_roles_org_id_role ON org_roles(org_id, role);
CREATE INDEX IF NOT EXISTS idx_privacy_rules_visibility ON privacy_rules(visibility);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id_number ON contacts(user_id, number);
CREATE INDEX IF NOT EXISTS idx_events_user_id_ts ON events(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_resource ON audit_log(actor_id, resource, resource_id);

-- Enhanced security policies for sensitive operations

-- Prevent privilege escalation in org_roles
CREATE POLICY "Cannot escalate above own role" ON org_roles
    FOR INSERT WITH CHECK (
        get_current_user_role() IN ('owner', 'admin') AND
        (
            role::text <= get_current_user_role()::text OR
            get_current_user_role() = 'owner'
        )
    );

CREATE POLICY "Cannot modify higher roles" ON org_roles
    FOR UPDATE USING (
        get_current_user_role() IN ('owner', 'admin') AND
        (
            get_user_role(user_id) <= get_current_user_role() OR
            get_current_user_role() = 'owner'
        )
    );

-- Team access policies for cross-user data visibility

-- Enhanced privacy rules policies - team members can view privacy settings
CREATE POLICY "Team members can view privacy settings" ON privacy_rules
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            get_user_role(user_id) IN ('owner', 'admin', 'analyst')
        )
    );

-- Enhanced contact access control - respects privacy rules
CREATE POLICY "Team members can view team contacts" ON contacts
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            can_access_contact(id)
        )
    );

-- Enhanced event access control - comprehensive privacy enforcement
CREATE POLICY "Team members can view team events" ON events
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            (
                contact_id IS NULL OR
                can_access_contact(contact_id)
            )
        )
    );

-- ============================================================================
-- ENHANCED RLS POLICIES FOR COMPREHENSIVE SECURITY
-- ============================================================================

-- Function-specific security policies
-- Restrict access to sensitive database functions through RLS

-- File uploads enhanced policies - prevent unauthorized access to processing data
CREATE POLICY "Admins can view all file uploads in org" ON file_uploads
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            get_user_role(user_id) IN ('owner', 'admin')
        )
    );

-- Enhanced sync health policies for cross-user monitoring
CREATE POLICY "Analysts can view team sync health" ON sync_health
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            get_user_role(user_id) IN ('owner', 'admin', 'analyst')
        )
    );

-- NLQ queries enhanced policies - team visibility for analytics
CREATE POLICY "Team members can view shared NLQ queries" ON nlq_queries
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            get_current_user_role() IN ('owner', 'admin', 'analyst')
        )
    );

-- Incident management enhanced policies
CREATE POLICY "Team members can create incidents for organization" ON incidents
    FOR INSERT WITH CHECK (
        reporter_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM org_roles 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Team leads can update incidents" ON incidents
    FOR UPDATE USING (
        reporter_id = auth.uid() OR
        get_current_user_role() IN ('owner', 'admin')
    );

-- Support tickets cross-organization visibility
CREATE POLICY "Support staff can view tickets" ON tickets
    FOR SELECT USING (
        user_id = auth.uid() OR
        get_current_user_role() IN ('owner', 'admin')
    );

-- Webhook endpoint security hardening
CREATE POLICY "Prevent webhook URL enumeration" ON webhook_endpoints
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            get_user_role(user_id) IN ('owner', 'admin')
        )
    );

-- Audit log comprehensive access control
CREATE POLICY "Analysts can view team audit logs" ON audit_log
    FOR SELECT USING (
        actor_id = auth.uid() OR
        (
            get_current_user_role() IN ('owner', 'admin', 'analyst') AND
            same_organization(auth.uid(), actor_id)
        ) OR
        (
            resource IN ('contact', 'event', 'privacy_rule') AND
            EXISTS (
                SELECT 1 FROM contacts c 
                WHERE c.id = resource_id::UUID 
                AND can_access_contact(c.id)
            )
        )
    );

-- Billing subscription organization-wide visibility with role restrictions
CREATE POLICY "Billing admins can modify subscriptions" ON billing_subscriptions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM org_roles 
            WHERE user_id = auth.uid() 
            AND org_id = billing_subscriptions.org_id 
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- CROSS-TABLE SECURITY CONSTRAINTS
-- ============================================================================

-- Prevent data leakage through contact references
CREATE POLICY "Contact privacy cascade to events" ON events
    FOR SELECT USING (
        user_id = auth.uid() OR
        (
            contact_id IS NULL OR
            EXISTS (
                SELECT 1 FROM contacts c
                LEFT JOIN privacy_rules pr ON c.id = pr.contact_id
                WHERE c.id = contact_id
                AND (
                    c.user_id = auth.uid() OR
                    (
                        same_organization(auth.uid(), c.user_id) AND
                        (
                            pr.visibility IN ('team', 'public') OR
                            pr.visibility IS NULL OR
                            get_user_role(c.user_id) IN ('owner', 'admin')
                        )
                    )
                )
            )
        )
    );

-- Organization boundary enforcement for all user-scoped tables
CREATE POLICY "Strict organization boundaries for contacts" ON contacts
    FOR ALL USING (
        user_id = auth.uid() OR
        (
            same_organization(auth.uid(), user_id) AND
            (
                -- Read access based on privacy rules
                EXISTS (
                    SELECT 1 FROM privacy_rules pr
                    WHERE pr.contact_id = id
                    AND pr.visibility IN ('team', 'public')
                ) OR
                -- No privacy rule means team default
                NOT EXISTS (
                    SELECT 1 FROM privacy_rules pr
                    WHERE pr.contact_id = id
                ) OR
                -- Admin override
                get_user_role(user_id) IN ('owner', 'admin')
            )
        )
    );

-- ============================================================================
-- PERFORMANCE OPTIMIZATION FOR RLS POLICIES
-- ============================================================================

-- Additional indexes specifically for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_privacy_rules_contact_visibility ON privacy_rules(contact_id, visibility);
CREATE INDEX IF NOT EXISTS idx_events_user_contact_ts ON events(user_id, contact_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_user_privacy ON contacts(user_id, id);
CREATE INDEX IF NOT EXISTS idx_org_roles_user_org_role ON org_roles(user_id, org_id, role);

-- Composite indexes for complex RLS queries
CREATE INDEX IF NOT EXISTS idx_events_privacy_lookup ON events(user_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_security ON audit_log(actor_id, resource, resource_id, ts DESC);

-- ============================================================================
-- SECURITY-SENSITIVE OPERATIONS LOGGING
-- ============================================================================

-- Trigger function for automatic audit logging of sensitive operations
CREATE OR REPLACE FUNCTION log_sensitive_operation()
RETURNS TRIGGER AS $$
BEGIN
    -- Log privacy rule changes
    IF TG_TABLE_NAME = 'privacy_rules' THEN
        INSERT INTO audit_log (actor_id, action, resource, resource_id, metadata)
        VALUES (
            auth.uid(),
            TG_OP,
            'privacy_rule',
            COALESCE(NEW.id, OLD.id),
            jsonb_build_object(
                'contact_id', COALESCE(NEW.contact_id, OLD.contact_id),
                'old_visibility', CASE WHEN TG_OP = 'UPDATE' THEN OLD.visibility ELSE NULL END,
                'new_visibility', CASE WHEN TG_OP != 'DELETE' THEN NEW.visibility ELSE NULL END
            )
        );
    END IF;
    
    -- Log role changes
    IF TG_TABLE_NAME = 'org_roles' THEN
        INSERT INTO audit_log (actor_id, action, resource, resource_id, metadata)
        VALUES (
            auth.uid(),
            TG_OP,
            'org_role',
            COALESCE(NEW.id, OLD.id),
            jsonb_build_object(
                'target_user_id', COALESCE(NEW.user_id, OLD.user_id),
                'org_id', COALESCE(NEW.org_id, OLD.org_id),
                'old_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.role ELSE NULL END,
                'new_role', CASE WHEN TG_OP != 'DELETE' THEN NEW.role ELSE NULL END
            )
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_privacy_rules_changes 
    AFTER INSERT OR UPDATE OR DELETE ON privacy_rules
    FOR EACH ROW EXECUTE FUNCTION log_sensitive_operation();

CREATE TRIGGER audit_org_roles_changes 
    AFTER INSERT OR UPDATE OR DELETE ON org_roles
    FOR EACH ROW EXECUTE FUNCTION log_sensitive_operation();

-- ============================================================================
-- ADDITIONAL SECURITY CONSTRAINTS
-- ============================================================================

-- Prevent contact manipulation across organization boundaries
ALTER TABLE contacts ADD CONSTRAINT check_contact_org_consistency 
CHECK (
    -- Only validate during normal operations (not during migration/setup)
    CASE WHEN current_setting('session_replication_role', true) = 'replica' 
    THEN true 
    ELSE user_id = auth.uid() OR same_organization(auth.uid(), user_id)
    END
);

-- Prevent event insertion with invalid contact references
ALTER TABLE events ADD CONSTRAINT check_event_contact_consistency
CHECK (
    contact_id IS NULL OR 
    EXISTS (
        SELECT 1 FROM contacts c 
        WHERE c.id = contact_id 
        AND c.user_id = user_id
    )
);

-- Additional comments for complex policies
COMMENT ON POLICY "Contact privacy cascade to events" ON events IS 'Ensures event visibility respects contact privacy rules and organization boundaries';
COMMENT ON POLICY "Strict organization boundaries for contacts" ON contacts IS 'Enforces multi-tenant isolation while allowing team collaboration based on privacy settings';
COMMENT ON FUNCTION log_sensitive_operation() IS 'Automatically logs changes to privacy rules and organization roles for security auditing';