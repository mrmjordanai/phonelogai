/**
 * Privacy Statistics API
 * Returns privacy-related statistics and metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@phonelogai/database';

interface PrivacyStats {
  totalRules: number;
  privateContacts: number;
  anonymizedContacts: number;
  teamVisibleContacts: number;
  publicContacts: number;
  recentChanges: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get total privacy rules for user
    const { count: totalRules } = await supabase
      .from('enhanced_privacy_rules')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Get contacts by privacy level
    const { data: privacyRules } = await supabase
      .from('enhanced_privacy_rules')
      .select('visibility, contact_id, anonymize_number, anonymize_content')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('scope', 'contact');

    // Count contacts by visibility level
    let privateContacts = 0;
    let teamVisibleContacts = 0;
    let publicContacts = 0;
    let anonymizedContacts = 0;

    if (privacyRules) {
      privacyRules.forEach(rule => {
        switch (rule.visibility) {
          case 'private':
            privateContacts++;
            break;
          case 'team':
            teamVisibleContacts++;
            break;
          case 'public':
            publicContacts++;
            break;
        }
        
        if (rule.anonymize_number || rule.anonymize_content) {
          anonymizedContacts++;
        }
      });
    }

    // Get recent changes (last 7 days)
    const { count: recentChanges } = await supabase
      .from('enhanced_privacy_rules')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Get total contacts without privacy rules (default to team visible)
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Add contacts without specific rules to team visible count
    const contactsWithRules = new Set(privacyRules?.map(r => r.contact_id) || []);
    const contactsWithoutRules = (totalContacts || 0) - contactsWithRules.size;
    teamVisibleContacts += contactsWithoutRules;

    const stats: PrivacyStats = {
      totalRules: totalRules || 0,
      privateContacts,
      anonymizedContacts,
      teamVisibleContacts,
      publicContacts,
      recentChanges: recentChanges || 0
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Privacy stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch privacy statistics' },
      { status: 500 }
    );
  }
}
