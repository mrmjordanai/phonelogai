// Data Quality Sync Health API Endpoint
// GET /api/data-quality/sync-health - Analyzes sync health and drift across data sources

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

    // Call database function
    const { data, error } = await supabase.rpc('analyze_sync_health', {
      target_user_id: targetUserId
    })

    if (error) {
      console.error('Sync health analysis error:', error)
      
      if (error.message?.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to analyze sync health' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        user_id: targetUserId
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Sync health API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}