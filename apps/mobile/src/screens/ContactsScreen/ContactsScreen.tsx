import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ContactsScreenProps, ContactsScreenState } from './types';
import { useContactFilters, useInfiniteScroll } from './hooks';
import { ContactsList, ContactSearchBar, ContactDetailModal, EmptyState } from './components';

export function ContactsScreen({ navigation: _navigation, route: _route }: ContactsScreenProps) {
  const [screenState, setScreenState] = useState<ContactsScreenState>({
    selectedContactId: undefined,
    showDetailModal: false,
    showFilters: false,
    isSearchFocused: false,
    error: undefined,
  });

  // Filters management
  const {
    filters,
    clearFilters,
    hasAnyFilters,
    setSearchTerm,
  } = useContactFilters();

  // Infinite scroll contacts
  const {
    contacts,
    isLoading,
    isError,
    error,
    onEndReached,
    refresh,
  } = useInfiniteScroll(filters);

  // Handle contact selection
  const handleContactPress = useCallback((contactId: string) => {
    setScreenState(prev => ({
      ...prev,
      selectedContactId: contactId,
      showDetailModal: true,
    }));
  }, []);

  // Handle contact calling
  const handleContactCall = useCallback((number: string) => {
    const phoneUrl = `tel:${number}`;
    Linking.canOpenURL(phoneUrl)
      .then(supported => {
        if (supported) {
          return Linking.openURL(phoneUrl);
        } else {
          Alert.alert('Error', 'Phone calls are not supported on this device');
        }
      })
      .catch(err => {
        console.error('Error opening phone:', err);
        Alert.alert('Error', 'Failed to open phone app');
      });
  }, []);

  // Handle contact messaging
  const handleContactMessage = useCallback((number: string) => {
    const smsUrl = `sms:${number}`;
    Linking.canOpenURL(smsUrl)
      .then(supported => {
        if (supported) {
          return Linking.openURL(smsUrl);
        } else {
          Alert.alert('Error', 'Messaging is not supported on this device');
        }
      })
      .catch(err => {
        console.error('Error opening messages:', err);
        Alert.alert('Error', 'Failed to open messaging app');
      });
  }, []);

  // Close detail modal
  const handleCloseModal = useCallback(() => {
    setScreenState(prev => ({
      ...prev,
      showDetailModal: false,
      selectedContactId: undefined,
    }));
  }, []);


  // Handle search focus
  const handleSearchFocus = useCallback(() => {
    setScreenState(prev => ({ ...prev, isSearchFocused: true }));
  }, []);

  const handleSearchBlur = useCallback(() => {
    setScreenState(prev => ({ ...prev, isSearchFocused: false }));
  }, []);

  // Handle pull to refresh
  const handleRefresh = useCallback(async () => {
    try {
      await refresh();
      setScreenState(prev => ({ ...prev, error: undefined }));
    } catch (err) {
      console.error('Refresh error:', err);
      setScreenState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Failed to refresh contacts' 
      }));
    }
  }, [refresh]);

  // Focus effect to refresh when screen becomes active
  useFocusEffect(
    useCallback(() => {
      // Optionally refresh contacts when screen comes into focus
      // handleRefresh();
    }, [])
  );

  // Render empty state
  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <EmptyState
          type="loading"
          title="Loading contacts..."
          subtitle="Please wait while we fetch your contacts"
        />
      );
    }

    if (isError || screenState.error) {
      return (
        <EmptyState
          type="error"
          title="Failed to load contacts"
          subtitle={error?.message || screenState.error || 'Please try again'}
          actionText="Retry"
          onAction={handleRefresh}
        />
      );
    }

    if (hasAnyFilters) {
      return (
        <EmptyState
          type="search"
          title="No contacts found"
          subtitle="Try adjusting your search or filters"
          actionText="Clear filters"
          onAction={clearFilters}
        />
      );
    }

    return (
      <EmptyState
        type="empty"
        title="No contacts yet"
        subtitle="Your contacts will appear here as you use the app"
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <ContactSearchBar
          searchTerm={filters.searchTerm}
          onSearchChange={setSearchTerm}
          onClear={() => setSearchTerm('')}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          placeholder="Search contacts..."
        />
      </View>

      {/* Filters - Disabled for now to simplify initial implementation */}
      {/* TODO: Enable filters when needed
      <View style={styles.filtersContainer}>
        <ContactFilters
          filters={filters}
          onFiltersChange={updateFilters}
            onClearFilters={clearFilters}
            availableTags={availableTags}
          />
        </View>
      */}

      {/* Contacts List */}
      <View style={styles.listContainer}>
        {contacts.length === 0 ? (
          renderEmptyState()
        ) : (
          <ContactsList
            contacts={contacts}
            loading={isLoading}
            refreshing={false}
            onRefresh={handleRefresh}
            onEndReached={onEndReached}
            onContactPress={handleContactPress}
            onContactCall={handleContactCall}
            onContactMessage={handleContactMessage}
          />
        )}
      </View>

      {/* Contact Detail Modal */}
      <ContactDetailModal
        contactId={screenState.selectedContactId}
        visible={screenState.showDetailModal}
        onClose={handleCloseModal}
        onCall={handleContactCall}
        onMessage={handleContactMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filtersContainer: {
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  listContainer: {
    flex: 1,
  },
});