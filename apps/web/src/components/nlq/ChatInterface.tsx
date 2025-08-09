// Enhanced Chat Interface Component for Natural Language Queries
// Features: Streaming responses, typing indicators, export functionality, citations

'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  ArrowDownTrayIcon,
  SparklesIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
  ArrowPathIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'

interface Message {
  id: string
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  sqlQuery?: string
  results?: any[]
  citations?: string[]
  error?: boolean
  isStreaming?: boolean
}

interface ChatInterfaceProps {
  userId: string
  isOpen: boolean
  onClose: () => void
  className?: string
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  userId,
  isOpen,
  onClose,
  className = ''
}) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set())
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load suggestions on mount
  useEffect(() => {
    loadSuggestions()
  }, [])

  const loadSuggestions = async () => {
    try {
      const response = await fetch('/api/nlq/suggestions')
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    const query = input.trim()
    if (!query || isLoading) return

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: query,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setShowSuggestions(false)
    setIsLoading(true)

    // Create assistant message with streaming flag
    const assistantMessageId = `assistant-${Date.now()}`
    const assistantMessage: Message = {
      id: assistantMessageId,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    }
    
    setMessages(prev => [...prev, assistantMessage])

    try {
      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController()
      
      const response = await fetch('/api/nlq/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query,
          userId,
          stream: true // Enable streaming responses
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`)
      }

      // Handle streaming response
      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let accumulatedContent = ''
        let sqlQuery = ''
        let results: any[] = []
        let citations: string[] = []

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
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  ))
                }
                
                if (data.sqlQuery) {
                  sqlQuery = data.sqlQuery
                }
                
                if (data.results) {
                  results = data.results
                }
                
                if (data.citations) {
                  citations = data.citations
                }
              } catch (e) {
                console.error('Failed to parse streaming data:', e)
              }
            }
          }
        }

        // Update final message with complete data
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: accumulatedContent || 'Query completed successfully.',
                sqlQuery,
                results,
                citations,
                isStreaming: false
              }
            : msg
        ))
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Query was cancelled')
      } else {
        console.error('Query error:', error)
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `Error: ${error.message || 'Failed to process query'}`,
                error: true,
                isStreaming: false
              }
            : msg
        ))
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsLoading(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    inputRef.current?.focus()
  }

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(messageId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const handleExport = (message: Message) => {
    if (!message.results || message.results.length === 0) return

    const format = 'csv' // Could make this configurable
    let content = ''

    if (format === 'csv') {
      const headers = Object.keys(message.results[0])
      content = headers.join(',') + '\n'
      content += message.results.map(row => 
        headers.map(h => JSON.stringify(row[h] || '')).join(',')
      ).join('\n')
    } else {
      content = JSON.stringify(message.results, null, 2)
    }

    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-results-${Date.now()}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleResultsExpanded = (messageId: string) => {
    setExpandedResults(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  const clearHistory = () => {
    setMessages([])
    setShowSuggestions(true)
  }

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 ${className}`}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Natural Language Query</h2>
            <SparklesIcon className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && showSuggestions ? (
            <div className="space-y-6">
              <div className="text-center">
                <ChatBubbleLeftRightIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Ask anything about your phone data
                </h3>
                <p className="text-sm text-gray-500">
                  Use natural language to explore your calls, messages, and communication patterns.
                </p>
              </div>
              
              {suggestions.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3">Try asking:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors"
                      >
                        <SparklesIcon className="h-4 w-4 inline mr-2 text-gray-400" />
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : message.error
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-gray-50'
                    } rounded-lg px-4 py-3`}
                  >
                    {/* Message Content */}
                    <div className={message.type === 'user' ? 'text-white' : 'text-gray-900'}>
                      {message.isStreaming ? (
                        <div className="flex items-center gap-2">
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          <span>{message.content || 'Processing...'}</span>
                        </div>
                      ) : (
                        <div>{message.content}</div>
                      )}
                    </div>

                    {/* SQL Query Display */}
                    {message.sqlQuery && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500">Generated SQL:</span>
                          <button
                            onClick={() => handleCopy(message.sqlQuery!, message.id)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            {copiedId === message.id ? (
                              <CheckIcon className="h-4 w-4 text-green-500" />
                            ) : (
                              <ClipboardDocumentIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">
                          <code>{message.sqlQuery}</code>
                        </pre>
                      </div>
                    )}

                    {/* Results Display */}
                    {message.results && message.results.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500">
                            Results ({message.results.length} rows)
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleResultsExpanded(message.id)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              <ChevronDownIcon 
                                className={`h-4 w-4 transition-transform ${
                                  expandedResults.has(message.id) ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                            <button
                              onClick={() => handleExport(message)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        
                        {expandedResults.has(message.id) && (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="bg-gray-100">
                                  {Object.keys(message.results[0]).map(key => (
                                    <th key={key} className="px-2 py-1 text-left font-medium text-gray-700">
                                      {key}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {message.results.slice(0, 10).map((row, idx) => (
                                  <tr key={idx} className="border-t border-gray-100">
                                    {Object.values(row).map((value: any, vIdx) => (
                                      <td key={vIdx} className="px-2 py-1 text-gray-600">
                                        {value?.toString() || '-'}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {message.results.length > 10 && (
                              <p className="text-xs text-gray-500 mt-2">
                                Showing first 10 rows. Export to see all results.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Citations */}
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <span className="text-xs font-medium text-gray-500">Sources:</span>
                        <div className="mt-1 space-y-1">
                          {message.citations.map((citation, idx) => (
                            <div key={idx} className="text-xs text-gray-600">
                              [{idx + 1}] {citation}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="mt-2 text-xs text-gray-400">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="px-6 py-4 border-t border-gray-200">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="Ask about your phone data..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              disabled={isLoading}
            />
            <div className="flex flex-col gap-2">
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
