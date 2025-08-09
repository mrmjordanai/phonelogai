// useNlqQuery Hook
// Handles API integration for NLQ query execution

'use client'

import { useState } from 'react'
import { UseNlqQueryReturn, NlqQueryResponse } from '../types'

export const useNlqQuery = (): UseNlqQueryReturn => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()

  const executeQuery = async (query: string, maxRows: number = 1000): Promise<NlqQueryResponse> => {
    setIsLoading(true)
    setError(undefined)

    try {
      const response = await fetch('/api/nlq/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          max_rows: maxRows
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: NlqQueryResponse = await response.json()
      
      if (!data.success && data.error) {
        setError(data.error)
      }

      return data

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to execute query'
      setError(errorMessage)
      
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }
    } finally {
      setIsLoading(false)
    }
  }

  return {
    executeQuery,
    isLoading,
    error
  }
}