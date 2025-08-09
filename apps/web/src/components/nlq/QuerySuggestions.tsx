// QuerySuggestions Component
// Displays clickable query suggestion chips

'use client'

import React from 'react'
import { 
  LightBulbIcon, 
  ClockIcon, 
  StarIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline'
import { QuerySuggestionsProps, SUGGESTION_TYPES } from './types'

const getSuggestionIcon = (type: string) => {
  switch (type) {
    case SUGGESTION_TYPES.RECENT_QUERY:
      return <ClockIcon className="h-3 w-3" />
    case SUGGESTION_TYPES.TEMPLATE:
      return <StarIcon className="h-3 w-3" />
    case SUGGESTION_TYPES.EXAMPLE:
      return <ChatBubbleLeftRightIcon className="h-3 w-3" />
    default:
      return <LightBulbIcon className="h-3 w-3" />
  }
}

const getSuggestionLabel = (type: string) => {
  switch (type) {
    case SUGGESTION_TYPES.RECENT_QUERY:
      return 'Recent'
    case SUGGESTION_TYPES.TEMPLATE:
      return 'Template'
    case SUGGESTION_TYPES.EXAMPLE:
      return 'Example'
    default:
      return 'Suggestion'
  }
}

const getSuggestionStyles = (type: string) => {
  switch (type) {
    case SUGGESTION_TYPES.RECENT_QUERY:
      return 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100'
    case SUGGESTION_TYPES.TEMPLATE:
      return 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100'
    case SUGGESTION_TYPES.EXAMPLE:
      return 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100'
    default:
      return 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
  }
}

export const QuerySuggestions: React.FC<QuerySuggestionsProps> = ({
  suggestions,
  onSuggestionClick,
  isLoading = false,
  className = ''
}) => {
  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="animate-spin h-4 w-4 border border-gray-300 border-t-blue-600 rounded-full"></div>
          Loading suggestions...
        </div>
      </div>
    )
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <LightBulbIcon className="h-4 w-4" />
          No suggestions available
        </div>
        <p className="text-xs text-gray-500">
          Try asking questions like "How many calls did I make today?" or "Show me my recent messages"
        </p>
      </div>
    )
  }

  // Group suggestions by type
  const groupedSuggestions = suggestions.reduce((acc, suggestion) => {
    const type = suggestion.type || 'example'
    if (!acc[type]) acc[type] = []
    acc[type].push(suggestion)
    return acc
  }, {} as Record<string, typeof suggestions>)

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <LightBulbIcon className="h-4 w-4" />
        Suggestions
      </div>

      <div className="space-y-3">
        {Object.entries(groupedSuggestions).map(([type, typeSuggestions]) => (
          <div key={type} className="space-y-2">
            {/* Type Header */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                {getSuggestionIcon(type)}
                <span className="ml-1">{getSuggestionLabel(type)}</span>
              </span>
            </div>

            {/* Suggestion Chips */}
            <div className="flex flex-wrap gap-2">
              {typeSuggestions.map((suggestion, index) => (
                <button
                  key={`${type}-${index}`}
                  onClick={() => onSuggestionClick(suggestion.text)}
                  className={`inline-block text-left py-2 px-3 text-xs rounded-lg border transition-all duration-200 hover:scale-105 max-w-xs ${getSuggestionStyles(suggestion.type)}`}
                >
                  <div>
                    <div className="font-medium">{suggestion.text}</div>
                    {suggestion.category && (
                      <div className="text-[10px] opacity-75 mt-0.5">
                        {suggestion.category}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Tips */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="text-xs text-blue-700 space-y-1">
          <div className="font-medium mb-1 flex items-center">
            <LightBulbIcon className="h-3 w-3 mr-1" />
            Quick tips:
          </div>
          <div>• Ask about specific time periods: "this week", "last month"</div>
          <div>• Query by contact: "calls with John", "messages from Sarah"</div>
          <div>• Analyze patterns: "busiest hours", "call duration trends"</div>
        </div>
      </div>
    </div>
  )
}