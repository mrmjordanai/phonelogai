/**
 * ChatScreen Component
 * Main Chat/NLQ interface with all features integrated
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar
} from 'react-native';
import { useChat, useChatHistory, useQuerySuggestions } from './hooks';
import { 
  ChatList, 
  QueryInput, 
  QuerySuggestions 
} from './components';
// import { ExportOptions, ExportResult } from './types'; // TODO: Use in future export functionality

interface ChatScreenProps {
  // Future props for customization
  enableSuggestions?: boolean;
  enableHistory?: boolean;
  maxHistoryItems?: number;
}

const ChatScreen: React.FC<ChatScreenProps> = ({
  enableSuggestions = true,
  enableHistory = true,
  maxHistoryItems = 500
}) => {
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Initialize hooks
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    retryLastQuery,
    addSystemMessage,
    hasMessages
  } = useChat({
    maxMessages: 100,
    autoSave: enableHistory,
    enableAnalytics: true
  });

  const {
    history
  } = useChatHistory({
    maxItems: maxHistoryItems,
    autoSave: enableHistory
  });

  const {
    suggestions,
    refreshSuggestions,
    context: suggestionsContext
  } = useQuerySuggestions(history, {
    maxSuggestions: 6,
    enablePersonalization: true,
    enableContextAware: true
  });

  // Hide suggestions when user starts chatting
  useEffect(() => {
    if (hasMessages && showSuggestions) {
      setShowSuggestions(false);
    }
  }, [hasMessages, showSuggestions]);

  // Show welcome message on first load
  useEffect(() => {
    if (!hasMessages && !isLoading) {
      const welcomeMessage = suggestionsContext.timeOfDay === 'morning'
        ? "Good morning! I'm ready to help you analyze your communication data."
        : suggestionsContext.timeOfDay === 'evening'
        ? "Good evening! What would you like to know about your calls and messages?"
        : "Hello! I can help you analyze your calls and messages. What would you like to know?";
      
      const timer = setTimeout(() => {
        addSystemMessage(welcomeMessage);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [hasMessages, isLoading, addSystemMessage, suggestionsContext.timeOfDay]);

  // Handle sending messages
  const handleSendMessage = useCallback(async (message: string) => {
    setShowSuggestions(false);
    await sendMessage(message);
  }, [sendMessage]);

  // Handle suggestion selection
  const handleSelectSuggestion = useCallback(async (query: string) => {
    await handleSendMessage(query);
  }, [handleSendMessage]);

  // Handle sample query from empty state
  const handleSampleQuery = useCallback(async (query: string) => {
    setShowSuggestions(false);
    await handleSendMessage(query);
  }, [handleSendMessage]);

  // Handle retry
  const handleRetry = useCallback(async (_messageId?: string) => {
    try {
      await retryLastQuery();
    } catch {
      Alert.alert(
        'Retry Failed',
        'Unable to retry the query. Please try sending a new message.',
        [{ text: 'OK' }]
      );
    }
  }, [retryLastQuery]);

  // Handle data export
  const handleExportData = useCallback(async (
    data: unknown, 
    format: 'csv' | 'json' = 'json'
  ): Promise<void> => {
    try {
      // In a real implementation, this would save to device storage
      // For now, we'll show an alert
      Alert.alert(
        'Export Data',
        `Data would be exported in ${format.toUpperCase()} format.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Export', onPress: () => console.log('Export:', data) }
        ]
      );
    } catch {
      Alert.alert(
        'Export Failed',
        'Unable to export data. Please try again.',
        [{ text: 'OK' }]
      );
    }
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (enableSuggestions) {
      refreshSuggestions();
    }
  }, [refreshSuggestions, enableSuggestions]);


  // Handle error scenarios
  useEffect(() => {
    if (error && !isLoading) {
      // Auto-clear error after 5 seconds
      const timer = setTimeout(() => {
        // Error handling could be improved here
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, isLoading]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 25}
      >
        {/* Chat messages or suggestions */}
        <View style={styles.contentContainer}>
          {showSuggestions && !hasMessages ? (
            <QuerySuggestions
              suggestions={suggestions}
              onSelectSuggestion={handleSelectSuggestion}
              visible={enableSuggestions}
            />
          ) : (
            <ChatList
              messages={messages}
              isLoading={isLoading}
              onRefresh={handleRefresh}
              onRetryMessage={handleRetry}
              onExportData={handleExportData}
              onSampleQuery={handleSampleQuery}
              autoScroll={true}
            />
          )}
        </View>

        {/* Input area */}
        <QueryInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder={
            hasMessages 
              ? "Ask another question..." 
              : "Ask about your calls and messages..."
          }
          disabled={false}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardContainer: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
});

export { ChatScreen };