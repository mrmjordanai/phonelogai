import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';

// Template creation/update schema
const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100),
  description: z.string().max(500).optional(),
  carrier: z.string().max(50).optional(),
  file_format: z.enum(['csv', 'pdf', 'txt', 'xlsx', 'json']),
  field_mappings: z.record(z.any()).default({}),
  validation_rules: z.record(z.any()).default({}),
  transformation_rules: z.record(z.any()).default({}),
  is_public: z.boolean().default(false),
  shared_with_org: z.boolean().default(false),
});

// Query parameters schema
const listTemplatesSchema = z.object({
  carrier: z.string().optional(),
  file_format: z.enum(['csv', 'pdf', 'txt', 'xlsx', 'json']).optional(),
  is_public: z.coerce.boolean().optional(),
  shared_with_org: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  sort_by: z.enum(['name', 'created_at', 'updated_at', 'usage_count', 'success_rate']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /api/templates
 * 
 * List parsing templates with filtering and search
 */
export async function GET(request: NextRequest) {
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
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    const validation = listTemplatesSchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const { carrier, file_format, is_public, shared_with_org, search, limit, offset, sort_by, sort_order } = validation.data;

    const supabase = createClient();

    // Build query with RLS (Row Level Security handles access control)
    let query = supabase
      .from('parsing_templates')
      .select(`
        *,
        template_usage_analytics!inner(
          processing_time_ms,
          rows_processed,
          success,
          created_at
        )
      `)
      .eq('is_active', true);

    // Apply filters
    if (carrier) {
      query = query.eq('carrier', carrier);
    }
    if (file_format) {
      query = query.eq('file_format', file_format);
    }
    if (is_public !== undefined) {
      query = query.eq('is_public', is_public);
    }
    if (shared_with_org !== undefined) {
      query = query.eq('shared_with_org', shared_with_org);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,carrier.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });
    
    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: templates, error, count } = await query;

    if (error) {
      console.error('Failed to fetch templates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }

    // Format templates with analytics
    const formattedTemplates = templates.map(template => {
      const analytics = template.template_usage_analytics || [];
      const recentUsage = analytics.filter(a => 
        new Date(a.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      );
      
      return {
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
        
        // Analytics
        usage_count: template.usage_count,
        success_rate: template.success_rate,
        recent_usage_count: recentUsage.length,
        avg_processing_time: recentUsage.length > 0 
          ? Math.round(recentUsage.reduce((sum, a) => sum + (a.processing_time_ms || 0), 0) / recentUsage.length)
          : null,
        
        // Ownership
        is_owner: template.user_id === user.id,
        
        // Actions available
        can_edit: template.user_id === user.id,
        can_delete: template.user_id === user.id && template.usage_count === 0,
        can_clone: true,
        can_export: true,
      };
    });

    return NextResponse.json({
      templates: formattedTemplates,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
      filters: {
        carrier,
        file_format,
        is_public,
        shared_with_org,
        search,
        sort_by,
        sort_order,
      },
    });

  } catch (error) {
    console.error('Get templates error:', error);
    
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
 * POST /api/templates
 * 
 * Create a new parsing template
 */
export async function POST(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'templates', 'create');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const requestData = await request.json();

    // Validate request data
    const validation = templateSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid template data',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const templateData = validation.data;

    // Check for duplicate template names within user's templates
    const supabase = createClient();
    const { data: existingTemplates, error: checkError } = await supabase
      .from('parsing_templates')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('name', templateData.name)
      .eq('is_active', true);

    if (checkError) {
      console.error('Failed to check existing templates:', checkError);
      return NextResponse.json(
        { error: 'Failed to check existing templates' },
        { status: 500 }
      );
    }

    if (existingTemplates.length > 0) {
      return NextResponse.json(
        { error: 'A template with this name already exists' },
        { status: 409 }
      );
    }

    // Create template
    const { data: newTemplate, error: createError } = await supabase
      .from('parsing_templates')
      .insert({
        user_id: user.id,
        org_id: user.orgId,
        name: templateData.name,
        description: templateData.description,
        carrier: templateData.carrier,
        file_format: templateData.file_format,
        field_mappings: templateData.field_mappings,
        validation_rules: templateData.validation_rules,
        transformation_rules: templateData.transformation_rules,
        is_public: templateData.is_public,
        shared_with_org: templateData.shared_with_org,
        version: 1,
      })
      .select()
      .single();

    if (createError || !newTemplate) {
      console.error('Failed to create template:', createError);
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Template created successfully',
      template: {
        id: newTemplate.id,
        name: newTemplate.name,
        description: newTemplate.description,
        carrier: newTemplate.carrier,
        file_format: newTemplate.file_format,
        version: newTemplate.version,
        is_public: newTemplate.is_public,
        shared_with_org: newTemplate.shared_with_org,
        created_at: newTemplate.created_at,
        updated_at: newTemplate.updated_at,
      },
      field_mappings: newTemplate.field_mappings,
      validation_rules: newTemplate.validation_rules,
      transformation_rules: newTemplate.transformation_rules,
    });

  } catch (error) {
    console.error('Create template error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}