import React, { useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactFiltersState } from '../types';

const FILTERS_STORAGE_KEY = 'contacts_screen_filters';

const DEFAULT_FILTERS: ContactFiltersState = {
  searchTerm: '',
  selectedTags: [],
  sortBy: 'relevance',
  sortDirection: 'asc',
  companyFilter: undefined,
  dateRange: undefined,
};

export function useContactFilters() {
  const [filters, setFilters] = useState<ContactFiltersState>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);

  // Load filters from storage on mount
  const loadFilters = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const parsedFilters = JSON.parse(stored);
        // Don't persist search term across app restarts
        setFilters({
          ...parsedFilters,
          searchTerm: '',
        });
      }
    } catch (error) {
      console.warn('Failed to load contact filters from storage:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save filters to storage (excluding search term)
  const saveFilters = useCallback(async (newFilters: ContactFiltersState) => {
    try {
      const filtersToSave = {
        ...newFilters,
        searchTerm: '', // Don't persist search term
      };
      await AsyncStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filtersToSave));
    } catch (error) {
      console.warn('Failed to save contact filters to storage:', error);
    }
  }, []);

  // Update filters
  const updateFilters = useCallback((updates: Partial<ContactFiltersState>) => {
    setFilters(prev => {
      const newFilters = { ...prev, ...updates };
      
      // Save to storage (async, don't wait)
      saveFilters(newFilters);
      
      return newFilters;
    });
  }, [saveFilters]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    saveFilters(DEFAULT_FILTERS);
  }, [saveFilters]);

  // Reset to default but keep search term
  const resetFilters = useCallback(() => {
    setFilters(prev => ({
      ...DEFAULT_FILTERS,
      searchTerm: prev.searchTerm, // Keep current search
    }));
    saveFilters(DEFAULT_FILTERS);
  }, [saveFilters]);

  // Toggle sort direction
  const toggleSortDirection = useCallback(() => {
    updateFilters({
      sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc'
    });
  }, [filters.sortDirection, updateFilters]);

  // Add/remove tag from selection
  const toggleTag = useCallback((tag: string) => {
    const newTags = filters.selectedTags.includes(tag)
      ? filters.selectedTags.filter(t => t !== tag)
      : [...filters.selectedTags, tag];
    
    updateFilters({ selectedTags: newTags });
  }, [filters.selectedTags, updateFilters]);

  // Check if filters are applied (excluding search)
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.selectedTags.length > 0 ||
      filters.companyFilter ||
      filters.dateRange ||
      (filters.sortBy !== 'relevance' || filters.sortDirection !== 'asc')
    );
  }, [filters]);

  // Check if any filters are applied (including search)
  const hasAnyFilters = useMemo(() => {
    return !!(filters.searchTerm || hasActiveFilters);
  }, [filters.searchTerm, hasActiveFilters]);

  // Load filters on mount
  React.useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  return {
    filters,
    isLoading,
    updateFilters,
    clearFilters,
    resetFilters,
    toggleSortDirection,
    toggleTag,
    hasActiveFilters,
    hasAnyFilters,
    
    // Convenience methods
    setSearchTerm: (searchTerm: string) => updateFilters({ searchTerm }),
    setSortBy: (sortBy: ContactFiltersState['sortBy']) => updateFilters({ sortBy }),
    setCompanyFilter: (companyFilter: string | undefined) => updateFilters({ companyFilter }),
    setDateRange: (dateRange: ContactFiltersState['dateRange']) => updateFilters({ dateRange }),
  };
}