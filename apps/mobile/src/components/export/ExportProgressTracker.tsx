/**
 * Export Progress Tracker
 * Component for displaying real-time export progress
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator
} from 'react-native';
import { ExportProgress } from '../../types/export';

interface ExportProgressTrackerProps {
  progress: ExportProgress;
}

export function ExportProgressTracker({ progress }: ExportProgressTrackerProps) {
  const getStatusColor = () => {
    switch (progress.status) {
      case 'preparing':
        return '#F59E0B';
      case 'processing':
        return '#3B82F6';
      case 'uploading':
        return '#8B5CF6';
      case 'complete':
        return '#10B981';
      case 'error':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'preparing':
        return '⚡';
      case 'processing':
        return '⚙️';
      case 'uploading':
        return '☁️';
      case 'complete':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📄';
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'preparing':
        return 'Preparing export...';
      case 'processing':
        return 'Processing data...';
      case 'uploading':
        return 'Uploading to cloud...';
      case 'complete':
        return 'Export complete!';
      case 'error':
        return 'Export failed';
      default:
        return 'Exporting...';
    }
  };

  const statusColor = getStatusColor();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
        <Text style={[styles.statusText, { color: statusColor }]}>
          {getStatusText()}
        </Text>
        {progress.status !== 'complete' && progress.status !== 'error' && (
          <ActivityIndicator size="small" color={statusColor} />
        )}
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.max(0, Math.min(100, progress.percentage))}%`,
                backgroundColor: statusColor
              }
            ]}
          />
        </View>
        <Text style={[styles.progressPercentage, { color: statusColor }]}>
          {Math.round(progress.percentage)}%
        </Text>
      </View>

      {/* Progress Details */}
      <View style={styles.details}>
        {progress.stage && (
          <Text style={styles.stageText}>{progress.stage}</Text>
        )}
        
        {progress.processed !== undefined && progress.total !== undefined && (
          <Text style={styles.countersText}>
            Processed: {progress.processed.toLocaleString()} / {progress.total.toLocaleString()}
          </Text>
        )}

        {progress.error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{progress.error}</Text>
          </View>
        )}
      </View>

      {/* Estimated Time */}
      {progress.status === 'processing' && progress.percentage > 0 && progress.percentage < 100 && (
        <View style={styles.estimateContainer}>
          <Text style={styles.estimateText}>
            {getTimeEstimate(progress)}
          </Text>
        </View>
      )}
    </View>
  );
}

function getTimeEstimate(progress: ExportProgress): string {
  if (progress.percentage <= 0) return '';
  
  // Simple estimation based on progress rate
  const remainingPercentage = 100 - progress.percentage;
  const estimatedSeconds = Math.round((remainingPercentage / progress.percentage) * 10); // rough estimate
  
  if (estimatedSeconds < 60) {
    return `About ${estimatedSeconds} seconds remaining`;
  } else {
    const minutes = Math.round(estimatedSeconds / 60);
    return `About ${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  statusIcon: {
    fontSize: 16,
  },
  statusText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  progressBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 2,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  details: {
    gap: 4,
  },
  stageText: {
    fontSize: 14,
    color: '#374151',
    fontStyle: 'italic',
  },
  countersText: {
    fontSize: 12,
    color: '#6B7280',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  estimateContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  estimateText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default ExportProgressTracker;