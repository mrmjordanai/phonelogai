// NLQ Query Suggestions API Endpoint
// GET /api/nlq/suggestions - Returns contextual query suggestions

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface Suggestion {
  text: string
  category: string
  complexity: 'simple' | 'moderate' | 'complex'
  type?: 'example' | 'personalized' | 'trending'
}

export async function GET(request: NextRequest) {
  try {
    // Get auth token from headers
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
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
    
    let userId: string | null = null
    let personalized = false
    
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
      personalized = !!userId
    }

    // Base suggestions available to everyone
    const baseSuggestions: Suggestion[] = [
      {
        text: 'How many calls did I make today?',
        category: 'Activity Summary',
        complexity: 'simple',
        type: 'example'
      },
      {
        text: 'Show me my recent messages',
        category: 'Recent Activity',
        complexity: 'simple',
        type: 'example'
      },
      {
        text: 'Who did I talk to most this week?',
        category: 'Top Contacts',
        complexity: 'moderate',
        type: 'example'
      },
      {
        text: 'What is my average call duration?',
        category: 'Call Analytics',
        complexity: 'simple',
        type: 'example'
      },
      {
        text: 'Show me all calls longer than 10 minutes',
        category: 'Filtering',
        complexity: 'moderate',
        type: 'example'
      },
      {
        text: 'What are my busiest hours for phone activity?',
        category: 'Activity Patterns',
        complexity: 'moderate',
        type: 'example'
      },
      {
        text: 'How many unique contacts did I interact with this month?',
        category: 'Contact Analytics',
        complexity: 'moderate',
        type: 'example'
      },
      {
        text: 'Show me my communication pattern by day of week',
        category: 'Activity Patterns',
        complexity: 'complex',
        type: 'example'
      },
      {
        text: 'List my top 5 most called numbers',
        category: 'Top Contacts',
        complexity: 'simple',
        type: 'example'
      },
      {
        text: 'Show me calls I missed yesterday',
        category: 'Missed Activity',
        complexity: 'simple',
        type: 'example'
      },
      {
        text: 'What percentage of my calls are outbound?',
        category: 'Call Analytics',
        complexity: 'moderate',
        type: 'example'
      },
      {
        text: 'Find my longest call this month',
        category: 'Call Analytics',
        complexity: 'simple',
        type: 'example'
      }
    ]

    // If user is authenticated, try to add personalized suggestions
    let personalizedSuggestions: Suggestion[] = []
    
    if (userId && personalized) {
      try {
        // Get user's recent query history for better suggestions
        const { data: recentQueries } = await supabase
          .from('nlq_queries')
          .select('query')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5)

        // Get basic stats about user's data to customize suggestions
        const { data: eventStats } = await supabase
          .from('events')
          .select('type, direction')
          .eq('user_id', userId)
          .limit(100)

        if (eventStats && eventStats.length > 0) {
          // Analyze user's data patterns
          const hasCallData = eventStats.some(e => e.type === 'call')
          const hasSmsData = eventStats.some(e => e.type === 'sms')
          const hasInbound = eventStats.some(e => e.direction === 'inbound')
          const hasOutbound = eventStats.some(e => e.direction === 'outbound')
          
          // Add personalized suggestions based on data patterns
          if (hasCallData && hasSmsData) {
            personalizedSuggestions.push({
              text: 'Compare my call activity to SMS activity this week',
              category: 'Comparison',
              complexity: 'complex',
              type: 'personalized'
            })
          }
          
          if (hasInbound && hasOutbound) {
            personalizedSuggestions.push({
              text: 'What\'s my ratio of incoming to outgoing calls?',
              category: 'Call Analytics',
              complexity: 'moderate',
              type: 'personalized'
            })
          }
          
          // User has data, add more specific suggestions
          personalizedSuggestions.push(
            {
              text: 'Show me contacts I haven\'t talked to in over 30 days',
              category: 'Contact Analytics',
              complexity: 'complex',
              type: 'personalized'
            },
            {
              text: 'Find patterns in my weekend vs weekday communication',
              category: 'Activity Patterns',
              complexity: 'complex',
              type: 'personalized'
            }
          )
        }

        // Add trending suggestions based on recent queries
        if (recentQueries && recentQueries.length > 0) {
          const queryTexts = recentQueries.map(q => q.query.toLowerCase())
          
          // Check what types of queries user has been making
          const hasTimeQueries = queryTexts.some(q => 
            q.includes('today') || q.includes('yesterday') || q.includes('week') || q.includes('month')
          )
          const hasContactQueries = queryTexts.some(q => 
            q.includes('who') || q.includes('contact') || q.includes('number')
          )
          const hasDurationQueries = queryTexts.some(q => 
            q.includes('duration') || q.includes('long') || q.includes('minutes')
          )
          
          // Suggest complementary queries
          if (hasTimeQueries && !hasContactQueries) {
            personalizedSuggestions.push({
              text: 'Who were my most frequent contacts last month?',
              category: 'Top Contacts',
              complexity: 'moderate',
              type: 'trending'
            })
          }
          
          if (hasContactQueries && !hasDurationQueries) {
            personalizedSuggestions.push({
              text: 'What\'s the average duration of calls with my top contacts?',
              category: 'Call Analytics',
              complexity: 'complex',
              type: 'trending'
            })
          }
          
          if (!hasTimeQueries) {
            personalizedSuggestions.push({
              text: 'Show me my communication trends over the past 7 days',
              category: 'Activity Patterns',
              complexity: 'moderate',
              type: 'trending'
            })
          }
        }
      } catch (error) {
        console.error('Failed to get personalized suggestions:', error)
        // Continue with base suggestions if personalization fails
      }
    }

    // Combine and deduplicate suggestions
    const allSuggestions = [...personalizedSuggestions, ...baseSuggestions]
      .filter((suggestion, index, self) => 
        index === self.findIndex(s => s.text === suggestion.text)
      )
      .slice(0, limit)
    
    // Group suggestions by category for better UX
    const groupedSuggestions = allSuggestions.reduce((acc, suggestion) => {
      if (!acc[suggestion.category]) {
        acc[suggestion.category] = []
      }
      acc[suggestion.category].push(suggestion)
      return acc
    }, {} as Record<string, Suggestion[]>)

    return NextResponse.json({
      success: true,
      data: {
        suggestions: allSuggestions,
        grouped_suggestions: groupedSuggestions,
        personalized,
        user_history_count: personalizedSuggestions.filter(s => s.type === 'personalized').length,
        total_suggestions: allSuggestions.length,
        categories: Object.keys(groupedSuggestions)
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('NLQ suggestions API error:', error)
    
    // Return basic suggestions on error
    const fallbackSuggestions = [
      {
        text: 'How many calls did I make today?',
        category: 'Activity Summary',
        complexity: 'simple' as const,
        type: 'example' as const
      },
      {
        text: 'Show me my recent messages',
        category: 'Recent Activity',
        complexity: 'simple' as const,
        type: 'example' as const
      },
      {
        text: 'Who did I talk to most this week?',
        category: 'Top Contacts',
        complexity: 'moderate' as const,
        type: 'example' as const
      },
      {
        text: 'What is my average call duration?',
        category: 'Call Analytics',
        complexity: 'simple' as const,
        type: 'example' as const
      },
      {
        text: 'When am I most active?',
        category: 'Activity Patterns',
        complexity: 'moderate' as const,
        type: 'example' as const
      }
    ]
    
    return NextResponse.json({
      success: false,
      data: {
        suggestions: fallbackSuggestions,
        grouped_suggestions: {},
        personalized: false,
        user_history_count: 0,
        total_suggestions: fallbackSuggestions.length,
        categories: ['Activity Summary', 'Recent Activity', 'Top Contacts', 'Call Analytics', 'Activity Patterns']
      },
      error: 'Failed to load personalized suggestions',
      timestamp: new Date().toISOString()
    })
  }
}