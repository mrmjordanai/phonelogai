/**
 * useChatHistory Hook
 * Persistent chat history management with AsyncStorage
 */

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatHistoryItem } from '../types';

interface UseChatHistoryOptions {
  maxItems?: number;
  storageKey?: string;
  autoSave?: boolean;
  compression?: boolean;
}

interface HistoryStats {
  totalItems: number;
  oldestItem?: Date;
  newestItem?: Date;
  totalQueries: number;
  uniqueQueries: number;
}

const DEFAULT_STORAGE_KEY = '@phonelogai:chat_history';
const DEFAULT_MAX_ITEMS = 500;

export function useChatHistory(options: UseChatHistoryOptions = {}) {
  const {
    maxItems = DEFAULT_MAX_ITEMS,
    storageKey = DEFAULT_STORAGE_KEY,
    autoSave = true,
    compression = true
  } = options;

  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<HistoryStats>({
    totalItems: 0,
    totalQueries: 0,
    uniqueQueries: 0
  });

  // Load history from storage on mount
  const loadHistory = useCallback(async (): Promise<ChatHistoryItem[]> => {
    try {
      setIsLoading(true);
      setError(null);

      const stored = await AsyncStorage.getItem(storageKey);
      if (!stored) {
        return [];
      }

      const parsed = JSON.parse(stored) as ChatHistoryItem[];
      
      // Convert timestamp strings back to Date objects
      const historyItems = parsed.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));

      // Sort by timestamp (newest first)
      historyItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Trim if exceeding max items
      const trimmedHistory = historyItems.slice(0, maxItems);

      setHistory(trimmedHistory);
      updateStats(trimmedHistory);

      return trimmedHistory;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load chat history';
      setError(errorMessage);
      console.error('Failed to load chat history:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [storageKey, maxItems]);

  // Save history to storage
  const saveHistory = useCallback(async (historyToSave: ChatHistoryItem[]): Promise<void> => {
    try {
      const dataToSave = compression
        ? JSON.stringify(historyToSave)
        : JSON.stringify(historyToSave, null, 2);

      await AsyncStorage.setItem(storageKey, dataToSave);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save chat history';
      setError(errorMessage);
      console.error('Failed to save chat history:', error);
      throw error;
    }
  }, [storageKey, compression]);

  // Update statistics
  const updateStats = useCallback((historyItems: ChatHistoryItem[]) => {
    if (historyItems.length === 0) {
      setStats({
        totalItems: 0,
        totalQueries: 0,
        uniqueQueries: 0
      });
      return;
    }

    const timestamps = historyItems.map(item => item.timestamp);
    const queries = historyItems.map(item => item.query.toLowerCase());
    const uniqueQueries = new Set(queries);

    setStats({
      totalItems: historyItems.length,
      oldestItem: new Date(Math.min(...timestamps.map(t => t.getTime()))),
      newestItem: new Date(Math.max(...timestamps.map(t => t.getTime()))),
      totalQueries: historyItems.length,
      uniqueQueries: uniqueQueries.size
    });
  }, []);

  // Add new message to history
  const saveMessage = useCallback(async (item: ChatHistoryItem): Promise<void> => {
    try {
      const newHistory = [item, ...history].slice(0, maxItems);
      
      setHistory(newHistory);
      updateStats(newHistory);

      if (autoSave) {
        await saveHistory(newHistory);
      }
    } catch (error) {
      console.error('Failed to save message:', error);
      throw error;
    }
  }, [history, maxItems, autoSave, saveHistory, updateStats]);

  // Remove message from history
  const removeMessage = useCallback(async (id: string): Promise<void> => {
    try {
      const newHistory = history.filter(item => item.id !== id);
      
      setHistory(newHistory);
      updateStats(newHistory);

      if (autoSave) {
        await saveHistory(newHistory);
      }
    } catch (error) {
      console.error('Failed to remove message:', error);
      throw error;
    }
  }, [history, autoSave, saveHistory, updateStats]);

  // Clear all history
  const clearHistory = useCallback(async (): Promise<void> => {
    try {
      setHistory([]);
      updateStats([]);
      
      await AsyncStorage.removeItem(storageKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear chat history';
      setError(errorMessage);
      console.error('Failed to clear chat history:', error);
      throw error;
    }
  }, [storageKey, updateStats]);

  // Search history
  const searchHistory = useCallback((query: string): ChatHistoryItem[] => {
    if (!query.trim()) {
      return history;
    }

    const searchTerm = query.toLowerCase();
    return history.filter(item =>
      item.query.toLowerCase().includes(searchTerm) ||
      item.response.toLowerCase().includes(searchTerm)
    );
  }, [history]);

  // Get history by date range
  const getHistoryByDateRange = useCallback((
    startDate: Date,
    endDate: Date
  ): ChatHistoryItem[] => {
    return history.filter(item =>
      item.timestamp >= startDate && item.timestamp <= endDate
    );
  }, [history]);

  // Get recent queries (unique)
  const getRecentQueries = useCallback((limit: number = 10): string[] => {
    const uniqueQueries = new Set<string>();
    const queries: string[] = [];

    for (const item of history) {
      if (!uniqueQueries.has(item.query.toLowerCase()) && queries.length < limit) {
        uniqueQueries.add(item.query.toLowerCase());
        queries.push(item.query);
      }
    }

    return queries;
  }, [history]);

  // Export history
  const exportHistory = useCallback(async (format: 'json' | 'csv' = 'json'): Promise<string> => {
    try {
      if (format === 'csv') {
        const headers = 'ID,Query,Response,Timestamp\n';
        const rows = history.map(item =>
          `"${item.id}","${item.query}","${item.response}","${item.timestamp.toISOString()}"`
        ).join('\n');
        return headers + rows;
      }

      return JSON.stringify(history, null, 2);
    } catch (error) {
      console.error('Failed to export history:', error);
      throw error;
    }
  }, [history]);

  // Force save current history
  const forceSave = useCallback(async (): Promise<void> => {
    await saveHistory(history);
  }, [history, saveHistory]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    // State
    history,
    isLoading,
    error,
    stats,

    // Actions
    loadHistory,
    saveMessage,
    removeMessage,
    clearHistory,
    forceSave,

    // Search and filter
    searchHistory,
    getHistoryByDateRange,
    getRecentQueries,

    // Utilities
    exportHistory,

    // Computed values
    hasHistory: history.length > 0,
    isEmpty: history.length === 0,
    isFull: history.length >= maxItems,
    
    // Configuration
    maxItems,
    storageKey
  };
}