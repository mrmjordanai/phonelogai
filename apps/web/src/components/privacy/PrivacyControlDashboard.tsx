/**
 * Privacy Control Dashboard
 * Main interface for managing privacy rules and settings
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthProvider';
import type { 
  PrivacyRule, 
  AccessDecision, 
  BulkPrivacyUpdate,
  PrivacyScope,
  AnonymizationLevel 
} from '@phonelogai/database/security';

interface PrivacyStats {
  totalRules: number;
  privateContacts: number;
  anonymizedContacts: number;
  teamVisibleContacts: number;
  publicContacts: number;
  recentChanges: number;
}

interface Contact {
  id: string;
  number: string;
  name?: string;
  company?: string;
  totalCalls: number;
  totalSms: number;
  lastSeen: string;
  privacyLevel?: string;
}

const PrivacyControlDashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [privacyRules, setPrivacyRules] = useState<PrivacyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<{
    visibility?: 'private' | 'team' | 'public';
    anonymizeNumber?: boolean;
    anonymizeContent?: boolean;
  }>({});
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'private' | 'team' | 'public'>('all');

  useEffect(() => {
    if (user) {
      loadPrivacyData();
    }
  }, [user]);

  const loadPrivacyData = async () => {
    try {
      setLoading(true);
      
      // Load privacy statistics
      const statsResponse = await fetch('/api/privacy/stats', {
        headers: { 'Authorization': `Bearer ${user?.access_token}` }
      });
      const statsData = await statsResponse.json();
      setStats(statsData);

      // Load contacts with privacy levels
      const contactsResponse = await fetch('/api/contacts?include_privacy=true', {
        headers: { 'Authorization': `Bearer ${user?.access_token}` }
      });
      const contactsData = await contactsResponse.json();
      setContacts(contactsData);

      // Load privacy rules
      const rulesResponse = await fetch('/api/privacy/rules', {
        headers: { 'Authorization': `Bearer ${user?.access_token}` }
      });
      const rulesData = await rulesResponse.json();
      setPrivacyRules(rulesData);
    } catch (error) {
      console.error('Failed to load privacy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedContacts.length === 0) return;

    try {
      const updates: BulkPrivacyUpdate[] = selectedContacts.map(contactId => ({
        contactId,
        visibility: bulkAction.visibility,
        anonymizeNumber: bulkAction.anonymizeNumber,
        anonymizeContent: bulkAction.anonymizeContent
      }));

      const response = await fetch('/api/privacy/bulk-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.access_token}`
        },
        body: JSON.stringify({ updates })
      });

      const result = await response.json();
      
      if (response.ok) {
        // Show success message
        alert(`Successfully updated ${result.successCount} privacy rules`);
        
        // Reset selections and reload data
        setSelectedContacts([]);
        setShowBulkPanel(false);
        setBulkAction({});
        loadPrivacyData();
      } else {
        throw new Error(result.error || 'Bulk update failed');
      }
    } catch (error) {
      console.error('Bulk update failed:', error);
      alert('Failed to update privacy rules. Please try again.');
    }
  };

  const handleContactPrivacyChange = async (
    contactId: string, 
    newSettings: { visibility?: string; anonymizeNumber?: boolean; anonymizeContent?: boolean }
  ) => {
    try {
      const response = await fetch(`/api/privacy/contacts/${contactId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.access_token}`
        },
        body: JSON.stringify(newSettings)
      });

      if (response.ok) {
        loadPrivacyData();
      } else {
        throw new Error('Failed to update privacy settings');
      }
    } catch (error) {
      console.error('Privacy update failed:', error);
    }
  };

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contact.number.includes(searchTerm) ||
                         contact.company?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterLevel === 'all' || contact.privacyLevel === filterLevel;
    
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading privacy settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Privacy Control Center</h1>
        <p className="text-gray-600 mt-1">
          Manage contact privacy settings and data visibility rules
        </p>
      </div>

      {/* Privacy Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-gray-900">{stats.totalRules}</div>
            <div className="text-sm text-gray-600">Total Rules</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-red-600">{stats.privateContacts}</div>
            <div className="text-sm text-gray-600">Private</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-blue-600">{stats.teamVisibleContacts}</div>
            <div className="text-sm text-gray-600">Team Visible</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-green-600">{stats.publicContacts}</div>
            <div className="text-sm text-gray-600">Public</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-yellow-600">{stats.anonymizedContacts}</div>
            <div className="text-sm text-gray-600">Anonymized</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-purple-600">{stats.recentChanges}</div>
            <div className="text-sm text-gray-600">Recent Changes</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-lg shadow border mb-6">
        <div className="p-4 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              
              {/* Filter */}
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Levels</option>
                <option value="private">Private Only</option>
                <option value="team">Team Visible</option>
                <option value="public">Public Only</option>
              </select>
            </div>

            {/* Bulk Actions */}
            <div className="flex gap-2">
              {selectedContacts.length > 0 && (
                <button
                  onClick={() => setShowBulkPanel(!showBulkPanel)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Bulk Actions ({selectedContacts.length})
                </button>
              )}
              <button
                onClick={() => {
                  if (selectedContacts.length === contacts.length) {
                    setSelectedContacts([]);
                  } else {
                    setSelectedContacts(contacts.map(c => c.id));
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {selectedContacts.length === contacts.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Actions Panel */}
        {showBulkPanel && (
          <div className="p-4 bg-gray-50 border-b">
            <h3 className="font-medium mb-3">Bulk Privacy Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Visibility Level
                </label>
                <select
                  value={bulkAction.visibility || ''}
                  onChange={(e) => setBulkAction(prev => ({ ...prev, visibility: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Change</option>
                  <option value="private">Private</option>
                  <option value="team">Team Visible</option>
                  <option value="public">Public</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anonymize Numbers
                </label>
                <select
                  value={bulkAction.anonymizeNumber === undefined ? '' : String(bulkAction.anonymizeNumber)}
                  onChange={(e) => setBulkAction(prev => ({ 
                    ...prev, 
                    anonymizeNumber: e.target.value === '' ? undefined : e.target.value === 'true'
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Change</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anonymize Content
                </label>
                <select
                  value={bulkAction.anonymizeContent === undefined ? '' : String(bulkAction.anonymizeContent)}
                  onChange={(e) => setBulkAction(prev => ({ 
                    ...prev, 
                    anonymizeContent: e.target.value === '' ? undefined : e.target.value === 'true'
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Change</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowBulkPanel(false);
                  setBulkAction({});
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Apply Changes
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedContacts.length === filteredContacts.length && filteredContacts.length > 0}
                    onChange={() => {
                      if (selectedContacts.length === filteredContacts.length) {
                        setSelectedContacts([]);
                      } else {
                        setSelectedContacts(filteredContacts.map(c => c.id));
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Activity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Privacy Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Anonymization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredContacts.map(contact => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedContacts(prev => [...prev, contact.id]);
                        } else {
                          setSelectedContacts(prev => prev.filter(id => id !== contact.id));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {contact.name || 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-500">{contact.number}</div>
                      {contact.company && (
                        <div className="text-xs text-gray-400">{contact.company}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {contact.totalCalls} calls, {contact.totalSms} SMS
                    </div>
                    <div className="text-xs text-gray-500">
                      Last: {new Date(contact.lastSeen).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PrivacyLevelBadge level={contact.privacyLevel || 'team'} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      <AnonymizationBadge type="number" enabled={false} />
                      <AnonymizationBadge type="content" enabled={false} />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => {/* Open privacy settings modal */}}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredContacts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No contacts found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
};

// Helper Components
const PrivacyLevelBadge: React.FC<{ level: string }> = ({ level }) => {
  const colors = {
    private: 'bg-red-100 text-red-800',
    team: 'bg-blue-100 text-blue-800',
    public: 'bg-green-100 text-green-800'
  };
  
  const color = colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
};

const AnonymizationBadge: React.FC<{ type: 'number' | 'content'; enabled: boolean }> = ({ type, enabled }) => {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
      enabled ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-500'
    }`}>
      {type === 'number' ? '#' : 'C'}
    </span>
  );
};

export default PrivacyControlDashboard;
