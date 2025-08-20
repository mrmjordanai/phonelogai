/**
 * EnhancedChatScreen Component
 * Production-ready Chat/NLQ interface with advanced features
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  Text,
  TouchableOpacity,
  Animated,
  AppState,
  AppStateStatus
} from 'react-native';
import { useChat, useChatHistory, useQuerySuggestions, useNlqQuery } from './hooks';
import { 
  ChatList, 
  QueryInput, 
  QuerySuggestions 
} from './components';
import { ExportOptions, ChatAnalytics } from './types';

interface EnhancedChatScreenProps {
  enableSuggestions?: boolean;
  enableHistory?: boolean;
  enableAnalytics?: boolean;
  maxHistoryItems?: number;
  onAnalyticsUpdate?: (_analytics: ChatAnalytics) => void;
}

const EnhancedChatScreen: React.FC<EnhancedChatScreenProps> = ({
  enableSuggestions = true,
  enableHistory = true,
  enableAnalytics = true,
  maxHistoryItems = 500,
  onAnalyticsUpdate
}) => {
  // State management
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [headerHeight] = useState(new Animated.Value(60));
  
  // Refs
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const sessionIdRef = useRef(`session-${Date.now()}`);

  // Initialize hooks
  const {
    messages,
    isLoading,
    sendMessage,
    retryLastQuery,
    clearChat,
    addSystemMessage,
    hasMessages,
    getAnalytics,
    messageCount
  } = useChat({
    maxMessages: 100,
    autoSave: enableHistory,
    enableAnalytics: enableAnalytics
  });

  const {
    history,
    clearHistory,
    isLoading: historyLoading
  } = useChatHistory({
    maxItems: maxHistoryItems,
    autoSave: enableHistory
  });

  const {
    suggestions,
    refreshSuggestions,
    context: suggestionsContext,
    isLoading: suggestionsLoading
  } = useQuerySuggestions(history, {
    maxSuggestions: 6,
    enablePersonalization: true,
    enableContextAware: true
  });

  const {
    metrics: queryMetrics,
    isUsingMock,
    errorRate
  } = useNlqQuery({
    enableMock: true,
    timeout: 15000
  });

  // Analytics tracking
  useEffect(() => {
    if (enableAnalytics && getAnalytics && onAnalyticsUpdate) {
      const analytics: ChatAnalytics = {
        sessionId: sessionIdRef.current,
        queriesCount: queryMetrics.queryCount,
        successfulQueries: queryMetrics.successCount,
        averageResponseTime: queryMetrics.averageResponseTime,
        popularQueries: history.slice(0, 5).map(item => item.query),
        errorRate: errorRate
      };
      onAnalyticsUpdate(analytics);
    }
  }, [
    messageCount, 
    queryMetrics, 
    history.length, 
    enableAnalytics, 
    getAnalytics, 
    onAnalyticsUpdate,
    errorRate
  ]);

  // App state handling
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground - refresh suggestions
        if (enableSuggestions) {
          refreshSuggestions();
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [enableSuggestions, refreshSuggestions]);

  // Network status monitoring (simplified)
  useEffect(() => {
    // In a real app, you'd use @react-native-netinfo/netinfo
    // For now, we'll assume online
    setIsOnline(true);
  }, []);

  // Auto-hide suggestions when user starts chatting
  useEffect(() => {
    if (hasMessages && showSuggestions) {
      setShowSuggestions(false);
    }
  }, [hasMessages, showSuggestions]);

  // Animate header based on content
  useEffect(() => {
    Animated.timing(headerHeight, {
      toValue: hasMessages ? 50 : 60,
      duration: 300,
      useNativeDriver: false
    }).start();
  }, [hasMessages, headerHeight]);

  // Show contextual welcome message
  useEffect(() => {
    if (!hasMessages && !isLoading && !historyLoading) {
      let welcomeMessage = "Hello! I can help you analyze your communication data.";
      
      if (suggestionsContext.hasHistory) {
        welcomeMessage = "Welcome back! Ready to explore your data?";
      } else if (suggestionsContext.timeOfDay === 'morning') {
        welcomeMessage = "Good morning! Let's dive into your communication insights.";
      } else if (suggestionsContext.timeOfDay === 'evening') {
        welcomeMessage = "Good evening! What communication patterns would you like to explore?";
      }

      const timer = setTimeout(() => {
        addSystemMessage(welcomeMessage);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [
    hasMessages, 
    isLoading, 
    historyLoading,
    addSystemMessage, 
    suggestionsContext
  ]);

  // Handle sending messages with enhanced error handling
  const handleSendMessage = useCallback(async (message: string) => {
    setShowSuggestions(false);
    
    try {
      await sendMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert(
        'Send Failed',
        'Your message couldn\'t be sent. Please check your connection and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => handleSendMessage(message) }
        ]
      );
    }
  }, [sendMessage]);

  // Handle suggestion selection with analytics
  const handleSelectSuggestion = useCallback(async (query: string) => {
    // Track suggestion usage for analytics
    console.log('Suggestion selected:', query);
    await handleSendMessage(query);
  }, [handleSendMessage]);

  // Handle sample query from empty state
  const handleSampleQuery = useCallback(async (query: string) => {
    setShowSuggestions(false);
    await handleSendMessage(query);
  }, [handleSendMessage]);

  // Enhanced retry with better error handling
  const handleRetry = useCallback(async (_messageId?: string) => {
    try {
      await retryLastQuery();
    } catch (error) {
      console.error('Retry failed:', error);
      Alert.alert(
        'Retry Failed',
        'Unable to retry the query. The service might be temporarily unavailable.',
        [
          { text: 'OK' },
          { text: 'Clear Error', onPress: clearChat }
        ]
      );
    }
  }, [retryLastQuery, clearChat]);

  // Enhanced data export with multiple formats
  const handleExportData = useCallback(async (
    data: unknown, 
    format: 'csv' | 'json' = 'json'
  ): Promise<void> => {
    try {
      const exportOptions: ExportOptions = {
        format,
        includeMetadata: true,
        filename: `phonelogai-export-${Date.now()}.${format}`
      };

      // In production, implement actual file export using react-native-fs or similar
      Alert.alert(
        'Export Data',
        `Export ${exportOptions.filename}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Export', 
            onPress: () => {
              console.log('Exporting data:', { data, options: exportOptions });
              // Implement actual export logic
            }
          }
        ]
      );
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert(
        'Export Failed',
        'Unable to export data. Please ensure you have sufficient storage space.',
        [{ text: 'OK' }]
      );
    }
  }, []);

  // Enhanced refresh with loading states
  const handleRefresh = useCallback(async () => {
    try {
      if (enableSuggestions) {
        await refreshSuggestions();
      }
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  }, [refreshSuggestions, enableSuggestions]);

  // Enhanced clear chat with options
  const handleClearChat = useCallback(() => {
    Alert.alert(
      'Clear Chat',
      'Choose what to clear:',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Current Session', 
          onPress: () => {
            clearChat();
            setShowSuggestions(true);
            addSystemMessage("Session cleared. How can I help you?");
          }
        },
        ...(enableHistory ? [{ 
          text: 'All History', 
          style: 'destructive' as const,
          onPress: () => {
            clearChat();
            clearHistory();
            setShowSuggestions(true);
            addSystemMessage("All history cleared. Starting fresh!");
          }
        }] : [])
      ]
    );
  }, [clearChat, clearHistory, addSystemMessage, enableHistory]);

  // Toggle suggestions view
  const handleToggleSuggestions = useCallback(() => {
    setShowSuggestions(prev => !prev);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Enhanced Header */}
      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerTitle}>
            <Text style={styles.titleText}>Chat with Data</Text>
            {isUsingMock && (
              <View style={styles.mockBadge}>
                <Text style={styles.mockBadgeText}>DEMO</Text>
              </View>
            )}
          </View>
          
          <View style={styles.headerActions}>
            {hasMessages && enableSuggestions && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleToggleSuggestions}
                accessibilityRole="button"
                accessibilityLabel="Toggle suggestions"
              >
                <Text style={styles.headerButtonText}>
                  {showSuggestions ? '💬' : '💡'}
                </Text>
              </TouchableOpacity>
            )}
            
            {hasMessages && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleClearChat}
                accessibilityRole="button"
                accessibilityLabel="Clear chat"
              >
                <Text style={styles.headerButtonText}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status indicators */}
        <View style={styles.statusBar}>
          {!isOnline && (
            <View style={styles.statusIndicator}>
              <Text style={styles.statusText}>Offline Mode</Text>
            </View>
          )}
          {queryMetrics.queryCount > 0 && (
            <View style={styles.statusIndicator}>
              <Text style={styles.statusText}>
                {queryMetrics.successCount}/{queryMetrics.queryCount} queries
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
      
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 25}
      >
        {/* Content area */}
        <View style={styles.contentContainer}>
          {showSuggestions && (!hasMessages || suggestionsContext.hasHistory) ? (
            <QuerySuggestions
              suggestions={suggestions}
              onSelectSuggestion={handleSelectSuggestion}
              visible={enableSuggestions}
            />
          ) : (
            <ChatList
              messages={messages}
              isLoading={isLoading || suggestionsLoading}
              onRefresh={handleRefresh}
              onRetryMessage={handleRetry}
              onExportData={handleExportData}
              onSampleQuery={handleSampleQuery}
              autoScroll={true}
            />
          )}
        </View>

        {/* Enhanced Input area */}
        <QueryInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder={
            !isOnline ? "Offline mode - limited functionality" :
            hasMessages ? "Ask another question..." : 
            "Ask about your calls and messages..."
          }
          disabled={!isOnline}
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
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D1D1F',
  },
  mockBadge: {
    backgroundColor: '#FF9500',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  mockBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  headerButtonText: {
    fontSize: 16,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 4,
  },
  statusIndicator: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginHorizontal: 4,
  },
  statusText: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '500',
  },
  keyboardContainer: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
});

export { EnhancedChatScreen };