import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@phonelogai/database';
import { 
  ContactIntelligence, 
  ContactSearchResult, 
  ContactPatterns,
  ContactSearchFilters,
  Contact
} from '@phonelogai/types';

// Query keys for consistent cache management
export const contactKeys = {
  all: ['contacts'] as const,
  intelligence: (contactId: string) => [...contactKeys.all, 'intelligence', contactId] as const,
  search: (filters: ContactSearchFilters) => [...contactKeys.all, 'search', filters] as const,
  patterns: (contactId: string, days: number) => [...contactKeys.all, 'patterns', contactId, days] as const,
  list: (userId: string) => [...contactKeys.all, 'list', userId] as const,
};

/**
 * Hook to fetch comprehensive contact intelligence data
 */
export function useContactIntelligence(contactId?: string) {
  return useQuery({
    queryKey: contactKeys.intelligence(contactId || ''),
    queryFn: async (): Promise<ContactIntelligence> => {
      if (!contactId) throw new Error('Contact ID is required');
      
      const { data, error } = await supabase.rpc('get_enhanced_contact_intelligence', {
        p_requesting_user_id: (await supabase.auth.getUser()).data.user?.id,
        p_target_contact_id: contactId
      });

      if (error) throw new Error(`Failed to fetch contact intelligence: ${error.message}`);
      if (!data) throw new Error('Contact intelligence data not found');

      return data as ContactIntelligence;
    },
    enabled: !!contactId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    retry: (failureCount, error) => {
      // Don't retry on access denied errors
      if (error.message.includes('Access denied')) return false;
      return failureCount < 3;
    },
  });
}

/**
 * Hook to search contacts with advanced filtering and privacy awareness
 */
export function useContactSearch(
  filters: ContactSearchFilters,
  options?: {
    enabled?: boolean;
    keepPreviousData?: boolean;
  }
) {
  return useQuery({
    queryKey: contactKeys.search(filters),
    queryFn: async (): Promise<ContactSearchResult[]> => {
      const user = await supabase.auth.getUser();
      if (!user.data.user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase.rpc('search_contacts', {
        p_user_id: user.data.user.id,
        p_search_term: filters.search_term || '',
        p_tag_filter: filters.tag_filter || [],
        p_sort_by: filters.sort_by || 'relevance',
        p_limit: filters.limit || 50,
        p_offset: filters.offset || 0
      });

      if (error) throw new Error(`Contact search failed: ${error.message}`);

      return (data || []).map((row: any) => ({
        contact_id: row.contact_id,
        number: row.number,
        name: row.name,
        company: row.company,
        tags: row.tags || [],
        total_interactions: row.total_interactions || 0,
        last_contact: row.last_contact,
        contact_score: row.contact_score || 0,
        match_score: row.match_score || 0,
        privacy_level: row.privacy_level || 'team',
        can_access: row.can_access || false
      })) as ContactSearchResult[];
    },
    enabled: options?.enabled !== false,
    placeholderData: options?.keepPreviousData ? (previousData) => previousData : undefined,
    staleTime: 2 * 60 * 1000, // 2 minutes for search results
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
}

/**
 * Hook to fetch contact communication patterns
 */
export function useContactPatterns(contactId?: string, daysBack: number = 90) {
  return useQuery({
    queryKey: contactKeys.patterns(contactId || '', daysBack),
    queryFn: async (): Promise<ContactPatterns> => {
      if (!contactId) throw new Error('Contact ID is required');
      
      const user = await supabase.auth.getUser();
      if (!user.data.user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase.rpc('get_contact_patterns', {
        p_requesting_user_id: user.data.user.id,
        p_contact_id: contactId,
        p_days_back: daysBack
      });

      if (error) throw new Error(`Failed to fetch contact patterns: ${error.message}`);
      if (!data) throw new Error('Contact patterns data not found');

      return data as ContactPatterns;
    },
    enabled: !!contactId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour (formerly cacheTime)
    retry: (failureCount, error) => {
      if (error.message.includes('Access denied')) return false;
      return failureCount < 2;
    },
  });
}

/**
 * Hook to update contact information
 */
export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { 
      contactId: string; 
      updates: Partial<Pick<Contact, 'name' | 'company' | 'tags' | 'email'>> 
    }) => {
      const { data, error } = await supabase
        .from('contacts')
        .update({
          ...params.updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.contactId)
        .select()
        .single();

      if (error) throw new Error(`Failed to update contact: ${error.message}`);
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: contactKeys.intelligence(variables.contactId) });
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

/**
 * Hook to delete a contact
 */
export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactId: string) => {
      // First check if user has permission
      const user = await supabase.auth.getUser();
      if (!user.data.user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId)
        .eq('user_id', user.data.user.id); // Ensure user can only delete their own contacts

      if (error) throw new Error(`Failed to delete contact: ${error.message}`);
    },
    onSuccess: (_, contactId) => {
      // Remove from cache and invalidate related queries
      queryClient.removeQueries({ queryKey: contactKeys.intelligence(contactId) });
      queryClient.removeQueries({ queryKey: contactKeys.patterns(contactId, 90) });
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

/**
 * Hook to manage contact privacy settings
 */
export function useContactPrivacy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      contactId: string;
      visibility: 'private' | 'team' | 'public';
      anonymize_number?: boolean;
      anonymize_content?: boolean;
    }) => {
      const user = await supabase.auth.getUser();
      if (!user.data.user?.id) throw new Error('User not authenticated');

      // Upsert privacy rule
      const { data, error } = await supabase
        .from('privacy_rules')
        .upsert({
          contact_id: params.contactId,
          user_id: user.data.user.id,
          visibility: params.visibility,
          anonymize_number: params.anonymize_number || false,
          anonymize_content: params.anonymize_content || false,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'contact_id'
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to update privacy settings: ${error.message}`);
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate affected queries
      queryClient.invalidateQueries({ queryKey: contactKeys.intelligence(variables.contactId) });
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

/**
 * Debounced search hook for real-time search functionality
 */
export function useDebouncedContactSearch(
  searchTerm: string,
  tagFilter: string[] = [],
  sortBy: ContactSearchFilters['sort_by'] = 'relevance',
  delay: number = 300
) {
  const [debouncedTerm, setDebouncedTerm] = React.useState(searchTerm);

  // Debounce search term
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, delay);

    return () => clearTimeout(timer);
  }, [searchTerm, delay]);

  return useContactSearch({
    search_term: debouncedTerm,
    tag_filter: tagFilter,
    sort_by: sortBy,
    limit: 50,
    offset: 0
  }, {
    enabled: debouncedTerm.length >= 2 || tagFilter.length > 0, // Only search if meaningful input
    keepPreviousData: true // Keep previous results while loading new ones
  });
}

/**
 * Hook to prefetch contact intelligence data for better UX
 */
export function usePrefetchContactIntelligence() {
  const queryClient = useQueryClient();

  return React.useCallback((contactId: string) => {
    queryClient.prefetchQuery({
      queryKey: contactKeys.intelligence(contactId),
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_enhanced_contact_intelligence', {
          p_requesting_user_id: (await supabase.auth.getUser()).data.user?.id,
          p_target_contact_id: contactId
        });

        if (error) throw new Error(`Failed to prefetch contact intelligence: ${error.message}`);
        return data as ContactIntelligence;
      },
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient]);
}

