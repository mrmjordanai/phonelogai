import { useState, useEffect, useCallback, useRef } from 'react';
import { eventUtils } from '@phonelogai/database';
// Temporary workaround for module resolution 
type Event = {
  id: string;
  user_id: string;
  line_id: string;
  ts: string;
  number: string;
  direction: 'inbound' | 'outbound';
  type: 'call' | 'sms';
  duration?: number;
  content?: string;
  contact_id?: string;
  status?: 'answered' | 'missed' | 'busy' | 'declined';
  source?: string;
  created_at: string;
  updated_at: string;
};
import { UIEvent, EventFilters, EventSortConfig, EventsPagination } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'events_cache';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

interface EventsCache {
  data: UIEvent[];
  timestamp: number;
  filters: EventFilters;
}

interface UseEventsProps {
  initialFilters?: Partial<EventFilters>;
  pageSize?: number;
  cacheEnabled?: boolean;
}

interface UseEventsReturn {
  events: UIEvent[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  pagination: EventsPagination;
  
  // Actions
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  refetch: () => Promise<void>;
  
  // Cache management
  clearCache: () => Promise<void>;
  getCacheInfo: () => Promise<{ size: number; lastUpdated?: Date } | null>;
}

export function useEvents({
  initialFilters = {},
  pageSize = 50,
  cacheEnabled = true
}: UseEventsProps = {}): UseEventsReturn {
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pagination, setPagination] = useState<EventsPagination>({
    page: 0,
    limit: pageSize,
    total: 0,
    hasMore: true,
    cursor: undefined
  });

  const currentFilters = useRef<EventFilters>({
    search: '',
    type: 'all',
    direction: 'all',
    status: 'all',
    dateRange: {},
    ...initialFilters
  });

  const currentSort = useRef<EventSortConfig>({
    field: 'timestamp',
    direction: 'desc'
  });

  const isLoading = useRef(false);
  const abortController = useRef<AbortController | null>(null);

  // Cache management
  const getCacheKey = useCallback((filters: EventFilters) => {
    return `${CACHE_KEY}_${JSON.stringify(filters)}_${currentSort.current.field}_${currentSort.current.direction}`;
  }, []);

  const loadFromCache = useCallback(async (filters: EventFilters): Promise<UIEvent[] | null> => {
    if (!cacheEnabled) return null;
    
    try {
      const cacheKey = getCacheKey(filters);
      const cached = await AsyncStorage.getItem(cacheKey);
      
      if (!cached) return null;
      
      const parsedCache: EventsCache = JSON.parse(cached);
      const isExpired = Date.now() - parsedCache.timestamp > CACHE_EXPIRY;
      
      if (isExpired) {
        await AsyncStorage.removeItem(cacheKey);
        return null;
      }
      
      return parsedCache.data;
    } catch (error) {
      console.warn('Failed to load from cache:', error);
      return null;
    }
  }, [cacheEnabled, getCacheKey]);

  const saveToCache = useCallback(async (filters: EventFilters, data: UIEvent[]) => {
    if (!cacheEnabled) return;
    
    try {
      const cacheKey = getCacheKey(filters);
      const cache: EventsCache = {
        data,
        timestamp: Date.now(),
        filters
      };
      
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to save to cache:', error);
    }
  }, [cacheEnabled, getCacheKey]);

