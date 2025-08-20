/**
 * useQuerySuggestions Hook
 * Dynamic query suggestions based on context and user behavior
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { QuerySuggestion, ChatHistoryItem } from '../types';
import MockNlqService from '../services/MockNlqService';

interface UseQuerySuggestionsOptions {
  maxSuggestions?: number;
  enablePersonalization?: boolean;
  enableContextAware?: boolean;
  refreshInterval?: number;
}

interface SuggestionContext {
  recentQueries: string[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
  hasHistory: boolean;
}

export function useQuerySuggestions(
  chatHistory: ChatHistoryItem[] = [],
  options: UseQuerySuggestionsOptions = {}
) {
  const {
    maxSuggestions = 6,
    enablePersonalization = true,
    enableContextAware = true,
    refreshInterval = 5 * 60 * 1000 // 5 minutes
  } = options;

  const [suggestions, setSuggestions] = useState<QuerySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const mockService = useMemo(() => MockNlqService.getInstance(), []);

  // Generate context for personalized suggestions
  const generateContext = useCallback((): SuggestionContext => {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Determine time of day
    let timeOfDay: SuggestionContext['timeOfDay'];
    if (hour < 6) timeOfDay = 'night';
    else if (hour < 12) timeOfDay = 'morning';
    else if (hour < 18) timeOfDay = 'afternoon';
    else if (hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    // Determine day type
    const dayType: SuggestionContext['dayOfWeek'] = 
      (dayOfWeek === 0 || dayOfWeek === 6) ? 'weekend' : 'weekday';

    // Get recent queries for context
    const recentQueries = chatHistory
      .slice(0, 10)
      .map(item => item.query);

    return {
      recentQueries,
      timeOfDay,
      dayOfWeek: dayType,
      hasHistory: chatHistory.length > 0
    };
  }, [chatHistory]);

  // Get base suggestions from service
  const getBaseSuggestions = useCallback((): QuerySuggestion[] => {
    const context = generateContext();
    return mockService.getSuggestions(
      enableContextAware ? JSON.stringify(context) : undefined
    );
  }, [mockService, generateContext, enableContextAware]);

  // Personalize suggestions based on user history
  const personalizeSuggestions = useCallback((
    baseSuggestions: QuerySuggestion[],
    context: SuggestionContext
  ): QuerySuggestion[] => {
    if (!enablePersonalization || !context.hasHistory) {
      return baseSuggestions;
    }

    // Score suggestions based on user behavior
    const scoredSuggestions = baseSuggestions.map(suggestion => {
      let score = suggestion.popularity || 0;

      // Boost score if user has asked similar queries
      const similarityBoost = context.recentQueries.some(query =>
        query.toLowerCase().includes(suggestion.category) ||
        suggestion.query.toLowerCase().includes(query.toLowerCase().split(' ')[0])
      ) ? 20 : 0;

      // Time-based adjustments
      if (context.timeOfDay === 'morning' && suggestion.category === 'recent') {
        score += 10; // Boost recent activity in morning
      }
      
      if (context.dayOfWeek === 'weekend' && suggestion.category === 'analytics') {
        score += 15; // Boost analytics on weekends
      }

      return {
        ...suggestion,
        popularity: score + similarityBoost
      };
    });

    // Sort by score and return top suggestions
    return scoredSuggestions
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, maxSuggestions);
  }, [enablePersonalization, maxSuggestions]);

  // Generate contextual suggestions
  const generateContextualSuggestions = useCallback((context: SuggestionContext): QuerySuggestion[] => {
    const contextualSuggestions: QuerySuggestion[] = [];

    // Add suggestions based on time of day
    if (context.timeOfDay === 'morning') {
      contextualSuggestions.push({
        id: 'morning-activity',
        title: 'Morning Activity',
        description: 'Check your calls from yesterday evening',
        query: 'Show me calls from yesterday evening after 6 PM',
        category: 'recent',
        popularity: 70
      });
    }

    // Add suggestions based on day of week
    if (context.dayOfWeek === 'weekend') {
      contextualSuggestions.push({
        id: 'weekend-stats',
        title: 'Weekend Stats',
        description: 'Analyze your weekend communication patterns',
        query: 'Show me my weekend call and message activity',
        category: 'analytics',
        popularity: 85
      });
    }

    // Add suggestions based on history
    if (context.hasHistory) {
      const recentCategories = context.recentQueries.map(query => {
        if (query.toLowerCase().includes('call')) return 'calls';
        if (query.toLowerCase().includes('message') || query.toLowerCase().includes('sms')) return 'sms';
        if (query.toLowerCase().includes('contact')) return 'contacts';
        return 'analytics';
      });

      const mostCommonCategory = recentCategories.reduce((a, b, i, arr) =>
        arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
      );

      if (mostCommonCategory === 'calls') {
        contextualSuggestions.push({
          id: 'call-followup',
          title: 'Call Analysis',
          description: 'Dive deeper into your call patterns',
          query: 'Analyze my call duration trends over the past week',
          category: 'analytics',
          popularity: 80
        });
      }
    }

    return contextualSuggestions;
  }, []);

  // Refresh suggestions
  const refreshSuggestions = useCallback(() => {
    setIsLoading(true);
    
    try {
      const context = generateContext();
      const baseSuggestions = getBaseSuggestions();
      const contextualSuggestions = enableContextAware 
        ? generateContextualSuggestions(context)
        : [];

      // Combine and personalize suggestions
      const allSuggestions = [...baseSuggestions, ...contextualSuggestions];
      const personalizedSuggestions = personalizeSuggestions(allSuggestions, context);

      setSuggestions(personalizedSuggestions);
      setLastRefresh(new Date());

    } catch (error) {
      console.error('Failed to refresh suggestions:', error);
      // Fallback to base suggestions
      setSuggestions(getBaseSuggestions().slice(0, maxSuggestions));
    } finally {
      setIsLoading(false);
    }
  }, [
    generateContext,
    getBaseSuggestions,
    generateContextualSuggestions,
    personalizeSuggestions,
    enableContextAware,
    maxSuggestions
  ]);

  // Auto-refresh suggestions based on interval
  useEffect(() => {
    const interval = setInterval(refreshSuggestions, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshSuggestions, refreshInterval]);

  // Initial load and refresh when history changes
  useEffect(() => {
    refreshSuggestions();
  }, [refreshSuggestions, chatHistory.length]);

  // Get suggestions by category
  const getSuggestionsByCategory = useCallback((category: string): QuerySuggestion[] => {
    return suggestions.filter(suggestion => suggestion.category === category);
  }, [suggestions]);

  // Get popular suggestions
  const getPopularSuggestions = useCallback((limit: number = 3): QuerySuggestion[] => {
    return [...suggestions]
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, limit);
  }, [suggestions]);

  // Search suggestions
  const searchSuggestions = useCallback((query: string): QuerySuggestion[] => {
    if (!query.trim()) return suggestions;

    const searchTerm = query.toLowerCase();
    return suggestions.filter(suggestion =>
      suggestion.title.toLowerCase().includes(searchTerm) ||
      suggestion.description.toLowerCase().includes(searchTerm) ||
      suggestion.query.toLowerCase().includes(searchTerm)
    );
  }, [suggestions]);

  // Add custom suggestion
  const addCustomSuggestion = useCallback((suggestion: Omit<QuerySuggestion, 'id'>): void => {
    const customSuggestion: QuerySuggestion = {
      ...suggestion,
      id: `custom-${Date.now()}`
    };

    setSuggestions(prev => [customSuggestion, ...prev].slice(0, maxSuggestions));
  }, [maxSuggestions]);

  return {
    // State
    suggestions,
    isLoading,
    lastRefresh,

    // Actions
    refreshSuggestions,
    addCustomSuggestion,

    // Queries
    getSuggestionsByCategory,
    getPopularSuggestions,
    searchSuggestions,

    // Computed values
    hasSuggestions: suggestions.length > 0,
    suggestionCount: suggestions.length,
    categories: Array.from(new Set(suggestions.map(s => s.category))),
    
    // Context info
    context: generateContext()
  };
}