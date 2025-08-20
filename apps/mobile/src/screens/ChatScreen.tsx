/**
 * Main ChatScreen Export
 * Uses the production-ready EnhancedChatScreen implementation
 */

import React from 'react';
import { EnhancedChatScreen } from './ChatScreen/EnhancedChatScreen';

export function ChatScreen() {
  return (
    <EnhancedChatScreen
      enableSuggestions={true}
      enableHistory={true}
      enableAnalytics={true}
      maxHistoryItems={500}
    />
  );
}