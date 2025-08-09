'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@phonelogai/database';
import { format, eachDayOfInterval } from 'date-fns';

export interface TimeSeriesData {
  date: string;
  calls: number;
  sms: number;
  totalDuration: number;
}

export interface DateRange {
  from: Date;
  to: Date;
  preset?: string;
}

interface UseTimeSeriesDataOptions {
  dateRange: DateRange;
  userId: string;
  refreshInterval?: number;
}

interface UseTimeSeriesDataReturn {
  data: TimeSeriesData[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTimeSeriesData({
  dateRange,
  userId,
  refreshInterval = 0,
}: UseTimeSeriesDataOptions): UseTimeSeriesDataReturn {
  const [data, setData] = useState<TimeSeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Generate date range for the query
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      // Fetch aggregated event data using SQL query
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          timestamp,
          type,
          direction,
          duration
        `)
        .eq('user_id', userId)
        .gte('timestamp', fromDate)
        .lte('timestamp', toDate)
        .order('timestamp', { ascending: true });

      if (eventsError) {
        throw eventsError;
      }

      // Process the data into daily aggregations
      const dailyAggregations = new Map<string, TimeSeriesData>();

      // Initialize all dates in the range with zero values
      const dateInterval = eachDayOfInterval({ 
        start: dateRange.from, 
        end: dateRange.to 
      });

      dateInterval.forEach(date => {
        const dateKey = format(date, 'yyyy-MM-dd');
        dailyAggregations.set(dateKey, {
          date: dateKey,
          calls: 0,
          sms: 0,
          totalDuration: 0,
        });
      });

      // Aggregate the actual data
      eventsData?.forEach(event => {
        const eventDate = format(new Date(event.timestamp), 'yyyy-MM-dd');
        const existing = dailyAggregations.get(eventDate);
        
        if (existing) {
          if (event.type === 'call') {
            existing.calls += 1;
            existing.totalDuration += event.duration || 0;
          } else if (event.type === 'sms') {
            existing.sms += 1;
          }
        }
      });

      // Convert map to array and sort by date
      const result = Array.from(dailyAggregations.values())
        .sort((a, b) => a.date.localeCompare(b.date));

      setData(result);
    } catch (err) {
      console.error('Error fetching time series data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      
      // Fallback to mock data for development
      const mockData = generateMockData(dateRange);
      setData(mockData);
    } finally {
      setLoading(false);
    }
  }, [dateRange, userId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Optional polling/refresh interval
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

// Fallback mock data generator for development
function generateMockData(dateRange: DateRange): TimeSeriesData[] {
  const dateInterval = eachDayOfInterval({ 
    start: dateRange.from, 
    end: dateRange.to 
  });

  return dateInterval.map(date => ({
    date: format(date, 'yyyy-MM-dd'),
    calls: Math.floor(Math.random() * 20) + 5,
    sms: Math.floor(Math.random() * 50) + 10,
    totalDuration: Math.floor(Math.random() * 3600) + 300, // in seconds
  }));
}

// Hook for fetching time series data with specific aggregation
export function useAggregatedTimeSeriesData({
  dateRange,
  userId,
  granularity = 'day',
}: UseTimeSeriesDataOptions & { granularity?: 'hour' | 'day' | 'week' | 'month' }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAggregatedData = useCallback(async () => {
    if (!userId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use database function for aggregation if available
      const { data: result, error: rpcError } = await supabase.rpc(
        'get_time_series_data',
        {
          p_user_id: userId,
          p_start_date: format(dateRange.from, 'yyyy-MM-dd'),
          p_end_date: format(dateRange.to, 'yyyy-MM-dd'),
          p_granularity: granularity,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      setData(result || []);
    } catch (err) {
      console.error('Error fetching aggregated time series data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch aggregated data');
      
      // Fallback to basic hook
      const mockData = generateMockData(dateRange);
      setData(mockData);
    } finally {
      setLoading(false);
    }
  }, [dateRange, userId, granularity]);

  useEffect(() => {
    fetchAggregatedData();
  }, [fetchAggregatedData]);

  return {
    data,
    loading,
    error,
    refetch: fetchAggregatedData,
  };
}