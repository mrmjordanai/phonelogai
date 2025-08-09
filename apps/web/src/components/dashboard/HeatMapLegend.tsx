'use client';

import React, { useMemo } from 'react';
import { 
  InformationCircleIcon,
  QuestionMarkCircleIcon 
} from '@heroicons/react/24/outline';
import { 
  HeatMapSummary, 
  HeatMapEventType,
  HeatMapViewMode 
} from '@phonelogai/types';

interface HeatMapLegendProps {
  summary: HeatMapSummary | null;
  eventTypes: HeatMapEventType[];
  viewMode: HeatMapViewMode;
  maxIntensity?: number;
  showTooltips?: boolean;
  className?: string;
}

// Day names for peak day display
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Color intensity levels for the legend
const INTENSITY_LEVELS = [
  { value: 0, label: 'No Activity', color: '#f3f4f6', description: 'No communication events' },
  { value: 0.2, label: 'Low', color: '#dbeafe', description: '1-20% of peak activity' },
  { value: 0.4, label: 'Moderate', color: '#93c5fd', description: '21-40% of peak activity' },
  { value: 0.6, label: 'High', color: '#3b82f6', description: '41-60% of peak activity' },
  { value: 0.8, label: 'Very High', color: '#1d4ed8', description: '61-80% of peak activity' },
  { value: 1.0, label: 'Peak', color: '#1e3a8a', description: '81-100% of peak activity' },
];

/**
 * HeatMapLegend - Accessibility-focused legend and information panel for heat map
 * Provides color scale explanation, summary statistics, and contextual information
 */
export default function HeatMapLegend({
  summary,
  eventTypes,
  viewMode,
  maxIntensity = 1.0,
  showTooltips = true,
  className = '',
}: HeatMapLegendProps) {
  // Format numbers for display
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    } else {
      return num.toString();
    }
  };

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  // Format hour for display (12-hour format)
  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  // Get event type labels
  const eventTypeLabels = useMemo(() => {
    const labels: string[] = [];
    if (eventTypes.includes('call')) labels.push('Calls');
    if (eventTypes.includes('sms')) labels.push('SMS');
    return labels.join(' & ');
  }, [eventTypes]);

  // Calculate color scale based on max intensity
  const colorScale = useMemo(() => {
    return INTENSITY_LEVELS.map(level => ({
      ...level,
      adjustedValue: level.value * maxIntensity,
    }));
  }, [maxIntensity]);

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Heat Map Legend</h3>
          {showTooltips && (
            <button
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Heat map shows activity intensity over time. Darker colors indicate higher activity levels."
              aria-label="Heat map information"
            >
              <InformationCircleIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-1">
          Activity intensity for {eventTypeLabels.toLowerCase()} in {viewMode} view
        </p>
      </div>

      {/* Color scale legend */}
      <div className="p-4 space-y-4">
        <div>
          <h4 className="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wide">
            Activity Level
          </h4>
          <div className="space-y-2">
            {/* Color gradient bar */}
            <div className="flex items-center space-x-2">
              <div 
                className="h-4 rounded-sm border border-gray-300 flex-1"
                style={{
                  background: `linear-gradient(to right, ${colorScale.map(c => c.color).join(', ')})`
                }}
                role="img"
                aria-label="Color intensity scale from no activity to peak activity"
              />
            </div>
            
            {/* Scale labels */}
            <div className="flex justify-between text-xs text-gray-600">
              <span>No Activity</span>
              <span>Peak Activity</span>
            </div>
            
            {/* Detailed intensity levels */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {colorScale.map((level, index) => (
                <div 
                  key={index} 
                  className="flex items-center space-x-2"
                  role="listitem"
                >
                  <div
                    className="w-3 h-3 rounded-sm border border-gray-300 flex-shrink-0"
                    style={{ backgroundColor: level.color }}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-700">{level.label}</div>
                    {showTooltips && (
                      <div className="text-xs text-gray-500">{level.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary statistics */}
        {summary && (
          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-xs font-medium text-gray-700 mb-3 uppercase tracking-wide">
              Activity Summary
            </h4>
            <div className="space-y-3">
              {/* Total events */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Events:</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(summary.total_events)}
                </span>
              </div>

              {/* Daily average */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Daily Average:</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatNumber(Math.round(summary.avg_daily_activity))}
                </span>
              </div>

              {/* Peak activity time */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Peak Hour:</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatHour(summary.peak_hour)}
                </span>
              </div>

              {/* Peak activity day */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Peak Day:</span>
                <span className="text-sm font-medium text-gray-900">
                  {DAY_NAMES[summary.peak_day]}
                </span>
              </div>

              {/* Date range */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Date Range:</span>
                  <span className="text-sm font-medium text-gray-900">
                    {summary.date_range.days} days
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accessibility information */}
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wide flex items-center">
            <QuestionMarkCircleIcon className="w-3 h-3 mr-1" />
            How to Read
          </h4>
          <div className="space-y-2 text-xs text-gray-600">
            <p>• Each cell represents a time period with activity intensity</p>
            <p>• Darker colors indicate higher activity levels</p>
            <p>• Hover over cells for detailed information</p>
            <p>• Use keyboard navigation to explore data</p>
            {viewMode === 'weekly' && (
              <p>• Rows represent days of the week, columns represent hours</p>
            )}
            {viewMode === 'daily' && (
              <p>• View shows hourly activity patterns throughout the day</p>
            )}
            {viewMode === 'monthly' && (
              <p>• View shows daily activity patterns throughout the month</p>
            )}
          </div>
        </div>

        {/* Screen reader only content */}
        <div className="sr-only">
          <h4>Heat Map Data Summary</h4>
          <p>
            This heat map visualization shows {eventTypeLabels.toLowerCase()} activity 
            patterns in a {viewMode} view. The color intensity represents the level 
            of activity, with darker colors indicating higher activity levels.
          </p>
          {summary && (
            <ul>
              <li>Total events in period: {summary.total_events}</li>
              <li>Average daily activity: {Math.round(summary.avg_daily_activity)} events</li>
              <li>Peak activity hour: {formatHour(summary.peak_hour)}</li>
              <li>Peak activity day: {DAY_NAMES[summary.peak_day]}</li>
              <li>Analysis covers {summary.date_range.days} days</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Export constants for testing
export { INTENSITY_LEVELS, DAY_NAMES };