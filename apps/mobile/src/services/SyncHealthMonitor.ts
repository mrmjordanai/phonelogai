import { EventEmitter } from 'events';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { ConflictMetrics } from '@phonelogai/types';
import { dbUtils } from '@phonelogai/database';
import { OfflineQueue } from './OfflineQueue';
import { SyncService, SyncResult } from './SyncService';
import { ConflictResolver } from './ConflictResolver';

export interface SyncHealthStatus {
  overallHealth: 'healthy' | 'warning' | 'error' | 'critical';
  healthScore: number; // 0-100
  lastSync: Date | null;
  queueDepth: number;
  driftPercentage: number;
  networkStatus: 'connected' | 'disconnected' | 'limited';
  batteryOptimized: boolean;
  issues: SyncHealthIssue[];
  syncLatency: number; // milliseconds
  successRate: number; // percentage
  conflictMetrics?: ConflictMetrics; // Conflict resolution metrics
  dataQualityScore: number; // 0-100, based on conflict resolution
}

export interface SyncHealthIssue {
  id: string;
  type: 'sync_lag' | 'queue_backup' | 'network_issue' | 'data_gap' | 'performance_degradation' | 'conflict_backlog' | 'data_quality';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detectedAt: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface HealthEventData {
  type: 'status_changed' | 'issue_detected' | 'issue_resolved' | 'sync_completed' | 'metrics_updated';
  status?: SyncHealthStatus;
  issue?: SyncHealthIssue;
  syncResult?: SyncResult;
  metrics?: ConflictMetrics;
}

export interface SyncHealthConfig {
  monitoringInterval: number; // milliseconds
  healthCheckInterval: number; // milliseconds
  batteryOptimizationEnabled: boolean;
  backgroundMonitoring: boolean;
  alertThresholds: {
    queueDepth: number;
    driftPercentage: number;
    syncLatency: number;
    successRateMin: number;
  };
}

class SyncHealthMonitorImpl extends EventEmitter {
  private static instance: SyncHealthMonitorImpl;
  private isMonitoring = false;
  private currentStatus: SyncHealthStatus;
  private config: SyncHealthConfig;
  private activeIssues = new Map<string, SyncHealthIssue>();
  
  // Timers and intervals
  private monitoringInterval?: ReturnType<typeof setInterval>;
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private backgroundInterval?: ReturnType<typeof setInterval>;
  
  // App lifecycle management
  private appStateSubscription?: ReturnType<typeof AppState.addEventListener>;
  private netInfoSubscription?: ReturnType<typeof NetInfo.addEventListener>;
  
  // Storage keys
  private readonly STORAGE_KEY = '@phonelogai:sync_health_monitor';
  private readonly CONFIG_KEY = '@phonelogai:sync_health_config';
  private readonly ISSUES_KEY = '@phonelogai:sync_health_issues';
  
  // Performance tracking
  private syncHistory: Array<{ timestamp: Date; result: SyncResult }> = [];
  private readonly MAX_HISTORY_SIZE = 100;

  private constructor() {
    super();
    this.setMaxListeners(20); // Increase for multiple subscribers
    
    this.currentStatus = {
      overallHealth: 'healthy',
      healthScore: 100,
      lastSync: null,
      queueDepth: 0,
      driftPercentage: 0,
      networkStatus: 'disconnected',
      batteryOptimized: true,
      issues: [],
      syncLatency: 0,
      successRate: 100,
      dataQualityScore: 100,
      conflictMetrics: undefined
    };

    this.config = {
      monitoringInterval: 30000, // 30 seconds
      healthCheckInterval: 300000, // 5 minutes
      batteryOptimizationEnabled: true,
      backgroundMonitoring: true,
      alertThresholds: {
        queueDepth: 1000,
        driftPercentage: 10,
        syncLatency: 30000, // 30 seconds
        successRateMin: 80
      }
    };
  }

