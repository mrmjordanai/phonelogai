/**
 * MetricsCollector - Advanced metrics collection and analysis service
 * 
 * Collects detailed performance metrics, analyzes trends, and provides
 * actionable insights for mobile app optimization.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import PerformanceMonitor, { PerformanceMetrics } from './PerformanceMonitor';

export interface MetricsTrend {
  metric: string;
  values: number[];
  timestamps: number[];
  trend: 'improving' | 'degrading' | 'stable';
  trendPercentage: number;
}

export interface PerformanceInsight {
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  description: string;
  recommendation?: string;
  impact: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface MetricsSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  platform: string;
  deviceInfo: {
    model?: string;
    os?: string;
    version?: string;
  };
  metrics: PerformanceMetrics;
  insights: PerformanceInsight[];
}

export interface MetricsAnalysis {
  trends: MetricsTrend[];
  insights: PerformanceInsight[];
  summary: {
    sessionsAnalyzed: number;
    timeRange: { start: number; end: number };
    averageStartupTime: number;
    averageNavigationTime: number;
    averageMemoryUsage: number;
    topPerformanceIssues: string[];
  };
}

class MetricsCollector {
  private static instance: MetricsCollector;
  private currentSession: MetricsSession | null = null;
  private performanceMonitor: PerformanceMonitor;
  private insights: PerformanceInsight[] = [];
  private isCollecting: boolean = false;

  private constructor() {
    this.performanceMonitor = PerformanceMonitor.getInstance();
  }

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Start a new metrics collection session
   */
  public async startSession(deviceInfo?: {
    model?: string;
    os?: string;
    version?: string;
  }): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      sessionId,
      startTime: Date.now(),
      platform: 'mobile',
      deviceInfo: deviceInfo || {},
      metrics: this.performanceMonitor.getMetrics(),
      insights: [],
    };
    
    this.isCollecting = true;
    console.log(`[MetricsCollector] Started session: ${sessionId}`);
    
    // Schedule periodic collection
    this.scheduleMetricsCollection();
    
    return sessionId;
  }

  /**
   * End the current metrics collection session
   */
  public async endSession(): Promise<MetricsSession | null> {
    if (!this.currentSession) {
      console.warn('[MetricsCollector] No active session to end');
      return null;
    }
    
    this.currentSession.endTime = Date.now();
    this.currentSession.metrics = this.performanceMonitor.getMetrics();
    this.currentSession.insights = [...this.insights];
    
    // Analyze session performance
    await this.analyzeSessionPerformance();
    
    // Persist session
    await this.persistSession(this.currentSession);
    
    const completedSession = { ...this.currentSession };
    this.currentSession = null;
    this.isCollecting = false;
    this.insights = [];
    
    console.log(`[MetricsCollector] Ended session: ${completedSession.sessionId}`);
    return completedSession;
  }

  /**
   * Schedule periodic metrics collection
   */
  private scheduleMetricsCollection(): void {
    if (!this.isCollecting) return;
    
    setTimeout(() => {
      this.collectMetrics();
      this.scheduleMetricsCollection();
    }, 10000); // Collect every 10 seconds
  }

  /**
   * Collect current metrics and analyze
   */
  private collectMetrics(): void {
    if (!this.currentSession) return;
    
    const currentMetrics = this.performanceMonitor.getMetrics();
    this.currentSession.metrics = currentMetrics;
    
    // Analyze for potential issues
    this.analyzeCurrentMetrics(currentMetrics);
  }

  /**
   * Analyze current metrics for performance issues
   */
  private analyzeCurrentMetrics(metrics: PerformanceMetrics): void {
    const now = Date.now();
    
    // Check startup time
    if (metrics.startupTime > 2000) {
      this.addInsight({
        type: 'warning',
        title: 'Slow App Startup',
        description: `App startup took ${metrics.startupTime}ms, exceeding target of 2000ms`,
        recommendation: 'Consider reducing initial bundle size or optimizing app initialization',
        impact: 'high',
        timestamp: now,
      });
    }
    
    // Check navigation performance
    const navigationTimes = Object.values(metrics.navigationTimes);
    const slowNavigations = navigationTimes.filter(time => time > 100);
    if (slowNavigations.length > 0) {
      this.addInsight({
        type: 'warning',
        title: 'Slow Screen Navigation',
        description: `${slowNavigations.length} screen navigations exceeded 100ms target`,
        recommendation: 'Optimize component rendering and reduce component complexity',
        impact: 'medium',
        timestamp: now,
      });
    }
    
    // Check memory usage
    const recentMemory = metrics.memoryUsage.slice(-5); // Last 5 readings
    if (recentMemory.length > 0) {
      const averageMemory = recentMemory.reduce((sum, m) => sum + m.used, 0) / recentMemory.length;
      if (averageMemory > 100) {
        this.addInsight({
          type: 'error',
          title: 'High Memory Usage',
          description: `Average memory usage (${averageMemory.toFixed(1)}MB) exceeds 100MB target`,
          recommendation: 'Investigate memory leaks and optimize component memory usage',
          impact: 'high',
          timestamp: now,
        });
      }
    }
    
    // Check network performance
    if (metrics.networkMetrics.requestCount > 0) {
      const failureRate = (metrics.networkMetrics.failedRequests / metrics.networkMetrics.requestCount) * 100;
      if (failureRate > 5) {
        this.addInsight({
          type: 'error',
          title: 'High Network Failure Rate',
          description: `Network requests failing at ${failureRate.toFixed(1)}% rate`,
          recommendation: 'Improve error handling and implement retry mechanisms',
          impact: 'high',
          timestamp: now,
        });
      }
      
      if (metrics.networkMetrics.averageLatency > 3000) {
        this.addInsight({
          type: 'warning',
          title: 'High Network Latency',
          description: `Average network latency is ${metrics.networkMetrics.averageLatency.toFixed(0)}ms`,
          recommendation: 'Optimize API calls and implement caching strategies',
          impact: 'medium',
          timestamp: now,
        });
      }
    }
  }

  /**
   * Add a performance insight
   */
  private addInsight(insight: PerformanceInsight): void {
    // Avoid duplicate insights within 5 minutes
    const recentSimilar = this.insights.find(i => 
      i.title === insight.title && 
      (insight.timestamp - i.timestamp) < 300000
    );
    
    if (!recentSimilar) {
      this.insights.push(insight);
      console.log(`[MetricsCollector] New insight: ${insight.title}`);
    }
  }

  /**
   * Analyze session performance after completion
   */
  private async analyzeSessionPerformance(): Promise<void> {
    if (!this.currentSession) return;
    
    const session = this.currentSession;
    const duration = (session.endTime! - session.startTime) / 1000; // seconds
    
    // Session duration analysis
    if (duration < 30) {
      this.addInsight({
        type: 'info',
        title: 'Short Session',
        description: `Session lasted only ${duration.toFixed(1)} seconds`,
        impact: 'low',
        timestamp: Date.now(),
      });
    }
    
    // Screen usage analysis
    const screenMetrics = session.metrics.screenMetrics;
    const mostUsedScreen = Object.entries(screenMetrics)
      .sort(([,a], [,b]) => b.accessCount - a.accessCount)[0];
    
    if (mostUsedScreen) {
      const [screenName, metrics] = mostUsedScreen;
      if (metrics.renderTime > 500) {
        this.addInsight({
          type: 'warning',
          title: 'Slow Screen Rendering',
          description: `${screenName} screen takes ${metrics.renderTime}ms to render`,
          recommendation: 'Optimize component rendering and reduce complexity',
          impact: 'medium',
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Get current session insights
   */
  public getCurrentInsights(): PerformanceInsight[] {
    return [...this.insights];
  }

  /**
   * Get session history
   */
  public async getSessionHistory(limit: number = 10): Promise<MetricsSession[]> {
    try {
      const stored = await AsyncStorage.getItem('@metrics_sessions');
      if (!stored) return [];
      
      const sessions: MetricsSession[] = JSON.parse(stored);
      return sessions
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, limit);
    } catch (error) {
      console.error('[MetricsCollector] Failed to load session history:', error);
      return [];
    }
  }

  /**
   * Analyze performance trends across sessions
   */
  public async analyzeTrends(sessionCount: number = 10): Promise<MetricsAnalysis> {
    const sessions = await this.getSessionHistory(sessionCount);
    
    if (sessions.length === 0) {
      return {
        trends: [],
        insights: [],
        summary: {
          sessionsAnalyzed: 0,
          timeRange: { start: 0, end: 0 },
          averageStartupTime: 0,
          averageNavigationTime: 0,
          averageMemoryUsage: 0,
          topPerformanceIssues: [],
        },
      };
    }
    
    // Calculate trends
    const trends = this.calculateTrends(sessions);
    
    // Aggregate insights
    const allInsights = sessions.flatMap(s => s.insights);
    const uniqueInsights = this.deduplicateInsights(allInsights);
    
    // Calculate summary
    const summary = this.calculateSummary(sessions);
    
    return {
      trends,
      insights: uniqueInsights,
      summary,
    };
  }

  /**
   * Calculate performance trends
   */
  private calculateTrends(sessions: MetricsSession[]): MetricsTrend[] {
    const trends: MetricsTrend[] = [];
    
    // Startup time trend
    const startupTimes = sessions
      .filter(s => s.metrics.startupTime > 0)
      .map(s => ({ value: s.metrics.startupTime, timestamp: s.startTime }));
    
    if (startupTimes.length > 1) {
      trends.push(this.analyzeTrend('startupTime', startupTimes));
    }
    
    // Navigation time trend
    const navigationTimes = sessions.flatMap(s => 
      Object.values(s.metrics.navigationTimes).map(time => ({
        value: time,
        timestamp: s.startTime,
      }))
    );
    
    if (navigationTimes.length > 1) {
      trends.push(this.analyzeTrend('navigationTime', navigationTimes));
    }
    
    // Memory usage trend
    const memoryUsages = sessions.flatMap(s =>
      s.metrics.memoryUsage.map(m => ({
        value: m.used,
        timestamp: m.timestamp,
      }))
    );
    
    if (memoryUsages.length > 1) {
      trends.push(this.analyzeTrend('memoryUsage', memoryUsages));
    }
    
    return trends;
  }

  /**
   * Analyze trend for a specific metric
   */
  private analyzeTrend(
    metricName: string, 
    data: { value: number; timestamp: number }[]
  ): MetricsTrend {
    const sortedData = data.sort((a, b) => a.timestamp - b.timestamp);
    const values = sortedData.map(d => d.value);
    const timestamps = sortedData.map(d => d.timestamp);
    
    // Simple linear trend analysis
    const n = values.length;
    const sumX = timestamps.reduce((sum, t, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = timestamps.reduce((sum, t, i) => sum + i * values[i], 0);
    const sumXX = timestamps.reduce((sum, t, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const trendPercentage = (slope / (sumY / n)) * 100;
    
    let trend: 'improving' | 'degrading' | 'stable' = 'stable';
    if (Math.abs(trendPercentage) > 5) {
      // For metrics like startup time and navigation time, lower is better
      if (metricName === 'startupTime' || metricName === 'navigationTime') {
        trend = slope < 0 ? 'improving' : 'degrading';
      } else {
        trend = slope > 0 ? 'improving' : 'degrading';
      }
    }
    
    return {
      metric: metricName,
      values,
      timestamps,
      trend,
      trendPercentage: Math.abs(trendPercentage),
    };
  }

  /**
   * Deduplicate similar insights
   */
  private deduplicateInsights(insights: PerformanceInsight[]): PerformanceInsight[] {
    const unique = new Map<string, PerformanceInsight>();
    
    insights.forEach(insight => {
      const key = `${insight.title}_${insight.type}`;
      if (!unique.has(key) || insight.timestamp > unique.get(key)!.timestamp) {
        unique.set(key, insight);
      }
    });
    
    return Array.from(unique.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Calculate performance summary
   */
  private calculateSummary(sessions: MetricsSession[]): MetricsAnalysis['summary'] {
    const startupTimes = sessions
      .map(s => s.metrics.startupTime)
      .filter(t => t > 0);
    
    const navigationTimes = sessions.flatMap(s => 
      Object.values(s.metrics.navigationTimes)
    );
    
    const memoryUsages = sessions.flatMap(s =>
      s.metrics.memoryUsage.map(m => m.used)
    );
    
    // Count issue frequency
    const issueCount = new Map<string, number>();
    sessions.forEach(session => {
      session.insights.forEach(insight => {
        const count = issueCount.get(insight.title) || 0;
        issueCount.set(insight.title, count + 1);
      });
    });
    
    const topIssues = Array.from(issueCount.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([title]) => title);
    
    return {
      sessionsAnalyzed: sessions.length,
      timeRange: {
        start: Math.min(...sessions.map(s => s.startTime)),
        end: Math.max(...sessions.map(s => s.endTime || s.startTime)),
      },
      averageStartupTime: startupTimes.length > 0 
        ? startupTimes.reduce((sum, t) => sum + t, 0) / startupTimes.length 
        : 0,
      averageNavigationTime: navigationTimes.length > 0
        ? navigationTimes.reduce((sum, t) => sum + t, 0) / navigationTimes.length
        : 0,
      averageMemoryUsage: memoryUsages.length > 0
        ? memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length
        : 0,
      topPerformanceIssues: topIssues,
    };
  }

  /**
   * Persist session to storage
   */
  private async persistSession(session: MetricsSession): Promise<void> {
    try {
      const existingSessions = await this.getSessionHistory(50); // Keep last 50 sessions
      const updatedSessions = [session, ...existingSessions].slice(0, 50);
      
      await AsyncStorage.setItem(
        '@metrics_sessions',
        JSON.stringify(updatedSessions)
      );
      
      console.log(`[MetricsCollector] Session persisted: ${session.sessionId}`);
    } catch (error) {
      console.error('[MetricsCollector] Failed to persist session:', error);
    }
  }

  /**
   * Export metrics data
   */
  public async exportMetrics(): Promise<string> {
    const sessions = await this.getSessionHistory(100);
    const analysis = await this.analyzeTrends();
    
    const exportData = {
      exportDate: new Date().toISOString(),
      sessions,
      analysis,
      currentSession: this.currentSession,
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Clear all stored metrics
   */
  public async clearMetrics(): Promise<void> {
    try {
      await AsyncStorage.removeItem('@metrics_sessions');
      this.insights = [];
      console.log('[MetricsCollector] All metrics cleared');
    } catch (error) {
      console.error('[MetricsCollector] Failed to clear metrics:', error);
    }
  }
}

export default MetricsCollector;