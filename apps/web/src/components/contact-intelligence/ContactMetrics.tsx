import React from 'react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { ContactIntelligence, ContactPatterns } from '@phonelogai/types';

interface ContactMetricsProps {
  intelligence: ContactIntelligence;
  patterns?: ContactPatterns;
  isLoading?: boolean;
  error?: any;
}

export function ContactMetrics({ 
  intelligence, 
  patterns, 
  isLoading = false, 
  error 
}: ContactMetricsProps) {
  if (isLoading) {
    return <ContactMetricsSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-600 mb-2">
          <svg className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-600">Failed to load communication patterns</p>
      </div>
    );
  }

  const { communication_patterns } = intelligence;

  // Prepare data for charts
  const monthlyTrendData = communication_patterns.monthly_trends.slice(-12).map(trend => ({
    month: trend.month,
    calls: trend.calls,
    sms: trend.sms,
    total: trend.total
  }));

  const hourlyData = communication_patterns.hourly_patterns.map(pattern => ({
    hour: `${pattern.hour}:00`,
    interactions: pattern.count
  }));

  const dailyData = communication_patterns.daily_patterns.map(pattern => ({
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][pattern.day],
    interactions: pattern.count
  }));

  const directionData = [
    { name: 'Inbound', value: intelligence.metrics.inbound_ratio * 100, color: '#3B82F6' },
    { name: 'Outbound', value: (1 - intelligence.metrics.inbound_ratio) * 100, color: '#10B981' }
  ];

  const typeData = [
    { name: 'Calls', value: intelligence.metrics.total_calls, color: '#8B5CF6' },
    { name: 'SMS', value: intelligence.metrics.total_sms, color: '#F59E0B' }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Contact Frequency" 
          value={`${intelligence.metrics.contact_frequency.toFixed(1)}/day`}
          description="Average daily interactions"
          trend={intelligence.metrics.contact_frequency > 1 ? 'up' : 'stable'}
        />
        <MetricCard 
          title="Response Rate" 
          value={`${Math.round(intelligence.metrics.inbound_ratio * 100)}%`}
          description="Inbound interaction ratio"
          trend={intelligence.metrics.inbound_ratio > 0.5 ? 'up' : 'down'}
        />
        <MetricCard 
          title="Avg Call Duration" 
          value={`${Math.round(intelligence.metrics.avg_call_duration)}s`}
          description="Average call length"
          trend="stable"
        />
        <MetricCard 
          title="Peak Activity" 
          value={`${intelligence.metrics.most_active_hour}:00`}
          description="Most active hour"
          trend="stable"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trends */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Communication Trends (12 Months)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => value.split('-')[1]}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value, name) => [value, name === 'total' ? 'Total' : name === 'calls' ? 'Calls' : 'SMS']}
                labelFormatter={(label) => `Month: ${label}`}
              />
              <Legend />
              <Line type="monotone" dataKey="calls" stroke="#3B82F6" strokeWidth={2} name="Calls" />
              <Line type="monotone" dataKey="sms" stroke="#10B981" strokeWidth={2} name="SMS" />
              <Line type="monotone" dataKey="total" stroke="#8B5CF6" strokeWidth={2} name="Total" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Communication Types */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Communication Types</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={typeData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={120}
                paddingAngle={5}
                dataKey="value"
              >
                {typeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value, 'Count']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Patterns */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Hourly Activity Pattern</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 10 }}
                interval={1}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value) => [value, 'Interactions']}
                labelFormatter={(label) => `Hour: ${label}`}
              />
              <Bar dataKey="interactions" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Patterns */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Weekly Activity Pattern</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value) => [value, 'Interactions']}
                labelFormatter={(label) => `Day: ${label}`}
              />
              <Bar dataKey="interactions" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Direction Analysis */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Communication Direction</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={directionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {directionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value.toFixed(1)}%`, 'Percentage']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-blue-900">Inbound Communications</p>
                <p className="text-xs text-blue-700">Calls and messages you received</p>
              </div>
              <span className="text-xl font-bold text-blue-600">
                {Math.round(intelligence.metrics.inbound_ratio * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-green-900">Outbound Communications</p>
                <p className="text-xs text-green-700">Calls and messages you initiated</p>
              </div>
              <span className="text-xl font-bold text-green-600">
                {Math.round((1 - intelligence.metrics.inbound_ratio) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  description: string;
  trend: 'up' | 'down' | 'stable';
}

function MetricCard({ title, value, description, trend }: MetricCardProps) {
  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    stable: 'text-gray-500'
  };

  const trendIcons = {
    up: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7m0 10H7" />
      </svg>
    ),
    down: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9.2 9.2M7 7v10m0-10h10" />
      </svg>
    ),
    stable: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    )
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <span className={`${trendColors[trend]}`}>
          {trendIcons[trend]}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </div>
  );
}

function ContactMetricsSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-full"></div>
          </div>
        ))}
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-72 bg-gray-100 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  );
}