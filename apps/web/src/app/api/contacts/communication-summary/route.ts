// Contact Communication Summary API Endpoint
// GET /api/contacts/communication-summary - Returns detailed communication summary for a contact

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
    const contactId = searchParams.get('contact_id')
    const daysBack = parseInt(searchParams.get('days_back') || '90', 10)

    // Validate required parameters
    if (!contactId) {
      return NextResponse.json(
        { error: 'contact_id parameter is required' },
        { status: 400 }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(contactId)) {
      return NextResponse.json(
        { error: 'Invalid contact_id format' },
        { status: 400 }
      )
    }

    // Validate days_back parameter
    if (isNaN(daysBack) || daysBack < 1 || daysBack > 365) {
      return NextResponse.json(
        { error: 'days_back must be a number between 1 and 365' },
        { status: 400 }
      )
    }

    // Call database function
    const { data, error } = await supabase.rpc('get_contact_communication_summary', {
      requesting_user_id: user.id,
      target_contact_id: contactId,
      days_back: daysBack
    })

    if (error) {
      console.error('Contact communication summary error:', error)
      
      if (error.message?.includes('Contact not found')) {
        return NextResponse.json(
          { error: 'Contact not found' },
          { status: 404 }
        )
      }
      
      if (error.message?.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch contact communication summary' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        contact_id: contactId,
        days_back: daysBack
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Contact communication summary API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}