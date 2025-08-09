// Supabase Client Configuration for Call/SMS Intelligence Platform
// Provides both RLS-enabled and admin clients for different use cases

import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Re-export createClient for other packages that need it
export { createClient }

// Environment variable validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
}

if (!supabaseAnonKey) {
  throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// RLS-enabled client for application use
// This client respects Row-Level Security policies
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Auto-refresh tokens
    autoRefreshToken: true,
    // Persist auth state
    persistSession: true,
    // Detect auth state changes
    detectSessionInUrl: true,
  },
  db: {
    // Use RLS policies (default behavior)
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'phonelogai-app'
    }
  }
})

// Admin client that bypasses RLS for system operations
// Only use this for administrative functions that need to bypass security
export const supabaseAdmin = (() => {
  if (!supabaseServiceRoleKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY not provided. Admin client will be limited.')
    // Return regular client as fallback
    return supabase
  }

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'X-Client-Info': 'phonelogai-admin'
      }
    }
  })
})()

// Client configuration helpers
export const clientConfig = {
  // Check if admin client is available
  hasAdminAccess: !!supabaseServiceRoleKey,
  
  // Get appropriate client based on needs
  getClient: (requireAdmin = false) => {
    if (requireAdmin && !supabaseServiceRoleKey) {
      throw new Error('Admin operations require SUPABASE_SERVICE_ROLE_KEY')
    }
    return requireAdmin ? supabaseAdmin : supabase
  },
  
  // Environment info
  environment: {
    url: supabaseUrl,
    hasServiceRole: !!supabaseServiceRoleKey,
    isProduction: process.env.NODE_ENV === 'production',
  }
}

// Connection health check
export const checkConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('count', { count: 'exact', head: true })
      .limit(1)
    
    if (error) {
      console.error('Database connection error:', error)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Database connection failed:', error)
    return false
  }
}

// Auth helpers
export const auth = {
  // Get current user
  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      console.error('Error getting current user:', error)
      return null
    }
    return user
  },
  
  // Get current session
  getCurrentSession: async () => {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) {
      console.error('Error getting current session:', error)
      return null
    }
    return session
  },
  
  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
      return false
    }
    return true
  },
  
  // Listen to auth changes
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Database utility functions
export const db = {
  // Execute a database function with proper error handling
  rpc: async <T>(
    functionName: string, 
    params?: Record<string, any>,
    options?: { requireAdmin?: boolean }
  ): Promise<{ data: T | null; error: any }> => {
    try {
      const client = options?.requireAdmin ? supabaseAdmin : supabase
      const { data, error } = await client.rpc(functionName, params)
      
      if (error) {
        console.error(`RPC ${functionName} error:`, error)
        return { data: null, error }
      }
      
      return { data, error: null }
    } catch (error) {
      console.error(`RPC ${functionName} exception:`, error)
      return { data: null, error }
    }
  },
  
  // Health check for database functions
  checkFunctions: async () => {
    const checks = [
      'get_dashboard_metrics',
      'detect_data_gaps', 
      'get_filtered_events',
      'get_heatmap_data',
      'get_heatmap_summary'
    ]
    
    const results = await Promise.all(
      checks.map(async (funcName) => {
        try {
          // Test with dummy parameters
          const { error } = await supabase.rpc(funcName as any, {
            target_user_id: '00000000-0000-0000-0000-000000000000'
          })
          
          // Function exists if we get a specific error (not "function does not exist")
          return {
            function: funcName,
            available: !error?.message?.includes('function') || 
                      error?.message?.includes('Access denied'),
            error: error?.message
          }
        } catch (e) {
          return {
            function: funcName,
            available: false,
            error: (e as Error).message
          }
        }
      })
    )
    
    return results
  }
}

// Export types for convenience
export type { Database } from './types'
export * from './types'