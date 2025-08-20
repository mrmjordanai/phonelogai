/**
 * PerformanceMonitor - Core mobile app performance monitoring service
 * 
 * Tracks startup time, navigation performance, memory usage, and other
 * critical mobile performance metrics with minimal overhead.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface PerformanceMetrics {
  startupTime: number;
  navigationTimes: Record<string, number>;
  memoryUsage: {
    used: number;
    available: number;
    total: number;
    timestamp: number;
  }[];
  bundleSize?: {
    jsBundle: number;
    totalAssets: number;
  };
  networkMetrics: {
    requestCount: number;
    totalBytes: number;
    averageLatency: number;
    failedRequests: number;
  };
  screenMetrics: Record<string, {
    renderTime: number;
    mountTime: number;
    lastAccessed: number;
    accessCount: number;
  }>;
}

export interface PerformanceConfig {
  enableMemoryTracking: boolean;
  enableNavigationTracking: boolean;
  enableNetworkTracking: boolean;
  memoryTrackingInterval: number; // ms
  maxStoredMetrics: number;
  enablePersistence: boolean;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics;
  private config: PerformanceConfig;
  private appStartTime: number;
  private memoryInterval?: NodeJS.Timeout;
  private navigationStartTime: number = 0;
  private isInitialized: boolean = false;

  private constructor() {
    this.appStartTime = Date.now();
    this.config = {
      enableMemoryTracking: true,
      enableNavigationTracking: true,
      enableNetworkTracking: true,
      memoryTrackingInterval: 5000, // 5 seconds
      maxStoredMetrics: 100,
      enablePersistence: true,
    };
    
    this.metrics = {
      startupTime: 0,
      navigationTimes: {},
      memoryUsage: [],
      networkMetrics: {
        requestCount: 0,
        totalBytes: 0,
        averageLatency: 0,
        failedRequests: 0,
      },
      screenMetrics: {},
    };
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Initialize the performance monitor
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load persisted metrics if enabled
      if (this.config.enablePersistence) {
        await this.loadPersistedMetrics();
      }

      // Start memory tracking
      if (this.config.enableMemoryTracking) {
        this.startMemoryTracking();
      }

      this.isInitialized = true;
      console.log('[PerformanceMonitor] Initialized successfully');
    } catch (error) {
      console.error('[PerformanceMonitor] Initialization failed:', error);
    }
  }

  /**
   * Record app startup completion
   */
  public recordStartupComplete(): void {
    const startupTime = Date.now() - this.appStartTime;
    this.metrics.startupTime = startupTime;
    
    console.log(`[PerformanceMonitor] App startup completed in ${startupTime}ms`);
    this.persistMetrics();
  }

  /**
   * Start tracking screen navigation
   */
  public startNavigationTracking(screenName: string): void {
    if (!this.config.enableNavigationTracking) return;
    
    this.navigationStartTime = Date.now();
    console.log(`[PerformanceMonitor] Navigation to ${screenName} started`);
  }

  /**
   * Complete screen navigation tracking
   */
  public completeNavigationTracking(screenName: string): void {
    if (!this.config.enableNavigationTracking || !this.navigationStartTime) return;
    
    const navigationTime = Date.now() - this.navigationStartTime;
    this.metrics.navigationTimes[screenName] = navigationTime;
    
    // Update screen metrics
    if (!this.metrics.screenMetrics[screenName]) {
      this.metrics.screenMetrics[screenName] = {
        renderTime: 0,
        mountTime: 0,
        lastAccessed: 0,
        accessCount: 0,
      };
    }
    
    this.metrics.screenMetrics[screenName].lastAccessed = Date.now();
    this.metrics.screenMetrics[screenName].accessCount += 1;
    
    console.log(`[PerformanceMonitor] Navigation to ${screenName} completed in ${navigationTime}ms`);
    this.persistMetrics();
  }

  /**
   * Record screen render performance
   */
  public recordScreenRender(screenName: string, renderTime: number): void {
    if (!this.metrics.screenMetrics[screenName]) {
      this.metrics.screenMetrics[screenName] = {
        renderTime: 0,
        mountTime: 0,
        lastAccessed: 0,
        accessCount: 0,
      };
    }
    
    this.metrics.screenMetrics[screenName].renderTime = renderTime;
    console.log(`[PerformanceMonitor] Screen ${screenName} rendered in ${renderTime}ms`);
  }

  /**
   * Record screen mount performance
   */
  public recordScreenMount(screenName: string, mountTime: number): void {
    if (!this.metrics.screenMetrics[screenName]) {
      this.metrics.screenMetrics[screenName] = {
        renderTime: 0,
        mountTime: 0,
        lastAccessed: 0,
        accessCount: 0,
      };
    }
    
    this.metrics.screenMetrics[screenName].mountTime = mountTime;
    console.log(`[PerformanceMonitor] Screen ${screenName} mounted in ${mountTime}ms`);
  }

  /**
   * Record network request performance
   */
  public recordNetworkRequest(
    url: string,
    method: string,
    responseTime: number,
    bytes: number,
    success: boolean
  ): void {
    if (!this.config.enableNetworkTracking) return;
    
    this.metrics.networkMetrics.requestCount += 1;
    this.metrics.networkMetrics.totalBytes += bytes;
    
    // Update average latency
    const currentAvg = this.metrics.networkMetrics.averageLatency;
    const count = this.metrics.networkMetrics.requestCount;
    this.metrics.networkMetrics.averageLatency = 
      (currentAvg * (count - 1) + responseTime) / count;
    
    if (!success) {
      this.metrics.networkMetrics.failedRequests += 1;
    }
    
    console.log(`[PerformanceMonitor] Network ${method} ${url}: ${responseTime}ms, ${bytes} bytes`);
  }

  /**
   * Get current memory usage (platform-specific implementation)
   */
  private getCurrentMemoryUsage(): { used: number; available: number; total: number } {
    // This is a simplified implementation
    // In a real app, you'd use native modules to get actual memory info
    const estimatedUsage = {
      used: Platform.OS === 'ios' ? 80 : 120, // MB estimate
      available: Platform.OS === 'ios' ? 1920 : 1880, // MB estimate
      total: 2000, // MB estimate
    };
    
    return estimatedUsage;
  }

  /**
   * Start automatic memory tracking
   */
  private startMemoryTracking(): void {
    this.memoryInterval = setInterval(() => {
      const memoryUsage = this.getCurrentMemoryUsage();
      
      this.metrics.memoryUsage.push({
        ...memoryUsage,
        timestamp: Date.now(),
      });
      
      // Keep only recent metrics
      if (this.metrics.memoryUsage.length > this.config.maxStoredMetrics) {
        this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-this.config.maxStoredMetrics);
      }
      
    }, this.config.memoryTrackingInterval);
  }

  /**
   * Stop memory tracking
   */
  public stopMemoryTracking(): void {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = undefined;
    }
  }

  /**
   * Get current performance metrics
   */
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance summary
   */
  public getPerformanceSummary(): {
    startup: { time: number; target: number; passes: boolean };
    navigation: { average: number; target: number; passes: boolean };
    memory: { current: number; peak: number; target: number; passes: boolean };
    network: { averageLatency: number; failureRate: number };
  } {
    const navigationTimes = Object.values(this.metrics.navigationTimes);
    const averageNavigation = navigationTimes.length > 0 
      ? navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length 
      : 0;
    
    const memoryUsages = this.metrics.memoryUsage.map(m => m.used);
    const currentMemory = memoryUsages[memoryUsages.length - 1] || 0;
    const peakMemory = memoryUsages.length > 0 ? Math.max(...memoryUsages) : 0;
    
    const networkFailureRate = this.metrics.networkMetrics.requestCount > 0
      ? (this.metrics.networkMetrics.failedRequests / this.metrics.networkMetrics.requestCount) * 100
      : 0;
    
    return {
      startup: {
        time: this.metrics.startupTime,
        target: 2000, // 2 seconds
        passes: this.metrics.startupTime < 2000,
      },
      navigation: {
        average: averageNavigation,
        target: 100, // 100ms
        passes: averageNavigation < 100,
      },
      memory: {
        current: currentMemory,
        peak: peakMemory,
        target: 100, // 100MB
        passes: peakMemory < 100,
      },
      network: {
        averageLatency: this.metrics.networkMetrics.averageLatency,
        failureRate: networkFailureRate,
      },
    };
  }

  /**
   * Check if performance targets are being met
   */
  public checkPerformanceTargets(): {
    allTargetsMet: boolean;
    issues: string[];
    warnings: string[];
  } {
    const summary = this.getPerformanceSummary();
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Check startup time
    if (!summary.startup.passes) {
      issues.push(`Startup time (${summary.startup.time}ms) exceeds target (${summary.startup.target}ms)`);
    } else if (summary.startup.time > summary.startup.target * 0.8) {
      warnings.push(`Startup time approaching target: ${summary.startup.time}ms`);
    }
    
    // Check navigation performance
    if (!summary.navigation.passes) {
      issues.push(`Average navigation time (${summary.navigation.average.toFixed(1)}ms) exceeds target (${summary.navigation.target}ms)`);
    }
    
    // Check memory usage
    if (!summary.memory.passes) {
      issues.push(`Peak memory usage (${summary.memory.peak}MB) exceeds target (${summary.memory.target}MB)`);
    } else if (summary.memory.peak > summary.memory.target * 0.8) {
      warnings.push(`Memory usage approaching target: ${summary.memory.peak}MB`);
    }
    
    // Check network performance
    if (summary.network.failureRate > 5) {
      issues.push(`Network failure rate (${summary.network.failureRate.toFixed(1)}%) is too high`);
    }
    
    if (summary.network.averageLatency > 3000) {
      warnings.push(`High network latency: ${summary.network.averageLatency.toFixed(0)}ms`);
    }
    
    return {
      allTargetsMet: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Reset all metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      startupTime: 0,
      navigationTimes: {},
      memoryUsage: [],
      networkMetrics: {
        requestCount: 0,
        totalBytes: 0,
        averageLatency: 0,
        failedRequests: 0,
      },
      screenMetrics: {},
    };
    
    console.log('[PerformanceMonitor] Metrics reset');
  }

  /**
   * Persist metrics to AsyncStorage
   */
  private async persistMetrics(): Promise<void> {
    if (!this.config.enablePersistence) return;
    
    try {
      await AsyncStorage.setItem(
        '@performance_metrics',
        JSON.stringify(this.metrics)
      );
    } catch (error) {
      console.error('[PerformanceMonitor] Failed to persist metrics:', error);
    }
  }

  /**
   * Load persisted metrics from AsyncStorage
   */
  private async loadPersistedMetrics(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('@performance_metrics');
      if (stored) {
        const parsedMetrics = JSON.parse(stored);
        // Merge with current metrics, keeping startup time from current session
        this.metrics = {
          ...parsedMetrics,
          startupTime: this.metrics.startupTime,
        };
        console.log('[PerformanceMonitor] Loaded persisted metrics');
      }
    } catch (error) {
      console.error('[PerformanceMonitor] Failed to load persisted metrics:', error);
    }
  }

  /**
   * Configure performance monitoring
   */
  public configure(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[PerformanceMonitor] Configuration updated:', config);
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopMemoryTracking();
    console.log('[PerformanceMonitor] Cleanup completed');
  }
}

export default PerformanceMonitor;