// useNLQ Hook - Manages Natural Language Query state and operations
// Provides query execution, history management, and export functionality

import { useState, useCallback, useRef } from 'react'
import { useSupabase } from '@/components/AuthProvider'

export interface NLQMessage {
  id: string
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  sqlQuery?: string
  results?: any[]
  citations?: string[]
  error?: boolean
  isStreaming?: boolean
  executionTime?: number
}

export interface NLQSuggestion {
  text: string
  category: string
  complexity: 'simple' | 'moderate' | 'complex'
}

interface UseNLQOptions {
  maxHistorySize?: number
  autoSave?: boolean
  streamingEnabled?: boolean
}

interface UseNLQReturn {
  // State
  messages: NLQMessage[]
  isLoading: boolean
  error: string | null
  suggestions: NLQSuggestion[]
  
  // Actions
  submitQuery: (query: string) => Promise<void>
  clearHistory: () => void
  exportResults: (messageId: string, format: 'csv' | 'json') => void
  exportHistory: (format: 'json' | 'txt') => void
  loadSuggestions: () => Promise<void>
  retryLastQuery: () => Promise<void>
  cancelQuery: () => void
  
  // Utilities
  getQueryStats: () => QueryStats
  searchHistory: (searchTerm: string) => NLQMessage[]
}

interface QueryStats {
  totalQueries: number
  successfulQueries: number
  failedQueries: number
  averageExecutionTime: number
  mostQueriedTopics: Array<{ topic: string; count: number }>
}

