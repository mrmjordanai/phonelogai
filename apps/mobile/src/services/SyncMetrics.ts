import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncResult, NetworkInfo } from './SyncService';
import { QueueStats } from './OfflineQueue';

export interface SyncMetric {
  timestamp: Date;
  duration: number; // milliseconds
  processedItems: number;
  failedItems: number;
  bytesTransferred: number;
  networkType: string;
  networkStrength?: number;
  queueDepthBefore: number;
  queueDepthAfter: number;
  success: boolean;
  errorTypes: string[];
}

// Type for serialized metric (timestamp as string)
interface SerializedSyncMetric {
  timestamp: string;
  duration: number;
  processedItems: number;
  failedItems: number;
  bytesTransferred: number;
  networkType: string;
  networkStrength?: number;
  queueDepthBefore: number;
  queueDepthAfter: number;
  success: boolean;
  errorTypes: string[];
}

export interface PerformanceMetrics {
  // Latency metrics
  averageLatency: number;
  medianLatency: number;
  p95Latency: number;
  p99Latency: number;
  
  // Throughput metrics
  averageThroughput: number; // items per second
  peakThroughput: number;
  averageBandwidth: number; // bytes per second
  
  // Success metrics
  successRate: number; // percentage
  errorRate: number; // percentage
  retryRate: number; // percentage
  
  // Queue metrics
  averageQueueDepth: number;
  maxQueueDepth: number;
  queueGrowthRate: number; // items per hour
  
  // Temporal metrics
  timeRange: {
    start: Date;
    end: Date;
    duration: number; // milliseconds
  };
  
  sampleSize: number;
}

export interface NetworkMetrics {
  connectionTypes: Record<string, number>; // count by type
  averageStrength: number;
  disconnectionEvents: number;
  failuresByNetworkType: Record<string, number>;
}

export interface DriftAnalysis {
  temporalDrift: {
    expectedSyncInterval: number; // milliseconds
    actualSyncInterval: number; // milliseconds
    variance: number;
  };
  dataDrift: {
    expectedThroughput: number; // items per sync
    actualThroughput: number; // items per sync
    variance: number;
  };
  qualityDrift: {
    baselineSuccessRate: number;
    currentSuccessRate: number;
    degradation: number;
  };
}

export interface BatteryImpactMetrics {
  totalCpuTime: number; // milliseconds
  averageCpuPerSync: number; // milliseconds
  networkActiveTime: number; // milliseconds
  backgroundProcessingTime: number; // milliseconds
  estimatedBatteryUsage: number; // percentage
}

class SyncMetricsCollector {
  private static instance: SyncMetricsCollector;
  private metrics: SyncMetric[] = [];
  private readonly STORAGE_KEY = '@phonelogai:sync_metrics';
  private readonly MAX_METRICS = 1000; // Keep last 1000 sync operations
  private readonly BATTERY_SAMPLING_RATE = 0.1; // 10% of operations for battery impact
  
  // Performance baselines (updated periodically)
  private baselines = {
    latency: 5000, // 5 seconds
    throughput: 10, // 10 items per second
    successRate: 95, // 95%
    queueDepth: 100 // 100 items
  };
  
  // Battery impact tracking
  private batteryMetrics: BatteryImpactMetrics = {
    totalCpuTime: 0,
    averageCpuPerSync: 0,
    networkActiveTime: 0,
    backgroundProcessingTime: 0,
    estimatedBatteryUsage: 0
  };

  private constructor() {}

  public static getInstance(): SyncMetricsCollector {
    if (!SyncMetricsCollector.instance) {
      SyncMetricsCollector.instance = new SyncMetricsCollector();
    }
    return SyncMetricsCollector.instance;
  }

