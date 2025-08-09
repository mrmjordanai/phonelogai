// Natural Language Query API Endpoint
// POST /api/nlq/query - Processes natural language queries and returns SQL results
// Supports both streaming and regular responses, with OpenRouter integration

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(request: NextRequest) {
  try {
    // Get auth token from headers
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    // Get current user
    let userId: string | null = null
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    // Parse request body
    const body = await request.json()
    const { query, max_rows = 1000, stream = false } = body

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

    // Check if we're in demo mode (no userId means demo)
    const isDemoMode = !userId
    const effectiveUserId = userId || 'demo-user'

    // Step 1: Generate SQL from natural language
    let generatedSQL: string | null = null
    let explanation = ''
    
    // Check if OpenRouter is configured
    const openRouterKey = process.env.OPENROUTER_API_KEY
    
    if (openRouterKey && !isDemoMode) {
      // Use OpenRouter to generate SQL
      try {
        const aiResponse = await generateSQLWithOpenRouter(query, effectiveUserId, openRouterKey)
        generatedSQL = aiResponse.sql
        explanation = aiResponse.explanation
      } catch (error) {
        console.error('OpenRouter SQL generation failed, falling back to pattern matching:', error)
        generatedSQL = generateSQLFromQuery(query, effectiveUserId)
        explanation = 'Generated using pattern matching (OpenRouter unavailable)'
      }
    } else {
      // Use pattern matching as fallback
      generatedSQL = generateSQLFromQuery(query, effectiveUserId)
      explanation = isDemoMode 
        ? 'Demo mode: Using pattern matching for SQL generation' 
        : 'Using pattern matching (OpenRouter not configured)'
    }

    if (!generatedSQL) {
      return NextResponse.json({
        success: false,
        error: 'Could not understand the query. Please try rephrasing.',
        suggestions: [
          'How many calls did I make today?',
          'Show me my recent messages',
          'Who did I talk to most this week?',
          'What is my average call duration?'
        ]
      })
    }

    // Step 2: Execute the generated SQL
    const startTime = Date.now()
    let results: any[] = []
    let executionError: any = null

    try {
      // For demo mode, use mock data
      if (isDemoMode) {
        results = generateMockResults(generatedSQL)
      } else {
        // Execute the SQL query safely
        const { data, error } = await supabase.rpc('execute_safe_query', {
          query_sql: generatedSQL,
          query_params: {},
          max_rows
        }).catch(() => {
          // If RPC doesn't exist, try direct query (less safe)
          return supabase.from('events').select('*').limit(max_rows)
        })
        
        if (error) {
          executionError = error
        } else {
          results = data || []
        }
      }
    } catch (error) {
      executionError = error
      console.error('Query execution error:', error)
    }

    const executionTime = Date.now() - startTime

    if (executionError) {
      return NextResponse.json(
        { 
          error: 'Failed to execute query',
          details: executionError.message,
          sql_generated: generatedSQL
        },
        { status: 500 }
      )
    }

    // Store query history if user is authenticated
    if (userId && !isDemoMode) {
      try {
        await supabase.from('nlq_queries').insert({
          user_id: userId,
          query: query.trim(),
          sql_generated: generatedSQL,
          results: results.slice(0, 100), // Store only first 100 results
          execution_time_ms: executionTime
        })
      } catch (error) {
        console.error('Failed to store query history:', error)
      }
    }

    // Generate response
    const responseData = {
      success: true,
      query: query.trim(),
      sql_generated: generatedSQL,
      explanation,
      results,
      execution_time_ms: executionTime,
      row_count: results.length,
      timestamp: new Date().toISOString()
    }

    // Handle streaming response if requested
    if (stream) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          // Send initial explanation
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: explanation })}\n\n`))
          
          // Send SQL query
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sqlQuery: generatedSQL })}\n\n`))
          
          // Send results
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ results, execution_time_ms: executionTime })}\n\n`))
          
          // Close stream
          controller.close()
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    return NextResponse.json(responseData)

  } catch (error) {
    console.error('NLQ API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Enhanced pattern matching function to generate SQL from natural language
function generateSQLFromQuery(query: string, userId: string): string | null {
  const lowerQuery = query.toLowerCase()
  
  // Escape userId to prevent SQL injection
  const safeUserId = userId.replace(/'/g, "''")
  
  // Pattern: "how many calls/sms did I make/receive"
  if (lowerQuery.includes('how many') && (lowerQuery.includes('call') || lowerQuery.includes('sms'))) {
    const type = lowerQuery.includes('call') ? 'call' : 'sms'
    let direction = ''
    if (lowerQuery.includes('made') || lowerQuery.includes('sent') || lowerQuery.includes('outbound')) {
      direction = " AND direction = 'outbound'"
    } else if (lowerQuery.includes('received') || lowerQuery.includes('inbound')) {
      direction = " AND direction = 'inbound'"
    }
    return `SELECT COUNT(*) as total_${type}s FROM events WHERE user_id = '${safeUserId}' AND type = '${type}'${direction}`
  }
  
  // Pattern: "show me my recent calls/messages"
  if ((lowerQuery.includes('recent') || lowerQuery.includes('latest') || lowerQuery.includes('last')) && 
      (lowerQuery.includes('call') || lowerQuery.includes('message') || lowerQuery.includes('sms'))) {
    const eventType = lowerQuery.includes('call') ? 'call' : 'sms'
    const limit = extractNumber(lowerQuery) || 10
    return `SELECT ts, number, direction, CASE WHEN type = 'call' THEN duration ELSE NULL END as duration_seconds FROM events WHERE user_id = '${safeUserId}' AND type = '${eventType}' ORDER BY ts DESC LIMIT ${limit}`
  }
  
  // Pattern: "who did I talk to most" or "top contacts"
  if ((lowerQuery.includes('who') && lowerQuery.includes('most')) || 
      lowerQuery.includes('top contact') || lowerQuery.includes('frequent')) {
    return `SELECT COALESCE(c.name, e.number) as contact, e.number, COUNT(*) as interaction_count, COUNT(*) FILTER (WHERE e.type = 'call') as calls, COUNT(*) FILTER (WHERE e.type = 'sms') as messages FROM events e LEFT JOIN contacts c ON e.contact_id = c.id WHERE e.user_id = '${safeUserId}' GROUP BY e.number, c.name ORDER BY interaction_count DESC LIMIT 10`
  }
  
  // Pattern: "average call duration" or "how long"
  if ((lowerQuery.includes('average') || lowerQuery.includes('avg')) && 
      (lowerQuery.includes('duration') || lowerQuery.includes('long'))) {
    return `SELECT ROUND(AVG(duration)/60.0, 2) as avg_duration_minutes, ROUND(MAX(duration)/60.0, 2) as max_duration_minutes, ROUND(MIN(duration)/60.0, 2) as min_duration_minutes, COUNT(*) as total_calls FROM events WHERE user_id = '${safeUserId}' AND type = 'call' AND duration IS NOT NULL AND duration > 0`
  }
  
  // Pattern: "activity today/yesterday/this week/this month"
  if (lowerQuery.includes('today') || lowerQuery.includes('yesterday') || 
      lowerQuery.includes('week') || lowerQuery.includes('month')) {
    let dateFilter = ''
    if (lowerQuery.includes('today')) {
      dateFilter = "DATE(ts) = CURRENT_DATE"
    } else if (lowerQuery.includes('yesterday')) {
      dateFilter = "DATE(ts) = CURRENT_DATE - INTERVAL '1 day'"
    } else if (lowerQuery.includes('week')) {
      dateFilter = "ts >= CURRENT_DATE - INTERVAL '7 days'"
    } else if (lowerQuery.includes('month')) {
      dateFilter = "ts >= CURRENT_DATE - INTERVAL '30 days'"
    }
    
    return `SELECT COUNT(*) as total_events, COUNT(*) FILTER (WHERE type = 'call') as calls, COUNT(*) FILTER (WHERE type = 'sms') as messages, COUNT(DISTINCT number) as unique_contacts FROM events WHERE user_id = '${safeUserId}' AND ${dateFilter}`
  }
  
  // Pattern: "busiest hour/day" or "peak time"
  if (lowerQuery.includes('busiest') || lowerQuery.includes('peak')) {
    if (lowerQuery.includes('hour')) {
      return `SELECT EXTRACT(hour FROM ts) as hour, COUNT(*) as activity_count, COUNT(*) FILTER (WHERE type = 'call') as calls, COUNT(*) FILTER (WHERE type = 'sms') as messages FROM events WHERE user_id = '${safeUserId}' GROUP BY hour ORDER BY activity_count DESC LIMIT 5`
    } else if (lowerQuery.includes('day')) {
      return `SELECT TO_CHAR(ts, 'Day') as day_of_week, COUNT(*) as activity_count FROM events WHERE user_id = '${safeUserId}' GROUP BY day_of_week, EXTRACT(dow FROM ts) ORDER BY EXTRACT(dow FROM ts)`
    }
  }
  
  // Pattern: "longest calls" or "shortest calls"
  if (lowerQuery.includes('longest') && lowerQuery.includes('call')) {
    return `SELECT ts, number, direction, ROUND(duration/60.0, 2) as duration_minutes FROM events WHERE user_id = '${safeUserId}' AND type = 'call' AND duration IS NOT NULL ORDER BY duration DESC LIMIT 10`
  }
  
  if (lowerQuery.includes('shortest') && lowerQuery.includes('call')) {
    return `SELECT ts, number, direction, ROUND(duration/60.0, 2) as duration_minutes FROM events WHERE user_id = '${safeUserId}' AND type = 'call' AND duration IS NOT NULL AND duration > 0 ORDER BY duration ASC LIMIT 10`
  }
  
  // Pattern: search for specific number or contact
  const phoneMatch = lowerQuery.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/)
  if (phoneMatch) {
    const phoneNumber = phoneMatch[0].replace(/\D/g, '')
    return `SELECT ts, type, direction, CASE WHEN type = 'call' THEN duration ELSE NULL END as duration_seconds FROM events WHERE user_id = '${safeUserId}' AND number LIKE '%${phoneNumber}%' ORDER BY ts DESC LIMIT 20`
  }
  
  return null
}

// Helper function to extract numbers from text
function extractNumber(text: string): number | null {
  const match = text.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

// Generate mock results for demo mode
function generateMockResults(sql: string): any[] {
  const lowerSql = sql.toLowerCase()
  
  if (lowerSql.includes('count(*)')) {
    // Return count results
    if (lowerSql.includes('call')) {
      return [{ total_calls: 142 }]
    } else if (lowerSql.includes('sms')) {
      return [{ total_sms: 89 }]
    } else {
      return [{ total_events: 231, calls: 142, messages: 89, unique_contacts: 27 }]
    }
  }
  
  if (lowerSql.includes('avg(duration)')) {
    return [{
      avg_duration_minutes: 4.7,
      max_duration_minutes: 45.2,
      min_duration_minutes: 0.1,
      total_calls: 142
    }]
  }
  
  if (lowerSql.includes('extract(hour')) {
    return [
      { hour: 9, activity_count: 45, calls: 28, messages: 17 },
      { hour: 14, activity_count: 42, calls: 25, messages: 17 },
      { hour: 16, activity_count: 38, calls: 20, messages: 18 },
      { hour: 11, activity_count: 35, calls: 22, messages: 13 },
      { hour: 18, activity_count: 32, calls: 18, messages: 14 }
    ]
  }
  
  if (lowerSql.includes('order by ts desc')) {
    return [
      { ts: new Date().toISOString(), number: '+1234567890', direction: 'outbound', duration_seconds: 245 },
      { ts: new Date(Date.now() - 3600000).toISOString(), number: '+0987654321', direction: 'inbound', duration_seconds: 120 },
      { ts: new Date(Date.now() - 7200000).toISOString(), number: '+1112223333', direction: 'outbound', duration_seconds: 450 }
    ]
  }
  
  // Default mock data
  return [
    { id: 1, value: 'Sample result 1' },
    { id: 2, value: 'Sample result 2' },
    { id: 3, value: 'Sample result 3' }
  ]
}

// Generate SQL using OpenRouter (when configured)
async function generateSQLWithOpenRouter(
  query: string, 
  userId: string,
  apiKey: string
): Promise<{ sql: string; explanation: string }> {
  const systemPrompt = `You are a SQL expert helping users query their phone call and SMS data.
The database has these main tables:
- events: Contains call and SMS records (id, user_id, ts, number, direction, type, duration, content)
- contacts: Contains contact information (id, user_id, number, name, company)
- privacy_rules: Contains privacy settings

Generate safe, efficient SQL queries. Always:
1. Filter by user_id = '${userId}'
2. Use proper joins when needed
3. Limit results appropriately (default 10-20 rows)
4. Return user-friendly column names
5. NEVER modify or delete data

Respond with JSON: { "sql": "the SQL query", "explanation": "brief explanation" }`

  try {
    const baseUrl = process.env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1'
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
    const referer = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': 'PhoneLog AI'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content
    
    if (!content) {
      throw new Error('No response from OpenRouter')
    }

    try {
      const parsed = JSON.parse(content)
      return {
        sql: parsed.sql || generateSQLFromQuery(query, userId) || '',
        explanation: parsed.explanation || 'Query generated successfully'
      }
    } catch {
      // If JSON parsing fails, use pattern matching as fallback
      return {
        sql: generateSQLFromQuery(query, userId) || '',
        explanation: 'Generated using pattern matching (OpenRouter response parsing failed)'
      }
    }
  } catch (error) {
    console.error('OpenRouter API error:', error)
    throw error
  }
}