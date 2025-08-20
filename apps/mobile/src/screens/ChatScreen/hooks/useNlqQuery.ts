/**
 * useNlqQuery Hook
 * Handles NLQ API calls and response processing
 */

import { useState, useCallback, useRef } from 'react';
import { NlqApiResponse, ChatError, ChatErrorInfo } from '../types';
import MockNlqService from '../services/MockNlqService';

interface UseNlqQueryOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableMock?: boolean;
}

interface QueryMetrics {
  queryCount: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastQueryTime?: Date;
}

export function useNlqQuery(options: UseNlqQueryOptions = {}) {
  const {
    timeout = 10000, // 10 seconds
    maxRetries = 2,
    retryDelay = 1000,
    enableMock = true // Use mock service for development
  } = options;

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<NlqApiResponse | null>(null);
  const [metrics, setMetrics] = useState<QueryMetrics>({
    queryCount: 0,
    successCount: 0,
    errorCount: 0,
    averageResponseTime: 0
  });

  const abortController = useRef<{ abort: () => void; signal?: { aborted: boolean } } | null>(null);
  const mockService = useRef(MockNlqService.getInstance());

  const updateMetrics = useCallback((responseTime: number, isSuccess: boolean) => {
    setMetrics(prev => {
      const newQueryCount = prev.queryCount + 1;
      const newSuccessCount = isSuccess ? prev.successCount + 1 : prev.successCount;
      const newErrorCount = isSuccess ? prev.errorCount : prev.errorCount + 1;
      
      // Calculate running average
      const newAverageResponseTime = 
        (prev.averageResponseTime * prev.queryCount + responseTime) / newQueryCount;

      return {
        queryCount: newQueryCount,
        successCount: newSuccessCount,
        errorCount: newErrorCount,
        averageResponseTime: newAverageResponseTime,
        lastQueryTime: new Date()
      };
    });
  }, []);

  const createErrorInfo = useCallback((type: ChatError, message: string, details?: unknown): ChatErrorInfo => ({
    type,
    message,
    retryable: ['network_error', 'query_timeout', 'service_unavailable'].includes(type),
    details
  }), []);

  const processQueryWithRetry = useCallback(async (
    query: string,
    attempt: number = 1
  ): Promise<NlqApiResponse> => {
    const startTime = Date.now();

    try {
      let response: NlqApiResponse;

      if (enableMock) {
        // Use mock service for development
        response = await mockService.current.processQuery(query);
      } else {
        // Real API implementation would go here
        response = await processRealQuery(query);
      }

      const responseTime = Date.now() - startTime;
      updateMetrics(responseTime, response.success);

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      updateMetrics(responseTime, false);

      // Handle different error types
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw createErrorInfo('query_timeout', 'Query was cancelled');
        }
        if (error.message.includes('network') || error.message.includes('fetch')) {
          if (attempt < maxRetries) {
            // Retry with delay
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
            return processQueryWithRetry(query, attempt + 1);
          }
          throw createErrorInfo('network_error', 'Network error occurred', error.message);
        }
      }

      throw createErrorInfo('parsing_error', 'Failed to process query', error);
    }
  }, [enableMock, maxRetries, retryDelay, updateMetrics, createErrorInfo]);

  const processRealQuery = async (_query: string): Promise<NlqApiResponse> => {
    // This would be the actual API call implementation
    // For now, throw an error to indicate it's not implemented
    throw new Error('Real API integration not yet implemented');

    /* Example implementation:
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    
    const request: NlqApiRequest = {
      query,
      userId: 'current-user-id', // Would get from auth context
      context: {
        previousQueries: [], // Could include recent queries for context
        dateRange: undefined, // Could include date filters
        filters: {}
      }
    };

    const response = await fetch(`${apiUrl}/api/nlq`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authorization headers would go here
      },
      body: JSON.stringify(request),
      signal: abortController.current?.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
    */
  };

  const processQuery = useCallback(async (query: string): Promise<NlqApiResponse> => {
    // Cancel any existing request - simplified for now
    // TODO: Implement proper AbortController support

    setIsProcessing(true);
    setError(null);

    try {
      // Add timeout
      const timeoutId = setTimeout(() => {
        abortController.current?.abort();
      }, timeout);

      const response = await processQueryWithRetry(query);
      
      clearTimeout(timeoutId);
      setLastResponse(response);

      if (!response.success) {
        const errorMessage = response.error?.message || 'Query processing failed';
        setError(errorMessage);
      }

      return response;

    } catch (error) {
      const errorInfo = error as ChatErrorInfo;
      const errorMessage = errorInfo?.message || 'An unexpected error occurred';
      
      setError(errorMessage);
      
      // Return error response
      return {
        success: false,
        error: {
          code: errorInfo?.type || 'unknown_error',
          message: errorMessage,
          details: errorInfo?.details
        }
      };

    } finally {
      setIsProcessing(false);
      abortController.current = null;
    }
  }, [timeout, processQueryWithRetry]);

  const cancelQuery = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetMetrics = useCallback(() => {
    setMetrics({
      queryCount: 0,
      successCount: 0,
      errorCount: 0,
      averageResponseTime: 0
    });
  }, []);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
    }
  }, []);

  return {
    // State
    isProcessing,
    error,
    lastResponse,
    metrics,

    // Actions
    processQuery,
    cancelQuery,
    clearError,
    resetMetrics,
    cleanup,

    // Computed values
    hasError: error !== null,
    successRate: metrics.queryCount > 0 ? metrics.successCount / metrics.queryCount : 0,
    errorRate: metrics.queryCount > 0 ? metrics.errorCount / metrics.queryCount : 0,
    canRetry: error !== null && !isProcessing,
    
    // Configuration
    isUsingMock: enableMock
  };
}