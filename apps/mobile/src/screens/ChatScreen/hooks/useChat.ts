/**
 * useChat Hook
 * Main chat state management for the Chat/NLQ interface
 */

import { useState, useCallback, useEffect } from 'react';
import { 
  ChatMessage, 
  ChatState, 
  MessageType
} from '../types';
import { useChatHistory } from './useChatHistory';
import { useNlqQuery } from './useNlqQuery';

interface UseChatOptions {
  maxMessages?: number;
  autoSave?: boolean;
  enableAnalytics?: boolean;
}

export function useChat(options: UseChatOptions = {}) {
  const { maxMessages = 100, autoSave = true, enableAnalytics = true } = options;
  
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    lastQueryId: null
  });

  const { saveMessage, loadHistory } = useChatHistory();
  const { processQuery, isProcessing, error: queryError } = useNlqQuery();

  // Load chat history on mount
  useEffect(() => {
    const loadInitialHistory = async () => {
      try {
        const history = await loadHistory();
        const messages: ChatMessage[] = history.map((item, _index) => [
          {
            id: `${item.id}-query`,
            type: 'user' as MessageType,
            content: item.query,
            timestamp: item.timestamp,
            status: 'delivered' as const
          },
          {
            id: `${item.id}-response`,
            type: 'assistant' as MessageType,
            content: item.response,
            timestamp: item.timestamp,
            status: 'delivered' as const,
            queryResult: item.queryResult
          }
        ]).flat();

        setChatState(prev => ({
          ...prev,
          messages: messages.slice(-maxMessages)
        }));
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };

    loadInitialHistory();
  }, [loadHistory, maxMessages]);

  // Sync loading state with query processing
  useEffect(() => {
    setChatState(prev => ({
      ...prev,
      isLoading: isProcessing,
      error: queryError
    }));
  }, [isProcessing, queryError]);

  const addMessage = useCallback((message: ChatMessage) => {
    setChatState(prev => {
      const newMessages = [...prev.messages, message];
      
      // Trim messages if exceeding max
      if (newMessages.length > maxMessages) {
        newMessages.splice(0, newMessages.length - maxMessages);
      }

      return {
        ...prev,
        messages: newMessages
      };
    });
  }, [maxMessages]);

  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    setChatState(prev => ({
      ...prev,
      messages: prev.messages.map(msg =>
        msg.id === id ? { ...msg, ...updates } : msg
      )
    }));
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    const userMessageId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      type: 'user',
      content,
      timestamp: new Date(),
      status: 'sending'
    };

    // Add user message
    addMessage(userMessage);
    
    // Update user message to sent
    setTimeout(() => {
      updateMessage(userMessageId, { status: 'sent' });
    }, 100);

    try {
      // Process the query
      const response = await processQuery(content);
      
      // Update user message to delivered
      updateMessage(userMessageId, { status: 'delivered' });

      // Create assistant response
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        type: 'assistant',
        content: response.success 
          ? response.data?.explanation || 'I found some information for you.'
          : response.error?.message || 'I encountered an error processing your query.',
        timestamp: new Date(),
        status: 'delivered',
        queryResult: response.success ? response.data?.result : undefined,
        error: response.success ? undefined : response.error?.message
      };

      addMessage(assistantMessage);

      // Save to history if enabled
      if (autoSave && response.success && response.data) {
        await saveMessage({
          id: assistantMessageId,
          query: content,
          response: assistantMessage.content,
          timestamp: new Date(),
          queryResult: response.data.result
        });
      }

      setChatState(prev => ({
        ...prev,
        lastQueryId: assistantMessageId,
        error: null
      }));

    } catch (error) {
      // Update user message with error
      updateMessage(userMessageId, { status: 'error' });

      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: 'Sorry, I couldn\'t process your request. Please try again.',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      addMessage(errorMessage);

      setChatState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, [processQuery, addMessage, updateMessage, autoSave, saveMessage]);

  const retryLastQuery = useCallback(async () => {
    const lastUserMessage = [...chatState.messages]
      .reverse()
      .find(msg => msg.type === 'user');
      
    if (lastUserMessage) {
      await sendMessage(lastUserMessage.content);
    }
  }, [chatState.messages, sendMessage]);

  const clearChat = useCallback(() => {
    setChatState({
      messages: [],
      isLoading: false,
      error: null,
      lastQueryId: null
    });
  }, []);

  const removeMessage = useCallback((id: string) => {
    setChatState(prev => ({
      ...prev,
      messages: prev.messages.filter(msg => msg.id !== id)
    }));
  }, []);

  // Add system message (for onboarding, errors, etc.)
  const addSystemMessage = useCallback((content: string) => {
    const systemMessage: ChatMessage = {
      id: `system-${Date.now()}`,
      type: 'system',
      content,
      timestamp: new Date()
    };

    addMessage(systemMessage);
  }, [addMessage]);

  // Get analytics data
  const getAnalytics = useCallback(() => {
    const userMessages = chatState.messages.filter(msg => msg.type === 'user');
    const assistantMessages = chatState.messages.filter(msg => msg.type === 'assistant');
    const errorMessages = chatState.messages.filter(msg => msg.type === 'error');

    return {
      totalQueries: userMessages.length,
      successfulQueries: assistantMessages.length,
      errorRate: userMessages.length > 0 ? errorMessages.length / userMessages.length : 0,
      averageResponseTime: 0, // Would calculate from actual response times
      lastActivity: chatState.messages[chatState.messages.length - 1]?.timestamp
    };
  }, [chatState.messages]);

  return {
    // State
    messages: chatState.messages,
    isLoading: chatState.isLoading,
    error: chatState.error,
    lastQueryId: chatState.lastQueryId,
    
    // Actions
    sendMessage,
    retryLastQuery,
    clearChat,
    removeMessage,
    addSystemMessage,
    updateMessage,
    
    // Analytics
    getAnalytics: enableAnalytics ? getAnalytics : undefined,
    
    // Computed
    hasMessages: chatState.messages.length > 0,
    canRetry: chatState.messages.some(msg => msg.type === 'error'),
    messageCount: chatState.messages.length
  };
}