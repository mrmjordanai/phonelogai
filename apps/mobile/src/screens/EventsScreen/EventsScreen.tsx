import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
  TouchableOpacity,
  Text,
} from 'react-native';
import {
  EventsList,
  EventFilters,
  EventDetailModal,
  SearchBar,
  ExportModal,
} from './components';
import { useEvents, useEventFilters } from './hooks';
import { UIEvent, EventAction, SearchSuggestion } from './types';

interface EventsScreenProps {
  // Navigation props would come from React Navigation
}

export function EventsScreen(_props: EventsScreenProps) {
  // State
  const [selectedEvent, setSelectedEvent] = useState<UIEvent | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Hooks
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

  // Event handlers
  const handleEventPress = useCallback((event: UIEvent) => {
    setSelectedEvent(event);
    setShowDetailModal(true);
  }, []);

  const handleEventLongPress = useCallback((event: UIEvent, action: EventAction) => {
    setSelectedEvent(event);
    
    switch (action) {
      case 'add_contact':
        // TODO: Navigate to add contact screen
        Alert.alert('Add Contact', `Add ${event.display_number} to contacts?`);
        break;
      case 'edit_contact':
        // TODO: Navigate to edit contact screen
        Alert.alert('Edit Contact', 'Navigate to edit contact screen');
        break;
      default:
        setShowDetailModal(true);
        break;
    }
  }, []);

  const handleEventAction = useCallback((action: EventAction, event: UIEvent) => {
    switch (action) {
      case 'call_back':
        // Handled by EventDetailModal
        break;
      case 'send_sms':
        // Handled by EventDetailModal
        break;
      case 'add_contact':
        // TODO: Navigate to add contact screen
        Alert.alert('Add Contact', `Navigate to add contact screen for ${event.display_number}`);
        break;
      case 'edit_contact':
        // TODO: Navigate to edit contact screen
        Alert.alert('Edit Contact', 'Navigate to edit contact screen');
        break;
      case 'block_contact':
        // TODO: Implement contact blocking
        Alert.alert('Block Contact', `Block ${event.display_name || event.display_number}?`);
        break;
      case 'share':
        // Handled by EventDetailModal
        break;
      case 'delete':
        handleDeleteEvent(event);
        break;
    }
  }, []);

  const handleDeleteEvent = useCallback((event: UIEvent) => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
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
              
              Alert.alert('Success', 'Event deleted successfully');
            } catch {
              Alert.alert('Error', 'Failed to delete event');
            }
          }
        }
      ]
    );
  }, [refetch]);

  const handleSearchSubmit = useCallback((searchText: string) => {
    updateSearch(searchText);
    addToSearchHistory(searchText);
    setShowSearch(false);
  }, [updateSearch, addToSearchHistory]);

  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    updateSearch(suggestion.value);
    addToSearchHistory(suggestion.value);
    setShowSearch(false);
  }, [updateSearch, addToSearchHistory]);

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleClearAllFilters = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  // Handle search focus/blur
  const handleSearchFocus = useCallback(() => {
    setShowSearch(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    // Delay to allow for suggestion selection
    setTimeout(() => setShowSearch(false), 150);
  }, []);

  const handleExportPress = useCallback(() => {
    if (events.length === 0) {
      Alert.alert('No Events', 'There are no events to export. Try adjusting your filters or loading more data.');
      return;
    }
    setShowExportModal(true);
  }, [events.length]);

  // Status bar configuration
  const statusBarStyle = Platform.OS === 'ios' ? 'dark-content' : 'light-content';
  const statusBarBackgroundColor = Platform.OS === 'android' ? '#FFFFFF' : undefined;

  return (
    <SafeAreaView style={styles.container}>
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
            accessibilityLabel="Export events"
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
      <View style={styles.listContainer}>
        <EventsList
          events={events}
          loading={loading}
          refreshing={refreshing}
          error={error}
          hasMore={pagination.hasMore}
          groupByDate={true}
          compactMode={false}
          searchQuery={filters.search}
          activeFilters={activeFilterSummary}
          onRefresh={refresh}
          onLoadMore={loadMore}
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
        }}
        onAction={handleEventAction}
      />

      {/* Export Modal */}
      <ExportModal
        visible={showExportModal}
        events={events}
        onClose={() => setShowExportModal(false)}
      />
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
    zIndex: 1000, // Ensure search suggestions appear above other content
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
});

export default EventsScreen;