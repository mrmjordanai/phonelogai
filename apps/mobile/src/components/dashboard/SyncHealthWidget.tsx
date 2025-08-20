import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SyncHealthStatus } from '../../services/SyncHealthMonitor';

interface SyncHealthWidgetProps {
  status: SyncHealthStatus | null;
  onManualSync?: () => void;
  onViewDetails?: () => void;
  loading?: boolean;
}

export const SyncHealthWidget = memo<SyncHealthWidgetProps>(({
  status,
  onManualSync,
  onViewDetails,
  loading = false
}) => {
  if (!status) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.statusIndicator, { backgroundColor: '#9CA3AF' }]} />
          <Text style={styles.title}>Sync Health</Text>
        </View>
        <Text style={styles.noDataText}>Initializing...</Text>
      </View>
    );
  }

  const getHealthColor = (health: string): string => {
    switch (health) {
      case 'healthy': return '#10B981';
      case 'warning': return '#F59E0B';
      case 'error': return '#EF4444';
      case 'critical': return '#DC2626';
      default: return '#9CA3AF';
    }
  };

  const getHealthIcon = (health: string): keyof typeof Ionicons.glyphMap => {
    switch (health) {
      case 'healthy': return 'checkmark-circle';
      case 'warning': return 'warning';
      case 'error': return 'alert-circle';
      case 'critical': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const getNetworkIcon = (networkStatus: string): keyof typeof Ionicons.glyphMap => {
    switch (networkStatus) {
      case 'connected': return 'wifi';
      case 'limited': return 'cellular';
      case 'disconnected': return 'wifi-outline';
      default: return 'help-circle';
    }
  };

  const formatRelativeTime = (date: Date | null): string => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const healthColor = getHealthColor(status.overallHealth);
  const healthIcon = getHealthIcon(status.overallHealth);
  const networkIcon = getNetworkIcon(status.networkStatus);

  return (
    <View style={styles.container}>
      {/* Header with status indicator */}
      <View style={styles.header}>
        <View style={[styles.statusIndicator, { backgroundColor: healthColor }]} />
        <Text style={styles.title}>Sync Health</Text>
        <View style={styles.healthScore}>
          <Text style={[styles.scoreText, { color: healthColor }]}>
            {status.healthScore}
          </Text>
          <Text style={styles.scoreLabel}>%</Text>
        </View>
      </View>

      {/* Main status info */}
      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <Ionicons name={healthIcon} size={16} color={healthColor} />
          <Text style={[styles.statusText, { color: healthColor }]}>
            {status.overallHealth.charAt(0).toUpperCase() + status.overallHealth.slice(1)}
          </Text>
        </View>

        <View style={styles.statusItem}>
          <Ionicons name={networkIcon} size={16} color="#6B7280" />
          <Text style={styles.statusText}>
            {status.networkStatus.charAt(0).toUpperCase() + status.networkStatus.slice(1)}
          </Text>
        </View>
      </View>

      {/* Detailed metrics */}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{status.queueDepth}</Text>
          <Text style={styles.metricLabel}>Queue</Text>
        </View>

        <View style={styles.metric}>
          <Text style={styles.metricValue}>
            {status.successRate.toFixed(0)}%
          </Text>
          <Text style={styles.metricLabel}>Success</Text>
        </View>

        <View style={styles.metric}>
          <Text style={styles.metricValue}>
            {formatRelativeTime(status.lastSync)}
          </Text>
          <Text style={styles.metricLabel}>Last Sync</Text>
        </View>
      </View>

      {/* Issues section */}
      {status.issues.length > 0 && (
        <View style={styles.issuesSection}>
          <Text style={styles.issuesTitle}>
            {status.issues.length} Issue{status.issues.length > 1 ? 's' : ''}
          </Text>
          {status.issues.slice(0, 2).map((issue, _index) => (
            <View key={issue.id} style={styles.issueItem}>
              <Ionicons 
                name={issue.severity === 'critical' ? 'alert-circle' : 'warning'} 
                size={12} 
                color={issue.severity === 'critical' ? '#DC2626' : '#F59E0B'} 
              />
              <Text style={styles.issueText} numberOfLines={1}>
                {issue.message}
              </Text>
            </View>
          ))}
          {status.issues.length > 2 && (
            <TouchableOpacity onPress={onViewDetails} style={styles.viewMoreButton}>
              <Text style={styles.viewMoreText}>
                +{status.issues.length - 2} more
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, loading && styles.actionButtonDisabled]}
          onPress={onManualSync}
          disabled={loading}
        >
          <Ionicons 
            name={loading ? 'hourglass' : 'refresh'} 
            size={16} 
            color={loading ? '#9CA3AF' : '#3B82F6'} 
          />
          <Text style={[styles.actionButtonText, loading && styles.actionButtonTextDisabled]}>
            {loading ? 'Syncing...' : 'Manual Sync'}
          </Text>
        </TouchableOpacity>

        {onViewDetails && (
          <TouchableOpacity style={styles.detailsButton} onPress={onViewDetails}>
            <Text style={styles.detailsButtonText}>Details</Text>
            <Ionicons name="chevron-forward" size={16} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

SyncHealthWidget.displayName = 'SyncHealthWidget';

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
    marginBottom: 12,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  healthScore: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    marginLeft: 6,
    color: '#374151',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 12,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  issuesSection: {
    marginBottom: 16,
  },
  issuesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
    marginBottom: 8,
  },
  issueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  issueText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
    flex: 1,
  },
  viewMoreButton: {
    marginTop: 4,
  },
  viewMoreText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  noDataText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
});