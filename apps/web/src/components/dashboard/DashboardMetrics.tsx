'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@phonelogai/database';
import { useAuth } from '../AuthProvider';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { PhoneIcon, ChatBubbleLeftRightIcon, UsersIcon, ClockIcon } from '@heroicons/react/24/outline';

interface Metrics {
  total_calls: number;
  total_sms: number;
  unique_contacts: number;
  average_call_duration: number;
}

export function DashboardMetrics() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchMetrics = async () => {
      try {
        const { data, error } = await supabase.rpc('get_dashboard_metrics', {
          p_user_id: user.id,
        });

        if (error) throw error;
        if (data && data.length > 0) {
          setMetrics(data[0]);
        }
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [user]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!metrics) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No data available yet.</p>
        <p className="text-sm text-gray-400 mt-1">Upload some data to see your metrics.</p>
      </div>
    );
  }

  const stats = [
    {
      name: 'Total Calls',
      value: metrics.total_calls.toLocaleString(),
      icon: PhoneIcon,
      color: 'text-blue-600 bg-blue-100',
    },
    {
      name: 'Total SMS',
      value: metrics.total_sms.toLocaleString(),
      icon: ChatBubbleLeftRightIcon,
      color: 'text-green-600 bg-green-100',
    },
    {
      name: 'Unique Contacts',
      value: metrics.unique_contacts.toLocaleString(),
      icon: UsersIcon,
      color: 'text-purple-600 bg-purple-100',
    },
    {
      name: 'Avg Call Duration',
      value: metrics.average_call_duration 
        ? `${Math.round(metrics.average_call_duration / 60)}m`
        : '0m',
      icon: ClockIcon,
      color: 'text-orange-600 bg-orange-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.name} className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`p-3 rounded-md ${stat.color}`}>
                  <stat.icon className="h-6 w-6" aria-hidden="true" />
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {stat.name}
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stat.value}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}