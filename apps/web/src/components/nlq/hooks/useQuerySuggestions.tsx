// useQuerySuggestions Hook  
// Manages query suggestions and user history

'use client'

import { useState, useEffect } from 'react'
import { UseQuerySuggestionsReturn, QuerySuggestion, NlqSuggestionsResponse } from '../types'

export const useQuerySuggestions = (): UseQuerySuggestionsReturn => {
  const [suggestions, setSuggestions] = useState<QuerySuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()

  const fetchSuggestions = async (limit: number = 10): Promise<void> => {
    setIsLoading(true)
    setError(undefined)

    try {
      const response = await fetch(`/api/nlq/suggestions?limit=${limit}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: NlqSuggestionsResponse = await response.json()
      
      if (data.success && data.data) {
        setSuggestions(data.data.suggestions)
      } else if (data.error) {
        setError(data.error)
        setSuggestions([])
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch suggestions'
      setError(errorMessage)
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch suggestions on mount
  useEffect(() => {
    fetchSuggestions()
  }, [])

  return {
    suggestions,
    fetchSuggestions,
    isLoading,
    error
  }
}