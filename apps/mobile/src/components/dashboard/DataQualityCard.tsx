import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ConflictMetrics } from '../../types/enhanced-dashboard';

interface DataQualityCardProps {
  metrics: ConflictMetrics | null;
  dataQualityScore?: number;
  onResolveConflicts?: () => void;
  onViewDetails?: () => void;
  loading?: boolean;
}

export const DataQualityCard = memo<DataQualityCardProps>(({
  metrics,
  dataQualityScore = 100,
  onResolveConflicts,
  onViewDetails,
  loading = false
}) => {
  if (!metrics) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={20} color="#8B5CF6" />
          <Text style={styles.title}>Data Quality</Text>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreText}>--</Text>
          </View>
        </View>
        <Text style={styles.noDataText}>No conflict data available</Text>
      </View>
    );
  }

  const getQualityColor = (score: number): string => {
    if (score >= 95) return '#10B981';
    if (score >= 85) return '#F59E0B';
    if (score >= 70) return '#EF4444';
    return '#DC2626';
  };

  const getQualityIcon = (score: number): keyof typeof Ionicons.glyphMap => {
    if (score >= 95) return 'shield-checkmark';
    if (score >= 85) return 'shield';
    if (score >= 70) return 'warning';
    return 'alert-circle';
  };

  const qualityColor = getQualityColor(dataQualityScore);
  const qualityIcon = getQualityIcon(dataQualityScore);

  const autoResolutionRate = metrics.total_conflicts > 0 
    ? (metrics.auto_resolution_rate || 0) 
    : 0;

  const pendingPercentage = metrics.total_conflicts > 0
    ? (metrics.pending_resolution / metrics.total_conflicts) * 100
    : 0;

  return (
    <View style={styles.container}>
      {/* Header with quality score */}
      <View style={styles.header}>
        <Ionicons name={qualityIcon} size={20} color={qualityColor} />
        <Text style={styles.title}>Data Quality</Text>
        <View style={[styles.scoreBadge, { backgroundColor: qualityColor + '20' }]}>
          <Text style={[styles.scoreText, { color: qualityColor }]}>
            {dataQualityScore.toFixed(0)}%
          </Text>
        </View>
      </View>

      {/* Quality improvement indicator */}
      <View style={styles.improvementRow}>
        <Text style={styles.improvementLabel}>Quality Improvement:</Text>
        <Text style={[styles.improvementValue, { color: qualityColor }]}>
          +{metrics.data_quality_improvement.toFixed(1)}%
        </Text>
      </View>

      {/* Metrics grid */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>{metrics.total_conflicts}</Text>
          <Text style={styles.metricLabel}>Total Conflicts</Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricValue, { color: '#10B981' }]}>
            {autoResolutionRate.toFixed(0)}%
          </Text>
          <Text style={styles.metricLabel}>Auto-Resolved</Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[
            styles.metricValue, 
            { color: metrics.pending_resolution > 0 ? '#EF4444' : '#10B981' }
          ]}>
            {metrics.pending_resolution}
          </Text>
          <Text style={styles.metricLabel}>Pending</Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>
            {(100 - pendingPercentage).toFixed(0)}%
          </Text>
          <Text style={styles.metricLabel}>Resolved</Text>
        </View>
      </View>

      {/* Resolution breakdown */}
      <View style={styles.resolutionBreakdown}>
        <Text style={styles.breakdownTitle}>Resolution Methods</Text>
        
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownItem}>
            <View style={[styles.breakdownDot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.breakdownLabel}>Automatic</Text>
            <Text style={styles.breakdownValue}>
              {metrics.resolved_automatic || 0}
            </Text>
          </View>

          <View style={styles.breakdownItem}>
            <View style={[styles.breakdownDot, { backgroundColor: '#8B5CF6' }]} />
            <Text style={styles.breakdownLabel}>Manual</Text>
            <Text style={styles.breakdownValue}>
              {metrics.resolved_manual || 0}
            </Text>
          </View>
        </View>
      </View>

      {/* Quality insights */}
      {dataQualityScore < 90 && (
        <View style={styles.insightSection}>
          <View style={styles.insightHeader}>
            <Ionicons name="bulb" size={16} color="#F59E0B" />
            <Text style={styles.insightTitle}>Quality Insights</Text>
          </View>
          
          {metrics.pending_resolution > 10 && (
            <Text style={styles.insightText}>
              • {metrics.pending_resolution} conflicts need manual review
            </Text>
          )}
          
          {autoResolutionRate < 80 && (
            <Text style={styles.insightText}>
              • Auto-resolution rate is below target (80%)
            </Text>
          )}
          
          {metrics.data_quality_improvement < 85 && (
            <Text style={styles.insightText}>
              • Data quality improvement is below optimal
            </Text>
          )}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        {metrics.pending_resolution > 0 && (
          <TouchableOpacity
            style={[styles.actionButton, loading && styles.actionButtonDisabled]}
            onPress={onResolveConflicts}
            disabled={loading}
          >
            <Ionicons 
              name={loading ? 'hourglass' : 'construct'} 
              size={16} 
              color={loading ? '#9CA3AF' : '#3B82F6'} 
            />
            <Text style={[styles.actionButtonText, loading && styles.actionButtonTextDisabled]}>
              {loading ? 'Resolving...' : `Resolve ${metrics.pending_resolution}`}
            </Text>
          </TouchableOpacity>
        )}

        {onViewDetails && (
          <TouchableOpacity 
            style={[styles.detailsButton, metrics.pending_resolution === 0 && { flex: 1 }]} 
            onPress={onViewDetails}
          >
            <Text style={styles.detailsButtonText}>Details</Text>
            <Ionicons name="chevron-forward" size={16} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

DataQualityCard.displayName = 'DataQualityCard';

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
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginLeft: 8,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  improvementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  improvementLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  improvementValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  resolutionBreakdown: {
    marginBottom: 16,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 8,
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  insightSection: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
    marginLeft: 6,
  },
  insightText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
    marginBottom: 4,
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