export const useNLQ = (options: UseNLQOptions = {}): UseNLQReturn => {
  const {
    maxHistorySize = 100,
    autoSave = true,
    streamingEnabled = true
  } = options

  const { supabase, user } = useSupabase()
  const [messages, setMessages] = useState<NLQMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<NLQSuggestion[]>([])
  
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastQueryRef = useRef<string | null>(null)

  // Load query history from localStorage on mount
  useState(() => {
    if (typeof window !== 'undefined') {
      const savedHistory = localStorage.getItem('nlq_history')
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory)
          setMessages(parsed.slice(0, maxHistorySize))
        } catch (e) {
          console.error('Failed to load NLQ history:', e)
        }
      }
    }
  })

  // Save history to localStorage when it changes
  const saveHistory = useCallback(() => {
    if (autoSave && typeof window !== 'undefined') {
      const toSave = messages.slice(0, maxHistorySize)
      localStorage.setItem('nlq_history', JSON.stringify(toSave))
    }
  }, [messages, maxHistorySize, autoSave])

  // Submit a query
  const submitQuery = useCallback(async (query: string) => {
    if (!query.trim() || isLoading) return
    
    setError(null)
    setIsLoading(true)
    lastQueryRef.current = query

    // Add user message
    const userMessage: NLQMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: query,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])

    // Create assistant message placeholder
    const assistantId = `assistant-${Date.now()}`
    const assistantMessage: NLQMessage = {
      id: assistantId,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: streamingEnabled
    }
    
    setMessages(prev => [...prev, assistantMessage])

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch('/api/nlq/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          userId: user?.id,
          stream: streamingEnabled
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Query failed')
      }

      if (streamingEnabled && response.body) {
        // Handle streaming response
        await handleStreamingResponse(response.body, assistantId)
      } else {
        // Handle regular JSON response
        const data = await response.json()
        setMessages(prev => prev.map(msg => 
          msg.id === assistantId
            ? {
                ...msg,
                content: data.explanation || 'Query completed successfully.',
                sqlQuery: data.sql_generated,
                results: data.results,
                citations: data.citations,
                executionTime: data.execution_time_ms,
                isStreaming: false
              }
            : msg
        ))
      }

      // Save to database if user is authenticated
      if (user && autoSave) {
        await saveQueryToDatabase(query, assistantId)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Query cancelled')
      } else {
        const errorMessage = err.message || 'Failed to process query'
        setError(errorMessage)
        setMessages(prev => prev.map(msg => 
          msg.id === assistantId
            ? {
                ...msg,
                content: `Error: ${errorMessage}`,
                error: true,
                isStreaming: false
              }
            : msg
        ))
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
      saveHistory()
    }
  }, [user, isLoading, streamingEnabled, saveHistory])

  // Handle streaming response
  const handleStreamingResponse = async (body: ReadableStream, messageId: string) => {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let accumulatedContent = ''
    let sqlQuery = ''
    let results: any[] = []
    let citations: string[] = []
    let executionTime = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.content) {
                accumulatedContent += data.content
                setMessages(prev => prev.map(msg => 
                  msg.id === messageId
                    ? { ...msg, content: accumulatedContent }
                    : msg
                ))
              }
              
              if (data.sqlQuery) sqlQuery = data.sqlQuery
              if (data.results) results = data.results
              if (data.citations) citations = data.citations
              if (data.execution_time_ms) executionTime = data.execution_time_ms
            } catch (e) {
              console.error('Failed to parse streaming data:', e)
            }
          }
        }
      }

      // Update final message
      setMessages(prev => prev.map(msg => 
        msg.id === messageId
          ? {
              ...msg,
              content: accumulatedContent || 'Query completed.',
              sqlQuery,
              results,
              citations,
              executionTime,
              isStreaming: false
            }
          : msg
      ))
    } catch (error) {
      console.error('Streaming error:', error)
      throw error
    }
  }

  // Save query to database
  const saveQueryToDatabase = async (query: string, messageId: string) => {
    const message = messages.find(m => m.id === messageId)
    if (!message || !supabase) return

    try {
      await supabase.from('nlq_queries').insert({
        user_id: user?.id,
        query,
        sql_generated: message.sqlQuery,
        results: message.results,
        execution_time_ms: message.executionTime,
        citations: message.citations
      })
    } catch (error) {
      console.error('Failed to save query to database:', error)
    }
  }

  // Clear history
  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nlq_history')
    }
  }, [])

  // Export results
  const exportResults = useCallback((messageId: string, format: 'csv' | 'json') => {
    const message = messages.find(m => m.id === messageId)
    if (!message?.results || message.results.length === 0) return

    let content = ''
    let mimeType = ''
    let extension = ''

    if (format === 'csv') {
      const headers = Object.keys(message.results[0])
      content = headers.join(',') + '\n'
      content += message.results.map(row => 
        headers.map(h => {
          const value = row[h]
          // Properly escape CSV values
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value?.toString() || ''
        }).join(',')
      ).join('\n')
      mimeType = 'text/csv'
      extension = 'csv'
    } else {
      content = JSON.stringify(message.results, null, 2)
      mimeType = 'application/json'
      extension = 'json'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-results-${Date.now()}.${extension}`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages])

  // Export entire history
  const exportHistory = useCallback((format: 'json' | 'txt') => {
    if (messages.length === 0) return

    let content = ''
    let mimeType = ''
    let extension = ''

    if (format === 'json') {
      content = JSON.stringify(messages, null, 2)
      mimeType = 'application/json'
      extension = 'json'
    } else {
      content = messages.map(msg => 
        `[${new Date(msg.timestamp).toLocaleString()}] ${msg.type.toUpperCase()}: ${msg.content}\n` +
        (msg.sqlQuery ? `SQL: ${msg.sqlQuery}\n` : '') +
        (msg.results ? `Results: ${msg.results.length} rows\n` : '') +
        '\n'
      ).join('---\n')
      mimeType = 'text/plain'
      extension = 'txt'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nlq-history-${Date.now()}.${extension}`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages])

  // Load suggestions
  const loadSuggestions = useCallback(async () => {
    try {
      const response = await fetch('/api/nlq/suggestions')
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error)
    }
  }, [])

  // Retry last query
  const retryLastQuery = useCallback(async () => {
    if (lastQueryRef.current) {
      await submitQuery(lastQueryRef.current)
    }
  }, [submitQuery])

  // Cancel ongoing query
  const cancelQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsLoading(false)
    }
  }, [])

  // Get query statistics
  const getQueryStats = useCallback((): QueryStats => {
    const userQueries = messages.filter(m => m.type === 'user')
    const assistantMessages = messages.filter(m => m.type === 'assistant')
    const successful = assistantMessages.filter(m => !m.error)
    const failed = assistantMessages.filter(m => m.error)
    
    const executionTimes = successful
      .map(m => m.executionTime)
      .filter((t): t is number => t !== undefined)
    
    const avgExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0

    // Simple topic extraction (could be enhanced with NLP)
    const topicCounts = new Map<string, number>()
    userQueries.forEach(msg => {
      const topics = extractTopics(msg.content)
      topics.forEach(topic => {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
      })
    })

    const mostQueriedTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }))

    return {
      totalQueries: userQueries.length,
      successfulQueries: successful.length,
      failedQueries: failed.length,
      averageExecutionTime: Math.round(avgExecutionTime),
      mostQueriedTopics
    }
  }, [messages])

  // Search through history
  const searchHistory = useCallback((searchTerm: string): NLQMessage[] => {
    const term = searchTerm.toLowerCase()
    return messages.filter(msg => 
      msg.content.toLowerCase().includes(term) ||
      msg.sqlQuery?.toLowerCase().includes(term)
    )
  }, [messages])

  return {
    messages,
    isLoading,
    error,
    suggestions,
    submitQuery,
    clearHistory,
    exportResults,
    exportHistory,
    loadSuggestions,
    retryLastQuery,
    cancelQuery,
    getQueryStats,
    searchHistory
  }
}

// Helper function to extract topics from a query
function extractTopics(query: string): string[] {
  const topics: string[] = []
  const lowerQuery = query.toLowerCase()
  
  // Define topic keywords
  const topicKeywords = {
    'calls': ['call', 'rang', 'dialed', 'phone'],
    'messages': ['sms', 'text', 'message'],
    'contacts': ['contact', 'person', 'who', 'number'],
    'time': ['today', 'yesterday', 'week', 'month', 'hour', 'day'],
    'statistics': ['average', 'total', 'count', 'how many', 'most', 'least'],
    'duration': ['duration', 'long', 'minutes', 'seconds'],
    'patterns': ['pattern', 'trend', 'busiest', 'peak', 'frequent']
  }

  Object.entries(topicKeywords).forEach(([topic, keywords]) => {
    if (keywords.some(keyword => lowerQuery.includes(keyword))) {
      topics.push(topic)
    }
  })

  return topics
}
