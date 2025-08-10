/**
 * Privacy Rules API
 * Manages privacy rules for contacts and data access
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@phonelogai/database';
import { SecurityManager } from '@phonelogai/database';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope');
    const contactId = url.searchParams.get('contact_id');
    const isActive = url.searchParams.get('active');

    let query = supabase
      .from('enhanced_privacy_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('rule_priority', { ascending: false })
      .order('created_at', { ascending: false });

    // Apply filters
    if (scope) {
      query = query.eq('scope', scope);
    }
    if (contactId) {
      query = query.eq('contact_id', contactId);
    }
    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data: rules, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json(rules || []);
  } catch (error) {
    console.error('Privacy rules API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch privacy rules' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      ruleName,
      scope,
      contactId,
      numberPattern,
      tagFilters,
      visibility,
      anonymizeNumber,
      anonymizeContent,
      allowExport,
      allowAnalytics,
      allowMlTraining,
      dataRetentionDays,
      effectiveFrom,
      effectiveUntil
    } = body;

    // Validate required fields
    if (!ruleName || !scope || !visibility) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate scope-specific requirements
    if (scope === 'contact' && !contactId) {
      return NextResponse.json(
        { error: 'Contact ID required for contact-scope rules' },
        { status: 400 }
      );
    }

    if (scope === 'number_pattern' && !numberPattern) {
      return NextResponse.json(
        { error: 'Number pattern required for number-pattern rules' },
        { status: 400 }
      );
    }

    // Get organization ID
    const { data: orgRole } = await supabase
      .from('org_roles')
      .select('org_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const ruleData = {
      rule_name: ruleName,
      rule_priority: 100, // Default priority
      scope,
      user_id: user.id,
      organization_id: orgRole?.org_id,
      contact_id: contactId,
      number_pattern: numberPattern,
      tag_filters: tagFilters,
      visibility,
      anonymize_number: anonymizeNumber || false,
      anonymize_content: anonymizeContent || false,
      anonymization_level: 'none',
      allow_export: allowExport !== false,
      allow_analytics: allowAnalytics !== false,
      allow_ml_training: allowMlTraining || false,
      data_retention_days: dataRetentionDays,
      inherit_from_parent: true,
      override_children: false,
      effective_from: effectiveFrom ? new Date(effectiveFrom).toISOString() : new Date().toISOString(),
      effective_until: effectiveUntil ? new Date(effectiveUntil).toISOString() : null,
      is_active: true,
      auto_applied: false,
      created_by: user.id,
      metadata: {}
    };

    const { data: rule, error } = await supabase
      .from('enhanced_privacy_rules')
      .insert(ruleData)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error('Create privacy rule API error:', error);
    return NextResponse.json(
      { error: 'Failed to create privacy rule' },
      { status: 500 }
    );
  }
}
