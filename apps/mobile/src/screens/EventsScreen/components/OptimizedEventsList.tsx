/**
 * OptimizedEventsList - High-performance events list component
 * 
 * Optimized for handling large datasets (100k+ events) with advanced
 * virtualization, memoization, and performance monitoring.
 */

import React, { memo, useCallback, useMemo, useState, useEffect } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ViewabilityConfig,
  ViewToken,
  ListRenderItemInfo,
} from 'react-native';
import { UIEvent, EventAction } from '../types';
import EventListItem from './EventListItem';
import PerformanceMonitor from '../../../services/PerformanceMonitor';

// Removed unused _screenHeight variable

interface OptimizedEventsListProps {
  events: UIEvent[];
  loading: boolean;
  hasMore: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onEventPress: (_event: UIEvent) => void;
  onEventAction: (_event: UIEvent, _action: EventAction) => void;
  searchQuery?: string;
  filterCount?: number;
  enablePerformanceMonitoring?: boolean;
  testID?: string;
}

// Performance configuration
const PERFORMANCE_CONFIG = {
  // FlatList optimization
  ITEM_HEIGHT: 80, // Estimated item height for better performance
  WINDOW_SIZE: 10, // Number of items to render outside visible area
  MAX_TO_RENDER_PER_BATCH: 20, // Batch size for rendering
  UPDATE_CELLS_BATCH_PERIOD: 50, // Rendering batch period
  INITIAL_NUM_TO_RENDER: 15, // Initial items to render
  
  // Virtualization
  REMOVE_CLIPPED_SUBVIEWS: true,
  
  // Scrolling
  SCROLL_EVENT_THROTTLE: 16, // 60fps
  
  // Performance monitoring
  RENDER_TIME_THRESHOLD: 500, // Log if render takes longer than 500ms
  SCROLL_PERFORMANCE_SAMPLE_RATE: 0.1, // Monitor 10% of scroll events
};

// Memoized event item component
const MemoizedEventItem = memo<{
  item: UIEvent;
  index: number;
  onEventPress: (_event: UIEvent) => void;
  onEventAction: (_event: UIEvent, _action: EventAction) => void;
  searchQuery?: string;
}>(({ item, index: _index, onEventPress, onEventAction, searchQuery: _searchQuery }) => {
  return (
    <EventListItem
      event={item}
      onPress={() => onEventPress(item)}
      onLongPress={(event, action) => onEventAction(event, action)}
      compact={true}
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal re-rendering
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.status === nextProps.item.status &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.index === nextProps.index
  );
});

MemoizedEventItem.displayName = 'MemoizedEventItem';