  /**
   * Initialize metrics collector
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadMetricsFromStorage();
      await this.updateBaselines();
      console.log(`Loaded ${this.metrics.length} sync metrics`);
    } catch (error) {
      console.error('Failed to initialize SyncMetricsCollector:', error);
    }
  }

  /**
   * Record a sync operation
   */
  public async recordSync(
    syncResult: SyncResult,
    queueStatsBefore: QueueStats,
    queueStatsAfter: QueueStats,
    networkInfo: NetworkInfo
  ): Promise<void> {
    const startTime = performance.now();
    
    try {
      const metric: SyncMetric = {
        timestamp: new Date(),
        duration: syncResult.duration,
        processedItems: syncResult.processedItems,
        failedItems: syncResult.failedItems,
        bytesTransferred: syncResult.bytesTransferred,
        networkType: networkInfo.connectionType,
        networkStrength: networkInfo.strength,
        queueDepthBefore: queueStatsBefore.totalItems,
        queueDepthAfter: queueStatsAfter.totalItems,
        success: syncResult.success,
        errorTypes: this.extractErrorTypes(syncResult.errors)
      };

      this.metrics.push(metric);
      
      // Maintain max size
      if (this.metrics.length > this.MAX_METRICS) {
        this.metrics = this.metrics.slice(-this.MAX_METRICS);
      }

      // Record battery impact (sample only some operations to reduce overhead)
      if (Math.random() < this.BATTERY_SAMPLING_RATE) {
        await this.recordBatteryImpact(metric);
      }

      // Persist to storage (async, don't wait)
      this.saveMetricsToStorage().catch(error => 
        console.error('Failed to save metrics:', error)
      );

      const processingTime = performance.now() - startTime;
      console.log(`Recorded sync metric in ${processingTime.toFixed(2)}ms`);
      
    } catch (error) {
      console.error('Failed to record sync metric:', error);
    }
  }

  /**
   * Get performance metrics for a time period
   */
  public getPerformanceMetrics(
    startDate?: Date,
    endDate?: Date,
    networkType?: string
  ): PerformanceMetrics {
    const filteredMetrics = this.filterMetrics(startDate, endDate, networkType);
    
    if (filteredMetrics.length === 0) {
      return this.getEmptyMetrics();
    }

    // Latency calculations
    const latencies = filteredMetrics.map(m => m.duration).sort((a, b) => a - b);
    const averageLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const medianLatency = this.calculatePercentile(latencies, 50);
    const p95Latency = this.calculatePercentile(latencies, 95);
    const p99Latency = this.calculatePercentile(latencies, 99);

    // Throughput calculations
    const throughputs = filteredMetrics
      .filter(m => m.duration > 0)
      .map(m => (m.processedItems + m.failedItems) / (m.duration / 1000));
    const averageThroughput = throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length || 0;
    const peakThroughput = Math.max(...throughputs, 0);

    // Bandwidth calculations
    const bandwidths = filteredMetrics
      .filter(m => m.duration > 0)
      .map(m => m.bytesTransferred / (m.duration / 1000));
    const averageBandwidth = bandwidths.reduce((sum, b) => sum + b, 0) / bandwidths.length || 0;

    // Success metrics
    const successfulSyncs = filteredMetrics.filter(m => m.success).length;
    const successRate = (successfulSyncs / filteredMetrics.length) * 100;
    const errorRate = 100 - successRate;
    
    // Calculate retry rate (syncs with errors that eventually succeeded)
    const retryRate = this.calculateRetryRate(filteredMetrics);

    // Queue metrics
    const queueDepths = filteredMetrics.map(m => m.queueDepthBefore);
    const averageQueueDepth = queueDepths.reduce((sum, d) => sum + d, 0) / queueDepths.length;
    const maxQueueDepth = Math.max(...queueDepths);
    const queueGrowthRate = this.calculateQueueGrowthRate(filteredMetrics);

    // Time range
    const timestamps = filteredMetrics.map(m => m.timestamp.getTime());
    const startTime = Math.min(...timestamps);
    const endTime = Math.max(...timestamps);

    return {
      averageLatency,
      medianLatency,
      p95Latency,
      p99Latency,
      averageThroughput,
      peakThroughput,
      averageBandwidth,
      successRate,
      errorRate,
      retryRate,
      averageQueueDepth,
      maxQueueDepth,
      queueGrowthRate,
      timeRange: {
        start: new Date(startTime),
        end: new Date(endTime),
        duration: endTime - startTime
      },
      sampleSize: filteredMetrics.length
    };
  }

