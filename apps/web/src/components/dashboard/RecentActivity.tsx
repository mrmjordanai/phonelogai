'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@phonelogai/database';
import { useAuth } from '../AuthProvider';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { PhoneIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/20/solid';
import { formatDateTime, formatDuration } from '@phonelogai/shared';

interface RecentEvent {
  id: string;
  user_id: string;
  ts: string;
  number: string;
  direction: 'inbound' | 'outbound';
  type: 'call' | 'sms';
  duration: number | null;
  content: string | null;
  contact_name: string | null;
}

export function RecentActivity() {
  const { user } = useAuth();
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchRecentActivity = async () => {
      try {
        const { data, error } = await supabase.rpc('get_filtered_events', {
          p_requesting_user_id: user.id,
          p_limit: 10,
          p_offset: 0,
        });

        if (error) throw error;
        setEvents(data || []);
      } catch (error) {
        console.error('Error fetching recent activity:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentActivity();
  }, [user]);

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
      </div>
      
      <div className="divide-y divide-gray-200">
        {events.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-gray-500">No recent activity</p>
            <p className="text-sm text-gray-400 mt-1">
              Start by uploading your call and SMS data
            </p>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className={`p-2 rounded-full ${
                    event.type === 'call' 
                      ? 'bg-blue-100 text-blue-600' 
                      : 'bg-green-100 text-green-600'
                  }`}>
                    {event.type === 'call' ? (
                      <PhoneIcon className="h-4 w-4" />
                    ) : (
                      <ChatBubbleLeftRightIcon className="h-4 w-4" />
                    )}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {event.contact_name || event.number}
                    </p>
                    <div className="flex items-center">
                      {event.direction === 'inbound' ? (
                        <ArrowDownIcon className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowUpIcon className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span>{formatDateTime(event.ts)}</span>
                    {event.type === 'call' && event.duration && (
                      <span>{formatDuration(event.duration)}</span>
                    )}
                    {event.type === 'sms' && event.content && (
                      <span className="truncate max-w-xs">
                        {event.content}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {events.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-200">
          <button className="text-sm text-blue-600 hover:text-blue-500">
            View all activity →
          </button>
        </div>
      )}
    </div>
  );
}