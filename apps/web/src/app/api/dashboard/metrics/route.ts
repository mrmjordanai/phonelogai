// Dashboard Metrics API Endpoint
// GET /api/dashboard/metrics - Returns comprehensive dashboard metrics for authenticated user

import { NextRequest, NextResponse } from 'next/server'
import { supabase, auth } from '@phonelogai/database'

export async function GET(request: NextRequest) {
  try {
    // Get current user from auth
    const user = await auth.getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Extract query parameters
    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('user_id') || user.id

    // Call database function to get metrics
    const { data, error } = await supabase.rpc('get_dashboard_metrics', {
      target_user_id: targetUserId
    })

    if (error) {
      console.error('Dashboard metrics error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch dashboard metrics' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Dashboard metrics API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}