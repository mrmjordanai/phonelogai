import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
} from 'react-native';
import { ContactsListProps } from '../types';
import { ContactSearchResult } from '../localTypes';
import { ContactListItem } from './ContactListItem';

export function ContactsList({
  contacts,
  loading = false,
  refreshing = false,
  onRefresh,
  onEndReached,
  onContactPress,
  onContactCall,
  onContactMessage,
  ListHeaderComponent,
  ListFooterComponent,
}: ContactsListProps) {
  
  // Render individual contact item
  const renderContact = useCallback(({ item }: { item: ContactSearchResult }) => (
    <ContactListItem
      contact={item}
      onPress={onContactPress}
      onCall={onContactCall}
      onMessage={onContactMessage}
      showPrivacyIndicator
    />
  ), [onContactPress, onContactCall, onContactMessage]);

  // Generate unique key for each contact
  const keyExtractor = useCallback((item: ContactSearchResult) => item.contact_id, []);

  // Render loading footer for infinite scroll
  const renderFooter = useCallback(() => {
    if (ListFooterComponent) {
      return <ListFooterComponent />;
    }

    if (loading) {
      return (
        <View style={styles.loadingFooter}>
          <ActivityIndicator size="small" color="#6b7280" />
          <Text style={styles.loadingText}>Loading more contacts...</Text>
        </View>
      );
    }

    return null;
  }, [loading, ListFooterComponent]);

  // Item separator
  const renderSeparator = useCallback(() => (
    <View style={styles.separator} />
  ), []);

  // Optimize list performance
  const getItemLayout = useCallback((_data: ArrayLike<ContactSearchResult> | null | undefined, index: number) => ({
    length: 72, // Estimated item height
    offset: 72 * index,
    index,
  }), []);

  // Memoize refresh control
  const refreshControl = useMemo(() => (
    onRefresh ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor="#6b7280"
        title="Pull to refresh"
        titleColor="#6b7280"
      />
    ) : undefined
  ), [refreshing, onRefresh]);

  return (
    <FlatList
      data={contacts}
      renderItem={renderContact}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={renderSeparator}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={renderFooter}
      refreshControl={refreshControl}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.8}
      removeClippedSubviews={true}
      maxToRenderPerBatch={20}
      updateCellsBatchingPeriod={100}
      windowSize={10}
      getItemLayout={getItemLayout}
      style={styles.list}
      contentContainerStyle={[
        styles.contentContainer,
        contacts.length === 0 && styles.emptyContainer
      ]}
      showsVerticalScrollIndicator={true}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  separator: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 60, // Align with contact name
  },
  loadingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
});