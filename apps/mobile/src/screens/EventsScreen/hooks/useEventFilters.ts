import { useState, useCallback, useEffect, useRef } from 'react';
import { EventFilters, QuickFilter, SearchSuggestion } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDebouncedCallback } from './useDebounce';

const FILTERS_STORAGE_KEY = 'events_filters_v1';
const SEARCH_HISTORY_KEY = 'events_search_history';
const MAX_SEARCH_HISTORY = 10;

interface UseEventFiltersProps {
  initialFilters?: Partial<EventFilters>;
  persistFilters?: boolean;
  onFiltersChange?: (filters: EventFilters) => void;
  debounceMs?: number;
}

interface UseEventFiltersReturn {
  filters: EventFilters;
  isFiltersActive: boolean;
  searchSuggestions: SearchSuggestion[];
  quickFilters: QuickFilter[];
  
  // Filter actions
  updateFilters: (updates: Partial<EventFilters>) => void;
  updateSearch: (search: string) => void;
  clearFilters: () => void;
  resetToDefaults: () => void;
  
  // Quick filters
  applyQuickFilter: (quickFilter: QuickFilter) => void;
  
  // Search management
  addToSearchHistory: (search: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
  getSearchSuggestions: (query: string) => SearchSuggestion[];
  
  // Persistence
  saveFilters: () => Promise<void>;
  loadFilters: () => Promise<void>;
}

const DEFAULT_FILTERS: EventFilters = {
  search: '',
  type: 'all',
  direction: 'all',
  status: 'all',
  dateRange: {},
  durationRange: undefined,
  contactId: undefined
};

const QUICK_FILTERS: QuickFilter[] = [
  {
    id: 'today',
    name: 'Today',
    icon: 'calendar-day',
    filters: {
      dateRange: {
        start: new Date(new Date().setHours(0, 0, 0, 0)),
        end: new Date(new Date().setHours(23, 59, 59, 999))
      }
    }
  },
  {
    id: 'missed_calls',
    name: 'Missed Calls',
    icon: 'phone-missed',
    filters: {
      type: 'call',
      status: 'missed'
    }
  },
  {
    id: 'recent_week',
    name: 'This Week',
    icon: 'calendar-week',
    filters: {
      dateRange: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date()
      }
    }
  },
  {
    id: 'outbound_calls',
    name: 'Outbound Calls',
    icon: 'phone-outgoing',
    filters: {
      type: 'call',
      direction: 'outbound'
    }
  },
  {
    id: 'long_calls',
    name: 'Long Calls',
    icon: 'phone-clock',
    filters: {
      type: 'call',
      durationRange: {
        min: 300 // 5+ minutes
      }
    }
  },
  {
    id: 'text_messages',
    name: 'Text Messages',
    icon: 'message-text',
    filters: {
      type: 'sms'
    }
  }
];

