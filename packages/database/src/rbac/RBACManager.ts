/**
 * RBAC Manager - Core permission checking engine
 * Provides high-performance role-based access control with caching
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { 
  UserRole, 
  RBACResource, 
  RBACAction, 
  Permission,
  PermissionCheckRequest,
  PermissionCheckResult,
  RBACUser,
  RBACConfig 
} from '@phonelogai/shared';
import {
  ROLE_HIERARCHY,
  PERMISSION_MATRIX,
  DEFAULT_RBAC_CONFIG,
  RBAC_ERRORS,
  roleHasPermission,
  parsePermissionConditions,
  isPermissionCacheable,
  calculateCacheTTL,
  generatePermissionCacheKey,
} from '@phonelogai/shared';
import type { Database } from '../types';
import { PermissionCache } from './PermissionCache';

export class RBACManager {
  private supabase: SupabaseClient<Database>;
  private cache: PermissionCache;
  private config: RBACConfig;

  constructor(
    supabase: SupabaseClient<Database>, 
    cache?: PermissionCache,
    config: Partial<RBACConfig> = {}
  ) {
    this.supabase = supabase;
    this.cache = cache || new PermissionCache();
    this.config = { ...DEFAULT_RBAC_CONFIG, ...config };
  }

  /**
   * Check if a user has permission to perform an action on a resource
   */
  async checkPermission(request: PermissionCheckRequest): Promise<PermissionCheckResult> {
    const startTime = Date.now();
    
    try {
      // Generate cache key
      const cacheKey = generatePermissionCacheKey(
        request.userId,
        request.resource,
        request.action,
        request.resourceId
      );

      // Check cache first
      if (this.config.enableCache) {
        const cachedResult = await this.cache.get(cacheKey);
        if (cachedResult) {
          return cachedResult.result;
        }
      }

      // Get user role and organization context
      const user = await this.getUserWithRole(request.userId);
      if (!user) {
        return {
          allowed: false,
          reason: RBAC_ERRORS.USER_NOT_FOUND,
          cacheable: false,
        };
      }

      // Check basic role permission
      const hasBasicPermission = roleHasPermission(
        user.role, 
        request.resource, 
        request.action
      );

      if (!hasBasicPermission) {
        const result: PermissionCheckResult = {
          allowed: false,
          reason: RBAC_ERRORS.ACCESS_DENIED,
          cacheable: isPermissionCacheable(request.resource, request.action),
        };

        if (this.config.enableCache && result.cacheable) {
          const ttl = calculateCacheTTL(request.resource, request.action);
          await this.cache.set(cacheKey, result, ttl);
        }

        return result;
      }

      // Check conditional permissions
      const conditionResult = await this.checkPermissionConditions(
        user,
        request
      );

      const result: PermissionCheckResult = {
        allowed: conditionResult.allowed,
        reason: conditionResult.reason,
        conditions: conditionResult.conditions,
        cacheable: isPermissionCacheable(request.resource, request.action),
        cacheKey,
      };

      // Cache the result
      if (this.config.enableCache && result.cacheable) {
        const ttl = calculateCacheTTL(request.resource, request.action);
        await this.cache.set(cacheKey, result, ttl);
      }

      // Log the permission check if audit is enabled
      if (this.config.enableAudit) {
        await this.logPermissionCheck(request, result, Date.now() - startTime);
      }

      return result;
    } catch (error) {
      return {
        allowed: false,
        reason: RBAC_ERRORS.DATABASE_ERROR,
        cacheable: false,
      };
    }
  }

  /**
   * Check multiple permissions at once
   */
  async checkPermissions(requests: PermissionCheckRequest[]): Promise<PermissionCheckResult[]> {
    return Promise.all(requests.map(request => this.checkPermission(request)));
  }

  /**
   * Get user with their role and organization context
   */
  private async getUserWithRole(userId: string): Promise<RBACUser | null> {
    const { data: orgRole, error } = await this.supabase
      .from('org_roles')
      .select('role, org_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !orgRole) {
      return null;
    }

    return {
      id: userId,
      role: orgRole.role,
      orgId: orgRole.org_id,
      powerLevel: ROLE_HIERARCHY[orgRole.role as UserRole],
    };
  }

  /**
   * Check permission conditions against the database
   */
  private async checkPermissionConditions(
    user: RBACUser,
    request: PermissionCheckRequest
  ): Promise<{ allowed: boolean; reason?: string; conditions?: any[] }> {
    // Find permission matrix entry for the user's role and resource
    const matrixEntry = PERMISSION_MATRIX.find(
      entry => entry.role === user.role && entry.resource === request.resource
    );

    if (!matrixEntry || !matrixEntry.conditions) {
      return { allowed: true };
    }

    // Parse conditions with user context
    const context = {
      current_user: user.id,
      user_role: user.role,
      org_id: user.orgId,
      ...request.context,
    };

    const filters = parsePermissionConditions(matrixEntry.conditions, context);

    // For resource-specific checks, query the database
    if (request.resourceId && this.requiresDatabaseCheck(request.resource)) {
      return this.checkDatabaseConditions(
        request.resource,
        request.resourceId,
        filters,
        user
      );
    }

    return { allowed: true, conditions: matrixEntry.conditions };
  }

  /**
   * Check if resource requires database validation
   */
  private requiresDatabaseCheck(resource: RBACResource): boolean {
    const databaseCheckedResources: RBACResource[] = [
      'events',
      'contacts', 
      'privacy_rules',
      'uploads',
      'nlq_queries',
      'sync_health',
      'webhooks',
      'tickets',
    ];

    return databaseCheckedResources.includes(resource);
  }

  /**
   * Check conditions against database records
   */
  private async checkDatabaseConditions(
    resource: RBACResource,
    resourceId: string,
    filters: Record<string, any>,
    user: RBACUser
  ): Promise<{ allowed: boolean; reason?: string }> {
    const tableName = this.getTableName(resource);
    
    try {
      const { data, error } = await this.supabase
        .from(tableName as any)
        .select('id, user_id')
        .eq('id', resourceId)
        .single();

      if (error || !data) {
        return { 
          allowed: false, 
          reason: 'Resource not found or access denied' 
        };
      }

      // Check ownership
      if (filters.user_id === user.id && data.user_id !== user.id) {
        return { 
          allowed: false, 
          reason: 'Resource not owned by user' 
        };
      }

      // Check organization membership for cross-user access
      if (data.user_id !== user.id) {
        const sameOrg = await this.checkSameOrganization(user.id, data.user_id);
        if (!sameOrg) {
          return { 
            allowed: false, 
            reason: 'Users not in same organization' 
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      return { 
        allowed: false, 
        reason: RBAC_ERRORS.DATABASE_ERROR 
      };
    }
  }

  /**
   * Check if two users are in the same organization
   */
  private async checkSameOrganization(userId1: string, userId2: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('same_organization', {
        user1_id: userId1,
        user2_id: userId2,
      });

    return !error && data === true;
  }

  /**
   * Get table name for resource
   */
  private getTableName(resource: RBACResource): string {
    const tableMap: Record<RBACResource, string> = {
      events: 'events',
      contacts: 'contacts',
      privacy_rules: 'privacy_rules',
      organizations: 'org_roles', // Use org_roles as proxy for orgs
      users: 'org_roles', // Use org_roles for user management
      dashboards: 'events', // Dashboards are views over events
      integrations: 'webhook_endpoints', // Use webhooks as proxy
      billing: 'billing_subscriptions',
      audit: 'audit_log',
      uploads: 'file_uploads',
      nlq_queries: 'nlq_queries',
      sync_health: 'sync_health',
      webhooks: 'webhook_endpoints',
      incidents: 'incidents',
      tickets: 'tickets',
    };

    return tableMap[resource] || resource;
  }

  /**
   * Log permission check for audit trail
   */
  private async logPermissionCheck(
    request: PermissionCheckRequest,
    result: PermissionCheckResult,
    executionTimeMs: number
  ): Promise<void> {
    try {
      await this.supabase
        .from('audit_log')
        .insert({
          actor_id: request.userId,
          action: 'permission_check',
          resource: request.resource,
          resource_id: request.resourceId,
          metadata: {
            action: request.action,
            allowed: result.allowed,
            reason: result.reason,
            execution_time_ms: executionTimeMs,
            cache_hit: result.cacheKey ? await this.cache.has(result.cacheKey) : false,
            context: request.context,
          },
        });
    } catch (error) {
      // Silently fail audit logging to avoid breaking permission checks
      console.error('Failed to log permission check:', error);
    }
  }

  /**
   * Get user's effective permissions
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    const user = await this.getUserWithRole(userId);
    if (!user) {
      return [];
    }

    return PERMISSION_MATRIX
      .filter(entry => entry.role === user.role)
      .flatMap(entry =>
        entry.actions.map(action => ({
          resource: entry.resource,
          action,
          conditions: entry.conditions,
        }))
      );
  }

  /**
   * Check if user can manage another user
   */
  async canManageUser(managerId: string, targetUserId: string): Promise<boolean> {
    const [manager, target] = await Promise.all([
      this.getUserWithRole(managerId),
      this.getUserWithRole(targetUserId),
    ]);

    if (!manager || !target) {
      return false;
    }

    // Must be in same organization
    if (manager.orgId !== target.orgId) {
      return false;
    }

    // Manager must have higher power level
    return manager.powerLevel > target.powerLevel;
  }

  /**
   * Invalidate cache for user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.cache.invalidateUser(userId);
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    hitRatio: number;
    size: number;
    maxSize: number;
  }> {
    return this.cache.getStats();
  }

  /**
   * Warm up cache with common permissions
   */
  async warmupCache(userIds: string[] = []): Promise<void> {
    const commonRequests: PermissionCheckRequest[] = [
      { userId: '', resource: 'dashboards', action: 'read' },
      { userId: '', resource: 'events', action: 'read' },
      { userId: '', resource: 'contacts', action: 'read' },
      { userId: '', resource: 'uploads', action: 'write' },
    ];

    for (const userId of userIds.slice(0, 100)) { // Limit to avoid overload
      for (const template of commonRequests) {
        const request = { ...template, userId };
        await this.checkPermission(request);
      }
    }
  }

  /**
   * Close and cleanup resources
   */
  async close(): Promise<void> {
    await this.cache.close();
  }
}