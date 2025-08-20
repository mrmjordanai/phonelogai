import * as React from 'react';
import { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Share,
  Linking,
  Alert,
} from 'react-native';
import { UIEvent, EventAction } from '../types';

interface EventDetailModalProps {
  visible: boolean;
  event: UIEvent | null;
  onClose: () => void;
  onAction?: (_action: EventAction, _event: UIEvent) => void;
}

interface ActionButtonProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'destructive';
  disabled?: boolean;
}

function ActionButton({ 
  icon, 
  title, 
  subtitle, 
  onPress, 
  variant = 'default',
  disabled = false 
}: ActionButtonProps) {
  const buttonStyle = [
    styles.actionButton,
    variant === 'primary' && styles.actionButtonPrimary,
    variant === 'destructive' && styles.actionButtonDestructive,
    disabled && styles.actionButtonDisabled
  ];

  const titleStyle = [
    styles.actionButtonTitle,
    variant === 'primary' && styles.actionButtonTitlePrimary,
    variant === 'destructive' && styles.actionButtonTitleDestructive,
    disabled && styles.actionButtonTitleDisabled
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
    >
      <Text style={styles.actionButtonIcon}>{icon}</Text>
      <View style={styles.actionButtonContent}>
        <Text style={titleStyle}>{title}</Text>
        {subtitle && (
          <Text style={styles.actionButtonSubtitle}>{subtitle}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}` 
      : `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
}

function formatFullDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getEventStatusInfo(event: UIEvent) {
  if (event.type === 'sms') {
    return {
      status: event.direction === 'inbound' ? 'Received' : 'Sent',
      color: '#3B82F6',
      icon: event.direction === 'inbound' ? '📥' : '📤'
    };
  }

  const statusMap = {
    answered: { status: 'Answered', color: '#10B981', icon: '✅' },
    missed: { status: 'Missed', color: '#EF4444', icon: '❌' },
    busy: { status: 'Busy', color: '#F59E0B', icon: '🔴' },
    declined: { status: 'Declined', color: '#6B7280', icon: '🚫' }
  };

  const info = statusMap[event.status as keyof typeof statusMap] || statusMap.answered;
  return {
    ...info,
    status: `${event.direction === 'inbound' ? 'Incoming' : 'Outgoing'} ${info.status}`
  };
}

export function EventDetailModal({
  visible,
  event,
  onClose,
  onAction
}: EventDetailModalProps) {
  const eventInfo = useMemo(() => {
    if (!event) return null;

    const statusInfo = getEventStatusInfo(event);
    const displayName = event.display_name || event.display_number || event.number;
    const isAnonymized = event.is_anonymized || false;

    return {
      ...statusInfo,
      displayName: isAnonymized ? 'Private Contact' : displayName,
      displayNumber: isAnonymized ? '••••••••' : (event.display_number || event.number),
      isAnonymized,
      formattedDateTime: formatFullDateTime(event.ts),
      duration: event.type === 'call' && event.duration ? formatDuration(event.duration) : null,
      hasContact: !!event.contact_id,
    };
  }, [event]);

  if (!event || !eventInfo) return null;

  const handleCallBack = async () => {
    if (eventInfo.isAnonymized) {
      Alert.alert('Cannot Call', 'This contact is private and cannot be called.');
      return;
    }

    try {
      const phoneUrl = `tel:${event.number}`;
      const canOpen = await Linking.canOpenURL(phoneUrl);
      if (canOpen) {
        await Linking.openURL(phoneUrl);
        onAction?.('call_back', event);
      } else {
        Alert.alert('Error', 'Cannot open phone app');
      }
    } catch {
      Alert.alert('Error', 'Failed to initiate call');
    }
  };

  const handleSendSMS = async () => {
    if (eventInfo.isAnonymized) {
      Alert.alert('Cannot Send SMS', 'This contact is private and cannot be messaged.');
      return;
    }

    try {
      const smsUrl = `sms:${event.number}`;
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (canOpen) {
        await Linking.openURL(smsUrl);
        onAction?.('send_sms', event);
      } else {
        Alert.alert('Error', 'Cannot open messages app');
      }
    } catch {
      Alert.alert('Error', 'Failed to open messages app');
    }
  };

  const handleShare = async () => {
    try {
      const shareContent = eventInfo.isAnonymized 
        ? `Private ${event.type} on ${eventInfo.formattedDateTime}`
        : `${event.type.toUpperCase()} ${eventInfo.status}\nContact: ${eventInfo.displayName}\nNumber: ${eventInfo.displayNumber}\nTime: ${eventInfo.formattedDateTime}${eventInfo.duration ? `\nDuration: ${eventInfo.duration}` : ''}${event.content ? `\nMessage: ${event.content}` : ''}`;

      await Share.share({
        message: shareContent,
        title: `${event.type.toUpperCase()} Details`
      });
      
      onAction?.('share', event);
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleAddContact = () => {
    onAction?.('add_contact', event);
    onClose();
  };

  const handleEditContact = () => {
    onAction?.('edit_contact', event);
    onClose();
  };

  const handleBlockContact = () => {
    Alert.alert(
      'Block Contact',
      `Block all communications from ${eventInfo.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Block', 
          style: 'destructive',
          onPress: () => {
            onAction?.('block_contact', event);
            onClose();
          }
        }
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            onAction?.('delete', event);
            onClose();
          }
        }
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
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
          <Text style={styles.headerTitle}>Event Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Event Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryIcon}>{eventInfo.icon}</Text>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryTitle}>{eventInfo.displayName}</Text>
                {!eventInfo.isAnonymized && eventInfo.displayNumber !== eventInfo.displayName && (
                  <Text style={styles.summaryNumber}>{eventInfo.displayNumber}</Text>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: eventInfo.color + '20' }]}>
                <Text style={[styles.statusText, { color: eventInfo.color }]}>
                  {eventInfo.status}
                </Text>
              </View>
            </View>

            <View style={styles.summaryDetails}>
              <Text style={styles.summaryDateTime}>{eventInfo.formattedDateTime}</Text>
              {eventInfo.duration && (
                <Text style={styles.summaryDuration}>Duration: {eventInfo.duration}</Text>
              )}
            </View>

            {/* Privacy Indicator */}
            {eventInfo.isAnonymized && (
              <View style={styles.privacyBadge}>
                <Text style={styles.privacyText}>🔒 Private Contact</Text>
              </View>
            )}
          </View>

          {/* SMS Content */}
          {event.type === 'sms' && event.content && !eventInfo.isAnonymized && (
            <View style={styles.messageCard}>
              <Text style={styles.messageLabel}>Message</Text>
              <Text style={styles.messageContent}>{event.content}</Text>
            </View>
          )}

          {/* Technical Details */}
          <View style={styles.technicalCard}>
            <Text style={styles.technicalTitle}>Technical Details</Text>
            <View style={styles.technicalRow}>
              <Text style={styles.technicalLabel}>Type:</Text>
              <Text style={styles.technicalValue}>{event.type.toUpperCase()}</Text>
            </View>
            <View style={styles.technicalRow}>
              <Text style={styles.technicalLabel}>Direction:</Text>
              <Text style={styles.technicalValue}>
                {event.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
              </Text>
            </View>
            {event.source && (
              <View style={styles.technicalRow}>
                <Text style={styles.technicalLabel}>Source:</Text>
                <Text style={styles.technicalValue}>{event.source}</Text>
              </View>
            )}
            <View style={styles.technicalRow}>
              <Text style={styles.technicalLabel}>Event ID:</Text>
              <Text style={styles.technicalValue}>{event.id.slice(0, 8)}...</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Actions</Text>
            
            {/* Communication Actions */}
            {!eventInfo.isAnonymized && (
              <>
                <ActionButton
                  icon="📞"
                  title="Call Back"
                  subtitle={`Call ${eventInfo.displayNumber}`}
                  onPress={handleCallBack}
                  variant="primary"
                />
                
                <ActionButton
                  icon="💬"
                  title="Send Message"
                  subtitle={`Send SMS to ${eventInfo.displayNumber}`}
                  onPress={handleSendSMS}
                />
              </>
            )}

            {/* Contact Actions */}
            {eventInfo.hasContact ? (
              <ActionButton
                icon="✏️"
                title="Edit Contact"
                subtitle="Modify contact information"
                onPress={handleEditContact}
              />
            ) : (
              !eventInfo.isAnonymized && (
                <ActionButton
                  icon="👤"
                  title="Add to Contacts"
                  subtitle={`Save ${eventInfo.displayNumber} as contact`}
                  onPress={handleAddContact}
                />
              )
            )}

            {/* Share Action */}
            <ActionButton
              icon="📤"
              title="Share"
              subtitle="Share event details"
              onPress={handleShare}
            />

            {/* Block Contact */}
            {!eventInfo.isAnonymized && (
              <ActionButton
                icon="🚫"
                title="Block Contact"
                subtitle="Block all communications from this contact"
                onPress={handleBlockContact}
                variant="destructive"
              />
            )}

            {/* Delete Event */}
            <ActionButton
              icon="🗑️"
              title="Delete Event"
              subtitle="Remove this event from history"
              onPress={handleDelete}
              variant="destructive"
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6B7280',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 34,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  
  // Summary Card
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  summaryNumber: {
    fontSize: 16,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryDetails: {
    marginBottom: 8,
  },
  summaryDateTime: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 4,
  },
  summaryDuration: {
    fontSize: 14,
    color: '#6B7280',
  },
  privacyBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  privacyText: {
    fontSize: 12,
    color: '#8B5CF6',
    fontWeight: '500',
  },

  // Message Card
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  messageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  messageContent: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },

  // Technical Card
  technicalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  technicalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  technicalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  technicalLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  technicalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },

  // Actions Card
  actionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  actionButtonPrimary: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    marginBottom: 4,
    borderBottomWidth: 0,
  },
  actionButtonDestructive: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    marginBottom: 4,
    borderBottomWidth: 0,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  actionButtonContent: {
    flex: 1,
  },
  actionButtonTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  actionButtonTitlePrimary: {
    color: '#1D4ED8',
  },
  actionButtonTitleDestructive: {
    color: '#DC2626',
  },
  actionButtonTitleDisabled: {
    color: '#9CA3AF',
  },
  actionButtonSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
});

export default EventDetailModal;