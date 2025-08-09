// Contact Search API Endpoint
// GET /api/search/contacts - Advanced contact search with full-text and fuzzy matching

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
    const query = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Validate required parameters
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      )
    }

    // Validate limit parameter
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'limit must be a number between 1 and 100' },
        { status: 400 }
      )
    }

    // Call database function
    const { data, error } = await supabase.rpc('search_contacts', {
      requesting_user_id: user.id,
      search_query: query.trim(),
      search_limit: limit
    })

    if (error) {
      console.error('Contact search error:', error)
      return NextResponse.json(
        { error: 'Failed to search contacts' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        query: query.trim(),
        limit,
        results_count: data?.length || 0
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Contact search API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}