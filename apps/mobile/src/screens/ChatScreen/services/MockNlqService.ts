/**
 * Mock NLQ Service
 * Provides realistic mock responses for natural language queries during development
 */

import { 
  NlqApiResponse, 
  QueryResult, 
  QuerySuggestion, 
  TableResult, 
  ChartResult, 
  ListResult 
} from '../types';

class MockNlqService {
  private static instance: MockNlqService;

  public static getInstance(): MockNlqService {
    if (!MockNlqService.instance) {
      MockNlqService.instance = new MockNlqService();
    }
    return MockNlqService.instance;
  }

  private mockDelay = (min = 800, max = 2000) => 
    new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

  private queryPatterns = [
    {
      patterns: ['top contacts', 'most called', 'frequent contacts', 'call frequency'],
      handler: this.getTopContacts.bind(this)
    },
    {
      patterns: ['sms count', 'messages', 'text messages', 'sms sent'],
      handler: this.getSmsStats.bind(this)
    },
    {
      patterns: ['weekend calls', 'weekend', 'saturday', 'sunday'],
      handler: this.getWeekendCalls.bind(this)
    },
    {
      patterns: ['long calls', 'calls longer', 'duration', 'call time'],
      handler: this.getLongCalls.bind(this)
    },
    {
      patterns: ['missed calls', 'missed', 'unanswered', 'unknown numbers'],
      handler: this.getMissedCalls.bind(this)
    },
    {
      patterns: ['call analytics', 'stats', 'statistics', 'overview'],
      handler: this.getCallAnalytics.bind(this)
    },
    {
      patterns: ['recent calls', 'today', 'this week', 'yesterday'],
      handler: this.getRecentCalls.bind(this)
    }
  ];

  public async processQuery(query: string): Promise<NlqApiResponse> {
    await this.mockDelay();

    const queryLower = query.toLowerCase();
    
    // Find matching pattern
    const matchedPattern = this.queryPatterns.find(pattern =>
      pattern.patterns.some(p => queryLower.includes(p))
    );

    if (matchedPattern) {
      try {
        const result = await matchedPattern.handler(query);
        return {
          success: true,
          data: {
            result,
            explanation: this.generateExplanation(query, result),
            sqlQuery: this.generateMockSql(query),
            executionTime: Math.random() * 1000 + 200
          }
        };
      } catch {
        return this.createErrorResponse('parsing_error', 'Failed to process query');
      }
    }

    // Handle unknown queries
    if (Math.random() < 0.1) { // 10% chance of error for realism
      return this.createErrorResponse('invalid_query', 'I couldn\'t understand that query. Try asking about calls, messages, or contacts.');
    }

    const result = await this.getGenericResponse(query);
    return {
      success: true,
      data: {
        result,
        explanation: 'I processed your query but couldn\'t find specific patterns to match.',
        sqlQuery: 'SELECT * FROM events LIMIT 10',
        executionTime: Math.random() * 500 + 100
      }
    };
  }

  private async getTopContacts(query: string): Promise<QueryResult> {
    const isTable = query.includes('show') || query.includes('list');
    
    if (isTable) {
      const tableResult: TableResult = {
        columns: [
          { key: 'contact', title: 'Contact', dataType: 'text' },
          { key: 'calls', title: 'Total Calls', dataType: 'number' },
          { key: 'duration', title: 'Total Duration', dataType: 'duration' },
          { key: 'lastCall', title: 'Last Call', dataType: 'date' }
        ],
        rows: [
          { contact: 'John Smith', calls: 45, duration: '2h 15m', lastCall: '2 hours ago' },
          { contact: 'Sarah Johnson', calls: 38, duration: '1h 52m', lastCall: '1 day ago' },
          { contact: 'Mike Wilson', calls: 31, duration: '1h 23m', lastCall: '3 days ago' },
          { contact: 'Emily Brown', calls: 28, duration: '1h 8m', lastCall: '5 days ago' },
          { contact: 'David Lee', calls: 24, duration: '56m', lastCall: '1 week ago' }
        ]
      };

      return {
        type: 'table',
        data: tableResult,
        metadata: {
          rowCount: 5,
          executionTime: 340,
          queryType: 'contact_frequency',
          exportable: true
        }
      };
    } else {
      const chartResult: ChartResult = {
        chartType: 'bar',
        title: 'Top Contacts by Call Frequency',
        xAxis: 'Contacts',
        yAxis: 'Number of Calls',
        data: [
          { label: 'John Smith', value: 45, color: '#3B82F6' },
          { label: 'Sarah Johnson', value: 38, color: '#10B981' },
          { label: 'Mike Wilson', value: 31, color: '#F59E0B' },
          { label: 'Emily Brown', value: 28, color: '#EF4444' },
          { label: 'David Lee', value: 24, color: '#8B5CF6' }
        ]
      };

      return {
        type: 'chart',
        data: chartResult,
        metadata: {
          rowCount: 5,
          queryType: 'contact_frequency_chart'
        }
      };
    }
  }

