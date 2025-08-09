// ChatMessage Component
// Displays individual chat messages with results and actions

'use client'

import React from 'react'
import { 
  UserIcon, 
  ComputerDesktopIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { ChatMessageProps, MESSAGE_TYPES } from './types'
import { ResultsDisplay } from './ResultsDisplay'

const formatTime = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isLatest,
  onRetry,
  onCopy,
  onExport
}) => {
  const isUser = message.type === MESSAGE_TYPES.USER
  const isError = message.type === MESSAGE_TYPES.ERROR
  const hasResults = message.results && message.results.length > 0

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      onCopy?.(message.content)
    }).catch(err => {
      console.warn('Failed to copy message:', err)
    })
  }

  const handleRetry = () => {
    if (isUser && onRetry) {
      onRetry(message.content)
    }
  }

  return (
    <div className={`flex gap-3 mb-6 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isError 
          ? 'bg-red-100 text-red-600' 
          : isUser 
            ? 'bg-blue-100 text-blue-600' 
            : 'bg-gray-100 text-gray-600'
      }`}>
        {isError ? (
          <ExclamationTriangleIcon className="h-4 w-4" />
        ) : isUser ? (
          <UserIcon className="h-4 w-4" />
        ) : (
          <ComputerDesktopIcon className="h-4 w-4" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-3xl ${isUser ? 'text-right' : ''}`}>
        {/* Message Header */}
        <div className={`flex items-center gap-2 mb-2 ${isUser ? 'justify-end' : ''}`}>
          <span className="text-sm font-medium text-gray-900">
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-gray-500">
            {formatTime(message.timestamp)}
          </span>
          {message.isLoading && (
            <div className="animate-spin h-3 w-3 border border-gray-300 border-t-blue-600 rounded-full"></div>
          )}
        </div>

        {/* Message Bubble */}
        <div className={`
          rounded-lg px-4 py-3 max-w-full
          ${isUser 
            ? 'bg-blue-600 text-white ml-8' 
            : isError 
              ? 'bg-red-50 border border-red-200 text-red-900' 
              : 'bg-gray-50 border border-gray-200'
          }
        `}>
          {/* Text Content */}
          <div className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>

            {/* Loading State */}
            {message.isLoading && !isUser && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="animate-spin h-3 w-3 border border-gray-300 border-t-blue-600 rounded-full"></div>
                Processing query...
              </div>
            )}

            {/* Metadata */}
            {message.metadata && !isUser && (
              <div className="flex flex-wrap gap-2 pt-2">
                {message.metadata.executionTime && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    <ClockIcon className="h-3 w-3 mr-1" />
                    {message.metadata.executionTime}ms
                  </span>
                )}
                {message.metadata.rowCount !== undefined && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                    {message.metadata.rowCount} rows
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Results Display */}
        {hasResults && !isUser && (
          <div className="mt-4">
            <ResultsDisplay
              results={message.results!}
              metadata={message.metadata}
              onExport={onExport}
              onCopy={() => onCopy?.('Results copied to clipboard')}
            />
          </div>
        )}

        {/* Message Actions */}
        {!message.isLoading && (
          <div className={`flex items-center gap-2 mt-2 ${isUser ? 'justify-end' : ''}`}>
            <button
              onClick={handleCopyMessage}
              className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700 p-1"
            >
              <ClipboardDocumentIcon className="h-3 w-3 mr-1" />
              Copy
            </button>

            {isUser && isLatest && onRetry && (
              <button
                onClick={handleRetry}
                className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700 p-1"
              >
                <ArrowPathIcon className="h-3 w-3 mr-1" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}