const OptimizedEventsList: React.FC<OptimizedEventsListProps> = ({
  events,
  loading,
  hasMore,
  onRefresh,
  onLoadMore,
  onEventPress,
  onEventAction,
  searchQuery,
  filterCount,
  enablePerformanceMonitoring = true,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [renderStartTime, setRenderStartTime] = useState<number>(0);
  const [visibleItems, setVisibleItems] = useState<ViewToken[]>([]);
  
  const performanceMonitor = PerformanceMonitor.getInstance();

  /**
   * Performance monitoring effect
   */
  useEffect(() => {
    if (enablePerformanceMonitoring && renderStartTime > 0) {
      const renderTime = Date.now() - renderStartTime;
      
      performanceMonitor.recordScreenRender('EventsList', renderTime);
      
      if (renderTime > PERFORMANCE_CONFIG.RENDER_TIME_THRESHOLD) {
        console.warn(`[OptimizedEventsList] Slow render detected: ${renderTime}ms for ${events.length} items`);
      }
    }
  }, [events.length, renderStartTime, enablePerformanceMonitoring]);

  /**
   * Track render start time
   */
  useEffect(() => {
    setRenderStartTime(Date.now());
  }, [events, searchQuery, filterCount]);

  /**
   * Optimized key extractor
   */
  const keyExtractor = useCallback((item: UIEvent, index: number) => {
    return `${item.id}-${index}`;
  }, []);

  /**
   * Optimized item size calculator
   */
  const getItemLayout = useCallback((data: ArrayLike<UIEvent> | null | undefined, index: number) => ({
    length: PERFORMANCE_CONFIG.ITEM_HEIGHT,
    offset: PERFORMANCE_CONFIG.ITEM_HEIGHT * index,
    index,
  }), []);

  /**
   * Render item with performance monitoring
   */
  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<UIEvent>) => {
    return (
      <MemoizedEventItem
        item={item}
        index={index}
        onEventPress={onEventPress}
        onEventAction={onEventAction}
        searchQuery={searchQuery}
      />
    );
  }, [onEventPress, onEventAction, searchQuery]);

  /**
   * Handle refresh with performance tracking
   */
  const handleRefresh = useCallback(async () => {
    if (enablePerformanceMonitoring) {
      performanceMonitor.startNavigationTracking('EventsRefresh');
    }
    
    setRefreshing(true);
    
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      
      if (enablePerformanceMonitoring) {
        performanceMonitor.completeNavigationTracking('EventsRefresh');
      }
    }
  }, [onRefresh, enablePerformanceMonitoring]);

  /**
   * Handle scroll end for load more
   */
  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      onLoadMore();
    }
  }, [loading, hasMore, onLoadMore]);

  /**
   * Handle viewability changes for performance monitoring
   */
  const handleViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setVisibleItems(viewableItems);
    
    // Sample performance monitoring to avoid overhead
    if (enablePerformanceMonitoring && Math.random() < PERFORMANCE_CONFIG.SCROLL_PERFORMANCE_SAMPLE_RATE) {
      const visibleCount = viewableItems.length;
      const firstIndex = viewableItems[0]?.index || 0;
      const lastIndex = viewableItems[viewableItems.length - 1]?.index || 0;
      
      console.log(`[OptimizedEventsList] Visible items: ${visibleCount}, range: ${firstIndex}-${lastIndex}`);
    }
  }, [enablePerformanceMonitoring]);

  /**
   * Viewability config for performance optimization
   */
  const viewabilityConfig = useMemo<ViewabilityConfig>(() => ({
    waitForInteraction: true,
    viewAreaCoveragePercentThreshold: 50,
    minimumViewTime: 100,
  }), []);

  /**
   * Render empty state
   */
  const renderEmptyState = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      );
    }

    const hasFilters = searchQuery || (filterCount && filterCount > 0);
    
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>
          {hasFilters ? 'No matching events' : 'No events found'}
        </Text>
        <Text style={styles.emptyDescription}>
          {hasFilters 
            ? 'Try adjusting your search or filters'
            : 'Events will appear here once data is synced'
          }
        </Text>
      </View>
    );
  }, [loading, searchQuery, filterCount]);

  /**
   * Render footer with load more indicator
   */
  const renderFooter = useCallback(() => {
    if (!hasMore || events.length === 0) return null;
    
    return (
      <View style={styles.footerContainer}>
        {loading ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <Text style={styles.footerText}>Pull up to load more</Text>
        )}
      </View>
    );
  }, [hasMore, loading, events.length]);

  /**
   * Render performance stats (debug mode)
   */
  const renderPerformanceStats = useCallback(() => {
    if (!enablePerformanceMonitoring || !__DEV__) return null;
    
    const visibleCount = visibleItems.length;
    const totalCount = events.length;
    
    return (
      <View style={styles.performanceStats}>
        <Text style={styles.performanceStatsText}>
          📊 {totalCount} total, {visibleCount} visible
        </Text>
      </View>
    );
  }, [enablePerformanceMonitoring, visibleItems.length, events.length]);

  return (
    <View style={styles.container}>
      {renderPerformanceStats()}
      
      <FlatList
        data={events}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        
        // Performance optimizations
        removeClippedSubviews={PERFORMANCE_CONFIG.REMOVE_CLIPPED_SUBVIEWS}
        maxToRenderPerBatch={PERFORMANCE_CONFIG.MAX_TO_RENDER_PER_BATCH}
        updateCellsBatchingPeriod={PERFORMANCE_CONFIG.UPDATE_CELLS_BATCH_PERIOD}
        initialNumToRender={PERFORMANCE_CONFIG.INITIAL_NUM_TO_RENDER}
        windowSize={PERFORMANCE_CONFIG.WINDOW_SIZE}
        scrollEventThrottle={PERFORMANCE_CONFIG.SCROLL_EVENT_THROTTLE}
        
        // Interaction optimizations
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        
        // Pull to refresh
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#007AFF"
            title="Pull to refresh"
          />
        }
        
        // Load more
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        
        // Empty state
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        
        // Performance monitoring
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        
        // Accessibility
        accessible={true}
        accessibilityLabel={`Events list with ${events.length} items`}
        accessibilityHint="Swipe up and down to browse events"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6c757d',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 20,
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6c757d',
  },
  performanceStats: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 1000,
  },
  performanceStatsText: {
    fontSize: 10,
    color: '#fff',
    fontFamily: 'monospace',
  },
});

export default OptimizedEventsList;