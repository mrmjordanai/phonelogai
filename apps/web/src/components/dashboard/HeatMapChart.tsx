'use client';

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { 
  HeatMapDataPoint, 
  HeatMapViewMode, 
  HeatMapTooltipData,
  HeatMapEventType 
} from '@phonelogai/types';
import { format, parseISO } from 'date-fns';

interface HeatMapChartProps {
  data: HeatMapDataPoint[];
  viewMode: HeatMapViewMode;
  eventTypes: HeatMapEventType[];
  width?: number;
  height?: number;
  onCellClick?: (data: HeatMapTooltipData) => void;
  onCellHover?: (data: HeatMapTooltipData | null) => void;
  className?: string;
}

interface TooltipPosition {
  x: number;
  y: number;
  visible: boolean;
  data: HeatMapTooltipData | null;
}

// Constants for the heat map layout
const CELL_SIZE = 18;
const CELL_PADDING = 2;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Color schemes for different intensities
const COLOR_SCHEMES = {
  blue: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985'],
  green: ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534'],
  purple: ['#faf5ff', '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7c3aed', '#6d28d9'],
};

/**
 * HeatMapChart - Core D3.js-based heat map visualization component
 * Provides interactive heat map with hover effects, tooltips, and responsive design
 */
export default function HeatMapChart({
  data,
  viewMode,
  eventTypes,
  width = 800,
  height = 400,
  onCellClick,
  onCellHover,
  className = '',
}: HeatMapChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipPosition>({
    x: 0,
    y: 0,
    visible: false,
    data: null,
  });

  // Memoized data processing
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Group data by day and hour for efficient lookup
    const dataMap = new Map<string, HeatMapDataPoint>();
    
    data.forEach(point => {
      const key = `${point.day_of_week}-${point.hour_of_day}`;
      dataMap.set(key, point);
    });

    // Generate complete grid based on view mode
    const gridData: (HeatMapDataPoint & { gridX: number; gridY: number })[] = [];

    if (viewMode === 'weekly' || viewMode === 'daily') {
      // 7 days x 24 hours grid
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const key = `${day}-${hour}`;
          const existingData = dataMap.get(key);
          
          gridData.push({
            time_bucket: existingData?.time_bucket || '',
            day_of_week: day,
            hour_of_day: hour,
            call_count: existingData?.call_count || 0,
            sms_count: existingData?.sms_count || 0,
            total_duration: existingData?.total_duration || 0,
            unique_contacts: existingData?.unique_contacts || 0,
            intensity: existingData?.intensity || 0,
            gridX: hour,
            gridY: day,
          });
        }
      }
    } else {
      // For monthly view, we might use a different layout
      // This is simplified - in production, you might want a calendar-like layout
      data.forEach((point, index) => {
        gridData.push({
          ...point,
          gridX: point.hour_of_day,
          gridY: point.day_of_week,
        });
      });
    }

    return gridData;
  }, [data, viewMode]);

  // Color scale for intensity mapping
  const colorScale = useMemo(() => {
    const maxIntensity = Math.max(...processedData.map(d => d.intensity), 0.1);
    return d3.scaleSequential()
      .domain([0, maxIntensity])
      .interpolator(d3.interpolateBlues);
  }, [processedData]);

  // Helper to format tooltip data
  const formatTooltipData = useCallback((dataPoint: HeatMapDataPoint): HeatMapTooltipData => {
    const totalEvents = dataPoint.call_count + dataPoint.sms_count;
    const dayName = DAY_LABELS[dataPoint.day_of_week];
    const hour24 = dataPoint.hour_of_day;
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 < 12 ? 'AM' : 'PM';
    
    return {
      date: dataPoint.time_bucket || `${dayName}, ${hour12}${ampm}`,
      dayName,
      hour: dataPoint.hour_of_day,
      metrics: {
        totalEvents,
        callCount: dataPoint.call_count,
        smsCount: dataPoint.sms_count,
        totalDuration: dataPoint.total_duration,
        uniqueContacts: dataPoint.unique_contacts,
        intensity: dataPoint.intensity,
      },
    };
  }, []);

  // Main D3.js rendering effect
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svg.node() || processedData.length === 0) return;

    // Clear previous content
    svg.selectAll('*').remove();

    // Calculate dimensions
    const margin = { top: 40, right: 40, bottom: 60, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create main group
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Calculate cell dimensions based on available space
    const cellWidth = Math.floor(chartWidth / 24); // 24 hours
    const cellHeight = Math.floor(chartHeight / 7); // 7 days
    const actualCellSize = Math.min(cellWidth, cellHeight, CELL_SIZE);

    // Day labels (Y-axis)
    g.selectAll('.day-label')
      .data(DAY_LABELS)
      .enter()
      .append('text')
      .attr('class', 'day-label text-sm fill-gray-700')
      .attr('x', -10)
      .attr('y', (d, i) => i * (actualCellSize + CELL_PADDING) + actualCellSize / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .text(d => d);

    // Hour labels (X-axis) - show every 2 hours to avoid crowding
    const hourTicks = d3.range(0, 24, 2);
    g.selectAll('.hour-label')
      .data(hourTicks)
      .enter()
      .append('text')
      .attr('class', 'hour-label text-xs fill-gray-600')
      .attr('x', d => d * (actualCellSize + CELL_PADDING) + actualCellSize / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .text(d => {
        if (d === 0) return '12AM';
        if (d === 12) return '12PM';
        return d < 12 ? `${d}AM` : `${d - 12}PM`;
      });

    // Heat map cells
    const cells = g.selectAll('.heat-cell')
      .data(processedData)
      .enter()
      .append('rect')
      .attr('class', 'heat-cell cursor-pointer transition-all duration-200')
      .attr('x', d => d.gridX * (actualCellSize + CELL_PADDING))
      .attr('y', d => d.gridY * (actualCellSize + CELL_PADDING))
      .attr('width', actualCellSize)
      .attr('height', actualCellSize)
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('fill', d => d.intensity === 0 ? '#f3f4f6' : colorScale(d.intensity))
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 0.5);

    // Add hover and click interactions
    cells
      .on('mouseenter', function(event, d) {
        // Highlight cell
        d3.select(this)
          .attr('stroke', '#374151')
          .attr('stroke-width', 2)
          .attr('opacity', 0.8);

        // Show tooltip
        const tooltipData = formatTooltipData(d);
        const rect = (event.target as Element).getBoundingClientRect();
        const svgRect = svgRef.current!.getBoundingClientRect();
        
        setTooltip({
          x: rect.left - svgRect.left + actualCellSize / 2,
          y: rect.top - svgRect.top - 10,
          visible: true,
          data: tooltipData,
        });

        onCellHover?.(tooltipData);
      })
      .on('mouseleave', function(event, d) {
        // Reset cell appearance
        d3.select(this)
          .attr('stroke', '#e5e7eb')
          .attr('stroke-width', 0.5)
          .attr('opacity', 1);

        // Hide tooltip
        setTooltip(prev => ({ ...prev, visible: false, data: null }));
        onCellHover?.(null);
      })
      .on('click', function(event, d) {
        const tooltipData = formatTooltipData(d);
        onCellClick?.(tooltipData);
      });

    // Add accessibility features
    cells.append('title')
      .text(d => {
        const tooltipData = formatTooltipData(d);
        return `${tooltipData.dayName}, ${tooltipData.hour}:00 - ${tooltipData.metrics.totalEvents} events`;
      });

    // Add legend/color scale (simplified)
    const legendWidth = 200;
    const legendHeight = 10;
    const legendG = svg
      .append('g')
      .attr('transform', `translate(${width - legendWidth - 20}, ${height - 40})`);

    // Create gradient for legend
    const legendGradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'legend-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');

    legendGradient.selectAll('stop')
      .data(d3.range(0, 1.1, 0.1))
      .enter()
      .append('stop')
      .attr('offset', d => `${d * 100}%`)
      .attr('stop-color', d => colorScale(d * Math.max(...processedData.map(p => p.intensity), 0.1)));

    legendG.append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('fill', 'url(#legend-gradient)')
      .attr('stroke', '#d1d5db');

    legendG.append('text')
      .attr('x', 0)
      .attr('y', legendHeight + 15)
      .attr('class', 'text-xs fill-gray-600')
      .text('Low');

    legendG.append('text')
      .attr('x', legendWidth)
      .attr('y', legendHeight + 15)
      .attr('text-anchor', 'end')
      .attr('class', 'text-xs fill-gray-600')
      .text('High');

  }, [processedData, width, height, colorScale, formatTooltipData, onCellClick, onCellHover]);

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible"
        role="img"
        aria-label="Communication activity heat map"
      />
      
      {/* Custom tooltip */}
      {tooltip.visible && tooltip.data && (
        <div
          className="absolute z-10 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="font-medium">{tooltip.data.dayName}</div>
          <div className="text-xs opacity-90">{tooltip.data.hour}:00</div>
          <div className="mt-1 space-y-1">
            <div className="flex justify-between gap-4">
              <span>Total:</span>
              <span className="font-medium">{tooltip.data.metrics.totalEvents}</span>
            </div>
            {eventTypes.includes('call') && (
              <div className="flex justify-between gap-4">
                <span>Calls:</span>
                <span>{tooltip.data.metrics.callCount}</span>
              </div>
            )}
            {eventTypes.includes('sms') && (
              <div className="flex justify-between gap-4">
                <span>SMS:</span>
                <span>{tooltip.data.metrics.smsCount}</span>
              </div>
            )}
            {tooltip.data.metrics.uniqueContacts > 0 && (
              <div className="flex justify-between gap-4">
                <span>Contacts:</span>
                <span>{tooltip.data.metrics.uniqueContacts}</span>
              </div>
            )}
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export helper functions for testing
export { CELL_SIZE, CELL_PADDING, DAY_LABELS, COLOR_SCHEMES };