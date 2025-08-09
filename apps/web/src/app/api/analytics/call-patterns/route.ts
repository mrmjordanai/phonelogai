// Call Patterns Analytics API Endpoint
// GET /api/analytics/call-patterns - Returns detailed call pattern analysis

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
    const analysisDays = parseInt(searchParams.get('analysis_days') || '30', 10)

    // Validate analysis_days parameter
    if (isNaN(analysisDays) || analysisDays < 1 || analysisDays > 365) {
      return NextResponse.json(
        { error: 'analysis_days must be a number between 1 and 365' },
        { status: 400 }
      )
    }

    // Call database function
    const { data, error } = await supabase.rpc('analyze_call_patterns', {
      target_user_id: targetUserId,
      analysis_days: analysisDays
    })

    if (error) {
      console.error('Call patterns error:', error)
      
      if (error.message?.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to analyze call patterns' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        user_id: targetUserId,
        analysis_days: analysisDays
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Call patterns API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}