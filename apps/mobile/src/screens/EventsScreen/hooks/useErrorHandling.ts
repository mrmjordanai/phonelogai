import { useState, useCallback, useRef } from 'react';

export interface ErrorInfo {
  id: string;
  message: string;
  code?: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  retryable?: boolean;
  userFriendly?: boolean;
}

interface UseErrorHandlingProps {
  onError?: (_error: ErrorInfo) => void;
  maxRetries?: number;
  retryDelay?: number;
}

interface RetryableOperation<T> {
  operation: () => Promise<T>;
  context?: Record<string, unknown>;
  maxRetries?: number;
  retryDelay?: number;
}

export function useErrorHandling({
  onError,
  maxRetries = 3,
  retryDelay = 1000
}: UseErrorHandlingProps = {}) {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryAttempts = useRef(new Map<string, number>());

  // Convert raw error to ErrorInfo
  const normalizeError = useCallback((error: unknown, context?: Record<string, unknown>): ErrorInfo => {
    const id = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Handle different error types
    if (error instanceof Error) {
      return {
        id,
        message: error.message,
        code: error.name,
        timestamp: new Date(),
        context,
        retryable: isRetryableError(error),
        userFriendly: getUserFriendlyMessage(error) !== error.message,
      };
    }
    
    if (typeof error === 'string') {
      return {
        id,
        message: error,
        timestamp: new Date(),
        context,
        retryable: true,
        userFriendly: true,
      };
    }
    
    if (error && typeof error === 'object' && 'message' in error) {
      const errorObj = error as { 
        message: string; 
        code?: string | number; 
        status?: number; 
        [key: string]: unknown; 
      };
      return {
        id,
        message: errorObj.message,
        code: errorObj.code?.toString() || errorObj.status?.toString(),
        timestamp: new Date(),
        context: { ...context, originalError: error },
        retryable: isRetryableError(error),
        userFriendly: getUserFriendlyMessage(error) !== errorObj.message,
      };
    }
    
    return {
      id,
      message: 'An unexpected error occurred',
      timestamp: new Date(),
      context: { ...context, originalError: error },
      retryable: true,
      userFriendly: true,
    };
  }, []);

  // Check if error is retryable
  const isRetryableError = useCallback((error: unknown): boolean => {
    const errorObj = error as { 
      code?: string | number; 
      message?: string; 
      status?: number; 
      [key: string]: unknown; 
    };
    
    // Network errors are usually retryable
    if (errorObj?.code === 'NETWORK_ERROR' || errorObj?.message?.includes('network')) {
      return true;
    }
    
    // Timeout errors are retryable
    if (errorObj?.code === 'TIMEOUT' || errorObj?.message?.includes('timeout')) {
      return true;
    }
    
    // 5xx server errors are retryable
    if (errorObj?.status && typeof errorObj.status === 'number' && errorObj.status >= 500 && errorObj.status < 600) {
      return true;
    }
    
    // Rate limiting is retryable
    if (errorObj?.status === 429) {
      return true;
    }
    
    // Some specific error types
    const retryableErrors = [
      'Failed to fetch',
      'Load failed',
      'Connection refused',
      'Service unavailable',
    ];
    
    return retryableErrors.some(msg => 
      errorObj?.message?.toLowerCase().includes(msg.toLowerCase())
    );
  }, []);

  // Get user-friendly error message
  const getUserFriendlyMessage = useCallback((error: unknown): string => {
    const errorObj = error as { message?: string; [key: string]: unknown };
    const message = errorObj?.message || error;
    
    // Network errors
    if (typeof message === 'string' && (message.includes('network') || message.includes('fetch'))) {
      return 'Please check your internet connection and try again.';
    }
    
    // Timeout errors
    if (typeof message === 'string' && message.includes('timeout')) {
      return 'The request took too long. Please try again.';
    }
    
    // Server errors
    if (errorObj?.status && typeof errorObj.status === 'number' && errorObj.status >= 500) {
      return 'Our servers are experiencing issues. Please try again in a moment.';
    }
    
    // Rate limiting
    if (errorObj?.status === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    
    // Permission errors
    if (errorObj?.status === 403 || (typeof message === 'string' && message.includes('permission'))) {
      return 'You don\'t have permission to perform this action.';
    }
    
    // Not found errors
    if (errorObj?.status === 404) {
      return 'The requested information could not be found.';
    }
    
    // Default to original message if it's user-friendly
    if (typeof message === 'string' && message.length < 100 && !message.includes('Error:')) {
      return message;
    }
    
    return 'Something went wrong. Please try again.';
  }, []);

  // Add error to the list
  const addError = useCallback((error: unknown, context?: Record<string, unknown>) => {
    const errorInfo = normalizeError(error, context);
    
    setErrors(prev => {
      // Avoid duplicate errors (same message within 5 seconds)
      const isDuplicate = prev.some(e => 
        e.message === errorInfo.message && 
        Date.now() - e.timestamp.getTime() < 5000
      );
      
      if (isDuplicate) return prev;
      
      // Keep only the last 10 errors
      const newErrors = [errorInfo, ...prev].slice(0, 10);
      return newErrors;
    });
    
    onError?.(errorInfo);
    
    if (__DEV__) {
      console.error('EventsScreen Error:', errorInfo);
    }
    
    return errorInfo;
  }, [normalizeError, onError]);

  // Remove error from the list
  const removeError = useCallback((errorId: string) => {
    setErrors(prev => prev.filter(error => error.id !== errorId));
    retryAttempts.current.delete(errorId);
  }, []);

  // Clear all errors
  const clearErrors = useCallback(() => {
    setErrors([]);
    retryAttempts.current.clear();
  }, []);

  // Retry an operation with exponential backoff
  const retryOperation = useCallback(async <T>({
    operation,
    context,
    maxRetries: operationMaxRetries = maxRetries,
    retryDelay: operationRetryDelay = retryDelay
  }: RetryableOperation<T>): Promise<T> => {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= operationMaxRetries; attempt++) {
      try {
        if (attempt > 1) {
          setIsRetrying(true);
          
          // Exponential backoff with jitter
          const delay = operationRetryDelay * Math.pow(2, attempt - 2);
          const jitter = Math.random() * 0.1 * delay;
          await new Promise(resolve => setTimeout(resolve, delay + jitter));
        }
        
        const result = await operation();
        
        if (attempt > 1) {
          setIsRetrying(false);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        const errorInfo = normalizeError(error, {
          ...context,
          attempt,
          maxRetries: operationMaxRetries,
          operationId
        });
        
        // Only add error on final attempt or if not retryable
        if (attempt === operationMaxRetries || !errorInfo.retryable) {
          addError(error, context);
          setIsRetrying(false);
          throw error;
        }
        
        if (__DEV__) {
          console.warn(`EventsScreen Retry ${attempt}/${operationMaxRetries}:`, errorInfo);
        }
      }
    }
    
    setIsRetrying(false);
    throw lastError;
  }, [maxRetries, retryDelay, normalizeError, addError]);

  // Handle async operation with error handling
  const handleAsyncOperation = useCallback(async <T>(
    operation: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T | null> => {
    try {
      return await operation();
    } catch (error) {
      addError(error, context);
      return null;
    }
  }, [addError]);

  // Get user-friendly error message by ID
  const getErrorMessage = useCallback((errorId: string): string => {
    const error = errors.find(e => e.id === errorId);
    if (!error) return 'Unknown error';
    
    return getUserFriendlyMessage(error);
  }, [errors, getUserFriendlyMessage]);

  // Get latest error
  const latestError = errors[0] || null;

  // Get retryable errors
  const retryableErrors = errors.filter(error => error.retryable);

  return {
    errors,
    latestError,
    retryableErrors,
    isRetrying,
    
    // Actions
    addError,
    removeError,
    clearErrors,
    retryOperation,
    handleAsyncOperation,
    getErrorMessage,
    getUserFriendlyMessage,
    
    // Helpers
    hasErrors: errors.length > 0,
    hasRetryableErrors: retryableErrors.length > 0,
  };
}