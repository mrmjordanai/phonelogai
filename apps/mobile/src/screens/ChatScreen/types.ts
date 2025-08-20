/**
 * Chat/NLQ Screen Types
 * TypeScript definitions for natural language query interface
 */

export type MessageType = 'user' | 'assistant' | 'system' | 'error';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'error';

export interface ChatMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  status?: MessageStatus;
  queryResult?: QueryResult;
  error?: string;
}

export interface QueryResult {
  type: 'text' | 'table' | 'chart' | 'list';
  data: unknown;
  metadata?: {
    rowCount?: number;
    executionTime?: number;
    queryType?: string;
    exportable?: boolean;
  };
}

export interface TableResult {
  columns: Array<{
    key: string;
    title: string;
    dataType: 'text' | 'number' | 'date' | 'duration';
  }>;
  rows: Record<string, unknown>[];
}

export interface ChartResult {
  chartType: 'bar' | 'line' | 'pie' | 'area';
  data: Array<{
    label: string;
    value: number;
    color?: string;
  }>;
  title?: string;
  xAxis?: string;
  yAxis?: string;
}

export interface ListResult {
  items: Array<{
    id: string;
    primary: string;
    secondary?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface NlqQuery {
  id: string;
  query: string;
  timestamp: Date;
  userId: string;
}

export interface NlqResponse {
  id: string;
  queryId: string;
  result: QueryResult;
  explanation?: string;
  sqlQuery?: string;
  executionTime: number;
  timestamp: Date;
  error?: string;
}

export interface QuerySuggestion {
  id: string;
  title: string;
  description: string;
  query: string;
  category: 'calls' | 'sms' | 'contacts' | 'analytics' | 'recent';
  icon?: string;
  popularity?: number;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  lastQueryId: string | null;
}

export interface ChatHistoryItem {
  id: string;
  query: string;
  response: string;
  timestamp: Date;
  queryResult?: QueryResult;
}

export interface NlqApiRequest {
  query: string;
  userId: string;
  context?: {
    previousQueries?: string[];
    dateRange?: {
      startDate: string;
      endDate: string;
    };
    filters?: Record<string, unknown>;
  };
}

export interface NlqApiResponse {
  success: boolean;
  data?: {
    result: QueryResult;
    explanation?: string;
    sqlQuery?: string;
    executionTime: number;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ChatInputProps {
  onSendMessage: (_message: string) => void;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export interface ChatMessageProps {
  message: ChatMessage;
  onRetry?: () => void;
  onExport?: (_data: unknown) => void;
}

export interface QuerySuggestionsProps {
  suggestions: QuerySuggestion[];
  onSelectSuggestion: (_query: string) => void;
  visible: boolean;
}

export interface ResultsDisplayProps {
  result: QueryResult;
  onExport?: (_data: unknown, _format: 'csv' | 'json') => void;
}

// Mock data types for development
export interface MockNlqService {
  processQuery: (_query: string) => Promise<NlqApiResponse>;
  getSuggestions: (_context?: string) => QuerySuggestion[];
}

// Error types
export type ChatError = 
  | 'network_error'
  | 'parsing_error'
  | 'query_timeout'
  | 'invalid_query'
  | 'service_unavailable';

export interface ChatErrorInfo {
  type: ChatError;
  message: string;
  retryable: boolean;
  details?: unknown;
}

// Analytics types
export interface ChatAnalytics {
  sessionId: string;
  queriesCount: number;
  successfulQueries: number;
  averageResponseTime: number;
  popularQueries: string[];
  errorRate: number;
}

// Export types
export interface ExportOptions {
  format: 'csv' | 'json' | 'txt';
  includeMetadata: boolean;
  filename?: string;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}