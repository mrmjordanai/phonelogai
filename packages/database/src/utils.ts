// Database Utility Functions for Call/SMS Intelligence Platform
// Common database operations and helpers

import { supabase, supabaseAdmin, db } from './client'
import type { 
  Event, 
  Contact, 
  PrivacyRule, 
  EventInsert, 
  ContactInsert, 
  PrivacyRuleInsert,
  SyncHealthInsert,
  AuditLogInsert,
  UserRole 
} from './types'

// Event management utilities
export const eventUtils = {
  // Create events with deduplication
  createEvents: async (events: EventInsert[]): Promise<{ 
    data: Event[] | null; 
    error: any;
    duplicates: number;
  }> => {
    try {
      const { data, error } = await supabase
        .from('events')
        .upsert(events, { 
          onConflict: 'user_id,line_id,ts,number,direction,duration',
          ignoreDuplicates: true 
        })
        .select()

      if (error) {
        return { data: null, error, duplicates: 0 }
      }

      const duplicates = events.length - (data?.length || 0)
      return { data, error: null, duplicates }
    } catch (error) {
      return { data: null, error, duplicates: 0 }
    }
  },

  // Get events with privacy filtering
  getFilteredEvents: async (
    targetUserId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
      eventType?: 'call' | 'sms';
      direction?: 'inbound' | 'outbound';
    } = {}
  ) => {
    const { limit = 1000, offset = 0, startDate, endDate, eventType, direction } = options
    
    return await db.rpc('get_filtered_events', {
      requesting_user_id: (await supabase.auth.getUser()).data.user?.id,
      target_user_id: targetUserId,
      event_limit: limit,
      event_offset: offset
    })
  },

  // Bulk update contact associations
  updateContactAssociations: async (userId: string) => {
    try {
      // This would typically be done by a database trigger or background job
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, number')
        .eq('user_id', userId)
        .is('contact_id', null)

      if (eventsError || !events) {
        return { error: eventsError }
      }

      // Get contacts for this user
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, number')
        .eq('user_id', userId)

      if (contactsError || !contacts) {
        return { error: contactsError }
      }

      // Create lookup map
      const contactMap = new Map(contacts.map(c => [c.number, c.id]))

      // Update events with contact associations
      const updates = events
        .filter(e => contactMap.has(e.number))
        .map(e => ({
          id: e.id,
          contact_id: contactMap.get(e.number)
        }))

      if (updates.length > 0) {
        const { error: updateError } = await supabase
          .from('events')
          .upsert(updates)

        return { error: updateError, updatedCount: updates.length }
      }

      return { error: null, updatedCount: 0 }
    } catch (error) {
      return { error }
    }
  }
}

