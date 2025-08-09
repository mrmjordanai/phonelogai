import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';

interface RouteParams {
  params: {
    templateId: string;
  };
}

// Template update schema
const updateTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100).optional(),
  description: z.string().max(500).optional(),
  carrier: z.string().max(50).optional(),
  field_mappings: z.record(z.any()).optional(),
  validation_rules: z.record(z.any()).optional(),
  transformation_rules: z.record(z.any()).optional(),
  is_public: z.boolean().optional(),
  shared_with_org: z.boolean().optional(),
  create_new_version: z.boolean().default(false),
});

/**
 * GET /api/templates/[templateId]
 * 
 * Get a specific template with full details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'templates', 'read');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { templateId } = params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(templateId)) {
      return NextResponse.json(
        { error: 'Invalid template ID format' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get template (RLS will handle access control)
    const { data: template, error } = await supabase
      .from('parsing_templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_active', true)
      .single();

    if (error || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Get template usage analytics
    const { data: analytics, error: analyticsError } = await supabase
      .from('template_usage_analytics')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (analyticsError) {
      console.error('Failed to fetch template analytics:', analyticsError);
    }

    // Calculate analytics summary
    const usageAnalytics = analytics || [];
    const recentUsage = usageAnalytics.filter(a => 
      new Date(a.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    const successfulUsage = usageAnalytics.filter(a => a.success);
    const avgProcessingTime = usageAnalytics.length > 0 
      ? Math.round(usageAnalytics.reduce((sum, a) => sum + (a.processing_time_ms || 0), 0) / usageAnalytics.length)
      : 0;

    // Get template versions if this is a versioned template
    const { data: versions, error: versionsError } = await supabase
      .from('parsing_templates')
      .select('id, version, created_at, updated_at, is_active')
      .or(`id.eq.${templateId},parent_template_id.eq.${templateId}`)
      .order('version', { ascending: false });

    if (versionsError) {
      console.error('Failed to fetch template versions:', versionsError);
    }

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        carrier: template.carrier,
        file_format: template.file_format,
        version: template.version,
        is_public: template.is_public,
        shared_with_org: template.shared_with_org,
        suggested_by_ml: template.suggested_by_ml,
        ml_confidence: template.ml_confidence,
        created_at: template.created_at,
        updated_at: template.updated_at,
        last_used_at: template.last_used_at,
        
        // Template configuration
        field_mappings: template.field_mappings,
        validation_rules: template.validation_rules,
        transformation_rules: template.transformation_rules,
        
        // Ownership and permissions
        is_owner: template.user_id === user.id,
        can_edit: template.user_id === user.id,
        can_delete: template.user_id === user.id && template.usage_count === 0,
        can_clone: true,
        can_export: true,
        can_create_version: template.user_id === user.id,
      },
      
      analytics: {
        usage_count: template.usage_count,
        success_rate: template.success_rate,
        recent_usage_count: recentUsage.length,
        successful_usage_count: successfulUsage.length,
        avg_processing_time_ms: avgProcessingTime,
        total_rows_processed: usageAnalytics.reduce((sum, a) => sum + (a.rows_processed || 0), 0),
        
        // Usage trend (last 30 days)
        daily_usage: this.calculateDailyUsage(recentUsage),
        
        // Error patterns
        common_errors: this.getCommonErrors(usageAnalytics.filter(a => !a.success)),
        
        // Performance metrics
        performance_trend: this.calculatePerformanceTrend(usageAnalytics),
      },
      
      versions: (versions || []).map(v => ({
        id: v.id,
        version: v.version,
        is_current: v.id === templateId,
        is_active: v.is_active,
        created_at: v.created_at,
        updated_at: v.updated_at,
      })),
      
      usage_history: usageAnalytics.slice(0, 20).map(usage => ({
        id: usage.id,
        job_id: usage.job_id,
        processing_time_ms: usage.processing_time_ms,
        rows_processed: usage.rows_processed,
        success: usage.success,
        error_count: usage.error_count,
        file_size: usage.file_size,
        created_at: usage.created_at,
      })),
    });

  } catch (error) {
    console.error('Get template error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/templates/[templateId]
 * 
 * Update a template (create new version if requested)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'templates', 'update');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { templateId } = params;
    const requestData = await request.json();

    // Validate request data
    const validation = updateTemplateSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid update data',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const updateData = validation.data;
    const { create_new_version, ...templateUpdates } = updateData;

    const supabase = createClient();

    // Get current template and verify ownership
    const { data: currentTemplate, error: fetchError } = await supabase
      .from('parsing_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.id) // Ensure ownership
      .eq('is_active', true)
      .single();

    if (fetchError || !currentTemplate) {
      return NextResponse.json(
        { error: 'Template not found or access denied' },
        { status: 404 }
      );
    }

    let updatedTemplate;

    if (create_new_version) {
      // Create new version
      const newVersion = currentTemplate.version + 1;
      
      const { data: newTemplate, error: createError } = await supabase
        .from('parsing_templates')
        .insert({
          user_id: user.id,
          org_id: user.orgId,
          parent_template_id: currentTemplate.parent_template_id || currentTemplate.id,
          name: templateUpdates.name || currentTemplate.name,
          description: templateUpdates.description !== undefined ? templateUpdates.description : currentTemplate.description,
          carrier: templateUpdates.carrier !== undefined ? templateUpdates.carrier : currentTemplate.carrier,
          file_format: currentTemplate.file_format,
          field_mappings: templateUpdates.field_mappings || currentTemplate.field_mappings,
          validation_rules: templateUpdates.validation_rules || currentTemplate.validation_rules,
          transformation_rules: templateUpdates.transformation_rules || currentTemplate.transformation_rules,
          is_public: templateUpdates.is_public !== undefined ? templateUpdates.is_public : currentTemplate.is_public,
          shared_with_org: templateUpdates.shared_with_org !== undefined ? templateUpdates.shared_with_org : currentTemplate.shared_with_org,
          version: newVersion,
        })
        .select()
        .single();

      if (createError || !newTemplate) {
        console.error('Failed to create new template version:', createError);
        return NextResponse.json(
          { error: 'Failed to create new template version' },
          { status: 500 }
        );
      }

      // Optionally deactivate old version if specified
      if (templateUpdates.name && templateUpdates.name !== currentTemplate.name) {
        await supabase
          .from('parsing_templates')
          .update({ is_active: false })
          .eq('id', templateId);
      }

      updatedTemplate = newTemplate;
    } else {
      // Update current template
      const { data: updated, error: updateError } = await supabase
        .from('parsing_templates')
        .update({
          ...templateUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId)
        .select()
        .single();

      if (updateError || !updated) {
        console.error('Failed to update template:', updateError);
        return NextResponse.json(
          { error: 'Failed to update template' },
          { status: 500 }
        );
      }

      updatedTemplate = updated;
    }

    return NextResponse.json({
      success: true,
      message: create_new_version ? 'New template version created' : 'Template updated successfully',
      template: {
        id: updatedTemplate.id,
        name: updatedTemplate.name,
        description: updatedTemplate.description,
        carrier: updatedTemplate.carrier,
        file_format: updatedTemplate.file_format,
        version: updatedTemplate.version,
        is_public: updatedTemplate.is_public,
        shared_with_org: updatedTemplate.shared_with_org,
        created_at: updatedTemplate.created_at,
        updated_at: updatedTemplate.updated_at,
      },
      is_new_version: create_new_version,
      previous_version: create_new_version ? currentTemplate.version : undefined,
    });

  } catch (error) {
    console.error('Update template error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/[templateId]
 * 
 * Delete a template (soft delete by setting is_active = false)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'templates', 'delete');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { templateId } = params;

    const supabase = createClient();

    // Get template and verify ownership
    const { data: template, error: fetchError } = await supabase
      .from('parsing_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.id) // Ensure ownership
      .eq('is_active', true)
      .single();

    if (fetchError || !template) {
      return NextResponse.json(
        { error: 'Template not found or access denied' },
        { status: 404 }
      );
    }

    // Check if template is being used
    if (template.usage_count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete template that has been used. Consider deactivating instead.' },
        { status: 400 }
      );
    }

    // Soft delete template
    const { error: deleteError } = await supabase
      .from('parsing_templates')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId);

    if (deleteError) {
      console.error('Failed to delete template:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete template' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully',
      deleted_template_id: templateId,
    });

  } catch (error) {
    console.error('Delete template error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper functions for analytics calculations
function calculateDailyUsage(usageData: any[]): Record<string, number> {
  const dailyUsage: Record<string, number> = {};
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().split('T')[0];
    dailyUsage[dateKey] = 0;
  }
  
  usageData.forEach(usage => {
    const dateKey = new Date(usage.created_at).toISOString().split('T')[0];
    if (dailyUsage[dateKey] !== undefined) {
      dailyUsage[dateKey]++;
    }
  });
  
  return dailyUsage;
}

function getCommonErrors(failedUsage: any[]): Array<{ error: string; count: number }> {
  const errorCounts: Record<string, number> = {};
  
  failedUsage.forEach(usage => {
    if (usage.error_message) {
      const error = usage.error_message.substring(0, 100); // Truncate long errors
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    }
  });
  
  return Object.entries(errorCounts)
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function calculatePerformanceTrend(usageData: any[]): Array<{ date: string; avg_time: number; count: number }> {
  const dailyPerformance: Record<string, { times: number[]; count: number }> = {};
  
  // Initialize last 7 days
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().split('T')[0];
    dailyPerformance[dateKey] = { times: [], count: 0 };
  }
  
  // Aggregate data
  usageData.forEach(usage => {
    if (usage.processing_time_ms && usage.success) {
      const dateKey = new Date(usage.created_at).toISOString().split('T')[0];
      if (dailyPerformance[dateKey]) {
        dailyPerformance[dateKey].times.push(usage.processing_time_ms);
        dailyPerformance[dateKey].count++;
      }
    }
  });
  
  // Calculate averages
  return Object.entries(dailyPerformance)
    .map(([date, data]) => ({
      date,
      avg_time: data.times.length > 0 
        ? Math.round(data.times.reduce((sum, time) => sum + time, 0) / data.times.length)
        : 0,
      count: data.count,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}