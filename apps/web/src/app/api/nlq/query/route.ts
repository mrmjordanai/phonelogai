// Natural Language Query API Endpoint
// POST /api/nlq/query - Processes natural language queries and returns SQL results

import { NextRequest, NextResponse } from 'next/server'
import { supabase, auth } from '@phonelogai/database'

export async function POST(request: NextRequest) {
  try {
    // Get current user from auth
    const user = await auth.getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { query, max_rows = 1000 } = body

    // Validate required parameters
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query text is required' },
        { status: 400 }
      )
    }

    // Validate max_rows parameter
    if (typeof max_rows !== 'number' || max_rows < 1 || max_rows > 5000) {
      return NextResponse.json(
        { error: 'max_rows must be between 1 and 5000' },
        { status: 400 }
      )
    }

    // Step 1: Generate embedding for the query (placeholder - would integrate with OpenAI)
    // For now, we'll simulate this step and focus on the SQL execution
    
    // Step 2: Find similar queries
    // This would use the embedding in a real implementation
    const { data: similarQueries } = await supabase.rpc('find_similar_nlq_queries', {
      requesting_user_id: user.id,
      query_embedding: '[' + Array(1536).fill(0).join(',') + ']', // Placeholder embedding
      similarity_threshold: 0.8,
      max_results: 3
    })

    // Step 3: Find matching templates
    const { data: templates } = await supabase.rpc('find_nlq_templates', {
      query_embedding: '[' + Array(1536).fill(0).join(',') + ']', // Placeholder embedding
      similarity_threshold: 0.7,
      max_results: 3
    })

    // Step 4: For this implementation, we'll use a simple pattern matching approach
    // In a full implementation, this would use AI to generate SQL
    const generatedSQL = generateSQLFromQuery(query, user.id)

    if (!generatedSQL) {
      return NextResponse.json({
        success: false,
        error: 'Could not understand the query. Please try rephrasing.',
        suggestions: templates?.map(t => t.pattern_description) || [],
        similar_queries: similarQueries?.map(q => q.query_text) || []
      })
    }

    // Step 5: Execute the generated SQL
    const { data: results, error: executionError } = await supabase.rpc('execute_nlq_query', {
      requesting_user_id: user.id,
      sql_query: generatedSQL,
      max_rows
    })

    if (executionError) {
      console.error('NLQ execution error:', executionError)
      return NextResponse.json(
        { error: 'Failed to execute query' },
        { status: 500 }
      )
    }

    // Step 6: Store the query for future similarity matching (with placeholder embedding)
    const { data: storedQueryId } = await supabase.rpc('store_nlq_query_embedding', {
      p_user_id: user.id,
      p_query_text: query.trim(),
      p_embedding: '[' + Array(1536).fill(0).join(',') + ']', // Placeholder embedding
      p_sql_query: generatedSQL,
      p_result_schema: results?.data ? JSON.stringify(Object.keys(results.data[0] || {})) : null,
      p_execution_time_ms: results?.execution_time_ms
    })

    // Store in nlq_queries table for history
    await supabase.from('nlq_queries').insert({
      user_id: user.id,
      query: query.trim(),
      sql_generated: generatedSQL,
      results: results?.data,
      execution_time_ms: results?.execution_time_ms
    })

    return NextResponse.json({
      success: true,
      data: {
        query: query.trim(),
        sql_generated: generatedSQL,
        results: results?.data || [],
        execution_time_ms: results?.execution_time_ms,
        row_count: results?.row_count || 0,
        stored_query_id: storedQueryId
      },
      similar_queries: similarQueries || [],
      templates: templates || [],
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('NLQ API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Simple pattern matching function to generate SQL from natural language
// In a production system, this would be replaced with AI-powered SQL generation
function generateSQLFromQuery(query: string, userId: string): string | null {
  const lowerQuery = query.toLowerCase()
  
  // Pattern: "how many calls/sms did I make/receive"
  if (lowerQuery.includes('how many') && (lowerQuery.includes('call') || lowerQuery.includes('sms'))) {
    if (lowerQuery.includes('call')) {
      return `SELECT COUNT(*) as total_calls FROM events WHERE user_id = '${userId}' AND type = 'call'`
    }
    if (lowerQuery.includes('sms')) {
      return `SELECT COUNT(*) as total_sms FROM events WHERE user_id = '${userId}' AND type = 'sms'`
    }
  }
  
  // Pattern: "show me my recent calls/messages"
  if ((lowerQuery.includes('recent') || lowerQuery.includes('latest')) && 
      (lowerQuery.includes('call') || lowerQuery.includes('message') || lowerQuery.includes('sms'))) {
    const eventType = lowerQuery.includes('call') ? 'call' : 'sms'
    return `SELECT ts, number, direction, CASE WHEN duration IS NOT NULL THEN duration ELSE NULL END as duration FROM events WHERE user_id = '${userId}' AND type = '${eventType}' ORDER BY ts DESC LIMIT 10`
  }
  
  // Pattern: "who did I talk to most" or "top contacts"
  if ((lowerQuery.includes('who') && lowerQuery.includes('most')) || 
      lowerQuery.includes('top contact')) {
    return `SELECT c.name, c.number, COUNT(e.*) as interaction_count FROM events e LEFT JOIN contacts c ON e.contact_id = c.id WHERE e.user_id = '${userId}' AND c.name IS NOT NULL GROUP BY c.id, c.name, c.number ORDER BY interaction_count DESC LIMIT 10`
  }
  
  // Pattern: "average call duration" or "how long"
  if (lowerQuery.includes('average') && lowerQuery.includes('duration')) {
    return `SELECT ROUND(AVG(duration)/60.0, 2) as avg_duration_minutes, COUNT(*) as total_calls FROM events WHERE user_id = '${userId}' AND type = 'call' AND duration IS NOT NULL`
  }
  
  // Pattern: "activity today" or "today's calls"
  if (lowerQuery.includes('today')) {
    return `SELECT COUNT(*) as total_events, COUNT(*) FILTER (WHERE type = 'call') as calls, COUNT(*) FILTER (WHERE type = 'sms') as sms FROM events WHERE user_id = '${userId}' AND DATE(ts) = CURRENT_DATE`
  }
  
  // Pattern: "busiest hour" or "peak time"
  if (lowerQuery.includes('busiest') || lowerQuery.includes('peak')) {
    return `SELECT EXTRACT(hour FROM ts) as hour, COUNT(*) as activity_count FROM events WHERE user_id = '${userId}' GROUP BY EXTRACT(hour FROM ts) ORDER BY activity_count DESC LIMIT 5`
  }
  
  return null
}