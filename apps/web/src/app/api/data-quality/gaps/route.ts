// Data Quality Gaps API Endpoint
// GET /api/data-quality/gaps - Detects data gaps and potential missing periods

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
    const thresholdHours = parseInt(searchParams.get('threshold_hours') || '24', 10)

    // Validate threshold_hours parameter
    if (isNaN(thresholdHours) || thresholdHours < 1 || thresholdHours > 168) { // Max 1 week
      return NextResponse.json(
        { error: 'threshold_hours must be between 1 and 168 (1 week)' },
        { status: 400 }
      )
    }

    // Call database function
    const { data, error } = await supabase.rpc('detect_data_gaps', {
      target_user_id: targetUserId,
      threshold_hours: thresholdHours
    })

    if (error) {
      console.error('Data gaps detection error:', error)
      
      if (error.message?.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to detect data gaps' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        user_id: targetUserId,
        threshold_hours: thresholdHours
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Data gaps API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}