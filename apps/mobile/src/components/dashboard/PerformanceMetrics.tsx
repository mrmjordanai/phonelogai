import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PerformanceMetrics as PerformanceMetricsType, PerformanceAlert } from '../../types/enhanced-dashboard';

interface PerformanceMetricsProps {
  metrics: PerformanceMetricsType | null;
  alerts?: PerformanceAlert[];
  onOptimize?: () => void;
  onViewDetails?: () => void;
  loading?: boolean;
}

export const PerformanceMetrics = memo<PerformanceMetricsProps>(({
  metrics,
  alerts = [],
  onOptimize,
  onViewDetails,
  loading = false
}) => {
  if (!metrics) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="speedometer" size={20} color="#3B82F6" />
          <Text style={styles.title}>Performance</Text>
        </View>
        <Text style={styles.noDataText}>Collecting metrics...</Text>
      </View>
    );
  }

  const getMemoryColor = (usage: number): string => {
    if (usage < 50) return '#10B981';
    if (usage < 75) return '#F59E0B';
    return '#EF4444';
  };

  const getLatencyColor = (latency: number): string => {
    if (latency < 0) return '#9CA3AF'; // Offline
    if (latency < 200) return '#10B981';
    if (latency < 500) return '#F59E0B';
    return '#EF4444';
  };

  const getSyncLatencyColor = (latency: number): string => {
    if (latency < 5000) return '#10B981'; // < 5 seconds
    if (latency < 15000) return '#F59E0B'; // < 15 seconds
    return '#EF4444';
  };

  const formatLatency = (latency: number): string => {
    if (latency < 0) return 'Offline';
    if (latency < 1000) return `${Math.round(latency)}ms`;
    return `${(latency / 1000).toFixed(1)}s`;
  };

  const formatMemory = (memory: number): string => {
    return `${memory.toFixed(1)} MB`;
  };

  const memoryColor = getMemoryColor(metrics.memoryUsage);
  const networkColor = getLatencyColor(metrics.networkLatency);
  const syncColor = getSyncLatencyColor(metrics.syncLatency);

  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical' || alert.severity === 'high');
  const hasAlerts = criticalAlerts.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="speedometer" size={20} color="#3B82F6" />
        <Text style={styles.title}>Performance</Text>
        {hasAlerts && (
          <View style={styles.alertBadge}>
            <Ionicons name="warning" size={12} color="#EF4444" />
            <Text style={styles.alertCount}>{criticalAlerts.length}</Text>
          </View>
        )}
      </View>

      {/* Performance metrics grid */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <View style={styles.metricHeader}>
            <Ionicons name="hardware-chip" size={16} color={memoryColor} />
            <Text style={styles.metricLabel}>Memory</Text>
          </View>
          <Text style={[styles.metricValue, { color: memoryColor }]}>
            {formatMemory(metrics.memoryUsage)}
          </Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${Math.min(100, (metrics.memoryUsage / 100) * 100)}%`,
                  backgroundColor: memoryColor 
                }
              ]} 
            />
          </View>
        </View>

        <View style={styles.metricItem}>
          <View style={styles.metricHeader}>
            <Ionicons name="wifi" size={16} color={networkColor} />
            <Text style={styles.metricLabel}>Network</Text>
          </View>
          <Text style={[styles.metricValue, { color: networkColor }]}>
            {formatLatency(metrics.networkLatency)}
          </Text>
          <Text style={styles.metricSubtext}>
            {metrics.networkLatency < 0 ? 'Disconnected' : 'Latency'}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <View style={styles.metricHeader}>
            <Ionicons name="sync" size={16} color={syncColor} />
            <Text style={styles.metricLabel}>Sync Time</Text>
          </View>
          <Text style={[styles.metricValue, { color: syncColor }]}>
            {formatLatency(metrics.syncLatency)}
          </Text>
          <Text style={styles.metricSubtext}>
            Last sync duration
          </Text>
        </View>

        <View style={styles.metricItem}>
          <View style={styles.metricHeader}>
            <Ionicons 
              name={metrics.batteryOptimized ? "battery-charging" : "battery-dead"} 
              size={16} 
              color={metrics.batteryOptimized ? "#10B981" : "#F59E0B"} 
            />
            <Text style={styles.metricLabel}>Battery</Text>
          </View>
          <Text style={[
            styles.metricValue, 
            { color: metrics.batteryOptimized ? "#10B981" : "#F59E0B" }
          ]}>
            {metrics.batteryOptimized ? "Optimized" : "Standard"}
          </Text>
          <Text style={styles.metricSubtext}>
            Power mode
          </Text>
        </View>
      </View>

      {/* Performance alerts */}
      {hasAlerts && (
        <View style={styles.alertsSection}>
          <Text style={styles.alertsTitle}>Performance Alerts</Text>
          {criticalAlerts.slice(0, 2).map((alert, _index) => (
            <View key={alert.id} style={styles.alertItem}>
              <Ionicons 
                name={alert.severity === 'critical' ? 'alert-circle' : 'warning'} 
                size={14} 
                color={alert.severity === 'critical' ? '#DC2626' : '#F59E0B'} 
              />
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertDescription}>{alert.description}</Text>
                {alert.recommendation && (
                  <Text style={styles.alertRecommendation}>
                    💡 {alert.recommendation}
                  </Text>
                )}
              </View>
            </View>
          ))}
          {criticalAlerts.length > 2 && (
            <TouchableOpacity onPress={onViewDetails} style={styles.viewMoreButton}>
              <Text style={styles.viewMoreText}>
                +{criticalAlerts.length - 2} more alerts
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Performance insights */}
      <View style={styles.insightsSection}>
        <Text style={styles.insightsTitle}>Insights</Text>
        
        {metrics.memoryUsage > 75 && (
          <Text style={styles.insightText}>
            • Memory usage is high - consider restarting the app
          </Text>
        )}
        
        {metrics.networkLatency > 1000 && metrics.networkLatency > 0 && (
          <Text style={styles.insightText}>
            • Slow network detected - sync may be delayed
          </Text>
        )}
        
        {metrics.syncLatency > 10000 && (
          <Text style={styles.insightText}>
            • Sync is taking longer than usual - check connection
          </Text>
        )}
        
        {!metrics.batteryOptimized && (
          <Text style={styles.insightText}>
            • Enable battery optimization for better performance
          </Text>
        )}
        
        {metrics.memoryUsage < 50 && metrics.networkLatency < 200 && metrics.syncLatency < 5000 && (
          <Text style={[styles.insightText, { color: '#10B981' }]}>
            • All systems performing optimally
          </Text>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        {(hasAlerts || metrics.memoryUsage > 75 || !metrics.batteryOptimized) && (
          <TouchableOpacity
            style={[styles.actionButton, loading && styles.actionButtonDisabled]}
            onPress={onOptimize}
            disabled={loading}
          >
            <Ionicons 
              name={loading ? 'hourglass' : 'flash'} 
              size={16} 
              color={loading ? '#9CA3AF' : '#3B82F6'} 
            />
            <Text style={[styles.actionButtonText, loading && styles.actionButtonTextDisabled]}>
              {loading ? 'Optimizing...' : 'Optimize'}
            </Text>
          </TouchableOpacity>
        )}

        {onViewDetails && (
          <TouchableOpacity 
            style={[
              styles.detailsButton, 
              (!hasAlerts && metrics.memoryUsage <= 75 && metrics.batteryOptimized) && { flex: 1 }
            ]} 
            onPress={onViewDetails}
          >
            <Text style={styles.detailsButtonText}>Details</Text>
            <Ionicons name="chevron-forward" size={16} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Last updated timestamp */}
      <Text style={styles.lastUpdated}>
        Updated {new Date(metrics.lastUpdated).toLocaleTimeString()}
      </Text>
    </View>
  );
});

PerformanceMetrics.displayName = 'PerformanceMetrics';

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginLeft: 8,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  alertCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricItem: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  metricSubtext: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  alertsSection: {
    marginBottom: 16,
  },
  alertsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
    marginBottom: 8,
  },
  alertItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  alertContent: {
    flex: 1,
    marginLeft: 8,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  alertDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
    marginBottom: 4,
  },
  alertRecommendation: {
    fontSize: 11,
    color: '#3B82F6',
    fontStyle: 'italic',
  },
  viewMoreButton: {
    marginTop: 4,
  },
  viewMoreText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  insightsSection: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  insightsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  insightText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 16,
    marginBottom: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  actionButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
    marginLeft: 6,
  },
  actionButtonTextDisabled: {
    color: '#9CA3AF',
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailsButtonText: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 4,
  },
  lastUpdated: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
});