  const clearCache = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }, []);

  const getCacheInfo = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY));
      
      if (cacheKeys.length === 0) return null;
      
      let totalSize = 0;
      let lastUpdated: Date | undefined;
      
      for (const key of cacheKeys) {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          totalSize += cached.length;
          const parsedCache: EventsCache = JSON.parse(cached);
          if (!lastUpdated || parsedCache.timestamp > lastUpdated.getTime()) {
            lastUpdated = new Date(parsedCache.timestamp);
          }
        }
      }
      
      return { size: totalSize, lastUpdated };
    } catch (error) {
      console.warn('Failed to get cache info:', error);
      return null;
    }
  }, []);

  // Transform raw events to UI events with privacy handling
  const transformEvents = useCallback((rawEvents: Event[]): UIEvent[] => {
    return rawEvents.map(event => {
      const uiEvent: UIEvent = { ...event };
      
      // Apply privacy rules (simplified - would integrate with actual privacy service)
      if (event.contact_id) {
        // Would load contact and privacy rules here
        uiEvent.display_name = event.contact_id; // Placeholder
        uiEvent.display_number = event.number;
      } else {
        uiEvent.display_number = event.number;
      }
      
      return uiEvent;
    });
  }, []);

  // Apply client-side filtering and sorting
  const applyFiltersAndSort = useCallback((events: UIEvent[], filters: EventFilters, sort: EventSortConfig): UIEvent[] => {
    let filtered = [...events];
    
    // Apply search filter
    if (filters.search.trim()) {
      const search = filters.search.toLowerCase().trim();
      filtered = filtered.filter(event => 
        event.number.includes(search) ||
        event.display_name?.toLowerCase().includes(search) ||
        event.content?.toLowerCase().includes(search)
      );
    }
    
    // Apply type filter
    if (filters.type && filters.type !== 'all') {
      filtered = filtered.filter(event => event.type === filters.type);
    }
    
    // Apply direction filter
    if (filters.direction && filters.direction !== 'all') {
      filtered = filtered.filter(event => event.direction === filters.direction);
    }
    
    // Apply status filter
    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(event => event.status === filters.status);
    }
    
    // Apply date range filter
    if (filters.dateRange.start || filters.dateRange.end) {
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.ts);
        if (filters.dateRange.start && eventDate < filters.dateRange.start) return false;
        if (filters.dateRange.end && eventDate > filters.dateRange.end) return false;
        return true;
      });
    }
    
    // Apply duration range filter
    if (filters.durationRange) {
      filtered = filtered.filter(event => {
        if (event.type !== 'call') return true; // Only apply to calls
        if (!event.duration) return false;
        if (filters.durationRange?.min && event.duration < filters.durationRange.min) return false;
        if (filters.durationRange?.max && event.duration > filters.durationRange.max) return false;
        return true;
      });
    }
    
    // Apply contact filter
    if (filters.contactId) {
      filtered = filtered.filter(event => event.contact_id === filters.contactId);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sort.field) {
        case 'timestamp':
          comparison = new Date(a.ts).getTime() - new Date(b.ts).getTime();
          break;
        case 'duration':
          comparison = (a.duration || 0) - (b.duration || 0);
          break;
        case 'contact':
          comparison = (a.display_name || a.display_number || '').localeCompare(
            b.display_name || b.display_number || ''
          );
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        default:
          comparison = 0;
      }
      
      return sort.direction === 'desc' ? -comparison : comparison;
    });
    
    return filtered;
  }, []);

  // Main data fetching function
  const fetchEvents = useCallback(async (
    filters: EventFilters,
    options: {
      page?: number;
      append?: boolean;
      useCache?: boolean;
      signal?: AbortSignal;
    } = {}
  ) => {
    const { 
      page = 0, 
      append = false, 
      useCache = cacheEnabled,
      signal 
    } = options;
    
    try {
      // Check cache first for initial load
      if (useCache && page === 0 && !append) {
        const cachedEvents = await loadFromCache(filters);
        if (cachedEvents && cachedEvents.length > 0) {
          setEvents(cachedEvents);
          setPagination(prev => ({
            ...prev,
            page: 0,
            total: cachedEvents.length,
            hasMore: cachedEvents.length >= pageSize
          }));
          return cachedEvents;
        }
      }
      
      // Fetch from database
      const response = await eventUtils.getFilteredEvents(
        'current_user', // Would get from auth context
        {
          limit: pageSize,
          offset: page * pageSize,
          startDate: filters.dateRange.start?.toISOString(),
          endDate: filters.dateRange.end?.toISOString(),
          eventType: filters.type === 'all' ? undefined : filters.type,
          direction: filters.direction === 'all' ? undefined : filters.direction
        }
      );
      
      if (signal?.aborted) return [];
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch events');
      }
      
      const rawEvents = (response.data as Event[]) || [];
      const transformedEvents = transformEvents(rawEvents);
      const filteredEvents = applyFiltersAndSort(transformedEvents, filters, currentSort.current);
      
      // Update state
      if (append) {
        setEvents(prev => [...prev, ...filteredEvents]);
      } else {
        setEvents(filteredEvents);
        
        // Cache the first page
        if (page === 0 && useCache) {
          await saveToCache(filters, filteredEvents);
        }
      }
      
      // Update pagination
      setPagination(prev => ({
        ...prev,
        page,
        total: prev.total + filteredEvents.length,
        hasMore: filteredEvents.length >= pageSize
      }));
      
      return filteredEvents;
    } catch (error) {
      console.error('Failed to fetch events:', error);
      throw error;
    }
  }, [pageSize, cacheEnabled, loadFromCache, saveToCache, transformEvents, applyFiltersAndSort]);

  // Load more events (infinite scroll)
  const loadMore = useCallback(async () => {
    if (isLoading.current || !pagination.hasMore || loading) return;
    
    isLoading.current = true;
    
    try {
      await fetchEvents(currentFilters.current, {
        page: pagination.page + 1,
        append: true
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load more events');
    } finally {
      isLoading.current = false;
    }
  }, [pagination.hasMore, pagination.page, loading, fetchEvents]);

  // Refresh events
  const refresh = useCallback(async () => {
    if (isLoading.current) return;
    
    setRefreshing(true);
    setError(null);
    isLoading.current = true;
    
    // Cancel any existing requests
    abortController.current?.abort();
    abortController.current = new AbortController();
    
    try {
      await clearCache();
      setPagination(prev => ({ ...prev, page: 0, total: 0, hasMore: true }));
      await fetchEvents(currentFilters.current, {
        page: 0,
        useCache: false,
        signal: abortController.current.signal
      });
    } catch (error) {
      if (!abortController.current?.signal.aborted) {
        setError(error instanceof Error ? error.message : 'Failed to refresh events');
      }
    } finally {
      setRefreshing(false);
      isLoading.current = false;
    }
  }, [fetchEvents, clearCache]);

  // Refetch with current settings
  const refetch = useCallback(async () => {
    if (isLoading.current) return;
    
    setLoading(true);
    setError(null);
    isLoading.current = true;
    
    try {
      setPagination(prev => ({ ...prev, page: 0, total: 0, hasMore: true }));
      await fetchEvents(currentFilters.current, { page: 0, useCache: false });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to refetch events');
    } finally {
      setLoading(false);
      isLoading.current = false;
    }
  }, [fetchEvents]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    
    const initialLoad = async () => {
      if (isLoading.current) return;
      
      setLoading(true);
      setError(null);
      isLoading.current = true;
      
      try {
        await fetchEvents(currentFilters.current, { page: 0 });
      } catch (error) {
        if (mounted) {
          setError(error instanceof Error ? error.message : 'Failed to load events');
        }
      } finally {
        if (mounted) {
          setLoading(false);
          isLoading.current = false;
        }
      }
    };
    
    initialLoad();
    
    return () => {
      mounted = false;
      abortController.current?.abort();
    };
  }, [fetchEvents]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortController.current?.abort();
    };
  }, []);

  return {
    events,
    loading,
    error,
    refreshing,
    pagination,
    
    // Actions
    loadMore,
    refresh,
    refetch,
    
    // Cache management
    clearCache,
    getCacheInfo
  };
}