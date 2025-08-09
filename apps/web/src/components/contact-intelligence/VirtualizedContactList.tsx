import React, { useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { ContactSearchResult } from '@phonelogai/types';

interface VirtualizedContactListProps {
  contacts: ContactSearchResult[];
  selectedContactId?: string;
  onContactSelect: (contactId: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  className?: string;
}

interface ContactItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    contacts: ContactSearchResult[];
    selectedContactId?: string;
    onContactSelect: (contactId: string) => void;
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoading?: boolean;
  };
}

const ITEM_HEIGHT = 80;

export function VirtualizedContactList({
  contacts,
  selectedContactId,
  onContactSelect,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  className = ''
}: VirtualizedContactListProps) {
  const itemData = useMemo(() => ({
    contacts,
    selectedContactId,
    onContactSelect,
    onLoadMore,
    hasMore,
    isLoading
  }), [contacts, selectedContactId, onContactSelect, onLoadMore, hasMore, isLoading]);

  // Add loading item to the end if needed
  const totalItems = contacts.length + (hasMore ? 1 : 0);

  const getItemSize = useCallback((index: number) => {
    // Loading item is slightly smaller
    if (index === contacts.length) return 60;
    return ITEM_HEIGHT;
  }, [contacts.length]);

  return (
    <div className={`h-full ${className}`}>
      <List
        height={600} // This will be overridden by parent container
        itemCount={totalItems}
        itemSize={getItemSize}
        itemData={itemData}
        overscanCount={5} // Pre-render 5 items above/below visible area
      >
        {ContactItem}
      </List>
    </div>
  );
}

const ContactItem: React.FC<ContactItemProps> = ({ index, style, data }) => {
  const { contacts, selectedContactId, onContactSelect, onLoadMore, hasMore, isLoading } = data;

  // Loading item
  if (index === contacts.length) {
    return (
      <div style={style} className="flex items-center justify-center py-4">
        {isLoading ? (
          <div className="flex items-center space-x-2 text-gray-500">
            <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
            <span className="text-sm">Loading more contacts...</span>
          </div>
        ) : hasMore ? (
          <button
            onClick={onLoadMore}
            className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Load more contacts
          </button>
        ) : null}
      </div>
    );
  }

  const contact = contacts[index];
  if (!contact) return null;

  const isSelected = selectedContactId === contact.contact_id;
  const displayName = contact.name || contact.number;
  const lastContactTime = contact.last_contact 
    ? new Date(contact.last_contact).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Never';

  return (
    <div style={style}>
      <div
        onClick={() => onContactSelect(contact.contact_id)}
        className={`mx-2 my-1 p-3 rounded-lg border cursor-pointer transition-all duration-150 ${
          isSelected
            ? 'border-blue-500 bg-blue-50 shadow-sm'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Contact Name/Number */}
            <div className="flex items-center space-x-2">
              <h3 className={`text-sm font-medium truncate ${
                isSelected ? 'text-blue-900' : 'text-gray-900'
              }`}>
                {displayName}
              </h3>
              {contact.privacy_level === 'private' && (
                <div className="flex-shrink-0">
                  <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Company */}
            {contact.company && (
              <p className={`text-xs truncate mt-1 ${
                isSelected ? 'text-blue-700' : 'text-gray-600'
              }`}>
                {contact.company}
              </p>
            )}

            {/* Tags */}
            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {contact.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                      isSelected
                        ? 'bg-blue-200 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {tag}
                  </span>
                ))}
                {contact.tags.length > 2 && (
                  <span className={`text-xs ${
                    isSelected ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    +{contact.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Interaction Count & Score */}
          <div className="flex-shrink-0 text-right ml-4">
            <div className={`text-xs font-medium ${
              isSelected ? 'text-blue-900' : 'text-gray-900'
            }`}>
              {contact.total_interactions} interactions
            </div>
            <div className={`text-xs mt-1 ${
              isSelected ? 'text-blue-600' : 'text-gray-500'
            }`}>
              Last: {lastContactTime}
            </div>
            {contact.contact_score > 0 && (
              <div className={`text-xs mt-1 ${
                isSelected ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Score: {Math.round(contact.contact_score)}
              </div>
            )}
          </div>
        </div>

        {/* Relevance indicator for search results */}
        {contact.match_score > 0 && contact.match_score !== 0.5 && (
          <div className="mt-2 flex items-center">
            <div className={`h-1 rounded-full ${
              isSelected ? 'bg-blue-200' : 'bg-gray-200'
            } flex-1`}>
              <div
                className={`h-1 rounded-full ${
                  isSelected ? 'bg-blue-500' : 'bg-blue-400'
                }`}
                style={{ width: `${contact.match_score * 100}%` }}
              ></div>
            </div>
            <span className={`text-xs ml-2 ${
              isSelected ? 'text-blue-600' : 'text-gray-500'
            }`}>
              {Math.round(contact.match_score * 100)}% match
            </span>
          </div>
        )}
      </div>
    </div>
  );
};