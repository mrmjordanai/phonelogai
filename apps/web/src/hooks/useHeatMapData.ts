'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@phonelogai/database';
import { 
  HeatMapDataPoint, 
  HeatMapSummary, 
  HeatMapViewMode, 
  HeatMapEventType,
  HeatMapFilters 
} from '@phonelogai/types';

// Query key factory for consistent cache management
export const heatMapKeys = {
  all: ['heatmap'] as const,
  data: (userId: string, filters: HeatMapFilters) => 
    [...heatMapKeys.all, 'data', userId, filters] as const,
  summary: (userId: string, startDate: Date, endDate: Date) => 
    [...heatMapKeys.all, 'summary', userId, startDate.toISOString(), endDate.toISOString()] as const,
};

interface UseHeatMapDataOptions {
  userId: string;
  viewMode: HeatMapViewMode;
  eventTypes: HeatMapEventType[];
  startDate: Date;
  endDate: Date;
  enabled?: boolean;
}

interface UseHeatMapDataReturn {
  data: HeatMapDataPoint[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * React Query hook for fetching heat-map data with caching and error handling
 */
export function useHeatMapData({
  userId,
  viewMode,
  eventTypes,
  startDate,
  endDate,
  enabled = true,
}: UseHeatMapDataOptions): UseHeatMapDataReturn {
  const supabase = createClient();
  
  const filters: HeatMapFilters = {
    viewMode,
    eventTypes,
    startDate,
    endDate,
  };

  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: heatMapKeys.data(userId, filters),
    queryFn: async (): Promise<HeatMapDataPoint[]> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Validate date range
      if (startDate >= endDate) {
        throw new Error('Start date must be before end date');
      }

      // Call the database function we created
      const { data: result, error: rpcError } = await supabase.rpc(
        'get_heatmap_data',
        {
          p_user_id: userId,
          p_view_mode: viewMode,
          p_event_types: eventTypes,
          p_start_date: startDate.toISOString(),
          p_end_date: endDate.toISOString(),
        }
      );

      if (rpcError) {
        console.error('Database RPC error:', rpcError);
        throw new Error(`Failed to fetch heat-map data: ${rpcError.message}`);
      }

      if (!result) {
        return [];
      }

      // Transform the database result to match our TypeScript interface
      return result.map((row: any): HeatMapDataPoint => ({
        time_bucket: row.time_bucket,
        day_of_week: row.day_of_week,
        hour_of_day: row.hour_of_day,
        call_count: row.call_count,
        sms_count: row.sms_count,
        total_duration: row.total_duration,
        unique_contacts: row.unique_contacts,
        intensity: parseFloat(row.intensity),
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - historical data doesn't change often
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer for better UX
    enabled: enabled && !!userId,
    retry: (failureCount, error) => {
      // Don't retry on authentication errors
      if (error.message.includes('Access denied')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    data,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

interface UseHeatMapSummaryOptions {
  userId: string;
  startDate: Date;
  endDate: Date;
  enabled?: boolean;
}

interface UseHeatMapSummaryReturn {
  summary: HeatMapSummary | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * React Query hook for fetching heat-map summary statistics
 */
export function useHeatMapSummary({
  userId,
  startDate,
  endDate,
  enabled = true,
}: UseHeatMapSummaryOptions): UseHeatMapSummaryReturn {
  const supabase = createClient();

  const {
    data: summary = null,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: heatMapKeys.summary(userId, startDate, endDate),
    queryFn: async (): Promise<HeatMapSummary> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const { data: result, error: rpcError } = await supabase.rpc(
        'get_heatmap_summary',
        {
          p_user_id: userId,
          p_start_date: startDate.toISOString(),
          p_end_date: endDate.toISOString(),
        }
      );

      if (rpcError) {
        console.error('Database RPC error:', rpcError);
        throw new Error(`Failed to fetch heat-map summary: ${rpcError.message}`);
      }

      if (!result) {
        // Return empty summary if no data
        return {
          total_events: 0,
          avg_daily_activity: 0,
          peak_hour: 12, // noon default
          peak_day: 1, // Monday default
          peak_intensity: 0,
          date_range: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            days: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
          },
        };
      }

      return result;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - summary data is even more stable
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: enabled && !!userId,
    retry: (failureCount, error) => {
      if (error.message.includes('Access denied')) {
        return false;
      }
      return failureCount < 2; // Less retries for summary data
    },
  });

  return {
    summary,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to invalidate heat-map related queries
 * Useful after data changes that might affect heat-map visualization
 */
export function useInvalidateHeatMapQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: heatMapKeys.all });
    },
    invalidateData: (userId: string, filters?: HeatMapFilters) => {
      if (filters) {
        queryClient.invalidateQueries({ queryKey: heatMapKeys.data(userId, filters) });
      } else {
        queryClient.invalidateQueries({ 
          queryKey: [...heatMapKeys.all, 'data', userId],
          exact: false 
        });
      }
    },
    invalidateSummary: (userId: string, startDate?: Date, endDate?: Date) => {
      if (startDate && endDate) {
        queryClient.invalidateQueries({ queryKey: heatMapKeys.summary(userId, startDate, endDate) });
      } else {
        queryClient.invalidateQueries({ 
          queryKey: [...heatMapKeys.all, 'summary', userId],
          exact: false 
        });
      }
    },
  };
}

/**
 * Utility function to prefetch heat-map data
 * Useful for preloading data when user hovers over controls
 */
export function usePrefetchHeatMapData() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return {
    prefetchData: async (options: UseHeatMapDataOptions) => {
      const filters: HeatMapFilters = {
        viewMode: options.viewMode,
        eventTypes: options.eventTypes,
        startDate: options.startDate,
        endDate: options.endDate,
      };

      await queryClient.prefetchQuery({
        queryKey: heatMapKeys.data(options.userId, filters),
        queryFn: async (): Promise<HeatMapDataPoint[]> => {
          const { data: result, error: rpcError } = await supabase.rpc(
            'get_heatmap_data',
            {
              p_user_id: options.userId,
              p_view_mode: options.viewMode,
              p_event_types: options.eventTypes,
              p_start_date: options.startDate.toISOString(),
              p_end_date: options.endDate.toISOString(),
            }
          );

          if (rpcError) {
            throw new Error(`Failed to prefetch heat-map data: ${rpcError.message}`);
          }

          return result || [];
        },
        staleTime: 5 * 60 * 1000, // Same cache settings as main hook
      });
    },
    prefetchSummary: async (userId: string, startDate: Date, endDate: Date) => {
      await queryClient.prefetchQuery({
        queryKey: heatMapKeys.summary(userId, startDate, endDate),
        queryFn: async (): Promise<HeatMapSummary> => {
          const { data: result, error: rpcError } = await supabase.rpc(
            'get_heatmap_summary',
            {
              p_user_id: userId,
              p_start_date: startDate.toISOString(),
              p_end_date: endDate.toISOString(),
            }
          );

          if (rpcError) {
            throw new Error(`Failed to prefetch heat-map summary: ${rpcError.message}`);
          }

          return result || {
            total_events: 0,
            avg_daily_activity: 0,
            peak_hour: 12,
            peak_day: 1,
            peak_intensity: 0,
            date_range: {
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              days: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
            },
          };
        },
        staleTime: 10 * 60 * 1000,
      });
    },
  };
}

// Export default hook for convenience
export default useHeatMapData;