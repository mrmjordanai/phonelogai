import * as React from 'react';
import { memo, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { UIEvent, EventAction } from '../types';

// Event type icons (using Unicode symbols for now - would use proper icons in production)
const EVENT_ICONS = {
  call_inbound_answered: '📞',
  call_inbound_missed: '❌',
  call_inbound_busy: '🔴',
  call_inbound_declined: '🚫',
  call_outbound_answered: '📱',
  call_outbound_missed: '❌',
  call_outbound_busy: '🔴',
  call_outbound_declined: '🚫',
  sms_inbound: '💬',
  sms_outbound: '📤',
} as const;

const EVENT_COLORS = {
  call_answered: '#10B981', // green
  call_missed: '#EF4444', // red
  call_busy: '#F59E0B', // yellow
  call_declined: '#6B7280', // gray
  sms: '#3B82F6', // blue
} as const;

interface EventListItemProps {
  event: UIEvent;
  onPress?: (event: UIEvent) => void;
  onLongPress?: (event: UIEvent, action: EventAction) => void;
  showDate?: boolean;
  compact?: boolean;
  style?: ViewStyle;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
  
  return date.toLocaleDateString([], { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

export const EventListItem = memo<EventListItemProps>(({
  event,
  onPress,
  onLongPress,
  showDate = false,
  compact = false,
  style
}) => {
  const eventIcon = useMemo(() => {
    if (event.type === 'sms') {
      return event.direction === 'inbound' ? EVENT_ICONS.sms_inbound : EVENT_ICONS.sms_outbound;
    } else {
      const status = event.status || 'answered';
      const key = `call_${event.direction}_${status}` as keyof typeof EVENT_ICONS;
      return EVENT_ICONS[key] || EVENT_ICONS.call_inbound_answered;
    }
  }, [event.type, event.direction, event.status]);

  const eventColor = useMemo(() => {
    if (event.type === 'sms') return EVENT_COLORS.sms;
    
    switch (event.status) {
      case 'missed': return EVENT_COLORS.call_missed;
      case 'busy': return EVENT_COLORS.call_busy;
      case 'declined': return EVENT_COLORS.call_declined;
      case 'answered':
      default:
        return EVENT_COLORS.call_answered;
    }
  }, [event.type, event.status]);

  const displayInfo = useMemo(() => {
    const displayName = event.display_name || event.display_number || event.number;
    const isAnonymized = event.is_anonymized || false;
    
    return {
      primaryText: isAnonymized ? 'Private Contact' : displayName,
      secondaryText: isAnonymized ? '••••••••' : (
        event.display_name && event.display_number ? event.display_number : undefined
      ),
      showPrivacyIndicator: isAnonymized
    };
  }, [event]);

  const timeInfo = useMemo(() => {
    const time = formatTime(event.ts);
    const date = showDate ? formatDate(event.ts) : undefined;
    const duration = event.type === 'call' && event.duration 
      ? formatDuration(event.duration) 
      : undefined;
    
    return { time, date, duration };
  }, [event.ts, event.type, event.duration, showDate]);

  const handlePress = () => {
    onPress?.(event);
  };

  const handleLongPress = () => {
    // Default action based on event type and context
    const defaultAction: EventAction = event.contact_id ? 'edit_contact' : 'add_contact';
    onLongPress?.(event, defaultAction);
  };

  const containerStyle: ViewStyle = [
    styles.container,
    compact && styles.containerCompact,
    style
  ] as ViewStyle;

  const iconContainerStyle: ViewStyle = [
    styles.iconContainer,
    { backgroundColor: eventColor + '20' } // 20% opacity
  ] as ViewStyle;

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${event.type} ${event.direction} ${displayInfo.primaryText} at ${timeInfo.time}`}
      accessibilityHint="Tap to view details, long press for options"
    >
      {/* Event Icon */}
      <View style={iconContainerStyle}>
        <Text style={[styles.icon, { color: eventColor }]}>
          {eventIcon}
        </Text>
      </View>

      {/* Event Details */}
      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <View style={styles.contactInfo}>
            <Text 
              style={[styles.primaryText, compact && styles.primaryTextCompact]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayInfo.primaryText}
            </Text>
            
            {displayInfo.secondaryText && !compact && (
              <Text 
                style={styles.secondaryText}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {displayInfo.secondaryText}
              </Text>
            )}
          </View>

          <View style={styles.timeInfo}>
            {timeInfo.date && (
              <Text style={styles.dateText}>{timeInfo.date}</Text>
            )}
            <Text style={styles.timeText}>{timeInfo.time}</Text>
            {timeInfo.duration && (
              <Text style={styles.durationText}>{timeInfo.duration}</Text>
            )}
          </View>
        </View>

        {/* Content Preview (for SMS) */}
        {event.type === 'sms' && event.content && !compact && !event.is_anonymized && (
          <Text 
            style={styles.contentPreview}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {event.content}
          </Text>
        )}

        {/* Privacy Indicator */}
        {displayInfo.showPrivacyIndicator && (
          <View style={styles.privacyIndicator}>
            <Text style={styles.privacyText}>🔒 Private</Text>
          </View>
        )}
      </View>

      {/* Status Indicators */}
      <View style={styles.statusContainer}>
        {event.direction === 'outbound' && (
          <View style={styles.directionIndicator}>
            <Text style={styles.directionText}>↗</Text>
          </View>
        )}
        
        {event.type === 'call' && event.status === 'missed' && (
          <View style={styles.missedIndicator}>
            <Text style={styles.missedText}>!</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

EventListItem.displayName = 'EventListItem';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    minHeight: 72,
  },
  containerCompact: {
    paddingVertical: 8,
    minHeight: 56,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
    minHeight: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  contactInfo: {
    flex: 1,
    marginRight: 12,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  } as TextStyle,
  primaryTextCompact: {
    fontSize: 15,
    marginBottom: 0,
  },
  secondaryText: {
    fontSize: 14,
    color: '#6B7280',
  } as TextStyle,
  timeInfo: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  } as TextStyle,
  timeText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  } as TextStyle,
  durationText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  } as TextStyle,
  contentPreview: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 4,
    lineHeight: 18,
  } as TextStyle,
  privacyIndicator: {
    marginTop: 4,
  },
  privacyText: {
    fontSize: 12,
    color: '#8B5CF6',
    fontWeight: '500',
  } as TextStyle,
  statusContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginLeft: 8,
  },
  directionIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  directionText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: 'bold',
  } as TextStyle,
  missedIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missedText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
  } as TextStyle,
});

export default EventListItem;