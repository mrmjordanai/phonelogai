// QueryInput Component
// Input field with suggestions and auto-complete for NLQ queries

'use client'

import React, { useState, useRef, useEffect } from 'react'
import { 
  PaperAirplaneIcon, 
  ChatBubbleLeftRightIcon, 
  LightBulbIcon
} from '@heroicons/react/24/outline'
import { QueryInputProps, QuerySuggestion, QUERY_LIMITS } from './types'

export const QueryInput: React.FC<QueryInputProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading,
  suggestions,
  placeholder = "Ask anything about your phone data...",
  disabled = false
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const filteredSuggestions = suggestions.filter(suggestion =>
    value.length > 2 && 
    suggestion.text.toLowerCase().includes(value.toLowerCase())
  ).slice(0, 5)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim() || isLoading || disabled) return
    
    onSubmit(value.trim())
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
  }

  const handleSuggestionClick = (suggestion: QuerySuggestion) => {
    onChange(suggestion.text)
    onSubmit(suggestion.text)
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
    inputRef.current?.focus()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    if (newValue.length <= QUERY_LIMITS.MAX_QUERY_LENGTH) {
      onChange(newValue)
      setShowSuggestions(newValue.length > 2 && filteredSuggestions.length > 0)
      setSelectedSuggestionIndex(-1)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredSuggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        if (selectedSuggestionIndex >= 0) {
          e.preventDefault()
          handleSuggestionClick(filteredSuggestions[selectedSuggestionIndex])
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  const handleInputFocus = () => {
    if (value.length > 2 && filteredSuggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  const handleInputBlur = (_e: React.FocusEvent) => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
      }
    }, 150)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current && 
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const characterCount = value.length
  const isNearLimit = characterCount > QUERY_LIMITS.MAX_QUERY_LENGTH * 0.8

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="space-y-2">
        {/* Main Input */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <ChatBubbleLeftRightIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
              autoComplete="off"
            />
          </div>
          
          <button
            type="submit"
            disabled={!value.trim() || isLoading || disabled}
            className="inline-flex items-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="animate-spin h-4 w-4 border border-white border-t-transparent rounded-full"></div>
            ) : (
              <PaperAirplaneIcon className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Character Count */}
        {isNearLimit && (
          <div className="flex justify-end">
            <span className={`text-xs ${
              characterCount >= QUERY_LIMITS.MAX_QUERY_LENGTH 
                ? 'text-red-600' 
                : 'text-gray-500'
            }`}>
              {characterCount}/{QUERY_LIMITS.MAX_QUERY_LENGTH}
            </span>
          </div>
        )}

        {/* Suggestions Dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div 
            ref={suggestionsRef}
            className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto"
          >
            <div className="p-2">
              <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500">
                <LightBulbIcon className="h-3 w-3" />
                Suggestions
              </div>
              {filteredSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm rounded-sm transition-colors ${
                    index === selectedSuggestionIndex
                      ? 'bg-blue-50 text-blue-900'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <div className="font-medium">{suggestion.text}</div>
                  {suggestion.category && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {suggestion.category}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  )
}