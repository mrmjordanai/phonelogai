/**
 * RBAC Middleware
 * Role-based access control for API endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { RBACManager, PermissionCache } from '@phonelogai/database/rbac';
import { supabase } from '@phonelogai/database';
import type { 
  RBACResource, 
  RBACAction, 
  PermissionCheckRequest,
  UserRole 
} from '@phonelogai/shared/rbac';
import { RBAC_ERRORS } from '@phonelogai/shared/rbac';
import type { AuthenticatedUser } from './auth';

// Global RBAC manager instance
let rbacManager: RBACManager | null = null;

function getRBACManager(): RBACManager {
  if (!rbacManager) {
    const cache = new PermissionCache();
    rbacManager = new RBACManager(supabase, cache);
  }
  return rbacManager;
}

export interface RBACMiddlewareOptions {
  resource: RBACResource;
  action: RBACAction;
  resourceId?: string | ((request: NextRequest) => string | undefined);
  requireOwnership?: boolean;
  minimumRole?: UserRole;
  organizationScoped?: boolean;
}

export interface RBACMiddlewareResult {
  allowed: boolean;
  reason?: string;
  response?: NextResponse;
}

/**
 * Main RBAC authorization check
 */
export async function authorize(
  user: AuthenticatedUser,
  request: NextRequest,
  options: RBACMiddlewareOptions
): Promise<RBACMiddlewareResult> {
  try {
    const manager = getRBACManager();

    // Extract resource ID if it's a function
    const resourceId = typeof options.resourceId === 'function' 
      ? options.resourceId(request)
      : options.resourceId;

    // Build permission check request
    const permissionRequest: PermissionCheckRequest = {
      userId: user.id,
      resource: options.resource,
      action: options.action,
      resourceId,
      context: {
        user_role: user.role,
        org_id: user.orgId,
        power_level: user.powerLevel,
        request_path: request.nextUrl.pathname,
        request_method: request.method,
      },
    };

    // Check minimum role requirement
    if (options.minimumRole) {
      const hasMinRole = await manager.canManageUser(user.id, user.id); // Self-check for role validation
      if (!hasMinRole && !hasMinimumRoleLevel(user.role, options.minimumRole)) {
        return {
          allowed: false,
          reason: `Minimum role required: ${options.minimumRole}`,
          response: createRBACErrorResponse(
            `Access denied: Minimum role '${options.minimumRole}' required`,
            403
          ),
        };
      }
    }

    // Perform permission check
    const result = await manager.checkPermission(permissionRequest);

    if (!result.allowed) {
      return {
        allowed: false,
        reason: result.reason || RBAC_ERRORS.ACCESS_DENIED,
        response: createRBACErrorResponse(
          result.reason || RBAC_ERRORS.ACCESS_DENIED,
          403
        ),
      };
    }

    // Additional ownership check if required
    if (options.requireOwnership && resourceId) {
      const isOwner = await checkResourceOwnership(
        user.id,
        options.resource,
        resourceId
      );

      if (!isOwner && user.role !== 'owner' && user.role !== 'admin') {
        return {
          allowed: false,
          reason: 'Resource ownership required',
          response: createRBACErrorResponse('Resource ownership required', 403),
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error('RBAC authorization error:', error);
    return {
      allowed: false,
      reason: RBAC_ERRORS.DATABASE_ERROR,
      response: createRBACErrorResponse(RBAC_ERRORS.DATABASE_ERROR, 500),
    };
  }
}

/**
 * Check if user has minimum role level
 */
function hasMinimumRoleLevel(userRole: UserRole, minimumRole: UserRole): boolean {
  const roleLevels: Record<UserRole, number> = {
    viewer: 1,
    member: 2,
    analyst: 3,
    admin: 4,
    owner: 5,
  };

  return roleLevels[userRole] >= roleLevels[minimumRole];
}

/**
 * Check if user owns a specific resource
 */
async function checkResourceOwnership(
  userId: string,
  resource: RBACResource,
  resourceId: string
): Promise<boolean> {
  try {
    const manager = getRBACManager();
    return await manager.checkPermission({
      userId,
      resource,
      action: 'manage',
      resourceId,
      context: { ownership_check: true },
    }).then(result => result.allowed);
  } catch (error) {
    console.error('Resource ownership check error:', error);
    return false;
  }
}

/**
 * Create RBAC middleware for specific resource/action combinations
 */
export function createRBACMiddleware(options: RBACMiddlewareOptions) {
  return async (user: AuthenticatedUser, request: NextRequest): Promise<RBACMiddlewareResult> => {
    return authorize(user, request, options);
  };
}

/**
 * Pre-built middleware for common use cases
 */
export const rbacMiddleware = {
  // Events
  readEvents: createRBACMiddleware({ resource: 'events', action: 'read' }),
  writeEvents: createRBACMiddleware({ resource: 'events', action: 'write' }),
  exportEvents: createRBACMiddleware({ 
    resource: 'events', 
    action: 'export', 
    minimumRole: 'analyst' 
  }),
  
  // Contacts
  readContacts: createRBACMiddleware({ resource: 'contacts', action: 'read' }),
  writeContacts: createRBACMiddleware({ resource: 'contacts', action: 'write' }),
  manageContacts: createRBACMiddleware({ 
    resource: 'contacts', 
    action: 'manage',
    minimumRole: 'admin'
  }),

  // Users
  readUsers: createRBACMiddleware({ resource: 'users', action: 'read' }),
  manageUsers: createRBACMiddleware({ 
    resource: 'users', 
    action: 'manage',
    minimumRole: 'admin'
  }),

  // Organizations
  readOrganizations: createRBACMiddleware({ resource: 'organizations', action: 'read' }),
  manageOrganizations: createRBACMiddleware({ 
    resource: 'organizations', 
    action: 'manage',
    minimumRole: 'owner'
  }),

  // Dashboards
  readDashboards: createRBACMiddleware({ resource: 'dashboards', action: 'read' }),
  writeDashboards: createRBACMiddleware({ 
    resource: 'dashboards', 
    action: 'write',
    minimumRole: 'analyst'
  }),

  // Billing
  readBilling: createRBACMiddleware({ 
    resource: 'billing', 
    action: 'read',
    minimumRole: 'admin'
  }),
  manageBilling: createRBACMiddleware({ 
    resource: 'billing', 
    action: 'manage',
    minimumRole: 'owner'
  }),

  // Audit
  readAudit: createRBACMiddleware({ 
    resource: 'audit', 
    action: 'read',
    minimumRole: 'analyst'
  }),
  exportAudit: createRBACMiddleware({ 
    resource: 'audit', 
    action: 'export',
    minimumRole: 'admin'
  }),

  // Uploads
  readUploads: createRBACMiddleware({ resource: 'uploads', action: 'read' }),
  writeUploads: createRBACMiddleware({ resource: 'uploads', action: 'write' }),
  
  // Integrations
  readIntegrations: createRBACMiddleware({ resource: 'integrations', action: 'read' }),
  manageIntegrations: createRBACMiddleware({ 
    resource: 'integrations', 
    action: 'manage',
    minimumRole: 'admin'
  }),
};

/**
 * Extract resource ID from URL path
 */
export function extractResourceId(request: NextRequest, paramName = 'id'): string | undefined {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  
  // Look for UUID pattern in path
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  for (const part of pathParts) {
    if (uuidRegex.test(part)) {
      return part;
    }
  }

  // Fallback to query parameter
  return url.searchParams.get(paramName) || undefined;
}

/**
 * Extract multiple resource IDs from request body or query
 */
export async function extractResourceIds(request: NextRequest): Promise<string[]> {
  const url = new URL(request.url);
  
  // Check query params for comma-separated IDs
  const queryIds = url.searchParams.get('ids');
  if (queryIds) {
    return queryIds.split(',').filter(id => id.trim().length > 0);
  }

  // Check request body for IDs array
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    try {
      const body = await request.clone().json();
      if (body.ids && Array.isArray(body.ids)) {
        return body.ids;
      }
    } catch (error) {
      // Body might not be JSON
    }
  }

  return [];
}

/**
 * Create RBAC error response
 */
export function createRBACErrorResponse(message: string, status = 403): NextResponse {
  return NextResponse.json(
    { 
      error: message,
      timestamp: new Date().toISOString(),
      path: 'middleware/rbac'
    },
    { status }
  );
}

/**
 * Audit log RBAC decision
 */
export async function auditRBACDecision(
  user: AuthenticatedUser,
  request: NextRequest,
  options: RBACMiddlewareOptions,
  result: RBACMiddlewareResult
): Promise<void> {
  try {
    const manager = getRBACManager();
    
    await supabase.from('audit_log').insert({
      actor_id: user.id,
      action: 'rbac_decision',
      resource: 'rbac',
      metadata: {
        requested_resource: options.resource,
        requested_action: options.action,
        resource_id: typeof options.resourceId === 'string' ? options.resourceId : undefined,
        allowed: result.allowed,
        reason: result.reason,
        request_path: request.nextUrl.pathname,
        request_method: request.method,
        user_role: user.role,
        minimum_role: options.minimumRole,
      },
    });
  } catch (error) {
    console.error('Failed to audit RBAC decision:', error);
  }
}

/**
 * Cleanup RBAC resources
 */
export async function cleanup(): Promise<void> {
  if (rbacManager) {
    await rbacManager.close();
    rbacManager = null;
  }
}