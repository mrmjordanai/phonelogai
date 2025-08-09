// useNlqChat Hook
// Main chat state management and message handling

'use client'

import { useState, useCallback } from 'react'
import { UseNlqChatReturn, ChatMessage, MESSAGE_TYPES } from '../types'
import { useNlqQuery } from './useNlqQuery'

export const useNlqChat = (): UseNlqChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentQuery, setCurrentQuery] = useState('')
  const [error, setError] = useState<string>()

  const { executeQuery, isLoading } = useNlqQuery()

  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const addMessage = (message: Omit<ChatMessage, 'id'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateMessageId()
    }
    setMessages(prev => [...prev, newMessage])
    return newMessage.id
  }

  const updateMessage = (id: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    ))
  }

  const submitQuery = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) return

    setError(undefined)
    
    // Add user message
    const userMessageId = addMessage({
      type: MESSAGE_TYPES.USER,
      content: query.trim(),
      timestamp: new Date()
    })

    // Add loading system message
    const systemMessageId = addMessage({
      type: MESSAGE_TYPES.SYSTEM,
      content: 'Processing your query...',
      timestamp: new Date(),
      isLoading: true
    })

    try {
      const response = await executeQuery(query.trim())
      
      if (response.success && response.data) {
        // Update system message with results
        updateMessage(systemMessageId, {
          content: `Found ${response.data.row_count} results`,
          results: response.data.results,
          metadata: {
            executionTime: response.data.execution_time_ms,
            rowCount: response.data.row_count,
            sqlGenerated: response.data.sql_generated,
            storedQueryId: response.data.stored_query_id
          },
          isLoading: false
        })
      } else {
        // Update with error message
        updateMessage(systemMessageId, {
          type: MESSAGE_TYPES.ERROR,
          content: response.error || 'Failed to process query',
          isLoading: false
        })

        if (response.suggestions && response.suggestions.length > 0) {
          addMessage({
            type: MESSAGE_TYPES.SYSTEM,
            content: `Try one of these suggestions: ${response.suggestions.join(', ')}`,
            timestamp: new Date()
          })
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      
      updateMessage(systemMessageId, {
        type: MESSAGE_TYPES.ERROR,
        content: errorMessage,
        isLoading: false
      })
      
      setError(errorMessage)
    }

    setCurrentQuery('')
  }, [executeQuery])

  const retryQuery = useCallback(async (query: string): Promise<void> => {
    await submitQuery(query)
  }, [submitQuery])

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(undefined)
  }, [])

  const clearError = useCallback(() => {
    setError(undefined)
  }, [])

  return {
    messages,
    isLoading,
    currentQuery,
    setCurrentQuery,
    submitQuery,
    clearHistory,
    retryQuery,
    error,
    clearError
  }
}