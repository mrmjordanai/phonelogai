// Contact Intelligence API Endpoint
// GET /api/contacts/intelligence - Returns detailed contact intelligence profile

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

    // Call database function
    const { data, error } = await supabase.rpc('get_contact_intelligence', {
      requesting_user_id: user.id,
      target_contact_id: contactId
    })

    if (error) {
      console.error('Contact intelligence error:', error)
      
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
        { error: 'Failed to fetch contact intelligence' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      parameters: {
        contact_id: contactId
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Contact intelligence API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}