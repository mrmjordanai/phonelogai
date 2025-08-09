/**
 * API Middleware Orchestrator
 * Combines authentication, authorization, and request validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, type AuthenticatedUser } from './auth';
import { authorize, auditRBACDecision, type RBACMiddlewareOptions } from './rbac';
import { validateRequest, type RequestValidationOptions } from './validation';
import { rateLimitRequest, type RateLimitOptions } from './rateLimit';

export interface MiddlewareOptions {
  auth?: {
    required?: boolean;
    allowApiKey?: boolean;
  };
  rbac?: RBACMiddlewareOptions;
  validation?: RequestValidationOptions;
  rateLimit?: RateLimitOptions;
  audit?: boolean;
}

export interface MiddlewareContext {
  user: AuthenticatedUser | null;
  request: NextRequest;
  startTime: number;
}

export interface MiddlewareResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
  response?: NextResponse;
  context?: MiddlewareContext;
}

/**
 * Main middleware orchestrator
 */
export async function runMiddleware(
  request: NextRequest,
  options: MiddlewareOptions = {}
): Promise<MiddlewareResult> {
  const startTime = Date.now();

  try {
    // Step 1: Rate limiting (if enabled)
    if (options.rateLimit) {
      const rateLimitResult = await rateLimitRequest(request, options.rateLimit);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: 'Rate limit exceeded',
          response: rateLimitResult.response,
        };
      }
    }

    // Step 2: Request validation (if enabled)
    if (options.validation) {
      const validationResult = await validateRequest(request, options.validation);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error || 'Request validation failed',
          response: validationResult.response,
        };
      }
    }

    // Step 3: Authentication (if required)
    let user: AuthenticatedUser | null = null;
    
    if (options.auth?.required !== false) {
      const authResult = await authenticateUser(request);
      
      if (!authResult.user) {
        return {
          success: false,
          error: authResult.error || 'Authentication failed',
          response: authResult.response,
        };
      }
      
      user = authResult.user;
    }

    // Step 4: RBAC authorization (if enabled and user authenticated)
    if (options.rbac && user) {
      const rbacResult = await authorize(user, request, options.rbac);
      
      if (!rbacResult.allowed) {
        // Audit RBAC decision
        if (options.audit !== false) {
          await auditRBACDecision(user, request, options.rbac, rbacResult);
        }
        
        return {
          success: false,
          error: rbacResult.reason || 'Access denied',
          response: rbacResult.response,
        };
      }

      // Audit successful access
      if (options.audit !== false) {
        await auditRBACDecision(user, request, options.rbac, rbacResult);
      }
    }

    // Success - create context
    const context: MiddlewareContext = {
      user,
      request,
      startTime,
    };

    return {
      success: true,
      user,
      context,
    };
  } catch (error) {
    console.error('Middleware error:', error);
    
    return {
      success: false,
      error: 'Internal middleware error',
      response: NextResponse.json(
        { 
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      ),
    };
  }
}

/**
 * Create middleware for API routes
 */
export function createAPIMiddleware(options: MiddlewareOptions) {
  return async (request: NextRequest) => {
    return runMiddleware(request, options);
  };
}

/**
 * Pre-configured middleware for common patterns
 */
export const apiMiddleware = {
  // Public endpoints (no auth required)
  public: createAPIMiddleware({
    auth: { required: false },
    rateLimit: { requests: 100, window: 60 }, // 100 req/min
  }),

  // Authenticated endpoints
  authenticated: createAPIMiddleware({
    auth: { required: true },
    rateLimit: { requests: 1000, window: 60 }, // 1000 req/min for auth users
  }),

  // Admin only endpoints
  adminOnly: createAPIMiddleware({
    auth: { required: true },
    rbac: { resource: 'organizations', action: 'manage' },
    rateLimit: { requests: 500, window: 60 },
  }),

  // Read-only data endpoints
  readOnly: createAPIMiddleware({
    auth: { required: true },
    rbac: { resource: 'events', action: 'read' },
    rateLimit: { requests: 2000, window: 60 },
  }),

  // Write operations
  write: createAPIMiddleware({
    auth: { required: true },
    rbac: { resource: 'events', action: 'write' },
    validation: { requireBody: true, maxBodySize: 10 * 1024 * 1024 }, // 10MB
    rateLimit: { requests: 100, window: 60 },
    audit: true,
  }),

  // Export operations (analyst+)
  export: createAPIMiddleware({
    auth: { required: true },
    rbac: { 
      resource: 'events', 
      action: 'export',
      minimumRole: 'analyst'
    },
    rateLimit: { requests: 10, window: 60 }, // Limited export requests
    audit: true,
  }),

  // Billing operations (owner only)
  billing: createAPIMiddleware({
    auth: { required: true },
    rbac: { 
      resource: 'billing', 
      action: 'manage',
      minimumRole: 'owner'
    },
    rateLimit: { requests: 50, window: 60 },
    audit: true,
  }),

  // File upload endpoints
  upload: createAPIMiddleware({
    auth: { required: true },
    rbac: { resource: 'uploads', action: 'write' },
    validation: { 
      requireBody: true, 
      maxBodySize: 100 * 1024 * 1024, // 100MB
      contentTypes: ['multipart/form-data', 'application/octet-stream']
    },
    rateLimit: { requests: 10, window: 300 }, // 10 uploads per 5 minutes
    audit: true,
  }),
};

/**
 * Create middleware wrapper for Next.js API routes
 */
export function withMiddleware(
  handler: (
    request: NextRequest,
    context: MiddlewareContext
  ) => Promise<NextResponse> | NextResponse,
  options: MiddlewareOptions = {}
) {
  return async (request: NextRequest) => {
    const middlewareResult = await runMiddleware(request, {
      auth: { required: true },
      ...options,
    });

    if (!middlewareResult.success) {
      return middlewareResult.response || NextResponse.json(
        { error: middlewareResult.error },
        { status: 500 }
      );
    }

    try {
      return await handler(request, middlewareResult.context!);
    } catch (error) {
      console.error('API handler error:', error);
      
      // Audit the error
      if (middlewareResult.user) {
        await auditAPIError(
          middlewareResult.user,
          request,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Audit API errors
 */
async function auditAPIError(
  user: AuthenticatedUser,
  request: NextRequest,
  errorMessage: string
): Promise<void> {
  try {
    const { supabase } = await import('@phonelogai/database');
    
    await supabase.from('audit_log').insert({
      actor_id: user.id,
      action: 'api_error',
      resource: 'api',
      metadata: {
        error: errorMessage,
        path: request.nextUrl.pathname,
        method: request.method,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (auditError) {
    console.error('Failed to audit API error:', auditError);
  }
}

/**
 * Performance tracking middleware
 */
export function withPerformanceTracking<T>(
  handler: T,
  name: string
): T {
  if (typeof handler !== 'function') {
    return handler;
  }

  return (async (...args: any[]) => {
    const startTime = Date.now();
    
    try {
      const result = await (handler as Function)(...args);
      const duration = Date.now() - startTime;
      
      // Log slow requests
      if (duration > 5000) { // 5 seconds
        console.warn(`Slow API request: ${name} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`API error in ${name} after ${duration}ms:`, error);
      throw error;
    }
  }) as T;
}

// Export all middleware components
export * from './auth';
export * from './rbac';
export * from './validation';
export * from './rateLimit';
export type { MiddlewareOptions, MiddlewareContext, MiddlewareResult };