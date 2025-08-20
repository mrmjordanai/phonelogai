import { useMemo } from 'react';
import { useContactSearch } from './useMockContactIntelligence';
import { ContactSearchFilters } from '../localTypes';
import { ContactFiltersState } from '../types';

interface UseContactsOptions {
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export function useContacts(
  filters: ContactFiltersState,
  options: UseContactsOptions = {}
) {
  const { enabled = true, limit = 50, offset = 0 } = options;

  // Convert screen filters to API filters
  const searchFilters: ContactSearchFilters = useMemo(() => ({
    search_term: filters.searchTerm || '',
    tag_filter: filters.selectedTags || [],
    sort_by: filters.sortBy || 'relevance',
    limit,
    offset
  }), [filters.searchTerm, filters.selectedTags, filters.sortBy, limit, offset]);

  const {
    data: contacts,
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useContactSearch(searchFilters, {
    enabled,
    keepPreviousData: true
  });

  // Sort contacts by direction if needed
  const sortedContacts = useMemo(() => {
    if (!contacts || !contacts.length) return [];
    
    const sorted = [...contacts];
    
    if (filters.sortDirection === 'desc') {
      return sorted.reverse();
    }
    
    return sorted;
  }, [contacts, filters.sortDirection]);

  // Filter by company if specified
  const filteredContacts = useMemo(() => {
    if (!filters.companyFilter || !sortedContacts.length) {
      return sortedContacts;
    }
    
    return sortedContacts.filter(contact => 
      contact.company?.toLowerCase().includes(filters.companyFilter!.toLowerCase())
    );
  }, [sortedContacts, filters.companyFilter]);

  // Get unique tags for filter options
  const availableTags = useMemo(() => {
    if (!contacts || !contacts.length) return [];
    
    const tagSet = new Set<string>();
    contacts.forEach(contact => {
      contact.tags?.forEach((tag: string) => tagSet.add(tag));
    });
    
    return Array.from(tagSet).sort();
  }, [contacts]);

  // Get unique companies for filter options
  const availableCompanies = useMemo(() => {
    if (!contacts || !contacts.length) return [];
    
    const companySet = new Set<string>();
    contacts.forEach(contact => {
      if (contact.company) {
        companySet.add(contact.company);
      }
    });
    
    return Array.from(companySet).sort();
  }, [contacts]);

  return {
    contacts: filteredContacts || [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    availableTags,
    availableCompanies,
    hasNextPage: (contacts?.length || 0) >= limit,
    isEmpty: !isLoading && (!filteredContacts || filteredContacts.length === 0),
    hasFilters: !!(
      filters.searchTerm || 
      filters.selectedTags?.length || 
      filters.companyFilter
    )
  };
}