  /**
   * Get network-specific metrics
   */
  public getNetworkMetrics(startDate?: Date, endDate?: Date): NetworkMetrics {
    const filteredMetrics = this.filterMetrics(startDate, endDate);
    
    // Connection type distribution
    const connectionTypes: Record<string, number> = {};
    const strengthValues: number[] = [];
    const failuresByType: Record<string, number> = {};
    let disconnectionEvents = 0;

    for (const metric of filteredMetrics) {
      // Count connection types
      connectionTypes[metric.networkType] = (connectionTypes[metric.networkType] || 0) + 1;
      
      // Collect strength values
      if (metric.networkStrength !== undefined) {
        strengthValues.push(metric.networkStrength);
      }
      
      // Count failures by network type
      if (!metric.success) {
        failuresByType[metric.networkType] = (failuresByType[metric.networkType] || 0) + 1;
      }
      
      // Count disconnection events
      if (metric.networkType === 'none' || metric.networkType === 'unknown') {
        disconnectionEvents++;
      }
    }

    const averageStrength = strengthValues.length > 0 
      ? strengthValues.reduce((sum, s) => sum + s, 0) / strengthValues.length 
      : 0;

    return {
      connectionTypes,
      averageStrength,
      disconnectionEvents,
      failuresByNetworkType: failuresByType
    };
  }

  /**
   * Calculate data drift using temporal analysis
   */
  public calculateDataDrift(comparisonPeriodDays: number = 7): DriftAnalysis {
    const now = new Date();
    const comparisonStart = new Date(now.getTime() - (comparisonPeriodDays * 24 * 60 * 60 * 1000));
    
    const recentMetrics = this.filterMetrics(comparisonStart, now);
    const historicalMetrics = this.filterMetrics(
      new Date(comparisonStart.getTime() - (comparisonPeriodDays * 24 * 60 * 60 * 1000)),
      comparisonStart
    );

    if (recentMetrics.length === 0 || historicalMetrics.length === 0) {
      return this.getEmptyDriftAnalysis();
    }

    // Temporal drift (sync intervals)
    const recentIntervals = this.calculateSyncIntervals(recentMetrics);
    const historicalIntervals = this.calculateSyncIntervals(historicalMetrics);
    
    const expectedSyncInterval = this.calculateAverage(historicalIntervals);
    const actualSyncInterval = this.calculateAverage(recentIntervals);
    const temporalVariance = Math.abs(actualSyncInterval - expectedSyncInterval) / expectedSyncInterval;

    // Data drift (throughput)
    const recentThroughputs = recentMetrics.map(m => m.processedItems + m.failedItems);
    const historicalThroughputs = historicalMetrics.map(m => m.processedItems + m.failedItems);
    
    const expectedThroughput = this.calculateAverage(historicalThroughputs);
    const actualThroughput = this.calculateAverage(recentThroughputs);
    const dataDriftVariance = Math.abs(actualThroughput - expectedThroughput) / expectedThroughput;

    // Quality drift (success rates)
    const recentSuccessRate = (recentMetrics.filter(m => m.success).length / recentMetrics.length) * 100;
    const historicalSuccessRate = (historicalMetrics.filter(m => m.success).length / historicalMetrics.length) * 100;
    const qualityDegradation = historicalSuccessRate - recentSuccessRate;

    return {
      temporalDrift: {
        expectedSyncInterval,
        actualSyncInterval,
        variance: temporalVariance
      },
      dataDrift: {
        expectedThroughput,
        actualThroughput,
        variance: dataDriftVariance
      },
      qualityDrift: {
        baselineSuccessRate: historicalSuccessRate,
        currentSuccessRate: recentSuccessRate,
        degradation: qualityDegradation
      }
    };
  }

  /**
   * Get battery impact metrics
   */
  public getBatteryImpactMetrics(): BatteryImpactMetrics {
    return { ...this.batteryMetrics };
  }

