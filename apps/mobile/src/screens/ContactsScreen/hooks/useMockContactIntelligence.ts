// Mock implementation of contact intelligence hooks for local development
// This bypasses the complex dependency issues while maintaining the same API

import { useState, useEffect } from 'react';
import { ContactIntelligence, ContactSearchResult, ContactSearchFilters } from '../localTypes';

// Mock data for testing
const mockContactsData: ContactSearchResult[] = [
  {
    contact_id: '1',
    number: '+1-555-0101',
    name: 'John Smith',
    company: 'Tech Corp',
    tags: ['work', 'important'],
    total_interactions: 45,
    last_contact: '2024-01-15T10:30:00Z',
    contact_score: 0.9,
    match_score: 0.95,
    privacy_level: 'team',
    can_access: true,
  },
  {
    contact_id: '2',
    number: '+1-555-0102',
    name: 'Sarah Johnson',
    company: 'Design Studio',
    tags: ['client', 'project'],
    total_interactions: 32,
    last_contact: '2024-01-14T15:20:00Z',
    contact_score: 0.8,
    match_score: 0.88,
    privacy_level: 'public',
    can_access: true,
  },
  {
    contact_id: '3',
    number: '+1-555-0103',
    name: 'Mike Davis',
    company: 'Sales Inc',
    tags: ['vendor', 'supplies'],
    total_interactions: 18,
    last_contact: '2024-01-12T09:45:00Z',
    contact_score: 0.6,
    match_score: 0.72,
    privacy_level: 'team',
    can_access: true,
  },
  {
    contact_id: '4',
    number: '+1-555-0104',
    name: 'Emily Brown',
    company: 'Marketing Pro',
    tags: ['marketing', 'campaign'],
    total_interactions: 67,
    last_contact: '2024-01-16T14:10:00Z',
    contact_score: 0.95,
    match_score: 0.92,
    privacy_level: 'public',
    can_access: true,
  },
  {
    contact_id: '5',
    number: '+1-555-0105',
    name: 'Personal Contact',
    company: undefined,
    tags: ['personal', 'family'],
    total_interactions: 123,
    last_contact: '2024-01-16T18:30:00Z',
    contact_score: 1.0,
    match_score: 1.0,
    privacy_level: 'private',
    can_access: true,
  },
];

const mockContactIntelligence: { [key: string]: ContactIntelligence } = {
  '1': {
    contact: {
      id: '1',
      number: '+1-555-0101',
      name: 'John Smith',
      company: 'Tech Corp',
      tags: ['work', 'important'],
      first_seen: '2023-06-01T00:00:00Z',
      last_seen: '2024-01-15T10:30:00Z',
      total_calls: 28,
      total_sms: 17,
    },
    metrics: {
      total_interactions: 45,
      total_calls: 28,
      total_sms: 17,
      avg_call_duration: 320,
      most_active_hour: 14,
      most_active_day: 2,
      last_contact: '2024-01-15T10:30:00Z',
      first_contact: '2023-06-01T09:15:00Z',
      contact_frequency: 1.2,
      inbound_ratio: 0.6,
    },
    communication_patterns: {
      hourly_patterns: [
        { hour: 9, count: 8 },
        { hour: 10, count: 12 },
        { hour: 14, count: 15 },
        { hour: 16, count: 10 },
      ],
      daily_patterns: [
        { day: 1, count: 12 },
        { day: 2, count: 18 },
        { day: 3, count: 15 },
      ],
      monthly_trends: [
        { month: '2024-01', total: 8, calls: 5, sms: 3 },
        { month: '2023-12', total: 12, calls: 7, sms: 5 },
      ],
    },
    recent_events: [],
    privacy_level: 'team',
    can_edit: true,
  },
};

// Mock hook for contact intelligence
export function useContactIntelligence(contactId?: string) {
  const [data, setData] = useState<ContactIntelligence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!contactId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setError(null);

    // Simulate API call delay
    const timer = setTimeout(() => {
      const intelligence = mockContactIntelligence[contactId];
      if (intelligence) {
        setData(intelligence);
      } else {
        setIsError(true);
        setError(new Error('Contact not found'));
      }
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [contactId]);

  return {
    data,
    isLoading,
    isError,
    error,
  };
}

// Mock hook for contact search
export function useContactSearch(
  filters: ContactSearchFilters,
  options?: {
    enabled?: boolean;
    keepPreviousData?: boolean;
  }
) {
  const [data, setData] = useState<ContactSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (options?.enabled === false) {
      return;
    }

    setIsLoading(true);
    setIsFetching(true);
    setIsError(false);
    setError(null);

    // Simulate API call delay
    const timer = setTimeout(() => {
      let filteredData = [...mockContactsData];

      // Apply search filter
      if (filters.search_term) {
        const searchTerm = filters.search_term.toLowerCase();
        filteredData = filteredData.filter(
          contact =>
            contact.name?.toLowerCase().includes(searchTerm) ||
            contact.number.includes(searchTerm) ||
            contact.company?.toLowerCase().includes(searchTerm) ||
            contact.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
      }

      // Apply tag filter
      if (filters.tag_filter.length > 0) {
        filteredData = filteredData.filter(contact =>
          filters.tag_filter.some(tag => contact.tags.includes(tag))
        );
      }

      // Apply sorting
      if (filters.sort_by === 'name') {
        filteredData.sort((a, b) => (a.name || a.number).localeCompare(b.name || b.number));
      } else if (filters.sort_by === 'last_contact') {
        filteredData.sort((a, b) => {
          const dateA = new Date(a.last_contact || 0).getTime();
          const dateB = new Date(b.last_contact || 0).getTime();
          return dateB - dateA;
        });
      } else if (filters.sort_by === 'interaction_frequency') {
        filteredData.sort((a, b) => b.total_interactions - a.total_interactions);
      }

      // Apply pagination
      const startIndex = filters.offset || 0;
      const endIndex = startIndex + (filters.limit || 50);
      filteredData = filteredData.slice(startIndex, endIndex);

      setData(filteredData);
      setIsLoading(false);
      setIsFetching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    filters.search_term,
    filters.tag_filter,
    filters.sort_by,
    filters.limit,
    filters.offset,
    options?.enabled
  ]);

  const refetch = () => {
    // Trigger a re-fetch
    setIsLoading(true);
    setIsFetching(true);
  };

  return {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
}