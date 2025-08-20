import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { EmptyStateProps } from '../types';

export function EmptyState({
  type,
  title,
  subtitle,
  actionText,
  onAction,
  icon,
}: EmptyStateProps) {
  
  // Get default icon based on type
  const getIcon = () => {
    if (icon) return icon;
    
    switch (type) {
      case 'loading':
        return null; // Will show spinner instead
      case 'search':
        return '🔍';
      case 'error':
        return '⚠️';
      case 'empty':
      default:
        return '👥';
    }
  };

  const displayIcon = getIcon();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Icon or Loading Spinner */}
        {type === 'loading' ? (
          <View style={styles.iconContainer}>
            <ActivityIndicator size="large" color="#6b7280" />
          </View>
        ) : displayIcon ? (
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{displayIcon}</Text>
          </View>
        ) : null}

        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Subtitle */}
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}

        {/* Action Button */}
        {actionText && onAction && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionText}
          >
            <Text style={styles.actionButtonText}>{actionText}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  content: {
    alignItems: 'center',
    maxWidth: 280,
  },
  iconContainer: {
    marginBottom: 24,
  },
  icon: {
    fontSize: 64,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 120,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
});