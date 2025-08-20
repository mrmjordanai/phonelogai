import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@phonelogai/database';

// Types for dashboard data
export interface EnhancedMetrics {
  // Basic metrics from existing function
  total_events: number;
  total_calls: number;
  total_sms: number;
  unique_contacts: number;
  avg_call_duration_minutes: number;
  last_30_days_events: number;
  busiest_hour?: number;
  top_contact?: {
    contact_id: string;
    name: string;
    number: string;
    interaction_count: number;
  };
  generated_at: number;
}

export interface TimeSeriesData {
  granularity: 'daily' | 'weekly' | 'hourly';
  date_from: string;
  date_to: string;
  total_periods: number;
  summary: {
    total_events: number;
    total_calls: number;
    total_sms: number;
    avg_events_per_period: number;
    peak_period: string;
  };
  data: Array<{
    time_bucket: string;
    timestamp: string;
    total_events: number;
    calls: number;
    sms: number;
    inbound: number;
    outbound: number;
    unique_contacts: number;
    avg_duration: number;
  }>;
  generated_at: string;
}

export interface ActivityHeatmap {
  days_analyzed: number;
  max_activity: number;
  data: Array<{
    day_of_week: number;
    hour: number;
    count: number;
    intensity: number;
  }>;
  day_labels: string[];
  generated_at: string;
}

export interface CallPatterns {
  analysis_period_days: number;
  summary: {
    total_calls: number;
    total_sms: number;
    inbound_count: number;
    outbound_count: number;
    avg_call_duration: number;
    duration_stddev: number;
    max_call_duration: number;
    min_call_duration: number;
  };
  peak_hours: Array<{
    hour: number;
    event_count: number;
    call_count: number;
    avg_duration: number;
  }>;
  duration_distribution: Array<{
    bucket: string;
    count: number;
    percentage: number;
  }>;
  generated_at: string;
}

// Chart data transformation types
export interface ChartDataPoint {
  x: string;
  y: number;
}

export interface PieChartData {
  name: string;
  population: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

export interface BarChartData {
  labels: string[];
  datasets: [{
    data: number[];
    color?: (_opacity?: number) => string;
  }];
}

class DashboardService {
  private static instance: DashboardService;
  private cache: Map<string, { data: unknown; timestamp: number; ttl: number }> = new Map();
  private readonly CACHE_TTL = {
    BASIC_METRICS: 5 * 60 * 1000, // 5 minutes
    TIME_SERIES: 15 * 60 * 1000, // 15 minutes
    HEATMAP: 60 * 60 * 1000, // 1 hour
    PATTERNS: 30 * 60 * 1000, // 30 minutes
  };

  private constructor() {
    this.loadCacheFromStorage();
  }

  public static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  private async loadCacheFromStorage(): Promise<void> {
    try {
      const cachedData = await AsyncStorage.getItem('dashboard_cache');
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        this.cache = new Map(parsed);
      }
    } catch (error) {
      console.error('Failed to load dashboard cache:', error);
    }
  }

  private async saveCacheToStorage(): Promise<void> {
    try {
      const cacheArray = Array.from(this.cache.entries());
      await AsyncStorage.setItem('dashboard_cache', JSON.stringify(cacheArray));
    } catch (error) {
      console.error('Failed to save dashboard cache:', error);
    }
  }

