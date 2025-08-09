// Team Dashboard Metrics API Endpoint
// GET /api/dashboard/team-metrics - Returns aggregated team metrics for organization leaders

import { NextRequest, NextResponse } from 'next/server'
import { supabase, auth } from '@phonelogai/database'

export async function GET(_request: NextRequest) {
  try {
    // Get current user from auth
    const user = await auth.getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Call database function to get team metrics
    const { data, error } = await supabase.rpc('get_team_dashboard_metrics', {
      requesting_user_id: user.id
    })

    if (error) {
      console.error('Team metrics error:', error)
      
      // Handle insufficient permissions gracefully
      if (error.message?.includes('Insufficient permissions')) {
        return NextResponse.json(
          { error: 'Insufficient permissions for team metrics' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch team metrics' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Team metrics API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}