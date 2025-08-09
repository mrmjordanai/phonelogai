// Activity Heatmap Analytics API Endpoint
// GET /api/analytics/heatmap - Returns activity heatmap data for visualization

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
    const daysBack = parseInt(searchParams.get('days_back') || '90', 10)

    // Validate days_back parameter
    if (isNaN(daysBack) || daysBack < 1 || daysBack > 365) {
      return NextResponse.json(
        { error: 'days_back must be a number between 1 and 365' },
        { status: 400 }
      )
    }

    // Call database function
    const { data, error } = await supabase.rpc('get_activity_heatmap', {
      target_user_id: targetUserId,
      days_back: daysBack
    })

    if (error) {
      console.error('Heatmap error:', error)
      
      if (error.message?.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch heatmap data' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        user_id: targetUserId,
        days_back: daysBack
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Heatmap API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}