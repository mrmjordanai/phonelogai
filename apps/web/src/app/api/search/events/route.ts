// Event Search and Filtering API Endpoint
// GET /api/search/events - Advanced event filtering with multiple criteria

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
    const eventTypes = searchParams.get('types')?.split(',') as ('call' | 'sms')[] | null
    const directions = searchParams.get('directions')?.split(',') as ('inbound' | 'outbound')[] | null
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const contactIds = searchParams.get('contact_ids')?.split(',')
    const sources = searchParams.get('sources')?.split(',')
    const contentSearch = searchParams.get('content')
    const minDuration = searchParams.get('min_duration') ? parseInt(searchParams.get('min_duration')!, 10) : null
    const maxDuration = searchParams.get('max_duration') ? parseInt(searchParams.get('max_duration')!, 10) : null
    const limit = parseInt(searchParams.get('limit') || '1000', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Validate parameters
    if (limit < 1 || limit > 5000) {
      return NextResponse.json(
        { error: 'limit must be between 1 and 5000' },
        { status: 400 }
      )
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: 'offset must be non-negative' },
        { status: 400 }
      )
    }

    // Validate date formats if provided
    let fromDate = null
    let toDate = null
    
    if (dateFrom) {
      fromDate = new Date(dateFrom)
      if (isNaN(fromDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date_from format. Use ISO 8601 format.' },
          { status: 400 }
        )
      }
    }

    if (dateTo) {
      toDate = new Date(dateTo)
      if (isNaN(toDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date_to format. Use ISO 8601 format.' },
          { status: 400 }
        )
      }
    }

    // Validate duration parameters
    if (minDuration !== null && (isNaN(minDuration) || minDuration < 0)) {
      return NextResponse.json(
        { error: 'min_duration must be a non-negative number' },
        { status: 400 }
      )
    }

    if (maxDuration !== null && (isNaN(maxDuration) || maxDuration < 0)) {
      return NextResponse.json(
        { error: 'max_duration must be a non-negative number' },
        { status: 400 }
      )
    }

    // Call database function
    const { data, error } = await supabase.rpc('filter_events', {
      requesting_user_id: user.id,
      target_user_id: targetUserId,
      event_types: eventTypes,
      directions: directions,
      date_from: fromDate?.toISOString() || null,
      date_to: toDate?.toISOString() || null,
      contact_ids: contactIds,
      sources: sources,
      content_search: contentSearch,
      min_duration: minDuration,
      max_duration: maxDuration,
      event_limit: limit,
      event_offset: offset
    })

    if (error) {
      console.error('Event filtering error:', error)
      
      if (error.message?.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to filter events' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        user_id: targetUserId,
        filters: {
          types: eventTypes,
          directions: directions,
          date_from: dateFrom,
          date_to: dateTo,
          contact_ids: contactIds,
          sources: sources,
          content_search: contentSearch,
          min_duration: minDuration,
          max_duration: maxDuration
        },
        pagination: {
          limit,
          offset,
          results_count: data?.length || 0
        }
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Event filtering API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}