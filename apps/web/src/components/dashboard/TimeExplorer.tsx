'use client';

import React, { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { DateRangePicker } from './DateRangePicker';
import { TimeSeriesChart } from './TimeSeriesChart';
import { useTimeSeriesData } from '../../hooks/useTimeSeriesData';
import { CalendarIcon, ChartBarIcon, FunnelIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface TimeExplorerProps {
  className?: string;
}

export interface DateRange {
  from: Date;
  to: Date;
  preset?: string;
}

export interface TimeSeriesData {
  date: string;
  calls: number;
  sms: number;
  totalDuration: number;
}

export function TimeExplorer({ className = '' }: TimeExplorerProps) {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    to: new Date(),
    preset: 'last-7-days'
  });

  // Use the custom hook for data fetching
  const { data, loading, error, refetch } = useTimeSeriesData({
    dateRange,
    userId: user?.id || '',
  });

  const handleDateRangeChange = (newRange: DateRange) => {
    setDateRange(newRange);
  };

  if (!user) {
    return null;
  }

  return (
    <div className={`bg-white shadow rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ChartBarIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Time Explorer</h3>
              <p className="text-sm text-gray-500">
                Analyze your communication patterns over time
              </p>
            </div>
          </div>
          
          {/* Quick actions */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowPathIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <FunnelIcon className="h-4 w-4 mr-2" />
              Filters
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Date Range Picker */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-3">
            <CalendarIcon className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Date Range</span>
          </div>
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
          />
        </div>

        {/* Chart Section */}
        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
              <span className="ml-3 text-gray-500">Loading chart data...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-600 mb-2">
                <ChartBarIcon className="h-12 w-12 mx-auto opacity-50" />
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Unable to load data</h4>
              <p className="text-gray-500 mb-4">{error}</p>
              <button
                onClick={() => refetch()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-semibold text-gray-900">
                    {data.reduce((sum, item) => sum + item.calls, 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">Total Calls</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-semibold text-gray-900">
                    {data.reduce((sum, item) => sum + item.sms, 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">Total SMS</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-semibold text-gray-900">
                    {Math.round(data.reduce((sum, item) => sum + item.totalDuration, 0) / 3600)}h
                  </div>
                  <div className="text-sm text-gray-500">Total Talk Time</div>
                </div>
              </div>

              {/* Chart */}
              <TimeSeriesChart data={data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}