  /**
   * Analyze performance trends
   */
  public analyzePerformanceTrends(days: number = 30): {
    latencyTrend: 'improving' | 'stable' | 'degrading';
    throughputTrend: 'improving' | 'stable' | 'degrading';
    successRateTrend: 'improving' | 'stable' | 'degrading';
    recommendations: string[];
  } {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
    const midDate = new Date(startDate.getTime() + ((endDate.getTime() - startDate.getTime()) / 2));
    
    const firstHalf = this.getPerformanceMetrics(startDate, midDate);
    const secondHalf = this.getPerformanceMetrics(midDate, endDate);
    
    const recommendations: string[] = [];
    
    // Analyze latency trend
    let latencyTrend: 'improving' | 'stable' | 'degrading' = 'stable';
    const latencyChange = ((secondHalf.averageLatency - firstHalf.averageLatency) / firstHalf.averageLatency) * 100;
    
    if (latencyChange > 20) {
      latencyTrend = 'degrading';
      recommendations.push('Sync latency has increased significantly. Check network conditions and server performance.');
    } else if (latencyChange < -20) {
      latencyTrend = 'improving';
      recommendations.push('Sync latency improvements detected. Current optimizations are working well.');
    }

    // Analyze throughput trend
    let throughputTrend: 'improving' | 'stable' | 'degrading' = 'stable';
    const throughputChange = ((secondHalf.averageThroughput - firstHalf.averageThroughput) / firstHalf.averageThroughput) * 100;
    
    if (throughputChange < -20) {
      throughputTrend = 'degrading';
      recommendations.push('Sync throughput has decreased. Consider optimizing batch sizes or network settings.');
    } else if (throughputChange > 20) {
      throughputTrend = 'improving';
    }

    // Analyze success rate trend
    let successRateTrend: 'improving' | 'stable' | 'degrading' = 'stable';
    const successRateChange = secondHalf.successRate - firstHalf.successRate;
    
    if (successRateChange < -5) {
      successRateTrend = 'degrading';
      recommendations.push('Sync reliability has decreased. Review error patterns and network stability.');
    } else if (successRateChange > 5) {
      successRateTrend = 'improving';
    }

    // General recommendations
    if (secondHalf.averageQueueDepth > this.baselines.queueDepth) {
      recommendations.push('Queue depth is above baseline. Consider increasing sync frequency.');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Performance metrics are stable. No immediate action required.');
    }

    return {
      latencyTrend,
      throughputTrend,
      successRateTrend,
      recommendations
    };
  }

  /**
   * Clear old metrics to free storage
   */
  public async clearOldMetrics(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
    const initialCount = this.metrics.length;
    
    this.metrics = this.metrics.filter(metric => metric.timestamp > cutoffDate);
    
    const removedCount = initialCount - this.metrics.length;
    
    if (removedCount > 0) {
      await this.saveMetricsToStorage();
      console.log(`Cleared ${removedCount} old metrics`);
    }
    
    return removedCount;
  }

