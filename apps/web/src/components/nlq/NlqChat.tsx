// NlqChat Component
// Main chat interface for Natural Language Queries

'use client'

import React, { useRef, useEffect } from 'react'
import { 
  ComputerDesktopIcon, 
  TrashIcon, 
  SparklesIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { NlqChatProps } from './types'
import { useNlqChat } from './hooks/useNlqChat'
import { useQuerySuggestions } from './hooks/useQuerySuggestions'
import { ChatMessage } from './ChatMessage'
import { QueryInput } from './QueryInput'
import { QuerySuggestions } from './QuerySuggestions'

export const NlqChat: React.FC<NlqChatProps> = ({
  className = '',
  initialQuery = '',
  maxHeight = '600px',
  showSuggestions = true,
  placeholder = 'Ask anything about your phone data...'
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const {
    messages,
    isLoading,
    currentQuery,
    setCurrentQuery,
    submitQuery,
    clearHistory,
    retryQuery,
    error,
    clearError
  } = useNlqChat()

  const {
    suggestions,
    fetchSuggestions,
    isLoading: suggestionsLoading
  } = useQuerySuggestions()

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Submit initial query if provided
  useEffect(() => {
    if (initialQuery && messages.length === 0) {
      setCurrentQuery(initialQuery)
      submitQuery(initialQuery)
    }
  }, [initialQuery, messages.length, submitQuery, setCurrentQuery])

  const handleSuggestionClick = (suggestionText: string) => {
    setCurrentQuery(suggestionText)
    submitQuery(suggestionText)
  }

  const handleCopy = (content: string) => {
    // Could show a toast notification here
    console.log('Copied:', content)
  }

  const handleExport = (data: Record<string, unknown>[], format: 'csv' | 'json') => {
    console.log(`Exported ${data.length} rows as ${format}`)
  }

  const hasMessages = messages.length > 0
  const hasError = Boolean(error)

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ComputerDesktopIcon className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-medium text-gray-900">Natural Language Query</h3>
              <SparklesIcon className="h-4 w-4 text-gray-400" />
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={fetchSuggestions}
                disabled={suggestionsLoading}
                className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                <ArrowPathIcon className={`h-3 w-3 mr-1 ${suggestionsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              
              {hasMessages && (
                <button
                  onClick={clearHistory}
                  className="inline-flex items-center text-xs text-gray-500 hover:text-red-600 px-2 py-1"
                >
                  <TrashIcon className="h-3 w-3 mr-1" />
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          {/* Messages Area */}
          <div 
            className="flex-1 overflow-auto mb-4"
            style={{ maxHeight: hasMessages ? maxHeight : 'auto' }}
          >
            {hasMessages ? (
              <>
                {/* Chat Messages */}
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isLatest={index === messages.length - 1}
                      onRetry={retryQuery}
                      onCopy={handleCopy}
                      onExport={handleExport}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </>
            ) : (
              <>
                {/* Welcome State */}
                <div className="text-center py-8">
                  <ComputerDesktopIcon className="h-12 w-12 text-gray-400 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Ask questions about your data</h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    Use natural language to query your phone calls and messages. 
                    Try asking about patterns, statistics, or specific timeframes.
                  </p>
                </div>

                {/* Suggestions */}
                {showSuggestions && (
                  <div className="max-w-2xl mx-auto">
                    <QuerySuggestions
                      suggestions={suggestions}
                      onSuggestionClick={handleSuggestionClick}
                      isLoading={suggestionsLoading}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Error Display */}
          {hasError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm text-red-900">
                  {error}
                </p>
                <button
                  onClick={clearError}
                  className="text-xs text-red-700 hover:text-red-900 px-2 py-1"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Query Input */}
          <div className="flex-shrink-0">
            <QueryInput
              value={currentQuery}
              onChange={setCurrentQuery}
              onSubmit={submitQuery}
              isLoading={isLoading}
              suggestions={suggestions}
              placeholder={placeholder}
            />
          </div>
        </div>
      </div>
    </div>
  )
}