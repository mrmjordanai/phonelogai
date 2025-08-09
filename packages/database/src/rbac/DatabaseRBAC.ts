/**
 * Database RBAC Functions
 * High-performance database functions for role-based access control
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole, RBACResource } from '@phonelogai/shared';
import type { Database } from '../types';

export class DatabaseRBAC {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Check if user has specific role or higher in organization
   */
  async hasRoleOrHigher(
    userId: string,
    minimumRole: UserRole,
    orgId?: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('has_role_or_higher', {
        p_user_id: userId,
        p_minimum_role: minimumRole,
        p_org_id: orgId,
      });

    return !error && data === true;
  }

  /**
   * Get user's role in specific organization
   */
  async getUserRole(userId: string, orgId?: string): Promise<UserRole | null> {
    const { data, error } = await this.supabase
      .rpc('get_user_role_in_org', {
        p_user_id: userId,
        p_org_id: orgId,
      });

    return error ? null : (data as UserRole);
  }

  /**
   * Check if user can access specific resource
   */
  async canAccessResource(
    userId: string,
    resource: RBACResource,
    resourceId: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('can_access_resource', {
        p_user_id: userId,
        p_resource: resource,
        p_resource_id: resourceId,
      });

    return !error && data === true;
  }

  /**
   * Get filtered events respecting RBAC and privacy rules
   */
  async getFilteredEvents(
    requestingUserId: string,
    targetUserId?: string,
    limit = 100,
    offset = 0
  ) {
    const { data, error } = await this.supabase
      .rpc('get_filtered_events', {
        p_requesting_user_id: requestingUserId,
        p_target_user_id: targetUserId,
        p_limit: limit,
        p_offset: offset,
      });

    return { data, error };
  }

  /**
   * Get users in same organization with RBAC filtering
   */
  async getOrgUsers(userId: string) {
    const { data, error } = await this.supabase
      .rpc('get_org_users', {
        p_requesting_user_id: userId,
      });

    return { data, error };
  }

  /**
   * Check if user can modify organization role
   */
  async canModifyOrgRole(
    requestingUserId: string,
    targetUserId: string,
    newRole: UserRole
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('can_modify_org_role', {
        p_requesting_user_id: requestingUserId,
        p_target_user_id: targetUserId,
        p_new_role: newRole,
      });

    return !error && data === true;
  }

  /**
   * Get comprehensive user permissions
   */
  async getUserPermissions(userId: string) {
    const { data, error } = await this.supabase
      .rpc('get_user_permissions', {
        p_user_id: userId,
      });

    return { data, error };
  }

  /**
   * Check bulk permission for multiple resources
   */
  async checkBulkPermissions(
    userId: string,
    resourceIds: string[],
    resource: RBACResource,
    action: string
  ) {
    const { data, error } = await this.supabase
      .rpc('check_bulk_permissions', {
        p_user_id: userId,
        p_resource_ids: resourceIds,
        p_resource: resource,
        p_action: action,
      });

    return { data, error };
  }

  /**
   * Get audit trail with RBAC filtering
   */
  async getAuditTrail(
    requestingUserId: string,
    filters: {
      resource?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { data, error } = await this.supabase
      .rpc('get_audit_trail', {
        p_requesting_user_id: requestingUserId,
        p_resource: filters.resource,
        p_action: filters.action,
        p_start_date: filters.startDate,
        p_end_date: filters.endDate,
        p_limit: filters.limit || 100,
        p_offset: filters.offset || 0,
      });

    return { data, error };
  }

  /**
   * Get dashboard metrics with RBAC filtering
   */
  async getDashboardMetrics(userId: string) {
    const { data, error } = await this.supabase
      .rpc('get_rbac_dashboard_metrics', {
        p_user_id: userId,
      });

    return { data, error };
  }

  /**
   * Check if user can export data
   */
  async canExportData(
    userId: string,
    dataType: string,
    filters?: Record<string, any>
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('can_export_data', {
        p_user_id: userId,
        p_data_type: dataType,
        p_filters: filters ? JSON.stringify(filters) : null,
      });

    return !error && data === true;
  }

  /**
   * Get organization hierarchy for user
   */
  async getOrgHierarchy(userId: string) {
    const { data, error } = await this.supabase
      .rpc('get_org_hierarchy', {
        p_user_id: userId,
      });

    return { data, error };
  }

  /**
   * Validate role transition
   */
  async validateRoleTransition(
    currentRole: UserRole,
    newRole: UserRole,
    requestingUserId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const { data, error } = await this.supabase
      .rpc('validate_role_transition', {
        p_current_role: currentRole,
        p_new_role: newRole,
        p_requesting_user_id: requestingUserId,
      });

    if (error) {
      return { valid: false, reason: error.message };
    }

    return { valid: data?.valid ?? false, reason: data?.reason };
  }

  /**
   * Get permission cache warmup data
   */
  async getCacheWarmupData(orgId: string) {
    const { data, error } = await this.supabase
      .rpc('get_cache_warmup_data', {
        p_org_id: orgId,
      });

    return { data, error };
  }

  /**
   * Log RBAC event for audit trail
   */
  async logRBACEvent(
    userId: string,
    action: string,
    resource: string,
    resourceId?: string,
    metadata?: Record<string, any>
  ) {
    const { error } = await this.supabase
      .from('audit_log')
      .insert({
        actor_id: userId,
        action,
        resource,
        resource_id: resourceId,
        metadata: metadata || {},
      });

    return { error };
  }

  /**
   * Get RBAC performance metrics
   */
  async getRBACMetrics() {
    const { data, error } = await this.supabase
      .rpc('get_rbac_performance_metrics');

    return { data, error };
  }
}