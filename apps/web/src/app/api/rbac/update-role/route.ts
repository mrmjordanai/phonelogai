/**
 * API Route: Update User Role
 * Updates a user's role within the organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { withMiddleware } from '../../../../middleware';
import { DatabaseRBAC } from '@phonelogai/database';
import { supabase } from '@phonelogai/database';
import type { UserRole } from '@phonelogai/shared/rbac';
import { isValidRole } from '@phonelogai/shared/rbac';

export const dynamic = 'force-dynamic';

async function handler(
  request: NextRequest,
  context: { user: { id: string } }
) {
  try {
    const { user } = context;
    const body = await request.json();
    
    const { userId: targetUserId, newRole } = body;

    // Validate input
    if (!targetUserId || !newRole) {
      return NextResponse.json(
        { error: 'User ID and new role are required' },
        { status: 400 }
      );
    }

    if (!isValidRole(newRole)) {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      );
    }

    // Check if user can modify the target user's role
    const dbRBAC = new DatabaseRBAC(supabase);
    const canModify = await dbRBAC.canModifyOrgRole(user.id, targetUserId, newRole as UserRole);

    if (!canModify) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update this role' },
        { status: 403 }
      );
    }

    // Get current role for audit logging
    const { data: currentRole, error: currentRoleError } = await supabase
      .from('org_roles')
      .select('role, org_id')
      .eq('user_id', targetUserId)
      .single();

    if (currentRoleError || !currentRole) {
      return NextResponse.json(
        { error: 'Target user not found in organization' },
        { status: 404 }
      );
    }

    // Update the role
    const { error: updateError } = await supabase
      .from('org_roles')
      .update({ 
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', targetUserId)
      .eq('org_id', currentRole.org_id);

    if (updateError) {
      console.error('Role update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update role' },
        { status: 500 }
      );
    }

    // Log the role change
    await dbRBAC.logRBACEvent(
      user.id,
      'role_change',
      'user',
      targetUserId,
      {
        old_role: currentRole.role,
        new_role: newRole,
        org_id: currentRole.org_id,
        timestamp: new Date().toISOString(),
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Role updated successfully',
      oldRole: currentRole.role,
      newRole,
    });
  } catch (error) {
    console.error('Role update failed:', error);
    return NextResponse.json(
      { error: 'Role update failed' },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handler, {
  auth: { required: true },
  rbac: {
    resource: 'users',
    action: 'manage',
    minimumRole: 'admin',
  },
  validation: {
    requireBody: true,
    contentTypes: ['application/json'],
  },
  audit: true,
});