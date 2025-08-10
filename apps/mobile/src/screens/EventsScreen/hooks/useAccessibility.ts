import { useCallback, useRef, useEffect } from 'react';
import { AccessibilityInfo, findNodeHandle } from 'react-native';
import { UIEvent } from '../types';

interface UseAccessibilityProps {
  announceChanges?: boolean;
  screenReaderEnabled?: boolean;
}

interface AccessibilityAnnouncement {
  message: string;
  priority?: 'low' | 'medium' | 'high';
  delay?: number;
}

export function useAccessibility({
  announceChanges = true,
  screenReaderEnabled
}: UseAccessibilityProps = {}) {
  const isScreenReaderEnabled = useRef(screenReaderEnabled);
  const announcementQueue = useRef<AccessibilityAnnouncement[]>([]);
  const isProcessingQueue = useRef(false);

  // Check screen reader status
  useEffect(() => {
    if (screenReaderEnabled === undefined) {
      AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
        isScreenReaderEnabled.current = enabled;
      });

      const subscription = AccessibilityInfo.addEventListener(
        'screenReaderChanged',
        (enabled) => {
          isScreenReaderEnabled.current = enabled;
        }
      );

      return () => subscription?.remove();
    } else {
      isScreenReaderEnabled.current = screenReaderEnabled;
    }
  }, [screenReaderEnabled]);

  // Process announcement queue
  const processAnnouncementQueue = useCallback(async () => {
    if (isProcessingQueue.current || announcementQueue.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;

    while (announcementQueue.current.length > 0) {
      const announcement = announcementQueue.current.shift()!;
      
      try {
        await AccessibilityInfo.announceForAccessibility(announcement.message);
        
        if (announcement.delay) {
          await new Promise(resolve => setTimeout(resolve, announcement.delay));
        }
      } catch (error) {
        console.warn('Failed to announce for accessibility:', error);
      }
    }

    isProcessingQueue.current = false;
  }, []);

  // Announce message to screen reader
  const announce = useCallback((
    message: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    delay?: number
  ) => {
    if (!announceChanges || !isScreenReaderEnabled.current) {
      return;
    }

    // Add to queue based on priority
    const announcement: AccessibilityAnnouncement = { message, priority, delay };
    
    if (priority === 'high') {
      // High priority messages go to the front
      announcementQueue.current.unshift(announcement);
    } else {
      announcementQueue.current.push(announcement);
    }

    // Limit queue size
    if (announcementQueue.current.length > 10) {
      announcementQueue.current = announcementQueue.current.slice(-10);
    }

    processAnnouncementQueue();
  }, [announceChanges, processAnnouncementQueue]);

  // Focus management
  const setAccessibilityFocus = useCallback((ref: any) => {
    if (!isScreenReaderEnabled.current || !ref?.current) {
      return;
    }

    const nodeHandle = findNodeHandle(ref.current);
    if (nodeHandle) {
      AccessibilityInfo.setAccessibilityFocus(nodeHandle);
    }
  }, []);

  // Event-specific accessibility helpers
  const announceEventLoaded = useCallback((events: UIEvent[], isRefresh = false) => {
    if (!events.length) {
      announce(
        isRefresh ? 'No events found after refresh' : 'No events to display',
        'medium'
      );
      return;
    }

    const callCount = events.filter(e => e.type === 'call').length;
    const smsCount = events.filter(e => e.type === 'sms').length;
    
    let message = isRefresh ? 'Events refreshed. ' : '';
    
    if (callCount > 0 && smsCount > 0) {
      message += `Loaded ${events.length} events: ${callCount} calls and ${smsCount} messages`;
    } else if (callCount > 0) {
      message += `Loaded ${callCount} call${callCount !== 1 ? 's' : ''}`;
    } else if (smsCount > 0) {
      message += `Loaded ${smsCount} message${smsCount !== 1 ? 's' : ''}`;
    } else {
      message += `Loaded ${events.length} events`;
    }

    announce(message, 'medium');
  }, [announce]);

  const announceEventSelected = useCallback((event: UIEvent) => {
    const displayName = event.display_name || event.display_number || event.number;
    const eventType = event.type === 'call' ? 'call' : 'message';
    const direction = event.direction === 'inbound' ? 'incoming' : 'outgoing';
    const time = new Date(event.ts).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    let message = `Selected ${direction} ${eventType}`;
    
    if (!event.is_anonymized) {
      message += ` from ${displayName}`;
    }
    
    message += ` at ${time}`;

    if (event.type === 'call' && event.status === 'missed') {
      message += ', missed call';
    }

    announce(message, 'high');
  }, [announce]);

  const announceFilterChange = useCallback((
    filterType: string, 
    filterValue: string, 
    isActive: boolean
  ) => {
    const action = isActive ? 'Applied' : 'Removed';
    const message = `${action} filter: ${filterType} ${filterValue}`;
    announce(message, 'low');
  }, [announce]);

  const announceSearchResults = useCallback((query: string, resultCount: number) => {
    const message = resultCount > 0 
      ? `Found ${resultCount} result${resultCount !== 1 ? 's' : ''} for "${query}"`
      : `No results found for "${query}"`;
    
    announce(message, 'medium');
  }, [announce]);

  const announceLoadingState = useCallback((loading: boolean, error?: string) => {
    if (loading) {
      announce('Loading events...', 'low');
    } else if (error) {
      announce('Failed to load events. Pull down to refresh or check your connection.', 'high');
    }
  }, [announce]);

  const announceErrorState = useCallback((error: string, isRetryable = false) => {
    let message = `Error: ${error}`;
    if (isRetryable) {
      message += '. You can try again.';
    }
    announce(message, 'high');
  }, [announce]);

  // Generate accessible descriptions for events
  const getEventAccessibilityLabel = useCallback((event: UIEvent): string => {
    const displayName = event.is_anonymized 
      ? 'Private contact' 
      : (event.display_name || event.display_number || event.number);
    
    const eventType = event.type === 'call' ? 'call' : 'message';
    const direction = event.direction === 'inbound' ? 'incoming' : 'outgoing';
    
    const time = new Date(event.ts).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    let label = `${direction} ${eventType} ${displayName} at ${time}`;

    if (event.type === 'call') {
      if (event.status === 'missed') {
        label += ', missed';
      } else if (event.status === 'answered' && event.duration) {
        const duration = event.duration < 60 
          ? `${event.duration} seconds`
          : `${Math.floor(event.duration / 60)} minutes`;
        label += `, duration ${duration}`;
      }
    }

    return label;
  }, []);

  const getEventAccessibilityHint = useCallback((event: UIEvent): string => {
    const actions = [];
    
    if (!event.is_anonymized) {
      if (event.type === 'call') {
        actions.push('call back');
      }
      actions.push('send message');
      
      if (!event.contact_id) {
        actions.push('add to contacts');
      }
    }
    
    actions.push('view details');

    return `Double tap to view details. Available actions: ${actions.join(', ')}.`;
  }, []);

  return {
    isScreenReaderEnabled: isScreenReaderEnabled.current,
    
    // Core functions
    announce,
    setAccessibilityFocus,
    
    // Event-specific functions
    announceEventLoaded,
    announceEventSelected,
    announceFilterChange,
    announceSearchResults,
    announceLoadingState,
    announceErrorState,
    
    // Helper functions
    getEventAccessibilityLabel,
    getEventAccessibilityHint,
  };
}