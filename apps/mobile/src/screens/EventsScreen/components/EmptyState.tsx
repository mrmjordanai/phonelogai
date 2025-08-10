import * as React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';

export type EmptyStateType = 
  | 'no_events'
  | 'no_search_results'
  | 'no_filter_results'
  | 'loading_error'
  | 'network_error'
  | 'permission_required';

interface EmptyStateProps {
  type: EmptyStateType;
  searchQuery?: string;
  onRetry?: () => void;
  onClearFilters?: () => void;
  onRequestPermissions?: () => void;
  style?: ViewStyle;
}

interface EmptyStateConfig {
  icon: string;
  title: string;
  description: string;
  actionText?: string;
  actionHandler?: keyof Pick<EmptyStateProps, 'onRetry' | 'onClearFilters' | 'onRequestPermissions'>;
}

const EMPTY_STATE_CONFIGS: Record<EmptyStateType, EmptyStateConfig> = {
  no_events: {
    icon: '📱',
    title: 'No Events Yet',
    description: 'Your call and SMS history will appear here once data is collected. This might take a few minutes after initial setup.',
    actionText: 'Refresh',
    actionHandler: 'onRetry'
  },
  no_search_results: {
    icon: '🔍',
    title: 'No Results Found',
    description: 'No events match your search. Try a different search term or check your spelling.',
  },
  no_filter_results: {
    icon: '📋',
    title: 'No Matching Events',
    description: 'No events match your current filters. Try adjusting your filter criteria or clearing all filters.',
    actionText: 'Clear Filters',
    actionHandler: 'onClearFilters'
  },
  loading_error: {
    icon: '⚠️',
    title: 'Failed to Load',
    description: 'Something went wrong while loading your events. Please try again.',
    actionText: 'Retry',
    actionHandler: 'onRetry'
  },
  network_error: {
    icon: '📶',
    title: 'No Internet Connection',
    description: 'Check your internet connection and try again. Some cached events may still be available.',
    actionText: 'Retry',
    actionHandler: 'onRetry'
  },
  permission_required: {
    icon: '🔐',
    title: 'Permissions Required',
    description: 'This app needs permission to access your call and SMS history to display events.',
    actionText: 'Grant Permissions',
    actionHandler: 'onRequestPermissions'
  }
};

export function EmptyState({
  type,
  searchQuery,
  onRetry,
  onClearFilters,
  onRequestPermissions,
  style
}: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIGS[type];
  
  const getActionHandler = () => {
    switch (config.actionHandler) {
      case 'onRetry': return onRetry;
      case 'onClearFilters': return onClearFilters;
      case 'onRequestPermissions': return onRequestPermissions;
      default: return undefined;
    }
  };

  const actionHandler = getActionHandler();
  const showAction = config.actionText && actionHandler;

  // Customize description for search results
  const description = type === 'no_search_results' && searchQuery
    ? `No events match "${searchQuery}". Try a different search term or check your spelling.`
    : config.description;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.content}>
        <Text style={styles.icon}>{config.icon}</Text>
        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.description}>{description}</Text>
        
        {showAction && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={actionHandler}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={config.actionText}
          >
            <Text style={styles.actionText}>{config.actionText}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Helper component for loading state with empty results
interface LoadingEmptyStateProps {
  message?: string;
}

export function LoadingEmptyState({ message = 'Loading events...' }: LoadingEmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.loadingIcon}>⏳</Text>
        <Text style={styles.title}>Loading</Text>
        <Text style={styles.description}>{message}</Text>
      </View>
    </View>
  );
}

// Helper component for filter summary when no results
interface FilterSummaryProps {
  activeFilters: string[];
  onClearFilters: () => void;
}

export function FilterSummary({ activeFilters, onClearFilters }: FilterSummaryProps) {
  if (activeFilters.length === 0) return null;

  return (
    <View style={styles.filterSummary}>
      <Text style={styles.filterSummaryTitle}>Active Filters:</Text>
      <View style={styles.filterTags}>
        {activeFilters.map((filter, index) => (
          <View key={index} style={styles.filterTag}>
            <Text style={styles.filterTagText}>{filter}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        style={styles.clearFiltersButton}
        onPress={onClearFilters}
        accessibilityRole="button"
        accessibilityLabel="Clear all filters"
      >
        <Text style={styles.clearFiltersText}>Clear All</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
    backgroundColor: '#F9FAFB',
  },
  content: {
    alignItems: 'center',
    maxWidth: 280,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  loadingIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  filterSummary: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  filterTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  filterTagText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '500',
  },
  clearFiltersButton: {
    alignSelf: 'flex-start',
  },
  clearFiltersText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '600',
  },
});

export default EmptyState;