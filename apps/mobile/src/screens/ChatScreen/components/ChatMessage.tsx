/**
 * ChatMessage Component
 * Individual message bubbles for user questions, AI responses, and system messages
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share
} from 'react-native';
import { ChatMessageProps } from '../types';
import { ResultsDisplay } from './ResultsDisplay';

const ChatMessage: React.FC<ChatMessageProps> = memo(({
  message,
  onRetry,
  onExport
}) => {
  const isUser = message.type === 'user';
  const isAssistant = message.type === 'assistant';
  const isSystem = message.type === 'system';
  const isError = message.type === 'error';

  const formatTimestamp = (timestamp: Date): string => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Q: ${message.content}${message.queryResult ? '\n\nA: ' + (message.queryResult.data || 'Data available') : ''}`,
        title: 'Chat Query'
      });
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleExport = () => {
    if (onExport && message.queryResult) {
      onExport(message.queryResult.data);
    }
  };

  return (
    <View style={[
      styles.container,
      isUser && styles.userContainer,
      isSystem && styles.systemContainer,
      isError && styles.errorContainer
    ]}>
      {/* Message bubble */}
      <View style={[
        styles.messageBubble,
        isUser && styles.userBubble,
        isAssistant && styles.assistantBubble,
        isSystem && styles.systemBubble,
        isError && styles.errorBubble
      ]}>
        {/* Status indicator for user messages */}
        {isUser && message.status === 'sending' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        )}

        {/* Message content */}
        <Text style={[
          styles.messageText,
          isUser && styles.userText,
          isAssistant && styles.assistantText,
          isSystem && styles.systemText,
          isError && styles.errorText
        ]}>
          {message.content}
        </Text>

        {/* Query result display */}
        {message.queryResult && (
          <View style={styles.resultContainer}>
            <ResultsDisplay 
              result={message.queryResult} 
              onExport={handleExport}
            />
          </View>
        )}

        {/* Error actions */}
        {isError && onRetry && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry query"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}

        {/* Timestamp */}
        <Text style={[
          styles.timestamp,
          isUser && styles.userTimestamp,
          isAssistant && styles.assistantTimestamp
        ]}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>

      {/* Action buttons for assistant messages */}
      {isAssistant && !isError && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share message"
          >
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
          
          {message.queryResult?.metadata?.exportable && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleExport}
              accessibilityRole="button"
              accessibilityLabel="Export data"
            >
              <Text style={styles.actionButtonText}>Export</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  systemContainer: {
    alignItems: 'center',
  },
  errorContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    position: 'relative',
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#F2F2F7',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  systemBubble: {
    backgroundColor: '#FF9500',
    maxWidth: '70%',
  },
  errorBubble: {
    backgroundColor: '#FF3B30',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  assistantText: {
    color: '#000000',
  },
  systemText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
  },
  errorText: {
    color: '#FFFFFF',
  },
  statusContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  resultContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 6,
    opacity: 0.6,
  },
  userTimestamp: {
    color: '#FFFFFF',
    textAlign: 'right',
  },
  assistantTimestamp: {
    color: '#8E8E93',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 4,
    marginLeft: 8,
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 12,
  },
  actionButtonText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '500',
  },
});

ChatMessage.displayName = 'ChatMessage';

export { ChatMessage };