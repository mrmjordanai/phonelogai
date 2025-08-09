/**
 * Authentication Middleware
 * Validates JWT tokens and extracts user information
 */

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@phonelogai/database';
import type { UserRole } from '@phonelogai/shared/rbac';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: UserRole;
  orgId: string;
  powerLevel: number;
}

export interface AuthMiddlewareResult {
  user: AuthenticatedUser | null;
  error?: string;
  response?: NextResponse;
}

/**
 * Authenticate user from request
 */
export async function authenticateUser(request: NextRequest): Promise<AuthMiddlewareResult> {
  try {
    const supabase = createServerComponentClient<Database>({ cookies });
    
    // Get session from Supabase
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return {
        user: null,
        error: 'Authentication required',
        response: NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        ),
      };
    }

    // Get user's organization role
    const { data: orgRole, error: roleError } = await supabase
      .from('org_roles')
      .select('role, org_id')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (roleError || !orgRole) {
      return {
        user: null,
        error: 'User not found in organization',
        response: NextResponse.json(
          { error: 'User not found in organization' },
          { status: 403 }
        ),
      };
    }

    // Map role to power level
    const rolePowerMap: Record<UserRole, number> = {
      viewer: 1,
      member: 2,
      analyst: 3,
      admin: 4,
      owner: 5,
    };

    const user: AuthenticatedUser = {
      id: session.user.id,
      email: session.user.email,
      role: orgRole.role,
      orgId: orgRole.org_id,
      powerLevel: rolePowerMap[orgRole.role],
    };

    return { user };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      user: null,
      error: 'Internal authentication error',
      response: NextResponse.json(
        { error: 'Internal authentication error' },
        { status: 500 }
      ),
    };
  }
}

/**
 * API key authentication for service-to-service calls
 */
export async function authenticateApiKey(request: NextRequest): Promise<AuthMiddlewareResult> {
  const apiKey = request.headers.get('x-api-key');
  
  if (!apiKey) {
    return {
      user: null,
      error: 'API key required',
      response: NextResponse.json(
        { error: 'API key required' },
        { status: 401 }
      ),
    };
  }

  try {
    const supabase = createServerComponentClient<Database>({ cookies });
    
    // TODO: Implement API key validation against database
    // For now, we'll use session-based auth
    return authenticateUser(request);
  } catch (error) {
    return {
      user: null,
      error: 'Invalid API key',
      response: NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      ),
    };
  }
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  return authorization.substring(7);
}

/**
 * Validate JWT token structure (basic validation)
 */
export function isValidJWT(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3;
}

/**
 * Create authentication error response
 */
export function createAuthErrorResponse(message: string, status = 401): NextResponse {
  return NextResponse.json(
    { 
      error: message,
      timestamp: new Date().toISOString(),
      path: 'middleware/auth'
    },
    { status }
  );
}