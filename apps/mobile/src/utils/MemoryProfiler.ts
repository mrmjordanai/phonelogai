/**
 * MemoryProfiler - Memory usage tracking and leak detection utility
 * 
 * Provides memory profiling capabilities for React Native apps with
 * leak detection, usage analysis, and optimization recommendations.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MemorySnapshot {
  timestamp: number;
  totalMemory: number;
  usedMemory: number;
  availableMemory: number;
  componentCount?: number;
  screenName?: string;
  memoryWarnings: number;
}

export interface MemoryLeak {
  detected: boolean;
  leakRate: number; // MB per minute
  startTime: number;
  endTime: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
}

export interface MemoryAnalysis {
  snapshots: MemorySnapshot[];
  leaks: MemoryLeak[];
  trends: {
    averageUsage: number;
    peakUsage: number;
    growthRate: number;
    stableAfterMinutes: number;
  };
  recommendations: string[];
}

class MemoryProfiler {
  private static instance: MemoryProfiler;
  private snapshots: MemorySnapshot[] = [];
  private isProfileing: boolean = false;
  private profilingInterval?: NodeJS.Timeout;
  private memoryWarningCount: number = 0;
  private componentRegistry: Set<string> = new Set();

  private constructor() {
    // Listen for memory warnings (platform specific)
    this.setupMemoryWarningListener();
  }

  public static getInstance(): MemoryProfiler {
    if (!MemoryProfiler.instance) {
      MemoryProfiler.instance = new MemoryProfiler();
    }
    return MemoryProfiler.instance;
  }

  /**
   * Start memory profiling
   */
  public startProfiling(intervalMs: number = 5000): void {
    if (this.isProfileing) {
      console.warn('[MemoryProfiler] Already profiling');
      return;
    }

    this.isProfileing = true;
    this.snapshots = [];
    this.memoryWarningCount = 0;

    console.log('[MemoryProfiler] Started profiling');

    // Take initial snapshot
    this.takeSnapshot();

    // Start periodic profiling
    this.profilingInterval = setInterval(() => {
      this.takeSnapshot();
    }, intervalMs);
  }

  /**
   * Stop memory profiling
   */
  public stopProfiling(): MemoryAnalysis {
    if (!this.isProfileing) {
      console.warn('[MemoryProfiler] Not currently profiling');
      return this.getEmptyAnalysis();
    }

    this.isProfileing = false;

    if (this.profilingInterval) {
      clearInterval(this.profilingInterval);
      this.profilingInterval = undefined;
    }

    console.log('[MemoryProfiler] Stopped profiling');

    // Analyze collected data
    return this.analyzeMemoryUsage();
  }

  /**
   * Take a memory snapshot
   */
  public takeSnapshot(screenName?: string): MemorySnapshot {
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      totalMemory: this.getTotalMemory(),
      usedMemory: this.getUsedMemory(),
      availableMemory: this.getAvailableMemory(),
      componentCount: this.componentRegistry.size,
      screenName,
      memoryWarnings: this.memoryWarningCount,
    };

    this.snapshots.push(snapshot);

    // Keep only recent snapshots to prevent memory issues
    if (this.snapshots.length > 1000) {
      this.snapshots = this.snapshots.slice(-1000);
    }

    console.log(`[MemoryProfiler] Snapshot: ${snapshot.usedMemory}MB used, ${snapshot.availableMemory}MB available`);

    return snapshot;
  }

  /**
   * Register a component for tracking
   */
  public registerComponent(componentName: string): void {
    this.componentRegistry.add(componentName);
    console.log(`[MemoryProfiler] Registered component: ${componentName} (total: ${this.componentRegistry.size})`);
  }

  /**
   * Unregister a component
   */
  public unregisterComponent(componentName: string): void {
    this.componentRegistry.delete(componentName);
    console.log(`[MemoryProfiler] Unregistered component: ${componentName} (total: ${this.componentRegistry.size})`);
  }

  /**
   * Get current memory usage summary
   */
  public getMemorySummary(): {
    current: MemorySnapshot;
    peak: MemorySnapshot;
    average: number;
    componentCount: number;
  } {
    const current = this.takeSnapshot();
    const peak = this.snapshots.reduce((max, snapshot) => 
      snapshot.usedMemory > max.usedMemory ? snapshot : max,
      this.snapshots[0] || current
    );
    
    const average = this.snapshots.length > 0
      ? this.snapshots.reduce((sum, s) => sum + s.usedMemory, 0) / this.snapshots.length
      : current.usedMemory;

    return {
      current,
      peak,
      average,
      componentCount: this.componentRegistry.size,
    };
  }

  /**
   * Detect memory leaks
   */
  public detectMemoryLeaks(): MemoryLeak[] {
    if (this.snapshots.length < 10) {
      return [];
    }

    const leaks: MemoryLeak[] = [];
    const recentSnapshots = this.snapshots.slice(-20); // Last 20 snapshots
    
    // Calculate memory growth rate
    const timeRange = recentSnapshots[recentSnapshots.length - 1].timestamp - recentSnapshots[0].timestamp;
    const memoryGrowth = recentSnapshots[recentSnapshots.length - 1].usedMemory - recentSnapshots[0].usedMemory;
    const growthRatePerMinute = (memoryGrowth / timeRange) * 60000; // MB per minute

    // Check for consistent memory growth
    if (growthRatePerMinute > 0.5) { // More than 0.5MB per minute
      let severity: 'low' | 'medium' | 'high' = 'low';
      let description = '';
      let recommendation = '';

      if (growthRatePerMinute > 2) {
        severity = 'high';
        description = `Severe memory leak detected: ${growthRatePerMinute.toFixed(2)}MB per minute growth`;
        recommendation = 'Immediately investigate event listeners, timers, and component cleanup';
      } else if (growthRatePerMinute > 1) {
        severity = 'medium';
        description = `Moderate memory leak detected: ${growthRatePerMinute.toFixed(2)}MB per minute growth`;
        recommendation = 'Check for unsubscribed event listeners and unreleased references';
      } else {
        severity = 'low';
        description = `Minor memory leak detected: ${growthRatePerMinute.toFixed(2)}MB per minute growth`;
        recommendation = 'Monitor for continued growth and optimize component lifecycle';
      }

      leaks.push({
        detected: true,
        leakRate: growthRatePerMinute,
        startTime: recentSnapshots[0].timestamp,
        endTime: recentSnapshots[recentSnapshots.length - 1].timestamp,
        severity,
        description,
        recommendation,
      });
    }

    // Check for sudden memory spikes
    const spikes = this.detectMemorySpikes();
    leaks.push(...spikes);

    return leaks;
  }

  /**
   * Detect memory spikes
   */
  private detectMemorySpikes(): MemoryLeak[] {
    if (this.snapshots.length < 5) return [];

    const spikes: MemoryLeak[] = [];
    
    for (let i = 4; i < this.snapshots.length; i++) {
      const current = this.snapshots[i];
      const previous = this.snapshots.slice(i - 4, i);
      const averagePrevious = previous.reduce((sum, s) => sum + s.usedMemory, 0) / previous.length;
      
      // Check for 50%+ increase from average
      if (current.usedMemory > averagePrevious * 1.5) {
        spikes.push({
          detected: true,
          leakRate: current.usedMemory - averagePrevious,
          startTime: previous[0].timestamp,
          endTime: current.timestamp,
          severity: current.usedMemory > 150 ? 'high' : 'medium',
          description: `Memory spike detected: ${(current.usedMemory - averagePrevious).toFixed(1)}MB increase`,
          recommendation: 'Check for large data structures or images being loaded',
        });
      }
    }

    return spikes;
  }

  /**
   * Analyze memory usage patterns
   */
  private analyzeMemoryUsage(): MemoryAnalysis {
    if (this.snapshots.length === 0) {
      return this.getEmptyAnalysis();
    }

    const usedMemories = this.snapshots.map(s => s.usedMemory);
    const averageUsage = usedMemories.reduce((sum, mem) => sum + mem, 0) / usedMemories.length;
    const peakUsage = Math.max(...usedMemories);
    
    // Calculate growth rate
    const timeSpan = this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp;
    const memoryChange = this.snapshots[this.snapshots.length - 1].usedMemory - this.snapshots[0].usedMemory;
    const growthRate = (memoryChange / timeSpan) * 60000; // MB per minute

    // Find stabilization point
    const stableAfterMinutes = this.findStabilizationPoint();

    // Detect leaks
    const leaks = this.detectMemoryLeaks();

    // Generate recommendations
    const recommendations = this.generateRecommendations(averageUsage, peakUsage, growthRate, leaks);

    return {
      snapshots: [...this.snapshots],
      leaks,
      trends: {
        averageUsage,
        peakUsage,
        growthRate,
        stableAfterMinutes,
      },
      recommendations,
    };
  }

  /**
   * Find when memory usage stabilizes
   */
  private findStabilizationPoint(): number {
    if (this.snapshots.length < 10) return 0;

    const windowSize = 5;
    const threshold = 5; // 5MB variance

    for (let i = windowSize; i < this.snapshots.length; i++) {
      const window = this.snapshots.slice(i - windowSize, i);
      const windowMemories = window.map(s => s.usedMemory);
      const variance = this.calculateVariance(windowMemories);
      
      if (variance < threshold) {
        const stabilizationTime = window[0].timestamp;
        const minutesFromStart = (stabilizationTime - this.snapshots[0].timestamp) / 60000;
        return minutesFromStart;
      }
    }

    return 0; // Never stabilized
  }

  /**
   * Calculate variance of an array
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    averageUsage: number,
    peakUsage: number,
    growthRate: number,
    leaks: MemoryLeak[]
  ): string[] {
    const recommendations: string[] = [];

    if (peakUsage > 150) {
      recommendations.push('Peak memory usage exceeds 150MB. Consider implementing lazy loading and data pagination.');
    }

    if (averageUsage > 100) {
      recommendations.push('Average memory usage is high. Optimize component rendering and reduce cached data.');
    }

    if (growthRate > 0.1) {
      recommendations.push('Memory usage shows upward trend. Check for memory leaks and improve cleanup.');
    }

    if (leaks.length > 0) {
      recommendations.push('Memory leaks detected. Review component unmounting and event listener cleanup.');
    }

    if (this.memoryWarningCount > 0) {
      recommendations.push(`${this.memoryWarningCount} memory warnings received. Implement memory pressure handling.`);
    }

    if (this.componentRegistry.size > 100) {
      recommendations.push('High component count detected. Consider component cleanup and virtualization.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Memory usage appears optimal. Continue monitoring for any changes.');
    }

    return recommendations;
  }

  /**
   * Get empty analysis structure
   */
  private getEmptyAnalysis(): MemoryAnalysis {
    return {
      snapshots: [],
      leaks: [],
      trends: {
        averageUsage: 0,
        peakUsage: 0,
        growthRate: 0,
        stableAfterMinutes: 0,
      },
      recommendations: ['No data available. Start profiling to analyze memory usage.'],
    };
  }

  /**
   * Setup memory warning listener (platform specific)
   */
  private setupMemoryWarningListener(): void {
    // This would be implemented with native modules in a real app
    // For now, we'll simulate it
    console.log('[MemoryProfiler] Memory warning listener setup (mock implementation)');
  }

  /**
   * Get total device memory (mock implementation)
   */
  private getTotalMemory(): number {
    // This would be implemented with native modules
    return 2048; // 2GB mock value
  }

  /**
   * Get used memory (mock implementation)
   */
  private getUsedMemory(): number {
    // This would be implemented with native modules
    // For now, simulate realistic values
    const base = 80;
    const variance = Math.random() * 40;
    return base + variance + (this.componentRegistry.size * 0.5);
  }

  /**
   * Get available memory (mock implementation)
   */
  private getAvailableMemory(): number {
    return this.getTotalMemory() - this.getUsedMemory();
  }

  /**
   * Export profiling data
   */
  public async exportProfilingData(): Promise<string> {
    const analysis = this.analyzeMemoryUsage();
    const summary = this.getMemorySummary();
    
    const exportData = {
      exportDate: new Date().toISOString(),
      summary,
      analysis,
      componentRegistry: Array.from(this.componentRegistry),
      isCurrentlyProfiling: this.isProfileing,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Save profiling session
   */
  public async saveSession(sessionName: string): Promise<void> {
    try {
      const analysis = this.analyzeMemoryUsage();
      const session = {
        sessionName,
        timestamp: Date.now(),
        analysis,
      };

      const existingSessions = await this.loadSessions();
      const updatedSessions = [session, ...existingSessions].slice(0, 10); // Keep last 10

      await AsyncStorage.setItem(
        '@memory_profiling_sessions',
        JSON.stringify(updatedSessions)
      );

      console.log(`[MemoryProfiler] Session saved: ${sessionName}`);
    } catch (error) {
      console.error('[MemoryProfiler] Failed to save session:', error);
    }
  }

  /**
   * Load saved sessions
   */
  public async loadSessions(): Promise<Array<{
    sessionName: string;
    timestamp: number;
    analysis: MemoryAnalysis;
  }>> {
    try {
      const stored = await AsyncStorage.getItem('@memory_profiling_sessions');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[MemoryProfiler] Failed to load sessions:', error);
      return [];
    }
  }

  /**
   * Clear all profiling data
   */
  public clearData(): void {
    this.snapshots = [];
    this.componentRegistry.clear();
    this.memoryWarningCount = 0;
    console.log('[MemoryProfiler] All data cleared');
  }

  /**
   * Simulate memory warning (for testing)
   */
  public simulateMemoryWarning(): void {
    this.memoryWarningCount++;
    console.warn(`[MemoryProfiler] Memory warning received (total: ${this.memoryWarningCount})`);
  }
}

export default MemoryProfiler;