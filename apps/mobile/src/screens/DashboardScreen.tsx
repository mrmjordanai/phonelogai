import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDashboardAnalytics } from '../hooks/useDashboardAnalytics';
import {
  ActivityTrendChart,
  CommunicationPieChart,
  DurationBarChart,
  ActivityHeatmap,
  TimeRangeSelector,
  SyncHealthWidget,
  DataQualityCard,
  PerformanceMetrics,
  EnhancedQuickActions,
} from '../components/dashboard';

type DashboardTab = 'overview' | 'trends' | 'patterns' | 'contacts' | 'monitoring';

export function DashboardScreen() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  
  const {
    basicMetrics,
    loading,
    error,
    refreshing,
    filters,
    isLoading,
    refreshAllData,
    updateDateRange,
    getChartData,
    // Enhanced monitoring data
    syncHealthStatus,
    conflictMetrics,
    queueStats,
    performanceMetrics,
    networkStatus,
    // Enhanced functions
    triggerManualSync,
  } = useDashboardAnalytics();

  const formatDuration = (minutes: number) => {
    return `${Math.round(minutes)}m`;
  };

  const MetricCard = ({ title, value, icon, color }: {
    title: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  }) => (
    <View style={styles.metricCard}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricTitle}>{title}</Text>
    </View>
  );

  const TabButton = ({ tab, title, icon, isActive }: {
    tab: DashboardTab;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    isActive: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.tabButton, isActive && styles.tabButtonActive]}
      onPress={() => setActiveTab(tab)}
      activeOpacity={0.7}
    >
      <Ionicons 
        name={icon} 
        size={20} 
        color={isActive ? '#3B82F6' : '#9CA3AF'} 
      />
      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderOverviewContent = () => (
    <>
      {/* Enhanced real-time monitoring widgets */}
      <SyncHealthWidget
        status={syncHealthStatus}
        onManualSync={triggerManualSync}
        loading={refreshing}
      />

      <DataQualityCard
        metrics={conflictMetrics}
        dataQualityScore={syncHealthStatus?.dataQualityScore}
        loading={loading.conflictMetrics}
      />

      {/* Original metrics grid */}
      {basicMetrics && (
        <View style={styles.metricsGrid}>
          <MetricCard
            title="Total Calls"
            value={basicMetrics.total_calls.toLocaleString()}
            icon="call"
            color="#3B82F6"
          />
          <MetricCard
            title="Total SMS"
            value={basicMetrics.total_sms.toLocaleString()}
            icon="chatbubbles"
            color="#10B981"
          />
          <MetricCard
            title="Contacts"
            value={basicMetrics.unique_contacts.toLocaleString()}
            icon="people"
            color="#8B5CF6"
          />
          <MetricCard
            title="Avg Duration"
            value={formatDuration(basicMetrics.avg_call_duration_minutes || 0)}
            icon="time"
            color="#F59E0B"
          />
        </View>
      )}

      {basicMetrics && (
        <CommunicationPieChart
          data={getChartData()?.pieChart || null}
          loading={loading.basicMetrics}
          error={error.basicMetrics}
        />
      )}

      {/* Enhanced Quick Actions with navigation */}
      <EnhancedQuickActions
        onManualSync={triggerManualSync}
        syncInProgress={refreshing}
        queueDepth={queueStats?.totalItems || 0}
        pendingConflicts={conflictMetrics?.pending_resolution || 0}
      />
    </>
  );

  const renderTrendsContent = () => (
    <>
      <TimeRangeSelector
        selectedPreset={filters.dateRange.preset || '30d'}
        onPresetSelect={updateDateRange}
        onCustomRangePress={() => {
          // TODO: Implement date picker modal
          console.log('Custom date picker not implemented yet');
        }}
        dateRange={filters.dateRange}
      />
      
      <ActivityTrendChart
        data={getChartData()?.lineChart || null}
        loading={loading.timeSeriesData}
        error={error.timeSeriesData}
        title="Activity Trend"
      />
    </>
  );

  const renderPatternsContent = () => (
    <>
      <ActivityHeatmap
        data={getChartData()?.heatmapMatrix || null}
        loading={loading.activityHeatmap}
        error={error.activityHeatmap}
        title="Activity Heatmap"
      />
      
      <DurationBarChart
        data={getChartData()?.barChart || null}
        loading={loading.callPatterns}
        error={error.callPatterns}
        title="Call Duration Distribution"
      />
    </>
  );

  const renderContactsContent = () => (
    <>
      {basicMetrics?.top_contact && (
        <View style={styles.topContactCard}>
          <Text style={styles.sectionTitle}>Top Contact</Text>
          <View style={styles.contactInfo}>
            <View style={[styles.contactIcon, { backgroundColor: '#8B5CF620' }]}>
              <Ionicons name="person" size={24} color="#8B5CF6" />
            </View>
            <View style={styles.contactDetails}>
              <Text style={styles.contactName}>
                {basicMetrics.top_contact.name || 'Unknown'}
              </Text>
              <Text style={styles.contactNumber}>
                {basicMetrics.top_contact.number}
              </Text>
              <Text style={styles.contactStats}>
                {basicMetrics.top_contact.interaction_count} interactions
              </Text>
            </View>
          </View>
        </View>
      )}
      
      <View style={styles.comingSoonCard}>
        <Ionicons name="construct" size={48} color="#9CA3AF" />
        <Text style={styles.comingSoonTitle}>Contact Insights Coming Soon</Text>
        <Text style={styles.comingSoonDescription}>
          Detailed contact analysis and relationship insights will be available in a future update
        </Text>
      </View>
    </>
  );

  const renderMonitoringContent = () => (
    <>
      <SyncHealthWidget
        status={syncHealthStatus}
        onManualSync={triggerManualSync}
        loading={refreshing}
      />

      <DataQualityCard
        metrics={conflictMetrics}
        dataQualityScore={syncHealthStatus?.dataQualityScore}
        loading={loading.conflictMetrics}
      />

      <PerformanceMetrics
        metrics={performanceMetrics}
        loading={loading.performance}
      />

      {/* Detailed monitoring insights */}
      <View style={styles.monitoringInsights}>
        <Text style={styles.sectionTitle}>System Status</Text>
        
        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <Ionicons 
              name={networkStatus.isConnected ? "wifi" : "wifi-outline"} 
              size={20} 
              color={networkStatus.isConnected ? "#10B981" : "#EF4444"} 
            />
            <Text style={styles.statusLabel}>Network</Text>
            <Text style={[
              styles.statusValue,
              { color: networkStatus.isConnected ? "#10B981" : "#EF4444" }
            ]}>
              {networkStatus.isConnected ? "Connected" : "Offline"}
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Ionicons 
              name="sync" 
              size={20} 
              color={syncHealthStatus?.overallHealth === 'healthy' ? "#10B981" : "#F59E0B"} 
            />
            <Text style={styles.statusLabel}>Sync Health</Text>
            <Text style={[
              styles.statusValue,
              { color: syncHealthStatus?.overallHealth === 'healthy' ? "#10B981" : "#F59E0B" }
            ]}>
              {syncHealthStatus?.overallHealth?.charAt(0).toUpperCase() + 
               (syncHealthStatus?.overallHealth?.slice(1) || 'Unknown')}
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Ionicons 
              name="layers" 
              size={20} 
              color={queueStats && queueStats.totalItems < 10 ? "#10B981" : "#F59E0B"} 
            />
            <Text style={styles.statusLabel}>Queue</Text>
            <Text style={[
              styles.statusValue,
              { color: queueStats && queueStats.totalItems < 10 ? "#10B981" : "#F59E0B" }
            ]}>
              {queueStats?.totalItems || 0} items
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Ionicons 
              name="shield-checkmark" 
              size={20} 
              color={(syncHealthStatus?.dataQualityScore || 0) > 90 ? "#10B981" : "#F59E0B"} 
            />
            <Text style={styles.statusLabel}>Data Quality</Text>
            <Text style={[
              styles.statusValue,
              { color: (syncHealthStatus?.dataQualityScore || 0) > 90 ? "#10B981" : "#F59E0B" }
            ]}>
              {syncHealthStatus?.dataQualityScore?.toFixed(0) || 0}%
            </Text>
          </View>
        </View>
      </View>
    </>
  );

  const renderContent = () => {
    if (isLoading && !basicMetrics) {
      return (
        <View style={styles.loadingContainer}>
          <Text>Loading dashboard...</Text>
        </View>
      );
    }

    if (!basicMetrics && !isLoading) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="analytics" size={48} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Data Yet</Text>
          <Text style={styles.emptyDescription}>
            Upload your call and SMS data to see insights
          </Text>
          <TouchableOpacity style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      );
    }

    switch (activeTab) {
      case 'overview':
        return renderOverviewContent();
      case 'trends':
        return renderTrendsContent();
      case 'patterns':
        return renderPatternsContent();
      case 'contacts':
        return renderContactsContent();
      case 'monitoring':
        return renderMonitoringContent();
      default:
        return renderOverviewContent();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>
          {basicMetrics 
            ? `${basicMetrics.total_events.toLocaleString()} total events`
            : 'Communication insights and analytics'
          }
        </Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TabButton
          tab="overview"
          title="Overview"
          icon="home"
          isActive={activeTab === 'overview'}
        />
        <TabButton
          tab="trends"
          title="Trends"
          icon="trending-up"
          isActive={activeTab === 'trends'}
        />
        <TabButton
          tab="patterns"
          title="Patterns"
          icon="grid"
          isActive={activeTab === 'patterns'}
        />
        <TabButton
          tab="contacts"
          title="Contacts"
          icon="people"
          isActive={activeTab === 'contacts'}
        />
        <TabButton
          tab="monitoring"
          title="Monitor"
          icon="pulse"
          isActive={activeTab === 'monitoring'}
        />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={refreshAllData}
            tintColor="#3B82F6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
        
        {/* Bottom padding for better scrolling */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  tabButtonActive: {
    backgroundColor: '#EFF6FF',
  },
  tabText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 6,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  metricTitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  quickActions: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  topContactCard: {
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
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contactDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  contactNumber: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  contactStats: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  comingSoonCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  comingSoonDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 32,
  },
  // New styles for monitoring tab
  monitoringInsights: {
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
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statusItem: {
    width: '48%',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});