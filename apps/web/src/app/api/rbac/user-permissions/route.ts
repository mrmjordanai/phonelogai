/**
 * API Route: Get User Permissions
 * Returns user's role and permissions for RBAC
 */

import { NextRequest, NextResponse } from 'next/server';
import { withMiddleware } from '../../../../middleware';
import { RBACManager } from '@phonelogai/database/rbac';
import { supabase } from '@phonelogai/database';

export const dynamic = 'force-dynamic';

async function handler(
  request: NextRequest,
  context: { user: { id: string } }
) {
  try {
    const { user } = context;

    // Get user's organization role
    const { data: orgRole, error: roleError } = await supabase
      .from('org_roles')
      .select('role, org_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (roleError || !orgRole) {
      return NextResponse.json(
        { error: 'User not found in organization' },
        { status: 404 }
      );
    }

    // Get user permissions using RBAC manager
    const rbacManager = new RBACManager(supabase);
    const permissions = await rbacManager.getUserPermissions(user.id);

    return NextResponse.json({
      role: orgRole.role,
      orgId: orgRole.org_id,
      permissions: permissions.data || [],
      powerLevel: {
        viewer: 1,
        member: 2,
        analyst: 3,
        admin: 4,
        owner: 5,
      }[orgRole.role] || 1,
    });
  } catch (error) {
    console.error('Failed to get user permissions:', error);
    return NextResponse.json(
      { error: 'Failed to get user permissions' },
      { status: 500 }
    );
  }
}

export const GET = withMiddleware(handler, {
  auth: { required: true },
});