  private getCachedData<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }
    return null;
  }

  private setCachedData<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
    this.saveCacheToStorage();
  }

  /**
   * Get basic dashboard metrics with caching
   */
  public async getBasicMetrics(userId: string, forceRefresh = false): Promise<EnhancedMetrics> {
    const cacheKey = `basic_metrics_${userId}`;
    
    if (!forceRefresh) {
      const cached = this.getCachedData<EnhancedMetrics>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_dashboard_metrics', {
        target_user_id: userId,
      });

      if (error) throw error;

      const metrics = data as EnhancedMetrics;
      this.setCachedData(cacheKey, metrics, this.CACHE_TTL.BASIC_METRICS);
      
      return metrics;
    } catch (error) {
      console.error('Failed to fetch basic metrics:', error);
      throw error;
    }
  }

  /**
   * Get time series data for trend charts
   */
  public async getTimeSeriesData(
    userId: string,
    dateFrom: Date,
    dateTo: Date,
    granularity: 'daily' | 'weekly' | 'hourly' = 'daily',
    forceRefresh = false
  ): Promise<TimeSeriesData> {
    const cacheKey = `time_series_${userId}_${dateFrom.getTime()}_${dateTo.getTime()}_${granularity}`;
    
    if (!forceRefresh) {
      const cached = this.getCachedData<TimeSeriesData>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_time_series_data', {
        target_user_id: userId,
        date_from: dateFrom.toISOString(),
        date_to: dateTo.toISOString(),
        granularity,
      });

      if (error) throw error;

      const timeSeriesData = data as TimeSeriesData;
      this.setCachedData(cacheKey, timeSeriesData, this.CACHE_TTL.TIME_SERIES);
      
      return timeSeriesData;
    } catch (error) {
      console.error('Failed to fetch time series data:', error);
      throw error;
    }
  }

  /**
   * Get activity heatmap data
   */
  public async getActivityHeatmap(
    userId: string,
    daysBack = 90,
    forceRefresh = false
  ): Promise<ActivityHeatmap> {
    const cacheKey = `heatmap_${userId}_${daysBack}`;
    
    if (!forceRefresh) {
      const cached = this.getCachedData<ActivityHeatmap>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_activity_heatmap', {
        target_user_id: userId,
        days_back: daysBack,
      });

      if (error) throw error;

      const heatmapData = data as ActivityHeatmap;
      this.setCachedData(cacheKey, heatmapData, this.CACHE_TTL.HEATMAP);
      
      return heatmapData;
    } catch (error) {
      console.error('Failed to fetch activity heatmap:', error);
      throw error;
    }
  }

  /**
   * Get call patterns analysis
   */
  public async getCallPatterns(
    userId: string,
    analysisDays = 30,
    forceRefresh = false
  ): Promise<CallPatterns> {
    const cacheKey = `patterns_${userId}_${analysisDays}`;
    
    if (!forceRefresh) {
      const cached = this.getCachedData<CallPatterns>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const { data, error } = await supabase.rpc('analyze_call_patterns', {
        target_user_id: userId,
        analysis_days: analysisDays,
      });

      if (error) throw error;

      const patternsData = data as CallPatterns;
      this.setCachedData(cacheKey, patternsData, this.CACHE_TTL.PATTERNS);
      
      return patternsData;
    } catch (error) {
      console.error('Failed to fetch call patterns:', error);
      throw error;
    }
  }

  /**
   * Transform time series data for line chart
   */
  public transformTimeSeriesForLineChart(timeSeriesData: TimeSeriesData): {
    labels: string[];
    datasets: Array<{
      data: number[];
      color: (_opacity?: number) => string;
      strokeWidth: number;
    }>;
  } {
    const labels = timeSeriesData.data.map(item => {
      const date = new Date(item.timestamp);
      if (timeSeriesData.granularity === 'hourly') {
        return `${date.getHours()}:00`;
      } else if (timeSeriesData.granularity === 'weekly') {
        return `W${Math.ceil(date.getDate() / 7)}`;
      } else {
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }
    });

    return {
      labels,
      datasets: [
        {
          data: timeSeriesData.data.map(item => item.total_events),
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  }

  /**
   * Transform metrics for pie chart (calls vs SMS)
   */
  public transformMetricsForPieChart(metrics: EnhancedMetrics): PieChartData[] {
    return [
      {
        name: 'Calls',
        population: metrics.total_calls,
        color: '#3B82F6',
        legendFontColor: '#374151',
        legendFontSize: 14,
      },
      {
        name: 'SMS',
        population: metrics.total_sms,
        color: '#10B981',
        legendFontColor: '#374151',
        legendFontSize: 14,
      },
    ];
  }

  /**
   * Transform call patterns for duration distribution bar chart
   */
  public transformPatternsForBarChart(patterns: CallPatterns): BarChartData {
    return {
      labels: patterns.duration_distribution.map(item => item.bucket),
      datasets: [{
        data: patterns.duration_distribution.map(item => item.count),
        color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
      }],
    };
  }

  /**
   * Transform heatmap data for visualization
   */
  public transformHeatmapData(heatmap: ActivityHeatmap): Array<Array<{ count: number; intensity: number }>> {
    const matrix: Array<Array<{ count: number; intensity: number }>> = [];
    
    // Initialize 7x24 matrix (days x hours)
    for (let day = 0; day < 7; day++) {
      matrix[day] = [];
      for (let hour = 0; hour < 24; hour++) {
        matrix[day][hour] = { count: 0, intensity: 0 };
      }
    }

    // Fill matrix with data
    heatmap.data.forEach(item => {
      if (item.day_of_week >= 0 && item.day_of_week < 7 && item.hour >= 0 && item.hour < 24) {
        matrix[item.day_of_week][item.hour] = {
          count: item.count,
          intensity: item.intensity,
        };
      }
    });

    return matrix;
  }

  /**
   * Clear all cached data
   */
  public async clearCache(): Promise<void> {
    this.cache.clear();
    await AsyncStorage.removeItem('dashboard_cache');
  }

  /**
   * Get cache statistics for debugging
   */
  public getCacheStats(): { totalItems: number; totalSize: string } {
    return {
      totalItems: this.cache.size,
      totalSize: `${JSON.stringify(Array.from(this.cache.entries())).length} bytes`,
    };
  }
}

export default DashboardService;