// NLQ Query Suggestions API Endpoint
// GET /api/nlq/suggestions - Returns query suggestions based on user history and patterns

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
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    // Validate limit parameter
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return NextResponse.json(
        { error: 'limit must be between 1 and 50' },
        { status: 400 }
      )
    }

    // Get suggestions from database function
    const { data: suggestions, error } = await supabase.rpc('get_nlq_query_suggestions', {
      requesting_user_id: user.id,
      limit_count: limit
    })

    if (error) {
      console.error('NLQ suggestions error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch suggestions' },
        { status: 500 }
      )
    }

    // Add some default suggestions if user has no history
    const defaultSuggestions = [
      {
        type: 'example',
        text: 'How many calls did I make today?',
        category: 'Activity Summary'
      },
      {
        type: 'example',
        text: 'Show me my recent messages',
        category: 'Recent Activity'
      },
      {
        type: 'example',
        text: 'Who did I talk to most this week?',
        category: 'Top Contacts'
      },
      {
        type: 'example',
        text: 'What is my average call duration?',
        category: 'Call Analytics'
      },
      {
        type: 'example',
        text: 'When am I most active?',
        category: 'Activity Patterns'
      }
    ]

    // Combine user suggestions with defaults
    const userSuggestions = suggestions?.suggestions || []
    const combinedSuggestions = [
      ...userSuggestions,
      ...defaultSuggestions.slice(0, Math.max(0, limit - userSuggestions.length))
    ].slice(0, limit)

    return NextResponse.json({
      success: true,
      data: {
        suggestions: combinedSuggestions,
        user_history_count: userSuggestions.length,
        total_suggestions: combinedSuggestions.length
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('NLQ suggestions API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}