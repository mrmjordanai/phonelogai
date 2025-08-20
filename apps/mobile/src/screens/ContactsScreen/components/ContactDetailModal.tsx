import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useContactIntelligence } from '../hooks/useMockContactIntelligence';
import { ContactDetailModalProps } from '../types';

export function ContactDetailModal({
  contactId,
  visible,
  onClose,
  onEdit,
  onCall,
  onMessage,
}: ContactDetailModalProps) {
  
  // Fetch contact intelligence data
  const {
    data: intelligence,
    isLoading,
    isError,
    error,
  } = useContactIntelligence(contactId);

  if (!visible || !contactId) {
    return null;
  }

  const contact = intelligence?.contact;

  const handleCall = () => {
    if (onCall && contact?.number) {
      onCall(contact.number);
    }
  };

  const handleMessage = () => {
    if (onMessage && contact?.number) {
      onMessage(contact.number);
    }
  };

  const handleEdit = () => {
    if (onEdit && contactId) {
      onEdit(contactId);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Contact Details</Text>
          {onEdit && (
            <TouchableOpacity
              onPress={handleEdit}
              style={styles.editButton}
              accessibilityRole="button"
              accessibilityLabel="Edit contact"
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        <ScrollView style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6b7280" />
              <Text style={styles.loadingText}>Loading contact details...</Text>
            </View>
          ) : isError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>Failed to load contact</Text>
              <Text style={styles.errorMessage}>
                {error?.message || 'Please try again'}
              </Text>
            </View>
          ) : contact ? (
            <View style={styles.detailsContainer}>
              {/* Contact Info */}
              <View style={styles.section}>
                <Text style={styles.contactName}>
                  {contact.name || contact.number || 'Unknown Contact'}
                </Text>
                
                {contact.name && contact.number && (
                  <Text style={styles.contactNumber}>{contact.number}</Text>
                )}
                
                {contact.company && (
                  <Text style={styles.contactCompany}>{contact.company}</Text>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                {onCall && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleCall}
                    accessibilityRole="button"
                    accessibilityLabel="Call contact"
                  >
                    <Text style={styles.actionButtonIcon}>📞</Text>
                    <Text style={styles.actionButtonText}>Call</Text>
                  </TouchableOpacity>
                )}
                {onMessage && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleMessage}
                    accessibilityRole="button"
                    accessibilityLabel="Message contact"
                  >
                    <Text style={styles.actionButtonIcon}>💬</Text>
                    <Text style={styles.actionButtonText}>Message</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Tags */}
              {contact.tags && contact.tags.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Tags</Text>
                  <View style={styles.tagsContainer}>
                    {contact.tags.map((tag: string) => (
                      <View key={tag} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Statistics */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Statistics</Text>
                <View style={styles.statsContainer}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{contact.total_calls}</Text>
                    <Text style={styles.statLabel}>Calls</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{contact.total_sms}</Text>
                    <Text style={styles.statLabel}>Messages</Text>
                  </View>
                </View>
              </View>

              {/* Timestamps */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Timeline</Text>
                <View style={styles.timelineContainer}>
                  <View style={styles.timelineItem}>
                    <Text style={styles.timelineLabel}>First seen:</Text>
                    <Text style={styles.timelineValue}>
                      {new Date(contact.first_seen).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.timelineItem}>
                    <Text style={styles.timelineLabel}>Last seen:</Text>
                    <Text style={styles.timelineValue}>
                      {new Date(contact.last_seen).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>Contact not found</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  detailsContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  contactName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 4,
  },
  contactNumber: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  contactCompany: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionButtonIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionButtonText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  timelineContainer: {
    gap: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  timelineValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
});