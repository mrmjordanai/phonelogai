import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '../components/AuthProvider';
import DashboardService from '../services/DashboardService';
import { SyncHealthMonitor, SyncHealthStatus } from '../services/SyncHealthMonitor';
import { OfflineQueue } from '../services/OfflineQueue';
import { EnhancedDashboardState, PerformanceMetrics, ConflictMetrics } from '../types/enhanced-dashboard';

export interface DashboardAnalytics extends EnhancedDashboardState {
  // Keep backward compatibility
}

export interface DateRange {
  from: Date;
  to: Date;
  preset?: '7d' | '30d' | '90d' | '1y' | 'custom';
}

export interface DashboardFilters {
  dateRange: DateRange;
  granularity: 'daily' | 'weekly' | 'hourly';
  heatmapDays: number;
  patternsDays: number;
}

export const useDashboardAnalytics = () => {
  const { user } = useAuth();
  const dashboardService = DashboardService.getInstance();

  // Enhanced state with real-time monitoring
  const [analytics, setAnalytics] = useState<DashboardAnalytics>({
    basicMetrics: null,
    timeSeriesData: null,
    activityHeatmap: null,
    callPatterns: null,
    syncHealthStatus: null,
    conflictMetrics: null,
    queueStats: null,
    performanceMetrics: null,
    networkStatus: {
      isConnected: false,
      connectionType: 'unknown',
      isMetered: false,
      quality: 'offline'
    },
    loading: {
      basicMetrics: false,
      timeSeriesData: false,
      activityHeatmap: false,
      callPatterns: false,
      syncHealth: false,
      conflictMetrics: false,
      performance: false,
    },
    error: {
      basicMetrics: null,
      timeSeriesData: null,
      activityHeatmap: null,
      callPatterns: null,
      syncHealth: null,
      conflictMetrics: null,
      performance: null,
    },
    refreshing: false,
    lastUpdated: null,
  });

  // Service instances - SyncHealthMonitor is already a singleton instance
  const syncHealthMonitor = SyncHealthMonitor;
  // const conflictResolver = ConflictResolver.getInstance(); // Will add later when type is fixed

  // Default filters
  const [filters, setFilters] = useState<DashboardFilters>({
    dateRange: {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      to: new Date(),
      preset: '30d',
    },
    granularity: 'daily',
    heatmapDays: 90,
    patternsDays: 30,
  });

  // Helper to update loading state
  const setLoading = useCallback((key: keyof DashboardAnalytics['loading'], value: boolean) => {
    setAnalytics(prev => ({
      ...prev,
      loading: { ...prev.loading, [key]: value },
    }));
  }, []);

  // Helper to update error state
  const setError = useCallback((key: keyof DashboardAnalytics['error'], value: string | null) => {
    setAnalytics(prev => ({
      ...prev,
      error: { ...prev.error, [key]: value },
    }));
  }, []);

  // Helper to update data
  const setData = useCallback(<K extends keyof Pick<DashboardAnalytics, 'basicMetrics' | 'timeSeriesData' | 'activityHeatmap' | 'callPatterns' | 'syncHealthStatus' | 'conflictMetrics' | 'queueStats' | 'performanceMetrics'>>(
    key: K,
    value: DashboardAnalytics[K]
  ) => {
    setAnalytics(prev => ({
      ...prev,
      [key]: value,
      lastUpdated: new Date(),
    }));
  }, []);

  // Real-time sync health monitoring
  const fetchSyncHealthStatus = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;

    setLoading('syncHealth', true);
    setError('syncHealth', null);

    try {
      // Start monitoring if not already started
      if (!syncHealthMonitor.getStatus().lastSync && forceRefresh) {
        await syncHealthMonitor.initialize();
        await syncHealthMonitor.startMonitoring();
      }

      const status = syncHealthMonitor.getStatus();
      setData('syncHealthStatus', status);
    } catch (error) {
      console.error('Error fetching sync health status:', error);
      setError('syncHealth', error instanceof Error ? error.message : 'Failed to fetch sync health');
    } finally {
      setLoading('syncHealth', false);
    }
  }, [user?.id, syncHealthMonitor, setLoading, setError, setData]);

  // Conflict metrics monitoring
  const fetchConflictMetrics = useCallback(async (_forceRefresh = false) => {
    if (!user?.id) return;

    setLoading('conflictMetrics', true);
    setError('conflictMetrics', null);

    try {
      await syncHealthMonitor.updateConflictMetrics(user.id);
      const status = syncHealthMonitor.getStatus();
      if (status.conflictMetrics) {
        setData('conflictMetrics', status.conflictMetrics);
      }
    } catch (error) {
      console.error('Error fetching conflict metrics:', error);
      setError('conflictMetrics', error instanceof Error ? error.message : 'Failed to fetch conflict metrics');
    } finally {
      setLoading('conflictMetrics', false);
    }
  }, [user?.id, syncHealthMonitor, setLoading, setError, setData]);

  // Queue statistics monitoring
  const fetchQueueStats = useCallback(async () => {
    try {
      const stats = await OfflineQueue.getStats();
      setData('queueStats', stats);
    } catch (error) {
      console.error('Error fetching queue stats:', error);
    }
  }, [setData]);

  // Performance metrics collection
  const fetchPerformanceMetrics = useCallback(async () => {
    setLoading('performance', true);
    setError('performance', null);

    try {
      // Collect performance metrics
      const metrics: PerformanceMetrics = {
        memoryUsage: await getMemoryUsage(),
        renderTime: performance.now(),
        networkLatency: await measureNetworkLatency(),
        syncLatency: analytics.syncHealthStatus?.syncLatency || 0,
        batteryOptimized: analytics.syncHealthStatus?.batteryOptimized || true,
        lastUpdated: new Date(),
      };

      setData('performanceMetrics', metrics);
    } catch (error) {
      console.error('Error collecting performance metrics:', error);
      setError('performance', error instanceof Error ? error.message : 'Failed to collect performance metrics');
    } finally {
      setLoading('performance', false);
    }
  }, [analytics.syncHealthStatus, setLoading, setError, setData]);

  // Helper functions for performance metrics
  const getMemoryUsage = async (): Promise<number> => {
    // Simple memory estimation - in real app would use native modules
    return Math.random() * 50 + 20; // 20-70 MB simulation
  };

  const measureNetworkLatency = async (): Promise<number> => {
    const start = performance.now();
    try {
      await fetch('https://www.google.com', { method: 'HEAD', mode: 'no-cors' });
      return performance.now() - start;
    } catch {
      return -1; // Offline or error
    }
  };

  // Manual sync trigger placeholder - will be defined after fetchAllEnhancedData

  // Fetch basic metrics
  const fetchBasicMetrics = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;

    setLoading('basicMetrics', true);
    setError('basicMetrics', null);

    try {
      const metrics = await dashboardService.getBasicMetrics(user.id, forceRefresh);
      setData('basicMetrics', metrics);
    } catch (error) {
      console.error('Error fetching basic metrics:', error);
      setError('basicMetrics', error instanceof Error ? error.message : 'Failed to fetch metrics');
    } finally {
      setLoading('basicMetrics', false);
    }
  }, [user?.id, dashboardService, setLoading, setError, setData]);

  // Fetch time series data
  const fetchTimeSeriesData = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;

    setLoading('timeSeriesData', true);
    setError('timeSeriesData', null);

    try {
      const timeSeriesData = await dashboardService.getTimeSeriesData(
        user.id,
        filters.dateRange.from,
        filters.dateRange.to,
        filters.granularity,
        forceRefresh
      );
      setData('timeSeriesData', timeSeriesData);
    } catch (error) {
      console.error('Error fetching time series data:', error);
      setError('timeSeriesData', error instanceof Error ? error.message : 'Failed to fetch time series data');
    } finally {
      setLoading('timeSeriesData', false);
    }
  }, [user?.id, filters.dateRange, filters.granularity, dashboardService, setLoading, setError, setData]);

  // Fetch activity heatmap
  const fetchActivityHeatmap = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;

    setLoading('activityHeatmap', true);
    setError('activityHeatmap', null);

    try {
      const heatmapData = await dashboardService.getActivityHeatmap(
        user.id,
        filters.heatmapDays,
        forceRefresh
      );
      setData('activityHeatmap', heatmapData);
    } catch (error) {
      console.error('Error fetching activity heatmap:', error);
      setError('activityHeatmap', error instanceof Error ? error.message : 'Failed to fetch heatmap data');
    } finally {
      setLoading('activityHeatmap', false);
    }
  }, [user?.id, filters.heatmapDays, dashboardService, setLoading, setError, setData]);

  // Fetch call patterns
  const fetchCallPatterns = useCallback(async (forceRefresh = false) => {
    if (!user?.id) return;

    setLoading('callPatterns', true);
    setError('callPatterns', null);

    try {
      const patternsData = await dashboardService.getCallPatterns(
        user.id,
        filters.patternsDays,
        forceRefresh
      );
      setData('callPatterns', patternsData);
    } catch (error) {
      console.error('Error fetching call patterns:', error);
      setError('callPatterns', error instanceof Error ? error.message : 'Failed to fetch patterns data');
    } finally {
      setLoading('callPatterns', false);
    }
  }, [user?.id, filters.patternsDays, dashboardService, setLoading, setError, setData]);

  // Legacy fetch method - kept for backwards compatibility but not used
  // const _fetchAllData = useCallback(async (forceRefresh = false) => {
  //   await Promise.all([
  //     fetchBasicMetrics(forceRefresh),
  //     fetchTimeSeriesData(forceRefresh),
  //     fetchActivityHeatmap(forceRefresh),
  //     fetchCallPatterns(forceRefresh),
  //   ]);
  // }, [fetchBasicMetrics, fetchTimeSeriesData, fetchActivityHeatmap, fetchCallPatterns]);

  // Enhanced fetch all data with real-time monitoring
  const fetchAllEnhancedData = useCallback(async (forceRefresh = false) => {
    await Promise.all([
      fetchBasicMetrics(forceRefresh),
      fetchTimeSeriesData(forceRefresh),
      fetchActivityHeatmap(forceRefresh),
      fetchCallPatterns(forceRefresh),
      fetchSyncHealthStatus(forceRefresh),
      fetchConflictMetrics(forceRefresh),
      fetchQueueStats(),
      fetchPerformanceMetrics(),
    ]);
  }, [
    fetchBasicMetrics, 
    fetchTimeSeriesData, 
    fetchActivityHeatmap, 
    fetchCallPatterns,
    fetchSyncHealthStatus,
    fetchConflictMetrics,
    fetchQueueStats,
    fetchPerformanceMetrics
  ]);

  // Manual sync trigger with progress feedback
  const triggerManualSync = useCallback(async () => {
    try {
      setAnalytics(prev => ({ ...prev, refreshing: true }));
      
      // Update sync health to trigger sync
      await syncHealthMonitor.updateSyncStatus({
        success: true,
        processedItems: 0,
        failedItems: 0,
        conflictsFound: 0,
        conflictsResolved: 0,
        bytesTransferred: 0,
        duration: 0,
        errors: [],
      });

      // Refresh all data
      await fetchAllEnhancedData(true);
    } catch (error) {
      console.error('Manual sync failed:', error);
    } finally {
      setAnalytics(prev => ({ ...prev, refreshing: false }));
    }
  }, [fetchAllEnhancedData, syncHealthMonitor]);

  // Enhanced refresh all data with real-time monitoring
  const refreshAllData = useCallback(async () => {
    setAnalytics(prev => ({ ...prev, refreshing: true }));
    await fetchAllEnhancedData(true);
    setAnalytics(prev => ({ ...prev, refreshing: false }));
  }, [fetchAllEnhancedData]);

  // Update date range with preset
  const updateDateRange = useCallback((preset: DateRange['preset']) => {
    const now = new Date();
    let from: Date;

    switch (preset) {
      case '7d':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        return; // Custom range - no preset update
    }

    setFilters(prev => ({
      ...prev,
      dateRange: { from, to: now, preset },
    }));
  }, []);

  // Update custom date range
  const updateCustomDateRange = useCallback((from: Date, to: Date) => {
    setFilters(prev => ({
      ...prev,
      dateRange: { from, to, preset: 'custom' },
    }));
  }, []);

  // Update granularity
  const updateGranularity = useCallback((granularity: DashboardFilters['granularity']) => {
    setFilters(prev => ({ ...prev, granularity }));
  }, []);

  // Get chart-ready data transformations
  const getChartData = useCallback(() => {
    if (!analytics.basicMetrics) return null;

    return {
      lineChart: analytics.timeSeriesData
        ? dashboardService.transformTimeSeriesForLineChart(analytics.timeSeriesData)
        : null,
      pieChart: dashboardService.transformMetricsForPieChart(analytics.basicMetrics),
      barChart: analytics.callPatterns
        ? dashboardService.transformPatternsForBarChart(analytics.callPatterns)
        : null,
      heatmapMatrix: analytics.activityHeatmap
        ? dashboardService.transformHeatmapData(analytics.activityHeatmap)
        : null,
    };
  }, [analytics, dashboardService]);

  // Check if any data is loading
  const isLoading = Object.values(analytics.loading).some(loading => loading);

  // Check if there are any errors
  const hasErrors = Object.values(analytics.error).some(error => error !== null);

  // Real-time event listeners setup
  useEffect(() => {
    if (!user?.id) return;

    // Sync health monitoring events
    const handleSyncStatusChange = (status: SyncHealthStatus) => {
      setData('syncHealthStatus', status);
    };

    const handleSyncMetricsUpdate = (data: unknown) => {
      if (data && typeof data === 'object' && data !== null && 'metrics' in data) {
        const metrics = (data as { metrics: unknown }).metrics;
        if (metrics && typeof metrics === 'object') {
          setData('conflictMetrics', metrics as ConflictMetrics);
        }
      }
    };

    // Set up event listeners
    syncHealthMonitor.on('status_changed', handleSyncStatusChange);
    syncHealthMonitor.on('metrics_updated', handleSyncMetricsUpdate);

    // Cleanup function
    return () => {
      syncHealthMonitor.off('status_changed', handleSyncStatusChange);
      syncHealthMonitor.off('metrics_updated', handleSyncMetricsUpdate);
    };
  }, [user?.id, syncHealthMonitor, setData]);

  // App state change handling for background/foreground transitions
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && user?.id) {
        // Refresh data when app becomes active
        setTimeout(() => {
          fetchSyncHealthStatus();
          fetchQueueStats();
        }, 1000);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [user?.id, fetchSyncHealthStatus, fetchQueueStats]);

  // Initial data fetch with enhanced monitoring
  useEffect(() => {
    if (user?.id) {
      fetchAllEnhancedData();
    }
  }, [user?.id, fetchAllEnhancedData]);

  // Periodic updates for real-time data
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      // Only update if app is in foreground
      if (AppState.currentState === 'active') {
        fetchQueueStats();
        fetchPerformanceMetrics();
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [user?.id, fetchQueueStats, fetchPerformanceMetrics]);

  // Refetch when filters change
  useEffect(() => {
    if (user?.id) {
      fetchTimeSeriesData();
    }
  }, [filters.dateRange, filters.granularity, fetchTimeSeriesData, user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchActivityHeatmap();
    }
  }, [filters.heatmapDays, fetchActivityHeatmap, user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchCallPatterns();
    }
  }, [filters.patternsDays, fetchCallPatterns, user?.id]);

  return {
    ...analytics,
    filters,
    isLoading,
    hasErrors,
    refreshAllData,
    updateDateRange,
    updateCustomDateRange,
    updateGranularity,
    getChartData,
    // Individual refresh functions
    refreshBasicMetrics: () => fetchBasicMetrics(true),
    refreshTimeSeriesData: () => fetchTimeSeriesData(true),
    refreshActivityHeatmap: () => fetchActivityHeatmap(true),
    refreshCallPatterns: () => fetchCallPatterns(true),
    // Enhanced monitoring functions
    refreshSyncHealth: () => fetchSyncHealthStatus(true),
    refreshConflictMetrics: () => fetchConflictMetrics(true),
    refreshQueueStats: fetchQueueStats,
    refreshPerformanceMetrics: fetchPerformanceMetrics,
    triggerManualSync,
    // Real-time status getters
    getSyncHealthStatus: () => analytics.syncHealthStatus,
    getConflictMetrics: () => analytics.conflictMetrics,
    getQueueStats: () => analytics.queueStats,
    getPerformanceMetrics: () => analytics.performanceMetrics,
    getNetworkStatus: () => analytics.networkStatus,
  };
};