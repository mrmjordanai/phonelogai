import { SyncHealthIssue, SyncHealthStatus } from './SyncHealthMonitor';
import { SyncMetrics, PerformanceMetrics, DriftAnalysis } from './SyncMetrics';
import { OfflineQueue, QueueStats } from './OfflineQueue';
import { SyncService, SyncResult, NetworkInfo } from './SyncService';
import { dbUtils } from '@phonelogai/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface HealthCheckRule {
  id: string;
  name: string;
  description: string;
  category: 'sync_performance' | 'data_quality' | 'network_health' | 'resource_usage' | 'user_experience';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  threshold: {
    type: 'numeric' | 'percentage' | 'duration' | 'count';
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    value: number;
    unit?: 'ms' | 's' | 'min' | 'h' | 'bytes' | 'items' | '%';
  };
  check: (_context: HealthCheckContext) => Promise<HealthCheckResult>;
}

export interface HealthCheckContext {
  currentStatus: SyncHealthStatus;
  performanceMetrics: PerformanceMetrics;
  queueStats: QueueStats;
  networkInfo: NetworkInfo;
  driftAnalysis: DriftAnalysis;
  recentSyncResults: SyncResult[];
  timeWindow: {
    start: Date;
    end: Date;
  };
}

export interface HealthCheckResult {
  passed: boolean;
  value: number;
  message: string;
  metadata?: Record<string, unknown>;
  suggestions?: string[];
}

interface DataGap {
  start: string;
  end: string;
  duration_hours: number;
}

export interface HealthAssessment {
  overallScore: number; // 0-100
  categoryScores: Record<string, number>;
  passedChecks: string[];
  failedChecks: HealthCheckFailure[];
  warnings: HealthCheckWarning[];
  recommendations: string[];
  executedAt: Date;
  nextCheckAt: Date;
}

export interface HealthCheckFailure {
  ruleId: string;
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  suggestions: string[];
  metadata?: Record<string, unknown>;
}

export interface HealthCheckWarning {
  ruleId: string;
  ruleName: string;
  message: string;
  value: number;
  trend: 'improving' | 'stable' | 'degrading';
  suggestions: string[];
}

export interface AlertConfiguration {
  enabled: boolean;
  minSeverity: 'low' | 'medium' | 'high' | 'critical';
  cooldownPeriod: number; // milliseconds
  aggregationWindow: number; // milliseconds
  maxAlertsPerHour: number;
  deliveryMethods: ('console' | 'notification' | 'storage')[];
}

class HealthCheckerEngine {
  private static instance: HealthCheckerEngine;
  private rules: Map<string, HealthCheckRule> = new Map();
  private alertConfig: AlertConfiguration;
  private lastAlerts = new Map<string, Date>();
  private alertCount = new Map<string, number>();
  
  private readonly STORAGE_KEY = '@phonelogai:health_checker';
  private readonly RULES_KEY = '@phonelogai:health_rules';
  private readonly ALERTS_KEY = '@phonelogai:health_alerts';

  private constructor() {
    this.alertConfig = {
      enabled: true,
      minSeverity: 'medium',
      cooldownPeriod: 300000, // 5 minutes
      aggregationWindow: 3600000, // 1 hour
      maxAlertsPerHour: 10,
      deliveryMethods: ['console', 'storage']
    };
    
    this.initializeDefaultRules();
  }

  public static getInstance(): HealthCheckerEngine {
    if (!HealthCheckerEngine.instance) {
      HealthCheckerEngine.instance = new HealthCheckerEngine();
    }
    return HealthCheckerEngine.instance;
  }

