/**
 * ChatList Component
 * Virtualized list for displaying chat messages with performance optimizations
 */

import React, { memo, useRef, useCallback, useEffect } from 'react';
import {
  FlatList,
  View,
  StyleSheet,
  RefreshControl,
  ListRenderItem
} from 'react-native';
import { ChatMessage as ChatMessageType } from '../types';
import { ChatMessage } from './ChatMessage';
import { EmptyState } from './EmptyState';

interface ChatListProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onRefresh?: () => void;
  onRetryMessage?: (_messageId: string) => void;
  onExportData?: (_data: unknown) => void;
  onSampleQuery?: (_query: string) => void;
  autoScroll?: boolean;
}

const ChatList: React.FC<ChatListProps> = memo(({
  messages,
  isLoading,
  onRefresh,
  onRetryMessage,
  onExportData,
  onSampleQuery,
  autoScroll = true
}) => {
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && messages.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, autoScroll]);

  const renderMessage: ListRenderItem<ChatMessageType> = useCallback(({ item }) => (
    <ChatMessage
      message={item}
      onRetry={
        item.type === 'error' && onRetryMessage
          ? () => onRetryMessage(item.id)
          : undefined
      }
      onExport={
        item.queryResult?.metadata?.exportable && onExportData
          ? onExportData
          : undefined
      }
    />
  ), [onRetryMessage, onExportData]);

  const renderEmptyState = useCallback(() => (
    <EmptyState onSampleQuery={onSampleQuery} />
  ), [onSampleQuery]);

  const keyExtractor = useCallback((item: ChatMessageType) => item.id, []);

  const getItemLayout = useCallback((_data: unknown, index: number) => ({
    length: 80, // Estimated item height
    offset: 80 * index,
    index,
  }), []);

  const renderSeparator = useCallback(() => (
    <View style={styles.separator} />
  ), []);


  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        ListEmptyComponent={renderEmptyState}
        ItemSeparatorComponent={renderSeparator}
        contentContainerStyle={[
          styles.contentContainer,
          messages.length === 0 && styles.emptyContentContainer
        ]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={15}
        updateCellsBatchingPeriod={100}
        getItemLayout={messages.length > 50 ? getItemLayout : undefined}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor="#007AFF"
              title="Refreshing..."
            />
          ) : undefined
        }
        // Performance optimizations
        disableVirtualization={messages.length < 100}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 10,
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    flexGrow: 1,
    paddingVertical: 8,
  },
  emptyContentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  separator: {
    height: 2,
  },
});

ChatList.displayName = 'ChatList';

export { ChatList };