  /**
   * Export metrics for analysis
   */
  public exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'timestamp', 'duration', 'processedItems', 'failedItems', 'bytesTransferred',
        'networkType', 'networkStrength', 'queueDepthBefore', 'queueDepthAfter', 'success'
      ];
      
      const csvRows = [
        headers.join(','),
        ...this.metrics.map(metric => [
          metric.timestamp.toISOString(),
          metric.duration,
          metric.processedItems,
          metric.failedItems,
          metric.bytesTransferred,
          metric.networkType,
          metric.networkStrength || '',
          metric.queueDepthBefore,
          metric.queueDepthAfter,
          metric.success
        ].join(','))
      ];
      
      return csvRows.join('\n');
    } else {
      return JSON.stringify(this.metrics, null, 2);
    }
  }

  // Private helper methods

  private filterMetrics(startDate?: Date, endDate?: Date, networkType?: string): SyncMetric[] {
    return this.metrics.filter(metric => {
      if (startDate && metric.timestamp < startDate) return false;
      if (endDate && metric.timestamp > endDate) return false;
      if (networkType && metric.networkType !== networkType) return false;
      return true;
    });
  }

  private extractErrorTypes(errors: string[]): string[] {
    return errors.map(error => {
      // Extract error type from error message
      if (error.includes('network')) return 'network';
      if (error.includes('timeout')) return 'timeout';
      if (error.includes('auth')) return 'authentication';
      if (error.includes('permission')) return 'permission';
      if (error.includes('storage')) return 'storage';
      return 'unknown';
    }).filter((type, index, array) => array.indexOf(type) === index); // Remove duplicates
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  private calculateRetryRate(metrics: SyncMetric[]): number {
    // This is a simplified calculation - in reality, you'd need to track retry chains
    const totalSyncs = metrics.length;
    // Track syncs with errors for potential future use
    // const _syncsWithErrors = metrics.filter(m => m.errorTypes.length > 0).length;
    const successfulSyncsWithErrors = metrics.filter(m => m.success && m.errorTypes.length > 0).length;
    
    return totalSyncs > 0 ? (successfulSyncsWithErrors / totalSyncs) * 100 : 0;
  }

  private calculateQueueGrowthRate(metrics: SyncMetric[]): number {
    if (metrics.length < 2) return 0;
    
    const sortedMetrics = metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const timeSpan = sortedMetrics[sortedMetrics.length - 1].timestamp.getTime() - sortedMetrics[0].timestamp.getTime();
    const queueGrowth = sortedMetrics[sortedMetrics.length - 1].queueDepthAfter - sortedMetrics[0].queueDepthBefore;
    
    // Convert to items per hour
    return (queueGrowth / (timeSpan / (60 * 60 * 1000)));
  }

  private calculateSyncIntervals(metrics: SyncMetric[]): number[] {
    if (metrics.length < 2) return [];
    
    const sortedMetrics = metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const intervals: number[] = [];
    
    for (let i = 1; i < sortedMetrics.length; i++) {
      const interval = sortedMetrics[i].timestamp.getTime() - sortedMetrics[i - 1].timestamp.getTime();
      intervals.push(interval);
    }
    
    return intervals;
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  private async recordBatteryImpact(metric: SyncMetric): Promise<void> {
    try {
      // Estimate CPU time based on processing complexity
      const estimatedCpuTime = Math.log(metric.processedItems + 1) * 100 + metric.duration * 0.1;
      
      // Update battery metrics
      this.batteryMetrics.totalCpuTime += estimatedCpuTime;
      this.batteryMetrics.averageCpuPerSync = this.batteryMetrics.totalCpuTime / this.metrics.length;
      this.batteryMetrics.networkActiveTime += metric.duration;
      
      // Simplified battery usage estimation (would need platform-specific APIs for accuracy)
      this.batteryMetrics.estimatedBatteryUsage = Math.min(100, this.batteryMetrics.totalCpuTime / 100000);
      
    } catch (error) {
      console.error('Failed to record battery impact:', error);
    }
  }

  private async updateBaselines(): Promise<void> {
    if (this.metrics.length < 10) return; // Need sufficient data
    
    const recentMetrics = this.metrics.slice(-100); // Last 100 operations
    
    const latencies = recentMetrics.map(m => m.duration);
    const throughputs = recentMetrics
      .filter(m => m.duration > 0)
      .map(m => (m.processedItems + m.failedItems) / (m.duration / 1000));
    const successRate = (recentMetrics.filter(m => m.success).length / recentMetrics.length) * 100;
    const queueDepths = recentMetrics.map(m => m.queueDepthBefore);
    
    this.baselines = {
      latency: this.calculatePercentile(latencies.sort((a, b) => a - b), 50),
      throughput: this.calculateAverage(throughputs),
      successRate,
      queueDepth: this.calculateAverage(queueDepths)
    };
  }

  private async loadMetricsFromStorage(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.metrics = parsed.map((metric: SerializedSyncMetric) => ({
          ...metric,
          timestamp: new Date(metric.timestamp)
        }));
      }
    } catch (error) {
      console.error('Failed to load metrics from storage:', error);
      this.metrics = [];
    }
  }

  private async saveMetricsToStorage(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.metrics));
    } catch (error) {
      console.error('Failed to save metrics to storage:', error);
    }
  }

  private getEmptyMetrics(): PerformanceMetrics {
    const now = new Date();
    return {
      averageLatency: 0,
      medianLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      averageThroughput: 0,
      peakThroughput: 0,
      averageBandwidth: 0,
      successRate: 0,
      errorRate: 0,
      retryRate: 0,
      averageQueueDepth: 0,
      maxQueueDepth: 0,
      queueGrowthRate: 0,
      timeRange: {
        start: now,
        end: now,
        duration: 0
      },
      sampleSize: 0
    };
  }

  private getEmptyDriftAnalysis(): DriftAnalysis {
    return {
      temporalDrift: {
        expectedSyncInterval: 0,
        actualSyncInterval: 0,
        variance: 0
      },
      dataDrift: {
        expectedThroughput: 0,
        actualThroughput: 0,
        variance: 0
      },
      qualityDrift: {
        baselineSuccessRate: 0,
        currentSuccessRate: 0,
        degradation: 0
      }
    };
  }
}

export const SyncMetrics = SyncMetricsCollector.getInstance();