export function useEventFilters({
  initialFilters = {},
  persistFilters = true,
  onFiltersChange,
  debounceMs = 300
}: UseEventFiltersProps = {}): UseEventFiltersReturn {
  const [filters, setFilters] = useState<EventFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters
  });
  
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const quickFilters = QUICK_FILTERS;
  
  const isInitialized = useRef(false);
  const lastSavedFilters = useRef<EventFilters>(filters);

  // Debounced callback for filters change
  const debouncedFiltersChange = useDebouncedCallback(
    (newFilters: EventFilters) => {
      onFiltersChange?.(newFilters);
    },
    debounceMs
  );

  // Check if filters are different from defaults
  const isFiltersActive = useCallback(() => {
    const activeChecks = [
      filters.search.trim() !== '',
      filters.type !== 'all',
      filters.direction !== 'all',
      filters.status !== 'all',
      filters.contactId !== undefined,
      filters.dateRange.start !== undefined || filters.dateRange.end !== undefined,
      filters.durationRange !== undefined
    ];
    
    return activeChecks.some(check => check);
  }, [filters]);

  // Update filters with validation and normalization
  const updateFilters = useCallback((updates: Partial<EventFilters>) => {
    setFilters(prevFilters => {
      const newFilters = { ...prevFilters, ...updates };
      
      // Normalize filters
      if (newFilters.type === 'sms' && newFilters.status !== 'all') {
        // SMS doesn't have call statuses
        newFilters.status = 'all';
      }
      
      if (newFilters.type === 'sms' && newFilters.durationRange) {
        // SMS doesn't have duration
        newFilters.durationRange = undefined;
      }
      
      // Validate date range
      if (newFilters.dateRange.start && newFilters.dateRange.end) {
        if (newFilters.dateRange.start > newFilters.dateRange.end) {
          newFilters.dateRange.start = newFilters.dateRange.end;
        }
      }
      
      // Validate duration range
      if (newFilters.durationRange) {
        if (newFilters.durationRange.min && newFilters.durationRange.max) {
          if (newFilters.durationRange.min > newFilters.durationRange.max) {
            newFilters.durationRange.min = newFilters.durationRange.max;
          }
        }
      }
      
      // Trigger debounced callback
      debouncedFiltersChange(newFilters);
      
      return newFilters;
    });
  }, [debouncedFiltersChange]);

  // Update search with suggestions
  const updateSearch = useCallback((search: string) => {
    updateFilters({ search });
    
    // Update search suggestions
    if (search.trim()) {
      const suggestions = getSearchSuggestions(search);
      setSearchSuggestions(suggestions);
    } else {
      setSearchSuggestions([]);
    }
  }, [updateFilters]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearchSuggestions([]);
    debouncedFiltersChange(DEFAULT_FILTERS);
  }, [debouncedFiltersChange]);

  // Reset to defaults but keep persistence
  const resetToDefaults = useCallback(() => {
    clearFilters();
    if (persistFilters) {
      saveFilters();
    }
  }, [clearFilters, persistFilters]);

  // Apply quick filter
  const applyQuickFilter = useCallback((quickFilter: QuickFilter) => {
    // If quick filter matches current filters, clear them
    const currentlyActive = Object.entries(quickFilter.filters).every(([key, value]) => {
      const currentValue = filters[key as keyof EventFilters];
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return JSON.stringify(currentValue) === JSON.stringify(value);
      }
      return currentValue === value;
    });
    
    if (currentlyActive) {
      clearFilters();
    } else {
      updateFilters(quickFilter.filters);
    }
  }, [filters, updateFilters, clearFilters]);

  // Search history management
  const loadSearchHistory = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (stored) {
        const history = JSON.parse(stored);
        setSearchHistory(Array.isArray(history) ? history : []);
      }
    } catch (error) {
      console.warn('Failed to load search history:', error);
    }
  }, []);

  const addToSearchHistory = useCallback(async (search: string) => {
    if (!search.trim() || search.length < 2) return;
    
    const normalizedSearch = search.trim().toLowerCase();
    
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== normalizedSearch);
      const updated = [search.trim(), ...filtered].slice(0, MAX_SEARCH_HISTORY);
      
      // Save to storage
      AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated))
        .catch(error => console.warn('Failed to save search history:', error));
      
      return updated;
    });
  }, []);

  const clearSearchHistory = useCallback(async () => {
    setSearchHistory([]);
    try {
      await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (error) {
      console.warn('Failed to clear search history:', error);
    }
  }, []);

  // Generate search suggestions
  const getSearchSuggestions = useCallback((query: string): SearchSuggestion[] => {
    if (!query.trim()) return [];
    
    const suggestions: SearchSuggestion[] = [];
    const normalizedQuery = query.toLowerCase().trim();
    
    // Add recent search history
    const historySuggestions = searchHistory
      .filter(item => item.toLowerCase().includes(normalizedQuery))
      .slice(0, 3)
      .map(item => ({
        type: 'recent' as const,
        value: item,
        display: item
      }));
    
    suggestions.push(...historySuggestions);
    
    // Add phone number suggestion if query looks like a number
    if (/^[\d\s\-\+\(\)]+$/.test(query)) {
      suggestions.push({
        type: 'number',
        value: query,
        display: `Search for "${query}"`
      });
    }
    
    // Limit total suggestions
    return suggestions.slice(0, 5);
  }, [searchHistory]);

  // Persistence
  const saveFilters = useCallback(async () => {
    if (!persistFilters) return;
    
    try {
      // Only save if filters have changed
      if (JSON.stringify(filters) === JSON.stringify(lastSavedFilters.current)) {
        return;
      }
      
      // Don't save search query or very short term filters
      const filtersToSave = {
        ...filters,
        search: '', // Don't persist search queries
        dateRange: {
          // Don't persist "today" type filters
          start: undefined,
          end: undefined
        }
      };
      
      await AsyncStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filtersToSave));
      lastSavedFilters.current = filters;
    } catch (error) {
      console.warn('Failed to save filters:', error);
    }
  }, [filters, persistFilters]);

  const loadFilters = useCallback(async () => {
    if (!persistFilters) return;
    
    try {
      const stored = await AsyncStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const savedFilters = JSON.parse(stored);
        
        // Merge with defaults to handle schema changes
        const mergedFilters = {
          ...DEFAULT_FILTERS,
          ...savedFilters,
          search: '', // Always start with empty search
          dateRange: {} // Don't restore date ranges
        };
        
        setFilters(mergedFilters);
        lastSavedFilters.current = mergedFilters;
      }
    } catch (error) {
      console.warn('Failed to load filters:', error);
    }
  }, [persistFilters]);

  // Initialize
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;
    
    const initialize = async () => {
      await Promise.all([
        loadFilters(),
        loadSearchHistory()
      ]);
    };
    
    initialize();
  }, [loadFilters, loadSearchHistory]);

  // Auto-save filters when they change
  useEffect(() => {
    if (!isInitialized.current) return;
    
    const autoSave = async () => {
      await saveFilters();
    };
    
    autoSave();
  }, [filters, saveFilters]);

  return {
    filters,
    isFiltersActive: isFiltersActive(),
    searchSuggestions,
    quickFilters,
    
    // Filter actions
    updateFilters,
    updateSearch,
    clearFilters,
    resetToDefaults,
    
    // Quick filters
    applyQuickFilter,
    
    // Search management
    addToSearchHistory,
    clearSearchHistory,
    getSearchSuggestions,
    
    // Persistence
    saveFilters,
    loadFilters
  };
}