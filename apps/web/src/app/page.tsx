'use client'

import { Suspense, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardMetrics } from '@/components/dashboard/DashboardMetrics';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { TimeExplorer } from '@/components/dashboard/TimeExplorer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { NlqChat } from '@/components/nlq';

export default function HomePage() {
  const [showNlqChat, setShowNlqChat] = useState(false);

  const toggleNlqChat = () => {
    setShowNlqChat(!showNlqChat);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview of your call and SMS activity
          </p>
        </div>

        <Suspense fallback={<LoadingSpinner />}>
          <DashboardMetrics />
        </Suspense>

        {/* Natural Language Query Chat */}
        {showNlqChat && (
          <div className="bg-white rounded-lg shadow-lg border">
            <NlqChat 
              className="min-h-[500px]"
              placeholder="Ask questions about your communication data..."
              showSuggestions={true}
            />
          </div>
        )}

        {/* Time Explorer Dashboard */}
        <Suspense fallback={<LoadingSpinner />}>
          <TimeExplorer />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Suspense fallback={<LoadingSpinner />}>
            <RecentActivity />
          </Suspense>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Quick Actions
            </h3>
            <div className="space-y-3">
              <button className="w-full text-left p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                <div className="font-medium text-blue-900">Upload Data</div>
                <div className="text-sm text-blue-700">
                  Import carrier files or CSV data
                </div>
              </button>
              <button 
                onClick={toggleNlqChat}
                className="w-full text-left p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <div className="font-medium text-green-900">
                  {showNlqChat ? 'Hide Chat' : 'Chat with Data'}
                </div>
                <div className="text-sm text-green-700">
                  Ask questions about your communication patterns
                </div>
              </button>
              <button className="w-full text-left p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                <div className="font-medium text-purple-900">Privacy Settings</div>
                <div className="text-sm text-purple-700">
                  Manage contact visibility and anonymization
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}