  public static getInstance(): SyncHealthMonitorImpl {
    if (!SyncHealthMonitorImpl.instance) {
      SyncHealthMonitorImpl.instance = new SyncHealthMonitorImpl();
    }
    return SyncHealthMonitorImpl.instance;
  }

  /**
   * Initialize the sync health monitor
   */
  public async initialize(): Promise<void> {
    try {
      // Load persisted data
      await this.loadPersistedData();
      
      // Set up listeners
      this.setupSyncServiceListeners();
      this.setupNetworkMonitoring();
      this.setupAppStateHandling();
      
      console.log('SyncHealthMonitor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SyncHealthMonitor:', error);
      throw new Error(`SyncHealthMonitor initialization failed: ${error.message}`);
    }
  }

  /**
   * Start monitoring sync health
   */
  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.warn('SyncHealthMonitor is already monitoring');
      return;
    }

    try {
      this.isMonitoring = true;
      
      // Initial health check
      await this.performHealthCheck();
      
      // Set up monitoring intervals
      this.startMonitoringIntervals();
      
      // Emit monitoring started event
      this.emit('monitoring_started');
      
      console.log('SyncHealthMonitor started');
    } catch (error) {
      this.isMonitoring = false;
      console.error('Failed to start SyncHealthMonitor:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring sync health
   */
  public async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    // Clear intervals
    this.clearMonitoringIntervals();
    
    // Emit monitoring stopped event
    this.emit('monitoring_stopped');
    
    console.log('SyncHealthMonitor stopped');
  }

  /**
   * Update sync status based on sync operation
   */
  public async updateSyncStatus(syncResult: SyncResult): Promise<void> {
    try {
      // Add to sync history
      this.addSyncToHistory(syncResult);
      
      // Update current status
      const queueStats = await OfflineQueue.getStats();
      const networkInfo = SyncService.getNetworkInfo();
      
      this.currentStatus.lastSync = new Date();
      this.currentStatus.queueDepth = queueStats.totalItems;
      this.currentStatus.driftPercentage = this.calculateDriftPercentage();
      this.currentStatus.networkStatus = this.mapNetworkStatus(networkInfo);
      this.currentStatus.syncLatency = syncResult.duration;
      this.currentStatus.successRate = this.calculateSuccessRate();
      
      // Calculate overall health
      this.currentStatus.healthScore = this.calculateHealthScore();
      this.currentStatus.overallHealth = this.determineOverallHealth();
      this.currentStatus.issues = Array.from(this.activeIssues.values());
      
      // Check for issues
      await this.detectIssues();
      
      // Update database sync health
      await this.updateDatabaseSyncHealth();
      
      // Emit status update
      this.emit('status_changed', this.currentStatus);
      
      // Persist status
      await this.persistStatus();
      
    } catch (error) {
      console.error('Failed to update sync status:', error);
    }
  }

  /**
   * Calculate overall health score (0-100)
   */
  public calculateHealthScore(): number {
    let score = 100;
    
    // Queue depth penalty (max -30 points)
    if (this.currentStatus.queueDepth > 0) {
      const queuePenalty = Math.min(30, (this.currentStatus.queueDepth / this.config.alertThresholds.queueDepth) * 30);
      score -= queuePenalty;
    }
    
    // Drift percentage penalty (max -20 points)
    if (this.currentStatus.driftPercentage > 0) {
      const driftPenalty = Math.min(20, (this.currentStatus.driftPercentage / this.config.alertThresholds.driftPercentage) * 20);
      score -= driftPenalty;
    }
    
    // Sync latency penalty (max -20 points)
    if (this.currentStatus.syncLatency > this.config.alertThresholds.syncLatency) {
      const latencyPenalty = Math.min(20, ((this.currentStatus.syncLatency - this.config.alertThresholds.syncLatency) / this.config.alertThresholds.syncLatency) * 20);
      score -= latencyPenalty;
    }
    
    // Success rate penalty (max -30 points)
    if (this.currentStatus.successRate < 100) {
      const successPenalty = (100 - this.currentStatus.successRate) * 0.3;
      score -= successPenalty;
    }
    
    // Network status penalty (max -10 points)
    if (this.currentStatus.networkStatus === 'limited') {
      score -= 5;
    } else if (this.currentStatus.networkStatus === 'disconnected') {
      score -= 10;
    }
    
    // Active issues penalty
    for (const issue of this.currentStatus.issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 15;
          break;
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    }
    
    // Data quality penalty (max -15 points)
    if (this.currentStatus.dataQualityScore < 100) {
      const qualityPenalty = (100 - this.currentStatus.dataQualityScore) * 0.15;
      score -= qualityPenalty;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Detect and report issues
   */
  public async detectIssues(): Promise<SyncHealthIssue[]> {
    const detectedIssues: SyncHealthIssue[] = [];
    
    try {
      // Check queue depth
      if (this.currentStatus.queueDepth > this.config.alertThresholds.queueDepth) {
        const issue = this.createOrUpdateIssue('queue_backup', 'high', 
          `Sync queue has ${this.currentStatus.queueDepth} pending items`);
        detectedIssues.push(issue);
      } else {
        this.resolveIssue('queue_backup');
      }
      
      // Check sync lag
      if (this.currentStatus.lastSync) {
        const timeSinceLastSync = Date.now() - this.currentStatus.lastSync.getTime();
        const maxSyncAge = 2 * 60 * 60 * 1000; // 2 hours
        
        if (timeSinceLastSync > maxSyncAge) {
          const hours = Math.round(timeSinceLastSync / (60 * 60 * 1000));
          const issue = this.createOrUpdateIssue('sync_lag', 'medium',
            `Last sync was ${hours} hours ago`);
          detectedIssues.push(issue);
        } else {
          this.resolveIssue('sync_lag');
        }
      }
      
      // Check drift percentage
      if (this.currentStatus.driftPercentage > this.config.alertThresholds.driftPercentage) {
        const issue = this.createOrUpdateIssue('data_gap', 'medium',
          `Data drift is ${this.currentStatus.driftPercentage.toFixed(1)}%`);
        detectedIssues.push(issue);
      } else {
        this.resolveIssue('data_gap');
      }
      
      // Check success rate
      if (this.currentStatus.successRate < this.config.alertThresholds.successRateMin) {
        const issue = this.createOrUpdateIssue('performance_degradation', 'high',
          `Sync success rate is ${this.currentStatus.successRate.toFixed(1)}%`);
        detectedIssues.push(issue);
      } else {
        this.resolveIssue('performance_degradation');
      }
      
      // Check network connectivity
      if (this.currentStatus.networkStatus === 'disconnected') {
        const issue = this.createOrUpdateIssue('network_issue', 'high',
          'Device is not connected to network');
        detectedIssues.push(issue);
      } else {
        this.resolveIssue('network_issue');
      }
      
    } catch (error) {
      console.error('Error detecting issues:', error);
    }
    
    return detectedIssues;
  }

  /**
   * Get comprehensive health report
   */
  public async getHealthReport(): Promise<{
    status: SyncHealthStatus;
    recommendations: string[];
    nextActions: string[];
  }> {
    const recommendations: string[] = [];
    const nextActions: string[] = [];
    
    // Generate recommendations based on current status
    if (this.currentStatus.queueDepth > this.config.alertThresholds.queueDepth * 0.5) {
      recommendations.push('Consider enabling WiFi-only sync to reduce queue buildup');
      nextActions.push('Check network settings and sync preferences');
    }
    
    if (this.currentStatus.driftPercentage > 5) {
      recommendations.push('Data gaps detected - verify data collection permissions');
      nextActions.push('Review call and SMS log access permissions');
    }
    
    if (this.currentStatus.successRate < 95) {
      recommendations.push('Sync reliability issues detected - check network connectivity');
      nextActions.push('Run manual sync to diagnose issues');
    }
    
    if (this.currentStatus.syncLatency > 15000) {
      recommendations.push('Slow sync performance - consider reducing batch size');
      nextActions.push('Check network speed and server status');
    }
    
    if (this.activeIssues.size === 0) {
      recommendations.push('Sync health is optimal - no action needed');
    }
    
    return {
      status: { ...this.currentStatus },
      recommendations,
      nextActions
    };
  }

  /**
   * Get current sync health status
   */
  public getStatus(): SyncHealthStatus {
    return { ...this.currentStatus };
  }

  /**
   * Update configuration
   */
  public async updateConfig(newConfig: Partial<SyncHealthConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.persistConfig();
    
    // Restart monitoring with new config if currently monitoring
    if (this.isMonitoring) {
      this.clearMonitoringIntervals();
      this.startMonitoringIntervals();
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): SyncHealthConfig {
    return { ...this.config };
  }

  /**
   * Update conflict resolution metrics
   */
  public async updateConflictMetrics(userId: string): Promise<void> {
    try {
      const metrics = await ConflictResolver.getConflictMetrics(userId);
      if (metrics) {
        this.currentStatus.conflictMetrics = metrics;
        this.currentStatus.dataQualityScore = this.calculateDataQualityScore(metrics);
        
        // Check for conflict-related issues
        await this.checkConflictIssues(metrics);
        
        // Emit metrics update event
        this.emit('metrics_updated', {
          type: 'metrics_updated' as const,
          metrics: metrics
        });
      }
    } catch (error) {
      console.error('Failed to update conflict metrics:', error);
    }
  }

  /**
   * Calculate data quality score based on conflict metrics
   */
  private calculateDataQualityScore(metrics: ConflictMetrics): number {
    // Base score starts at 100
    let score = 100;
    
    // Deduct points for pending conflicts (max 20 points)
    const pendingPenalty = Math.min(20, (metrics.pending_resolution / 100) * 20);
    score -= pendingPenalty;
    
    // Add points for high auto-resolution rate (max 10 points)
    const autoBonus = Math.min(10, (metrics.auto_resolution_rate / 100) * 10);
    score += autoBonus - 10; // Normalize so 100% auto-resolution = 0 bonus
    
    // Deduct points for low overall conflict resolution (max 30 points)
    const totalConflicts = metrics.total_conflicts;
    if (totalConflicts > 0) {
      const unresolved = metrics.pending_resolution;
      const unresolvedRatio = unresolved / totalConflicts;
      const unresolvedPenalty = Math.min(30, unresolvedRatio * 30);
      score -= unresolvedPenalty;
    }
    
    // Apply data quality improvement bonus (max 10 points)
    const qualityBonus = Math.min(10, (metrics.data_quality_improvement - 90) / 10 * 10);
    score += Math.max(0, qualityBonus);
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Check for conflict-related issues
   */
  private async checkConflictIssues(metrics: ConflictMetrics): Promise<void> {
    // Check for conflict backlog
    if (metrics.pending_resolution > 50) {
      const severity = metrics.pending_resolution > 200 ? 'critical' : 
                      metrics.pending_resolution > 100 ? 'high' : 'medium';
      
      this.reportIssue({
        id: 'conflict_backlog',
        type: 'conflict_backlog',
        severity,
        message: `${metrics.pending_resolution} conflicts pending resolution`,
        detectedAt: new Date(),
        metadata: { pending_count: metrics.pending_resolution }
      });
    } else {
      this.resolveIssue('conflict_backlog');
    }
    
    // Check for low auto-resolution rate
    if (metrics.total_conflicts > 10 && metrics.auto_resolution_rate < 70) {
      this.reportIssue({
        id: 'low_auto_resolution',
        type: 'data_quality',
        severity: 'medium',
        message: `Low auto-resolution rate: ${metrics.auto_resolution_rate}%`,
        detectedAt: new Date(),
        metadata: { auto_resolution_rate: metrics.auto_resolution_rate }
      });
    } else {
      this.resolveIssue('low_auto_resolution');
    }
    
    // Check for data quality degradation
    if (metrics.data_quality_improvement < 85) {
      const severity = metrics.data_quality_improvement < 70 ? 'high' : 'medium';
      this.reportIssue({
        id: 'data_quality_degradation',
        type: 'data_quality',
        severity,
        message: `Data quality below target: ${metrics.data_quality_improvement}%`,
        detectedAt: new Date(),
        metadata: { quality_score: metrics.data_quality_improvement }
      });
    } else {
      this.resolveIssue('data_quality_degradation');
    }
  }

  // Private methods

  private async performHealthCheck(): Promise<void> {
    try {
      const queueStats = await OfflineQueue.getStats();
      const networkInfo = SyncService.getNetworkInfo();
      
      this.currentStatus.queueDepth = queueStats.totalItems;
      this.currentStatus.networkStatus = this.mapNetworkStatus(networkInfo);
      this.currentStatus.driftPercentage = this.calculateDriftPercentage();
      this.currentStatus.successRate = this.calculateSuccessRate();
      this.currentStatus.healthScore = this.calculateHealthScore();
      this.currentStatus.overallHealth = this.determineOverallHealth();
      this.currentStatus.issues = Array.from(this.activeIssues.values());
      
      await this.detectIssues();
      await this.persistStatus();
      
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  private startMonitoringIntervals(): void {
    // Main monitoring loop
    this.monitoringInterval = setInterval(async () => {
      if (this.config.batteryOptimizationEnabled && AppState.currentState !== 'active') {
        return; // Skip monitoring when app is backgrounded for battery optimization
      }
      
      await this.performHealthCheck();
      this.emit('metrics_updated', this.currentStatus);
    }, this.config.monitoringInterval);

    // Health check interval (less frequent but more comprehensive)
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
      await this.updateDatabaseSyncHealth();
    }, this.config.healthCheckInterval);

    // Background monitoring (if enabled and less frequent)
    if (this.config.backgroundMonitoring) {
      this.backgroundInterval = setInterval(async () => {
        if (AppState.currentState !== 'active') {
          await this.performHealthCheck();
        }
      }, this.config.monitoringInterval * 4); // 4x less frequent in background
    }
  }

  private clearMonitoringIntervals(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = undefined;
    }
  }

  private setupSyncServiceListeners(): void {
    // Listen to sync status changes
    SyncService.onSyncStatusChanged((syncStatus) => {
      if (syncStatus.lastSync) {
        this.currentStatus.lastSync = syncStatus.lastSync;
      }
    });
  }

  private setupNetworkMonitoring(): void {
    this.netInfoSubscription = NetInfo.addEventListener((state: NetInfoState) => {
      const previousStatus = this.currentStatus.networkStatus;
      this.currentStatus.networkStatus = this.mapNetworkStatus({
        isConnected: state.isConnected || false,
        connectionType: state.type,
        isWiFi: state.type === 'wifi',
        isCellular: state.type === 'cellular',
        isMetered: state.isMetered || false,
      });
      
      if (previousStatus !== this.currentStatus.networkStatus) {
        this.emit('network_status_changed', this.currentStatus.networkStatus);
      }
    });
  }

  private setupAppStateHandling(): void {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && this.isMonitoring) {
        // Perform immediate health check when app becomes active
        setTimeout(() => this.performHealthCheck(), 1000);
      }
    });
  }

  private addSyncToHistory(syncResult: SyncResult): void {
    this.syncHistory.push({
      timestamp: new Date(),
      result: syncResult
    });
    
    // Keep only recent history
    if (this.syncHistory.length > this.MAX_HISTORY_SIZE) {
      this.syncHistory = this.syncHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  private calculateDriftPercentage(): number {
    if (this.syncHistory.length === 0) return 0;
    
    const recentSyncs = this.syncHistory.slice(-10); // Last 10 syncs
    const totalFailed = recentSyncs.reduce((sum, sync) => sum + sync.result.failedItems, 0);
    const totalProcessed = recentSyncs.reduce((sum, sync) => sum + sync.result.processedItems + sync.result.failedItems, 0);
    
    return totalProcessed > 0 ? (totalFailed / totalProcessed) * 100 : 0;
  }

  private calculateSuccessRate(): number {
    if (this.syncHistory.length === 0) return 100;
    
    const recentSyncs = this.syncHistory.slice(-20); // Last 20 syncs
    const successfulSyncs = recentSyncs.filter(sync => sync.result.success).length;
    
    return (successfulSyncs / recentSyncs.length) * 100;
  }

  private determineOverallHealth(): 'healthy' | 'warning' | 'error' | 'critical' {
    if (this.currentStatus.healthScore >= 90) return 'healthy';
    if (this.currentStatus.healthScore >= 70) return 'warning';
    if (this.currentStatus.healthScore >= 40) return 'error';
    return 'critical';
  }

  private mapNetworkStatus(networkInfo: NetInfoState): 'connected' | 'disconnected' | 'limited' {
    if (!networkInfo.isConnected) return 'disconnected';
    if (networkInfo.isMetered && !networkInfo.isWiFi) return 'limited';
    return 'connected';
  }

  private createOrUpdateIssue(type: string, severity: 'low' | 'medium' | 'high' | 'critical', message: string): SyncHealthIssue {
    let issue = this.activeIssues.get(type);
    
    if (!issue) {
      issue = {
        id: `${type}_${Date.now()}`,
        type: type as SyncHealthIssue['type'],
        severity,
        message,
        detectedAt: new Date()
      };
      
      this.activeIssues.set(type, issue);
      this.emit('issue_detected', issue);
    } else {
      // Update existing issue
      issue.message = message;
      issue.severity = severity;
    }
    
    return issue;
  }

  private resolveIssue(type: string): void {
    const issue = this.activeIssues.get(type);
    if (issue) {
      issue.resolvedAt = new Date();
      this.activeIssues.delete(type);
      this.emit('issue_resolved', issue);
    }
  }

  private async updateDatabaseSyncHealth(): Promise<void> {
    try {
      await dbUtils.sync.getSyncHealth('current_user'); // This would need user ID
      // Update sync health in database would go here
      // For now, just log the update
      console.log('Database sync health updated');
    } catch (error) {
      console.error('Failed to update database sync health:', error);
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      // Load configuration
      const configData = await AsyncStorage.getItem(this.CONFIG_KEY);
      if (configData) {
        const savedConfig = JSON.parse(configData);
        this.config = { ...this.config, ...savedConfig };
      }

      // Load active issues
      const issuesData = await AsyncStorage.getItem(this.ISSUES_KEY);
      if (issuesData) {
        const savedIssues = JSON.parse(issuesData);
        this.activeIssues = new Map(savedIssues);
      }

      // Load last status
      const statusData = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (statusData) {
        const savedStatus = JSON.parse(statusData);
        this.currentStatus = {
          ...this.currentStatus,
          ...savedStatus,
          lastSync: savedStatus.lastSync ? new Date(savedStatus.lastSync) : null
        };
      }
    } catch (error) {
      console.error('Failed to load persisted data:', error);
    }
  }

  private async persistStatus(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentStatus));
    } catch (error) {
      console.error('Failed to persist status:', error);
    }
  }

  private async persistConfig(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to persist config:', error);
    }
  }

  private async persistIssues(): Promise<void> {
    try {
      const issuesArray = Array.from(this.activeIssues.entries());
      await AsyncStorage.setItem(this.ISSUES_KEY, JSON.stringify(issuesArray));
    } catch (error) {
      console.error('Failed to persist issues:', error);
    }
  }

  public async cleanup(): Promise<void> {
    await this.stopMonitoring();
    
    // Clean up subscriptions
    if (this.netInfoSubscription) {
      this.netInfoSubscription();
    }
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    
    this.removeAllListeners();
  }
}

export const SyncHealthMonitor = SyncHealthMonitorImpl.getInstance();