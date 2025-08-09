/**
 * API Route: Check Permission
 * Validates user permission for specific resource and action
 */

import { NextRequest, NextResponse } from 'next/server';
import { withMiddleware } from '../../../../middleware';
import { RBACManager } from '@phonelogai/database/rbac';
import { supabase } from '@phonelogai/database';
import type { RBACResource, RBACAction } from '@phonelogai/shared/rbac';
import { isValidResource, isValidAction } from '@phonelogai/shared/rbac';

export const dynamic = 'force-dynamic';

async function handler(
  request: NextRequest,
  context: { user: { id: string } }
) {
  try {
    const { user } = context;
    const body = await request.json();
    
    const { resource, action, resourceId } = body;

    // Validate input
    if (!resource || !action) {
      return NextResponse.json(
        { error: 'Resource and action are required' },
        { status: 400 }
      );
    }

    if (!isValidResource(resource) || !isValidAction(action)) {
      return NextResponse.json(
        { error: 'Invalid resource or action' },
        { status: 400 }
      );
    }

    // Check permission using RBAC manager
    const rbacManager = new RBACManager(supabase);
    const result = await rbacManager.checkPermission({
      userId: user.id,
      resource: resource as RBACResource,
      action: action as RBACAction,
      resourceId,
      context: {
        request_path: request.nextUrl.pathname,
        request_method: request.method,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      allowed: result.allowed,
      reason: result.reason,
      cacheable: result.cacheable,
    });
  } catch (error) {
    console.error('Permission check failed:', error);
    return NextResponse.json(
      { error: 'Permission check failed' },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handler, {
  auth: { required: true },
  validation: {
    requireBody: true,
    contentTypes: ['application/json'],
  },
});