  private async getSmsStats(_query: string): Promise<QueryResult> {
    return {
      type: 'text',
      data: 'You sent 234 SMS messages last month, with an average of 7.8 messages per day. Your most active messaging day was Friday with 18 messages sent.',
      metadata: {
        queryType: 'sms_statistics',
        executionTime: 220
      }
    };
  }

  private async getWeekendCalls(_query: string): Promise<QueryResult> {
    const listResult: ListResult = {
      items: [
        { 
          id: '1', 
          primary: 'Sarah Johnson', 
          secondary: '3 calls, 45 minutes total',
          metadata: { calls: 3, duration: 2700 }
        },
        { 
          id: '2', 
          primary: 'Mike Wilson', 
          secondary: '2 calls, 23 minutes total',
          metadata: { calls: 2, duration: 1380 }
        },
        { 
          id: '3', 
          primary: 'John Smith', 
          secondary: '2 calls, 18 minutes total',
          metadata: { calls: 2, duration: 1080 }
        }
      ]
    };

    return {
      type: 'list',
      data: listResult,
      metadata: {
        rowCount: 3,
        queryType: 'weekend_calls',
        executionTime: 190
      }
    };
  }

  private async getLongCalls(_query: string): Promise<QueryResult> {
    const tableResult: TableResult = {
      columns: [
        { key: 'contact', title: 'Contact', dataType: 'text' },
        { key: 'duration', title: 'Duration', dataType: 'duration' },
        { key: 'date', title: 'Date', dataType: 'date' },
        { key: 'direction', title: 'Direction', dataType: 'text' }
      ],
      rows: [
        { contact: 'John Smith', duration: '25m 14s', date: 'Today, 2:30 PM', direction: 'Outgoing' },
        { contact: 'Sarah Johnson', duration: '18m 42s', date: 'Yesterday, 11:15 AM', direction: 'Incoming' },
        { contact: 'Mike Wilson', duration: '15m 08s', date: '2 days ago, 4:45 PM', direction: 'Outgoing' },
        { contact: 'Emily Brown', duration: '12m 33s', date: '3 days ago, 9:20 AM', direction: 'Incoming' }
      ]
    };

    return {
      type: 'table',
      data: tableResult,
      metadata: {
        rowCount: 4,
        queryType: 'long_calls',
        exportable: true
      }
    };
  }

  private async getMissedCalls(_query: string): Promise<QueryResult> {
    return {
      type: 'text',
      data: 'You have 7 missed calls from unknown numbers this week. The most recent was from +1-555-0123 at 3:45 PM today.',
      metadata: {
        queryType: 'missed_calls',
        executionTime: 160
      }
    };
  }

  private async getCallAnalytics(_query: string): Promise<QueryResult> {
    const chartResult: ChartResult = {
      chartType: 'pie',
      title: 'Call Distribution by Type',
      data: [
        { label: 'Outgoing', value: 156, color: '#3B82F6' },
        { label: 'Incoming', value: 142, color: '#10B981' },
        { label: 'Missed', value: 23, color: '#EF4444' }
      ]
    };

    return {
      type: 'chart',
      data: chartResult,
      metadata: {
        queryType: 'call_analytics'
      }
    };
  }

  private async getRecentCalls(_query: string): Promise<QueryResult> {
    const listResult: ListResult = {
      items: [
        { 
          id: '1', 
          primary: 'John Smith', 
          secondary: 'Outgoing • 2:30 PM • 5m 23s',
          metadata: { direction: 'outgoing', duration: 323 }
        },
        { 
          id: '2', 
          primary: 'Sarah Johnson', 
          secondary: 'Incoming • 1:45 PM • 12m 18s',
          metadata: { direction: 'incoming', duration: 738 }
        },
        { 
          id: '3', 
          primary: '+1-555-0198', 
          secondary: 'Missed • 12:30 PM',
          metadata: { direction: 'missed', duration: 0 }
        },
        { 
          id: '4', 
          primary: 'Mike Wilson', 
          secondary: 'Outgoing • 11:15 AM • 3m 45s',
          metadata: { direction: 'outgoing', duration: 225 }
        }
      ]
    };

    return {
      type: 'list',
      data: listResult,
      metadata: {
        rowCount: 4,
        queryType: 'recent_calls'
      }
    };
  }

