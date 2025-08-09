/**
 * Bulk Privacy Update API
 * Handles bulk privacy rule updates for multiple contacts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@phonelogai/database';
import { SecurityManager, createSecurityManager } from '@phonelogai/database/security';
import type { BulkPrivacyUpdate } from '@phonelogai/database/security';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { updates }: { updates: BulkPrivacyUpdate[] } = body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: 'Updates array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Validate updates
    for (const update of updates) {
      if (!update.contactId && !update.numberPattern) {
        return NextResponse.json(
          { error: 'Each update must have either contactId or numberPattern' },
          { status: 400 }
        );
      }
    }

    // Initialize security manager
    const securityManager = await createSecurityManager(supabase);
    
    // Process bulk update using privacy rule engine
    const result = await securityManager.privacy.bulkUpdatePrivacy(
      user.id,
      updates,
      {
        userId: user.id,
        reason: 'bulk_privacy_update',
        metadata: {
          update_count: updates.length,
          initiated_via: 'web_ui'
        }
      }
    );

    // Return detailed results
    return NextResponse.json({
      success: result.errorCount === 0,
      successCount: result.successCount,
      errorCount: result.errorCount,
      processedCount: result.processedCount,
      errors: result.errors,
      operationId: result.operationId,
      affectedRules: result.affectedRules.length
    });
    
  } catch (error) {
    console.error('Bulk privacy update API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process bulk privacy update',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Alternative implementation without SecurityManager for simpler cases
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contactIds, settings } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json(
        { error: 'Contact IDs array is required' },
        { status: 400 }
      );
    }

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Settings object is required' },
        { status: 400 }
      );
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ contactId: string; error: string }> = [];

    // Get organization ID
    const { data: orgRole } = await supabase
      .from('org_roles')
      .select('org_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Process each contact
    for (const contactId of contactIds) {
      try {
        // Build rule data
        const ruleData = {
          rule_name: `Bulk Rule - ${contactId}`,
          rule_priority: 100,
          scope: 'contact',
          user_id: user.id,
          organization_id: orgRole?.org_id,
          contact_id: contactId,
          visibility: settings.visibility || 'team',
          anonymize_number: settings.anonymizeNumber || false,
          anonymize_content: settings.anonymizeContent || false,
          anonymization_level: 'none',
          allow_export: settings.allowExport !== false,
          allow_analytics: settings.allowAnalytics !== false,
          allow_ml_training: settings.allowMlTraining || false,
          inherit_from_parent: true,
          override_children: false,
          effective_from: new Date().toISOString(),
          is_active: true,
          auto_applied: true,
          created_by: user.id,
          metadata: {
            bulk_update: true,
            update_timestamp: new Date().toISOString()
          }
        };

        // Upsert privacy rule
        const { error: upsertError } = await supabase
          .from('enhanced_privacy_rules')
          .upsert(ruleData, {
            onConflict: 'user_id,contact_id',
            ignoreDuplicates: false
          });

        if (upsertError) {
          throw upsertError;
        }

        successCount++;
      } catch (error) {
        errorCount++;
        errors.push({
          contactId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Log the bulk operation
    try {
      await supabase
        .from('enhanced_audit_log')
        .insert({
          actor_id: user.id,
          actor_type: 'user',
          category: 'bulk_operation',
          action: 'bulk_privacy_update',
          severity: 'medium',
          outcome: errorCount === 0 ? 'success' : 'warning',
          resource: 'privacy_rules',
          description: `Bulk privacy update for ${contactIds.length} contacts`,
          metadata: {
            total_contacts: contactIds.length,
            success_count: successCount,
            error_count: errorCount,
            settings,
            errors: errors.length > 0 ? errors : undefined
          }
        });
    } catch (auditError) {
      console.error('Failed to log bulk operation:', auditError);
    }

    return NextResponse.json({
      success: errorCount === 0,
      successCount,
      errorCount,
      processedCount: contactIds.length,
      errors
    });
    
  } catch (error) {
    console.error('Simple bulk privacy update API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process bulk privacy update',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
