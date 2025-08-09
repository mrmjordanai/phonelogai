'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js';
import { Chart, Line, Bar } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { format, parseISO } from 'date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

export interface TimeSeriesData {
  date: string;
  calls: number;
  sms: number;
  totalDuration: number;
}

interface TimeSeriesChartProps {
  data: TimeSeriesData[];
  height?: number;
  className?: string;
}

type ChartType = 'line' | 'bar' | 'area';

export function TimeSeriesChart({ data, height = 400, className = '' }: TimeSeriesChartProps) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const chartRef = useRef<ChartJS>(null);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        callbacks: {
          title: (context: any) => {
            if (context[0]?.label) {
              return format(parseISO(context[0].label), 'MMM d, yyyy');
            }
            return '';
          },
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            
            if (label === 'Call Duration') {
              const hours = Math.floor(value / 3600);
              const minutes = Math.floor((value % 3600) / 60);
              return `${label}: ${hours}h ${minutes}m`;
            }
            
            return `${label}: ${value.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          displayFormats: {
            day: 'MMM d',
            week: 'MMM d',
            month: 'MMM yyyy',
          },
        },
        grid: {
          display: false,
        },
        ticks: {
          maxTicksLimit: 8,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
        ticks: {
          callback: function(value: any) {
            return value.toLocaleString();
          },
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        beginAtZero: true,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          callback: function(value: any) {
            const hours = Math.floor(value / 3600);
            const minutes = Math.floor((value % 3600) / 60);
            return `${hours}h ${minutes}m`;
          },
        },
      },
    },
  };

  const chartData = {
    labels: data.map(item => item.date),
    datasets: [
      {
        label: 'Calls',
        data: data.map(item => item.calls),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: chartType === 'area' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.8)',
        tension: 0.4,
        fill: chartType === 'area',
        yAxisID: 'y',
      },
      {
        label: 'SMS',
        data: data.map(item => item.sms),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: chartType === 'area' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.8)',
        tension: 0.4,
        fill: chartType === 'area',
        yAxisID: 'y',
      },
      {
        label: 'Call Duration',
        data: data.map(item => item.totalDuration),
        borderColor: 'rgb(245, 158, 11)',
        backgroundColor: chartType === 'area' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.8)',
        tension: 0.4,
        fill: chartType === 'area',
        yAxisID: 'y1',
        type: chartType === 'bar' ? 'bar' : 'line',
      },
    ],
  };

  const handleChartTypeChange = (type: ChartType) => {
    setChartType(type);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Chart Type Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">Chart Type:</span>
          <div className="flex bg-gray-100 rounded-lg p-1">
            {[
              { type: 'line' as ChartType, label: 'Line' },
              { type: 'bar' as ChartType, label: 'Bar' },
              { type: 'area' as ChartType, label: 'Area' },
            ].map(({ type, label }) => (
              <button
                key={type}
                onClick={() => handleChartTypeChange(type)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartType === type
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              if (chartRef.current) {
                const canvas = chartRef.current.canvas;
                const url = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `chart-${format(new Date(), 'yyyy-MM-dd')}.png`;
                link.href = url;
                link.click();
              }
            }}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Export PNG
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative bg-white rounded-lg border border-gray-200 p-4">
        <div style={{ height: `${height}px` }}>
          {chartType === 'line' || chartType === 'area' ? (
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          ) : (
            <Bar ref={chartRef} data={chartData} options={chartOptions} />
          )}
        </div>
      </div>

      {/* Chart Legend/Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-gray-600">Calls:</span>
            <span className="font-medium text-gray-900">
              {data.reduce((sum, item) => sum + item.calls, 0).toLocaleString()} total
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-gray-600">SMS:</span>
            <span className="font-medium text-gray-900">
              {data.reduce((sum, item) => sum + item.sms, 0).toLocaleString()} total
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className="text-gray-600">Duration:</span>
            <span className="font-medium text-gray-900">
              {Math.round(data.reduce((sum, item) => sum + item.totalDuration, 0) / 3600)}h total
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}