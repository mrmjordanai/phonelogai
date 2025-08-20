import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
  AppState,
  AppStateStatus,
  TouchableOpacity,
} from 'react-native';
import {
  EventsList,
  EventFilters,
  EventDetailModal,
  SearchBar,
  ExportModal,
} from './components';
import { 
  useEvents, 
  useEventFilters, 
  usePerformanceMonitoring,
  useErrorHandling,
  useAccessibility
} from './hooks';
import { UIEvent, EventAction, SearchSuggestion } from './types';

interface EnhancedEventsScreenProps {
  // Navigation props would come from React Navigation
}

export function EnhancedEventsScreen(_props: EnhancedEventsScreenProps) {
  // State
  const [selectedEvent, setSelectedEvent] = useState<UIEvent | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>('active');

  // Performance monitoring
  const {
    startRenderTiming,
    endRenderTiming,
    recordFrameTime,
    getWarnings,
    isPerformanceGood,
  } = usePerformanceMonitoring({
    enabled: true,
    sampleRate: 0.2, // Monitor 20% of renders
    logInterval: 15000, // Log every 15 seconds
  });

  // Error handling
  const {
    latestError,
    isRetrying,
    addError,
    clearErrors,
    retryOperation,
    handleAsyncOperation,
    getUserFriendlyMessage,
    hasErrors,
    hasRetryableErrors,
  } = useErrorHandling({
    maxRetries: 3,
    retryDelay: 1000,
    onError: (error) => {
      // Could integrate with crash reporting here
      if (__DEV__) {
        console.error('EventsScreen Error:', error);
      }
    },
  });

  // Accessibility
  const {
    announce,
    announceEventLoaded,
    announceEventSelected,
    announceFilterChange,
    announceSearchResults,
    announceLoadingState,
    announceErrorState,
  } = useAccessibility({
    announceChanges: true,
  });

  // Core hooks with error handling wrapper
  const {
    filters,
    isFiltersActive,
    searchSuggestions,
    quickFilters,
    updateFilters,
    updateSearch,
    clearFilters,
    applyQuickFilter,
    addToSearchHistory,
  } = useEventFilters({
    persistFilters: true,
    debounceMs: 300,
  });

  const {
    events,
    loading,
    error,
    refreshing,
    pagination,
    loadMore,
    refresh,
    refetch,
  } = useEvents({
    pageSize: 50,
    cacheEnabled: true,
  });

  // App state management
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      setAppState(nextAppState);
      
      // Refresh data when app becomes active after being backgrounded
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        handleAsyncOperation(async () => {
          await refresh();
        }, { context: 'app_resume' });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => subscription?.remove();
  }, [appState, refresh, handleAsyncOperation]);

  // Performance monitoring
  useEffect(() => {
    startRenderTiming();
    
    return () => {
      endRenderTiming();
    };
  });

  // Error handling for events loading
  useEffect(() => {
    if (error) {
      addError(error, { context: 'events_loading' });
      announceErrorState(getUserFriendlyMessage(error), true);
    }
  }, [error, addError, announceErrorState, getUserFriendlyMessage]);

  // Announce loading state changes
  useEffect(() => {
    announceLoadingState(loading, error || undefined);
  }, [loading, error, announceLoadingState]);

  // Announce when events are loaded
  useEffect(() => {
    if (!loading && !error && events.length >= 0) {
      announceEventLoaded(events, false);
    }
  }, [events, loading, error, announceEventLoaded]);

  // Computed values
  const activeFilterSummary = React.useMemo(() => {
    const summary: string[] = [];
    
    if (filters.type !== 'all') {
      summary.push(filters.type === 'call' ? 'Calls' : 'SMS');
    }
    
    if (filters.direction !== 'all') {
      summary.push(filters.direction === 'inbound' ? 'Incoming' : 'Outgoing');
    }
    
    if (filters.status && filters.status !== 'all') {
      summary.push(`${filters.status.charAt(0).toUpperCase()}${filters.status.slice(1)}`);
    }
    
    if (filters.dateRange.start || filters.dateRange.end) {
      summary.push('Date Range');
    }
    
    if (filters.durationRange) {
      summary.push('Duration');
    }
    
    return summary;
  }, [filters]);

  // Event handlers with performance monitoring and error handling
  const handleEventPress = useCallback((event: UIEvent) => {
    recordFrameTime();
    announceEventSelected(event);
    setSelectedEvent(event);
    setShowDetailModal(true);
  }, [recordFrameTime, announceEventSelected]);

  const handleEventLongPress = useCallback(async (event: UIEvent, action: EventAction) => {
    recordFrameTime();
    setSelectedEvent(event);
    
    const result = await handleAsyncOperation(async () => {
      switch (action) {
        case 'add_contact':
          Alert.alert('Add Contact', `Add ${event.display_number} to contacts?`);
          break;
        case 'edit_contact':
          Alert.alert('Edit Contact', 'Navigate to edit contact screen');
          break;
        default:
          setShowDetailModal(true);
          break;
      }
    }, { context: 'event_long_press', eventId: event.id, action });

    if (result === null && latestError) {
      Alert.alert('Error', getUserFriendlyMessage(latestError));
    }
  }, [recordFrameTime, handleAsyncOperation, latestError, getUserFriendlyMessage]);

  const handleEventAction = useCallback(async (action: EventAction, event: UIEvent) => {
    const result = await handleAsyncOperation(async () => {
      switch (action) {
        case 'call_back':
          // Handled by EventDetailModal
          break;
        case 'send_sms':
          // Handled by EventDetailModal
          break;
        case 'add_contact':
          Alert.alert('Add Contact', `Navigate to add contact screen for ${event.display_number}`);
          break;
        case 'edit_contact':
          Alert.alert('Edit Contact', 'Navigate to edit contact screen');
          break;
        case 'block_contact':
          Alert.alert('Block Contact', `Block ${event.display_name || event.display_number}?`);
          break;
        case 'share':
          // Handled by EventDetailModal
          break;
        case 'delete':
          await handleDeleteEvent(event);
          break;
      }
    }, { context: 'event_action', eventId: event.id, action });

    if (result === null && latestError) {
      Alert.alert('Error', getUserFriendlyMessage(latestError));
    }
  }, [handleAsyncOperation, latestError, getUserFriendlyMessage]);

  const handleDeleteEvent = useCallback(async (event: UIEvent) => {
    return new Promise<void>((resolve, reject) => {
      Alert.alert(
        'Delete Event',
        'Are you sure you want to delete this event? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => reject(new Error('Cancelled')) },
          { 
            text: 'Delete', 
            style: 'destructive',
            onPress: async () => {
              try {
                // TODO: Implement event deletion via EventService
                console.log('Delete event:', event.id);
                
                // Refresh events after deletion
                await refetch();
                setShowDetailModal(false);
                
                announce('Event deleted successfully', 'medium');
                Alert.alert('Success', 'Event deleted successfully');
                resolve();
              } catch (error) {
                addError(error, { context: 'delete_event', eventId: event.id });
                reject(error);
              }
            }
          }
        ]
      );
    });
  }, [refetch, announce, addError]);

  const handleSearchSubmit = useCallback(async (searchText: string) => {
    const result = await handleAsyncOperation(async () => {
      updateSearch(searchText);
      await addToSearchHistory(searchText);
      setShowSearch(false);
      
      // Announce search results after a brief delay to let the UI update
      setTimeout(() => {
        announceSearchResults(searchText, events.length);
      }, 500);
    }, { context: 'search_submit', query: searchText });

    if (result === null && latestError) {
      announceErrorState(getUserFriendlyMessage(latestError), false);
    }
  }, [updateSearch, addToSearchHistory, handleAsyncOperation, announceSearchResults, events.length, latestError, getUserFriendlyMessage, announceErrorState]);

  const handleSuggestionSelect = useCallback(async (suggestion: SearchSuggestion) => {
    await handleAsyncOperation(async () => {
      updateSearch(suggestion.value);
      await addToSearchHistory(suggestion.value);
      setShowSearch(false);
    }, { context: 'suggestion_select', suggestion: suggestion.value });
  }, [updateSearch, addToSearchHistory, handleAsyncOperation]);

  const handleRetry = useCallback(async () => {
    if (hasRetryableErrors) {
      clearErrors();
    }
    
    await retryOperation({
      operation: async () => {
        await refetch();
      },
      context: { action: 'manual_retry' },
      maxRetries: 1,
    });
  }, [hasRetryableErrors, clearErrors, retryOperation, refetch]);

  const handleClearAllFilters = useCallback(() => {
    clearFilters();
    announceFilterChange('all', 'filters', false);
  }, [clearFilters, announceFilterChange]);

  const handleExportPress = useCallback(() => {
    if (events.length === 0) {
      Alert.alert('No Events', 'There are no events to export. Try adjusting your filters or loading more data.');
      announce('No events available for export', 'high');
      return;
    }
    setShowExportModal(true);
    announce(`Export dialog opened for ${events.length} events`, 'medium');
  }, [events.length, announce]);

  const handleRefresh = useCallback(async () => {
    recordFrameTime();
    
    await retryOperation({
      operation: async () => {
        await refresh();
        announceEventLoaded(events, true);
      },
      context: { action: 'pull_to_refresh' },
    });
  }, [recordFrameTime, retryOperation, refresh, announceEventLoaded, events]);

  const handleLoadMore = useCallback(async () => {
    recordFrameTime();
    
    await retryOperation({
      operation: async () => {
        await loadMore();
      },
      context: { action: 'load_more' },
    });
  }, [recordFrameTime, retryOperation, loadMore]);

  // Handle search focus/blur
  const handleSearchFocus = useCallback(() => {
    setShowSearch(true);
    announce('Search focused. Start typing to search events.', 'low');
  }, [announce]);

  const handleSearchBlur = useCallback(() => {
    setTimeout(() => setShowSearch(false), 150);
  }, []);

  // Performance warnings
  useEffect(() => {
    const warnings = getWarnings();
    if (warnings.length > 0) {
      console.warn('EventsScreen Performance Warnings:', warnings);
    }
  }, [getWarnings]);

  // Status bar configuration
  const statusBarStyle = Platform.OS === 'ios' ? 'dark-content' : 'light-content';
  const statusBarBackgroundColor = Platform.OS === 'android' ? '#FFFFFF' : undefined;

  return (
    <SafeAreaView 
      style={styles.container}
      accessibilityLabel="Events Screen"
    >
      <StatusBar 
        barStyle={statusBarStyle}
        backgroundColor={statusBarBackgroundColor}
        translucent={false}
      />
      
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBarWrapper}>
          <SearchBar
            value={filters.search}
            onChangeText={updateSearch}
            onSubmit={handleSearchSubmit}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            suggestions={searchSuggestions}
            onSuggestionSelect={handleSuggestionSelect}
            showSuggestions={showSearch}
            placeholder="Search events..."
            autoFocus={false}
          />
          <TouchableOpacity
            style={styles.exportButton}
            onPress={handleExportPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Export ${events.length} events`}
            accessibilityHint="Opens export options for CSV and JSON formats"
          >
            <Text style={styles.exportButtonText}>📤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <EventFilters
        filters={filters}
        quickFilters={quickFilters}
        onFiltersChange={updateFilters}
        onQuickFilterPress={applyQuickFilter}
        onClearAll={handleClearAllFilters}
      />

      {/* Events List */}
      <View 
        style={styles.listContainer}
        accessibilityLabel={`Events list. ${events.length} events loaded.`}
      >
        <EventsList
          events={events}
          loading={loading || isRetrying}
          refreshing={refreshing}
          error={error || (hasErrors ? getUserFriendlyMessage(latestError!) : null)}
          hasMore={pagination.hasMore}
          groupByDate={true}
          compactMode={false}
          searchQuery={filters.search}
          activeFilters={activeFilterSummary}
          onRefresh={handleRefresh}
          onLoadMore={handleLoadMore}
          onEventPress={handleEventPress}
          onEventLongPress={handleEventLongPress}
          onRetry={handleRetry}
          onClearFilters={isFiltersActive ? handleClearAllFilters : undefined}
        />
      </View>

      {/* Event Detail Modal */}
      <EventDetailModal
        visible={showDetailModal}
        event={selectedEvent}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedEvent(null);
          announce('Event details closed', 'low');
        }}
        onAction={handleEventAction}
      />

      {/* Export Modal */}
      <ExportModal
        visible={showExportModal}
        events={events}
        onClose={() => {
          setShowExportModal(false);
          announce('Export dialog closed', 'low');
        }}
      />

      {/* Performance Debug Info (Development only) */}
      {__DEV__ && !isPerformanceGood && (
        <View style={styles.debugContainer}>
          {getWarnings().map((warning, index) => (
            <Text key={index} style={styles.debugText}>
              ⚠️ {warning}
            </Text>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    zIndex: 1000,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportButton: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  exportButtonText: {
    fontSize: 16,
  },
  listContainer: {
    flex: 1,
  },
  debugContainer: {
    position: 'absolute',
    top: 100,
    right: 10,
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 4,
    maxWidth: 200,
  },
  debugText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default EnhancedEventsScreen;