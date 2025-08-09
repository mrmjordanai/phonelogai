// API Client for PhoneLog AI
// Provides typed methods for interacting with all backend API endpoints

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
  parameters?: Record<string, any>
  timestamp: string
}

export interface ApiError {
  error: string
  status?: number
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      return data
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Unknown API error')
    }
  }

  // Dashboard APIs
  async getDashboardMetrics(userId?: string): Promise<ApiResponse<any>> {
    const params = new URLSearchParams()
    if (userId) params.append('user_id', userId)
    
    return this.request(`/api/dashboard/metrics?${params}`)
  }

  async getTeamMetrics(): Promise<ApiResponse<any>> {
    return this.request('/api/dashboard/team-metrics')
  }

  // Analytics APIs
  async getTimeSeriesData(params: {
    userId?: string
    dateFrom: string
    dateTo: string
    granularity?: 'hourly' | 'daily' | 'weekly'
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams({
      date_from: params.dateFrom,
      date_to: params.dateTo,
      granularity: params.granularity || 'daily',
    })
    
    if (params.userId) searchParams.append('user_id', params.userId)
    
    return this.request(`/api/analytics/time-series?${searchParams}`)
  }

  async getActivityHeatmap(params: {
    userId?: string
    daysBack?: number
  } = {}): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params.userId) searchParams.append('user_id', params.userId)
    if (params.daysBack) searchParams.append('days_back', params.daysBack.toString())
    
    return this.request(`/api/analytics/heatmap?${searchParams}`)
  }

  async getCallPatterns(params: {
    userId?: string
    analysisDays?: number
  } = {}): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params.userId) searchParams.append('user_id', params.userId)
    if (params.analysisDays) searchParams.append('analysis_days', params.analysisDays.toString())
    
    return this.request(`/api/analytics/call-patterns?${searchParams}`)
  }

  // Search APIs
  async searchContacts(params: {
    query: string
    limit?: number
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams({
      q: params.query,
    })
    
    if (params.limit) searchParams.append('limit', params.limit.toString())
    
    return this.request(`/api/search/contacts?${searchParams}`)
  }

  async searchEvents(params: {
    userId?: string
    types?: ('call' | 'sms')[]
    directions?: ('inbound' | 'outbound')[]
    dateFrom?: string
    dateTo?: string
    contactIds?: string[]
    sources?: string[]
    content?: string
    minDuration?: number
    maxDuration?: number
    limit?: number
    offset?: number
  } = {}): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams()
    
    if (params.userId) searchParams.append('user_id', params.userId)
    if (params.types?.length) searchParams.append('types', params.types.join(','))
    if (params.directions?.length) searchParams.append('directions', params.directions.join(','))
    if (params.dateFrom) searchParams.append('date_from', params.dateFrom)
    if (params.dateTo) searchParams.append('date_to', params.dateTo)
    if (params.contactIds?.length) searchParams.append('contact_ids', params.contactIds.join(','))
    if (params.sources?.length) searchParams.append('sources', params.sources.join(','))
    if (params.content) searchParams.append('content', params.content)
    if (params.minDuration !== undefined) searchParams.append('min_duration', params.minDuration.toString())
    if (params.maxDuration !== undefined) searchParams.append('max_duration', params.maxDuration.toString())
    if (params.limit) searchParams.append('limit', params.limit.toString())
    if (params.offset) searchParams.append('offset', params.offset.toString())
    
    return this.request(`/api/search/events?${searchParams}`)
  }

  // Contact APIs
  async getContactIntelligence(contactId: string): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams({
      contact_id: contactId,
    })
    
    return this.request(`/api/contacts/intelligence?${searchParams}`)
  }

  async getContactCommunicationSummary(params: {
    contactId: string
    daysBack?: number
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams({
      contact_id: params.contactId,
    })
    
    if (params.daysBack) searchParams.append('days_back', params.daysBack.toString())
    
    return this.request(`/api/contacts/communication-summary?${searchParams}`)
  }

  // Data Quality APIs
  async detectDataGaps(params: {
    userId?: string
    thresholdHours?: number
  } = {}): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params.userId) searchParams.append('user_id', params.userId)
    if (params.thresholdHours) searchParams.append('threshold_hours', params.thresholdHours.toString())
    
    return this.request(`/api/data-quality/gaps?${searchParams}`)
  }

  async analyzeSyncHealth(userId?: string): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams()
    if (userId) searchParams.append('user_id', userId)
    
    return this.request(`/api/data-quality/sync-health?${searchParams}`)
  }
}

// Create singleton instance
export const apiClient = new ApiClient()

// Hook for React components
export function useApiClient() {
  return apiClient
}

// Error handling utilities
export function isApiError(error: any): error is ApiError {
  return error && typeof error.error === 'string'
}

export function getErrorMessage(error: any): string {
  if (isApiError(error)) {
    return error.error
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown error occurred'
}

// Type definitions for common API responses
export interface DashboardMetrics {
  total_events: number
  total_calls: number
  total_sms: number
  unique_contacts: number
  avg_call_duration_minutes: number
  last_30_days_events: number
  busiest_hour?: number
  top_contact?: {
    contact_id: string
    name?: string
    number: string
    interaction_count: number
  }
  generated_at: number
}

export interface TimeSeriesData {
  granularity: 'hourly' | 'daily' | 'weekly'
  date_from: string
  date_to: string
  total_periods: number
  summary: {
    total_events: number
    total_calls: number
    total_sms: number
    avg_events_per_period: number
    peak_period: string
  }
  data: Array<{
    time_bucket: string
    timestamp: string
    total_events: number
    calls: number
    sms: number
    inbound: number
    outbound: number
    unique_contacts: number
    avg_duration?: number
  }>
  generated_at: string
}

export interface HeatmapData {
  days_analyzed: number
  max_activity: number
  data: Array<{
    day_of_week: number
    hour: number
    count: number
    intensity: number
  }>
  day_labels: string[]
  generated_at: string
}

export interface ContactSearchResult {
  id: string
  user_id: string
  number: string
  name?: string
  company?: string
  tags: string[]
  total_calls: number
  total_sms: number
  last_seen: string
  search_rank: number
}

export interface EventSearchResult {
  id: string
  user_id: string
  line_id: string
  ts: string
  number: string
  direction: 'inbound' | 'outbound'
  type: 'call' | 'sms'
  duration?: number
  content?: string
  contact_id?: string
  contact_name?: string
  source: string
  created_at: string
}