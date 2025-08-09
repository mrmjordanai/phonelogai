'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { 
  HeatMapFilters, 
  HeatMapEventType, 
  HeatMapViewMode,
  HeatMapTooltipData,
  HeatMapExportData 
} from '@phonelogai/types';
import { subDays } from 'date-fns';
import { useHeatMapData, useHeatMapSummary, useInvalidateHeatMapQueries } from '@/hooks/useHeatMapData';
import HeatMapChart from './HeatMapChart';
import HeatMapControls from './HeatMapControls';
import HeatMapLegend from './HeatMapLegend';

interface HeatMapProps {
  userId: string;
  className?: string;
  defaultViewMode?: HeatMapViewMode;
  defaultEventTypes?: HeatMapEventType[];
  defaultDateRange?: number; // days
  onCellClick?: (data: HeatMapTooltipData) => void;
  showControls?: boolean;
  showLegend?: boolean;
}

/**
 * HeatMap - Main container component for heat map visualization
 * Orchestrates data fetching, filtering, and component coordination
 */
export default function HeatMap({
  userId,
  className = '',
  defaultViewMode = 'weekly',
  defaultEventTypes = ['call', 'sms'],
  defaultDateRange = 30,
  onCellClick,
  showControls = true,
  showLegend = true,
}: HeatMapProps) {
  // Initialize filters with defaults
  const [filters, setFilters] = useState<HeatMapFilters>(() => ({
    viewMode: defaultViewMode,
    eventTypes: defaultEventTypes,
    startDate: subDays(new Date(), defaultDateRange),
    endDate: new Date(),
  }));

  const [selectedCell, setSelectedCell] = useState<HeatMapTooltipData | null>(null);

  // Fetch heat map data
  const {
    data: heatMapData,
    isLoading: isDataLoading,
    error: dataError,
    refetch: refetchData,
  } = useHeatMapData({
    userId,
    viewMode: filters.viewMode,
    eventTypes: filters.eventTypes,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  // Fetch summary statistics
  const {
    summary,
    isLoading: isSummaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useHeatMapSummary({
    userId,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  // Cache invalidation hooks
  const { invalidateAll } = useInvalidateHeatMapQueries();

  // Combined loading state
  const isLoading = isDataLoading || isSummaryLoading;
  const hasError = dataError || summaryError;

  // Calculate max intensity for color scaling
  const maxIntensity = useMemo(() => {
    if (!heatMapData || heatMapData.length === 0) return 1.0;
    return Math.max(...heatMapData.map(d => d.intensity), 0.1);
  }, [heatMapData]);

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: Partial<HeatMapFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    refetchData();
    refetchSummary();
    invalidateAll();
  }, [refetchData, refetchSummary, invalidateAll]);

  // Handle cell interactions
  const handleCellClick = useCallback((data: HeatMapTooltipData) => {
    setSelectedCell(data);
    onCellClick?.(data);
  }, [onCellClick]);

  const handleCellHover = useCallback((data: HeatMapTooltipData | null) => {
    // You could implement hover state management here if needed
  }, []);

  // Handle export functionality
  const handleExport = useCallback(async (format: 'csv' | 'json' | 'png' | 'svg') => {
    if (!heatMapData) return;

    const exportData: HeatMapExportData = {
      format,
      filters,
      data: heatMapData,
      generatedAt: new Date().toISOString(),
    };

    try {
      switch (format) {
        case 'csv':
          await exportToCsv(exportData);
          break;
        case 'json':
          await exportToJson(exportData);
          break;
        case 'png':
        case 'svg':
          await exportToImage(exportData, format);
          break;
        default:
          console.warn(`Export format ${format} not implemented`);
      }
    } catch (error) {
      console.error(`Export to ${format} failed:`, error);
      // You might want to show a toast notification here
    }
  }, [heatMapData, filters]);

  // Auto-refresh on filter changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // This will trigger the useQuery hooks to refetch
      // since the query keys depend on the filters
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [filters]);

  // Error state
  if (hasError) {
    return (
      <div className={`bg-white border border-red-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-center justify-center text-center">
          <div className="max-w-md">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Unable to Load Heat Map
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {dataError?.message || summaryError?.message || 'An error occurred while loading the heat map data.'}
            </p>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Controls */}
      {showControls && (
        <HeatMapControls
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onRefresh={handleRefresh}
          onExport={handleExport}
          isLoading={isLoading}
        />
      )}

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Heat map chart */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-medium text-gray-900">
                  Activity Heat Map
                </h2>
                <p className="text-sm text-gray-600">
                  {filters.eventTypes.includes('call') && filters.eventTypes.includes('sms') 
                    ? 'Communication activity patterns'
                    : filters.eventTypes.includes('call')
                    ? 'Call activity patterns'
                    : 'SMS activity patterns'
                  }
                </p>
              </div>
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-center text-sm text-gray-500">
                  <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </div>
              )}
            </div>

            {/* Chart container */}
            <div className="relative">
              {!isLoading && heatMapData ? (
                <HeatMapChart
                  data={heatMapData}
                  viewMode={filters.viewMode}
                  eventTypes={filters.eventTypes}
                  width={800}
                  height={400}
                  onCellClick={handleCellClick}
                  onCellHover={handleCellHover}
                  className="w-full"
                />
              ) : (
                <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
                  {isLoading ? (
                    <div className="text-center">
                      <ArrowPathIcon className="w-8 h-8 mx-auto text-gray-400 animate-spin mb-2" />
                      <p className="text-sm text-gray-600">Loading heat map data...</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-gray-600">No data available for the selected period</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected cell info */}
            {selectedCell && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <h4 className="text-sm font-medium text-blue-900 mb-1">
                  Selected: {selectedCell.dayName}, {selectedCell.hour}:00
                </h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>Total Events: {selectedCell.metrics.totalEvents}</p>
                  {filters.eventTypes.includes('call') && (
                    <p>Calls: {selectedCell.metrics.callCount}</p>
                  )}
                  {filters.eventTypes.includes('sms') && (
                    <p>SMS: {selectedCell.metrics.smsCount}</p>
                  )}
                  {selectedCell.metrics.uniqueContacts > 0 && (
                    <p>Unique Contacts: {selectedCell.metrics.uniqueContacts}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Legend and summary */}
        {showLegend && (
          <div className="lg:col-span-1">
            <HeatMapLegend
              summary={summary}
              eventTypes={filters.eventTypes}
              viewMode={filters.viewMode}
              maxIntensity={maxIntensity}
              showTooltips={true}
              className="h-fit"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Export utility functions
async function exportToCsv(data: HeatMapExportData) {
  const csvContent = [
    // Headers
    'Time Bucket,Day of Week,Hour of Day,Call Count,SMS Count,Total Duration,Unique Contacts,Intensity',
    // Data rows
    ...data.data.map(row => [
      row.time_bucket,
      row.day_of_week,
      row.hour_of_day,
      row.call_count,
      row.sms_count,
      row.total_duration,
      row.unique_contacts,
      row.intensity,
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `heatmap-data-${data.generatedAt.substring(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

async function exportToJson(data: HeatMapExportData) {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `heatmap-data-${data.generatedAt.substring(0, 10)}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

async function exportToImage(data: HeatMapExportData, format: 'png' | 'svg') {
  // This would require canvas-to-blob or svg-to-image conversion
  // Implementation depends on the specific requirements and available libraries
  console.log(`Image export to ${format} would be implemented here`);
  // For now, just log the data
  console.log('Export data:', data);
}