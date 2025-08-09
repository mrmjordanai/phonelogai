// NLQ Component Types
// TypeScript interfaces and types for Natural Language Query components

export interface ChatMessage {
  id: string
  type: 'user' | 'system' | 'error'
  content: string
  timestamp: Date
  metadata?: {
    executionTime?: number
    rowCount?: number
    sqlGenerated?: string
    storedQueryId?: string
  }
  results?: any[]
  isLoading?: boolean
}

export interface QuerySuggestion {
  type: 'recent_query' | 'template' | 'example'
  text: string
  category?: string
  popularity?: number
  lastUsed?: string
}

export interface NlqQueryResponse {
  success: boolean
  data?: {
    query: string
    sql_generated: string
    results: any[]
    execution_time_ms: number
    row_count: number
    stored_query_id?: string
  }
  error?: string
  similar_queries?: Array<{
    id: string
    query_text: string
    similarity: number
  }>
  templates?: Array<{
    id: string
    template_name: string
    pattern_description: string
  }>
  suggestions?: string[]
  timestamp: string
}

export interface NlqSuggestionsResponse {
  success: boolean
  data?: {
    suggestions: QuerySuggestion[]
    user_history_count: number
    total_suggestions: number
  }
  error?: string
  timestamp: string
}

export interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  currentQuery: string
  suggestions: QuerySuggestion[]
  history: string[]
  error?: string
}

export interface NlqChatProps {
  className?: string
  initialQuery?: string
  maxHeight?: string
  showSuggestions?: boolean
  placeholder?: string
}

export interface ChatMessageProps {
  message: ChatMessage
  isLatest: boolean
  onRetry?: (query: string) => void
  onCopy?: (content: string) => void
  onExport?: (data: any[], format: 'csv' | 'json') => void
}

export interface QueryInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (query: string) => void
  isLoading: boolean
  suggestions: QuerySuggestion[]
  placeholder?: string
  disabled?: boolean
}

export interface ResultsDisplayProps {
  results: any[]
  metadata?: ChatMessage['metadata']
  onExport?: (data: any[], format: 'csv' | 'json') => void
  onCopy?: () => void
}

export interface QuerySuggestionsProps {
  suggestions: QuerySuggestion[]
  onSuggestionClick: (suggestion: string) => void
  isLoading?: boolean
  className?: string
}

// Hook return types
export interface UseNlqChatReturn {
  messages: ChatMessage[]
  isLoading: boolean
  currentQuery: string
  setCurrentQuery: (query: string) => void
  submitQuery: (query: string) => Promise<void>
  clearHistory: () => void
  retryQuery: (query: string) => Promise<void>
  error?: string
  clearError: () => void
}

export interface UseNlqQueryReturn {
  executeQuery: (query: string, maxRows?: number) => Promise<NlqQueryResponse>
  isLoading: boolean
  error?: string
}

export interface UseQuerySuggestionsReturn {
  suggestions: QuerySuggestion[]
  fetchSuggestions: () => Promise<void>
  isLoading: boolean
  error?: string
}

// Utility types
export type MessageType = ChatMessage['type']
export type SuggestionType = QuerySuggestion['type']
export type ExportFormat = 'csv' | 'json'

// Constants
export const QUERY_LIMITS = {
  MAX_QUERY_LENGTH: 500,
  MAX_ROWS: 1000,
  MAX_SUGGESTIONS: 10,
  DEBOUNCE_MS: 300
} as const

export const MESSAGE_TYPES = {
  USER: 'user',
  SYSTEM: 'system', 
  ERROR: 'error'
} as const

export const SUGGESTION_TYPES = {
  RECENT_QUERY: 'recent_query',
  TEMPLATE: 'template',
  EXAMPLE: 'example'
} as const