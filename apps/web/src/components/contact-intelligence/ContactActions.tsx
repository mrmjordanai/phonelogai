import React, { useState } from 'react';
import { useContactIntelligence, useUpdateContact, useDeleteContact } from '@phonelogai/shared/hooks/useContactIntelligence';
import { Contact, PrivacyLevel } from '@phonelogai/types';

interface ContactActionsProps {
  contactId: string;
  onUpdate: () => void;
  onDelete: () => void;
  className?: string;
}

interface EditContactModalProps {
  contact: Contact;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedContact: Partial<Contact>) => void;
  isLoading?: boolean;
}

interface PrivacySettingsModalProps {
  contactId: string;
  currentPrivacyLevel: PrivacyLevel;
  isOpen: boolean;
  onClose: () => void;
  onSave: (privacyLevel: PrivacyLevel) => void;
  isLoading?: boolean;
}

interface DeleteConfirmationModalProps {
  contactName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ContactActions({ 
  contactId, 
  onUpdate, 
  onDelete, 
  className = '' 
}: ContactActionsProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  
  const { data: intelligence } = useContactIntelligence(contactId);
  const updateContactMutation = useUpdateContact();
  const deleteContactMutation = useDeleteContact();

  const handleEdit = () => {
    setShowEditModal(true);
    setShowActionsMenu(false);
  };

  const handlePrivacySettings = () => {
    setShowPrivacyModal(true);
    setShowActionsMenu(false);
  };

  const handleExport = async () => {
    try {
      if (!intelligence) return;
      
      const exportData = {
        contact: intelligence.contact,
        metrics: intelligence.metrics,
        communication_patterns: intelligence.communication_patterns,
        recent_events: intelligence.recent_events.slice(0, 100), // Limit to recent 100 events
        exported_at: new Date().toISOString(),
        export_type: 'contact_intelligence'
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contact-${intelligence.contact.name || intelligence.contact.number}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export contact data:', error);
    }
    setShowActionsMenu(false);
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
    setShowActionsMenu(false);
  };

  const handleSaveEdit = async (updatedContact: Partial<Contact>) => {
    try {
      await updateContactMutation.mutateAsync({
        contactId,
        updates: updatedContact
      });
      setShowEditModal(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update contact:', error);
    }
  };

  const handleSavePrivacy = async (privacyLevel: PrivacyLevel) => {
    try {
      await updateContactMutation.mutateAsync({
        contactId,
        updates: { privacy_level: privacyLevel }
      });
      setShowPrivacyModal(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteContactMutation.mutateAsync(contactId);
      setShowDeleteModal(false);
      onDelete();
    } catch (error) {
      console.error('Failed to delete contact:', error);
    }
  };

  if (!intelligence) return null;

  const { contact, privacy_level } = intelligence;

  return (
    <>
      <div className={`relative ${className}`}>
        {/* Actions Button */}
        <button
          onClick={() => setShowActionsMenu(!showActionsMenu)}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
          Actions
        </button>

        {/* Dropdown Menu */}
        {showActionsMenu && (
          <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
            <div className="py-1" role="menu">
              <button
                onClick={handleEdit}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                role="menuitem"
              >
                <svg className="h-4 w-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Contact
              </button>
              
              <button
                onClick={handlePrivacySettings}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                role="menuitem"
              >
                <svg className="h-4 w-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Privacy Settings
              </button>
              
              <button
                onClick={handleExport}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                role="menuitem"
              >
                <svg className="h-4 w-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Data
              </button>
              
              <div className="border-t border-gray-100"></div>
              
              <button
                onClick={handleDelete}
                className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50 hover:text-red-900"
                role="menuitem"
              >
                <svg className="h-4 w-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Contact
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Click outside to close menu */}
      {showActionsMenu && (
        <div 
          className="fixed inset-0 z-5" 
          onClick={() => setShowActionsMenu(false)}
        />
      )}

      {/* Edit Modal */}
      <EditContactModal
        contact={contact}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveEdit}
        isLoading={updateContactMutation.isPending}
      />

      {/* Privacy Settings Modal */}
      <PrivacySettingsModal
        contactId={contactId}
        currentPrivacyLevel={privacy_level}
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        onSave={handleSavePrivacy}
        isLoading={updateContactMutation.isPending}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        contactName={contact.name || contact.number}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        isLoading={deleteContactMutation.isPending}
      />
    </>
  );
}

function EditContactModal({ 
  contact, 
  isOpen, 
  onClose, 
  onSave, 
  isLoading = false 
}: EditContactModalProps) {
  const [formData, setFormData] = useState({
    name: contact.name || '',
    company: contact.company || '',
    email: contact.email || '',
    tags: contact.tags.join(', ')
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Partial<Contact> = {
      name: formData.name.trim() || null,
      company: formData.company.trim() || null,
      email: formData.email.trim() || null,
      tags: formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
    };
    onSave(updates);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Edit Contact</h3>
          </div>
          
          <div className="px-6 py-4 space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter contact name"
              />
            </div>

            <div>
              <label htmlFor="company" className="block text-sm font-medium text-gray-700">
                Company
              </label>
              <input
                type="text"
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter company name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter email address"
              />
            </div>

            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-gray-700">
                Tags
              </label>
              <input
                type="text"
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter tags separated by commas"
              />
              <p className="mt-1 text-xs text-gray-500">Separate multiple tags with commas</p>
            </div>

            <div className="bg-gray-50 rounded-md p-3">
              <p className="text-sm text-gray-600">
                <strong>Phone Number:</strong> {contact.number}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Phone numbers cannot be edited for data integrity
              </p>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PrivacySettingsModal({
  contactId,
  currentPrivacyLevel,
  isOpen,
  onClose,
  onSave,
  isLoading = false
}: PrivacySettingsModalProps) {
  const [selectedPrivacyLevel, setSelectedPrivacyLevel] = useState<PrivacyLevel>(currentPrivacyLevel);

  const privacyOptions: Array<{ value: PrivacyLevel; label: string; description: string }> = [
    {
      value: 'public',
      label: 'Public',
      description: 'Visible to all team members and can be shared externally'
    },
    {
      value: 'team',
      label: 'Team Only',
      description: 'Visible to team members within your organization'
    },
    {
      value: 'private',
      label: 'Private',
      description: 'Only visible to you and administrators'
    }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(selectedPrivacyLevel);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Privacy Settings</h3>
            <p className="text-sm text-gray-500 mt-1">
              Control who can see this contact's information
            </p>
          </div>
          
          <div className="px-6 py-4 space-y-4">
            {privacyOptions.map((option) => (
              <label key={option.value} className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="privacyLevel"
                  value={option.value}
                  checked={selectedPrivacyLevel === option.value}
                  onChange={(e) => setSelectedPrivacyLevel(e.target.value as PrivacyLevel)}
                  className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-500">{option.description}</div>
                </div>
              </label>
            ))}

            {selectedPrivacyLevel === 'private' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <div className="flex">
                  <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800">
                      Private contacts will be anonymized in shared reports and analytics
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || selectedPrivacyLevel === currentPrivacyLevel}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? 'Updating...' : 'Update Privacy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({
  contactName,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false
}: DeleteConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const expectedText = 'DELETE';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText === expectedText) {
      onConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">Delete Contact</h3>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 space-y-4">
            <p className="text-sm text-gray-500">
              This will permanently delete <strong>{contactName}</strong> and all associated data. 
              This action cannot be undone.
            </p>

            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <h4 className="text-sm font-medium text-red-800 mb-2">What will be deleted:</h4>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• Contact information and profile</li>
                <li>• All communication history and events</li>
                <li>• Analytics and pattern data</li>
                <li>• Privacy settings and permissions</li>
              </ul>
            </div>

            <div>
              <label htmlFor="confirmText" className="block text-sm font-medium text-gray-700">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                id="confirmText"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>
          </div>
          
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || confirmText !== expectedText}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              {isLoading ? 'Deleting...' : 'Delete Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}