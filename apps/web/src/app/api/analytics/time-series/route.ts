// Time-Series Analytics API Endpoint
// GET /api/analytics/time-series - Returns time-series data for dashboard charts

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

    // Extract and validate query parameters
    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('user_id') || user.id
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const granularity = searchParams.get('granularity') || 'daily'

    // Validate required parameters
    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'date_from and date_to parameters are required' },
        { status: 400 }
      )
    }

    // Validate granularity
    const validGranularities = ['hourly', 'daily', 'weekly']
    if (!validGranularities.includes(granularity)) {
      return NextResponse.json(
        { error: 'granularity must be one of: hourly, daily, weekly' },
        { status: 400 }
      )
    }

    // Parse dates
    const fromDate = new Date(dateFrom)
    const toDate = new Date(dateTo)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use ISO 8601 format.' },
        { status: 400 }
      )
    }

    // Call database function
    const { data, error } = await supabase.rpc('get_time_series_data', {
      target_user_id: targetUserId,
      date_from: fromDate.toISOString(),
      date_to: toDate.toISOString(),
      granularity
    })

    if (error) {
      console.error('Time-series error:', error)
      
      if (error.message?.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch time-series data' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        user_id: targetUserId,
        date_from: dateFrom,
        date_to: dateTo,
        granularity
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Time-series API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}