  /**
   * Initialize the health checker
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadConfiguration();
      console.log(`Initialized health checker with ${this.rules.size} rules`);
    } catch (error) {
      console.error('Failed to initialize HealthChecker:', error);
      throw error;
    }
  }

  /**
   * Perform comprehensive health assessment
   */
  public async performHealthAssessment(
    timeWindowHours: number = 24
  ): Promise<HealthAssessment> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (timeWindowHours * 60 * 60 * 1000));
    
    try {
      // Gather context data
      const context = await this.gatherHealthCheckContext(startDate, endDate);
      
      // Execute all enabled rules
      const results = await this.executeHealthCheckRules(context);
      
      // Calculate scores and assessment
      const assessment = this.calculateHealthAssessment(results);
      
      // Check for alerts
      await this.processAlerts(assessment);
      
      return assessment;
      
    } catch (error) {
      console.error('Health assessment failed:', error);
      throw new Error(`Health assessment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform specific health check
   */
  public async performSpecificCheck(
    ruleId: string,
    context?: HealthCheckContext
  ): Promise<HealthCheckResult | null> {
    const rule = this.rules.get(ruleId);
    if (!rule || !rule.enabled) {
      return null;
    }

    try {
      if (!context) {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000));
        context = await this.gatherHealthCheckContext(startDate, endDate);
      }

      return await rule.check(context);
    } catch (error) {
      console.error(`Health check ${ruleId} failed:`, error);
      return {
        passed: false,
        value: 0,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        suggestions: ['Contact support if this error persists']
      };
    }
  }

  /**
   * Add custom health check rule
   */
  public addRule(rule: HealthCheckRule): void {
    this.rules.set(rule.id, rule);
    this.saveConfiguration().catch(error => 
      console.error('Failed to save health rules:', error)
    );
  }

  /**
   * Update existing rule
   */
  public updateRule(ruleId: string, updates: Partial<HealthCheckRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;
    
    this.rules.set(ruleId, { ...rule, ...updates });
    this.saveConfiguration().catch(error => 
      console.error('Failed to save health rules:', error)
    );
    
    return true;
  }

  /**
   * Enable/disable rule
   */
  public toggleRule(ruleId: string, enabled: boolean): boolean {
    return this.updateRule(ruleId, { enabled });
  }

  /**
   * Get all rules
   */
  public getRules(): HealthCheckRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules by category
   */
  public getRulesByCategory(category: string): HealthCheckRule[] {
    return Array.from(this.rules.values())
      .filter(rule => rule.category === category);
  }

  /**
   * Update alert configuration
   */
  public updateAlertConfig(config: Partial<AlertConfiguration>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    this.saveConfiguration().catch(error => 
      console.error('Failed to save alert config:', error)
    );
  }

  /**
   * Get alert configuration
   */
  public getAlertConfig(): AlertConfiguration {
    return { ...this.alertConfig };
  }

  /**
   * Detect data gaps using database function
   */
  public async detectDataGaps(
    userId: string,
    thresholdHours: number = 24
  ): Promise<SyncHealthIssue[]> {
    try {
      const { data: gaps } = await dbUtils.sync.detectGaps(userId, thresholdHours);
      
      if (!gaps || !Array.isArray(gaps) || gaps.length === 0) {
        return [];
      }

      return gaps.map((gap: DataGap) => ({
        id: `data_gap_${gap.start}`,
        type: 'data_gap',
        severity: gap.duration_hours > 48 ? 'high' : 'medium',
        message: `Data gap detected: ${gap.duration_hours} hours between ${gap.start} and ${gap.end}`,
        detectedAt: new Date(),
        metadata: {
          startTime: gap.start,
          endTime: gap.end,
          durationHours: gap.duration_hours
        }
      }));
    } catch (error) {
      console.error('Failed to detect data gaps:', error);
      return [];
    }
  }

  // Private methods

  private initializeDefaultRules(): void {
    // Sync Performance Rules
    this.addDefaultRule({
      id: 'sync_latency_high',
      name: 'High Sync Latency',
      description: 'Detect when sync operations take too long to complete',
      category: 'sync_performance',
      severity: 'medium',
      enabled: true,
      threshold: {
        type: 'duration',
        operator: 'gt',
        value: 30000,
        unit: 'ms'
      },
      check: async (context) => {
        const avgLatency = context.performanceMetrics.averageLatency;
        return {
          passed: avgLatency <= 30000,
          value: avgLatency,
          message: avgLatency > 30000 
            ? `Average sync latency is ${(avgLatency / 1000).toFixed(1)}s, exceeding 30s threshold`
            : `Sync latency is healthy at ${(avgLatency / 1000).toFixed(1)}s`,
          suggestions: avgLatency > 30000 ? [
            'Check network connection quality',
            'Consider reducing sync batch size',
            'Verify server performance'
          ] : []
        };
      }
    });

    this.addDefaultRule({
      id: 'sync_success_rate_low',
      name: 'Low Sync Success Rate',
      description: 'Detect when sync operations fail frequently',
      category: 'sync_performance',
      severity: 'high',
      enabled: true,
      threshold: {
        type: 'percentage',
        operator: 'lt',
        value: 90,
        unit: '%'
      },
      check: async (context) => {
        const successRate = context.performanceMetrics.successRate;
        return {
          passed: successRate >= 90,
          value: successRate,
          message: successRate < 90
            ? `Sync success rate is ${successRate.toFixed(1)}%, below 90% threshold`
            : `Sync success rate is healthy at ${successRate.toFixed(1)}%`,
          suggestions: successRate < 90 ? [
            'Review network connectivity',
            'Check authentication status',
            'Verify server availability',
            'Review error logs for patterns'
          ] : []
        };
      }
    });

    // Queue Health Rules
    this.addDefaultRule({
      id: 'queue_depth_high',
      name: 'High Queue Depth',
      description: 'Detect when offline queue has too many pending items',
      category: 'sync_performance',
      severity: 'medium',
      enabled: true,
      threshold: {
        type: 'count',
        operator: 'gt',
        value: 1000,
        unit: 'items'
      },
      check: async (context) => {
        const queueDepth = context.queueStats.totalItems;
        return {
          passed: queueDepth <= 1000,
          value: queueDepth,
          message: queueDepth > 1000
            ? `Queue has ${queueDepth} pending items, exceeding 1000 threshold`
            : `Queue depth is healthy at ${queueDepth} items`,
          suggestions: queueDepth > 1000 ? [
            'Enable more frequent sync',
            'Check network connectivity',
            'Consider WiFi-only sync to preserve data',
            'Review sync batch size settings'
          ] : []
        };
      }
    });

    // Data Quality Rules
    this.addDefaultRule({
      id: 'data_drift_high',
      name: 'High Data Drift',
      description: 'Detect significant changes in data patterns',
      category: 'data_quality',
      severity: 'medium',
      enabled: true,
      threshold: {
        type: 'percentage',
        operator: 'gt',
        value: 15,
        unit: '%'
      },
      check: async (context) => {
        const driftPercentage = Math.max(
          context.driftAnalysis.temporalDrift.variance * 100,
          context.driftAnalysis.dataDrift.variance * 100,
          Math.abs(context.driftAnalysis.qualityDrift.degradation)
        );
        
        return {
          passed: driftPercentage <= 15,
          value: driftPercentage,
          message: driftPercentage > 15
            ? `Data drift detected at ${driftPercentage.toFixed(1)}%, exceeding 15% threshold`
            : `Data drift is within normal range at ${driftPercentage.toFixed(1)}%`,
          suggestions: driftPercentage > 15 ? [
            'Review data collection permissions',
            'Check for changes in usage patterns',
            'Verify device settings',
            'Consider manual data verification'
          ] : []
        };
      }
    });

    // Network Health Rules
    this.addDefaultRule({
      id: 'network_connectivity_poor',
      name: 'Poor Network Connectivity',
      description: 'Detect frequent network disconnections or poor quality',
      category: 'network_health',
      severity: 'low',
      enabled: true,
      threshold: {
        type: 'percentage',
        operator: 'gt',
        value: 20,
        unit: '%'
      },
      check: async (context) => {
        const isConnected = context.networkInfo.isConnected;
        const connectionType = context.networkInfo.connectionType;
        
        // For this check, we'll assume poor connectivity if not connected or on slow connection
        const poorConnectivity = !isConnected || 
          (connectionType === 'cellular' && context.networkInfo.strength && context.networkInfo.strength < 3);
        
        return {
          passed: !poorConnectivity,
          value: poorConnectivity ? 100 : 0,
          message: poorConnectivity
            ? `Poor network connectivity detected (${connectionType})`
            : `Network connectivity is good (${connectionType})`,
          suggestions: poorConnectivity ? [
            'Check WiFi connection',
            'Move to area with better signal',
            'Consider enabling WiFi-only sync',
            'Check data plan limitations'
          ] : []
        };
      }
    });

    // Resource Usage Rules
    this.addDefaultRule({
      id: 'battery_usage_high',
      name: 'High Battery Usage',
      description: 'Detect when sync operations consume too much battery',
      category: 'resource_usage',
      severity: 'low',
      enabled: true,
      threshold: {
        type: 'percentage',
        operator: 'gt',
        value: 5,
        unit: '%'
      },
      check: async (_context) => {
        // Get battery impact metrics
        const batteryMetrics = SyncMetrics.getBatteryImpactMetrics();
        const estimatedUsage = batteryMetrics.estimatedBatteryUsage;
        
        return {
          passed: estimatedUsage <= 5,
          value: estimatedUsage,
          message: estimatedUsage > 5
            ? `Sync operations using ${estimatedUsage.toFixed(1)}% of battery, exceeding 5% threshold`
            : `Battery usage is acceptable at ${estimatedUsage.toFixed(1)}%`,
          suggestions: estimatedUsage > 5 ? [
            'Enable battery optimization',
            'Reduce sync frequency',
            'Use WiFi-only sync',
            'Consider background sync limitations'
          ] : []
        };
      }
    });
  }

  private addDefaultRule(rule: HealthCheckRule): void {
    this.rules.set(rule.id, rule);
  }

  private async gatherHealthCheckContext(startDate: Date, endDate: Date): Promise<HealthCheckContext> {
    // Get current status (would need to access from SyncHealthMonitor)
    const currentStatus: SyncHealthStatus = {
      overallHealth: 'healthy',
      healthScore: 100,
      lastSync: new Date(),
      queueDepth: 0,
      driftPercentage: 0,
      networkStatus: 'connected',
      batteryOptimized: true,
      issues: [],
      syncLatency: 0,
      successRate: 100,
      dataQualityScore: 100
    };

    // Get performance metrics
    const performanceMetrics = SyncMetrics.getPerformanceMetrics(startDate, endDate);
    
    // Get queue statistics
    const queueStats = await OfflineQueue.getStats();
    
    // Get network info
    const networkInfo = SyncService.getNetworkInfo();
    
    // Calculate drift analysis
    const driftAnalysis = SyncMetrics.calculateDataDrift(7);
    
    // Get recent sync results (would need to be provided by SyncService)
    const recentSyncResults: SyncResult[] = [];

    return {
      currentStatus,
      performanceMetrics,
      queueStats,
      networkInfo,
      driftAnalysis,
      recentSyncResults,
      timeWindow: { start: startDate, end: endDate }
    };
  }

  private async executeHealthCheckRules(context: HealthCheckContext): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    
    for (const [ruleId, rule] of this.rules.entries()) {
      if (!rule.enabled) continue;
      
      try {
        const result = await rule.check(context);
        results.set(ruleId, result);
      } catch (error) {
        console.error(`Health check rule ${ruleId} failed:`, error);
        results.set(ruleId, {
          passed: false,
          value: 0,
          message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
          suggestions: ['Contact support if this error persists']
        });
      }
    }
    
    return results;
  }

  private calculateHealthAssessment(results: Map<string, HealthCheckResult>): HealthAssessment {
    const passedChecks: string[] = [];
    const failedChecks: HealthCheckFailure[] = [];
    const warnings: HealthCheckWarning[] = [];
    const recommendations = new Set<string>();
    const categoryScores: Record<string, number> = {};
    const categoryCounts: Record<string, { total: number; passed: number }> = {};

    // Process results
    for (const [ruleId, result] of results.entries()) {
      const rule = this.rules.get(ruleId);
      if (!rule) continue;

      // Initialize category tracking
      if (!categoryCounts[rule.category]) {
        categoryCounts[rule.category] = { total: 0, passed: 0 };
      }
      categoryCounts[rule.category].total++;

      if (result.passed) {
        passedChecks.push(ruleId);
        categoryCounts[rule.category].passed++;
      } else {
        failedChecks.push({
          ruleId,
          ruleName: rule.name,
          severity: rule.severity,
          message: result.message,
          value: result.value,
          threshold: rule.threshold.value,
          suggestions: result.suggestions || [],
          metadata: result.metadata
        });

        // Add suggestions to recommendations
        if (result.suggestions) {
          result.suggestions.forEach(suggestion => recommendations.add(suggestion));
        }
      }
    }

    // Calculate category scores
    for (const [category, counts] of Object.entries(categoryCounts)) {
      categoryScores[category] = counts.total > 0 ? (counts.passed / counts.total) * 100 : 100;
    }

    // Calculate overall score with severity weighting
    let totalScore = 0;
    let weightSum = 0;
    
    for (const [ruleId, result] of results.entries()) {
      const rule = this.rules.get(ruleId);
      if (!rule) continue;

      const weight = this.getSeverityWeight(rule.severity);
      const score = result.passed ? 100 : 0;
      
      totalScore += score * weight;
      weightSum += weight;
    }

    const overallScore = weightSum > 0 ? Math.round(totalScore / weightSum) : 100;

    return {
      overallScore,
      categoryScores,
      passedChecks,
      failedChecks,
      warnings,
      recommendations: Array.from(recommendations),
      executedAt: new Date(),
      nextCheckAt: new Date(Date.now() + 300000) // 5 minutes from now
    };
  }

  private getSeverityWeight(severity: 'low' | 'medium' | 'high' | 'critical'): number {
    const weights = { low: 1, medium: 2, high: 4, critical: 8 };
    return weights[severity];
  }

  private async processAlerts(assessment: HealthAssessment): Promise<void> {
    if (!this.alertConfig.enabled) return;

    for (const failure of assessment.failedChecks) {
      if (this.shouldTriggerAlert(failure)) {
        await this.triggerAlert(failure);
      }
    }
  }

  private shouldTriggerAlert(failure: HealthCheckFailure): boolean {
    // Check minimum severity
    const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
    if (severityLevels[failure.severity] < severityLevels[this.alertConfig.minSeverity]) {
      return false;
    }

    // Check cooldown period
    const lastAlert = this.lastAlerts.get(failure.ruleId);
    if (lastAlert && Date.now() - lastAlert.getTime() < this.alertConfig.cooldownPeriod) {
      return false;
    }

    // Check rate limiting
    const hourKey = Math.floor(Date.now() / this.alertConfig.aggregationWindow);
    const currentCount = this.alertCount.get(`${failure.ruleId}_${hourKey}`) || 0;
    if (currentCount >= this.alertConfig.maxAlertsPerHour) {
      return false;
    }

    return true;
  }

  private async triggerAlert(failure: HealthCheckFailure): Promise<void> {
    const now = new Date();
    this.lastAlerts.set(failure.ruleId, now);

    // Update rate limiting counter
    const hourKey = Math.floor(now.getTime() / this.alertConfig.aggregationWindow);
    const currentCount = this.alertCount.get(`${failure.ruleId}_${hourKey}`) || 0;
    this.alertCount.set(`${failure.ruleId}_${hourKey}`, currentCount + 1);

    // Deliver alert through configured methods
    for (const method of this.alertConfig.deliveryMethods) {
      try {
        switch (method) {
          case 'console':
            console.warn(`[HEALTH ALERT] ${failure.severity.toUpperCase()}: ${failure.message}`);
            break;
          case 'storage':
            await this.saveAlert(failure);
            break;
          case 'notification':
            // Would integrate with React Native notifications
            break;
        }
      } catch (error) {
        console.error(`Failed to deliver alert via ${method}:`, error);
      }
    }
  }

  private async saveAlert(failure: HealthCheckFailure): Promise<void> {
    try {
      const alertsData = await AsyncStorage.getItem(this.ALERTS_KEY);
      const alerts = alertsData ? JSON.parse(alertsData) : [];
      
      alerts.push({
        ...failure,
        triggeredAt: new Date().toISOString()
      });

      // Keep only recent alerts (last 100)
      const recentAlerts = alerts.slice(-100);
      
      await AsyncStorage.setItem(this.ALERTS_KEY, JSON.stringify(recentAlerts));
    } catch (error) {
      console.error('Failed to save alert:', error);
    }
  }

  private async loadConfiguration(): Promise<void> {
    try {
      // Load rules
      const rulesData = await AsyncStorage.getItem(this.RULES_KEY);
      if (rulesData) {
        const savedRules = JSON.parse(rulesData);
        for (const rule of savedRules) {
          if (this.rules.has(rule.id)) {
            // Update existing rule with saved configuration
            this.rules.set(rule.id, { ...this.rules.get(rule.id), ...rule });
          }
        }
      }

      // Load alert configuration
      const alertData = await AsyncStorage.getItem(this.ALERTS_KEY);
      if (alertData) {
        const savedConfig = JSON.parse(alertData);
        this.alertConfig = { ...this.alertConfig, ...savedConfig };
      }
    } catch (error) {
      console.error('Failed to load health checker configuration:', error);
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      // Save rules
      const rulesArray = Array.from(this.rules.values());
      await AsyncStorage.setItem(this.RULES_KEY, JSON.stringify(rulesArray));

      // Save alert configuration
      await AsyncStorage.setItem(this.ALERTS_KEY, JSON.stringify(this.alertConfig));
    } catch (error) {
      console.error('Failed to save health checker configuration:', error);
    }
  }
}

export const HealthChecker = HealthCheckerEngine.getInstance();