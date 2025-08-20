/**
 * ChatScreen Module
 * Export main components and types for the Chat/NLQ interface
 */

export { ChatScreen } from './ChatScreen';
export { EnhancedChatScreen } from './EnhancedChatScreen';
export { 
  ChatMessage as ChatMessageComponent,
  QueryInput,
  ResultsDisplay,
  QuerySuggestions,
  EmptyState,
  ChatList
} from './components';
export * from './hooks';
export * from './types';
export { default as MockNlqService } from './services/MockNlqService';