import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { ContactListItemProps } from '../types';

export function ContactListItem({
  contact,
  onPress,
  onCall,
  onMessage,
  onEdit,
  showPrivacyIndicator = false,
}: ContactListItemProps) {
  
  // Handle main contact press
  const handlePress = useCallback(() => {
    onPress(contact.contact_id);
  }, [onPress, contact.contact_id]);

  // Handle call action
  const handleCall = useCallback(() => {
    if (onCall && contact.number) {
      onCall(contact.number);
    }
  }, [onCall, contact.number]);

  // Handle message action
  const handleMessage = useCallback(() => {
    if (onMessage && contact.number) {
      onMessage(contact.number);
    }
  }, [onMessage, contact.number]);

  // Handle edit action
  const handleEdit = useCallback(() => {
    if (onEdit) {
      onEdit(contact.contact_id);
    }
  }, [onEdit, contact.contact_id]);
  
  // Silence unused variable warning - handleEdit is available for future use
  void handleEdit;

  // Format contact name
  const displayName = useMemo(() => {
    if (contact.name) return contact.name;
    return contact.number || 'Unknown';
  }, [contact.name, contact.number]);

  // Format contact subtitle
  const subtitle = useMemo(() => {
    const parts = [];
    
    if (contact.company) {
      parts.push(contact.company);
    }
    
    if (contact.number && contact.name) {
      parts.push(contact.number);
    }
    
    return parts.join(' • ');
  }, [contact.company, contact.number, contact.name]);

  // Format interaction summary
  const interactionSummary = useMemo(() => {
    const totalInteractions = contact.total_interactions || 0;
    if (totalInteractions === 0) {
      return 'No interactions';
    }
    
    const parts = [];
    if (totalInteractions > 0) {
      parts.push(`${totalInteractions} interaction${totalInteractions !== 1 ? 's' : ''}`);
    }
    
    if (contact.last_contact) {
      const lastContact = new Date(contact.last_contact);
      const now = new Date();
      const diffMs = now.getTime() - lastContact.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        parts.push('Today');
      } else if (diffDays === 1) {
        parts.push('Yesterday');
      } else if (diffDays < 7) {
        parts.push(`${diffDays} days ago`);
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        parts.push(`${weeks} week${weeks !== 1 ? 's' : ''} ago`);
      } else {
        const months = Math.floor(diffDays / 30);
        parts.push(`${months} month${months !== 1 ? 's' : ''} ago`);
      }
    }
    
    return parts.join(' • ');
  }, [contact.total_interactions, contact.last_contact]);

  // Get privacy indicator
  const privacyIndicator = useMemo(() => {
    if (!showPrivacyIndicator) return null;
    
    const level = contact.privacy_level;
    if (level === 'private') return '🔒';
    if (level === 'public') return '🌐';
    return '👥'; // team
  }, [contact.privacy_level, showPrivacyIndicator]);

  // Get contact initials for avatar
  const initials = useMemo(() => {
    if (contact.name) {
      return contact.name
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
    }
    
    if (contact.number) {
      return contact.number.slice(-2);
    }
    
    return '??';
  }, [contact.name, contact.number]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Contact ${displayName}`}
      accessibilityHint="Tap to view contact details"
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      {/* Contact Info */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {privacyIndicator && (
            <Text style={styles.privacyIndicator}>{privacyIndicator}</Text>
          )}
        </View>
        
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        
        <Text style={styles.interaction} numberOfLines={1}>
          {interactionSummary}
        </Text>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {contact.tags.slice(0, 3).map((tag: string) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {contact.tags.length > 3 && (
              <Text style={styles.moreTags}>+{contact.tags.length - 3}</Text>
            )}
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {onCall && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleCall}
            accessibilityRole="button"
            accessibilityLabel="Call contact"
          >
            <Text style={styles.actionText}>📞</Text>
          </TouchableOpacity>
        )}
        {onMessage && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleMessage}
            accessibilityRole="button"
            accessibilityLabel="Message contact"
          >
            <Text style={styles.actionText}>💬</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 0,
    backgroundColor: '#ffffff',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  privacyIndicator: {
    fontSize: 12,
    marginLeft: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  interaction: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 2,
  },
  tagText: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '500',
  },
  moreTags: {
    fontSize: 10,
    color: '#9ca3af',
    alignSelf: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionText: {
    fontSize: 16,
  },
});