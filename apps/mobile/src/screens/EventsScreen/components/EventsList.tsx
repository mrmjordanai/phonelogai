import * as React from 'react';
import { useCallback, useMemo, useRef } from 'react';
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ViewStyle,
  ListRenderItem,
  ActivityIndicator,
} from 'react-native';
import EventListItem from './EventListItem';
import { EmptyState, LoadingEmptyState, FilterSummary } from './EmptyState';
import { UIEvent, EventGroup, EventAction, EmptyStateType } from '../types';
import { useScrollToTop } from '../hooks';

interface EventsListProps {
  events: UIEvent[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  groupByDate?: boolean;
  compactMode?: boolean;
  searchQuery?: string;
  activeFilters?: string[];
  
  // Callbacks
  onRefresh: () => void;
  onLoadMore: () => void;
  onEventPress: (event: UIEvent) => void;
  onEventLongPress: (event: UIEvent, action: EventAction) => void;
  onRetry?: () => void;
  onClearFilters?: () => void;
  
  // Style
  style?: ViewStyle;
}

interface DateSectionHeaderProps {
  date: string;
  eventCount: number;
  callCount: number;
  smsCount: number;
}

interface LoadingFooterProps {
  loading: boolean;
  hasMore: boolean;
  error?: string | null;
  onRetry?: () => void;
  eventCount: number;
}

// Date section header component
function DateSectionHeader({ date, eventCount, callCount, smsCount }: DateSectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderContent}>
        <Text style={styles.sectionHeaderDate}>{date}</Text>
        <View style={styles.sectionHeaderStats}>
          <Text style={styles.sectionHeaderCount}>
            {eventCount} event{eventCount !== 1 ? 's' : ''}
          </Text>
          {callCount > 0 && (
            <Text style={styles.sectionHeaderStat}>
              📞 {callCount}
            </Text>
          )}
          {smsCount > 0 && (
            <Text style={styles.sectionHeaderStat}>
              💬 {smsCount}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// Loading footer component
function LoadingFooter({ loading, hasMore, error, onRetry, eventCount }: LoadingFooterProps) {
  if (error) {
    return (
      <View style={styles.loadingFooter}>
        <Text style={styles.errorText}>Failed to load more events</Text>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (loading && hasMore) {
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading more events...</Text>
      </View>
    );
  }

  if (!hasMore && eventCount > 0) {
    return (
      <View style={styles.loadingFooter}>
        <Text style={styles.endText}>No more events to load</Text>
      </View>
    );
  }

  return null;
}

// Group events by date
function groupEventsByDate(events: UIEvent[]): EventGroup[] {
  const groups = new Map<string, UIEvent[]>();
  
  events.forEach(event => {
    const date = new Date(event.ts);
    const dateKey = date.toDateString();
    
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(event);
  });

  return Array.from(groups.entries()).map(([dateKey, groupEvents]) => {
    const date = new Date(dateKey);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    let displayDate: string;
    if (diffDays === 0) displayDate = 'Today';
    else if (diffDays === 1) displayDate = 'Yesterday';
    else if (diffDays < 7) displayDate = date.toLocaleDateString([], { weekday: 'long' });
    else displayDate = date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });

    const callCount = groupEvents.filter(e => e.type === 'call').length;
    const smsCount = groupEvents.filter(e => e.type === 'sms').length;

    return {
      date: dateKey,
      displayDate,
      events: groupEvents,
      totalEvents: groupEvents.length,
      callCount,
      smsCount
    };
  });
}

// Flatten grouped events for FlatList
function flattenGroupedEvents(groups: EventGroup[]): (UIEvent | EventGroup)[] {
  const flattened: (UIEvent | EventGroup)[] = [];
  
  groups.forEach(group => {
    flattened.push(group); // Add group header
    flattened.push(...group.events); // Add group events
  });
  
  return flattened;
}

export function EventsList({
  events,
  loading,
  refreshing,
  error,
  hasMore,
  groupByDate = true,
  compactMode = false,
  searchQuery,
  activeFilters = [],
  onRefresh,
  onLoadMore,
  onEventPress,
  onEventLongPress,
  onRetry,
  onClearFilters,
  style
}: EventsListProps) {
  const flatListRef = useRef<FlatList>(null);
  const { scrollRef, scrollToTop } = useScrollToTop();

  // Memoized data processing
  const listData = useMemo(() => {
    if (!groupByDate) return events;
    
    const groups = groupEventsByDate(events);
    return flattenGroupedEvents(groups);
  }, [events, groupByDate]);

  // Get item layout for performance optimization
  const getItemLayout = useCallback((data: any, index: number) => {
    const isHeader = data && data[index] && 'totalEvents' in data[index];
    const itemHeight = isHeader ? 44 : (compactMode ? 56 : 72);
    
    return {
      length: itemHeight,
      offset: itemHeight * index,
      index
    };
  }, [compactMode]);

  // Key extractor
  const keyExtractor = useCallback((item: UIEvent | EventGroup, index: number) => {
    if ('totalEvents' in item) {
      return `header_${item.date}`;
    }
    return `event_${item.id}`;
  }, []);

  // Render item
  const renderItem: ListRenderItem<UIEvent | EventGroup> = useCallback(({ item }) => {
    if ('totalEvents' in item) {
      // Render date section header
      return (
        <DateSectionHeader
          date={item.displayDate}
          eventCount={item.totalEvents}
          callCount={item.callCount}
          smsCount={item.smsCount}
        />
      );
    }

    // Render event item
    return (
      <EventListItem
        event={item}
        onPress={onEventPress}
        onLongPress={onEventLongPress}
        showDate={!groupByDate}
        compact={compactMode}
      />
    );
  }, [groupByDate, compactMode, onEventPress, onEventLongPress]);

  // Handle end reached (infinite scroll)
  const handleEndReached = useCallback(() => {
    if (!loading && hasMore && events.length > 0) {
      onLoadMore();
    }
  }, [loading, hasMore, events.length, onLoadMore]);

  // Render empty state
  const renderEmptyState = () => {
    if (loading && events.length === 0) {
      return <LoadingEmptyState message="Loading events..." />;
    }

    if (error) {
      return (
        <EmptyState
          type="loading_error"
          onRetry={onRetry}
        />
      );
    }

    if (searchQuery && events.length === 0) {
      return (
        <EmptyState
          type="no_search_results"
          searchQuery={searchQuery}
        />
      );
    }

    if (activeFilters.length > 0 && events.length === 0) {
      return (
        <>
          <EmptyState
            type="no_filter_results"
            onClearFilters={onClearFilters}
          />
          <FilterSummary
            activeFilters={activeFilters}
            onClearFilters={onClearFilters || (() => {})}
          />
        </>
      );
    }

    if (events.length === 0) {
      return (
        <EmptyState
          type="no_events"
          onRetry={onRetry}
        />
      );
    }

    return null;
  };

  // Render footer
  const renderFooter = () => (
    <LoadingFooter
      loading={loading}
      hasMore={hasMore}
      error={error}
      onRetry={onRetry}
      eventCount={events.length}
    />
  );

  const containerStyle = [styles.container, style];

  // Assign ref for scroll to top functionality
  React.useImperativeHandle(scrollRef, () => ({
    scrollToOffset: flatListRef.current?.scrollToOffset,
    scrollToIndex: flatListRef.current?.scrollToIndex,
  }));

  return (
    <View style={containerStyle}>
      <FlatList
        ref={flatListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={groupByDate ? undefined : getItemLayout}
        
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={20}
        updateCellsBatchingPeriod={100}
        initialNumToRender={15}
        windowSize={10}
        
        // Infinite scroll
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.1}
        
        // Pull to refresh
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
            title="Pull to refresh"
            titleColor="#6B7280"
          />
        }
        
        // Empty state
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        
        // Styling
        contentContainerStyle={events.length === 0 ? styles.emptyContainer : styles.contentContainer}
        showsVerticalScrollIndicator={false}
        
        // Accessibility
        accessibilityLabel="Events list"
        accessibilityRole="list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    paddingBottom: 20,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  
  // Section Header
  sectionHeader: {
    backgroundColor: '#F3F4F6',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionHeaderDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  sectionHeaderStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeaderCount: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 12,
  },
  sectionHeaderStat: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
  },
  
  // Loading Footer
  loadingFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginRight: 12,
  },
  retryButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  endText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});

export default EventsList;