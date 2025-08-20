/**
 * MetricsDisplay - Detailed performance metrics visualization component
 * 
 * Displays comprehensive performance metrics with charts, trends, and detailed breakdowns
 * for mobile app performance analysis.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { PerformanceMetrics } from '../../services/PerformanceMonitor';

const { width: screenWidth } = Dimensions.get('window');

interface MetricsDisplayProps {
  metrics: PerformanceMetrics;
  showDetailed?: boolean;
}

const MetricsDisplay: React.FC<MetricsDisplayProps> = ({
  metrics,
  showDetailed = true,
}) => {
  /**
   * Format bytes to readable string
   */
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  /**
   * Format time to readable string
   */
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  /**
   * Get performance status color
   */
  const getStatusColor = (value: number, target: number, reverse = false): string => {
    const ratio = value / target;
    if (reverse) {
      // For metrics where higher is better (like success rate)
      if (ratio >= 0.9) return '#28a745'; // Green
      if (ratio >= 0.7) return '#ffc107'; // Yellow
      return '#dc3545'; // Red
    } else {
      // For metrics where lower is better (like response time)
      if (ratio <= 0.7) return '#28a745'; // Green
      if (ratio <= 1.0) return '#ffc107'; // Yellow
      return '#dc3545'; // Red
    }
  };

  /**
   * Render startup metrics
   */
  const renderStartupMetrics = () => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Startup Performance</Text>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Startup Time</Text>
          <Text style={[
            styles.metricValue,
            { color: getStatusColor(metrics.startupTime, 2000) }
          ]}>
            {formatTime(metrics.startupTime)}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min((metrics.startupTime / 2000) * 100, 100)}%`,
                backgroundColor: getStatusColor(metrics.startupTime, 2000),
              },
            ]}
          />
        </View>
        <Text style={styles.targetText}>Target: ≤2.0s</Text>
      </View>
    );
  };

  /**
   * Render navigation metrics
   */
  const renderNavigationMetrics = () => {
    const navigationTimes = Object.entries(metrics.navigationTimes);
    const averageNavTime = navigationTimes.length > 0
      ? navigationTimes.reduce((sum, [, time]) => sum + time, 0) / navigationTimes.length
      : 0;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Navigation Performance</Text>
        
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Average Navigation</Text>
          <Text style={[
            styles.metricValue,
            { color: getStatusColor(averageNavTime, 100) }
          ]}>
            {formatTime(averageNavTime)}
          </Text>
        </View>
        
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min((averageNavTime / 100) * 100, 100)}%`,
                backgroundColor: getStatusColor(averageNavTime, 100),
              },
            ]}
          />
        </View>
        <Text style={styles.targetText}>Target: ≤100ms</Text>

        {showDetailed && navigationTimes.length > 0 && (
          <View style={styles.detailedNavigation}>
            <Text style={styles.subSectionTitle}>Recent Navigation Times</Text>
            {navigationTimes.slice(-5).map(([screen, time], index) => (
              <View key={index} style={styles.navigationItem}>
                <Text style={styles.navigationScreen} numberOfLines={1}>
                  {screen}
                </Text>
                <Text style={[
                  styles.navigationTime,
                  { color: getStatusColor(time, 100) }
                ]}>
                  {formatTime(time)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  /**
   * Render memory metrics
   */
  const renderMemoryMetrics = () => {
    const recentMemory = metrics.memoryUsage.slice(-10);
    const currentMemory = recentMemory[recentMemory.length - 1];
    const peakMemory = Math.max(...recentMemory.map(m => m.used));
    const averageMemory = recentMemory.reduce((sum, m) => sum + m.used, 0) / recentMemory.length;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Memory Usage</Text>
        
        <View style={styles.memoryGrid}>
          <View style={styles.memoryCard}>
            <Text style={styles.memoryCardLabel}>Current</Text>
            <Text style={[
              styles.memoryCardValue,
              { color: getStatusColor(currentMemory?.used || 0, 100) }
            ]}>
              {currentMemory?.used.toFixed(1) || '0'}MB
            </Text>
          </View>
          
          <View style={styles.memoryCard}>
            <Text style={styles.memoryCardLabel}>Peak</Text>
            <Text style={[
              styles.memoryCardValue,
              { color: getStatusColor(peakMemory, 100) }
            ]}>
              {peakMemory.toFixed(1)}MB
            </Text>
          </View>
          
          <View style={styles.memoryCard}>
            <Text style={styles.memoryCardLabel}>Average</Text>
            <Text style={[
              styles.memoryCardValue,
              { color: getStatusColor(averageMemory, 100) }
            ]}>
              {averageMemory.toFixed(1)}MB
            </Text>
          </View>
          
          <View style={styles.memoryCard}>
            <Text style={styles.memoryCardLabel}>Available</Text>
            <Text style={styles.memoryCardValue}>
              {currentMemory?.available.toFixed(1) || '0'}MB
            </Text>
          </View>
        </View>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(((currentMemory?.used || 0) / 100) * 100, 100)}%`,
                backgroundColor: getStatusColor(currentMemory?.used || 0, 100),
              },
            ]}
          />
        </View>
        <Text style={styles.targetText}>Target: ≤100MB</Text>
      </View>
    );
  };

  /**
   * Render network metrics
   */
  const renderNetworkMetrics = () => {
    const { networkMetrics } = metrics;
    const successRate = networkMetrics.requestCount > 0
      ? ((networkMetrics.requestCount - networkMetrics.failedRequests) / networkMetrics.requestCount) * 100
      : 100;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network Performance</Text>
        
        <View style={styles.networkGrid}>
          <View style={styles.networkCard}>
            <Text style={styles.networkCardLabel}>Requests</Text>
            <Text style={styles.networkCardValue}>
              {networkMetrics.requestCount}
            </Text>
          </View>
          
          <View style={styles.networkCard}>
            <Text style={styles.networkCardLabel}>Avg Latency</Text>
            <Text style={[
              styles.networkCardValue,
              { color: getStatusColor(networkMetrics.averageLatency, 1000) }
            ]}>
              {formatTime(networkMetrics.averageLatency)}
            </Text>
          </View>
          
          <View style={styles.networkCard}>
            <Text style={styles.networkCardLabel}>Success Rate</Text>
            <Text style={[
              styles.networkCardValue,
              { color: getStatusColor(successRate, 95, true) }
            ]}>
              {successRate.toFixed(1)}%
            </Text>
          </View>
          
          <View style={styles.networkCard}>
            <Text style={styles.networkCardLabel}>Data Transfer</Text>
            <Text style={styles.networkCardValue}>
              {formatBytes(networkMetrics.totalBytes)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Render screen metrics
   */
  const renderScreenMetrics = () => {
    const screenEntries = Object.entries(metrics.screenMetrics);
    
    if (screenEntries.length === 0) {
      return null;
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Screen Performance</Text>
        
        {screenEntries.slice(0, 5).map(([screenName, screenMetrics], index) => (
          <View key={index} style={styles.screenItem}>
            <Text style={styles.screenName} numberOfLines={1}>
              {screenName}
            </Text>
            <View style={styles.screenMetrics}>
              <Text style={styles.screenMetric}>
                Render: {formatTime(screenMetrics.renderTime)}
              </Text>
              <Text style={styles.screenMetric}>
                Mount: {formatTime(screenMetrics.mountTime)}
              </Text>
              <Text style={styles.screenMetric}>
                Views: {screenMetrics.accessCount}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  /**
   * Render bundle metrics
   */
  const renderBundleMetrics = () => {
    if (!metrics.bundleSize) {
      return null;
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bundle Size</Text>
        
        <View style={styles.bundleGrid}>
          <View style={styles.bundleCard}>
            <Text style={styles.bundleCardLabel}>JavaScript</Text>
            <Text style={styles.bundleCardValue}>
              {formatBytes(metrics.bundleSize.jsBundle)}
            </Text>
          </View>
          
          <View style={styles.bundleCard}>
            <Text style={styles.bundleCardLabel}>Total Assets</Text>
            <Text style={styles.bundleCardValue}>
              {formatBytes(metrics.bundleSize.totalAssets)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {renderStartupMetrics()}
      {renderNavigationMetrics()}
      {renderMemoryMetrics()}
      {renderNetworkMetrics()}
      {showDetailed && renderScreenMetrics()}
      {showDetailed && renderBundleMetrics()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginBottom: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 12,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginTop: 12,
    marginBottom: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 14,
    color: '#495057',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e9ecef',
    borderRadius: 2,
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  targetText: {
    fontSize: 11,
    color: '#6c757d',
    textAlign: 'right',
  },
  detailedNavigation: {
    marginTop: 8,
  },
  navigationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  navigationScreen: {
    fontSize: 12,
    color: '#495057',
    flex: 1,
    marginRight: 8,
  },
  navigationTime: {
    fontSize: 12,
    fontWeight: '600',
  },
  memoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  memoryCard: {
    width: (screenWidth - 48) / 2 - 4,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  memoryCardLabel: {
    fontSize: 11,
    color: '#6c757d',
    marginBottom: 2,
  },
  memoryCardValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  networkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  networkCard: {
    width: (screenWidth - 48) / 2 - 4,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  networkCardLabel: {
    fontSize: 11,
    color: '#6c757d',
    marginBottom: 2,
    textAlign: 'center',
  },
  networkCardValue: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  screenItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  screenName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#495057',
    flex: 1,
    marginRight: 8,
  },
  screenMetrics: {
    flexDirection: 'row',
  },
  screenMetric: {
    fontSize: 10,
    color: '#6c757d',
    marginLeft: 8,
  },
  bundleGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  bundleCard: {
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  bundleCardLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
  },
  bundleCardValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#212529',
  },
});

export default MetricsDisplay;