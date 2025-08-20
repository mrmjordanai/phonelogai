# Chat/NLQ Screen Implementation

A comprehensive Chat/Natural Language Query interface for the PhoneLog AI mobile app, enabling users to analyze their communication data using conversational AI.

## Features

### 🤖 AI-Powered Query Processing
- **Natural Language Understanding**: Process complex queries like "Show me my top 5 contacts by call frequency"
- **Multiple Response Types**: Text, tables, charts, and lists
- **Smart Explanations**: AI explains how it processed each query
- **Mock Service**: Realistic responses during development

### 💬 Modern Chat Interface
- **Message Bubbles**: Distinct styling for user, assistant, system, and error messages
- **Real-time Status**: Sending, sent, delivered, and error states
- **Typing Indicators**: Visual feedback during query processing
- **Message Actions**: Share, export, and retry functionality

### 🎯 Smart Suggestions
- **Context-Aware**: Suggestions based on time of day, history, and user patterns
- **Categorized**: Organized by calls, SMS, contacts, analytics, and recent queries
- **Personalized**: Learns from user behavior and query history
- **Dynamic**: Updates based on user activity and preferences

### 💾 Persistent History
- **AsyncStorage**: Chat history persists across app restarts
- **Search & Export**: Find past conversations and export data
- **Statistics**: Track usage patterns and query success rates
- **Configurable**: Adjustable history limits and retention policies

### 🎨 Enhanced UX
- **Keyboard Handling**: Smooth keyboard interactions with proper avoiding
- **Accessibility**: Full VoiceOver/TalkBack support
- **Performance**: Virtualized message lists for smooth scrolling
- **Error Handling**: Graceful error recovery with retry options

## Architecture

### Components
```
ChatScreen/
├── components/
│   ├── ChatMessage.tsx      # Individual message bubbles
│   ├── QueryInput.tsx       # Input field with send button
│   ├── ResultsDisplay.tsx   # Data visualization (tables, charts)
│   ├── QuerySuggestions.tsx # Smart query suggestions
│   ├── EmptyState.tsx       # Welcome screen
│   ├── ChatList.tsx         # Virtualized message list
│   └── index.ts
├── hooks/
│   ├── useChat.ts           # Main chat state management
│   ├── useNlqQuery.ts       # NLQ API integration
│   ├── useChatHistory.ts    # Persistent history
│   ├── useQuerySuggestions.ts # Dynamic suggestions
│   └── index.ts
├── services/
│   └── MockNlqService.ts    # Mock API responses
├── ChatScreen.tsx           # Basic implementation
├── EnhancedChatScreen.tsx   # Production version
├── types.ts                 # TypeScript definitions
└── index.ts
```

### Key Patterns
- **Hooks-based Architecture**: All business logic in reusable hooks
- **Component Composition**: Small, focused components
- **Type Safety**: Comprehensive TypeScript definitions
- **Error Boundaries**: Graceful error handling throughout
- **Performance**: Virtualization and memoization optimizations

## Usage

### Basic Implementation
```typescript
import { ChatScreen } from './screens/ChatScreen';

// Simple usage
<ChatScreen />
```

### Enhanced Implementation
```typescript
import { EnhancedChatScreen } from './screens/ChatScreen';

// Advanced usage with custom configuration
<EnhancedChatScreen
  enableSuggestions={true}
  enableHistory={true}
  enableAnalytics={true}
  maxHistoryItems={500}
  onAnalyticsUpdate={(analytics) => console.log(analytics)}
/>
```

### Using Individual Components
```typescript
import { 
  useChat, 
  ChatMessage, 
  QueryInput, 
  ResultsDisplay 
} from './screens/ChatScreen';

function CustomChatInterface() {
  const { messages, sendMessage, isLoading } = useChat();
  
  return (
    <View>
      {messages.map(message => 
        <ChatMessage key={message.id} message={message} />
      )}
      <QueryInput onSendMessage={sendMessage} isLoading={isLoading} />
    </View>
  );
}
```

## Sample Queries

The interface supports various types of natural language queries:

### Call Analysis
- "Show me my top 5 contacts by call frequency"
- "Who called me most on weekends?"
- "Show calls longer than 10 minutes from this week"
- "Find all missed calls from unknown numbers"

### Message Statistics
- "How many SMS messages did I send last month?"
- "What's my average daily message count?"
- "Show my messaging activity by day of week"

### Contact Insights
- "Which contacts do I call but never text?"
- "Show my most frequent contacts this month"
- "Who are my top 10 contacts by total communication?"

### Analytics
- "Show my call duration trends over time"
- "What's my busiest calling day of the week?"
- "Compare my calling patterns to last month"

## Configuration

### Environment Variables
```bash
# Optional: API endpoint for real NLQ service
EXPO_PUBLIC_NLQ_API_URL=https://api.phonelogai.com/nlq

# Optional: API key for NLQ service
EXPO_PUBLIC_NLQ_API_KEY=your_api_key_here
```

### Chat Configuration
```typescript
interface ChatConfig {
  enableSuggestions?: boolean;    // Show smart suggestions
  enableHistory?: boolean;        // Persist chat history
  enableAnalytics?: boolean;      // Track usage analytics
  maxHistoryItems?: number;       // History retention limit
  maxMessages?: number;           // In-memory message limit
}
```

### Customization
```typescript
// Custom suggestion provider
const customSuggestions = [
  {
    id: 'custom-1',
    title: 'Daily Summary',
    description: 'Get your daily communication summary',
    query: 'Show me my activity for today',
    category: 'analytics'
  }
];

// Custom theme
const customTheme = {
  userBubbleColor: '#007AFF',
  assistantBubbleColor: '#F2F2F7',
  backgroundColor: '#FFFFFF',
  // ... other theme options
};
```

## Performance

### Optimizations
- **Virtualized Lists**: FlatList with performance optimizations
- **Memoized Components**: React.memo for expensive renders
- **Efficient Updates**: Selective re-renders with proper dependencies
- **Memory Management**: Automatic cleanup and garbage collection

### Metrics
- **Target Response Time**: <3s for typical queries
- **Memory Usage**: <50MB for 100+ messages
- **Scroll Performance**: 60fps with 1000+ messages
- **Startup Time**: <1s to first render

## Future Enhancements

### Voice Integration
- **Speech-to-Text**: Voice query input
- **Text-to-Speech**: Audio responses
- **Voice Commands**: Hands-free navigation

### Advanced Analytics
- **Usage Patterns**: Deep insights into query patterns
- **Performance Metrics**: Response time optimization
- **User Behavior**: Predictive query suggestions

### Data Export
- **Multiple Formats**: CSV, JSON, PDF exports
- **Cloud Integration**: Sync with cloud storage
- **Sharing**: Direct sharing to other apps

### Real-time Features
- **Live Updates**: Real-time data synchronization
- **Collaborative**: Multi-user chat sessions
- **Notifications**: Query result notifications

## Testing

Run the test suite:
```bash
cd apps/mobile
npm test ChatScreen
```

Test with mock data:
```bash
# Enable mock service (default in development)
EXPO_PUBLIC_ENABLE_MOCK_NLQ=true npm run dev
```

## API Integration

To integrate with a real NLQ backend, implement the `NlqApiResponse` interface:

```typescript
// Replace MockNlqService with real implementation
const nlqService = new RealNlqService({
  apiUrl: process.env.EXPO_PUBLIC_NLQ_API_URL,
  apiKey: process.env.EXPO_PUBLIC_NLQ_API_KEY
});
```

The interface is designed to seamlessly switch between mock and real implementations.