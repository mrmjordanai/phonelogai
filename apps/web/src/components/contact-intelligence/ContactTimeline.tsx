import React, { useState, useMemo } from 'react';
import { Event } from '@phonelogai/types';

interface ContactTimelineProps {
  events: Event[];
  contactId: string;
  className?: string;
}

interface TimelineFilters {
  eventType: 'all' | 'calls' | 'sms';
  timeRange: 'all' | '7d' | '30d' | '90d';
  direction: 'all' | 'inbound' | 'outbound';
}

export function ContactTimeline({ 
  events, 
  contactId, 
  className = '' 
}: ContactTimelineProps) {
  const [filters, setFilters] = useState<TimelineFilters>({
    eventType: 'all',
    timeRange: '30d',
    direction: 'all'
  });

  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    // Filter by event type
    if (filters.eventType !== 'all') {
      filtered = filtered.filter(event => 
        filters.eventType === 'calls' ? event.type === 'call' : event.type === 'sms'
      );
    }

    // Filter by direction
    if (filters.direction !== 'all') {
      filtered = filtered.filter(event => event.direction === filters.direction);
    }

    // Filter by time range
    if (filters.timeRange !== 'all') {
      const now = new Date();
      const daysBack = {
        '7d': 7,
        '30d': 30,
        '90d': 90
      }[filters.timeRange];

      const cutoffDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
      filtered = filtered.filter(event => new Date(event.ts) >= cutoffDate);
    }

    // Sort by timestamp descending (most recent first)
    return filtered.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [events, filters]);

  const groupedEvents = useMemo(() => {
    const groups: { [date: string]: Event[] } = {};
    
    filteredEvents.forEach(event => {
      const date = new Date(event.ts).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(event);
    });

    return groups;
  }, [filteredEvents]);

  return (
    <div className={`h-full flex flex-col bg-gray-50 ${className}`}>
      {/* Filters */}
      <div className="bg-white p-4 border-b border-gray-200">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filters.eventType}
              onChange={(e) => setFilters(prev => ({ ...prev, eventType: e.target.value as any }))}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Events</option>
              <option value="calls">Calls Only</option>
              <option value="sms">SMS Only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Direction</label>
            <select
              value={filters.direction}
              onChange={(e) => setFilters(prev => ({ ...prev, direction: e.target.value as any }))}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Time Range</label>
            <select
              value={filters.timeRange}
              onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as any }))}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          <div className="flex items-end">
            <div className="text-sm text-gray-600">
              {filteredEvents.length} events
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-auto p-4">
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-lg font-medium">No events found</p>
            <p className="text-sm">Try adjusting your filters to see more events</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([date, dayEvents]) => (
              <div key={date}>
                {/* Date Header */}
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-medium text-gray-900">
                      {formatDateHeader(date)}
                    </h3>
                  </div>
                </div>

                {/* Events for this date */}
                <div className="ml-6 space-y-3">
                  {dayEvents.map((event) => (
                    <TimelineEvent
                      key={event.id}
                      event={event}
                      isExpanded={expandedEvent === event.id}
                      onToggleExpanded={() => 
                        setExpandedEvent(expandedEvent === event.id ? null : event.id)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TimelineEventProps {
  event: Event;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}

function TimelineEvent({ event, isExpanded, onToggleExpanded }: TimelineEventProps) {
  const eventTime = new Date(event.ts);
  
  const getEventIcon = () => {
    if (event.type === 'call') {
      return event.direction === 'inbound' ? (
        <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ) : (
        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3l4 4-4 4M20 7H8a4 4 0 000 8h12" />
        </svg>
      );
    } else {
      return event.direction === 'inbound' ? (
        <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10m0 0V18a2 2 0 01-2 2H9a2 2 0 01-2-2V8m8 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m8 0H7" />
        </svg>
      ) : (
        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      );
    }
  };

  const getStatusColor = () => {
    if (event.type === 'call') {
      if (event.status === 'answered') return 'text-green-600 bg-green-100';
      if (event.status === 'missed') return 'text-red-600 bg-red-100';
      return 'text-gray-600 bg-gray-100';
    }
    return 'text-blue-600 bg-blue-100';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50"
        onClick={onToggleExpanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getEventIcon()}
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-900">
                  {event.type === 'call' ? 'Phone Call' : 'Text Message'}
                </span>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor()}`}>
                  {event.direction === 'inbound' ? 'Received' : 'Sent'}
                  {event.type === 'call' && event.status && ` · ${event.status}`}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                {eventTime.toLocaleTimeString()}
                {event.type === 'call' && event.duration && (
                  <span> · {formatDuration(event.duration)}</span>
                )}
              </div>
            </div>
          </div>
          
          <button className="text-gray-400 hover:text-gray-600">
            <svg 
              className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Preview content when not expanded */}
        {!isExpanded && event.content && event.type === 'sms' && (
          <div className="mt-2 text-sm text-gray-600 line-clamp-2">
            {event.content}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="mt-3 space-y-2">
            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Event ID:</span>
                <span className="ml-2 text-gray-600 font-mono text-xs">{event.id}</span>
              </div>
              {event.line_id && (
                <div>
                  <span className="font-medium text-gray-700">Line:</span>
                  <span className="ml-2 text-gray-600">{event.line_id}</span>
                </div>
              )}
              {event.type === 'call' && event.duration !== undefined && (
                <div>
                  <span className="font-medium text-gray-700">Duration:</span>
                  <span className="ml-2 text-gray-600">{formatDuration(event.duration)}</span>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-700">Source:</span>
                <span className="ml-2 text-gray-600 capitalize">{event.source || 'Unknown'}</span>
              </div>
            </div>

            {/* Content for SMS */}
            {event.content && event.type === 'sms' && (
              <div className="mt-3">
                <span className="text-sm font-medium text-gray-700">Message:</span>
                <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm text-gray-800">
                  {event.content}
                </div>
              </div>
            )}

            {/* Call notes or additional info */}
            {event.type === 'call' && event.status && (
              <div className="mt-3">
                <span className="text-sm font-medium text-gray-700">Call Status:</span>
                <span className="ml-2 text-sm text-gray-600 capitalize">{event.status}</span>
              </div>
            )}

            {/* Timestamp */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Full timestamp: {eventTime.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions
function formatDateHeader(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m`;
}