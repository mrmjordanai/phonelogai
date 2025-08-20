/**
 * PerformanceDashboard - Comprehensive performance monitoring dashboard
 * 
 * Displays real-time performance metrics, trends, insights, and testing results
 * for mobile app performance optimization.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import PerformanceMonitor, { PerformanceMetrics } from '../../services/PerformanceMonitor';
import MetricsCollector, { PerformanceInsight } from '../../services/MetricsCollector';
import MemoryProfiler, { MemoryAnalysis } from '../../utils/MemoryProfiler';
import PerformanceTester, { TestReport } from '../../utils/PerformanceTester';
import MetricsDisplay from './MetricsDisplay';

const { width: screenWidth } = Dimensions.get('window');

interface PerformanceDashboardProps {
  onTestingRequested?: () => void;
  onExportRequested?: () => void;
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  onTestingRequested,
  onExportRequested,
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [insights, setInsights] = useState<PerformanceInsight[]>([]);
  const [memoryAnalysis, setMemoryAnalysis] = useState<MemoryAnalysis | null>(null);
  const [testReports, setTestReports] = useState<TestReport[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'insights' | 'tests' | 'memory'>('metrics');

  const performanceMonitor = PerformanceMonitor.getInstance();
  const metricsCollector = MetricsCollector.getInstance();
  const memoryProfiler = MemoryProfiler.getInstance();
  const performanceTester = PerformanceTester.getInstance();

  /**
   * Load performance data
   */
  const loadPerformanceData = useCallback(async () => {
    try {
      // Get current metrics
      const currentMetrics = performanceMonitor.getMetrics();
      setMetrics(currentMetrics);

      // Get insights
      const currentInsights = metricsCollector.getCurrentInsights();
      setInsights(currentInsights);

      // Get trends analysis
      await metricsCollector.analyzeTrends(20);

      // Get memory analysis
      const memAnalysis = memoryProfiler.getMemorySummary();
      // Convert to MemoryAnalysis format
      const fullMemoryAnalysis: MemoryAnalysis = {
        snapshots: [],
        leaks: memoryProfiler.detectMemoryLeaks(),
        trends: {
          averageUsage: memAnalysis.average,
          peakUsage: memAnalysis.peak.usedMemory,
          growthRate: 0,
          stableAfterMinutes: 0,
        },
        recommendations: [],
      };
      setMemoryAnalysis(fullMemoryAnalysis);

      // Get test reports
      const reports = await performanceTester.loadTestReports();
      setTestReports(reports.slice(0, 5)); // Show last 5 reports

    } catch (error) {
      console.error('[PerformanceDashboard] Error loading data:', error);
    }
  }, []);

  /**
   * Refresh data
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadPerformanceData();
    setIsRefreshing(false);
  }, [loadPerformanceData]);

  /**
   * Run performance tests
   */
  const handleRunTests = useCallback(async () => {
    if (onTestingRequested) {
      onTestingRequested();
      return;
    }

    Alert.alert(
      'Run Performance Tests',
      'This will run comprehensive performance tests. This may take a few minutes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Tests',
          onPress: async () => {
            try {
              const reports = await performanceTester.runAllTests();
              setTestReports(reports);
              Alert.alert('Tests Complete', `Completed ${reports.length} test suites`);
            } catch (error) {
              Alert.alert('Error', 'Failed to run performance tests');
              console.error('[PerformanceDashboard] Test error:', error);
            }
          },
        },
      ]
    );
  }, [onTestingRequested]);

  /**
   * Export performance data
   */
  const handleExportData = useCallback(async () => {
    if (onExportRequested) {
      onExportRequested();
      return;
    }

    try {
      const exportData = await metricsCollector.exportMetrics();
      // In a real app, you'd use a sharing library
      console.log('[PerformanceDashboard] Export data:', exportData);
      Alert.alert('Export Complete', 'Performance data exported to console');
    } catch (error) {
      Alert.alert('Error', 'Failed to export performance data');
      console.error('[PerformanceDashboard] Export error:', error);
    }
  }, [onExportRequested]);

  /**
   * Start memory profiling
   */
  const handleStartMemoryProfiling = useCallback(() => {
    Alert.alert(
      'Start Memory Profiling',
      'This will monitor memory usage for performance analysis.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: () => {
            memoryProfiler.startProfiling();
            Alert.alert('Memory Profiling Started', 'Memory usage is now being monitored');
          },
        },
      ]
    );
  }, []);

  /**
   * Stop memory profiling
   */
  const handleStopMemoryProfiling = useCallback(() => {
    const analysis = memoryProfiler.stopProfiling();
    setMemoryAnalysis(analysis);
    Alert.alert('Memory Profiling Stopped', 'Analysis complete');
  }, []);

  useEffect(() => {
    loadPerformanceData();
    
    // Set up periodic refresh
    const interval = setInterval(loadPerformanceData, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [loadPerformanceData]);

  /**
   * Render performance summary
   */
  const renderPerformanceSummary = () => {
    if (!metrics) return null;

    const summary = performanceMonitor.getPerformanceSummary();
    
    return (
      <View style={styles.summaryContainer}>
        <Text style={styles.sectionTitle}>Performance Summary</Text>
        
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, summary.startup.passes ? styles.passCard : styles.failCard]}>
            <Text style={styles.summaryLabel}>Startup</Text>
            <Text style={styles.summaryValue}>{summary.startup.time}ms</Text>
            <Text style={styles.summaryTarget}>Target: {summary.startup.target}ms</Text>
          </View>
          
          <View style={[styles.summaryCard, summary.navigation.passes ? styles.passCard : styles.failCard]}>
            <Text style={styles.summaryLabel}>Navigation</Text>
            <Text style={styles.summaryValue}>{summary.navigation.average.toFixed(0)}ms</Text>
            <Text style={styles.summaryTarget}>Target: {summary.navigation.target}ms</Text>
          </View>
          
          <View style={[styles.summaryCard, summary.memory.passes ? styles.passCard : styles.failCard]}>
            <Text style={styles.summaryLabel}>Memory</Text>
            <Text style={styles.summaryValue}>{summary.memory.peak.toFixed(0)}MB</Text>
            <Text style={styles.summaryTarget}>Target: {summary.memory.target}MB</Text>
          </View>
          
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Network</Text>
            <Text style={styles.summaryValue}>{summary.network.averageLatency.toFixed(0)}ms</Text>
            <Text style={styles.summaryTarget}>Failure: {summary.network.failureRate.toFixed(1)}%</Text>
          </View>
        </View>
      </View>
    );
  };

  /**
   * Render insights
   */
  const renderInsights = () => {
    return (
      <View style={styles.insightsContainer}>
        <Text style={styles.sectionTitle}>Performance Insights</Text>
        
        {insights.length === 0 ? (
          <Text style={styles.noDataText}>No performance insights available</Text>
        ) : (
          insights.slice(0, 5).map((insight, index) => (
            <View key={index} style={[styles.insightCard, styles[`${insight.type}Card`]]}>
              <View style={styles.insightHeader}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightImpact}>{insight.impact.toUpperCase()}</Text>
              </View>
              <Text style={styles.insightDescription}>{insight.description}</Text>
              {insight.recommendation && (
                <Text style={styles.insightRecommendation}>💡 {insight.recommendation}</Text>
              )}
            </View>
          ))
        )}
      </View>
    );
  };

  /**
   * Render test results
   */
  const renderTestResults = () => {
    return (
      <View style={styles.testsContainer}>
        <View style={styles.testsHeader}>
          <Text style={styles.sectionTitle}>Test Results</Text>
          <TouchableOpacity style={styles.runTestsButton} onPress={handleRunTests}>
            <Text style={styles.runTestsButtonText}>Run Tests</Text>
          </TouchableOpacity>
        </View>
        
        {testReports.length === 0 ? (
          <Text style={styles.noDataText}>No test reports available</Text>
        ) : (
          testReports.map((report, index) => (
            <View key={index} style={styles.testReportCard}>
              <View style={styles.testReportHeader}>
                <Text style={styles.testReportName}>{report.suiteName}</Text>
                <Text style={[styles.testReportGrade, styles[`grade${report.summary.performanceGrade}`]]}>
                  {report.summary.performanceGrade}
                </Text>
              </View>
              <View style={styles.testReportStats}>
                <Text style={styles.testReportStat}>
                  {report.passedTests}/{report.totalTests} passed ({report.summary.successRate.toFixed(0)}%)
                </Text>
                <Text style={styles.testReportStat}>
                  Avg: {report.summary.averageDuration.toFixed(0)}ms
                </Text>
                <Text style={styles.testReportStat}>
                  Peak: {report.summary.peakMemoryUsage.toFixed(0)}MB
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  /**
   * Render memory analysis
   */
  const renderMemoryAnalysis = () => {
    return (
      <View style={styles.memoryContainer}>
        <View style={styles.memoryHeader}>
          <Text style={styles.sectionTitle}>Memory Analysis</Text>
          <View style={styles.memoryButtons}>
            <TouchableOpacity style={styles.memoryButton} onPress={handleStartMemoryProfiling}>
              <Text style={styles.memoryButtonText}>Start</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.memoryButton} onPress={handleStopMemoryProfiling}>
              <Text style={styles.memoryButtonText}>Stop</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {memoryAnalysis ? (
          <View>
            <View style={styles.memoryTrends}>
              <Text style={styles.memoryTrendLabel}>Average Usage: {memoryAnalysis.trends.averageUsage.toFixed(1)}MB</Text>
              <Text style={styles.memoryTrendLabel}>Peak Usage: {memoryAnalysis.trends.peakUsage.toFixed(1)}MB</Text>
              <Text style={styles.memoryTrendLabel}>Growth Rate: {memoryAnalysis.trends.growthRate.toFixed(2)}MB/min</Text>
            </View>
            
            {memoryAnalysis.leaks.length > 0 && (
              <View style={styles.memoryLeaks}>
                <Text style={styles.memoryLeaksTitle}>Memory Leaks Detected:</Text>
                {memoryAnalysis.leaks.map((leak, index) => (
                  <Text key={index} style={[styles.memoryLeak, styles[`${leak.severity}Leak`]]}>
                    {leak.description}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.noDataText}>No memory analysis available</Text>
        )}
      </View>
    );
  };

  /**
   * Render tab content
   */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'metrics':
        return (
          <View>
            {renderPerformanceSummary()}
            {metrics && <MetricsDisplay metrics={metrics} />}
          </View>
        );
      case 'insights':
        return renderInsights();
      case 'tests':
        return renderTestResults();
      case 'memory':
        return renderMemoryAnalysis();
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Performance Dashboard</Text>
        <TouchableOpacity style={styles.exportButton} onPress={handleExportData}>
          <Text style={styles.exportButtonText}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {[
          { key: 'metrics', label: 'Metrics' },
          { key: 'insights', label: 'Insights' },
          { key: 'tests', label: 'Tests' },
          { key: 'memory', label: 'Memory' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key as 'metrics' | 'insights' | 'tests' | 'memory')}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {renderTabContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
  },
  exportButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007bff',
  },
  tabText: {
    fontSize: 14,
    color: '#6c757d',
  },
  activeTabText: {
    color: '#007bff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 12,
  },
  summaryContainer: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryCard: {
    width: (screenWidth - 48) / 2,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  passCard: {
    borderColor: '#28a745',
    backgroundColor: '#d4edda',
  },
  failCard: {
    borderColor: '#dc3545',
    backgroundColor: '#f8d7da',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
  },
  summaryTarget: {
    fontSize: 10,
    color: '#6c757d',
    marginTop: 2,
  },
  insightsContainer: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  insightCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  errorCard: {
    backgroundColor: '#f8d7da',
    borderLeftColor: '#dc3545',
  },
  warningCard: {
    backgroundColor: '#fff3cd',
    borderLeftColor: '#ffc107',
  },
  infoCard: {
    backgroundColor: '#d1ecf1',
    borderLeftColor: '#17a2b8',
  },
  successCard: {
    backgroundColor: '#d4edda',
    borderLeftColor: '#28a745',
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
    flex: 1,
  },
  insightImpact: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#6c757d',
  },
  insightDescription: {
    fontSize: 12,
    color: '#495057',
    marginBottom: 4,
  },
  insightRecommendation: {
    fontSize: 11,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  testsContainer: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  testsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  runTestsButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  runTestsButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  testReportCard: {
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  testReportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  testReportName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
    flex: 1,
  },
  testReportGrade: {
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    color: '#fff',
  },
  gradeA: { backgroundColor: '#28a745' },
  gradeB: { backgroundColor: '#17a2b8' },
  gradeC: { backgroundColor: '#ffc107', color: '#212529' },
  gradeD: { backgroundColor: '#fd7e14' },
  gradeF: { backgroundColor: '#dc3545' },
  testReportStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  testReportStat: {
    fontSize: 11,
    color: '#6c757d',
  },
  memoryContainer: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  memoryButtons: {
    flexDirection: 'row',
  },
  memoryButton: {
    backgroundColor: '#17a2b8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  memoryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  memoryTrends: {
    marginBottom: 12,
  },
  memoryTrendLabel: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
  },
  memoryLeaks: {
    marginTop: 12,
  },
  memoryLeaksTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc3545',
    marginBottom: 8,
  },
  memoryLeak: {
    fontSize: 12,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  lowLeak: {
    backgroundColor: '#fff3cd',
    color: '#856404',
  },
  mediumLeak: {
    backgroundColor: '#ffeaa7',
    color: '#6c5ce7',
  },
  highLeak: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  noDataText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default PerformanceDashboard;