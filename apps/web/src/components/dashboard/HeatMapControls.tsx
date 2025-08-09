'use client';

import React, { useState, useCallback } from 'react';
import { 
  CalendarIcon, 
  FunnelIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  Cog6ToothIcon 
} from '@heroicons/react/24/outline';
import { 
  PhoneIcon, 
  ChatBubbleLeftIcon,
  ClockIcon 
} from '@heroicons/react/24/solid';
import { 
  HeatMapViewMode, 
  HeatMapEventType, 
  HeatMapFilters,
  HeatMapExportData 
} from '@phonelogai/types';
import { format, subDays, subWeeks, subMonths } from 'date-fns';

interface HeatMapControlsProps {
  filters: HeatMapFilters;
  onFiltersChange: (filters: Partial<HeatMapFilters>) => void;
  onRefresh?: () => void;
  onExport?: (format: 'csv' | 'json' | 'png' | 'svg') => void;
  isLoading?: boolean;
  className?: string;
}

// Preset date ranges for quick selection
const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7, key: 'week' },
  { label: 'Last 30 days', days: 30, key: 'month' },
  { label: 'Last 90 days', days: 90, key: 'quarter' },
  { label: 'Last 6 months', days: 180, key: 'halfyear' },
] as const;

// View mode options
const VIEW_MODE_OPTIONS = [
  { value: 'daily' as HeatMapViewMode, label: 'Daily', icon: ClockIcon },
  { value: 'weekly' as HeatMapViewMode, label: 'Weekly', icon: CalendarIcon },
  { value: 'monthly' as HeatMapViewMode, label: 'Monthly', icon: FunnelIcon },
] as const;

/**
 * HeatMapControls - Control panel for heat map filtering and configuration
 * Provides date range selection, view mode switching, event type filtering, and export options
 */
export default function HeatMapControls({
  filters,
  onFiltersChange,
  onRefresh,
  onExport,
  isLoading = false,
  className = '',
}: HeatMapControlsProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Handle view mode change
  const handleViewModeChange = useCallback((viewMode: HeatMapViewMode) => {
    onFiltersChange({ viewMode });
  }, [onFiltersChange]);

  // Handle event type toggle
  const handleEventTypeToggle = useCallback((eventType: HeatMapEventType) => {
    const currentTypes = filters.eventTypes;
    let newTypes: HeatMapEventType[];

    if (currentTypes.includes(eventType)) {
      // Remove if already included (but keep at least one type)
      if (currentTypes.length > 1) {
        newTypes = currentTypes.filter(type => type !== eventType);
      } else {
        return; // Don't allow removing all types
      }
    } else {
      // Add if not included
      newTypes = [...currentTypes, eventType];
    }

    onFiltersChange({ eventTypes: newTypes });
  }, [filters.eventTypes, onFiltersChange]);

  // Handle date preset selection
  const handleDatePreset = useCallback((preset: typeof DATE_PRESETS[number]) => {
    const endDate = new Date();
    const startDate = subDays(endDate, preset.days);
    
    onFiltersChange({
      startDate,
      endDate,
    });
    
    setShowDatePicker(false);
  }, [onFiltersChange]);

  // Handle custom date range
  const handleCustomDateRange = useCallback((startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start < end) {
      onFiltersChange({
        startDate: start,
        endDate: end,
      });
    }
  }, [onFiltersChange]);

  // Format current date range for display
  const formatDateRange = useCallback(() => {
    const start = format(filters.startDate, 'MMM d');
    const end = format(filters.endDate, 'MMM d, yyyy');
    
    if (filters.startDate.getFullYear() === filters.endDate.getFullYear()) {
      return `${start} - ${end}`;
    } else {
      const startWithYear = format(filters.startDate, 'MMM d, yyyy');
      return `${startWithYear} - ${end}`;
    }
  }, [filters.startDate, filters.endDate]);

  // Calculate days in current range
  const dayCount = Math.ceil(
    (filters.endDate.getTime() - filters.startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 space-y-4 ${className}`}>
      {/* Top row: View mode and refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <span className="text-sm font-medium text-gray-700 mr-2">View:</span>
          {VIEW_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleViewModeChange(option.value)}
              className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filters.viewMode === option.value
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
              }`}
              disabled={isLoading}
            >
              <option.icon className="w-4 h-4 mr-1.5" />
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className={`inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              title="Refresh data"
            >
              <ArrowPathIcon className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}

          {onExport && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                title="Export data"
              >
                <ArrowDownTrayIcon className="w-4 h-4 mr-1.5" />
                Export
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                  <div className="py-1">
                    <button
                      onClick={() => { onExport('csv'); setShowExportMenu(false); }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      CSV Data
                    </button>
                    <button
                      onClick={() => { onExport('json'); setShowExportMenu(false); }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      JSON Data
                    </button>
                    <button
                      onClick={() => { onExport('png'); setShowExportMenu(false); }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      PNG Image
                    </button>
                    <button
                      onClick={() => { onExport('svg'); setShowExportMenu(false); }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      SVG Image
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Second row: Event type filters and date range */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Event type toggles */}
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-700">Show:</span>
          <button
            onClick={() => handleEventTypeToggle('call')}
            className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filters.eventTypes.includes('call')
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
            disabled={isLoading}
          >
            <PhoneIcon className="w-4 h-4 mr-1.5" />
            Calls
          </button>
          <button
            onClick={() => handleEventTypeToggle('sms')}
            className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filters.eventTypes.includes('sms')
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-gray-200'
            }`}
            disabled={isLoading}
          >
            <ChatBubbleLeftIcon className="w-4 h-4 mr-1.5" />
            SMS
          </button>
        </div>

        {/* Date range picker */}
        <div className="relative">
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            {formatDateRange()}
            <span className="ml-2 text-xs text-gray-500">({dayCount} days)</span>
          </button>

          {showDatePicker && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-md shadow-lg z-10">
              <div className="p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Select Date Range</h4>
                
                {/* Preset buttons */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => handleDatePreset(preset)}
                      className="px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Custom date inputs */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={format(filters.startDate, 'yyyy-MM-dd')}
                      max={format(filters.endDate, 'yyyy-MM-dd')}
                      onChange={(e) => handleCustomDateRange(e.target.value, format(filters.endDate, 'yyyy-MM-dd'))}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={format(filters.endDate, 'yyyy-MM-dd')}
                      min={format(filters.startDate, 'yyyy-MM-dd')}
                      max={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => handleCustomDateRange(format(filters.startDate, 'yyyy-MM-dd'), e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Click outside handlers */}
      {(showDatePicker || showExportMenu) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowDatePicker(false);
            setShowExportMenu(false);
          }}
        />
      )}
    </div>
  );
}

// Export helper functions for testing
export { DATE_PRESETS, VIEW_MODE_OPTIONS };