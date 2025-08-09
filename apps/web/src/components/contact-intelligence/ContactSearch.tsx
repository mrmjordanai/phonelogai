import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebouncedContactSearch } from '@phonelogai/shared/hooks/useContactIntelligence';
import { ContactSearchFilters, ContactSearchResult } from '@phonelogai/types';
import { VirtualizedContactList } from './VirtualizedContactList';

interface ContactSearchProps {
  searchFilters: ContactSearchFilters;
  onFiltersChange: (filters: ContactSearchFilters) => void;
  selectedContactId?: string;
  onContactSelect: (contactId: string) => void;
  teamView: boolean;
  className?: string;
}

export function ContactSearch({
  searchFilters,
  onFiltersChange,
  selectedContactId,
  onContactSelect,
  teamView,
  className = ''
}: ContactSearchProps) {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchFilters.search_term);
  const [tagInput, setTagInput] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // Debounced search with the hook
  const { data: searchResults = [], isLoading, error } = useDebouncedContactSearch(
    localSearchTerm,
    searchFilters.tag_filter,
    searchFilters.sort_by
  );

  // Available tags from search results for autocomplete
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    searchResults.forEach(contact => {
      contact.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [searchResults]);

  // Filtered tags for dropdown
  const filteredTags = useMemo(() => {
    return availableTags.filter(tag => 
      tag.toLowerCase().includes(tagInput.toLowerCase()) &&
      !searchFilters.tag_filter.includes(tag)
    );
  }, [availableTags, tagInput, searchFilters.tag_filter]);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearchTerm(value);
    onFiltersChange({
      ...searchFilters,
      search_term: value,
      offset: 0 // Reset pagination
    });
  }, [searchFilters, onFiltersChange]);

  const handleSortChange = useCallback((sortBy: ContactSearchFilters['sort_by']) => {
    onFiltersChange({
      ...searchFilters,
      sort_by: sortBy,
      offset: 0
    });
  }, [searchFilters, onFiltersChange]);

  const handleTagAdd = useCallback((tag: string) => {
    if (!searchFilters.tag_filter.includes(tag)) {
      onFiltersChange({
        ...searchFilters,
        tag_filter: [...searchFilters.tag_filter, tag],
        offset: 0
      });
    }
    setTagInput('');
    setShowTagDropdown(false);
  }, [searchFilters, onFiltersChange]);

  const handleTagRemove = useCallback((tag: string) => {
    onFiltersChange({
      ...searchFilters,
      tag_filter: searchFilters.tag_filter.filter(t => t !== tag),
      offset: 0
    });
  }, [searchFilters, onFiltersChange]);

  const handleLoadMore = useCallback(() => {
    onFiltersChange({
      ...searchFilters,
      offset: searchFilters.offset + searchFilters.limit
    });
  }, [searchFilters, onFiltersChange]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Search Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={localSearchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search contacts..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            {isLoading && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>

          {/* Tag Filter */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">Filter by tags</label>
            
            {/* Selected Tags */}
            {searchFilters.tag_filter.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {searchFilters.tag_filter.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                    <button
                      onClick={() => handleTagRemove(tag)}
                      className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-600 hover:bg-blue-200 hover:text-blue-800 focus:outline-none"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tag Input */}
            <div className="relative">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onFocus={() => setShowTagDropdown(true)}
                onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
                placeholder="Add tag filter..."
                className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              
              {/* Tag Dropdown */}
              {showTagDropdown && filteredTags.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-32 overflow-auto">
                  {filteredTags.slice(0, 10).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleTagAdd(tag)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sort Options */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sort by</label>
            <select
              value={searchFilters.sort_by}
              onChange={(e) => handleSortChange(e.target.value as ContactSearchFilters['sort_by'])}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="relevance">Relevance</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="recent">Recent Contact</option>
              <option value="most_active">Most Active</option>
            </select>
          </div>
        </div>
      </div>

      {/* Search Results */}
      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="p-4 text-center text-red-600">
            <p className="text-sm">Error loading contacts: {error.message}</p>
          </div>
        ) : searchResults.length === 0 && !isLoading ? (
          <div className="p-4 text-center text-gray-500">
            <div className="mx-auto h-8 w-8 text-gray-400 mb-2">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm">
              {localSearchTerm || searchFilters.tag_filter.length > 0 
                ? 'No contacts found matching your search criteria'
                : 'No contacts available'
              }
            </p>
          </div>
        ) : (
          <VirtualizedContactList
            contacts={searchResults}
            selectedContactId={selectedContactId}
            onContactSelect={onContactSelect}
            onLoadMore={handleLoadMore}
            hasMore={searchResults.length >= searchFilters.limit}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}