// Contact management utilities
export const contactUtils = {
  // Create or update contact with aggregated stats
  upsertContact: async (userId: string, number: string, data: Partial<ContactInsert> = {}) => {
    try {
      // Get aggregated stats for this contact
      const { data: stats, error: statsError } = await supabase
        .from('events')
        .select('type, ts')
        .eq('user_id', userId)
        .eq('number', number)

      if (statsError) {
        return { data: null, error: statsError }
      }

      const totalCalls = stats?.filter(s => s.type === 'call').length || 0
      const totalSms = stats?.filter(s => s.type === 'sms').length || 0
      const timestamps = stats?.map(s => new Date(s.ts)) || []
      const firstSeen = timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : new Date()
      const lastSeen = timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : new Date()

      const contactData: ContactInsert = {
        user_id: userId,
        number,
        total_calls: totalCalls,
        total_sms: totalSms,
        first_seen: firstSeen.toISOString(),
        last_seen: lastSeen.toISOString(),
        ...data
      }

      const { data: insertedContact, error } = await supabase
        .from('contacts')
        .upsert(contactData, { onConflict: 'user_id,number' })
        .select()
        .single()

      return { data: insertedContact, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Get contact with privacy rules
  getContactWithPrivacy: async (contactId: string) => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          privacy_rules (
            visibility,
            anonymize_number,
            anonymize_content
          )
        `)
        .eq('id', contactId)
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }
}

// Privacy rule utilities
export const privacyUtils = {
  // Set privacy rule for contact
  setContactPrivacy: async (userId: string, contactId: string, rules: Partial<PrivacyRuleInsert>) => {
    try {
      const privacyRule: PrivacyRuleInsert = {
        user_id: userId,
        contact_id: contactId,
        visibility: 'team',
        anonymize_number: false,
        anonymize_content: false,
        ...rules
      }

      const { data, error } = await supabase
        .from('privacy_rules')
        .upsert(privacyRule, { onConflict: 'user_id,contact_id' })
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Bulk anonymize contacts
  bulkAnonymizeContacts: async (userId: string, contactIds: string[]) => {
    try {
      const updates = contactIds.map(contactId => ({
        user_id: userId,
        contact_id: contactId,
        visibility: 'private' as const,
        anonymize_number: true,
        anonymize_content: true
      }))

      const { data, error } = await supabase
        .from('privacy_rules')
        .upsert(updates, { onConflict: 'user_id,contact_id' })
        .select()

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Get user's privacy settings
  getUserPrivacySettings: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('privacy_rules')
        .select(`
          *,
          contacts (
            id,
            name,
            number,
            company
          )
        `)
        .eq('user_id', userId)

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }
}

// Sync health utilities
export const syncUtils = {
  // Update sync health status
  updateSyncHealth: async (userId: string, source: string, data: Partial<SyncHealthInsert>) => {
    try {
      const syncData: SyncHealthInsert = {
        user_id: userId,
        source,
        last_sync: new Date().toISOString(),
        queue_depth: 0,
        drift_percentage: 0,
        status: 'healthy',
        ...data
      }

      const { data: result, error } = await supabase
        .from('sync_health')
        .upsert(syncData, { onConflict: 'user_id,source' })
        .select()
        .single()

      return { data: result, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Get sync health for user
  getSyncHealth: async (userId: string) => {
    return await db.rpc('analyze_sync_health', {
      target_user_id: userId
    })
  },

  // Detect data gaps
  detectGaps: async (userId: string, thresholdHours: number = 24) => {
    return await db.rpc('detect_data_gaps', {
      target_user_id: userId,
      threshold_hours: thresholdHours
    })
  }
}

// Audit logging utilities
export const auditUtils = {
  // Log an action
  logAction: async (action: string, resource: string, resourceId?: string, metadata: Record<string, any> = {}) => {
    try {
      const user = await supabase.auth.getUser()
      if (!user.data.user) {
        return { error: 'No authenticated user' }
      }

      const auditLog: AuditLogInsert = {
        actor_id: user.data.user.id,
        action,
        resource,
        resource_id: resourceId,
        metadata
      }

      const { data, error } = await supabase
        .from('audit_log')
        .insert(auditLog)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Get audit log for user
  getAuditLog: async (userId: string, limit: number = 100) => {
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .or(`actor_id.eq.${userId},resource_id.eq.${userId}`)
        .order('ts', { ascending: false })
        .limit(limit)

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }
}

// Dashboard utilities
export const dashboardUtils = {
  // Get user dashboard metrics
  getUserMetrics: async (userId: string) => {
    return await db.rpc('get_dashboard_metrics', {
      target_user_id: userId
    })
  },

  // Get team dashboard metrics
  getTeamMetrics: async (userId: string) => {
    return await db.rpc('get_team_dashboard_metrics', {
      requesting_user_id: userId
    })
  },

  // Get communication trends
  getTrends: async (userId: string, days: number = 30) => {
    return await db.rpc('get_communication_trends', {
      target_user_id: userId,
      days
    })
  },

  // Get contact intelligence
  getContactIntelligence: async (contactId: string) => {
    const user = await supabase.auth.getUser()
    if (!user.data.user) {
      return { data: null, error: 'No authenticated user' }
    }

    return await db.rpc('get_contact_intelligence', {
      requesting_user_id: user.data.user.id,
      target_contact_id: contactId
    })
  }
}

// Role and organization utilities
export const orgUtils = {
  // Get user's role in organization
  getUserRole: async (userId: string, orgId: string): Promise<UserRole | null> => {
    try {
      const { data, error } = await supabase
        .from('org_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .single()

      if (error || !data) {
        return null
      }

      return data.role
    } catch (error) {
      return null
    }
  },

  // Check if user has minimum role
  hasMinimumRole: async (userId: string, orgId: string, minimumRole: UserRole): Promise<boolean> => {
    const userRole = await orgUtils.getUserRole(userId, orgId)
    if (!userRole) return false

    const roleHierarchy: Record<UserRole, number> = {
      'viewer': 1,
      'member': 2,
      'analyst': 3,
      'admin': 4,
      'owner': 5
    }

    return roleHierarchy[userRole] >= roleHierarchy[minimumRole]
  },

  // Get organization members
  getOrgMembers: async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('org_roles')
        .select(`
          *,
          users:user_id (
            id,
            email,
            created_at
          )
        `)
        .eq('org_id', orgId)
        .order('role', { ascending: false })

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }
}

// File upload utilities
export const uploadUtils = {
  // Track file upload progress
  createUploadRecord: async (userId: string, filename: string, fileType: string, fileSize?: number) => {
    try {
      const { data, error } = await supabase
        .from('file_uploads')
        .insert({
          user_id: userId,
          filename,
          file_type: fileType,
          file_size: fileSize,
          status: 'pending'
        })
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Update upload progress
  updateUploadProgress: async (uploadId: string, rowsProcessed: number, errors: any[] = []) => {
    try {
      const { data, error } = await supabase
        .from('file_uploads')
        .update({
          rows_processed: rowsProcessed,
          errors,
          updated_at: new Date().toISOString()
        })
        .eq('id', uploadId)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Complete upload
  completeUpload: async (uploadId: string, status: 'completed' | 'failed', rowsTotal?: number) => {
    try {
      const { data, error } = await supabase
        .from('file_uploads')
        .update({
          status,
          rows_total: rowsTotal,
          completed_at: new Date().toISOString()
        })
        .eq('id', uploadId)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  }
}

// Export all utilities
export const dbUtils = {
  events: eventUtils,
  contacts: contactUtils,
  privacy: privacyUtils,
  sync: syncUtils,
  audit: auditUtils,
  dashboard: dashboardUtils,
  org: orgUtils,
  uploads: uploadUtils
}