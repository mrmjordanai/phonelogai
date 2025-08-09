import React, { useState } from 'react';
import { useContactIntelligence, useContactPatterns } from '@phonelogai/shared/hooks/useContactIntelligence';
import { ContactMetrics } from './ContactMetrics';
import { ContactTimeline } from './ContactTimeline';
import { ContactActions } from './ContactActions';

interface ContactProfileProps {
  contactId: string;
  onUpdate: () => void;
  onDelete: () => void;
  className?: string;
}

export function ContactProfile({ 
  contactId, 
  onUpdate, 
  onDelete, 
  className = '' 
}: ContactProfileProps) {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'patterns' | 'timeline'>('overview');
  
  const { 
    data: intelligence, 
    isLoading: intelligenceLoading, 
    error: intelligenceError 
  } = useContactIntelligence(contactId);

  const { 
    data: patterns, 
    isLoading: patternsLoading, 
    error: patternsError 
  } = useContactPatterns(contactId, 90);

  if (intelligenceLoading) {
    return <ContactProfileSkeleton />;
  }

  if (intelligenceError || !intelligence) {
    return (
      <ContactProfileError 
        error={intelligenceError} 
        onRetry={() => window.location.reload()} 
      />
    );
  }

  const { contact, metrics, communication_patterns, recent_events, privacy_level, can_edit } = intelligence;

  return (
    <div className={`flex flex-col h-full bg-gray-50 ${className}`}>
      {/* Contact Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              {/* Avatar */}
              <div className="flex-shrink-0">
                <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-xl font-bold text-white">
                    {(contact.name?.[0] || contact.number[0]).toUpperCase()}
                  </span>
                </div>
              </div>
              
              {/* Contact Info */}
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {contact.name || contact.number}
                  </h2>
                  {privacy_level === 'private' && (
                    <div className="flex items-center">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  )}
                </div>
                
                {contact.name && (
                  <p className="text-lg text-gray-600">{contact.number}</p>
                )}
                
                {contact.company && (
                  <p className="text-sm text-gray-500 mt-1">{contact.company}</p>
                )}

                {/* Tags */}
                {contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {contact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-4 mt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {metrics.total_interactions.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Total Interactions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {metrics.total_calls.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Calls</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {metrics.total_sms.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Messages</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round(metrics.avg_call_duration)}s
                </div>
                <div className="text-sm text-gray-500">Avg Call</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          {can_edit && (
            <ContactActions
              contactId={contactId}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'patterns', label: 'Communication Patterns' },
            { key: 'timeline', label: 'Recent Activity' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {selectedTab === 'overview' && (
          <ContactOverview 
            intelligence={intelligence} 
          />
        )}
        
        {selectedTab === 'patterns' && (
          <ContactMetrics
            intelligence={intelligence}
            patterns={patterns}
            isLoading={patternsLoading}
            error={patternsError}
          />
        )}
        
        {selectedTab === 'timeline' && (
          <ContactTimeline
            events={recent_events}
            contactId={contactId}
          />
        )}
      </div>
    </div>
  );
}

function ContactOverview({ intelligence }: { intelligence: any }) {
  const { metrics, communication_patterns } = intelligence;

  return (
    <div className="p-6 space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Communication Frequency</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Daily Average:</span>
              <span className="text-sm font-medium">{metrics.contact_frequency.toFixed(1)} interactions</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Inbound Ratio:</span>
              <span className="text-sm font-medium">{Math.round(metrics.inbound_ratio * 100)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Activity Patterns</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Most Active Hour:</span>
              <span className="text-sm font-medium">
                {metrics.most_active_hour}:00 - {metrics.most_active_hour + 1}:00
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Most Active Day:</span>
              <span className="text-sm font-medium">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][metrics.most_active_day]}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Contact History</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">First Contact:</span>
              <span className="text-sm font-medium">
                {metrics.first_contact ? new Date(metrics.first_contact).toLocaleDateString() : 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Last Contact:</span>
              <span className="text-sm font-medium">
                {metrics.last_contact ? new Date(metrics.last_contact).toLocaleDateString() : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Trends Chart */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Communication Trends (Last 12 Months)</h3>
        <div className="h-64 flex items-end justify-between space-x-2">
          {communication_patterns.monthly_trends.slice(-12).map((trend, index) => {
            const maxTotal = Math.max(...communication_patterns.monthly_trends.map(t => t.total));
            const height = maxTotal > 0 ? (trend.total / maxTotal) * 100 : 0;
            
            return (
              <div key={trend.month} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-blue-500 rounded-t-sm min-h-1"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${trend.month}: ${trend.total} interactions`}
                />
                <div className="text-xs text-gray-500 mt-2 transform -rotate-45 origin-left">
                  {trend.month.split('-')[1]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ContactProfileSkeleton() {
  return (
    <div className="flex flex-col h-full bg-gray-50 animate-pulse">
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-start space-x-4">
          <div className="h-16 w-16 bg-gray-200 rounded-full"></div>
          <div className="flex-1">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
      </div>
      <div className="flex-1 p-6">
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg p-6 border border-gray-200">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContactProfileError({ error, onRetry }: { error: any; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
      <div className="text-center max-w-md">
        <div className="mx-auto h-12 w-12 text-red-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Failed to load contact</h3>
        <p className="mt-1 text-sm text-gray-500">
          {error?.message || 'There was an error loading this contact\'s information.'}
        </p>
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}