  private async getGenericResponse(_query: string): Promise<QueryResult> {
    const responses = [
      'I found some relevant information, but could you be more specific about what you\'re looking for?',
      'Your query returned no results. Try asking about calls, messages, or specific contacts.',
      'I can help you analyze your call and message data. Try asking about call frequency, message counts, or contact statistics.'
    ];

    return {
      type: 'text',
      data: responses[Math.floor(Math.random() * responses.length)],
      metadata: {
        queryType: 'generic_response'
      }
    };
  }

  private generateExplanation(_query: string, result: QueryResult): string {
    const explanations = {
      contact_frequency: 'I analyzed your call logs and ranked contacts by the number of calls made and received.',
      sms_statistics: 'I counted all SMS messages in your specified time period and calculated daily averages.',
      weekend_calls: 'I filtered your call logs for Saturday and Sunday calls and summarized by contact.',
      long_calls: 'I found all calls longer than 10 minutes and sorted by duration.',
      missed_calls: 'I searched for unanswered incoming calls, focusing on unknown numbers.',
      call_analytics: 'I analyzed your call patterns and created a breakdown by call type.',
      recent_calls: 'I retrieved your most recent call activity sorted by timestamp.'
    };

    return explanations[result.metadata?.queryType as keyof typeof explanations] || 
           'I processed your query and found the most relevant information from your data.';
  }

  private generateMockSql(_query: string): string {
    const sqlQueries = [
      'SELECT contact_name, COUNT(*) as call_count, SUM(duration) as total_duration FROM events WHERE event_type = \'call\' GROUP BY contact_name ORDER BY call_count DESC LIMIT 5',
      'SELECT COUNT(*) as sms_count, AVG(daily_count) as avg_daily FROM (SELECT DATE(timestamp) as date, COUNT(*) as daily_count FROM events WHERE event_type = \'sms\' GROUP BY DATE(timestamp))',
      'SELECT contact_name, COUNT(*) as weekend_calls FROM events WHERE event_type = \'call\' AND DAYOFWEEK(timestamp) IN (1,7) GROUP BY contact_name',
      'SELECT contact_name, duration, timestamp, direction FROM events WHERE event_type = \'call\' AND duration > 600 ORDER BY duration DESC'
    ];

    return sqlQueries[Math.floor(Math.random() * sqlQueries.length)];
  }

  private createErrorResponse(code: string, message: string): NlqApiResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details: 'This is a mock error for development purposes'
      }
    };
  }

  public getSuggestions(_context?: string): QuerySuggestion[] {
    return [
      {
        id: '1',
        title: 'Top Contacts',
        description: 'Show your most frequently called contacts',
        query: 'Show me my top 5 contacts by call frequency',
        category: 'calls',
        icon: 'phone',
        popularity: 95
      },
      {
        id: '2',
        title: 'Message Count',
        description: 'How many messages you sent this month',
        query: 'How many SMS messages did I send last month?',
        category: 'sms',
        icon: 'message-circle',
        popularity: 80
      },
      {
        id: '3',
        title: 'Weekend Activity',
        description: 'See who calls you on weekends',
        query: 'Who called me most on weekends?',
        category: 'analytics',
        icon: 'calendar',
        popularity: 60
      },
      {
        id: '4',
        title: 'Long Calls',
        description: 'Find your longest conversations',
        query: 'Show calls longer than 10 minutes from this week',
        category: 'calls',
        icon: 'clock',
        popularity: 75
      },
      {
        id: '5',
        title: 'Missed Calls',
        description: 'Check for missed calls from unknown numbers',
        query: 'Find all missed calls from unknown numbers',
        category: 'calls',
        icon: 'phone-missed',
        popularity: 85
      },
      {
        id: '6',
        title: 'Recent Activity',
        description: 'Your latest calls and messages',
        query: 'Show me my recent calls from today',
        category: 'recent',
        icon: 'activity',
        popularity: 90
      }
    ];
  }
}

export default MockNlqService;