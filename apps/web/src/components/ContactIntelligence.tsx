import React, { useState, useCallback } from 'react';
import { useContactSearch, usePrefetchContactIntelligence } from '@phonelogai/shared/hooks/useContactIntelligence';
import { ContactSearchFilters } from '@phonelogai/types';
import { ContactSearch } from './contact-intelligence/ContactSearch';
import { ContactProfile } from './contact-intelligence/ContactProfile';
import { ContactActions } from './contact-intelligence/ContactActions';

interface ContactIntelligenceProps {
  initialContactId?: string;
  teamView?: boolean;
  className?: string;
}

export function ContactIntelligence({ 
  initialContactId, 
  teamView = false,
  className = '' 
}: ContactIntelligenceProps) {
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>(initialContactId);
  const [searchFilters, setSearchFilters] = useState<ContactSearchFilters>({
    search_term: '',
    tag_filter: [],
    sort_by: 'relevance',
    limit: 50,
    offset: 0
  });

  const prefetchContactIntelligence = usePrefetchContactIntelligence();

  const handleContactSelect = useCallback((contactId: string) => {
    setSelectedContactId(contactId);
    // Prefetch contact data for faster loading
    prefetchContactIntelligence(contactId);
  }, [prefetchContactIntelligence]);

  const handleContactUpdate = useCallback(() => {
    // Force refresh of search results when contact is updated
    setSearchFilters(prev => ({ ...prev }));
  }, []);

  const handleContactDelete = useCallback((contactId: string) => {
    if (selectedContactId === contactId) {
      setSelectedContactId(undefined);
    }
    // Refresh search results
    setSearchFilters(prev => ({ ...prev }));
  }, [selectedContactId]);

  return (
    <div className={`flex flex-col h-full bg-gray-50 ${className}`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contact Intelligence</h1>
            <p className="mt-1 text-sm text-gray-500">
              Comprehensive contact profiles and communication insights
            </p>
          </div>
          {selectedContactId && (
            <ContactActions 
              contactId={selectedContactId}
              onUpdate={handleContactUpdate}
              onDelete={handleContactDelete}
            />
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Contact Search Panel */}
        <div className="w-1/3 min-w-80 bg-white border-r border-gray-200 flex flex-col">
          <ContactSearch
            searchFilters={searchFilters}
            onFiltersChange={setSearchFilters}
            selectedContactId={selectedContactId}
            onContactSelect={handleContactSelect}
            teamView={teamView}
          />
        </div>

        {/* Contact Profile Panel */}
        <div className="flex-1 flex flex-col">
          {selectedContactId ? (
            <ContactProfile
              contactId={selectedContactId}
              onUpdate={handleContactUpdate}
              onDelete={() => handleContactDelete(selectedContactId)}
            />
          ) : (
            <EmptyContactState />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyContactState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 text-gray-400">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No contact selected</h3>
        <p className="mt-1 text-sm text-gray-500">
          Search for and select a contact to view detailed intelligence and communication patterns.
        </p>
      </div>
    </div>
  );
}

// Error Boundary Component for Contact Intelligence
export class ContactIntelligenceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ContactIntelligence Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
          <div className="text-center max-w-md">
            <div className="mx-auto h-12 w-12 text-red-400">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-gray-900">Something went wrong</h3>
            <p className="mt-1 text-sm text-gray-500">
              There was an error loading the contact intelligence. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}