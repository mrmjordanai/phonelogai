import React, { useState, useCallback, useMemo } from 'react';
import { ContactSearchResult } from '../localTypes';
import { useContacts } from './useContacts';
import { ContactFiltersState } from '../types';

interface UseInfiniteScrollOptions {
  pageSize?: number;
  threshold?: number;
}

export function useInfiniteScroll(
  filters: ContactFiltersState,
  options: UseInfiniteScrollOptions = {}
) {
  const { pageSize = 50 } = options;
  const [currentPage, setCurrentPage] = useState(0);
  const [allContacts, setAllContacts] = useState<ContactSearchResult[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Calculate offset for current page
  const offset = currentPage * pageSize;

  // Fetch current page
  const {
    contacts: currentPageContacts,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    availableTags,
    availableCompanies
  } = useContacts(filters, {
    limit: pageSize,
    offset
  });

  // Merge new contacts with existing ones
  const mergedContacts = useMemo(() => {
    if (currentPage === 0) {
      // First page or filter change - replace all contacts
      return currentPageContacts;
    } else {
      // Subsequent pages - append to existing
      const existingIds = new Set(allContacts.map(c => c.contact_id));
      const newContacts = currentPageContacts.filter(c => !existingIds.has(c.contact_id));
      return [...allContacts, ...newContacts];
    }
  }, [currentPageContacts, allContacts, currentPage]);

  // Update stored contacts when merged contacts change
  React.useEffect(() => {
    if (!isLoading && currentPageContacts.length > 0) {
      setAllContacts(mergedContacts);
      setIsLoadingMore(false);
    }
  }, [mergedContacts, isLoading, currentPageContacts.length]);

  // Reset pagination when filters change
  React.useEffect(() => {
    setCurrentPage(0);
    setAllContacts([]);
  }, [filters.searchTerm, filters.selectedTags, filters.sortBy, filters.companyFilter]);

  // Load next page
  const loadMore = useCallback(() => {
    if (!hasNextPage || isLoading || isLoadingMore) return;
    
    setIsLoadingMore(true);
    setCurrentPage(prev => prev + 1);
  }, [hasNextPage, isLoading, isLoadingMore]);

  // Handle end reached for FlatList
  const onEndReached = useCallback(() => {
    loadMore();
  }, [loadMore]);

  // Refresh - reset to first page
  const refresh = useCallback(() => {
    setCurrentPage(0);
    setAllContacts([]);
    return refetch();
  }, [refetch]);

  return {
    contacts: mergedContacts,
    isLoading: isLoading && currentPage === 0, // Only show loading for first page
    isLoadingMore,
    isError,
    error,
    hasNextPage,
    availableTags,
    availableCompanies,
    onEndReached,
    loadMore,
    refresh,
    currentPage,
    totalLoaded: mergedContacts.length,
  };
}